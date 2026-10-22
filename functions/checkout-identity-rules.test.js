const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc}=require('firebase/firestore');
test('contexto checkout não é legível por visitante/Customer nem editável por Customer/Staff',async()=>{
  const env=await initializeTestEnvironment({projectId:'demo-checkout-identity-rules',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
  const target='checkoutPayments/_identity/contexts/'+'a'.repeat(64);
  try {
    await env.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();await setDoc(doc(db,target),{mode:'legacy_phone',ownerUid:null});
      await setDoc(doc(db,'users/staff-fixture'),{role:'dono',ativo:true});
    });
    for(const context of [env.unauthenticatedContext(),env.authenticatedContext('customer-fixture')]) {
      const ref=doc(context.firestore(),target);await assertFails(getDoc(ref));await assertFails(setDoc(ref,{mode:'strong_auth',ownerUid:'customer-fixture'}));
    }
    await assertFails(setDoc(doc(env.authenticatedContext('staff-fixture').firestore(),target),{mode:'strong_auth'}));
  } finally {await env.cleanup();}
});
