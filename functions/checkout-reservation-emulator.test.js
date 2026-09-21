// Real Firestore transactions, confined to a local demo project.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.GCLOUD_PROJECT='demo-doceria-checkout';
const {test,after} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const admin = require('firebase-admin');
const {createPaymentService} = require('./checkout-payment');
const {initializeTestEnvironment,assertFails,assertSucceeds} = require('@firebase/rules-unit-testing');
const {doc,updateDoc,setDoc,deleteDoc} = require('firebase/firestore');
const fs=require('node:fs');
const path=require('node:path');
const app = admin.initializeApp({projectId:'demo-doceria-checkout'},'reservation-tests');
const db = app.firestore();
after(() => app.delete());
async function fixture(name, expired=false) {
  const id=crypto.createHash('sha256').update(name).digest('hex');
  const payment=db.doc(`checkoutPayments/${id}`);
  const order=db.doc(`lojas/reservation-tests/pedidos/${id}`);
  const product=db.doc(`lojas/reservation-tests/produtos/${id}`);
  const coupon=db.doc(`lojas/reservation-tests/cupons/${id}`);
  const customer=db.doc(`clientes/reservation-${id}`);
  const deadline=Date.now()+60000;
  await Promise.all([
    product.set({estoque:8}),coupon.set({usos:2,reservados:1}),
    customer.set({cuponsReservados:['TEST'],cuponsUsados:[]}),
    order.set({total:10,payment_status:'PENDING',order_status:'PENDING'}),
    payment.set({ownerUid:'owner',orderId:id,orderPath:order.path,amount:1000,handle:'test-store',payment_status:'PENDING',
      expiresAt:admin.firestore.Timestamp.fromMillis(deadline),
      reservation:{state:'HELD',stock:[{path:product.path,quantity:2}],couponPath:coupon.path,customerPath:customer.path,couponCode:'TEST'}}),
  ]);
  const service=createPaymentService({db,admin,now:()=>expired?deadline+1:deadline-1,
    provider:{check:async()=>({success:true,paid:true,amount:1000,paid_amount:1000,capture_method:'pix'})}});
  return {id,payment,order,product,coupon,customer,service,payload:{order_nsu:id,transaction_nsu:name,slug:name}};
}
const data=async ref=>(await ref.get()).data();
test('expirações concorrentes devolvem estoque/cupom exatamente uma vez',async()=>{
  const f=await fixture('expiry',true);
  const outcomes=await Promise.all([f.service.expire(f.id),f.service.expire(f.id),f.service.expire(f.id)]);
  assert.equal(outcomes.filter(Boolean).length,1);
  assert.equal((await data(f.product)).estoque,10);
  assert.deepEqual(await data(f.coupon),{usos:2,reservados:0});
  assert.deepEqual((await data(f.customer)).cuponsReservados,[]);
  assert.deepEqual((await data(f.customer)).cuponsUsados,[]);
  assert.equal((await data(f.order)).order_status,'CANCELLED');
  assert.equal((await f.service.status(f.id,'owner')).checkoutUrl,null);
  await assert.rejects(()=>f.service.start(f.id,'owner'));
});
test('webhooks concorrentes consomem cupom uma vez e impedem posterior liberação',async()=>{
  const f=await fixture('paid');
  await Promise.all([f.service.reconcile(f.payload),f.service.reconcile(f.payload)]);
  assert.equal(await f.service.expire(f.id),false);
  assert.equal((await data(f.product)).estoque,8);
  assert.deepEqual(await data(f.coupon),{usos:3,reservados:0});
  assert.deepEqual((await data(f.customer)).cuponsUsados,['TEST']);
  assert.deepEqual((await data(f.customer)).cuponsReservados,[]);
  assert.equal((await data(f.payment)).reservation.state,'CONSUMED');
  assert.equal((await data(f.order)).order_status,'CONFIRMED');
});
test('pagamento tardio e expiração concorrentes registram PAID sem confirmar pedido nem consumir cupom',async()=>{
  const f=await fixture('late-race',true);
  await Promise.all([f.service.reconcile(f.payload),f.service.expire(f.id)]);
  await f.service.reconcile(f.payload);
  assert.equal((await data(f.product)).estoque,10);
  assert.deepEqual(await data(f.coupon),{usos:2,reservados:0});
  assert.equal((await data(f.order)).order_status,'CANCELLED');
  const state=await f.service.status(f.id,'owner');
  assert.equal(state.payment_status,'PAID');assert.equal(state.requiresReview,true);
});
test('pagamento após reserva já liberada não debita novamente o estoque',async()=>{
  const f=await fixture('late-after',true);
  await f.service.expire(f.id);await f.service.reconcile(f.payload);
  assert.equal((await data(f.product)).estoque,10);
  assert.equal((await data(f.payment)).requiresReview,true);
});
test('reserva válida não expira e expiração ignora rascunhos antigos sem metadados',async()=>{
  const f=await fixture('not-due');
  assert.equal(await f.service.expire(f.id),false);
  await f.payment.update({reservation:admin.firestore.FieldValue.delete()});
  assert.equal(await f.service.expire(f.id),false);
  assert.equal((await data(f.product)).estoque,8);
});
test('status operacional acompanha CRM e cancelamento pago exige revisão sem fingir estorno',async()=>{
  const f=await fixture('operations');
  await f.order.update({paymentId:f.id});await f.service.reconcile(f.payload);
  for(const [status,expected] of [['Em Produção','PREPARING'],['Pronto para Entrega','READY'],['Finalizado','DELIVERED'],['Cancelado','CANCELLED']]) {
    await f.order.update({status});await f.service.syncOrderStatus(f.order.path);
    assert.equal((await data(f.order)).order_status,expected);
    assert.equal((await data(f.payment)).payment_status,'PAID');
  }
  assert.equal((await data(f.payment)).requiresReview,true);
  assert.equal((await data(f.product)).estoque,8);
});
test('varredura libera reservas vencidas, preserva válidas e reporta erros isolados',async()=>{
  const due=await fixture('scheduled',true);
  const valid=await fixture('scheduled-valid');
  await due.payment.update({expiresAt:admin.firestore.Timestamp.fromMillis(1)});
  const results=await createPaymentService({db,admin}).expireDue();
  assert.equal(results.find(r=>r.id===due.id)?.expired,true);
  assert.equal((await data(valid.payment)).reservation.state,'HELD');
});
test('recurso removido bloqueia liberação parcial e preserva reserva para investigação',async()=>{
  const f=await fixture('missing-stock',true);
  await f.product.delete();await assert.rejects(()=>f.service.expire(f.id));
  assert.equal((await data(f.payment)).reservation.state,'HELD');
  assert.deepEqual(await data(f.coupon),{usos:2,reservados:1});
  assert.equal((await data(f.order)).order_status,'PENDING');
});
test('Rules impedem equipe de forjar pagamento ou liberar pedido pendente e mantêm status legado',async()=>{
  const env=await initializeTestEnvironment({projectId:'demo-doceria-checkout',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
  try {
    await db.doc('users/reservation-staff').set({role:'gerente',ativo:true});
    const staff=env.authenticatedContext('reservation-staff').firestore();
    const f=await fixture('rules');
    await f.order.update({paymentId:f.id});
    await assertFails(updateDoc(doc(staff,f.payment.path),{payment_status:'PAID'}));
    await assertFails(setDoc(doc(staff,'checkoutReceipts/forged'),{paymentId:f.id}));
    await assertFails(updateDoc(doc(staff,f.order.path),{payment_status:'PAID',order_status:'CONFIRMED'}));
    await assertFails(updateDoc(doc(staff,f.order.path),{status:'Finalizado'}));
    await assertFails(deleteDoc(doc(staff,f.order.path)));
    await f.service.reconcile(f.payload);
    await assertSucceeds(updateDoc(doc(staff,f.order.path),{status:'Finalizado'}));
    await assertSucceeds(updateDoc(doc(staff,f.order.path),{approvedForInvoice:true}));
    await assertFails(updateDoc(doc(staff,f.order.path),{total:1}));
    await db.doc('lojas/reservation-tests/pedidos/offline').set({status:'Pendente',total:10});
    await assertSucceeds(updateDoc(doc(staff,'lojas/reservation-tests/pedidos/offline'),{status:'Finalizado'}));
  } finally {await env.cleanup();}
});
