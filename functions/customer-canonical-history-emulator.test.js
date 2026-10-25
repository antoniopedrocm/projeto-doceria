process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const {createCustomerAccount,digest}=require('./checkout-auth');
const app=admin.initializeApp({projectId:'demo-customer-canonical-history'},'canonical-history-tests'),db=app.firestore();
const api=createCustomerAccount({db,admin:{auth:()=>({getUser:async uid=>({uid,email:uid+'@example.test',providerData:[{providerId:'password',uid:uid+'@example.test'}]})})}});
const request=(data={},uid='one')=>({auth:{uid,token:{email:uid+'@example.test',firebase:{identities:{email:[uid+'@example.test']}}}},data});
before(async()=>{
  await db.doc('clientes/canonical').set({authOwnerUid:'one',authOwnerUids:['one','two'],identityRegistryVersion:1,legacyCustomerIds:['old'],legacyOrderPaths:['pedidos/legacy-approved'],nome:'Canônico',telefone:'62985550081',enderecos:[]});
  for(const uid of ['one','two'])await db.doc('customerAuthIdentities/'+digest('email_password',uid)).set({uid,customerId:uid==='two'?'old':'canonical'});
  await db.doc('clientes/old').set({canonicalStatus:'ALIAS',canonicalCustomerId:'canonical',cuponsUsados:['PAST'],cuponsReservados:['PENDING']});
  await db.doc('integrations/customerRegistry/aliases/'+require('node:crypto').createHash('sha256').update('old').digest('hex')).set({state:'READY',customerId:'canonical'});
  await db.doc('lojas/history-store').set({nome:'Loja de teste'});
  await db.doc('lojas/history-store/pedidos/owned').set({clienteId:'canonical',ownerUid:'one',total:9.9,createdAt:'2026-10-20',itens:[]});
  await db.doc('lojas/history-store/pedidos/alias-owned').set({clienteId:'old',ownerUid:'two',total:19.9,createdAt:'2026-10-19',itens:[]});
  await db.doc('pedidos/legacy-approved').set({clienteId:'old',total:29.9,status:'Entregue',createdAt:'2025-01-01',clienteEndereco:'Snapshot de teste original',itens:[]});
  await db.doc('pedidos/legacy-unreviewed').set({clienteId:'old',total:999,createdAt:'2026-10-23'});
  await db.doc('lojas/history-store/pedidos/foreign-owner').set({clienteId:'old',ownerUid:'foreign',total:999});
});
test('cupom consumido ou reservado no alias permanece bloqueado, inclusive após atualização tardia',async()=>{
  const initial=await api.registry.couponState('canonical');assert.deepEqual(initial.used,['PAST']);assert.deepEqual(initial.reserved,['PENDING']);
  await db.doc('clientes/old').update({cuponsUsados:['PAST','LATE'],cuponsReservados:[]});
  const late=await db.runTransaction(tx=>api.registry.couponState('canonical',tx));assert.deepEqual(late.used,['PAST','LATE']);assert.deepEqual(late.reserved,[]);
});
after(()=>app.delete());
test('UIDs revisados compartilham IDs/aliases aprovados; histórico é referenciado, nunca copiado',async()=>{
  const before=(await db.collectionGroup('pedidos').get()).docs.map(s=>[s.ref.path,s.data()]);
  for(const uid of ['one','two']){
    const result=await api.orders(request({},uid));assert.deepEqual(result.orders.map(o=>o.id),['owned','alias-owned','legacy-approved']);
    assert.equal((await api.account(request({},uid))).customer.id,'canonical');
    const legacy=result.orders.at(-1);assert.equal(legacy.storeId,null);assert.equal(legacy.source,'legacy');assert.equal(legacy.total,29.9);assert.equal(legacy.storeName,'Histórico — loja não informada');
  }
  assert.deepEqual((await db.collectionGroup('pedidos').get()).docs.map(s=>[s.ref.path,s.data()]),before);
});
test('detalhe legado exige referência revisada; pedido por telefone ou owner estrangeiro não ganha acesso',async()=>{
  const result=await api.orderDetail(request({source:'legacy',orderId:'legacy-approved'}));assert.equal(result.order.endereco,'Snapshot de teste original');
  await assert.rejects(()=>api.orderDetail(request({source:'legacy',orderId:'legacy-unreviewed'})),e=>e.code==='not-found');
  await assert.rejects(()=>api.orderDetail(request({storeId:'history-store',orderId:'foreign-owner'})),e=>e.code==='not-found');
  await assert.rejects(()=>api.orders(request({},'foreign')),e=>e.code==='failed-precondition');
  await assert.rejects(()=>api.reorderPreview(request({source:'legacy',orderId:'legacy-approved'})),e=>e.code==='failed-precondition');
});
