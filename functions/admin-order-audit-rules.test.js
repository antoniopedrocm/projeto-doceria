process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const {test}=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc,deleteDoc,getDoc}=require('firebase/firestore');
test('auditoria sob pedidos é append-only para o CRM pelas Rules atuais, sem alteração de permissões',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-doceria-checkout',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
 const eventPath='lojas/audit-rules/pedidos/order/auditEvents/immutable';
 try{await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'users/audit-owner'),{role:'dono'});await setDoc(doc(c.firestore(),eventPath),{orderId:'order',actorUid:'server-staff',changes:[{field:'status',before:'Pendente',after:'Finalizado'}]});});
 const staff=env.authenticatedContext('audit-owner').firestore();await assertSucceeds(getDoc(doc(staff,eventPath)));
 for(const db of [staff,env.authenticatedContext('customer').firestore(),env.unauthenticatedContext().firestore()]){await assertFails(setDoc(doc(db,eventPath),{actorUid:'forged'}));await assertFails(updateDoc(doc(db,eventPath),{actorUid:'forged'}));await assertFails(deleteDoc(doc(db,eventPath)));}
 }finally{await env.cleanup();}
});
