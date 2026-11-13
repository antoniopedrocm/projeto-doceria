// Strictly local fixtures; never obtains ADC or connects to a deployed project.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.GCLOUD_PROJECT='demo-staff-customer-directory';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const admin=require('firebase-admin'),express=require('express');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {getDoc,getDocs,doc,collection,query,where}=require('firebase/firestore');
const {createStaffCustomerDirectory,mountStaffCustomerDirectory,createDirectoryAuthorizer,CACHE_MS}=require('./staff-customer-directory');
const {createCustomerRegistry}=require('./customer-registry');
const app=admin.initializeApp({projectId:process.env.GCLOUD_PROJECT},'staff-directory-test'),db=app.firestore();
const permissions={clientes:true,pedidos:true};
let rules,service,clock=0,server,base;
before(async()=>{
  rules=await initializeTestEnvironment({projectId:process.env.GCLOUD_PROJECT,firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(require('node:path').join(__dirname,'../firestore.rules'),'utf8')}});
  await rules.clearFirestore(); // This fixed demo project exists only in the loopback emulator.
  for(const [uid,profile] of Object.entries({owner:{role:'dono'},staffA:{role:'atendente',lojaIds:['matriz']},managerB:{role:'gerente',lojaIds:['garavelo']},
    ownerA:{role:'dono',lojaIds:['matriz']},ownerBoth:{role:'dono',lojaIds:['matriz','garavelo']},
    adminA:{role:'admin',lojaIds:['matriz']},inactive:{role:'atendente',ativo:false,lojaIds:['matriz']},noModule:{role:'atendente',lojaIds:['matriz'],permissions:{}},accountant:{role:'contador',lojaIds:['matriz'],permissions:{'nota-fiscal':true}}})) {
    await db.doc('users/'+uid).set({ativo:true,permissions,...profile});
  }
  for(const store of ['matriz','garavelo'])await db.doc('lojas/'+store).set({nome:store});
  for(const id of ['a','b','both','noOrders','registered','pendingOnly'])await db.doc('clientes/'+id).set({nome:id,telefone:'62980000000',authOwnerUid:'private',identityRegistryVersion:1,
    ...(id==='registered'?{lojasVisitadas:['matriz']}:{})});
  await db.doc('clientes/old').set({canonicalStatus:'ALIAS'});
  const registry=createCustomerRegistry({db});await registry.aliasRef('old').set({state:'READY',customerId:'a'});
  const seed=async(store,id,client,total,data={})=>db.doc(`lojas/${store}/pedidos/${id}`).set({clienteId:client,status:'Finalizado',total,createdAt:admin.firestore.Timestamp.fromDate(new Date('2026-11-01T10:00:00Z')),...data});
  await seed('matriz','1','a',10);await seed('garavelo','2','b',20);await seed('matriz','3','both',30);await seed('garavelo','4','both',40);
  await seed('matriz','cancel','a',100,{status:'Cancelado'});await seed('matriz','pending','a',100,{payment_status:'PENDING'});
  await seed('matriz','pending-only','pendingOnly',10,{status:'Pendente',payment_status:'PENDING'});
  await db.doc('pedidos/legacy').set({storeId:'matriz',clientId:'old',status:'Finalizado',total:5,dataPedido:'2020-01-01'});
  await db.doc('pedidos/unknown').set({clienteId:'a',status:'Finalizado',total:999});
  const authorize=createDirectoryAuthorizer({db,assertActiveUser:async uid=>{
    if(!uid)throw Object.assign(new Error('Login obrigatório'),{code:'unauthenticated'});
    const p=(await db.doc('users/'+uid).get()).data();if(!p||p.ativo===false)throw Object.assign(new Error('Sem acesso'),{httpStatus:403});return p;
  },normalizeRole:r=>r==='admin'?'dono':r,sanitizePermissions:p=>p||{},extractStoreIds:p=>p.lojaIds||[]});
  service=createStaffCustomerDirectory({db,authorize,resolveCustomerId:id=>registry.resolveId(id),now:()=>clock});
  const http=express();mountStaffCustomerDirectory(http,service,async req=>{
    const uid=req.headers['x-test-uid'];if(!uid)throw Object.assign(new Error('Login obrigatório'),{httpStatus:401});return {uid};
  });
  server=await new Promise(resolve=>{const s=http.listen(0,'127.0.0.1',()=>resolve(s));});base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(resolve=>server?.close(resolve));await rules?.cleanup();await app.delete();});
