// Loopback-only synthetic projects; no production credentials or data.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const admin=require('firebase-admin'),express=require('express');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc,deleteDoc}=require('firebase/firestore');
const {createStaffCustomerDirectory,mountStaffCustomerDirectory}=require('./staff-customer-directory');
const {relationshipRef,assertCustomerRelationship,grantCustomerRelationship}=require('./customer-store-relationship');
const {claimedClientPatch}=require('./crm-client-edit');
const {customerOwnerUids}=require('./customer-ownership');
const {createCustomerRegistry}=require('./customer-registry');
const app=admin.initializeApp({projectId:'demo-c16-store-relations'},'c16-relations'),db=app.firestore();
let rules,service,server,base;
const grant=(storeId,customerId)=>db.runTransaction(tx=>{grantCustomerRelationship({db,tx,storeId,customerId,source:'REVIEWED_LEGACY',evidenceRef:'synthetic-approved-inventory'});return Promise.resolve();});
before(async()=>{
 rules=await initializeTestEnvironment({projectId:'demo-c16-store-relations',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync('../firestore.rules','utf8')}});await rules.clearFirestore();
 for(const store of ['matriz','garavelo']){await db.doc('lojas/'+store).set({ativo:true});await db.doc('users/'+store).set({role:'atendente',ativo:true,lojaIds:[store],permissions:{clientes:true,pedidos:true,financeiro:false}});}
 for(const [id,stores] of Object.entries({m:['matriz'],g:['garavelo'],both:['matriz','garavelo'],ambiguous:[]})){
  await db.doc('clientes/'+id).set({nome:'Synthetic '+id,telefone:'62980000000',authOwnerUid:'owner-'+id,lojasVisitadas:stores});
  for(const store of stores)await grant(store,id);
 }
 const registry=createCustomerRegistry({db});await registry.aliasRef('old-g').set({state:'READY',customerId:'g'});
 await db.doc('clientes/old-g').set({canonicalStatus:'ALIAS'});
 service=createStaffCustomerDirectory({db,resolveCustomerId:id=>registry.resolveId(id),authorize:async uid=>({role:uid==='owner'?'dono':'atendente',allStores:uid==='owner',stores:[uid],permissions:{clientes:true}})});
 const http=express();mountStaffCustomerDirectory(http,service,async req=>({uid:req.headers['x-test-uid']}));
 server=await new Promise(resolve=>{const s=http.listen(0,'127.0.0.1',()=>resolve(s));});base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await rules.cleanup();await app.delete();});
test('SDK forged orders, metadata and aliases never authorize list/detail in either direction',async()=>{
 for(const [store,target] of [['matriz','g'],['garavelo','m']]){
  const sdk=rules.authenticatedContext(store).firestore();
  for(const refField of ['clienteId','customerId','clientId'])await assertSucceeds(setDoc(doc(sdk,'lojas/'+store+'/pedidos/forged-'+refField),{[refField]:target,status:'Finalizado',total:1}));
  assert.equal((await service.list(store,store)).clients.some(c=>c.id===target),false);
  await assert.rejects(()=>service.detail(store,store,target),e=>e.httpStatus===404);
  const response=await fetch(base+'/clientes/'+target+'?lojaId='+store,{headers:{'x-test-uid':store}});assert.equal(response.status,404);
 }
 await assert.rejects(()=>service.detail('matriz','matriz','old-g'),e=>e.httpStatus===404);
 await db.doc('lojas/matriz/pedidos/ambiguous').set({clienteId:'ambiguous',status:'Finalizado',total:1});
 assert.equal((await service.list('matriz','matriz')).clients.some(c=>c.id==='ambiguous'),false);
});
test('Staff cannot create, edit or remove relationship evidence; reviewed legacy and General survive',async()=>{
 for(const store of ['matriz','garavelo']){
  const sdk=rules.authenticatedContext(store).firestore(),path=relationshipRef(db,store,'both').path;
  await assertFails(setDoc(doc(sdk,path),{state:'ACTIVE',customerId:'g',storeId:store}));
  await assertFails(updateDoc(doc(sdk,path),{customerId:'g'}));await assertFails(deleteDoc(doc(sdk,path)));
  assert.ok((await service.list(store,store)).clients.some(c=>c.id==='both'));
 }
 assert.equal((await service.list('owner','__all__')).clients.length,4);
 const before=(await db.doc('clientes/ambiguous').get()).data();assert.ok(before);assert.equal(before.authOwnerUid,'owner-ambiguous');
});
test('revoked relationship invalidates warm list/detail/aliases immediately',async()=>{
 await grant('matriz','g');assert.equal((await service.detail('matriz','matriz','old-g')).id,'g');
 await relationshipRef(db,'matriz','g').update({state:'REVOKED'});
 assert.equal((await service.list('matriz','matriz')).clients.some(c=>c.id==='g'),false);
 await assert.rejects(()=>service.detail('matriz','matriz','old-g'),e=>e.httpStatus===404);
});
test('actual profile upsert rechecks grant inside transaction; forged relation cannot edit global profile',async()=>{
 const source=fs.readFileSync('./index.js','utf8'),start=source.indexOf('const upsertClientDocument ='),end=source.indexOf('// Rota para buscar todos os produtos',start);
 // Firestore checks instanceof Promise; VM promises belong to another realm.
 const vmDb={doc:path=>db.doc(path),collection:path=>db.collection(path),runTransaction:handler=>db.runTransaction(tx=>Promise.resolve(handler(tx)))};
 const context={db:vmDb,FieldValue:admin.firestore.FieldValue,assertCustomerRelationship,staffCustomerDirectory:service,claimedClientPatch,customerOwnerUids,customerRegistry:{assertPhoneUnchanged:()=>{}},createHttpError:(httpStatus,message)=>Object.assign(new Error(message),{httpStatus})};
 vm.runInNewContext(source.slice(start,end)+';run=upsertClientDocument;',context);
 const targetRef=db.doc('clientes/g'),before=(await targetRef.get()).data();
 await assert.rejects(()=>context.run({targetRef,data:{nome:'Forged'},lojaId:'matriz',crmStaffUid:'matriz'}));assert.deepEqual((await targetRef.get()).data(),before);
 await grant('matriz','g');await context.run({targetRef,data:{nome:'Legitimate'},lojaId:'matriz',crmStaffUid:'matriz'});assert.equal((await targetRef.get()).get('nome'),'Legitimate');
 await relationshipRef(db,'matriz','g').delete();context.staffCustomerDirectory={detail:async()=>before};
 await assert.rejects(()=>context.run({targetRef,data:{nome:'Stale grant'},lojaId:'matriz',crmStaffUid:'matriz'}),e=>e.httpStatus===403);
});
test('new registration creates trusted evidence but existing phone never creates a new-store grant',async()=>{
 const registry=createCustomerRegistry({db});await db.doc('integrations/customerRegistry').set({state:'READY'});
 const result=await registry.createOrGet({phone:'62981112222',data:{nome:'New synthetic'},registrationStoreId:'matriz'});
 await assertCustomerRelationship({db,storeId:'matriz',customerId:result.customerId});
 const existing=await registry.createOrGet({phone:'62981112222',data:{nome:'Ignored'},registrationStoreId:'garavelo'});assert.equal(existing.customerId,result.customerId);
 await assert.rejects(()=>assertCustomerRelationship({db,storeId:'garavelo',customerId:result.customerId}));
});
