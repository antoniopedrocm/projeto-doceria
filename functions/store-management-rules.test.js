process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const {test}=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc,deleteDoc}=require('firebase/firestore');
test('store mutations/audit/aliases server-only; inactive history editable; deletion lock denies new children',async()=>{
const env=await initializeTestEnvironment({projectId:'demo-doceria-checkout',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
try{await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const role of ['dono','admin','gerente','atendente'])await setDoc(doc(db,'users/smr-'+role),{role,ativo:true});await setDoc(doc(db,'lojas/smr-inactive'),{nome:'Fixture',status:'INACTIVE',ativo:false});await setDoc(doc(db,'lojas/smr-inactive/info/dados'),{nome:'Fixture',endereco:'Rua fixture'});await setDoc(doc(db,'lojas/smr-inactive/pedidos/history'),{status:'Pendente'});await setDoc(doc(db,'lojas/smr-locked'),{nome:'Locked',deletionLock:'request'});await setDoc(doc(db,'storeManagementAudit/event'),{storeId:'smr-inactive',action:'STORE_UPDATED'});});
for(const db of ['dono','admin','gerente','atendente'].map(r=>env.authenticatedContext('smr-'+r).firestore()).concat(env.unauthenticatedContext().firestore())){
 await assertFails(updateDoc(doc(db,'lojas/smr-inactive'),{ativo:true}));await assertFails(updateDoc(doc(db,'lojas/smr-inactive/info/dados'),{nome:'forged'}));await assertFails(deleteDoc(doc(db,'lojas/smr-inactive')));await assertFails(setDoc(doc(db,'storefrontAliases/cardapio-smr'),{storeId:'smr-inactive'}));await assertFails(setDoc(doc(db,'storeManagementAudit/forged'),{action:'STORE_DELETED'}));await assertFails(updateDoc(doc(db,'storeManagementAudit/event'),{action:'forged'}));await assertFails(deleteDoc(doc(db,'storeManagementAudit/event')));await assertFails(setDoc(doc(db,'lojas/smr-locked/produtos/p'),{nome:'No orphan'}));
}
const owner=env.authenticatedContext('smr-dono').firestore();await assertFails(setDoc(doc(owner,'lojas/smr-inactive/pedidos/new'),{status:'Pendente'}));await assertSucceeds(updateDoc(doc(owner,'lojas/smr-inactive/pedidos/history'),{status:'Em Produção'}));
await assertSucceeds(updateDoc(doc(owner,'lojas/smr-inactive/info/dados'),{frete:{valorPorKm:3}}));
}finally{await env.cleanup();}
});