test('real Firestore queries return canonical buyers and scoped amounts without lojasVisitadas',async()=>{
  const a=await service.list('staffA','matriz'),b=await service.list('managerB','garavelo');
  assert.deepEqual(a.clients.filter(c=>c.hasStorePurchases).map(c=>c.id).sort(),['a','both']);
  assert.equal(a.clients.find(c=>c.id==='a').valorEmCompras,15);
  assert.equal(a.clients.find(c=>c.id==='both').valorEmCompras,30);
  assert.deepEqual(b.clients.map(c=>c.id).sort(),['b','both']);assert.equal(b.clients.find(c=>c.id==='both').valorEmCompras,40);
  assert.ok(a.clients.every(c=>c.authOwnerUid===undefined && c.metricasComprasPorLoja.garavelo===undefined));
});
test('general includes customers without orders, excludes aliases, dedupes history, flags root without store',async()=>{
  const result=await service.list('owner','__all__');assert.equal(result.clients.length,6);
  assert.equal(result.clients.find(c=>c.id==='both').valorEmCompras,70);
  assert.equal(result.clients.find(c=>c.id==='noOrders').numeroDeCompras,0);
  assert.ok(result.issues.some(i=>i.orderPath==='pedidos/unknown' && i.reason==='STORE_UNRESOLVED_OR_CONFLICTING'));
});
test('GET default directory excludes registration-only clients; CRM form compatibility is explicit',async()=>{
  const get=path=>fetch(base+path,{headers:{'x-test-uid':'staffA'}}).then(r=>r.json());
  const a=await get('/clientes/diretorio?lojaId=matriz'),b=await get('/clientes/diretorio?lojaId=matriz&usage=crm');
  assert.equal(a.clients.some(c=>c.id==='registered'),false);assert.equal(b.clients.some(c=>c.id==='registered'),true);
  assert.equal((await fetch(base+'/clientes/a?lojaId=matriz',{headers:{'x-test-uid':'staffA'}})).status,200);
  assert.equal((await fetch(base+'/clientes/b?lojaId=matriz',{headers:{'x-test-uid':'staffA'}})).status,404);
  assert.equal(a.clients.some(c=>c.id==='pendingOnly'),false);
  assert.equal((await fetch(base+'/clientes/pendingOnly?lojaId=matriz',{headers:{'x-test-uid':'staffA'}})).status,200);
});
test('HTTP absent Auth 401, other store/general/customer/inactive/module-disabled 403',async()=>{
  for(const [uid,store,status] of [[null,'matriz',401],['staffA','garavelo',403],['staffA','__all__',403],['managerB','matriz',403],['customer','matriz',403],['inactive','matriz',403],['noModule','matriz',403]]) {
    const r=await fetch(base+'/clientes/diretorio?lojaId='+store,{headers:uid?{'x-test-uid':uid}:{}});assert.equal(r.status,status,uid+'/'+store);
  }
});
test('bounded Owner cannot obtain global Customers; Owner authorized for all stores retains General',async()=>{
  await assert.rejects(()=>service.list('ownerA','__all__'),e=>e.httpStatus===403);
  assert.equal((await service.list('ownerBoth','__all__')).clients.length,6);
});
test('accountant retains fiscal customer projection for authorized store, without raw cross-store access',async()=>{
  assert.equal((await fetch(base+'/clientes/a?lojaId=matriz',{headers:{'x-test-uid':'accountant'}})).status,200);
  assert.equal((await fetch(base+'/clientes/b?lojaId=matriz',{headers:{'x-test-uid':'accountant'}})).status,404);
});
test('cache expiry/new purchase and refresh preserve totals; records remain unchanged',async()=>{
  const before=(await db.doc('clientes/a').get()).data();await db.doc('lojas/matriz/pedidos/new').set({customerId:'a',status:'Finalizado',total:7,createdAt:'2026-11-05T11:00:00Z'});
  clock+=CACHE_MS+1;const result=await service.list('staffA','matriz');
  assert.equal(result.clients.find(c=>c.id==='a').valorEmCompras,22);assert.equal(result.clients.find(c=>c.id==='a').ultimaCompra,'2026-11-05T11:00:00.000Z');
  assert.deepEqual((await db.doc('clientes/a').get()).data(),before);
  assert.equal((await service.list('staffA','matriz')).clients.find(c=>c.id==='a').valorEmCompras,22);
});
test('revoked store permission is checked even on warm cache',async()=>{
  await db.doc('users/staffA').update({lojaIds:['garavelo']});
  await assert.rejects(()=>service.list('staffA','matriz'),e=>e.httpStatus===403);
  await db.doc('users/staffA').update({lojaIds:['matriz']});
});
test('Rules deny raw global Customers/metrics for Staff, even known IDs or forged store filter',async()=>{
  for(const uid of ['staffA','managerB','accountant','customer','ownerA','ownerBoth']) {
    const client=rules.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(client,'clientes/both')));
    await assertFails(getDocs(collection(client,'clientes')));
    await assertFails(getDocs(query(collection(client,'clientes'),where('lojasVisitadas','array-contains','matriz'))));
  }
  await assertSucceeds(getDoc(doc(rules.authenticatedContext('owner').firestore(),'clientes/both')));
  await assertFails(getDocs(collection(rules.unauthenticatedContext().firestore(),'clientes')));
});
test('owner/Staff order reads stay scoped and customer registration writes stay blocked',async()=>{
  await assertSucceeds(getDoc(doc(rules.authenticatedContext('staffA').firestore(),'lojas/matriz/pedidos/1')));
  await assertFails(getDoc(doc(rules.authenticatedContext('staffA').firestore(),'lojas/garavelo/pedidos/2')));
  const result=await service.detail('staffA','matriz','old');assert.equal(result.id,'a');
});
test('legacy Admin normalization never bypasses explicit store scope or permits General',async()=>{
  const get=store=>fetch(base+'/clientes/diretorio?lojaId='+store,{headers:{'x-test-uid':'adminA'}});
  assert.equal((await get('matriz')).status,200);
  assert.equal((await get('garavelo')).status,403);
  assert.equal((await get('__all__')).status,403);
  await assertFails(getDoc(doc(rules.authenticatedContext('adminA').firestore(),'clientes/both')));
});
test('completed agreed pending is visible through the default directory but is never counted as paid',async()=>{
  await db.doc('lojas/matriz/pedidos/agreed-later').set({clienteId:'noOrders',status:'Finalizado',paymentMode:'AGREED_LATER',paymentStatus:'PENDING',total:29.56,createdAt:'2026-11-08T10:00:00Z'});
  clock+=CACHE_MS+1;
  const r=await fetch(base+'/clientes/diretorio?lojaId=matriz',{headers:{'x-test-uid':'staffA'}}),body=await r.json(),c=body.clients.find(c=>c.id==='noOrders');
  assert.ok(c);assert.equal(c.valorEmCompras,0);assert.equal(c.valorPendente,29.56);assert.equal(c.hasStoreHistory,true);assert.equal(c.hasStorePurchases,false);
  assert.equal((await db.doc('lojas/matriz/pedidos/agreed-later').get()).data().paymentStatus,'PENDING');
  assert.equal((await service.list('managerB','garavelo')).clients.some(c=>c.id==='noOrders'),false);
});
test('legacyClientId field is projected and resolved without phone lookup or source mutation',async()=>{
  await db.doc('lojas/matriz/pedidos/legacy-without-cliente-id').set({clienteId:null,checkoutIdentity:{mode:'legacy_phone',legacyClientId:'old',privateProof:'not-for-directory'},status:'Finalizado',total:5});
  const ref=db.doc('lojas/matriz/pedidos/legacy-without-cliente-id'),before=(await ref.get()).data();clock+=CACHE_MS+1;
  const c=(await service.list('staffA','matriz')).clients.find(c=>c.id==='a');assert.equal(c.valorEmCompras,27);assert.deepEqual((await ref.get()).data(),before);
  assert.equal(JSON.stringify(c).includes('not-for-directory'),false);
});
test('technical diagnostics remain admin-only even when the full cache was warmed by an Owner',async()=>{
  await db.doc('lojas/matriz/pedidos/unresolved-private').set({clienteId:'missing',status:'Finalizado',total:5});clock+=CACHE_MS+1;
  const owner=await service.list('owner','matriz');assert.equal(owner.canViewHistoryIssues,true);assert.ok(owner.issues.some(i=>i.orderPath.endsWith('/unresolved-private')));
  for(const uid of ['staffA','accountant']){const r=await service.list(uid,'matriz');assert.equal(r.canViewHistoryIssues,false);assert.deepEqual(r.issues,[]);}
  const r=await fetch(base+'/clientes/diretorio?lojaId=matriz',{headers:{'x-test-uid':'staffA'}});assert.equal(JSON.stringify(await r.json()).includes('unresolved-private'),false);
});
