// Read-only CRM projection. No customer/order backfill, phone matching or identity writes.
const {createHash} = require('node:crypto');
const {getOrderCreatedAt} = require('./customer-orders');
const {customerOwnerUids} = require('./customer-ownership');
const {FieldPath} = require('firebase-admin/firestore');
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,150}$/.test(id);
const hash = id => createHash('sha256').update(id).digest('hex');
const fail = (message, status=403) => {throw Object.assign(new Error(message), {httpStatus:status});};
const profileFields = ['nome','email','telefone','cpf','documento','endereco','cep','bairro','cidade','uf','codigoIbge','aniversario','status','address','enderecos','criadoEm'];
const identityFields = ['canonicalStatus','canonicalCustomerId','identityRegistryVersion','legacyCustomerIds','authOwnerUid','authOwnerUids','lojasVisitadas','lojaId','lojaAtual','normalizedPhone','phone_number'];
const orderFields = ['clienteId','customerId','clientId','checkoutIdentity.mode','checkoutIdentity.legacyClientId','lojaId','storeId','status','order_status','paymentMode','formaPagamento','payment_status','paymentStatus','statusPagamento','paymentId','ownerUid','requiresReview','total','createdAt','dataPedido','data'];
const MAX_DOCUMENTS = 10000, BATCH_SIZE = 400, CACHE_MS = 5000;
function orderStore(order) {
  const nested = order.path.match(/^lojas\/([\w-]{1,150})\/pedidos\/[\w-]{1,150}$/)?.[1];
  const fields = [order.data.lojaId, order.data.storeId].filter(x => x !== undefined && x !== null && x !== '');
  if (fields.some(id => !validId(id))) return null;
  const stores = [...new Set([nested, ...fields].filter(Boolean))];
  return stores.length === 1 && (nested || /^pedidos\/[\w-]{1,150}$/.test(order.path)) ? stores[0] : null;
}
function isCompletedOrder(data) {
  if (data.requiresReview === true || ['Cancelado','CANCELLED','CANCELED','REFUNDED'].includes(data.status) ||
      ['CANCELLED','CANCELED','REFUNDED','EXPIRED'].includes(data.order_status)) return false;
  return data.status === 'Finalizado' || data.order_status === 'DELIVERED';
}
const isAgreedLater = data => data.paymentMode === 'AGREED_LATER' ||
  (!data.paymentMode && ['A combinar','Combinar Pagamento'].includes(data.formaPagamento));
