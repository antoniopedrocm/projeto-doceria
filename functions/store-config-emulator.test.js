// Persistent emulator fixture; hard guard prevents any live project write.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.GCLOUD_PROJECT='demo-doceria-checkout';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const express = require('express');
const {createStoreResolver,mountStoreRoutes} = require('./store-config');
const {createPaymentService} = require('./checkout-payment');
const {createCustomerOrders} = require('./customer-orders');
const {createCustomerReorder} = require('./customer-reorder');
const {quoteFreight} = require('./freight-core');
const {storeFixtures} = require('./fixtures/stores-v1.cjs');
test('Firestore + HTTP: loja futura, isolamento, readiness independente e aliases por dados',async()=>{
  assert.equal(process.env.GCLOUD_PROJECT,'demo-doceria-checkout');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');
  const instance=admin.initializeApp({projectId:'demo-doceria-checkout'},'store-v1-tests'),db=instance.firestore();
  const {getStoreAvailability}=await import('../crm/public/store-availability.mjs');
  const getAvailability=c=>getStoreAvailability(c,new Date('2026-10-15T15:00:00Z'));
  const payment=createPaymentService({db,provider:{create:()=>{throw Error('NO_PAYMENT');},check:()=>{throw Error('NO_PAYMENT');}}});
  const resolver=createStoreResolver({db,getAvailability,loadPaymentConfig:payment.config});
  const fixtures=storeFixtures(),batch=db.batch();for(const [path,data] of fixtures) batch.set(db.doc(path),data);await batch.commit();
  await db.doc('clientes/store-v1-a').set({authOwnerUid:'store-v1-owner-a'});
  await db.doc('clientes/store-v1-b').set({authOwnerUid:'store-v1-owner-b'});
  await db.doc('lojas/loja-futura-teste/pedidos/store-v1-order').set({clienteId:'store-v1-a',ownerUid:'store-v1-owner-a',total:1,
    createdAt:admin.firestore.Timestamp.now(),itens:[{produtoId:'p1',preco:1,quantity:1}],order_status:'CONFIRMED',payment_status:'PAID'});
  const history=createCustomerOrders({db,resolve:async request=>({user:{uid:request.auth.uid},customerId:request.auth.uid==='store-v1-owner-a'?'store-v1-a':'store-v1-b'})});
  const reorder=createCustomerReorder({db,readOrder:history.detail,getStoreAvailability:getAvailability,resolveStore:resolver.resolve});
  const app=express();app.use(express.json());mountStoreRoutes(app,resolver);
  app.get('/produtos',async(req,res)=>{const snap=await db.collection(`lojas/${req.query.lojaId}/produtos`).get();res.json(snap.docs.map(d=>({id:d.id,preco:d.data().preco})));});
  app.post('/frete/calcular',async(req,res)=>{const result=await resolver.resolve(req.query.lojaId);res.json(quoteFreight({config:result.freight,distanceKm:2}));});
  app.post('/checkout/confirmar',(req,res)=>res.json({allowed:true})); // No order, reservation or provider side effects.
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base=`http://127.0.0.1:${server.address().port}`;
  const get=async(path)=>{const r=await fetch(base+path);return {status:r.status,data:await r.json()};};
  const post=async(store,body)=>{const r=await fetch(`${base}/checkout/confirmar?lojaId=${store}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  try {
    await db.doc('users/store-v1-owner').set({role:'dono',ativo:true});
    const handlers=require('./index');
    const draft=await handlers.createStore.run({auth:{uid:'store-v1-owner'},data:{storeId:'v1-created-draft',nome:'Draft fixture'}});
    assert.equal(draft.storeId,'v1-created-draft');
    const created=(await db.doc('lojas/v1-created-draft').get()).data();assert.equal(created.ativo,false);assert.equal(created.status,'DRAFT');
    assert.equal((await db.doc('lojas/v1-created-draft/configuracoes/config').get()).data().frete,undefined);
    assert.ok(Object.values((await resolver.publicConfig({storeId:'v1-created-draft'})).readiness).every(value=>value==='BLOCKED'));
    const c=await get('/store/public-config?storeId=loja-futura-teste');assert.equal(c.status,200);assert.equal(c.data.readiness.payment,'READY');
    assert.doesNotMatch(JSON.stringify(c),/PRIVATE|secret|handle|criadoPor|updatedBy/);
    assert.equal((await get('/produtos?lojaId=loja-futura-teste')).data[0].preco,7);
    assert.equal((await post('loja-futura-teste',{cliente:{endereco:'Retirar na Loja'}})).status,200);
    assert.equal((await post('loja-futura-sem-frete',{cliente:{endereco:'Retirar na Loja'}})).status,200);
    assert.equal((await post('loja-futura-sem-frete',{cliente:{endereco:'Entrega'}})).data.code,'DELIVERY_UNAVAILABLE');
    assert.equal((await post('loja-futura-sem-pagamento',{cliente:{endereco:'Retirar na Loja'},pagamento:{forma:'Online'}})).data.code,'PAYMENT_UNAVAILABLE');
    assert.equal((await get('/checkout/config?lojaId=loja-futura-sem-pagamento')).data.enabled,false);
    assert.equal((await get('/produtos?lojaId=missing')).data.code,'STORE_NOT_FOUND');
    assert.equal((await post('loja-inativa',{cliente:{endereco:'Retirar na Loja'}})).data.code,'STORE_INACTIVE');
    const variant=await fetch(`${base}/CHECKOUT/confirmar/?lojaId=loja-inativa`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cliente:{endereco:'Retirar na Loja'}})});
    assert.equal((await variant.json()).code,'STORE_INACTIVE');
    const req={auth:{uid:'store-v1-owner-a'},data:{storeId:'loja-futura-teste',orderId:'store-v1-order'}};
    assert.equal((await history.detail(req)).order.storeId,'loja-futura-teste');
    assert.equal((await reorder(req)).products[0].preco,7);
    await assert.rejects(history.detail({...req,auth:{uid:'store-v1-owner-b'}}),e=>e.code==='not-found');
    const fest=await get('/store/public-config?alias=cardapio-festa');assert.equal(fest.data.channel.id,'festas');assert.equal(fest.data.storeId,'ana-guimaraes-doceria-matriz');
    const list=await get('/store/public-list');assert.ok(list.data.stores.some(s=>s.storeId==='loja-futura-teste'));
    const response=await fetch(`${base}/frete/calcular?lojaId=loja-futura-teste`,{method:'POST'});assert.equal((await response.json()).valorFrete,6);
    assert.equal((await db.doc('lojas/loja-futura-teste/produtos/p1').get()).data().estoque,2);
    await db.doc('lojas/loja-futura-teste/configuracoes/config').update({'frete.valorMinimoFrete':admin.firestore.FieldValue.delete()});
    assert.equal((await post('loja-futura-teste',{cliente:{endereco:'Entrega'}})).data.code,'DELIVERY_UNAVAILABLE');
  } finally {await new Promise(resolve=>server.close(resolve));await instance.delete();if(admin.apps.some(a=>a.name==='[DEFAULT]')) await admin.app().delete();}
});
