const {ROOT,REGISTRATIONS,activeRelationship,key}=require('./customer-store-relationship');
// CRM directory and store-local contact edits. No identity or order writes.
const {createHash} = require('node:crypto');
const {getOrderCreatedAt} = require('./customer-orders');
const {customerOwnerUids} = require('./customer-ownership');
const {canManageStores}=require('./store-owner-policy');
const {isClientStaffProfile} = require('./crm-client-edit');
const {OPERATIONAL_PROFILES, operationalFields, operationalRevision, sanitizeOperationalPatch}=require('./crm-operational-contact');
const {FieldPath,FieldValue} = require('firebase-admin/firestore');
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,150}$/.test(id);
const hash = id => createHash('sha256').update(id).digest('hex');
const fail = (message, status=403) => {throw Object.assign(new Error(message), {httpStatus:status});};
const profileFields = ['nome','email','telefone','cpf','documento','endereco','cep','bairro','cidade','uf','codigoIbge','aniversario','status','address','enderecos','criadoEm'];
const identityFields = ['canonicalStatus','canonicalCustomerId','identityRegistryVersion','legacyCustomerIds','authOwnerUid','authOwnerUids','lojasVisitadas','lojaId','lojaAtual','normalizedPhone','phone_number'];
const orderFields = ['clienteId','customerId','clientId','checkoutIdentity.mode','checkoutIdentity.legacyClientId','lojaId','storeId','status','order_status','paymentMode','formaPagamento','payment_status','paymentStatus','statusPagamento','paymentId','ownerUid','requiresReview','total','createdAt','dataPedido','data'];
const MAX_DOCUMENTS = 10000, BATCH_SIZE = 400, CACHE_MS = 5000;
function orderReadStore(order) {
  const nested = order.path.match(/^lojas\/([\w-]{1,150})\/pedidos\/[\w-]{1,150}$/)?.[1];
  if (nested) return nested;
  if (!/^pedidos\/[\w-]{1,150}$/.test(order.path)) return null;
  // Match canReadLegacyOrder: a present lojaId wins even when empty or null.
  if (Object.hasOwn(order.data, 'lojaId')) return order.data.lojaId;
  return Object.hasOwn(order.data, 'storeId') ? order.data.storeId : '';
}
function orderStore(order) {
  const store = orderReadStore(order);
  const fields = [order.data.lojaId, order.data.storeId].filter(x => x !== undefined && x !== null && x !== '');
  return validId(store) && fields.every(id => id === store) ? store : null;
}
const ruleOwnerRoles = ['dono','owner','admin','adm','administrador','administradora','administrador_master'];
const ruleStaffRoles = [...ruleOwnerRoles,'gerente','atendente','funcionario','contador','corretor'];
function directoryStoreScope(profile) {
  // Match the Rules' role checks and store precedence, rejecting malformed assignments.
  const {role, lojaIds, lojas, lojaId, permissions} = profile;
  if (!ruleStaffRoles.includes(role) || profile.ativo===false || profile.status==='inativo') {
    fail('Acesso restrito à equipe autorizada.');
  }
  if (['lojaIds','lojas'].some(field=>Object.hasOwn(profile,field) && !Array.isArray(profile[field]))) {
    fail('Atribuição de lojas inválida.');
  }
  const primary = Array.isArray(lojaId) ? lojaId : lojaId == null || lojaId === '' ? [] : [lojaId];
  if ([...(lojaIds || []), ...(lojas || []), ...primary].some(id=>!validId(id))) {
    fail('Atribuição de lojas inválida.');
  }
  const stores = [...new Set(lojaIds?.length ? lojaIds : lojas?.length ? lojas : primary)];
  // Only the canonical Dono role can have global directory access without an assignment.
  const allStores = role === 'dono' && stores.length === 0;
  if (!allStores && stores.length === 0) fail('Nenhuma loja autorizada.');
  if (role !== 'contador') return {allStores,stores,nestedStores:stores};
  const hasModule=['dashboard','pedidos','financeiro','relatorios','nota-fiscal'].some(module=>permissions?.[module]===true);
  const nestedStores=hasModule?stores.filter(store=>store===lojaId || (Array.isArray(lojaIds) && lojaIds.includes(store))):[];
  return {allStores,stores,nestedStores};
}
function canManageOperationalCustomerEdit(profile, existingStores, targetStores, custom) {
  if (profile?.role !== 'dono' || !canManageStores(profile, custom)) return false;
  let scope;
  try {
    scope = directoryStoreScope(profile);
  } catch (error) {
    if (error.httpStatus === 403) return false;
    throw error;
  }
  return [existingStores, targetStores].filter(stores => stores !== null).every(stores =>
    stores.every(id => validId(id) && id !== '__all__') &&
    (scope.allStores || stores.length > 0 && stores.every(id => scope.stores.includes(id))));
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
function buildCustomerDirectory({customers, aliases=[], orders, storeIds, general=false, includeRegistered=false, trustedRelationships=[], operational=false, registrations=[], allowUnassignedRoot=general, canEditStore=()=>false, operationalProfiles=[], historyId=null, includeOrderHistory=false}) {
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
  const trusted=new Map();
  for(const row of trustedRelationships) {const d=row.data; if(row.id===key(d.storeId,d.customerId)&&activeRelationship(d,d.storeId,d.customerId)&&stores.has(d.storeId)){const set=trusted.get(d.customerId)||new Set();set.add(d.storeId);trusted.set(d.customerId,set);}}
  const canReadProfileInStore = (id, store) => general || trusted.get(id)?.has(store);
  function operationalReference(id, store, storeLocal = false) {
    if (!validId(id)) return null;
    const canUseProfile = owner => storeLocal ? trusted.get(owner)?.has(store) : canReadProfileInStore(owner,store);
    if (canUseProfile(id) && records.has(id) && records.get(id).canonicalStatus!=='ALIAS') return id;
    // Only a canonical profile readable in this store can attest that its
    // reviewed historical IDs are equivalent. The global index plays no role.
    const authorized = [...(reviewed.get(id) || [])].filter(canUseProfile);
    if (authorized.length > 1) return null;
    return authorized[0] || id;
  }
  const clients = new Map(), metrics = new Map(), pendingMetrics = new Map(), issues = [];
  const issue = (order, reason) => {if (issues.length < 100) issues.push({orderPath:order.path,reason});};
  for (const record of customers) {
    if (operational ? (!validId(record.id) || record.data.canonicalStatus==='ALIAS') : canonical(record.id)!==record.id) continue;
    const profile=Object.fromEntries(profileFields.filter(k => Object.hasOwn(record.data,k)).map(k => [k,record.data[k]]));
    if (!profile.telefone) profile.telefone=record.data.normalizedPhone || record.data.phone_number || '';
    const registered=[...new Set([...(Array.isArray(record.data.lojasVisitadas)?record.data.lojasVisitadas:[]), record.data.lojaId,record.data.lojaAtual].filter(id=>stores.has(id)))];
    if(!general&&!trusted.has(record.id))continue;
    clients.set(record.id,{...profile,nome:typeof profile.nome==='string' && profile.nome.trim()?profile.nome:'Cliente sem nome',id:record.id,lojasVisitadas:general?registered:[...(trusted.get(record.id)||[])]});
    metrics.set(record.id,new Map());
    pendingMetrics.set(record.id,new Map());
  }
  const historical = new Map(), staffRegistered = new Set();
  const contactTargets = new Map();
  const savedContacts = new Map(operationalProfiles.map(row => [row.id, row.data]));

  function addContactTarget(directoryId, storeId, references, name, date = null) {
    if (!operational || !validId(storeId) || storeId === '__all__') return;
    // A global viewer may group reviewed identities that a store cannot group.
    // Derive each write target using only the store's own reviewed links.
    const ids = references.map(id => operationalReference(id, storeId, true));
    const customerId = ids[0];
    if (!customerId || ids.some(id => id !== customerId)) return;
    const id = key(storeId, customerId);
    const targets = contactTargets.get(directoryId) || new Map();
    contactTargets.set(directoryId, targets);
    const old = targets.get(id);
    if (!old || (!old.name && name) || (name && date && (!old.date || old.date < date))) {
      targets.set(id, {id, storeId, customerId, name, date});
    }
  }

  function contactData(target) {
    const {id, storeId, customerId, name} = target;
    const data = savedContacts.get(id);
    const saved = data?.storeId === storeId && data.customerId === customerId &&
      Number.isSafeInteger(data.version) && data.version > 0 ? data : null;
    const base = trusted.get(customerId)?.has(storeId) ? operationalFields(records.get(customerId)) : {};
    const fields = {...base, nome: base.nome || (typeof name === 'string' && name.trim().slice(0,150)) || 'Cliente histórico',
      ...operationalFields(saved?.fields)};
    const version = saved?.version || 0;
    return {id, storeId, fields, version, revision: operationalRevision(id, version, fields), canEdit: canEditStore(storeId) === true};
  }
  const sortedStores = [...stores].sort();
  function addOperationalRow(customerId, store, sourcePath, name, date) {
    // An opaque display row carries only data already present in this store's records.
    // It is never returned to profile/detail or order-selection callers.
    if (!historical.has(customerId)) {
      historical.set(customerId, {path:sourcePath, name:'', date:null});
      metrics.set(customerId,new Map());
      pendingMetrics.set(customerId,new Map());
      clients.set(customerId,{operationalOnly:true,lojasVisitadas:[]});
    }
    const row = historical.get(customerId);
    if (sourcePath < row.path) row.path = sourcePath;
    const text = typeof name === 'string' ? name.trim().slice(0,150) : '';
    if (text && (!row.name || (date && (!row.date || date > row.date)))) Object.assign(row,{name:text,date});
    const profile = clients.get(customerId);
    if (!profile.lojasVisitadas.includes(store)) profile.lojasVisitadas.push(store);
  }
  for (const row of registrations) {
    const {storeId,customerId,nome,createdAt} = row.data;
    if (!operational || !stores.has(storeId) || !validId(customerId) || row.id !== key(storeId,customerId)) continue;
    const id = operationalReference(customerId,storeId);
    if (!id) continue;
    staffRegistered.add(id);
    addContactTarget(id,storeId,[customerId],nome,getOrderCreatedAt({createdAt}));
    if (!clients.has(id) || historical.has(id)) addOperationalRow(id,storeId,row.path,nome,getOrderCreatedAt({createdAt}));
  }
  // Prefer the canonical store document over its legacy root mirror.
  const seenPaths=new Set(), unique=new Map(), conflicts=new Set();
  for (const order of [...orders].sort((a,b)=>Number(b.path.startsWith('lojas/'))-Number(a.path.startsWith('lojas/')))) {
    if (seenPaths.has(order.path)) continue; seenPaths.add(order.path);
    const readStore=orderReadStore(order);
    // Do not return either order contents or diagnostics about unreadable records.
    if (!stores.has(readStore) && !(readStore==='' && allowUnassignedRoot)) continue;
    const store=orderStore(order);
    if (!store) {issue(order,'STORE_UNRESOLVED_OR_CONFLICTING');continue;}
    if (!stores.has(store)) continue;
    const references=['clienteId','customerId','clientId'].map(k=>order.data[k]).filter(x=>x!==undefined && x!==null && x!=='');
    // This server-persisted legacy-phone reference predates clienteId in some orders.
    // It is an ID resolved by the same reviewed registry, never a phone/name join.
    if (order.data.checkoutIdentity?.mode==='legacy_phone' && order.data.checkoutIdentity.legacyClientId) references.push(order.data.checkoutIdentity.legacyClientId);
    if ((!references.length && order.data.checkoutIdentity?.mode==='guest') || (operational && references.length===1 && references[0]==='loja')) continue;
    const ids=references.map(id=>operational?operationalReference(id,store):canonical(id)), customerId=ids[0];
    if (!customerId || ids.some(id=>id!==customerId)) {issue(order,'CUSTOMER_UNRESOLVED_OR_CONFLICTING');continue;}
    if (order.data.ownerUid && records.has(customerId) && (!operational || canReadProfileInStore(customerId,store))
      && !customerOwnerUids(records.get(customerId)).includes(order.data.ownerUid)) {issue(order,'OWNER_CONFLICT');continue;}
    if (!operational && (!clients.has(customerId)||(!general&&!trusted.get(customerId)?.has(store)))) continue;
    const key=store+'/'+order.path.split('/').pop();
    if (conflicts.has(key)) continue;
    const previous=unique.get(key);
    if (!previous) unique.set(key,{order,store,customerId,references});
    else if (previous.customerId!==customerId || Number(previous.order.data.total)!==Number(order.data.total)) {
      unique.delete(key);conflicts.add(key);issue(order,'DUPLICATE_ORDER_CONFLICT');
    }
  }
  const payments=new Map(), eligible=[], relationships=new Map();
  for (const candidate of unique.values()) {
    const {order,store,customerId}=candidate;
    const completed=isCompletedPurchase(order.data), pending=isCompletedAgreedPending(order.data);
    if (!clients.has(customerId) || historical.has(customerId)) {
      if (!operational || !(completed || pending)) continue;
      addOperationalRow(customerId,store,order.path,order.data.clienteNome,getOrderCreatedAt(order.data));
    }
    const related=relationships.get(customerId) || new Set();related.add(store);relationships.set(customerId,related);
    if (pending) {
      addContactTarget(customerId,store,candidate.references,order.data.clienteNome,getOrderCreatedAt(order.data));
      const perStore=pendingMetrics.get(customerId),m=perStore.get(store) || {cents:0,count:0,latest:null};
      m.cents+=Math.round(Number(order.data.total)*100);if (!Number.isSafeInteger(m.cents)) fail('Total pendente excede o limite monetário seguro.',503);
      m.count++;const date=getOrderCreatedAt(order.data);if(date && (!m.latest || date>m.latest))m.latest=date;perStore.set(store,m);
    }
    if (!completed) continue;
    const paymentKey=order.data.paymentId && store+'/'+order.data.paymentId;
    if (paymentKey && payments.has(paymentKey)) {
      const previous=payments.get(paymentKey);
      if (previous.customerId!==customerId || Number(previous.order.data.total)!==Number(order.data.total)) previous.conflict=true;
      issue(order,previous.conflict?'DUPLICATE_PAYMENT_CONFLICT':'DUPLICATE_PAYMENT_REFERENCE');continue;
    }
    if (paymentKey) payments.set(paymentKey,candidate);
    eligible.push(candidate);
  }
  for (const {order,store,customerId,conflict,references} of eligible) {
    if (conflict) continue;
    addContactTarget(customerId,store,references,order.data.clienteNome,getOrderCreatedAt(order.data));
    const perStore=metrics.get(customerId); if (!perStore) continue;
    const metric=perStore.get(store) || {cents:0,numeroDeCompras:0,ultimaCompra:null};
    const cents=metric.cents+Math.round(Number(order.data.total)*100);
    if (!Number.isSafeInteger(cents)) fail('Total histórico excede o limite monetário seguro.',503);
    metric.cents=cents; metric.numeroDeCompras++;
    const date=getOrderCreatedAt(order.data);
    if (date && (!metric.ultimaCompra || date>metric.ultimaCompra)) metric.ultimaCompra=date;
    perStore.set(store,metric);
  }
  const output=[], operationalClients=[];
  let history, historyTargets;
  for (const [id,profile] of clients) {
    const perStore=metrics.get(id),pending=pendingMetrics.get(id),hasPurchases=perStore.size>0,hasHistory=hasPurchases || pending.size>0;
    if (profile.operationalOnly && !hasHistory && !staffRegistered.has(id)) continue;
    if (!general && !hasHistory && !staffRegistered.has(id) && !(includeRegistered && (profile.lojasVisitadas.length || relationships.has(id)))) continue;
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
    const row=historical.get(id);
    const display=row?{...profile,id:'historico:'+hash(JSON.stringify([sortedStores,row.path])),nome:row.name || 'Cliente histórico'}:profile;
    const entry={...display,...(staffRegistered.has(id)?{staffRegistered:true}:{}),lojasVisitadas:[...new Set([...profile.lojasVisitadas,...(relationships.get(id) || []),...perStore.keys()])],
      hasStorePurchases:hasPurchases,hasStoreHistory:hasHistory,numeroDeCompras:count,valorEmCompras:cents/100,ultimaCompra:latest,
      valorPendente:pendingCents/100,pedidosPendentes:pendingCount,ultimoPedidoPendente:pendingLatest,metricasComprasPorLoja:scoped};
    if (operational) {
      for (const store of trusted.get(id) || []) addContactTarget(id,store,[id],profile.nome);
      const targets = contactTargets.get(id);
      entry.canEditProfile = Boolean(!row && storeIds.length === 1 && canEditStore(storeIds[0]) && trusted.get(id)?.has(storeIds[0]));
      entry.canEditOperational = Boolean(targets && [...targets.values()].some(target => canEditStore(target.storeId)));
      if (targets?.size === 1) {
        const target = targets.values().next().value;
        // A contact override changes only the directory display, not the canonical profile.
        const data = savedContacts.get(target.id);
        if (data) Object.assign(entry, contactData(target).fields);
      }
    }
    (row?operationalClients:output).push(entry);
    if (operational && historyId === entry.id) {
      historyTargets = [...(contactTargets.get(id)?.values() || [])];
      const cadastros = historyTargets.map(target => {
        const {version, ...contact} = contactData(target);
        return contact;
      });
      history = {nome: entry.nome, cadastros, metricasComprasPorLoja: scoped, pedidos: null, totalPedidos: count+pendingCount};
      if (includeOrderHistory) {
        const summarize = ({order,store}, payment) => ({
          referencia: order.path.split('/').at(-1),
          lojaId: store,
          data: getOrderCreatedAt(order.data),
          valor: Math.round(Number(order.data.total)*100)/100,
          pagamento: payment,
        });
        const confirmed = eligible.filter(order=>order.customerId===id && !order.conflict);
        const waiting = [...unique.values()].filter(order=>order.customerId===id && isCompletedAgreedPending(order.order.data));
        history.pedidos = [
          ...confirmed.map(order=>summarize(order,'confirmado')),
          ...waiting.map(order=>summarize(order,'pendente')),
        ].sort((a,b)=>(b.data || '').localeCompare(a.data || '')).slice(0,100);
      }
    }
  }
  return {clients:output,issues,...(operational?{operationalClients}:{}),...(history?{history,historyTargets}:{})};
}
function createDirectoryAuthorizer({db,assertActiveUser,normalizeRole,sanitizePermissions}) {
  return async (uid, tx=null)=>{
    const profile=await assertActiveUser(uid,tx),role=normalizeRole(profile.role);
    if (!['dono','gerente','atendente','contador'].includes(role)) fail('Acesso restrito à equipe.');
    const storeScope=directoryStoreScope(profile);
    const ref=db.doc('customProfiles/'+uid);
    const custom=(await (tx?tx.get(ref):ref.get())).data() || {};
    const configured=custom.permissions || profile.permissions;
    const permissions=sanitizePermissions(configured,role);
    const editGrant = custom.permissionDetails?.clientes?.edit_operational_customer;
    const editAllowed = editGrant === true ||
      (editGrant === undefined && profile.role === 'dono' && storeScope.allStores && canManageStores(profile, custom));
    return {role,...storeScope,scopedGeneral:profile.role==='dono',
      canEditStore:storeId=>editAllowed && permissions.clientes===true && (!Object.hasOwn(configured || {}, 'clientes') || configured.clientes===true) &&
        (storeScope.allStores || storeScope.stores.includes(storeId)) && isClientStaffProfile(profile,storeId),
      permissions};
  };
}
function createStaffCustomerDirectory({db,authorize,resolveCustomerId=async id=>id}) {

  async function read(query,budget,tx=null) {
    const result=[];let cursor=null;
    while (budget.count<=MAX_DOCUMENTS) {
      const size=Math.min(BATCH_SIZE,MAX_DOCUMENTS-budget.count+1);
      const base=query.orderBy(FieldPath.documentId()), page=(cursor?base.startAfter(cursor):base).limit(size);
      const snap=await (tx?tx.get(page):page.get());
      budget.count+=snap.docs.length;
      if (budget.count>MAX_DOCUMENTS) fail('Consulta excede o limite seguro. Regularize ou particione o histórico antes de continuar.',503);
      result.push(...snap.docs.map(d=>({id:d.id,path:d.ref.path,data:d.data()})));
      if (snap.docs.length<size) return result;
      cursor=snap.docs.at(-1);
    }
    fail('Consulta excede o limite seguro.',503);
  }
  async function scopeFor(uid,storeId,operational=false,tx=null) {
    const scope=await authorize(uid,tx);
    if (!scope.permissions?.clientes && !scope.permissions?.pedidos && !scope.permissions?.['nota-fiscal']) fail('Módulo não autorizado.');
    if (operational && scope.permissions?.clientes!==true) fail('Gestão de Clientes exige permissão do módulo Clientes.');
    if (storeId==='__all__') {
      if (scope.role!=='dono') fail('Visão Geral exige acesso multiloja autorizado.');
      if (!scope.allStores && !(operational && scope.scopedGeneral)) {
        const all=await read(db.collection('lojas').select('nome'),{count:0});
        if (!all.length || all.some(store=>!scope.stores?.includes(store.id))) fail('Visão Geral exige autorização para todas as lojas.');
      }
    } else if (!validId(storeId) || (!scope.allStores && !scope.stores?.includes(storeId))) fail('Loja não autorizada.');
    return scope;
  }
  async function load(storeId,scope,operational=false,historyId=null,tx=null) {
    const budget={count:0};
    const readScoped=query=>read(query,budget,tx);
    const general=storeId==='__all__' && scope.allStores===true;
    const storeIds=general?(await readScoped(db.collection('lojas').select('nome'))).map(s=>s.id):
      storeId==='__all__'?scope.stores:[storeId];
    const nestedStores=scope.nestedStores ?? scope.stores;
    const trustedRelationships=[],registrations=[],operationalProfiles=[];
    for(const store of storeIds) trustedRelationships.push(...await readScoped(db.collection(ROOT).where('storeId','==',store)));
    if (operational) for (const store of storeIds) registrations.push(...await readScoped(db.collection(REGISTRATIONS).where('storeId','==',store).select('storeId','customerId','nome','createdAt')));
    if (operational) for (const store of storeIds) operationalProfiles.push(...await readScoped(
      db.collection(OPERATIONAL_PROFILES).where('storeId','==',store).select('storeId','customerId','fields','version')));
    let customers=[];
    if(general)customers=await readScoped(db.collection('clientes').select(...profileFields,...identityFields));
    else {
      const ids=[...new Set(trustedRelationships.filter(row=>storeIds.includes(row.data.storeId)&&row.id===key(row.data.storeId,row.data.customerId)&&activeRelationship(row.data,row.data.storeId,row.data.customerId)).map(row=>row.data.customerId))];
      // Fetch only authorized canonical profiles; never cache authorization.
      for(let i=0;i<ids.length;i+=10)customers.push(...await readScoped(db.collection('clientes').where(FieldPath.documentId(),'in',ids.slice(i,i+10)).select(...profileFields,...identityFields)));
    }
    const aliases=operational?[]:await readScoped(db.collection('integrations/customerRegistry/aliases').select('state','customerId'));
    const orders=[];
    const fields=operational?[...orderFields,'clienteNome']:orderFields;
    for (const store of storeIds.filter(id=>scope.allStores || nestedStores.includes(id))) {
      orders.push(...await readScoped(db.collection(`lojas/${store}/pedidos`).select(...fields)));
    }
    if (general) orders.push(...await readScoped(db.collection('pedidos').select(...fields)));
    else for (const store of storeIds) {
      for (const field of ['lojaId','storeId']) {
        const results=await readScoped(db.collection('pedidos').where(field,'==',store).select(...fields));
        orders.push(...results.filter(order=>orderReadStore(order)===store));
      }
    }
    return buildCustomerDirectory({
      customers,aliases,orders,storeIds,trustedRelationships,general,includeRegistered:true,operational,registrations,historyId,
      operationalProfiles, canEditStore: scope.canEditStore,
      includeOrderHistory: scope.permissions?.pedidos===true,
    });
  }
  async function list(uid,storeId,operational=false) {
    const scope=await scopeFor(uid,storeId,operational); // Recheck user scope on every request.
    // Relationship revocation must take effect on every request, including aliases.
    const result=await load(storeId,scope,operational),canViewHistoryIssues=scope.role==='dono' && scope.permissions?.clientes===true;
    return {...result,canViewHistoryIssues,issues:canViewHistoryIssues?result.issues:[]};
  }
  async function detail(uid,storeId,id) {
    const {clients}=await list(uid,storeId);
    const canonicalId=validId(id)?await resolveCustomerId(id):null;
    const customer=clients.find(c=>c.id===canonicalId);
    if (!customer) fail('Cliente não autorizado nesta loja.',404);
    return customer;
  }
  async function history(uid,storeId,id) {
    const scope=await scopeFor(uid,storeId,true);
    if (!validId(id) && !/^historico:[0-9a-f]{64}$/.test(id)) fail('Histórico não disponível nesta loja.',404);
    const result=await load(storeId,scope,true,id);
    if (!result.history) fail('Histórico não disponível nesta loja.',404);
    return result.history;
  }
  async function editOperationalContact(uid,viewId,id,input) {
    return db.runTransaction(async tx => {
      const scope = await scopeFor(uid,viewId,true,tx);
      const {storeId, targetId, revision, fields} = input || {};
      if (!validId(storeId) || storeId === '__all__' || (viewId !== '__all__' && viewId !== storeId) ||
          !scope.canEditStore?.(storeId)) fail('Edição de clientes não autorizada nesta loja.');
      if ((!validId(id) && !/^historico:[0-9a-f]{64}$/.test(id)) ||
          typeof targetId !== 'string' || !/^[0-9a-f]{64}$/.test(targetId) ||
          typeof revision !== 'string' || !/^[0-9a-f]{64}$/.test(revision)) fail('Cadastro da loja inválido.',400);
      const patch = sanitizeOperationalPatch(fields);
      if (!(await tx.get(db.doc('lojas/'+storeId))).exists) fail('Loja não disponível.',404);
      const current = await load(viewId,scope,true,id,tx);
      const target = current.historyTargets?.find(item => item.id === targetId && item.storeId === storeId);
      if (!target) fail('Cadastro operacional não disponível nesta loja.',404);
      const contact = current.history.cadastros.find(item => item.id === targetId);
      if (contact.revision !== revision) fail('Cadastro atualizado. Reabra a edição para carregar os dados atuais.',409);
      const changedFields = Object.keys(patch).filter(field => patch[field] !== (contact.fields[field] ?? ''));
      if (!changedFields.length) return {updated:false};
      const ref = db.doc(OPERATIONAL_PROFILES+'/'+target.id);
      const previous = await tx.get(ref);
      const saved = previous.data();
      if (saved && (saved.storeId !== storeId || saved.customerId !== target.customerId ||
          !Number.isSafeInteger(saved.version) || saved.version < 1 || saved.version >= Number.MAX_SAFE_INTEGER)) {
        fail('Cadastro operacional requer conferência.',409);
      }
      const version = (saved?.version || 0) + 1;
      const updatedAt = FieldValue.serverTimestamp();
      const updates = Object.fromEntries(changedFields.map(field => [field,patch[field]]));
      tx.set(ref,{storeId,customerId:target.customerId,fields:{...operationalFields(saved?.fields),...updates},version,updatedAt});
      tx.create(ref.collection('audit').doc(String(version)),{actorUid:uid,storeId,changedFields,updatedAt});
      return {updated:true};
    });
  }
  return {list,detail,history,editOperationalContact,scopeFor,invalidate:()=>{}};
}
function mountStaffCustomerDirectory(app,service,verifyToken) {
  const route=handler=>async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try {const user=await verifyToken(req);return res.json(await handler(user.uid,req));}
    catch(error) {
      const status = error.httpStatus || ({unauthenticated:401,'permission-denied':403}[error.code]) || 503;
      return res.status(status).json({message: status === 503 && !error.httpStatus
        ? 'Não foi possível concluir a operação de clientes.' : error.message || 'Não foi possível carregar clientes.'});
    }
  };
  app.get('/clientes/diretorio',route(async(uid,req)=>{
    const operational=req.query.usage==='gestao';
    const result=await service.list(uid,req.query.lojaId,operational);
    return {...result,clients:result.clients.filter(c=>operational || req.query.usage==='crm' || req.query.lojaId==='__all__' || c.hasStoreHistory)};
  }));
  app.get('/clientes/diretorio/historico/:id',route((uid,req)=>service.history(uid,req.query.lojaId,req.params.id)));
  app.put('/clientes/diretorio/historico/:id',route((uid,req)=>service.editOperationalContact(uid,req.query.lojaId,req.params.id,req.body)));
  app.get('/clientes/:id',route((uid,req)=>service.detail(uid,req.query.lojaId,req.params.id)));
}
module.exports={canManageOperationalCustomerEdit,buildCustomerDirectory,isCompletedPurchase,orderStore,createDirectoryAuthorizer,createStaffCustomerDirectory,mountStaffCustomerDirectory,MAX_DOCUMENTS,CACHE_MS};
