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

function legacyRequest(uid,data) {
  const user=users[uid],google=user.providerData[0].providerId==='google.com';
  return {auth:{uid,token:{email:user.email,firebase:{identities:google?{'google.com':[user.providerData[0].uid]}:{email:[user.email]}}}},rawRequest:{ip:'127.0.0.9'},data:{storeId:'claim-store',...data}};
}
for(const [uid,phone,google]of [['g','62985550094',true],['c','62985550095',false]]) {
  test((google?'Google':'e-mail')+': legado sem índice mantém ID, endereços e histórico alternativo no SDK real emulado',async()=>{
    users[uid]={uid,email:uid+'@example.test',providerData:[{providerId:google?'google.com':'password',uid:google?'google-'+uid:uid+'@example.test'}]};
    const id='unindexed-'+uid,rootPath='pedidos/root-'+uid,storePath='lojas/claim-store/pedidos/alternate-'+uid;
    const source={nome:'Legado sintético',telefone:phone,identityRegistryVersion:1,legacyCustomerIds:[],legacyOrderPaths:[rootPath],
      ...(google?{enderecos:[{id:'one'},{id:'two'},{id:'three'}]}:{address:{street:'Rua antiga',district:'Centro'}})};
    await db.doc('clientes/'+id).set(source);
    const rootOrder={customerId:id,total:35,createdAt:'2026-10-01'},storeOrder={clientId:id,total:10,createdAt:'2026-10-02'};
    await db.doc(rootPath).set(rootOrder);await db.doc(storePath).set(storeOrder);
    const request=data=>legacyRequest(uid,{phone,...data});
    assert.equal((await accounts.completeProfile(request({nome:'Não substituir'}))).claimRequired,true);
    assert.equal((await db.collection('clientes').where('telefone','==',phone).get()).size,1);
    const challenge=await api.start(request({})),result=await api.confirm(request({challengeId:challenge.challengeId,code:'123456'}));
    assert.equal(result.customer.id,id);assert.equal(result.customer.enderecos.length,google?3:1);
    const saved=(await db.doc('clientes/'+id).get()).data();for(const [key,value]of Object.entries(source))assert.deepEqual(saved[key],value,key);
    assert.equal((await accounts.account(request({}))).customer.id,id);
    assert.deepEqual((await accounts.orders(request({}))).orders.map(o=>o.id),['alternate-'+uid,'root-'+uid]);
    assert.equal((await accounts.orderDetail(request({source:'legacy',orderId:'root-'+uid}))).order.total,35);
    assert.deepEqual((await db.doc(rootPath).get()).data(),rootOrder);assert.deepEqual((await db.doc(storePath).get()).data(),storeOrder);
    assert.equal((await db.collection('clientes').where('telefone','==',phone).get()).size,1);
  });
}
test('claims concorrentes de dois UIDs são serializados pelo Firestore emulado sem duplicar ownership',async()=>{
  const phone='62985550096';await db.doc('clientes/unindexed-race').set({nome:'Legado concorrente',telefone:phone,enderecos:[]});
  for(const uid of ['x','y'])users[uid]={uid,email:uid+'@example.test',providerData:[{providerId:'password',uid:uid+'@example.test'}]};
  const x=await api.start(legacyRequest('x',{phone}));time+=60001;const y=await api.start(legacyRequest('y',{phone}));
  const results=await Promise.allSettled([api.confirm(legacyRequest('x',{phone,challengeId:x.challengeId,code:'123456'})),api.confirm(legacyRequest('y',{phone,challengeId:y.challengeId,code:'123456'}))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const customer=(await db.doc('clientes/unindexed-race').get()).data();assert.equal(customer.authOwnerUids.length,1);
  assert.equal((await db.collection('clientes').where('telefone','==',phone).get()).size,1);
  assert.equal((await db.collection('integrations/customerRegistry/audit').where('customerId','==','unindexed-race').get()).size,1);
});