function validOrderTotal(data) {
  return (typeof data.total === 'number' || (typeof data.total === 'string' && data.total.trim() !== '')) &&
    Number.isFinite(Number(data.total)) && Number(data.total) >= 0 && Number.isSafeInteger(Math.round(Number(data.total)*100));
}
function isCompletedPurchase(data) {
  // Financial eligibility is independent of a completed, payment-pending order.
  if (!isCompletedOrder(data)) return false;
  const payment = data.payment_status ?? data.paymentStatus ?? data.statusPagamento;
  if (payment != null && !['PAID','PAGO','APPROVED','APROVADO'].includes(String(payment).toUpperCase())) return false;
  if (payment == null && isAgreedLater(data)) return false;
  if (data.paymentId && payment == null) return false;
  // Historical completed offline sales without a financial state retain their contract.
  return validOrderTotal(data);
}
function isCompletedAgreedPending(data) {
  const payment = data.payment_status ?? data.paymentStatus ?? data.statusPagamento;
  return isCompletedOrder(data) && isAgreedLater(data) && !data.paymentId &&
    (payment == null || ['PENDING','PENDENTE','PENDING_SELECTION','UNKNOWN'].includes(String(payment).toUpperCase())) && validOrderTotal(data);
}
function buildCustomerDirectory({customers, aliases=[], orders, storeIds, general=false, includeRegistered=false}) {
  const stores = new Set(storeIds), records = new Map(customers.map(c => [c.id,c.data]));
  const aliasIndex = new Map(aliases.map(a => [a.id,a.data]));
  const reviewed = new Map();
  for (const customer of customers) if (customer.data.identityRegistryVersion === 1 && customer.data.canonicalStatus !== 'ALIAS') {
    for (const id of (Array.isArray(customer.data.legacyCustomerIds)?customer.data.legacyCustomerIds:[])) if (validId(id) && id !== customer.id) {
      const owners = reviewed.get(id) || new Set(); owners.add(customer.id); reviewed.set(id,owners);
    }
  }
  function canonical(id) {
    if (!validId(id)) return null;
    const seen = new Set(); let current = id;
    for (let depth=0;depth<5;depth++) {
      if (seen.has(current)) return null; seen.add(current);
      const alias = aliasIndex.get(hash(current));
      if (alias) {
        if (alias.state !== 'READY' || !validId(alias.customerId)) return null;
        if (alias.customerId !== current) {current=alias.customerId;continue;}
      } else if (reviewed.has(current)) {
        const owners=reviewed.get(current); if (owners.size!==1) return null;
        current=[...owners][0]; continue;
      }
      return records.has(current) && records.get(current).canonicalStatus !== 'ALIAS' ? current : null;
    }
    return null;
  }
  const clients = new Map(), metrics = new Map(), pendingMetrics = new Map(), issues = [];
  const issue = (order, reason) => {if (issues.length < 100) issues.push({orderPath:order.path,reason});};
  for (const record of customers) {
    if (canonical(record.id)!==record.id) continue;
    const profile=Object.fromEntries(profileFields.filter(k => Object.hasOwn(record.data,k)).map(k => [k,record.data[k]]));
    if (!profile.telefone) profile.telefone=record.data.normalizedPhone || record.data.phone_number || '';
    const registered=[...new Set([...(Array.isArray(record.data.lojasVisitadas)?record.data.lojasVisitadas:[]), record.data.lojaId,record.data.lojaAtual].filter(id=>stores.has(id)))];
    clients.set(record.id,{...profile,nome:typeof profile.nome==='string' && profile.nome.trim()?profile.nome:'Cliente sem nome',id:record.id,lojasVisitadas:registered});
    metrics.set(record.id,new Map());
    pendingMetrics.set(record.id,new Map());
  }
  // Prefer the canonical store document over its legacy root mirror.
  const seenPaths=new Set(), unique=new Map(), conflicts=new Set();
  for (const order of [...orders].sort((a,b)=>Number(b.path.startsWith('lojas/'))-Number(a.path.startsWith('lojas/')))) {
    if (seenPaths.has(order.path)) continue; seenPaths.add(order.path);
    const store=orderStore(order);
    if (!store) {issue(order,'STORE_UNRESOLVED_OR_CONFLICTING');continue;}
    if (!stores.has(store)) continue;
    const references=['clienteId','customerId','clientId'].map(k=>order.data[k]).filter(x=>x!==undefined && x!==null && x!=='');
    // This server-persisted legacy-phone reference predates clienteId in some orders.
    // It is an ID resolved by the same reviewed registry, never a phone/name join.
    if (order.data.checkoutIdentity?.mode==='legacy_phone' && order.data.checkoutIdentity.legacyClientId) references.push(order.data.checkoutIdentity.legacyClientId);
    if (!references.length && order.data.checkoutIdentity?.mode==='guest') continue;
    const ids=references.map(canonical), customerId=ids[0];
    if (!customerId || ids.some(id=>id!==customerId)) {issue(order,'CUSTOMER_UNRESOLVED_OR_CONFLICTING');continue;}
    if (order.data.ownerUid && !customerOwnerUids(records.get(customerId)).includes(order.data.ownerUid)) {issue(order,'OWNER_CONFLICT');continue;}
    const key=store+'/'+order.path.split('/').pop();
    if (conflicts.has(key)) continue;
    const previous=unique.get(key);
    if (!previous) unique.set(key,{order,store,customerId});
    else if (previous.customerId!==customerId || Number(previous.order.data.total)!==Number(order.data.total)) {
      unique.delete(key);conflicts.add(key);issue(order,'DUPLICATE_ORDER_CONFLICT');
    }
  }
  const payments=new Map(), eligible=[], relationships=new Map();
  for (const candidate of unique.values()) {
    const {order,store,customerId}=candidate;
    const related=relationships.get(customerId) || new Set();related.add(store);relationships.set(customerId,related);
    if (isCompletedAgreedPending(order.data)) {
      const perStore=pendingMetrics.get(customerId),m=perStore.get(store) || {cents:0,count:0,latest:null};
      m.cents+=Math.round(Number(order.data.total)*100);if (!Number.isSafeInteger(m.cents)) fail('Total pendente excede o limite monetário seguro.',503);
      m.count++;const date=getOrderCreatedAt(order.data);if(date && (!m.latest || date>m.latest))m.latest=date;perStore.set(store,m);
    }
    if (!isCompletedPurchase(order.data)) continue;
    const paymentKey=order.data.paymentId && store+'/'+order.data.paymentId;
    if (paymentKey && payments.has(paymentKey)) {
      const previous=payments.get(paymentKey);
      if (previous.customerId!==customerId || Number(previous.order.data.total)!==Number(order.data.total)) previous.conflict=true;
      issue(order,previous.conflict?'DUPLICATE_PAYMENT_CONFLICT':'DUPLICATE_PAYMENT_REFERENCE');continue;
    }
    if (paymentKey) payments.set(paymentKey,candidate);
    eligible.push(candidate);
  }
  for (const {order,store,customerId,conflict} of eligible) {
    if (conflict) continue;
    const perStore=metrics.get(customerId); if (!perStore) continue;
    const metric=perStore.get(store) || {cents:0,numeroDeCompras:0,ultimaCompra:null};
    const cents=metric.cents+Math.round(Number(order.data.total)*100);
    if (!Number.isSafeInteger(cents)) fail('Total histórico excede o limite monetário seguro.',503);
    metric.cents=cents; metric.numeroDeCompras++;
    const date=getOrderCreatedAt(order.data);
    if (date && (!metric.ultimaCompra || date>metric.ultimaCompra)) metric.ultimaCompra=date;
    perStore.set(store,metric);
  }
  const output=[];
  for (const [id,profile] of clients) {
    const perStore=metrics.get(id),pending=pendingMetrics.get(id),hasPurchases=perStore.size>0,hasHistory=hasPurchases || pending.size>0;
    if (!general && !hasHistory && !(includeRegistered && (profile.lojasVisitadas.length || relationships.has(id)))) continue;
    let cents=0, count=0, latest=null,pendingCents=0,pendingCount=0,pendingLatest=null;const scoped={};
    for (const store of new Set([...perStore.keys(),...pending.keys()])) {
      const m=perStore.get(store)||{cents:0,numeroDeCompras:0,ultimaCompra:null},p=pending.get(store)||{cents:0,count:0,latest:null};
      scoped[store]={valorEmCompras:m.cents/100,numeroDeCompras:m.numeroDeCompras,ultimaCompra:m.ultimaCompra,
        valorPendente:p.cents/100,pedidosPendentes:p.count,ultimoPedidoPendente:p.latest};
      if (!Number.isSafeInteger(cents+m.cents)) fail('Total histórico excede o limite monetário seguro.',503);
      cents+=m.cents;count+=m.numeroDeCompras;
      if (m.ultimaCompra && (!latest || m.ultimaCompra>latest)) latest=m.ultimaCompra;
      pendingCents+=p.cents;if(!Number.isSafeInteger(pendingCents))fail('Total pendente excede o limite monetário seguro.',503);
      pendingCount+=p.count;if(p.latest&&(!pendingLatest||p.latest>pendingLatest))pendingLatest=p.latest;
    }
    output.push({...profile,lojasVisitadas:[...new Set([...profile.lojasVisitadas,...(relationships.get(id) || []),...perStore.keys()])],
      hasStorePurchases:hasPurchases,hasStoreHistory:hasHistory,numeroDeCompras:count,valorEmCompras:cents/100,ultimaCompra:latest,
      valorPendente:pendingCents/100,pedidosPendentes:pendingCount,ultimoPedidoPendente:pendingLatest,metricasComprasPorLoja:scoped});
  }
  return {clients:output,issues};
}
function createDirectoryAuthorizer({db,assertActiveUser,normalizeRole,sanitizePermissions,extractStoreIds}) {
  return async uid=>{
    const profile=await assertActiveUser(uid),role=normalizeRole(profile.role),stores=extractStoreIds(profile);
    if (!['dono','gerente','atendente','contador'].includes(role)) fail('Acesso restrito à equipe.');
    const custom=(await db.doc('customProfiles/'+uid).get()).data() || {};
    return {role,stores,allStores:role==='dono' && stores.length===0,permissions:sanitizePermissions(custom.permissions || profile.permissions,role)};
  };
}
function createStaffCustomerDirectory({db,authorize,resolveCustomerId=async id=>id,now=()=>Date.now()}) {
  const cache=new Map();
  async function read(query,budget) {
    const result=[];let cursor=null;
    while (budget.count<=MAX_DOCUMENTS) {
      const size=Math.min(BATCH_SIZE,MAX_DOCUMENTS-budget.count+1);
      const base=query.orderBy(FieldPath.documentId()),snap=await (cursor?base.startAfter(cursor):base).limit(size).get();
      budget.count+=snap.docs.length;
      if (budget.count>MAX_DOCUMENTS) fail('Consulta excede o limite seguro. Regularize ou particione o histórico antes de continuar.',503);
      result.push(...snap.docs.map(d=>({id:d.id,path:d.ref.path,data:d.data()})));
      if (snap.docs.length<size) return result;
      cursor=snap.docs.at(-1);
    }
    fail('Consulta excede o limite seguro.',503);
  }
  async function scopeFor(uid,storeId) {
    const scope=await authorize(uid);
    if (!scope.permissions?.clientes && !scope.permissions?.pedidos && !scope.permissions?.['nota-fiscal']) fail('Módulo não autorizado.');
    if (storeId==='__all__') {
      if (scope.role!=='dono') fail('Visão Geral exige acesso multiloja autorizado.');
      if (!scope.allStores) {
        const all=await read(db.collection('lojas').select('nome'),{count:0});
        if (!all.length || all.some(store=>!scope.stores?.includes(store.id))) fail('Visão Geral exige autorização para todas as lojas.');
      }
    } else if (!validId(storeId) || (!scope.allStores && !scope.stores?.includes(storeId))) fail('Loja não autorizada.');
    return scope;
  }
  async function load(storeId,scope) {
    const budget={count:0};
    const storeIds=storeId==='__all__'?(scope.allStores?(await read(db.collection('lojas').select('nome'),budget)).map(s=>s.id):scope.stores):[storeId];
    const customers=await read(db.collection('clientes').select(...profileFields,...identityFields),budget);
    const aliases=await read(db.collection('integrations/customerRegistry/aliases').select('state','customerId'),budget);
    const orders=[];
    for (const store of storeIds) orders.push(...await read(db.collection(`lojas/${store}/pedidos`).select(...orderFields),budget));
    if (storeId==='__all__') orders.push(...await read(db.collection('pedidos').select(...orderFields),budget));
    else for (const field of ['lojaId','storeId']) orders.push(...await read(db.collection('pedidos').where(field,'==',storeId).select(...orderFields),budget));
    return buildCustomerDirectory({customers,aliases,orders,storeIds,general:storeId==='__all__',includeRegistered:true});
  }
  async function list(uid,storeId) {
    const scope=await scopeFor(uid,storeId); // Recheck permissions before every cache hit.
    const key=JSON.stringify([storeId,storeId==='__all__'?scope.allStores:null,storeId==='__all__'?scope.stores:null]);
    let entry=cache.get(key);
    if (!entry || (!entry.pending && now()-entry.at>=CACHE_MS)) {
      if (cache.size>=8) cache.delete(cache.keys().next().value);
      entry={at:now(),pending:true,promise:null};
      entry.promise=load(storeId,scope).then(result=>{entry.at=now();entry.pending=false;return result;});cache.set(key,entry);
      entry.promise.catch(()=>{if(cache.get(key)===entry)cache.delete(key);});
    }
    const result=await entry.promise,canViewHistoryIssues=scope.role==='dono' && scope.permissions?.clientes===true;
    return {...result,canViewHistoryIssues,issues:canViewHistoryIssues?result.issues:[]};
  }
  async function detail(uid,storeId,id) {
    const {clients}=await list(uid,storeId);
    const canonicalId=validId(id)?await resolveCustomerId(id):null;
    const customer=clients.find(c=>c.id===canonicalId);
    if (!customer) fail('Cliente não autorizado nesta loja.',404);
    return customer;
  }
  return {list,detail,scopeFor,invalidate:()=>cache.clear()};
}
function mountStaffCustomerDirectory(app,service,verifyToken) {
  const route=handler=>async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try {const user=await verifyToken(req);return res.json(await handler(user.uid,req));}
    catch(error) {return res.status(error.httpStatus || ({unauthenticated:401,'permission-denied':403}[error.code]) || 503).json({message:error.message || 'Não foi possível carregar clientes.'});}
  };
  app.get('/clientes/diretorio',route(async(uid,req)=>{
    const result=await service.list(uid,req.query.lojaId);
    return {...result,clients:result.clients.filter(c=>req.query.usage==='crm' || req.query.lojaId==='__all__' || c.hasStoreHistory)};
  }));
  app.get('/clientes/:id',route((uid,req)=>service.detail(uid,req.query.lojaId,req.params.id)));
}
module.exports={buildCustomerDirectory,isCompletedPurchase,orderStore,createDirectoryAuthorizer,createStaffCustomerDirectory,mountStaffCustomerDirectory,MAX_DOCUMENTS,CACHE_MS};
