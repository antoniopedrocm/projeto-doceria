process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const {test}=require('node:test'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc,getDoc,runTransaction,serverTimestamp}=require('firebase/firestore');
test('Rules publicadas recusam reprecificação antiga e aceitam novo status isolado sem mutação financeira',async()=>{
 const {saveOnlineOrderStatus}=await import('../crm/src/utils/onlineOrderStatus.mjs');
 const env=await initializeTestEnvironment({projectId:'demo-doceria-checkout',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
 const p='lojas/status-rule-store/pedidos/paid',order={lojaId:'status-rule-store',status:'Pendente',paymentId:'payment-fixture',payment_status:'PAID',order_status:'CONFIRMED',requiresReview:false,paymentMode:'ONLINE_NOW',paymentMethod:'PIX',total:1,itens:[{id:'fixture',preco:1,quantity:1}]};
 try {
  await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await setDoc(doc(db,'users/status-staff'),{role:'dono',ativo:true});await setDoc(doc(db,'users/status-accountant'),{role:'contador',ativo:true});await setDoc(doc(db,p),order);});
  const staff=env.authenticatedContext('status-staff').firestore();
  // The old modal hydrated live catalogue fields even when only status was changed.
  await assertFails(updateDoc(doc(staff,p),{status:'Finalizado',itens:[{...order.itens[0],estoque:5,produtoId:'fixture'}]}));
  await assertSucceeds(saveOnlineOrderStatus({db:staff,runTransaction,orderRef:doc(staff,p),logRef:doc(staff,'lojas/status-rule-store/logs/status-audit'),storeId:'status-rule-store',status:'Finalizado',expectedStatus:'Pendente',adminUid:'status-staff',timestamp:serverTimestamp}));
  const saved=(await getDoc(doc(staff,p))).data();assert.equal(saved.status,'Finalizado');
  for(const key of Object.keys(order).filter(k=>k!=='status'))assert.deepEqual(saved[key],order[key]);
  await assertFails(updateDoc(doc(staff,p),{payment_status:'PENDING'}));await assertFails(updateDoc(doc(staff,p),{order_status:'DELIVERED'}));await assertFails(updateDoc(doc(staff,p),{total:0}));
  for(const db of [env.unauthenticatedContext().firestore(),env.authenticatedContext('customer-only').firestore(),env.authenticatedContext('status-accountant').firestore()])await assertFails(updateDoc(doc(db,p),{status:'Pendente'}));
 } finally {await env.cleanup();}
});
