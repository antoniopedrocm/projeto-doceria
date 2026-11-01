process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.GCLOUD_PROJECT='demo-doceria-checkout';
const {test,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),admin=require('firebase-admin');
const {createPaymentService}=require('./checkout-payment');
const {inspectPaymentSignal}=require('./payment-signal-policy');
const app=admin.initializeApp({projectId:'demo-doceria-checkout'},'financial-events-v1'),db=app.firestore();after(()=>app.delete());
const read=async ref=>(await ref.get()).data();
async function fixture(name){
 const id=crypto.createHash('sha256').update('events:'+name).digest('hex'),storeId='events-store-'+name;
 const order=db.doc(`lojas/${storeId}/pedidos/${id}`),product=db.doc(`lojas/${storeId}/produtos/doce`),coupon=db.doc(`lojas/${storeId}/cupons/fixture`),customer=db.doc('clientes/events-'+name),payment=db.doc('checkoutPayments/'+id);
 await Promise.all([
  product.set({estoque:8}),coupon.set({reservados:1,usos:0}),customer.set({cuponsReservados:['TESTE'],cuponsUsados:[]}),
  order.set({lojaId:storeId,paymentId:id,ownerUid:'owner-fixture',total:10,order_status:'PENDING',payment_status:'PENDING',status:'Aguardando pagamento'}),
  payment.set({orderId:id,orderPath:order.path,storeId,ownerUid:'owner-fixture',handle:'merchant-fixture',amount:1000,payment_status:'PENDING',expiresAt:admin.firestore.Timestamp.fromMillis(Date.now()+600000),reservation:{state:'HELD',stock:[{path:product.path,quantity:2}],couponPath:coupon.path,couponCode:'TESTE',customerPath:customer.path}}),
 ]);
 let result={success:true,paid:true,amount:1000,paid_amount:1000,capture_method:'pix'},checks=0;
 const service=createPaymentService({db,admin,provider:{check:async input=>{checks++;assert.equal(input.handle,'merchant-fixture');assert.equal(input.order_nsu,id);return result;}},auditSignal:async()=>{}});
 const refs={order_nsu:id,transaction_nsu:'transaction-'+name,slug:'invoice-'+name};
 const event=event_type=>({...refs,event_type,invoice_type:'checkout'});
 const register=(type='REFUND_EXPECTED',extra={})=>service.financialEvents.register({storeId,paymentId:id,type,transactionNsu:refs.transaction_nsu,slug:refs.slug,executionConfirmed:true,executionReference:'external-execution-fixture',requestId:'fixture-request-'+name,...extra},{uid:'staff-a',role:'dono'});
 const root=db.doc('integrations/paymentReconciliation');
 return {id,storeId,order,product,coupon,customer,payment,service,refs,event,register,setResult:r=>{result=r;},checks:()=>checks,
  eventRef:type=>root.collection('stores').doc(storeId).collection('events').doc(inspectPaymentSignal(event(type)).fingerprint),
  receipts:()=>db.collection('checkoutReceipts').where('paymentId','==',id).get(),ledger:()=>root.collection('ledger').where('paymentId','==',id).get()};
}
test('formal event_type paid: duplicates/concurrency confirm once, consume coupon once and preserve one receipt',async()=>{
 const f=await fixture('paid');await Promise.all(Array.from({length:6},()=>f.service.reconcile(f.event('paid'))));
 assert.equal((await read(f.payment)).payment_status,'PAID');assert.equal((await read(f.payment)).reservation.state,'CONSUMED');
 assert.equal((await read(f.order)).order_status,'CONFIRMED');assert.equal((await read(f.product)).estoque,8);
 assert.deepEqual(await read(f.coupon),{reservados:0,usos:1});assert.deepEqual((await read(f.customer)).cuponsUsados,['TESTE']);
 assert.equal((await f.receipts()).size,1);assert.equal((await f.ledger()).size,0);assert.equal((await read(f.eventRef('paid'))).disposition,'APPROVAL_VERIFIED');
});
test('false paid, wrong amount, unknown order and conflicting event cannot establish approval',async()=>{
 const f=await fixture('false');f.setResult({success:true,paid:false});await assert.rejects(()=>f.service.reconcile(f.event('paid')));
 assert.equal((await read(f.payment)).payment_status,'PENDING');assert.equal((await f.receipts()).size,0);
 f.setResult({success:true,paid:true,amount:999,paid_amount:999,capture_method:'pix'});const mismatch=await f.service.reconcile(f.event('paid'));
 assert.equal(mismatch.requiresReview,true);assert.equal((await read(f.payment)).payment_status,'PENDING');assert.equal((await read(f.coupon)).usos,0);
 await assert.rejects(()=>f.service.reconcile({...f.event('paid'),order_nsu:'0'.repeat(64)}),{httpStatus:404});
 const prior=f.checks();assert.equal((await f.service.reconcile({...f.event('paid'),status:'refunded'})).eventDisposition,'UNVERIFIED');assert.equal(f.checks(),prior);
});
test('failed attempt checked paid:false preserves PENDING/HELD; later paid succeeds; old failure cannot regress PAID',async()=>{
 const f=await fixture('failed');f.setResult({success:true,paid:false});assert.equal((await f.service.reconcile(f.event('payment_failed'))).eventDisposition,'FAILED_ATTEMPT_CHECKED');
 assert.equal((await read(f.payment)).payment_status,'PENDING');assert.equal((await read(f.payment)).reservation.state,'HELD');
 f.setResult({success:true,paid:true,amount:1000,paid_amount:1000,capture_method:'credit_card'});await f.service.reconcile(f.event('paid'));
 f.setResult({success:true,paid:false});await f.service.reconcile(f.event('payment_failed'));
 assert.equal((await read(f.payment)).payment_status,'PAID');assert.equal((await read(f.coupon)).usos,1);
});
test('settled before paid and created are informational; fingerprint distinguishes paid/settled/refund for same transaction',async()=>{
 const f=await fixture('out-of-order');await f.service.reconcile(f.event('settled'));await f.service.reconcile(f.event('created'));
 assert.equal(f.checks(),0);assert.equal((await read(f.payment)).payment_status,'PENDING');assert.equal((await read(f.coupon)).reservados,1);
 await f.service.reconcile(f.event('paid'));await f.service.reconcile(f.event('settled'));
 assert.notEqual(f.eventRef('paid').id,f.eventRef('settled').id);assert.notEqual(f.eventRef('paid').id,f.eventRef('refunded').id);
 assert.equal((await read(f.payment)).payment_status,'PAID');assert.equal((await f.receipts()).size,1);assert.equal((await read(f.product)).estoque,8);
});
test('unexpected refunded/canceled become PENDING_RECONCILIATION without financial, stock, coupon or receipt mutation',async()=>{
 const f=await fixture('unexpected'),before=await read(f.payment),order=await read(f.order);
 for(const type of ['refunded','canceled']){const result=await f.service.reconcile(f.event(type));assert.equal(result.eventDisposition,'PENDING_RECONCILIATION');await f.service.reconcile(f.event(type));}
 assert.deepEqual(await read(f.payment),before);assert.deepEqual(await read(f.order),order);assert.equal((await f.receipts()).size,0);assert.equal((await f.ledger()).size,0);assert.equal((await read(f.coupon)).reservados,1);
});
test('refund matches only a Staff-recorded completed external operation; append-only notification, one match/ledger/audit under concurrency',async()=>{
 const f=await fixture('refund');await f.service.reconcile(f.event('paid'));
 await f.service.reconcile(f.event('refunded'));const before=await read(f.eventRef('refunded'));
 const op=await f.register();const retry=await f.register();assert.equal(retry.duplicate,true);assert.equal(retry.operationId,op.operationId);
 await Promise.all(Array.from({length:6},()=>f.service.financialEvents.reconcileEvent(f.storeId,f.eventRef('refunded').id)));
 assert.deepEqual(await read(f.eventRef('refunded')),before);assert.equal((await read(f.payment)).payment_status,'REFUNDED');
 assert.equal((await read(f.order)).order_status,'CONFIRMED');assert.equal((await read(f.product)).estoque,8);assert.equal((await read(f.coupon)).usos,1);
 assert.equal((await f.ledger()).size,1);assert.equal((await f.receipts()).size,1);
 await f.service.reconcile(f.event('paid'));assert.equal((await read(f.payment)).payment_status,'REFUNDED');
 assert.equal((await f.service.financialEvents.list(f.storeId)).events.find(e=>e.eventType==='refunded').disposition,'MATCHED_EXPECTED_OPERATION');
 await assert.rejects(()=>f.service.financialEvents.reconcileEvent('foreign-store',f.eventRef('refunded').id),{httpStatus:404});
});
test('cancellation needs paid:false and completed external execution; release held stock/coupon once without refunding consumed stock',async()=>{
 const f=await fixture('cancel');f.setResult({success:true,paid:false});await f.register('CANCEL_EXPECTED');
 await Promise.all(Array.from({length:4},()=>f.service.reconcile(f.event('canceled'))));
 assert.equal((await read(f.payment)).payment_status,'CANCELLED');assert.equal((await read(f.payment)).reservation.state,'RELEASED');assert.equal((await read(f.product)).estoque,10);
 assert.deepEqual(await read(f.coupon),{reservados:0,usos:0});assert.equal((await f.ledger()).size,1);assert.equal((await f.receipts()).size,0);
});
test('mere intent, wrong transaction/store/type and an unsigned POST never become refund authority',async()=>{
 const f=await fixture('intent');await f.service.reconcile(f.event('paid'));
 for(const extra of [{executionConfirmed:false},{type:'UNKNOWN'},{storeId:'foreign-store'},{transactionNsu:'foreign-transaction'}])await assert.rejects(()=>f.register('REFUND_EXPECTED',extra));
 await f.service.reconcile(f.event('refunded'));assert.equal((await read(f.payment)).payment_status,'PAID');assert.equal((await f.ledger()).size,0);
 const paid=await read(f.payment);f.setResult({success:true,paid:false});await f.service.reconcile(f.event('payment_failed'));assert.deepEqual(await read(f.payment),paid);
});
test('forged POST sequence with paid:false cannot pay, cancel, refund, consume stock/coupon or create ledger',async()=>{
 const f=await fixture('forged');f.setResult({success:true,paid:false});const payment=await read(f.payment),order=await read(f.order);
 for(const type of ['created','payment_failed','settled','canceled','refunded'])await f.service.reconcile({...f.event(type),paid:true,amount:1,handle:'forged'});
 await assert.rejects(()=>f.service.reconcile({...f.event('paid'),paid:true}));
 assert.deepEqual(await read(f.payment),payment);assert.deepEqual(await read(f.order),order);assert.equal((await read(f.product)).estoque,8);assert.deepEqual(await read(f.coupon),{reservados:1,usos:0});assert.equal((await f.receipts()).size,0);assert.equal((await f.ledger()).size,0);
});
test('manual dismissal records a scoped append-only review, never edits the event or payment; lookup omits private merchant/Customer data',async()=>{
 const f=await fixture('dismiss');await f.service.reconcile(f.event('refunded'));const eventBefore=await read(f.eventRef('refunded')),paymentBefore=await read(f.payment);
 const actor={uid:'staff-b',role:'gerente'},id=f.eventRef('refunded').id;
 await assert.rejects(()=>f.service.financialEvents.dismiss('foreign-store',id,'Sem execução identificada',actor),{httpStatus:404});
 await assert.rejects(()=>f.service.financialEvents.dismiss(f.storeId,id,'curto',actor),{httpStatus:400});
 await f.service.financialEvents.dismiss(f.storeId,id,'Notificação sem execução externa comprovada',actor);
 await f.service.financialEvents.dismiss(f.storeId,id,'Repetição idempotente da decisão',actor);
 assert.deepEqual(await read(f.eventRef('refunded')),eventBefore);assert.deepEqual(await read(f.payment),paymentBefore);
 assert.equal((await f.service.financialEvents.list(f.storeId)).events[0].disposition,'DISMISSED_UNVERIFIED');
 const lookup=await f.service.financialEvents.lookup(f.storeId,f.id);assert.equal(lookup.payment.handle,undefined);assert.equal(lookup.payment.customer,undefined);assert.equal(lookup.payment.ownerUid,undefined);
});
test('notification quota rejects distinct unsigned noise but permits a compatible recorded refund and duplicate delivery',async()=>{
 const f=await fixture('quota');await f.service.reconcile(f.event('paid'));
 await db.doc('integrations/paymentReconciliation/eventWriteLimits/'+f.id).set({windowAt:Date.now(),count:100});
 await assert.rejects(()=>f.service.reconcile(f.event('settled')),{httpStatus:503});
 assert.equal((await read(f.payment)).payment_status,'PAID');assert.equal((await f.eventRef('settled').get()).exists,false);
 await f.register();await f.service.reconcile(f.event('refunded'));await f.service.reconcile(f.event('refunded'));
 assert.equal((await read(f.payment)).payment_status,'REFUNDED');assert.equal((await f.ledger()).size,1);
 assert.equal((await read(f.coupon)).usos,1);assert.equal((await f.receipts()).size,1);
});
