const {loadStoreFreightConfig, validateFreightCoordinates} = require('./freight-core');
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,150}$/.test(value);
const error = (code, status = 409) => Object.assign(new Error(code), {code, httpStatus: status});
const ready = value => value ? 'READY' : 'BLOCKED';
const cleanText = value => typeof value === 'string' ? value.trim().slice(0,160) : '';
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
// Directory eligibility is independent of schedule/freight/payment readiness.
// Shared with full resolution so the lightweight list cannot advertise drafts.
function catalogIdentity(store,definition,hasDefinition) {
  const v1=Object.prototype.hasOwnProperty.call(store,'storeConfigVersion') || hasDefinition;
  const validContract=!v1 || (store.storeConfigVersion===1 && definition.schemaVersion===1);
  const active=validContract && Boolean(cleanText(store.nome)) && store.ativo!==false && store.ativa!==false &&
    !['inactive','inativo','draft','incomplete'].includes(String(store.status || '').toLowerCase()) && (!v1 || store.ativo===true);
  return {v1,active,category:cleanText(definition.catalog?.category) || (!v1?'Delivery':''),catalogEnabled:!v1 || definition.catalog?.enabled===true};
}
function publicSchedule(config = {}) {
  const schedule = {};
  for (const day of ['sun','mon','tue','wed','thu','fri','sat']) {
    const d = config.schedule?.[day];
    if (d && typeof d.enabled === 'boolean') schedule[day] = {enabled:d.enabled,
      ...(typeof d.open === 'string' ? {open:d.open.slice(0,5)} : {}),
      ...(typeof d.close === 'string' ? {close:d.close.slice(0,5)} : {})};
  }
  return {timezone:cleanText(config.timezone), schedule};
}
// Admin-only reads. No arbitrary documents/config objects are serialized to the browser.
function createStoreResolver({db, getAvailability, loadPaymentConfig}) {
  async function resolve(storeId, {channelId = null} = {}) {
    if (!validId(storeId) || (channelId !== null && !validId(channelId))) throw error('STORE_NOT_FOUND',404);
    const root = `lojas/${storeId}`;
    const [storeSnap, configSnap, storefrontSnap] = await db.getAll(...[root, `${root}/configuracoes/config`, `${root}/configuracoes/storefront`].map(p=>db.doc(p)));
    if (!storeSnap.exists) throw error('STORE_NOT_FOUND',404);
    const store = storeSnap.data() || {}, config = configSnap.data() || {}, definition = storefrontSnap.data() || {};
    const {v1,active,category:storeCategory,catalogEnabled}=catalogIdentity(store,definition,storefrontSnap.exists);
    let channel = null;
    if (channelId) {
      const snap = await db.doc(`${root}/canais/${channelId}`).get();
      const data = snap.data();
      if (!snap.exists || data?.enabled !== true || data.storeId !== storeId) throw error('CHANNEL_UNAVAILABLE',404);
      channel = {id:channelId, name:cleanText(data.name), catalogCategory:cleanText(data.catalogCategory)};
    }
    const category = channel?.catalogCategory || storeCategory;
    const catalog = active && Boolean(category) && catalogEnabled;
    const availability = getAvailability(config);
    const scheduleReady = active && availability !== 'CONFIG_UNAVAILABLE' &&
      (!v1 || getAvailability({...config,manualOverride:{mode:'auto'}}) !== 'CONFIG_UNAVAILABLE');
    const pickup = catalog && (!v1 || definition.pickup?.enabled === true);
    const deliveryEnabled = active && (!v1 || definition.delivery?.enabled === true);
    let freight = null;
    if (deliveryEnabled) {
      try {
        freight = await loadStoreFreightConfig({db, storeId, primaryData:config});
        if (freight.freteACombinar !== true) {
          validateFreightCoordinates(freight);
          if (!nonnegative(Number(freight.valorPorKm)) || freight.valorPorKm == null || freight.valorPorKm === '') throw error('FREIGHT_INVALID');
          // Legacy minimum is preserved only for pre-V1 stores, never inherited by V1.
          if (v1 && !nonnegative(freight.valorMinimoFrete)) throw error('FREIGHT_MINIMUM_REQUIRED');
        }
      } catch {freight = null;}
    }
    let payment = null;
    const onlineEnabled = active && (!v1 || definition.onlinePayment?.enabled === true);
    if (onlineEnabled) {try {payment = await loadPaymentConfig(storeId);} catch { /* fail closed per domain */ }}
    const delivery = catalog && deliveryEnabled && Boolean(freight);
    const paymentReady = catalog && onlineEnabled && Boolean(payment);
    const publicConfig = {
      storeId, name:cleanText(store.nome), active,
      catalog:{enabled:catalog && Boolean(category), category},
      schedule:{...publicSchedule(config), effectiveAvailability:scheduleReady ? availability : 'CONFIG_UNAVAILABLE'},
      pickup:{enabled:pickup}, delivery:{enabled:deliveryEnabled, available:delivery},
      onlinePayment:{enabled:onlineEnabled, available:paymentReady},
      readiness:{store:ready(active), catalog:ready(catalog && Boolean(category)), schedule:ready(scheduleReady),
        pickup:ready(pickup), delivery:ready(delivery), payment:ready(paymentReady)},
      ...(channel ? {channel} : {}),
    };
    return {publicConfig, freight, payment, legacy:!v1};
  }
  async function publicConfig(input = {}) {
    let {storeId, channelId} = input;
    if (input.alias) {
      if (!validId(input.alias)) throw error('STORE_NOT_FOUND',404);
      const snap = await db.doc(`storefrontAliases/${input.alias}`).get(), alias = snap.data();
      if (!snap.exists || alias?.enabled !== true || !validId(alias.storeId)) throw error('STORE_NOT_FOUND',404);
      // An alias selects only a store/channel; it never supplies commercial configuration.
      storeId = alias.storeId; channelId = alias.channelId || null;
    }
    return (await resolve(storeId,{channelId:channelId || null})).publicConfig;
  }
  async function list({cursor} = {}) {
    if (cursor && !validId(cursor)) throw error('INVALID_CURSOR',400);
    let query = db.collection('lojas').orderBy('__name__').limit(20);
    if (cursor) query = query.startAfter(cursor);
    const snapshots = await query.get();
    const definitions=snapshots.docs.length ? await db.getAll(...snapshots.docs.map(doc=>db.doc(`lojas/${doc.id}/configuracoes/storefront`))) : [];
    // At most20 channel queries concurrently, already bounded by the existing
    // directory page. No config/payment/freight reads or per-channel rereads.
    const pages=await Promise.all(snapshots.docs.map(async(doc,index)=>{
      if(!validId(doc.id)) return [];
      const store=doc.data() || {},definition=definitions[index];
      const identity=catalogIdentity(store,definition.data() || {},definition.exists);
      if(!identity.active || !identity.category || !identity.catalogEnabled) return [];
      const entries=[{storeId:doc.id,name:cleanText(store.nome)}];
      const channels=await db.collection(`lojas/${doc.id}/canais`).where('listed','==',true).limit(20).get();
      for(const channel of channels.docs) {
        const data=channel.data();
        if(validId(channel.id) && data?.enabled===true && data.storeId===doc.id)entries.push({storeId:doc.id,name:cleanText(data.name),channelId:channel.id});
      }
      return entries;
    }));
    const stores=pages.flat();
    return {stores,nextCursor:snapshots.docs.length === 20 ? snapshots.docs.at(-1).id : null};
  }
  return {resolve,publicConfig,list};
}
function mountStoreRoutes(app, resolver) {
  const sendError = (res,e) => res.status(e.httpStatus || 503).json({code:e.code || 'STORE_CONFIG_UNAVAILABLE'});
  app.get('/store/public-config', async (req,res)=>{
    res.set('Cache-Control','no-cache, max-age=0, must-revalidate');
    try {res.json(await resolver.publicConfig(req.query));} catch(e) {sendError(res,e);}
  });
  app.get('/store/public-list', async (req,res)=>{
    res.set('Cache-Control','no-cache, max-age=0, must-revalidate');
    try {res.json(await resolver.list(req.query));} catch(e) {sendError(res,e);}
  });
  // Applies only to new sales/quotes, never webhook, reconciliation, or existing payments.
  app.use(async (req,res,next)=>{
    // Express routes accept case variants and a trailing slash by default.
    const path = req.path.toLowerCase().replace(/\/+$/,'') || '/';
    if (!['/produtos','/pedidos','/checkout/confirmar','/frete/calcular','/checkout/config'].includes(path)) return next();
    const storeId = req.query.lojaId || req.body?.lojaId;
    if (!storeId) return next(); // Existing missing-parameter contract.
    try {
      const {publicConfig:c} = await resolver.resolve(storeId);
      if (!c.active) throw error('STORE_INACTIVE',403);
      if (c.readiness.catalog !== 'READY') throw error('CATALOG_UNAVAILABLE');
      if (['/pedidos','/checkout/confirmar'].includes(path) && req.method === 'POST') {
        const pickup = (req.body?.cliente?.endereco || req.body?.clienteEndereco) === 'Retirar na Loja';
        if (c.readiness.schedule !== 'READY') throw error('CONFIG_UNAVAILABLE',503);
        if (c.schedule.effectiveAvailability !== 'OPEN') throw error('STORE_CLOSED',403);
        if (c.readiness[pickup ? 'pickup' : 'delivery'] !== 'READY') throw error(pickup ? 'PICKUP_UNAVAILABLE' : 'DELIVERY_UNAVAILABLE');
        if (req.body?.pagamento?.forma === 'Online' && c.readiness.payment !== 'READY') throw error('PAYMENT_UNAVAILABLE',503);
      }
      if (path === '/frete/calcular' && c.readiness.delivery !== 'READY') throw error('DELIVERY_UNAVAILABLE');
      if (path === '/checkout/config') return res.json({enabled:c.onlinePayment.available});
      return next();
    } catch(e) {return sendError(res,e);}
  });
}
module.exports = {createStoreResolver,mountStoreRoutes,validId};
