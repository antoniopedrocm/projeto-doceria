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
const unfilteredCustomerQueries = [];
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
  },normalizeRole:r=>r==='admin'?'dono':r.toLowerCase(),sanitizePermissions:p=>p||{}});
  const {relationshipRef}=require('./customer-store-relationship');
  for(const [id,stores] of Object.entries({a:['matriz'],b:['garavelo'],both:['matriz','garavelo'],registered:['matriz'],pendingOnly:['matriz'],noOrders:['matriz']}))for(const storeId of stores)await relationshipRef(db,storeId,id).set({schemaVersion:1,state:'ACTIVE',storeId,customerId:id,source:'REVIEWED_LEGACY',evidenceRef:'synthetic-reviewed-legacy'});
  const directoryDb = {collection(path) {
    const ref = db.collection(path);
    if (path !== 'clientes') return ref;
    return {
      where: ref.where.bind(ref),
      select(...fields) {
        unfilteredCustomerQueries.push(path);
        return ref.select(...fields);
      },
    };
  }};
  service=createStaffCustomerDirectory({db:directoryDb,authorize,resolveCustomerId:id=>registry.resolveId(id),now:()=>clock});
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
test('Gestão lists history and registrations in the authorized store only; legacy orders remain operational',async()=>{
  const {REGISTRATIONS,ROOT}=require('./customer-store-relationship');
  const registry=createCustomerRegistry({db});
  await db.doc('integrations/customerRegistry').set({state:'READY'});
  const registered=await registry.createOrGet({phone:'62985551163',data:{nome:'Novo da Matriz'},staffRegistrationStore:'matriz'});
  const reused=await registry.createOrGet({phone:'62985551163',data:{nome:'Mesmo cadastro'},staffRegistrationStore:'garavelo'});
  assert.equal(registered.customerId,reused.customerId);
  assert.equal(reused.created,false);
  assert.equal((await db.collection(REGISTRATIONS).get()).size,1);
  assert.equal((await db.collection(ROOT).where('customerId','==',registered.customerId).get()).empty,true);
  const orderPath='lojas/matriz/pedidos/legado-isolado';
  await db.doc('clientes/legacy-shared').set({nome:'Perfil global',email:'global@example.invalid'});
  await db.doc(orderPath).set({clienteId:'legacy-shared',clienteNome:'Histórico Matriz',status:'Finalizado',total:15,createdAt:'2026-11-01'});
  await db.doc('lojas/garavelo/pedidos/legado-isolado').set({clienteId:'legacy-shared',clienteNome:'Histórico Garavelo',status:'Finalizado',total:22,createdAt:'2026-11-02'});
  const get=(uid,store)=>fetch(base+'/clientes/diretorio?usage=gestao&lojaId='+store,{headers:{'x-test-uid':uid}});
  const a=await (await get('staffA','matriz')).json(),b=await (await get('managerB','garavelo')).json();
  assert.equal(a.operationalClients.find(c=>c.nome==='Histórico Matriz').valorEmCompras,15);
  assert.equal(b.operationalClients.find(c=>c.nome==='Histórico Garavelo').valorEmCompras,22);
  assert.ok(a.operationalClients.some(c=>c.nome==='Novo da Matriz'&&c.staffRegistered));
  assert.equal(b.operationalClients.some(c=>c.nome==='Novo da Matriz'),false);
  assert.equal(JSON.stringify(a).includes('global@example.invalid'),false);
  assert.equal((await get('staffA','garavelo')).status,403);
  assert.equal((await get('accountant','matriz')).status,403);
  assert.equal((await get('adminA','__all__')).status,403);
  await assert.rejects(()=>service.detail('staffA','matriz','legacy-shared'),e=>e.httpStatus===404);
  const restricted=await (await get('ownerA','__all__')).json();
  assert.equal(restricted.operationalClients.find(c=>c.nome==='Histórico Matriz').valorEmCompras,15);
  assert.equal(JSON.stringify(restricted).includes('Histórico Garavelo'),false);
  const general=await (await get('owner','__all__')).json();
  assert.equal(general.clients.find(c=>c.id==='legacy-shared').valorEmCompras,37);
  const existing=await getDoc(doc(rules.authenticatedContext('staffA').firestore(),orderPath));
  assert.equal(existing.data().clienteNome,'Histórico Matriz');
});
test('Gestão authorizes root and nested order snapshots according to the current Rules',async()=>{
  const cases=[
    {path:'pedidos/directory-absent',scope:{storeId:'matriz'},reads:['staffA'],shown:['staffA']},
    {path:'pedidos/directory-null',scope:{lojaId:null,storeId:'matriz'},reads:[],shown:[]},
    {path:'pedidos/directory-empty',scope:{lojaId:'',storeId:'matriz'},reads:[],shown:[]},
    {path:'pedidos/directory-primary',scope:{lojaId:'matriz'},reads:['staffA'],shown:['staffA']},
    {path:'pedidos/directory-missing',scope:{},reads:[],shown:[]},
    {path:'pedidos/directory-secondary-null',scope:{storeId:null},reads:[],shown:[]},
    {path:'pedidos/directory-both',scope:{lojaId:'garavelo',storeId:'garavelo'},reads:['managerB'],shown:['managerB']},
    {path:'pedidos/directory-conflicting',scope:{lojaId:'garavelo',storeId:'matriz'},reads:['managerB'],shown:[]},
    {path:'lojas/matriz/pedidos/directory-physical',scope:{lojaId:null},reads:['staffA'],shown:['staffA']},
    {path:'lojas/garavelo/pedidos/directory-path-conflict',scope:{lojaId:'matriz'},reads:['managerB'],shown:[]},
  ];
  for (const [index, item] of cases.entries()) {
    const id=item.path.split('/').at(-1);
    item.snapshot={clienteId:id,clienteNome:'Histórico '+id,status:'Finalizado',total:600+index,
      createdAt:'2025-11-'+String(index+10).padStart(2,'0')+'T12:00:00Z',...item.scope};
    await db.doc(item.path).set(item.snapshot);
  }
  for (const [uid,store] of [['staffA','matriz'],['managerB','garavelo']]) {
    const sdk=rules.authenticatedContext(uid).firestore();
    const response=await fetch(base+'/clientes/diretorio?usage=gestao&lojaId='+store,{headers:{'x-test-uid':uid}});
    assert.equal(response.status,200);
    const directory=await response.json();
    const rows=[...directory.clients,...directory.operationalClients];
    for (const item of cases) {
      const read=getDoc(doc(sdk,item.path));
      if (item.reads.includes(uid)) await assertSucceeds(read);
      else await assertFails(read);
      const {clienteNome,total,createdAt}=item.snapshot;
      const matches=rows.filter(row=>row.nome===clienteNome || row.valorEmCompras===total || row.ultimaCompra===new Date(createdAt).toISOString());
      if (item.shown.includes(uid)) {
        assert.equal(matches.length,1,item.path);
        assert.equal(matches[0].nome,clienteNome);
        assert.equal(matches[0].valorEmCompras,total);
        assert.equal(matches[0].ultimaCompra,new Date(createdAt).toISOString());
      } else assert.deepEqual(matches,[],item.path);
    }
  }
  const scopedOwner=await service.list('ownerA','__all__',true);
  assert.equal(scopedOwner.issues.some(issue=>issue.orderPath==='pedidos/directory-empty'),false);
  for (const [uid,profile] of [['wrong-role',{role:'DONO',lojaIds:['matriz']}],['wrong-scope',{role:'atendente',lojaId:' matriz '}]]) {
    await db.doc('users/'+uid).set({...profile,permissions:{clientes:true}});
    const sdk=rules.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(sdk,'pedidos/directory-primary')));
    await assertFails(getDoc(doc(sdk,'lojas/matriz/pedidos/directory-physical')));
    const denied=await fetch(base+'/clientes/diretorio?usage=gestao&lojaId=matriz',{headers:{'x-test-uid':uid}});
    assert.equal(denied.status,403);
  }
});
test('operational HTTP results are unchanged by updates to a protected alias outside the store scope',async()=>{
  const registry=createCustomerRegistry({db});
  await db.doc('lojas/matriz/pedidos/directory-alias-history').set({
    clienteId:'directory-legacy-id',clienteNome:'Registro histórico',status:'Finalizado',total:17,
  });
  const get=()=>fetch(base+'/clientes/diretorio?usage=gestao&lojaId=matriz',{headers:{'x-test-uid':'staffA'}});
  const before=await (await get()).json();
  await registry.aliasRef('directory-legacy-id').set({state:'READY',customerId:'b'});
  const after=await (await get()).json();
  assert.deepEqual(after,before);
  assert.equal(after.operationalClients.find(row=>row.nome==='Registro histórico').valorEmCompras,17);
  assert.equal(after.clients.some(row=>row.id==='b'),false);
});

