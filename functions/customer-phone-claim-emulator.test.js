process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const {createCustomerAccount}=require('./checkout-auth');
const {createCustomerPhoneClaim}=require('./customer-phone-claim');
const app=admin.initializeApp({projectId:'demo-doceria-phone-claim'},'phone-claim-tests'),db=app.firestore();
let time=1800000000000,sendCount=0,verifyCount=0,providerFail=false;
const users=Object.fromEntries(['a','b'].map(uid=>[uid,{uid,email:uid+'@example.test',providerData:[{providerId:'password',uid:uid+'@example.test'}]}]));
const accounts=createCustomerAccount({db,admin:{auth:()=>({getUser:async uid=>users[uid]})}});
const provider={load:async()=>({channels:{sms:{projectId:'sms-fixture',enterpriseSiteKey:'test-site-key-long-enough'}},policy:{otpMs:300000,resendMs:60000,phoneHourly:5,ipHourly:10,globalDaily:100,maxAttempts:5}}),
  start:async()=>{sendCount++;if(providerFail)throw Error('fixture failure');return {fixture:true};},verify:async({code})=>{verifyCount++;return code==='123456';}};
const api=createCustomerPhoneClaim({db,accounts,provider,now:()=>time});
const request=(data={},uid='a')=>({auth:{uid,token:{email:uid+'@example.test',firebase:{identities:{email:[uid+'@example.test']}}}},rawRequest:{ip:'127.0.0.8'},data:{phone:'62985550091',storeId:'claim-store',...data}});
let customer,fixtureClaimId;
before(async()=>{
  await db.doc('integrations/customerRegistry').set({state:'READY'});await db.doc('lojas/claim-store').set({nome:'Fixture'});
  customer=await accounts.registry.createOrGet({phone:'62985550091',data:{nome:'Legado preservado',enderecos:[{id:'saved',nickname:'Casa antiga',enderecoCompleto:'Destino privado de teste'}]}});
});
after(()=>app.delete());
test('cadastro existente retorna claimRequired sem novo Customer ou auto-merge',async()=>{
  const result=await accounts.completeProfile(request({phone:'62985550091',nome:'Novo nome'}));
  assert.equal(result.claimRequired,true);assert.equal(result.identityReviewRequired,false);assert.equal((await db.collection('clientes').get()).size,1);
  assert.equal((await accounts.account(request())).needsPhone,true);assert.equal(sendCount,0);
});
test('claim é ligado a UID, telefone, Customer e loja; código incorreto não autoriza',async()=>{
  const challenge=await api.start(request());assert.equal(sendCount,1);
  for(const [patch,uid] of [[{},'b'],[{phone:'62985550092'},'a'],[{storeId:'missing-store'},'a']])
    await assert.rejects(()=>api.confirm(request({...patch,challengeId:challenge.challengeId,code:'123456'},uid)));
  assert.equal(verifyCount,0);
  await assert.rejects(()=>api.confirm(request({challengeId:challenge.challengeId,code:'000000'})),e=>e.code==='permission-denied');
  assert.equal((await accounts.registry.resolveStrongIdentity({user:users.a,provider:'email_password',sub:'a'})).customerId,null);
  await assert.rejects(()=>api.start(request()),e=>e.code==='resource-exhausted');
  // Keep only fixture identifiers in memory. Never print OTP/provider payloads.
  fixtureClaimId=challenge.challengeId;
});
test('prova válida vincula ao mesmo ID, preserva endereço/perfil e não pode ser reutilizada',async()=>{
  const result=await api.confirm(request({challengeId:fixtureClaimId,code:'123456'}));
  assert.equal(result.customer.id,customer.customerId);assert.equal(result.customer.nome,'Legado preservado');assert.equal(result.customer.enderecos[0].id,'saved');
  assert.equal((await db.collection('clientes').get()).size,1);
  await assert.rejects(()=>api.confirm(request({challengeId:fixtureClaimId,code:'123456'})));
  assert.equal((await db.collection('integrations/customerRegistry/audit').get()).size,1);
  await assert.rejects(()=>api.start(request({},'b')),e=>e.code==='failed-precondition');
});
test('troca de telefone no perfil é bloqueada; só a formatação equivalente pode continuar',async()=>{
  await assert.rejects(()=>accounts.update(request({nome:'Mesmo cadastro',telefone:'62985550092'})),e=>e.code==='failed-precondition');
  const result=await accounts.update(request({nome:'Mesmo cadastro',telefone:'+55 (62) 98555-0091'}));assert.equal(result.customer.telefone,'62985550091');
});
test('challenge expirado e falha do provider não criam vínculo forte',async()=>{
  await accounts.registry.createOrGet({phone:'62985550093',data:{nome:'Outro legado'}});time+=60001;
  const data={phone:'62985550093'},challenge=await api.start(request(data,'b'));time+=300001;
  await assert.rejects(()=>api.confirm(request({...data,challengeId:challenge.challengeId,code:'123456'},'b')));
  providerFail=true;time+=60001;await assert.rejects(()=>api.start(request(data,'b')),e=>e.code==='unavailable');
  assert.equal((await accounts.account(request({},'b'))).needsPhone,true);providerFail=false;
});
