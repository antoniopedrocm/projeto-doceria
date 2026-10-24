/* global globalThis */
const {createHash,createHmac,randomInt,timingSafeEqual}=require('node:crypto');
const {sendCloudTemplate,buildTemplatePayload}=require('./whatsapp-client');
const {DEV_PROJECT_ID,getRuntimeProjectId,parseConfiguration,accessTokenVersion}=require('./whatsapp-config');
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const safeId=value=>typeof value==='string' && /^[a-zA-Z0-9-]{1,100}$/.test(value);
const unavailable=()=>{throw Object.assign(new Error('Não foi possível enviar o código agora. Tente novamente em alguns instantes.'),{code:'OTP_UNAVAILABLE',httpStatus:503});};

function createAddressVerificationProvider({db,admin,fetchImpl=globalThis.fetch,getProjectId=getRuntimeProjectId,
  readSecret=async name=>{const {SecretManagerServiceClient}=require('@google-cloud/secret-manager');const [v]=await new SecretManagerServiceClient().accessSecretVersion({name},{timeout:10000,retry:null});return v.payload.data.toString('utf8');}}) {
  const post=async(url,body,headers={})=>{
    const r=await fetchImpl(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    const data=await r.json();return {ok:r.ok,data};
  };
  async function load(storeId,phone) {
    if(getProjectId()!==DEV_PROJECT_ID) unavailable();
    const raw=(await db.doc(`integrations/addressVerification/stores/${storeId}`).get()).data() || {};
    const channels={};
    if(raw.enabled===true && Array.isArray(raw.allowedRecipients) && raw.allowedRecipients.includes(phone)) {
      const sms=raw.sms;
      // A verification-only DEV project. Never authenticate against the app or PROD.
      if(sms?.enabled===true && sms.provider==='firebase' && sms.verificationOnly===true &&
        /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(sms.projectId || '') && ![DEV_PROJECT_ID,'ana-guimaraes'].includes(sms.projectId) &&
        typeof sms.apiKey==='string' && /^[\w-]{20,150}$/.test(sms.apiKey) &&
        sms.authDomain===`${sms.projectId}.firebaseapp.com`) {
        channels.sms={...sms,fingerprint:fingerprint(sms)};
      }
      const wa=raw.whatsapp;
      if(wa?.enabled===true && safeId(wa.integrationStoreId) && wa.templateCategory==='AUTHENTICATION' && wa.templateApproved===true &&
        /^[a-z0-9_]{1,512}$/.test(wa.templateName || '') && /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(wa.templateLanguage || '')) {
        const integration=(await db.doc(`integrations/whatsapp/stores/${wa.integrationStoreId}`).get()).data() || {};
        try {
          const config=parseConfiguration(integration);
          if(config.mode==='cloud' && config.allowedRecipients.includes(phone.replace(/^\+/,''))) channels.whatsapp={...wa,config:{...config,templateName:wa.templateName,templateLanguage:wa.templateLanguage},fingerprint:fingerprint([wa,config])};
        } catch { /* Invalid/disabled integration never advertises delivery. */ }
      }
    }
    const integer=(key,fallback,min,max)=>Number.isInteger(raw[key]) && raw[key]>=min && raw[key]<=max?raw[key]:fallback;
    return {channels,policy:{otpMs:integer('otpSeconds',300,60,300)*1000,sessionMs:integer('sessionSeconds',600,60,900)*1000,
      resendMs:integer('resendSeconds',60,60,300)*1000,maxAttempts:integer('maxAttempts',5,1,5),
      phoneHourly:integer('phoneHourly',5,1,5),ipHourly:integer('ipHourly',10,1,20),globalDaily:integer('globalDaily',50,1,100)}};
  }
  async function start({channel,config,phone,recaptchaToken,challengeId}) {
    if(channel==='sms') {
      if(typeof recaptchaToken!=='string' || recaptchaToken.length<10 || recaptchaToken.length>10000) unavailable();
      const result=await post(`https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${config.apiKey}`,
        {phoneNumber:phone,recaptchaToken},{'X-Firebase-Locale':'pt-BR'});
      if(!result.ok || typeof result.data.sessionInfo!=='string') unavailable();
      // Encrypted provider session, never an OTP or a Firebase token for the app.
      return {sessionInfo:result.data.sessionInfo,fingerprint:config.fingerprint};
    }
    if(channel==='whatsapp') {
      const code=String(randomInt(0,1000000)).padStart(6,'0');
      const [token,pepper]=await Promise.all([readSecret(accessTokenVersion(config.integrationStoreId)),readSecret(`projects/${DEV_PROJECT_ID}/secrets/address-otp-hash-key/versions/latest`)]);
      if(pepper.length<32) unavailable();
      const payload=buildTemplatePayload(config.config,phone.replace(/^\+/,''),[code]);
      payload.template.components.push({type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:code}]});
      const result=await sendCloudTemplate({config:config.config,payload,token,fetchImpl});
      if(result.status!=='accepted') unavailable(); // No mock success or automatic retry.
      return {digest:createHmac('sha256',pepper).update(`${challengeId}:${phone}:${code}`).digest('hex'),fingerprint:config.fingerprint};
    }
    unavailable();
  }
  async function verify({channel,config,phone,proof,code,challengeId}) {
    if(proof.fingerprint!==config.fingerprint) return false;
    if(channel==='whatsapp') {
      const pepper=await readSecret(`projects/${DEV_PROJECT_ID}/secrets/address-otp-hash-key/versions/latest`);
      const digest=createHmac('sha256',pepper).update(`${challengeId}:${phone}:${code}`).digest('hex');
      return typeof proof.digest==='string' && proof.digest.length===digest.length && timingSafeEqual(Buffer.from(proof.digest),Buffer.from(digest));
    }
    if(channel!=='sms') return false;
    const result=await post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${config.apiKey}`,{sessionInfo:proof.sessionInfo,code});
    if(!result.ok || result.data.phoneNumber!==phone || !result.data.idToken) return false;
    const verifierApp=admin.apps.find(candidate=>candidate.name==='address-sms-'+config.projectId) || admin.initializeApp({projectId:config.projectId},'address-sms-'+config.projectId);
    const claims=await admin.auth(verifierApp).verifyIdToken(result.data.idToken);
    // All ID/refresh tokens stay on the backend and are discarded.
    return claims.phone_number===phone && claims.firebase?.sign_in_provider==='phone' && !claims.firebase?.tenant && claims.aud===config.projectId;
  }
  return {load,start,verify};
}
module.exports={createAddressVerificationProvider};
