const {randomBytes,randomUUID,createHash}=require('node:crypto');
const {addressRecords,normalizeContactPhone}=require('./checkout-auth');
const {addressOptions,addressReference}=require('./checkout-addresses');
const {getRuntimeProjectId,DEV_PROJECT_ID}=require('./whatsapp-config');
const PURPOSE='ADDRESS_MANAGEMENT';
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
const error=(code,message,httpStatus=403)=>Object.assign(new Error(message),{code,httpStatus});
const required=()=>error('OTP_REQUIRED','Confirme que este número é seu para gerenciar endereços.');
const limited=()=>error('OTP_LIMITED','Muitas tentativas. Aguarde alguns minutos.',429);
const expired=()=>error('OTP_EXPIRED','Código expirado. Solicite um novo.',409);
function normalizeManagedAddress(input,prior={}) {
  const value={...prior,...input},clean=(key,max)=>typeof value[key]==='string'?value[key].trim().slice(0,max):'';
  const fields=Object.fromEntries(['nickname','street','number','neighborhood','city','complement','referencia'].map(k=>[k,clean(k,k==='nickname'?60:160)]));
  fields.cep=clean('cep',12).replace(/\D/g,'');fields.semNumero=value.semNumero===true;
  if(fields.semNumero) fields.number='S/N';
  if(!fields.nickname || !fields.street || !fields.number || !fields.neighborhood || !fields.city || (fields.cep && fields.cep.length!==8)) throw error('ADDRESS_INVALID','Confira rua, número, bairro, cidade e CEP do endereço.',400);
  if(Object.values(fields).some(v=>typeof v==='string' && /[|\p{Cc}]/u.test(v))) throw error('ADDRESS_INVALID','Confira os campos do endereço.',400);
  fields.complemento=fields.complement;fields.isDefault=value.isDefault===true;fields.localizacaoFrequente=value.localizacaoFrequente===true;
  fields.enderecoCompleto=[fields.street,fields.number,fields.complement,fields.neighborhood,fields.city,fields.cep?`CEP: ${fields.cep}`:''].filter(Boolean).join(', ');
  const unchanged=['street','number','neighborhood','city','cep'].every(k=>fields[k]===prior[k]);
  const coords=input?.lat!==undefined?input:unchanged?prior:{};
  if(typeof coords.lat==='number' && typeof coords.lng==='number' && Number.isFinite(coords.lat) && Number.isFinite(coords.lng) && Math.abs(coords.lat)<=90 && Math.abs(coords.lng)<=180) Object.assign(fields,{lat:coords.lat,lng:coords.lng});
  return fields;
}
function createAddressVerification({db,identities,provider,now=Date.now,getProjectId=getRuntimeProjectId}) {
  const root=db.doc('integrations/addressVerification');
  const environment=()=>{if(getProjectId()!==DEV_PROJECT_ID && !(process.env.FUNCTIONS_EMULATOR==='true' && /^demo-/.test(getProjectId()))) throw error('OTP_UNAVAILABLE','Verificação de endereço indisponível.',503);};
  async function scope(input,tx) {
    environment();
    const {storeId,checkoutIdentityToken:token,checkoutIdentityRevision:revision}=input;
    const context=await identities.read(token,storeId,tx);
    if(context.mode!=='legacy_phone' || context.revision!==revision || !context.legacyCustomerId || !/^\d{10,11}$/.test(context.legacyPhone || '') || hash(context.legacyPhone)!==context.phoneHash) throw required();
    const customerRef=db.collection('clientes').doc(context.legacyCustomerId);
    const customer=await (tx?tx.get(customerRef):customerRef.get());
    if(!customer.exists || hash(normalizeContactPhone(customer.data().telefone))!==context.phoneRecordHash) throw required();
    return {context,customer,customerRef,contextRef:identities.ref(token),phone:'+55'+context.legacyPhone,token};
  }
  function audit(tx,s,action,channel,addressId=null) {
    tx.create(root.collection('audit').doc(),{purpose:PURPOSE,customerId:s.context.legacyCustomerId,storeId:s.context.storeId,
      action,channel,addressId,origin:'legacy_phone',at:now()});
  }
  async function status(input) {
    const s=await scope(input),{channels,policy}=await provider.load(input.storeId,s.phone);
    const sms=channels.sms;
    return {channels:Object.keys(channels),phoneMasked:'••••'+s.phone.slice(-4),resendSeconds:policy.resendMs/1000,
      ...(sms?{firebase:{apiKey:sms.apiKey,projectId:sms.projectId,authDomain:sms.authDomain}}:{})};
  }
  async function start(input,ip) {
    if(!['sms','whatsapp'].includes(input.channel)) throw error('OTP_UNAVAILABLE','Escolha um canal de verificação disponível.',400);
    const initial=await scope(input);const {channels,policy}=await provider.load(input.storeId,initial.phone);
    const config=channels[input.channel];if(!config) throw error('OTP_UNAVAILABLE','Verificação indisponível agora. Entre com Google ou e-mail para gerenciar endereços.',503);
    const id=randomBytes(32).toString('hex'),ref=root.collection('challenges').doc(id);
    const reserved=await db.runTransaction(async tx=>{
      const s=await scope(input,tx);
      const counters=[['phone:'+s.context.phoneHash,3600000,policy.phoneHourly],['ip:'+hash(ip || 'unknown'),3600000,policy.ipHourly],['global',86400000,policy.globalDaily]];
      const snapshots=await Promise.all(counters.map(([key])=>tx.get(root.collection('limits').doc(hash(key)))));
      if(s.context.addressOtpResendAt>now()) throw limited();
      if(snapshots[0].data()?.lastSentAt>now()-policy.resendMs) throw limited();
      snapshots.forEach((snap,i)=>{const d=snap.data();if(d && now()-d.windowAt<counters[i][1] && d.count>=counters[i][2]) throw limited();});
      const challenge={purpose:PURPOSE,customerId:s.context.legacyCustomerId,phoneHash:s.context.phoneHash,phoneRecordHash:s.context.phoneRecordHash,
        contextPath:s.contextRef.path,revision:s.context.revision,storeId:input.storeId,channel:input.channel,status:'sending',attempts:0,
        createdAt:now(),expiresAt:now()+policy.otpMs,maxAttempts:policy.maxAttempts,sessionMs:policy.sessionMs};
      snapshots.forEach((snap,i)=>{const old=snap.data(),same=old && now()-old.windowAt<counters[i][1];tx.set(snap.ref,{windowAt:same?old.windowAt:now(),count:(same?old.count:0)+1,lastSentAt:now()});});
      tx.create(ref,challenge);tx.update(s.contextRef,{addressChallengeId:id,addressGrantHash:null,addressOtpResendAt:now()+policy.resendMs});
      audit(tx,s,'code_requested',input.channel);return challenge;
    });
    let proof;
    try {proof=await provider.start({channel:input.channel,config,phone:initial.phone,recaptchaToken:input.recaptchaToken,challengeId:id});}
    catch {
      await ref.update({status:'failed'});
      throw error('OTP_SEND_FAILED','Não foi possível enviar o código agora. Tente novamente em alguns instantes.',503);
    }
    await db.runTransaction(async tx=>{
      const s=await scope(input,tx),current=await tx.get(ref);
      if(s.context.addressChallengeId!==id || current.data()?.status!=='sending') throw required();
      tx.update(ref,{status:'sent',proof});audit(tx,s,'code_sent',input.channel);
    });
    return {challengeId:id,expiresAt:reserved.expiresAt,resendAt:reserved.createdAt+policy.resendMs,phoneMasked:'••••'+initial.phone.slice(-4)};
  }
  async function verify(input) {
    if(!/^[a-f0-9]{64}$/.test(input.challengeId || '')) throw expired();
    const ref=root.collection('challenges').doc(input.challengeId),nonce=randomUUID();
    const pending=await db.runTransaction(async tx=>{
      const s=await scope(input,tx),d=(await tx.get(ref)).data();
      if(!d || s.context.addressChallengeId!==ref.id || d.purpose!==PURPOSE || d.contextPath!==s.contextRef.path || d.customerId!==s.context.legacyCustomerId || d.phoneHash!==s.context.phoneHash || d.revision!==s.context.revision || d.expiresAt<=now()) throw expired();
      if(d.status==='consumed') throw error('OTP_USED','Código já utilizado. Solicite um novo.',409);
      if(d.attempts>=d.maxAttempts) throw limited();
      if(d.status==='verifying' && d.leaseUntil>now()) throw limited();
      if(!['sent','verifying'].includes(d.status)) throw expired();
      tx.update(ref,{status:'verifying',attempts:d.attempts+1,nonce,leaseUntil:now()+20000});
      return {s,d};
    });
    let valid=false,unavailable=false;
    try {
      const {channels}=await provider.load(input.storeId,pending.s.phone),config=channels[pending.d.channel];
      if(!config) unavailable=true;
      else if(typeof input.code==='string' && /^\d{6}$/.test(input.code)) valid=await provider.verify({channel:pending.d.channel,config,phone:pending.s.phone,proof:pending.d.proof,code:input.code,challengeId:input.challengeId});
    } catch { unavailable=true; }
    const token=randomBytes(32).toString('hex');
    const result=await db.runTransaction(async tx=>{
      const s=await scope(input,tx),d=(await tx.get(ref)).data();
      if(d?.nonce!==nonce || d.status!=='verifying' || s.context.addressChallengeId!==ref.id || d.expiresAt<=now()) throw expired();
      if(!valid) {tx.update(ref,{status:d.attempts>=d.maxAttempts?'locked':'sent'});audit(tx,s,'code_rejected',d.channel);return null;}
      const grant={purpose:PURPOSE,customerId:s.context.legacyCustomerId,phoneHash:s.context.phoneHash,phoneRecordHash:s.context.phoneRecordHash,
        contextPath:s.contextRef.path,revision:s.context.revision,storeId:input.storeId,channel:d.channel,verifiedAt:now(),expiresAt:now()+d.sessionMs};
      tx.set(ref,{...d,status:'consumed',proof:null});tx.create(root.collection('grants').doc(hash(token)),grant);
      tx.update(s.contextRef,{addressGrantHash:hash(token)});audit(tx,s,'phone_verified',d.channel);
      return {addressSessionToken:token,expiresAt:grant.expiresAt,purpose:PURPOSE};
    });
    if(!result) throw unavailable?error('OTP_VERIFY_FAILED','Não foi possível confirmar o código agora. Tente novamente em alguns instantes.',503):error('OTP_INVALID','Código incorreto.',400);
    return result;
  }
  async function manage(input) {
    if(!/^[a-f0-9]{64}$/.test(input.addressSessionToken || '')) throw required();
    if(!['read','create','update','delete','default'].includes(input.operation)) throw error('ADDRESS_INVALID','Operação de endereço inválida.',400);
    return db.runTransaction(async tx=>{
      const s=await scope(input,tx),grant=(await tx.get(root.collection('grants').doc(hash(input.addressSessionToken)))).data();
      if(!grant || grant.purpose!==PURPOSE || grant.expiresAt<=now() || grant.contextPath!==s.contextRef.path || grant.revision!==s.context.revision || grant.customerId!==s.context.legacyCustomerId || grant.storeId!==input.storeId || grant.phoneHash!==s.context.phoneHash || grant.phoneRecordHash!==s.context.phoneRecordHash || s.context.addressGrantHash!==hash(input.addressSessionToken)) throw required();
      let records=addressRecords(grant.customerId,s.customer.data().enderecos);
      const index=records.findIndex(a=>addressReference(s.token,grant.customerId,a.id)===input.addressId);
      if(input.operation!=='create' && index<0) throw error('ADDRESS_CHANGED','O endereço mudou. Atualize a lista e tente novamente.',409);
      if(input.operation==='read') {
        const a=records[index],fields=['nickname','enderecoCompleto','street','number','neighborhood','city','cep','complement','complemento','referencia','semNumero','isDefault'];
        audit(tx,s,'address_read',grant.channel,a.id);
        return {address:{...Object.fromEntries(fields.filter(k=>a[k]!==undefined).map(k=>[k,a[k]])),id:input.addressId}};
      }
      let affected;
      if(input.operation==='delete') {
        if(input.confirmed!==true) throw error('ADDRESS_CONFIRMATION_REQUIRED','Confirme a exclusão deste endereço.',400);
        [affected]=records.splice(index,1);if(affected.isDefault && records.length) records[0].isDefault=true;
      } else if(input.operation==='default') {
        affected=records[index];records=records.map((a,i)=>({...a,isDefault:i===index}));
      } else {
        if(!input.address || typeof input.address!=='object' || Array.isArray(input.address)) throw error('ADDRESS_INVALID','Confira o endereço.',400);
        if(input.operation==='create' && records.length>=20) throw error('ADDRESS_LIMIT','Você atingiu o limite de endereços salvos.',409);
        const prior=input.operation==='update'?records[index]:{};
        const normalized=normalizeManagedAddress(input.address,prior);
        if(normalized.isDefault) records=records.map(a=>({...a,isDefault:false}));
        affected={...normalized,id:prior.id || randomUUID(),criadoEm:prior.criadoEm || new Date(now()).toISOString()};
        if(input.operation==='create') {affected.isDefault=affected.isDefault || records.length===0;records.push(affected);}else records[index]=affected;
      }
      tx.update(s.customerRef,{enderecos:records,atualizadoEm:new Date(now())});
      audit(tx,s,'address_'+input.operation,grant.channel,affected.id);
      return {addresses:addressOptions(s.token,grant.customerId,records)};
    });
  }
  async function revoke(input) {
    environment();
    await db.runTransaction(async tx=>{
      const context=await identities.read(input.checkoutIdentityToken,input.storeId,tx);
      if(context.revision===input.checkoutIdentityRevision) tx.update(identities.ref(input.checkoutIdentityToken),{addressGrantHash:null,addressChallengeId:null});
    });
    return {ok:true};
  }
  const observed=operation=>async(...args)=>{
    try{return await operation(...args);}catch(cause){
      if(['OTP_LIMITED','OTP_EXPIRED'].includes(cause.code)) {
        try{await db.runTransaction(async tx=>{const s=await scope(args[0],tx);audit(tx,s,cause.code==='OTP_LIMITED'?'verification_limited':'challenge_expired',null);});}catch{ /* Invalid identities never authorize an audit lookup or operation. */ }
      }
      throw cause;
    }
  };
  return {status,start:observed(start),verify:observed(verify),manage,revoke};
}
function mountAddressVerification(app,service) {
  const allowed=new Set(['storeId','checkoutIdentityToken','checkoutIdentityRevision','channel','recaptchaToken','challengeId','code','addressSessionToken','operation','addressId','address','confirmed']);
  for(const method of ['status','start','verify','manage','revoke']) app.post('/checkout/address-verification/'+method,async(req,res)=>{
    res.set('Cache-Control','no-store');
    try {
      if(Object.keys(req.body || {}).some(k=>!allowed.has(k))) throw required();
      return res.json(await service[method](req.body || {},req.ip));
    } catch(e) {
      const code=typeof e.code==='string' && /^(OTP_|ADDRESS_)/.test(e.code)?e.code:'OTP_REQUIRED';
      const message=code===e.code?e.message:'Confirme novamente o celular para gerenciar endereços.';
      return res.status(e.httpStatus || 403).json({code,message});
    }
  });
}
module.exports={createAddressVerification,mountAddressVerification,normalizeManagedAddress,PURPOSE};
