const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {buildCustomerDirectory,isCompletedPurchase,orderStore,createStaffCustomerDirectory,CACHE_MS,MAX_DOCUMENTS}=require('./staff-customer-directory');
const customer=(id,data={})=>({id,data:{nome:id,telefone:'62980000000',...data}});
const order=(store,id,customerId,total=10,data={})=>({path:`lojas/${store}/pedidos/${id}`,data:{clienteId:customerId,status:'Finalizado',total,createdAt:'2026-11-01T12:00:00Z',...data}});
const fixture=()=>({customers:[customer('a'),customer('b'),customer('both'),customer('new')],storeIds:['matriz','garavelo'],general:true,
  orders:[order('matriz','a1','a',10),order('garavelo','b1','b',20),order('matriz','m1','both',30),order('garavelo','g1','both',40,{createdAt:'2026-11-02T12:00:00Z'})]});
test('Matriz/Garavelo associate purchases, not cadastro storeId or phone/name coincidence',()=>{
  const f=fixture();f.customers[0].data.lojaId='garavelo';
  for(const [store,ids,total] of [['matriz',['a','both'],40],['garavelo',['b','both'],60]]){
    const r=buildCustomerDirectory({...f,storeIds:[store],general:false});
    assert.deepEqual(r.clients.map(c=>c.id).sort(),ids);
    assert.equal(r.clients.reduce((n,c)=>n+c.valorEmCompras,0),total);
    assert.ok(r.clients.every(c=>Object.keys(c.metricasComprasPorLoja).every(s=>s===store)));
  }
});
test('Visão Geral includes no-purchase Customer once, scopes last date and exact cents',()=>{
  const f=fixture();f.orders.push(order('matriz','a2','a',.1),order('matriz','a3','a',.2));
  const rows=buildCustomerDirectory(f).clients;
  assert.equal(rows.length,4);assert.equal(rows.find(c=>c.id==='new').valorEmCompras,0);
  assert.equal(rows.find(c=>c.id==='a').valorEmCompras,10.3);
  assert.equal(rows.find(c=>c.id==='both').valorEmCompras,70);
  assert.equal(rows.find(c=>c.id==='both').ultimaCompra,'2026-11-02T12:00:00.000Z');
  assert.equal(buildCustomerDirectory({...f,storeIds:['matriz'],general:false}).clients.find(c=>c.id==='both').ultimaCompra,'2026-11-01T12:00:00.000Z');
});
test('reviewed legacy IDs and READY alias index preserve canonical ID without changing source',()=>{
  const f=fixture();f.customers.push(customer('old',{canonicalStatus:'ALIAS',canonicalCustomerId:'a'}));
  f.customers[0].data.identityRegistryVersion=1;f.customers[0].data.legacyCustomerIds=['reviewed-old'];
  f.aliases=[{id:createHash('sha256').update('old').digest('hex'),data:{state:'READY',customerId:'a'}}];
  f.orders.push(order('matriz','alias','old'),order('matriz','reviewed','reviewed-old'));
  const before=structuredClone(f),r=buildCustomerDirectory(f);
  assert.equal(r.clients.find(c=>c.id==='a').numeroDeCompras,3);
  assert.equal(r.clients.some(c=>c.id==='old'),false);assert.deepEqual(f,before);
});
test('legacy root orders use explicit consistent store + customerId/clientId; mirrors count once',()=>{
  const f=fixture();f.orders.push({path:'pedidos/old',data:{lojaId:'matriz',customerId:'a',status:'Finalizado',total:15,data:'2020-01-02'}},
    {path:'pedidos/old2',data:{storeId:'garavelo',clientId:'a',status:'Finalizado',total:25}},
    {path:'pedidos/a1',data:{...f.orders[0].data,storeId:'matriz'}});
  const c=buildCustomerDirectory(f).clients.find(c=>c.id==='a');
  assert.equal(c.numeroDeCompras,3);assert.equal(c.valorEmCompras,50);
  assert.equal(c.metricasComprasPorLoja.garavelo.valorEmCompras,25);
});
test('unknown/conflicting store or Customer references, ownership and phone-only data never associate',()=>{
  const f=fixture();f.orders=[{path:'pedidos/missing',data:{clienteId:'a',status:'Finalizado',total:10}},
    order('matriz','store-conflict','a',10,{lojaId:'garavelo'}),order('matriz','customer-conflict','a',10,{clientId:'b'}),
    order('matriz','foreign-owner','a',10,{ownerUid:'foreign'}),order('matriz','phone-only',null,10,{telefone:'62980000000',nome:'a'})];
  const r=buildCustomerDirectory(f);assert.equal(r.clients.find(c=>c.id==='a').valorEmCompras,0);assert.equal(r.issues.length,5);
});
for(const data of [{status:'Cancelado'},{payment_status:'PENDING'},{paymentStatus:'REFUNDED'},{payment_status:'FAILED'},
  {paymentId:'online'},{requiresReview:true},{status:'Pendente',payment_status:'PAID'},{total:NaN},{total:-1}]) {
  test('invalid/incomplete sale contributes neither total nor membership '+JSON.stringify(data),()=>{
    const f={customers:[customer('a')],orders:[order('matriz','1','a',10,data)],storeIds:['matriz']};
    assert.equal(buildCustomerDirectory(f).clients.length,0);
  });
}
test('completed online paid + historical offline sale count; new purchase updates next projection',()=>{
  const f=fixture();f.orders=[];
  assert.equal(buildCustomerDirectory({...f,general:false}).clients.length,0);
  f.orders.push(order('matriz','paid','a',10,{payment_status:'PAID',paymentId:'p'}));
  assert.equal(buildCustomerDirectory({...f,general:false}).clients[0].valorEmCompras,10);
  assert.equal(isCompletedPurchase(order('matriz','legacy','a').data),true);
});
test('same order ID in two stores is not collapsed; same payment in one store is not counted twice',()=>{
  const f=fixture();f.orders=[order('matriz','same','a',10),order('garavelo','same','a',20),order('matriz','p1','a',5,{paymentId:'p',payment_status:'PAID'}),order('matriz','p2','a',5,{paymentId:'p',payment_status:'PAID'})];
  const r=buildCustomerDirectory(f);assert.equal(r.clients.find(c=>c.id==='a').valorEmCompras,35);assert.equal(r.issues.length,1);
});
test('projection excludes foreign-store metrics, login identities and obsolete accumulated values',()=>{
  const f=fixture();Object.assign(f.customers[0].data,{valorEmCompras:9999,metricasComprasPorLoja:{secret:999},authOwnerUid:'private',normalizedPhone:'+5562980000000',legacyOrderPaths:['secret']});
  const c=buildCustomerDirectory({...f,storeIds:['matriz'],general:false}).clients[0];
  assert.equal(c.valorEmCompras,10);for(const key of ['authOwnerUid','normalizedPhone','legacyOrderPaths'])assert.equal(key in c,false);
  assert.deepEqual(Object.keys(c.metricasComprasPorLoja),['matriz']);
});
test('manual registration remains available to other CRM forms but not purchase directory',()=>{
  const f={customers:[customer('new',{lojasVisitadas:['matriz','garavelo']})],orders:[],storeIds:['matriz']};
  assert.equal(buildCustomerDirectory(f).clients.length,0);
  const c=buildCustomerDirectory({...f,includeRegistered:true}).clients[0];
  assert.equal(c.hasStorePurchases,false);assert.deepEqual(c.lojasVisitadas,['matriz']);
});
test('physical store wins only when consistent, never a Matriz fallback',()=>{
  assert.equal(orderStore({path:'pedidos/x',data:{}}),null);
  assert.equal(orderStore(order('garavelo','x','a')), 'garavelo');
  assert.equal(orderStore(order('garavelo','x','a',10,{storeId:'matriz'})),null);
});
test('permissions are rechecked before cache; a single-store staff cannot read another store or general',async()=>{
  const service=createStaffCustomerDirectory({db:{},authorize:async uid=>{if(!uid)throw Object.assign(new Error('login'),{httpStatus:401});return {role:'atendente',stores:['matriz'],permissions:{clientes:true}};}});
  await assert.rejects(()=>service.list(null,'matriz'),e=>e.httpStatus===401);
  await assert.rejects(()=>service.list('staff','garavelo'),e=>e.httpStatus===403);
  await assert.rejects(()=>service.list('staff','__all__'),e=>e.httpStatus===403);
  const denied=createStaffCustomerDirectory({db:{},authorize:async()=>({role:'gerente',stores:['matriz'],permissions:{}})});
  await assert.rejects(()=>denied.list('manager','matriz'),e=>e.httpStatus===403);
  assert.equal(CACHE_MS,5000);
});
test('incompatible duplicate payment references are withheld, not assigned to the first Customer',()=>{
  const f=fixture();f.orders=[order('matriz','x','a',10,{paymentId:'same',payment_status:'PAID'}),order('matriz','y','b',20,{paymentId:'same',payment_status:'PAID'})];
  const r=buildCustomerDirectory(f);assert.ok(r.clients.every(c=>c.valorEmCompras===0));assert.equal(r.issues[0].reason,'DUPLICATE_PAYMENT_CONFLICT');
});
test('three conflicting mirror copies cannot reintroduce a discarded order',()=>{
  const f=fixture();f.orders=[order('matriz','x','a',10),{path:'pedidos/x',data:{lojaId:'matriz',clienteId:'b',total:15,status:'Finalizado'}},{path:'pedidos/x',data:{lojaId:'matriz',clienteId:'a',total:10,status:'Finalizado'}}];
  assert.ok(buildCustomerDirectory(f).clients.every(c=>c.valorEmCompras===0));
});
function fakeDb(totalCustomers,onRead=()=>{}) {
  let calls=0;
  const collection=path=>{
    let cursor=-1,size=0;
    const q={select:()=>q,where:()=>q,orderBy:()=>q,startAfter:s=>{cursor=Number(s.id);return q;},limit:n=>{size=n;return q;},get:async()=>{
      calls++;await onRead(calls);
      const docs=path==='clientes'?Array.from({length:Math.min(size,Math.max(0,totalCustomers-cursor-1))},(_,i)=>{
        const id=String(cursor+1+i);return {id,ref:{path:'clientes/'+id},data:()=>({nome:id})};
      }):[];return {docs};
    }};return q;
  };
  return {db:{collection},calls:()=>calls};
}
test('history query is bounded/paged; oversized data raises controlled 503 rather than partial totals',async()=>{
  const f=fakeDb(MAX_DOCUMENTS+1),service=createStaffCustomerDirectory({db:f.db,authorize:async()=>({role:'dono',allStores:true,permissions:{clientes:true}})});
  await assert.rejects(()=>service.list('owner','matriz'),e=>e.httpStatus===503);
  assert.ok(f.calls()<=Math.ceil(MAX_DOCUMENTS/400)+1);
});
test('parallel readers share one scan and warm cache, without per-customer queries',async()=>{
  let release,clock=0;const f=fakeDb(100,call=>call===1?new Promise(r=>release=r):undefined);
  const service=createStaffCustomerDirectory({db:f.db,now:()=>clock,authorize:async()=>({role:'atendente',stores:['matriz'],permissions:{clientes:true}})});
  const a=service.list('a','matriz'),b=service.list('b','matriz');await new Promise(r=>setImmediate(r));
  assert.equal(f.calls(),1);clock+=CACHE_MS*2;
  const c=service.list('c','matriz');await new Promise(r=>setImmediate(r));assert.equal(f.calls(),1);
  release();await Promise.all([a,b,c]);assert.equal(f.calls(),5);
  await service.list('a','matriz');assert.equal(f.calls(),5);
});
test('phone display uses canonical document fallback without using phone to join unrelated orders',()=>{
  const r=buildCustomerDirectory({customers:[customer('canonical',{telefone:null,normalizedPhone:'+5562980000000'})],orders:[],storeIds:['matriz'],general:true});
  assert.equal(r.clients[0].id,'canonical');assert.equal(r.clients[0].telefone,'+5562980000000');assert.equal(r.clients[0].numeroDeCompras,0);
});
test('pending-order profile remains available for fulfillment forms without being counted as a buyer',()=>{
  const f={customers:[customer('pending')],orders:[order('matriz','new','pending',20,{status:'Pendente',payment_status:'PENDING'})],storeIds:['matriz']};
  assert.equal(buildCustomerDirectory(f).clients.length,0);
  const common=buildCustomerDirectory({...f,includeRegistered:true}).clients;
  assert.equal(common.length,1);assert.equal(common[0].hasStorePurchases,false);assert.equal(common[0].valorEmCompras,0);
  assert.deepEqual(common[0].lojasVisitadas,['matriz']);
});
test('exact 10000-document boundary succeeds; one extra alias fails closed without caching partial totals',async()=>{
  const f=fakeDb(MAX_DOCUMENTS),authorize=async()=>({role:'dono',allStores:true,permissions:{clientes:true}});
  const service=createStaffCustomerDirectory({db:f.db,authorize});
  assert.equal((await service.list('owner','matriz')).clients.length,0); // No purchases; no fabricated membership.
  let extra=true;
  const db={collection:p=>{
    if(p!=='integrations/customerRegistry/aliases')return f.db.collection(p);
    const q={select:()=>q,orderBy:()=>q,limit:()=>q,get:async()=>({docs:extra?[{id:'alias',ref:{path:p+'/alias'},data:()=>({})}]:[]})};return q;
  }};
  const bounded=createStaffCustomerDirectory({db,authorize});
  await assert.rejects(()=>bounded.list('owner','matriz'),e=>e.httpStatus===503);
  extra=false;
  assert.equal((await bounded.list('owner','matriz')).clients.length,0);
});
test('completed AGREED_LATER PENDING preserves store membership, reports pending separately and never fabricates PAID',()=>{
  const f={customers:[customer('a')],orders:[order('matriz','1','a',14.78,{paymentMode:'AGREED_LATER',paymentStatus:'PENDING'}),order('matriz','2','a',14.78,{paymentMode:'AGREED_LATER',paymentStatus:'PENDING',createdAt:'2026-11-08T20:00:00Z'})],storeIds:['matriz']};
  const before=structuredClone(f),c=buildCustomerDirectory(f).clients[0];
  assert.equal(c.hasStorePurchases,false);assert.equal(c.hasStoreHistory,true);assert.equal(c.valorEmCompras,0);assert.equal(c.ultimaCompra,null);
  assert.equal(c.valorPendente,29.56);assert.equal(c.pedidosPendentes,2);assert.equal(c.ultimoPedidoPendente,'2026-11-08T20:00:00.000Z');
  assert.equal(buildCustomerDirectory({...f,storeIds:['garavelo']}).clients.length,0);assert.deepEqual(f,before);
});
test('unknown agreed-later financial state remains pending, while historical cash without state retains completed-sale behavior',()=>{
  const f={customers:[customer('a')],orders:[order('matriz','1','a',5,{paymentMode:'AGREED_LATER'}),order('matriz','2','a',10,{formaPagamento:'Dinheiro'})],storeIds:['matriz']};
  const c=buildCustomerDirectory(f).clients[0];assert.equal(c.valorEmCompras,10);assert.equal(c.valorPendente,5);
});
test('failed/canceled/refunded/reviewed or unfinished agreed orders do not gain completed history',()=>{
  for(const data of [{paymentStatus:'REFUNDED'},{paymentStatus:'FAILED'},{status:'Pendente'},{status:'Cancelado'},{requiresReview:true},{paymentId:'online-payment'}]){
    const f={customers:[customer('a')],orders:[order('matriz','1','a',10,{paymentMode:'AGREED_LATER',paymentStatus:'PENDING',...data})],storeIds:['matriz']};
    assert.equal(buildCustomerDirectory(f).clients.length,0,JSON.stringify(data));
  }
});
test('server legacy-phone ID restores a missing clienteId through existing canonical registry and preserves immutable inputs',()=>{
  const f={customers:[customer('a',{identityRegistryVersion:1,legacyCustomerIds:['old']})],orders:[order('matriz','1',null,5,{checkoutIdentity:{mode:'legacy_phone',legacyClientId:'old'}})],storeIds:['matriz']};
  const before=structuredClone(f);assert.equal(buildCustomerDirectory(f).clients[0].valorEmCompras,5);assert.deepEqual(f,before);
  f.orders[0].data.customerId='different';assert.equal(buildCustomerDirectory(f).clients.length,0); // Conflicting refs are not overridden.
  delete f.orders[0].data.customerId;f.orders[0].data.checkoutIdentity.mode='guest';assert.equal(buildCustomerDirectory(f).clients.length,0);
});
test('intentional guest without private Customer is not labeled corrupted; unresolved non-guest still needs review',()=>{
  const f={customers:[customer('a')],orders:[order('matriz','1',null,10,{checkoutIdentity:{mode:'guest'}})],storeIds:['matriz']};
  assert.equal(buildCustomerDirectory(f).issues.length,0);assert.equal(buildCustomerDirectory(f).clients.length,0);
  delete f.orders[0].data.checkoutIdentity;assert.equal(buildCustomerDirectory(f).issues[0].reason,'CUSTOMER_UNRESOLVED_OR_CONFLICTING');
});
