process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const {test}=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc}=require('firebase/firestore');
test('contrato AGREED_LATER mantém processamento Staff e bloqueia Customer sem alterar Rules',async()=>{
  const env=await initializeTestEnvironment({projectId:'demo-doceria-checkout',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
  try {
    await env.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();await setDoc(doc(db,'users/agreed-rule-staff'),{role:'dono',ativo:true});
      await setDoc(doc(db,'lojas/agreed-rule-store/pedidos/agreed'),{status:'Pendente',paymentMode:'AGREED_LATER',paymentMethod:null,paymentStatus:'PENDING',formaPagamento:'A combinar',total:10});
    });
    const staff=env.authenticatedContext('agreed-rule-staff').firestore(),customer=env.authenticatedContext('agreed-rule-customer').firestore();
    const p='lojas/agreed-rule-store/pedidos/agreed';
    await assertSucceeds(updateDoc(doc(staff,p),{status:'Finalizado'}));
    await assertFails(updateDoc(doc(customer,p),{status:'Finalizado'}));
    await assertFails(updateDoc(doc(staff,p),{payment_status:'PAID'}));
  } finally {await env.cleanup();}
});
