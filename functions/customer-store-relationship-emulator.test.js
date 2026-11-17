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
test('HTTP PUT actual route and transaction deny absent, revoked and stale grants; allow authorized edit',async()=>{
 const source=fs.readFileSync('./index.js','utf8'),http=express();http.use(express.json());
 const registry=createCustomerRegistry({db});
 const context={app:http,db:{doc:p=>db.doc(p),collection:p=>db.collection(p),runTransaction:fn=>db.runTransaction(tx=>Promise.resolve(fn(tx)))},
  FieldValue:admin.firestore.FieldValue,assertCustomerRelationship,staffCustomerDirectory:service,claimedClientPatch,customerOwnerUids,customerRegistry:registry,
  getClientsCollection:()=>db.collection('clientes'),checkoutToken:async req=>({uid:req.headers['x-test-uid']}),
  isClientStaff:async(token,store)=>(await db.doc('users/'+token.uid).get()).get('lojaIds')?.includes(store),canManageClient:async()=>false,
  createHttpError:(httpStatus,message)=>Object.assign(new Error(message),{httpStatus}),logger:{error:()=>{}}};
 const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
 vm.runInNewContext(extract('const requireStoreId =','const getStoreRef =')+extract('const sanitizeClientPayload =','const findClientByPhone =')+extract('const upsertClientDocument =','// Rota para buscar todos os produtos')+extract('app.put("/clientes/:id"','// CRM deletion'),context);
 const listener=await new Promise(resolve=>{const s=http.listen(0,'127.0.0.1',()=>resolve(s));});
 const put=nome=>fetch('http://127.0.0.1:'+listener.address().port+'/clientes/g?lojaId=matriz',{method:'PUT',headers:{'content-type':'application/json','x-test-uid':'matriz'},body:JSON.stringify({nome})});
 try {
  await relationshipRef(db,'matriz','g').delete();const before=(await db.doc('clientes/g').get()).data();
  assert.equal((await put('Forbidden')).status,404);assert.deepEqual((await db.doc('clientes/g').get()).data(),before);
  await grant('matriz','g');assert.equal((await put('HTTP legitimate')).status,200);assert.equal((await db.doc('clientes/g').get()).get('nome'),'HTTP legitimate');
  await relationshipRef(db,'matriz','g').update({state:'REVOKED'});assert.equal((await put('Revoked')).status,404);
  await grant('matriz','g');context.staffCustomerDirectory={detail:async(...args)=>{const result=await service.detail(...args);await relationshipRef(db,'matriz','g').update({state:'REVOKED'});return result;}};
  assert.equal((await put('Stale')).status,403);assert.equal((await db.doc('clientes/g').get()).get('nome'),'HTTP legitimate');
 } finally {await new Promise(resolve=>listener.close(resolve));}
});
test('store query avoids unrelated global profiles and reports loopback latency and document reads',async t=>{
 for(let offset=0;offset<600;offset+=300) {
  const batch=db.batch();for(let i=offset;i<offset+300;i++)batch.set(db.doc('clientes/unrelated-'+i),{nome:'Unrelated synthetic'});await batch.commit();
 }
 let reads=0,profiles=0,queries=0;
 const wrap=(query,path)=>new Proxy(query,{get(target,property){
  if(property==='get')return async()=>{const snapshot=await target.get();queries++;reads+=snapshot.docs.length;if(path==='clientes')profiles+=snapshot.docs.length;return snapshot;};
  const value=target[property];return typeof value==='function'?(...args)=>wrap(value.apply(target,args),path):value;
 }});
 const measured=createStaffCustomerDirectory({db:{collection:path=>wrap(db.collection(path),path)},authorize:async()=>({role:'atendente',stores:['matriz'],permissions:{clientes:true}})});
 for(let i=0;i<3;i++) {
  reads=0;profiles=0;queries=0;const start=performance.now(),result=await measured.list('matriz','matriz');
  assert.equal(profiles,2);assert.deepEqual(result.clients.map(c=>c.id).sort(),['both','m']);
  t.diagnostic(JSON.stringify({sample:i+1,latencyMs:Math.round(performance.now()-start),documentReads:reads,profileReads:profiles,queries,unrelatedProfiles:600}));
 }
});
