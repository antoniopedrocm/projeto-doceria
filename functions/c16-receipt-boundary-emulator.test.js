// Synthetic demo project only. BEFORE mode records the original exploit.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const {test,before,after}=require('node:test'),fs=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc,deleteDoc,deleteField}=require('firebase/firestore');
let env;const original=process.env.C16_BEFORE==='1';
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-c16-receipt',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(process.env.C16_RULES || '../firestore.rules','utf8')}});await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await setDoc(doc(db,'users/staff'),{role:'atendente',ativo:true,lojaIds:['matriz'],permissions:{pedidos:true,financeiro:false}});await setDoc(doc(db,'lojas/matriz'),{ativo:true});});});
after(async()=>env?.cleanup());
const receipt={amountCents:100,actorUid:'forged',method:'PIX'};
const protectedFields={manualPaymentReceipt:receipt,paymentStatus:'PAID',statusPagamento:'PAID',paidAt:123,adminRevision:99,adminPaymentAdjustment:{paidCents:100},financialOperationId:'forged',paymentMethodSource:'provider/infinitepay'};
for(const prefix of ['lojas/matriz/pedidos','pedidos']) {
 test(prefix+' legitimate offline creation',async()=>{await assertSucceeds(setDoc(doc(env.authenticatedContext('staff').firestore(),prefix+'/legit'),{lojaId:'matriz',clienteId:'c',status:'Pendente',total:1}));});
 for(const [field,value] of Object.entries(protectedFields))test(prefix+' blocks SDK create/update '+field,async()=>{
 const db=env.authenticatedContext('staff').firestore(),ref=doc(db,prefix+'/'+field);const check=original?assertSucceeds:assertFails;
 await check(setDoc(ref,{lojaId:'matriz',status:'Finalizado',total:1,[field]:value}));
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),prefix+'/'+field),{lojaId:'matriz',status:'Finalizado',total:1}));await check(updateDoc(ref,{[field]:value}));
 });
 test(prefix+' receipt and financial identity cannot be removed/changed/deleted',async()=>{
 const ref=doc(env.authenticatedContext('staff').firestore(),prefix+'/receipted');await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),prefix+'/receipted'),{lojaId:'matriz',clienteId:'c',status:'Finalizado',total:1,paymentStatus:'PAID',manualPaymentReceipt:receipt}));
 const check=original?assertSucceeds:assertFails;
 for(const patch of [{manualPaymentReceipt:deleteField()},{total:999},{clienteId:'foreign'},{paymentStatus:'PENDING'},{'manualPaymentReceipt.amountCents':999}]){await check(updateDoc(ref,patch));await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),prefix+'/receipted'),{lojaId:'matriz',clienteId:'c',status:'Finalizado',total:1,paymentStatus:'PAID',manualPaymentReceipt:receipt}));}
 await check(deleteDoc(ref));
 });
}

test('unchanged protected payload and operational status remain writable; erasing state does not',async()=>{
 const db=env.authenticatedContext('staff').firestore(),check=original?assertSucceeds:assertFails;
 for(const prefix of ['lojas/matriz/pedidos','pedidos']){
 const data={lojaId:'matriz',clienteId:'c',status:'Pendente',total:1,paymentMode:'AGREED_LATER',paymentStatus:'PENDING'};
 const ref=doc(db,prefix+'/unchanged');await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),prefix+'/unchanged'),data));
 await assertSucceeds(setDoc(ref,{...data,status:'Finalizado'}));await check(updateDoc(ref,{paymentStatus:deleteField(),paymentMode:deleteField()}));
 }
 const ref=doc(db,'lojas/matriz/pedidos/online');await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'lojas/matriz/pedidos/online'),{status:'Pendente',total:1,paymentId:'p',payment_status:'PAID',order_status:'CONFIRMED',requiresReview:false}));
 await assertSucceeds(updateDoc(ref,{status:'Em Produção'}));await check(updateDoc(ref,{manualPaymentReceipt:receipt}));
});
