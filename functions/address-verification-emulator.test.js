process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
process.env.GCLOUD_PROJECT='demo-doceria-checkout';
process.env.FUNCTIONS_EMULATOR='true';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const admin=require('firebase-admin');
const {createHash}=require('node:crypto');
const http=require('node:http');
const express=require('express');
const {createCheckoutIdentity}=require('./checkout-identity');
const {createAddressVerification,mountAddressVerification}=require('./address-verification');
const {addressOptions}=require('./checkout-addresses');
admin.initializeApp();const db=admin.firestore();let sequence=0;
after(()=>admin.app().delete());
const hash=v=>createHash('sha256').update(v).digest('hex');
const address={id:'stable',nickname:'Casa',street:'Rua teste',number:'10',neighborhood:'Bueno',city:'Goiânia',cep:'74230000',enderecoCompleto:'Rua teste 10',lat:-16,lng:-49,isDefault:true};
async function fixture(overrides={}) {
  const n=++sequence,phone='6298500'+String(n).padStart(4,'0'),storeId='loja-futura-otp-'+n,customerId='otp-customer-'+n;
  let time=1000000,sends=0,verifications=0,failSend=false;
  await db.doc('clientes/'+customerId).set({telefone:phone,nome:'Fixture',authOwnerUid:'private-owner',enderecos:[address]});
  const identities=createCheckoutIdentity({db,now:()=>time});
  const selected=await identities.select({storeId,mode:'legacy_phone',phone,phoneRecordHash:hash(phone),legacyCustomerId:customerId});
  const input={storeId,checkoutIdentityToken:selected.token,checkoutIdentityRevision:selected.revision};
  const policy={otpMs:300000,sessionMs:600000,resendMs:45000,maxAttempts:5,phoneHourly:5,ipHourly:10,globalDaily:100,...overrides};
  const provider={load:async()=>({channels:{sms:{fingerprint:'fixture'},whatsapp:{fingerprint:'fixture'}},policy}),
    start:async()=>{sends++;if(failSend)throw Error('private provider exception');return {opaqueSession:'not-an-otp'};},
    verify:async data=>{verifications++;return data.code==='123456';}};
  const service=createAddressVerification({db,identities,provider,now:()=>time});
  const send=()=>service.start({...input,channel:'sms',recaptchaToken:'fixture-token'},'fixture-ip-'+n);
  const authorize=async()=>{const challenge=await send();return service.verify({...input,challengeId:challenge.challengeId,code:'123456'});};
  const manage=(grant,operation,extra={})=>service.manage({...input,addressSessionToken:grant?.addressSessionToken,operation,addressId:addressOptions(selected.token,customerId,[address])[0].id,...extra});
  return {phone,customerId,storeId,identities,input,service,provider,send,authorize,manage,advance:ms=>{time+=ms;},failSend:()=>{failSend=true;},calls:()=>({sends,verifications})};
}
test('resumo/seleção continuam independentes; toda escrita e detalhe privado exigem prova backend',async()=>{
  const f=await fixture();const options=addressOptions(f.input.checkoutIdentityToken,f.customerId,[address]);assert.equal(options.length,1);assert.equal(options[0].enderecoCompleto,undefined);
  for(const operation of ['read','create','update','delete','default']) await assert.rejects(()=>f.manage(null,operation),e=>e.code==='OTP_REQUIRED');
  assert.deepEqual((await db.doc('clientes/'+f.customerId).get()).data().enderecos,[address]);
});
test('código errado conta tentativas, bloqueia e não revela dados; expirado não autoriza',async()=>{
  const f=await fixture({maxAttempts:2});const sent=await f.send();
  for(let i=0;i<2;i++)await assert.rejects(()=>f.service.verify({...f.input,challengeId:sent.challengeId,code:'000000'}),e=>e.code==='OTP_INVALID');
  await assert.rejects(()=>f.service.verify({...f.input,challengeId:sent.challengeId,code:'123456'}),e=>e.code==='OTP_LIMITED');
  assert.equal(f.calls().verifications,2);
  const g=await fixture();const old=await g.send();g.advance(300001);
  await assert.rejects(()=>g.service.verify({...g.input,challengeId:old.challengeId,code:'123456'}),e=>e.code==='OTP_EXPIRED');
});
test('uso único gera autorização apenas de endereço e não promove identidade/pagamento',async()=>{
  const f=await fixture(),sent=await f.send();const grant=await f.service.verify({...f.input,challengeId:sent.challengeId,code:'123456'});
  assert.equal(grant.purpose,'ADDRESS_MANAGEMENT');assert.equal(grant.idToken,undefined);assert.equal(grant.refreshToken,undefined);
  await assert.rejects(()=>f.service.verify({...f.input,challengeId:sent.challengeId,code:'123456'}),e=>e.code==='OTP_USED');
  const context=await f.identities.read(f.input.checkoutIdentityToken,f.storeId);assert.equal(context.mode,'legacy_phone');assert.throws(()=>f.identities.requireStrong(context,'private-owner',f.customerId));
  const detail=await f.manage(grant,'read');assert.equal(detail.address.enderecoCompleto,address.enderecoCompleto);assert.equal(detail.address.authOwnerUid,undefined);
});
test('create/update/default/delete usam ID persistido, allowlist e auditoria; nenhuma alteração de Auth/telefone',async()=>{
  const f=await fixture(),grant=await f.authorize();
  const created=await f.manage(grant,'create',{address:{...address,nickname:'Trabalho',number:'20',authOwnerUid:'attacker',isDefault:true}});
  assert.equal(created.addresses.length,2);assert.equal(created.addresses[0].nickname,'Trabalho');assert.equal(created.addresses[0].isDefault,true);
  const id=created.addresses[0].id;
  const updated=await f.manage(grant,'update',{addressId:id,address:{complement:'Sala 2'}});assert.equal(updated.addresses.length,2);
  const detail=await f.manage(grant,'read',{addressId:id});assert.equal(detail.address.complement,'Sala 2');assert.match(detail.address.enderecoCompleto,/20, Sala 2/);
  await f.manage(grant,'default');
  await assert.rejects(()=>f.manage(grant,'delete',{addressId:id}),e=>e.code==='ADDRESS_CONFIRMATION_REQUIRED');
  await f.manage(grant,'delete',{addressId:id,confirmed:true});
  const data=(await db.doc('clientes/'+f.customerId).get()).data();assert.equal(data.telefone,f.phone);assert.equal(data.authOwnerUid,'private-owner');assert.equal(data.enderecos.length,1);
  const audits=await db.collection('integrations/addressVerification/audit').where('customerId','==',f.customerId).get();assert.ok(audits.size>=6);
  for(const doc of audits.docs){assert.equal(doc.data().code,undefined);assert.equal(doc.data().addressSessionToken,undefined);assert.equal(doc.data().phone,undefined);}
});
test('OTP de A não autoriza B, telefone alterado, store diferente ou guest',async()=>{
  const a=await fixture(),grant=await a.authorize(),b=await fixture();
  await assert.rejects(()=>b.manage(grant,'read'),e=>e.code==='OTP_REQUIRED');
  await assert.rejects(()=>a.service.manage({...a.input,storeId:b.storeId,operation:'read',addressSessionToken:grant.addressSessionToken}));
  await db.doc('clientes/'+a.customerId).update({telefone:'62999998888'});
  await assert.rejects(()=>a.manage(grant,'read'),e=>e.code==='OTP_REQUIRED');
  const c=await fixture(),cg=await c.authorize();await c.identities.select({token:c.input.checkoutIdentityToken,storeId:c.storeId,mode:'guest'});
  await assert.rejects(()=>c.manage(cg,'read'),e=>e.code==='OTP_REQUIRED');
});
test('revogar e expirar invalida autorização, inclusive chamadas manuais',async()=>{
  const f=await fixture(),grant=await f.authorize();await f.service.revoke(f.input);await assert.rejects(()=>f.manage(grant,'read'),e=>e.code==='OTP_REQUIRED');
  const g=await fixture(),gg=await g.authorize();g.advance(600001);await assert.rejects(()=>g.manage(gg,'read'),e=>e.code==='OTP_REQUIRED');
});
test('reenvio por outra sessão respeita intervalo global do telefone; antigo perde validade',async()=>{
  const f=await fixture(),first=await f.send();await assert.rejects(()=>f.send(),e=>e.code==='OTP_LIMITED');
  const next=await f.identities.select({storeId:f.storeId,mode:'legacy_phone',phone:f.phone,phoneRecordHash:hash(f.phone),legacyCustomerId:f.customerId});
  await assert.rejects(()=>f.service.start({...f.input,checkoutIdentityToken:next.token,checkoutIdentityRevision:next.revision,channel:'sms'},'other-ip'),e=>e.code==='OTP_LIMITED');
  f.advance(45001);await f.send();await assert.rejects(()=>f.service.verify({...f.input,challengeId:first.challengeId,code:'123456'}),e=>e.code==='OTP_EXPIRED');
});
test('limite por telefone e falha do provedor não alteram endereço nem criam grant',async()=>{
  const f=await fixture({phoneHourly:1});await f.send();f.advance(45001);await assert.rejects(()=>f.send(),e=>e.code==='OTP_LIMITED');
  const g=await fixture();g.failSend();await assert.rejects(()=>g.send(),e=>e.code==='OTP_SEND_FAILED');await assert.rejects(()=>g.manage(null,'read'));
  assert.deepEqual((await db.doc('clientes/'+g.customerId).get()).data().enderecos,[address]);
});
test('verificações concorrentes não consomem desafio duas vezes; revogação durante resposta não cria grant',async()=>{
  const f=await fixture(),sent=await f.send();let release,entered;
  const ready=new Promise(r=>{entered=r;});f.provider.verify=async()=>{entered();await new Promise(r=>{release=r;});return true;};
  const pending=f.service.verify({...f.input,challengeId:sent.challengeId,code:'123456'});await ready;
  await assert.rejects(()=>f.service.verify({...f.input,challengeId:sent.challengeId,code:'123456'}),e=>e.code==='OTP_LIMITED');
  await f.service.revoke(f.input);release();await assert.rejects(()=>pending,e=>e.code==='OTP_EXPIRED');
  const grants=await db.collection('integrations/addressVerification/grants').where('customerId','==',f.customerId).get();assert.equal(grants.size,0);
});
test('limite de IP é compartilhado entre telefones/contextos distintos',async()=>{
  const a=await fixture({ipHourly:1}),b=await fixture({ipHourly:1});
  await a.service.start({...a.input,channel:'sms'},'shared-otp-fixture-ip');
  await assert.rejects(()=>b.service.start({...b.input,channel:'sms'},'shared-otp-fixture-ip'),e=>e.code==='OTP_LIMITED');
});
test('HTTP rejeita customer/telefone arbitrários, prova ausente e detalhe completo não autorizado',async()=>{
  const f=await fixture(),app=express();app.use(express.json());mountAddressVerification(app,f.service);const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const url=`http://127.0.0.1:${server.address().port}/checkout/address-verification/manage`;
    for(const extra of [{},{customerId:f.customerId},{phone:f.phone},{addressSessionToken:'a'.repeat(64)}]) {
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...f.input,operation:'read',...extra})});const data=await r.json();assert.equal(r.status,403);assert.equal(data.address,undefined);assert.equal(r.headers.get('cache-control'),'no-store');
    }
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
