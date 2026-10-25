const {test,before,after}=require('node:test');
const {readFileSync}=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc,getDoc,deleteDoc}=require('firebase/firestore');
let env;
before(async()=>{
  env=await initializeTestEnvironment({projectId:'demo-customer-registry-rules',firestore:{host:'127.0.0.1',port:8080,rules:readFileSync(require('node:path').join(__dirname,'../firestore.rules'),'utf8')}});
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(doc(ctx.firestore(),'users/owner'),{role:'dono',ativo:true});
    await setDoc(doc(ctx.firestore(),'clientes/canonical'),{nome:'Fixture',telefone:'62985550071',authOwnerUid:'customer'});
    await setDoc(doc(ctx.firestore(),'integrations/customerRegistry/phones/fixture'),{customerId:'canonical'});
  });
});
after(()=>env?.cleanup());
[null,'customer','owner'].forEach(uid=>test(`índice privado e transação não podem ser contornados por ${uid || 'visitante'}`,async()=>{
  const db=uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(db,'clientes/forged'),{nome:'Fixture',telefone:'62985550071',uid}));
  await assertFails(updateDoc(doc(db,'clientes/canonical'),{telefone:'62985550072'}));
  await assertFails(updateDoc(doc(db,'clientes/canonical'),{identityRegistryVersion:1,authOwnerUids:[uid || 'forged']}));
  await assertFails(deleteDoc(doc(db,'clientes/canonical')));
  await assertFails(getDoc(doc(db,'integrations/customerRegistry/phones/fixture')));
  await assertFails(setDoc(doc(db,'integrations/customerRegistry/aliases/forged'),{customerId:'canonical'}));
}));
test('Staff continua lendo CRM; Customer sem API não lê cadastro privado',async()=>{
  await assertSucceeds(getDoc(doc(env.authenticatedContext('owner').firestore(),'clientes/canonical')));
  await assertFails(getDoc(doc(env.authenticatedContext('customer').firestore(),'clientes/canonical')));
});
