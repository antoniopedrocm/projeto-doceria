const {test}=require('node:test');const assert=require('node:assert/strict');
const {createAddressVerificationProvider}=require('./address-verification-provider');
const {createAddressVerification}=require('./address-verification');
const phone='+5562985550001';
const sms={enabled:true,provider:'firebase',projectId:'doceria-sms-dev-fixture',verificationOnly:true,apiKey:'public-fixture-key-not-secret',authDomain:'doceria-sms-dev-fixture.firebaseapp.com'};
const wa={enabled:true,integrationStoreId:'fixture',templateName:'address_code',templateLanguage:'pt_BR',templateCategory:'AUTHENTICATION',templateApproved:true};
const integration={enabled:true,mode:'cloud',templateName:'order_confirmation',templateLanguage:'pt_BR',timeoutMs:1000,apiVersion:'v23.0',phoneNumberId:'12345',allowedRecipients:[phone.slice(1)]};
function setup(raw,fetchImpl,admin) {
  const db={doc:path=>({get:async()=>({data:()=>path.includes('whatsapp')?integration:raw})})};
  return createAddressVerificationProvider({db,admin,fetchImpl,getProjectId:()=> 'crmdoceria-9959e',readSecret:async name=>name.includes('hash-key')?'p'.repeat(32):'provider-test-token'});
}

test('canal desconhecido/propriedade de prototype não consulta identidade, envia ou consome limite',async()=>{
  const service=createAddressVerification({db:{doc:()=>({})},identities:{read:()=>assert.fail('no context access')},provider:{load:()=>assert.fail('no provider access')}});
  for(const channel of ['__proto__','constructor','email',null]) await assert.rejects(()=>service.start({channel},'fixture-ip'),e=>e.code==='OTP_UNAVAILABLE' && e.httpStatus===400);
});
test('canais ausentes/desligados e Firebase no projeto da aplicação ou PROD nunca fingem envio',async()=>{
  for(const raw of [{enabled:true,allowedRecipients:[phone],sms:{...sms,verificationOnly:false}},{},{enabled:false},{enabled:true,allowedRecipients:[phone],sms:{...sms,projectId:'crmdoceria-9959e',authDomain:'crmdoceria-9959e.firebaseapp.com'}},{enabled:true,allowedRecipients:[phone],sms:{...sms,projectId:'ana-guimaraes',authDomain:'ana-guimaraes.firebaseapp.com'}}]){
    const p=setup(raw,()=>assert.fail('network not allowed'));assert.deepEqual((await p.load('future',phone)).channels,{});
  }
});
test('Firebase SMS usa número do servidor/reCAPTCHA e valida prova do projeto de verificação, sem retornar tokens',async()=>{
  const calls=[];const raw={enabled:true,allowedRecipients:[phone],sms};
  let verified=0;
  const admin={apps:[],initializeApp:(options,name)=>{assert.equal(options.projectId,sms.projectId);return {name,options};},auth:app=>{assert.equal(app.options.projectId,sms.projectId);return {verifyIdToken:async token=>{verified++;assert.equal(token,'private-provider-id-token');return {phone_number:phone,aud:sms.projectId,firebase:{sign_in_provider:'phone'}};}};}};
  const provider=setup(raw,async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>String(url).includes('sendVerificationCode')?{sessionInfo:'encrypted-session'}:{phoneNumber:phone,idToken:'private-provider-id-token',refreshToken:'never-return'}};},admin);
  const config=(await provider.load('future',phone)).channels.sms;
  const proof=await provider.start({channel:'sms',config,phone,recaptchaToken:'recaptcha-fixture',challengeId:'fixture'});
  assert.equal(proof.code,undefined);assert.equal(proof.idToken,undefined);
  assert.equal(await provider.verify({channel:'sms',config,phone,proof,code:'123456'}),true);
  assert.equal(calls[0].body.phoneNumber,phone);assert.equal(calls[0].body.tenantId,undefined);assert.equal(calls[1].body.tenantId,undefined);assert.equal(calls[1].body.idToken,undefined);assert.equal(calls[1].body.temporaryProof,undefined);assert.equal(verified,1);
});
test('WhatsApp usa template AUTHENTICATION próprio, transporte oficial, HMAC e código de seis dígitos',async()=>{
  let payload;const provider=setup({enabled:true,allowedRecipients:[phone],whatsapp:wa},async(_url,options)=>{payload=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({messaging_product:'whatsapp',messages:[{id:'wamid.fixture'}]})};});
  const config=(await provider.load('future',phone)).channels.whatsapp;
  const proof=await provider.start({channel:'whatsapp',config,phone,challengeId:'challenge'});
  const code=payload.template.components[0].parameters[0].text;assert.match(code,/^\d{6}$/);assert.equal(payload.template.name,'address_code');assert.equal(payload.template.components[1].parameters[0].text,code);assert.equal(proof.code,undefined);
  assert.equal(await provider.verify({channel:'whatsapp',config,phone,proof,code,challengeId:'challenge'}),true);
  assert.equal(await provider.verify({channel:'whatsapp',config,phone,proof,code,challengeId:'another'}),false);
});
test('resposta/prova inválida, template de pedidos ou falha de rede não autorizam',async()=>{
  const provider=setup({enabled:true,allowedRecipients:[phone],sms,whatsapp:{...wa,templateCategory:'UTILITY'}},async()=>{throw Error('must not expose credentials');});
  const config=(await provider.load('future',phone)).channels.sms;assert.equal((await provider.load('future',phone)).channels.whatsapp,undefined);
  await assert.rejects(()=>provider.start({channel:'sms',config,phone,recaptchaToken:'captcha-fixture'}));
});