test('malformed or unassigned legacy admin profiles cannot list Customers', async () => {
  const variants = [
    ['spaces', {lojaId:'   '}],
    ['null', {lojaId:null, lojaIds:[]}],
    ['missing', {}],
    ['wrong-type', {lojaId:123}],
    ['invalid-array', {lojaIds:['matriz', null]}],
    ['malformed-assignment', {lojaIds:'matriz'}],
    ['reserved-store', {lojaIds:['__all__']}],
    ['invalid-owner', {role:'dono', lojaId:'   '}],
    ['malformed-owner', {role:'dono', lojaIds:null}],
    ['unknown-role', {role:'unknown', lojaIds:['matriz']}],
    ['inconsistent-role', {role:'ADMIN', lojaIds:['matriz']}],
  ];
  const before = unfilteredCustomerQueries.length;
  for (const [uid, profile] of variants) {
    await db.doc('users/'+uid).set({role:'admin', permissions, ...profile});
    for (const query of ['lojaId=__all__&usage=gestao', 'lojaId=__all__', 'lojaId=matriz&usage=gestao']) {
      const response = await fetch(base+'/clientes/diretorio?'+query, {headers:{'x-test-uid':uid}});
      assert.equal(response.status, 403, uid+'/'+query);
      assert.deepEqual(Object.keys(await response.json()), ['message']);
    }
  }
  assert.equal(unfilteredCustomerQueries.length, before);
});

