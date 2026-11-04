const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {test}=require('node:test');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,collection,getDoc,getDocs,setDoc,updateDoc}=require('firebase/firestore');
const rules=fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8');
async function environment(projectId,source=rules){
 const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules:source}});
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  for(const [id,profile] of Object.entries({owner:{role:'dono'},manager:{role:'gerente',lojaIds:['boundary-a']},attendant:{role:'atendente',lojaId:'boundary-a'},legacyStores:{role:'gerente',lojas:['boundary-a']},legacyArray:{role:'gerente',lojaId:['boundary-a']},unassigned:{role:'gerente'},inactive:{role:'gerente',lojaIds:['boundary-a'],ativo:false},boundedOwner:{role:'dono',lojaIds:['boundary-a']}}))await setDoc(doc(db,'users',id),profile);
  for(const store of ['boundary-a','boundary-b']) {
   await setDoc(doc(db,'lojas',store),{nome:'Synthetic store'});
   await setDoc(doc(db,'lojas',store,'pedidos','legacy'),{status:'Pendente',total:10});
   await setDoc(doc(db,'lojas',store,'pedidos','paid'),{status:'Pendente',total:10,paymentId:'fixture',payment_status:'PAID',order_status:'CONFIRMED',paymentMode:'ONLINE_NOW',paymentMethod:'PIX',formaPagamento:'Pix online'});
   await setDoc(doc(db,'lojas',store,'produtos','fixture'),{nome:'Fixture',preco:10});
   await setDoc(doc(db,'lojas',store,'configuracoes','config'),{public:true});
   await setDoc(doc(db,'lojas',store,'contas_a_receber','fixture'),{valor:10,status:'Pendente'});
  }
  for(const p of ['checkoutPayments/payment-fixture','checkoutPayments/_identity/contexts/context-fixture','checkoutReceipts/receipt-fixture','checkoutNotificationAttempts/attempt-fixture','integrations/paymentReconciliation/operations/fixture'])await setDoc(doc(db,p),{storeId:'boundary-b',private:true});
  await setDoc(doc(db,'pedidos/root-unknown'),{status:'Finalizado',total:10});
  await setDoc(doc(db,'pedidos/root-a'),{lojaId:'boundary-a',status:'Finalizado',total:10});
 });return env;
}
test('baseline proof: direct SDK bypassed HTTP store scope, raw payment privacy and provider method protection',async()=>{
 const before=cp.execFileSync('git',['show','43f8e0c0:firestore.rules'],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
 const env=await environment('demo-preprod-boundary-before',before);
 try {
  const staff=env.authenticatedContext('manager').firestore(),publicDb=env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(staff,'checkoutPayments/payment-fixture')));
  await assertSucceeds(getDoc(doc(staff,'lojas/boundary-b/pedidos/paid')));
  await assertSucceeds(updateDoc(doc(staff,'lojas/boundary-b/contas_a_receber/fixture'),{valor:999}));
  await assertSucceeds(updateDoc(doc(staff,'lojas/boundary-a/pedidos/paid'),{paymentMethod:'CASH'}));
  await assertSucceeds(setDoc(doc(publicDb,'pedidos/forged'),{status:'Finalizado',total:999}));
 }finally{await env.cleanup();}
});
test('hardened SDK: raw financial/context data stays server-only for all clients, including Owner',async()=>{
 const env=await environment('demo-preprod-boundary-private');
 try{for(const identity of [null,'customer','manager','owner']) {
  const db=(identity?env.authenticatedContext(identity):env.unauthenticatedContext()).firestore();
  for(const p of ['checkoutPayments/payment-fixture','checkoutPayments/_identity/contexts/context-fixture','checkoutReceipts/receipt-fixture','checkoutNotificationAttempts/attempt-fixture','integrations/paymentReconciliation/operations/fixture']){await assertFails(getDoc(doc(db,p)));await assertFails(setDoc(doc(db,p),{forged:true}));}
 }}finally{await env.cleanup();}
});
test('assigned Staff reads/writes only its stores; Owner without assignment retains general-view access',async()=>{
 const env=await environment('demo-preprod-boundary-stores');
 try {
  for(const uid of ['manager','attendant','legacyStores','legacyArray','boundedOwner']){
   const db=env.authenticatedContext(uid).firestore();
   await assertSucceeds(getDocs(collection(db,'lojas/boundary-a/pedidos')));
   await assertFails(getDoc(doc(db,'lojas/boundary-b/pedidos/paid')));
   await assertFails(getDocs(collection(db,'lojas/boundary-b/pedidos')));
   await assertSucceeds(updateDoc(doc(db,'lojas/boundary-a/contas_a_receber/fixture'),{valor:11}));
   await assertFails(updateDoc(doc(db,'lojas/boundary-b/contas_a_receber/fixture'),{valor:999}));
  }
  const owner=env.authenticatedContext('owner').firestore();
  await assertSucceeds(getDocs(collection(owner,'lojas/boundary-b/pedidos')));
  await assertSucceeds(updateDoc(doc(owner,'lojas/boundary-b/contas_a_receber/fixture'),{valor:12}));
  for(const uid of ['unassigned','inactive','customer'])await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(),'lojas/boundary-a/pedidos/paid')));
 }finally{await env.cleanup();}
});
test('paid order permits operational status but blocks forged payment method/status and adjustment metadata',async()=>{
 const env=await environment('demo-preprod-boundary-paid');
 try {
  const db=env.authenticatedContext('manager').firestore(),ref=doc(db,'lojas/boundary-a/pedidos/paid');
  await assertSucceeds(updateDoc(ref,{status:'Em Produção'}));
  for(const patch of [{paymentMethod:'CASH'},{paymentMode:'AGREED_LATER'},{paymentStatus:'PENDING'},{paymentMethodSource:'manual'},{adminPaymentAdjustment:{paidCents:1}},{ownerUid:'manager'},{total:1}])await assertFails(updateDoc(ref,patch));
 }finally{await env.cleanup();}
});
test('legacy root orders cannot be publicly injected or cross-store read; public catalog stays public',async()=>{
 const env=await environment('demo-preprod-boundary-public');
 try {
  const publicDb=env.unauthenticatedContext().firestore(),manager=env.authenticatedContext('manager').firestore(),owner=env.authenticatedContext('owner').firestore();
  await assertFails(setDoc(doc(publicDb,'pedidos/forged'),{status:'Finalizado',total:999}));
  await assertFails(getDoc(doc(manager,'pedidos/root-unknown')));await assertSucceeds(getDoc(doc(manager,'pedidos/root-a')));
  await assertFails(updateDoc(doc(manager,'pedidos/root-a'),{lojaId:'boundary-b'}));
  await assertSucceeds(getDoc(doc(owner,'pedidos/root-unknown')));
  await assertSucceeds(getDocs(collection(publicDb,'lojas/boundary-b/produtos')));
  await assertSucceeds(getDoc(doc(publicDb,'lojas/boundary-b/configuracoes/config')));
 }finally{await env.cleanup();}
});
