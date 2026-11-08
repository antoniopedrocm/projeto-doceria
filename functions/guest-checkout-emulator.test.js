process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.GCLOUD_PROJECT='demo-doceria-checkout';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const admin=require('firebase-admin');
const {createCheckoutIdentity}=require('./checkout-identity');
const {createPaymentService}=require('./checkout-payment');
const app=admin.initializeApp({projectId:'demo-doceria-checkout'},'guest-checkout-tests'),db=app.firestore();
after(()=>app.delete());
test('guest link creation requires exact server-issued context, revision and store, not ambient UID or Customer ID',async()=>{
 let calls=0;
 const identities=createCheckoutIdentity({db}),now=Date.now();
 const context=await identities.select({storeId:'guest-guard-store',mode:'guest'});
 const other=await identities.select({storeId:'guest-guard-store',mode:'guest'});
 const id=crypto.randomBytes(32).toString('hex'),ref=db.doc('checkoutPayments/'+id);
 const seed={storeId:'guest-guard-store',orderId:id,orderPath:'lojas/guest-guard-store/pedidos/'+id,ownerUid:null,
  payment_status:'PENDING',amount:1000,handle:'merchant-guest',redirectUrl:'https://example.invalid/return',webhookUrl:'https://example.invalid/webhook',
  checkoutIdentity:{mode:'guest',contextPath:identities.ref(context.token).path,revision:context.revision,customerId:null}};
 await ref.set(seed);
 const service=createPaymentService({db,admin,now:()=>now,provider:{create:async()=>{calls++;return {url:'https://buy.infinitepay.io/guest-fixture'};}}});
 const proof={token:context.token,revision:context.revision};
 for(const invalid of [null,{}, {...proof,token:other.token},{...proof,revision:context.revision+1}])await assert.rejects(()=>service.start(id,'ambient-staff-uid',invalid));
 for(const extra of [{storeId:'foreign-store'},{checkoutIdentity:{...seed.checkoutIdentity,customerId:'victim'}}]){
  await ref.set({...seed,...extra});await assert.rejects(()=>service.start(id,null,proof));
 }
 await ref.set(seed);await identities.ref(context.token).update({expiresAt:now-1});await assert.rejects(()=>service.start(id,null,proof));
 await identities.ref(context.token).update({expiresAt:now+60000});assert.equal(calls,0);
 await assert.rejects(()=>service.start(id,null,proof),e=>e.httpStatus===403 && e.code==='GUEST_PIX_ONLY_UNAVAILABLE');
 assert.equal(calls,0);assert.deepEqual((await ref.get()).data(),seed);
 // Pre-existing links remain readable/reusable; no new provider call is made.
 await ref.update({checkoutUrl:'https://buy.infinitepay.io/guest-historical-fixture',linkState:'READY'});
 const result=await service.start(id,null,proof);assert.equal(result.checkoutUrl,'https://buy.infinitepay.io/guest-historical-fixture');assert.equal(calls,0);
 assert.equal((await service.start(id,null,proof)).paymentId,id);assert.equal(calls,0);
 await identities.select({storeId:'guest-guard-store',mode:'legacy_phone',token:context.token});
 await assert.rejects(()=>service.start(id,null,proof),e=>e.httpStatus===403);assert.equal(calls,0);
});
test('guest unissued link is denied repeatedly without mutating its prior pending reservation',async()=>{
 const identities=createCheckoutIdentity({db}),context=await identities.select({storeId:'guest-error-store',mode:'guest'});
 const id=crypto.randomBytes(32).toString('hex'),ref=db.doc('checkoutPayments/'+id);let calls=0;
 await ref.set({storeId:'guest-error-store',orderId:id,orderPath:'lojas/guest-error-store/pedidos/'+id,ownerUid:null,payment_status:'PENDING',amount:1000,
  handle:'merchant-error',redirectUrl:'https://example.invalid/return',webhookUrl:'https://example.invalid/webhook',reservation:{state:'HELD',stock:[]},
  checkoutIdentity:{mode:'guest',contextPath:identities.ref(context.token).path,revision:context.revision,customerId:null}});
 const service=createPaymentService({db,admin,provider:{create:async()=>{calls++;throw Error('synthetic provider timeout');}}}),proof={token:context.token,revision:context.revision};
 await assert.rejects(()=>service.start(id,null,proof));await assert.rejects(()=>service.start(id,null,proof));
 const payment=(await ref.get()).data();assert.equal(payment.payment_status,'PENDING');assert.equal(payment.reservation.state,'HELD');
 assert.equal(payment.linkState,undefined);assert.equal(calls,0);
});