test('only an explicitly global Dono loads the full Customers inventory', async () => {
  const profiles = {
    adminB: {role:'admin', lojaId:'garavelo'},
    adminBoth: {role:'admin', lojaIds:['matriz','garavelo']},
    ownerGlobal: {role:'dono', lojaIds:[], lojaId:null},
  };
  for (const [uid, profile] of Object.entries(profiles)) {
    await db.doc('users/'+uid).set({ativo:true, permissions, ...profile});
  }
  await db.doc('clientes/out-of-scope').set({
    nome:'Perfil sem vínculo', email:'unscoped@example.invalid', telefone:'62980000111',
  });
  const get = (uid, store, usage='gestao') => fetch(
    base+'/clientes/diretorio?lojaId='+store+'&usage='+usage, {headers:{'x-test-uid':uid}},
  );
  const before = unfilteredCustomerQueries.length;
  for (const [uid, store, other, value] of [
    ['adminA','matriz','garavelo',30], ['adminB','garavelo','matriz',40],
  ]) {
    const response = await get(uid,store);
    assert.equal(response.status,200);
    const {clients, operationalClients} = await response.json();
    const shared = clients.find(row=>row.id==='both');
    assert.equal(shared.valorEmCompras,value);
    assert.equal(shared.numeroDeCompras,1);
    assert.deepEqual(Object.keys(shared.metricasComprasPorLoja),[store]);
    assert.equal(clients.some(row=>row.id===(other==='matriz'?'a':'b')),false);
    assert.equal(operationalClients.some(row=>row.nome==='Histórico Garavelo' && store==='matriz'),false);
    assert.equal((await get(uid,other)).status,403);
    assert.equal((await get(uid,'__all__')).status,403);
  }
  for (const [uid, usage, value, stores] of [
    ['ownerA','gestao',30,['matriz']],
    ['adminBoth','gestao',70,['matriz','garavelo']],
    ['adminBoth','crm',70,['matriz','garavelo']],
  ]) {
    const response = await get(uid,'__all__',usage);
    assert.equal(response.status,200);
    const directory = await response.json();
    assert.doesNotMatch(JSON.stringify(directory), /Perfil sem vínculo|unscoped@example\.invalid|62980000111/);
    const shared = directory.clients.find(row=>row.id==='both');
    assert.equal(shared.valorEmCompras,value);
    assert.equal(shared.numeroDeCompras,stores.length);
    assert.deepEqual(Object.keys(shared.metricasComprasPorLoja).sort(),[...stores].sort());
    if (usage==='gestao') {
      const legacy = directory.operationalClients.find(row=>row.nome==='Histórico Matriz' || row.nome==='Histórico Garavelo');
      assert.equal(legacy.valorEmCompras,stores.length===1?15:37);
      assert.equal(legacy.numeroDeCompras,stores.length);
      assert.doesNotMatch(JSON.stringify(directory), /global@example\.invalid/);
    }
  }
  assert.equal(unfilteredCustomerQueries.length,before);
  const response = await get('ownerGlobal','__all__');
  assert.equal(response.status,200);
  const global = await response.json();
  assert.equal(global.clients.find(row=>row.id==='out-of-scope').email,'unscoped@example.invalid');
  assert.equal(unfilteredCustomerQueries.length,before+1);
  const globalOwner = rules.authenticatedContext('ownerGlobal').firestore();
  const multiStoreAdmin = rules.authenticatedContext('adminBoth').firestore();
  await assertSucceeds(getDoc(doc(globalOwner,'clientes/out-of-scope')));
  await assertFails(getDoc(doc(multiStoreAdmin,'clientes/out-of-scope')));
});
