const crypto = require('crypto');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');

const secretManager = new SecretManagerServiceClient();
const tokenCache = new Map();

const PROVIDER = 'food99';
const DEFAULT_API_URL = 'https://openapi.didi-food.com';
const DEFAULT_AUTH_URL = 'https://openapi.didi-food.com';
const DEFAULT_FOOD99_ENVIRONMENT = 'production';
const AUTH_TOKEN_GET_PATH = '/v1/auth/authtoken/get';
const AUTH_TOKEN_REFRESH_PATH = '/v1/auth/authtoken/refresh';
const ORDER_DETAIL_PATH = '/v1/order/order/detail';
const ORDER_CONFIRM_PATH = '/v1/order/order/confirm';
const ORDER_CANCEL_PATH = '/v1/order/order/cancel';
const ORDER_READY_PATH = '/v1/order/order/ready';
const ORDER_DELIVERED_PATH = '/v1/order/order/delivered';
const SHOP_DETAIL_PATH = '/v1/shop/shop/detail';
const CATALOG_LIST_PATH = '/v3/item/item/list';
const CATALOG_UPLOAD_PATH = '/v3/item/item/upload';
const ITEM_STATUS_PATH = '/v3/item/item/updateItemStatus';
const CATALOG_CACHE_DOC_ID = 'catalogCache';
const CATALOG_CACHE_TTL_MS = 120 * 1000;
const ACTIVE_EXTERNAL_STATUSES = new Set([
  'PLACED',
  'CONFIRMED',
  'PREPARATION_STARTED',
  'READY_TO_PICKUP',
  'DISPATCHED',
]);
const TERMINAL_EXTERNAL_STATUSES = new Set(['CONCLUDED', 'CANCELLED']);
const LIFECYCLE_EXTERNAL_STATUSES = new Set([...ACTIVE_EXTERNAL_STATUSES, ...TERMINAL_EXTERNAL_STATUSES]);
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const cleanText = (value) => String(value || '').trim();
const normalizeLookupText = (value) => cleanText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const money = (value) => Math.round((asNumber(value) + Number.EPSILON) * 100) / 100;
const centsToMoney = (value) => money(asNumber(value) / 100);
const moneyToCents = (value) => Math.round(money(value) * 100);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timestampNow = () => new Date().toISOString();
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const truncate = (value, maxLength) => cleanText(value).slice(0, maxLength);

const maskSecret = (value) => {
  const text = cleanText(value);
  if (!text) return '';
  if (text.length <= 4) return '*'.repeat(text.length);
  return `****${text.slice(-4)}`;
};

const fingerprintSecret = (value) => {
  const text = String(value || '');
  return text ? crypto.createHash('sha256').update(text).digest('hex').slice(0, 16) : '';
};

const describeValue = (value) => {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(describeValue).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const preferred = [
      value.message,
      value.error,
      value.description,
      value.detail,
      value.details,
      value.reason,
      value.code,
    ].map(describeValue).filter(Boolean);
    const knownLists = [
      value.unauthorizedMerchants && `merchants sem permissao: ${describeValue(value.unauthorizedMerchants)}`,
      value.errors && `erros: ${describeValue(value.errors)}`,
      value.violations && `violacoes: ${describeValue(value.violations)}`,
    ].filter(Boolean);
    const combined = [...preferred, ...knownLists].join(' | ');
    return combined || JSON.stringify(value);
  }
  return String(value);
};

const food99ErrorDetail = (payload = {}) => {
  const detail = describeValue(payload);
  return detail || 'sem detalhe';
};

const normalizeEnvironment = (value) => {
  const normalized = cleanText(value).toLowerCase();
  if (['sandbox', 'homologacao', 'homologação', 'test', 'teste'].includes(normalized)) return 'sandbox';
  if (['production', 'producao', 'produção', 'prod'].includes(normalized)) return 'production';
  return DEFAULT_FOOD99_ENVIRONMENT;
};

const getRequestIp = (request) => {
  const raw = request.rawRequest || {};
  const headers = raw.headers || {};
  const forwarded = cleanText(headers['x-forwarded-for'] || headers['x-appengine-user-ip']);
  if (forwarded) return forwarded.split(',')[0].trim();
  return cleanText(raw.ip || raw.connection?.remoteAddress || '');
};

const hasGlobalConfigPayload = (payload = {}) => [
  'clientId',
  'clientSecret',
  'webhookSecret',
  'apiBaseUrl',
  'authUrl',
  'webhookUrl',
  'environment',
  'inventoryEndpointTemplate',
  'inventoryMethod',
].some((field) => isNonEmptyString(payload[field]));

const getProjectId = () => {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GCP_PROJECT) return process.env.GCP_PROJECT;
  try {
    return JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId || '';
  } catch (error) {
    return '';
  }
};

const safeId = (value) => cleanText(value)
  .toLowerCase()
  .replace(/[^a-z0-9_-]/g, '_')
  .replace(/_+/g, '_')
  .slice(0, 110);

const normalizeSecretLabelPart = (value, fallback) => {
  let normalized = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/[^a-z0-9]+$/, '')
    .slice(0, 63);
  if (!normalized) normalized = fallback;
  if (!/^[a-z]/.test(normalized)) normalized = `${fallback}_${normalized}`;
  return normalized.slice(0, 63).replace(/[^a-z0-9]+$/, '') || fallback;
};

const normalizeSecretLabels = (labels = {}) => Object.entries(labels)
  .filter(([, value]) => value != null && value !== '')
  .reduce((normalized, [key, value]) => {
    normalized[normalizeSecretLabelPart(key, 'label')] = normalizeSecretLabelPart(value, 'value');
    return normalized;
  }, {});

const secretName = (projectId, secretId) => `projects/${projectId}/secrets/${secretId}`;

const ensureSecret = async (projectId, secretId, labels) => {
  const name = secretName(projectId, secretId);
  try {
    await secretManager.getSecret({name});
    return name;
  } catch (error) {
    if (error.code !== 5 && error.code !== 'NOT_FOUND') throw error;
  }
  const [created] = await secretManager.createSecret({
    parent: `projects/${projectId}`,
    secretId,
    secret: {
      replication: {automatic: {}},
      labels: normalizeSecretLabels(labels),
    },
  });
  return created.name;
};

const addSecretVersion = async (resourceName, value) => {
  const [version] = await secretManager.addSecretVersion({
    parent: resourceName,
    payload: {data: Buffer.from(String(value), 'utf8')},
  });
  return version.name;
};

const accessSecret = async (versionName) => {
  if (!versionName) return '';
  const [version] = await secretManager.accessSecretVersion({name: versionName});
  return version.payload?.data?.toString('utf8') || '';
};

const extractStoreId = (configDoc) => configDoc.ref.parent.parent?.id || '';

const normalizeExternalStatus = (event, detail = {}) => {
  const raw = cleanText(
    event.fullCode
    || event.code
    || event.event_type
    || event.eventType
    || event.event
    || event.type
    || event.biz_type
    || detail.status
    || detail.order_status
    || detail.orderStatus
  ).toUpperCase();
  if (raw.includes('CANCEL') || asNumber(detail.cancel_time) > 0) return 'CANCELLED';
  if (raw.includes('COMPLETE') || raw.includes('FINISH') || raw.includes('DELIVER') || asNumber(detail.complete_time) > 0) return 'CONCLUDED';
  if (raw.includes('READY')) return 'READY_TO_PICKUP';
  if (raw.includes('CONFIRM') || raw.includes('ACCEPT') || asNumber(detail.shop_confirm_time) > 0 || asNumber(detail.shop_accept_status) > 0) {
    return 'CONFIRMED';
  }
  return 'PLACED';
};

const appStatusForExternalStatus = (status) => {
  if (status === 'PLACED') return 'Pendente';
  if (status === 'CONFIRMED' || status === 'PREPARATION_STARTED') return 'Em Preparo';
  if (status === 'READY_TO_PICKUP') return 'Pronto';
  if (status === 'DISPATCHED') return 'Saiu para Entrega';
  if (status === 'CONCLUDED') return 'Finalizado';
  if (status === 'CANCELLED') return 'Cancelado';
  return 'Pendente';
};

const itemExternalIds = (item = {}) => [
  item.app_item_id,
  item.app_external_id,
  item.item_id,
  item.id,
  item.sku_id,
  item.externalCode,
].map(cleanText).filter(Boolean);

const itemPrice = (item = {}) => money(
  centsToMoney(
    item.sku_price
    ?? item.price
    ?? (asNumber(item.total_price ?? item.real_price) / Math.max(1, asNumber(item.amount ?? item.quantity, 1)))
  )
);

const catalogItemPrice = (item = {}) => money(
  centsToMoney(item.price ?? item.itemPrice ?? 0)
);

const extractOrderIds = (payload) => {
  const found = new Set();
  const visitOrderValue = (node) => {
    if (node == null) return;
    if (typeof node === 'string' || typeof node === 'number') {
      const id = cleanText(node);
      if (id && id.toLowerCase() !== 'null') found.add(id);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visitOrderValue);
      return;
    }
    if (typeof node === 'object') visit(node);
  };
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    Object.entries(node).forEach(([key, value]) => {
      const normalizedKey = cleanText(key).toLowerCase();
      if (['order_id', 'orderid', 'order_id_list', 'orderids'].includes(normalizedKey)) {
        visitOrderValue(value);
      }
      visit(value);
    });
  };
  visit(payload);
  return [...found];
};

const normalizeOrderDetail = (event, detail, mappingIndex) => {
  const data = detail.data || detail;
  const sourceItems = Array.isArray(data.order_items)
    ? data.order_items
    : (Array.isArray(data.items) ? data.items : (Array.isArray(event.metadata?.items) ? event.metadata.items : []));
  const eventStatus = normalizeExternalStatus(event, {});
  const detailStatus = normalizeExternalStatus({}, data);
  const status = LIFECYCLE_EXTERNAL_STATUSES.has(eventStatus)
    ? eventStatus
    : (detailStatus || eventStatus);
  const items = sourceItems.map((item, index) => {
    const externalIds = itemExternalIds(item);
    const mapping = externalIds.map((id) => mappingIndex.get(id)).find(Boolean) || null;
    const quantity = Math.max(1, asNumber(item.amount ?? item.quantity, 1));
    const price = itemPrice(item);
    return {
      index,
      externalIds,
      food99ItemId: externalIds[0] || `item_${index + 1}`,
      productId: mapping?.productId || null,
      mappingId: mapping?.id || null,
      nome: item.name || item.item_name || `Item 99Food ${index + 1}`,
      quantity,
      quantidade: quantity,
      preco: price,
      total: centsToMoney(item.total_price ?? item.real_price ?? moneyToCents(price * quantity)),
      notes: item.remark || item.observations || '',
    };
  });
  const total = money(
    centsToMoney(data.price?.real_pay_price ?? data.price?.real_price ?? data.price?.order_price)
    || items.reduce((sum, item) => sum + item.total, 0)
  );
  const address = data.receive_address || {};
  const customerName = cleanText(address.name)
    || cleanText(`${address.first_name || ''} ${address.last_name || ''}`)
    || 'Cliente 99Food';
  const deliveryAddress = [
    address.poi_display_name,
    address.poi_address,
    address.house_number,
    address.city,
  ].map(cleanText).filter(Boolean).join(', ');

  return {
    food99OrderId: cleanText(event.orderId || event.order_id || data.order_id || event.metadata?.id),
    displayId: cleanText(data.order_index || data.order_id || event.orderId || event.order_id),
    externalStatus: status,
    externalEventType: eventStatus,
    status: appStatusForExternalStatus(status),
    category: 'FOOD99',
    orderType: asNumber(data.delivery_type) === 2 ? 'MERCHANT_DELIVERY' : 'DIDI_DELIVERY',
    orderTiming: 'IMMEDIATE',
    customerName,
    customerDocument: '',
    customerPhone: onlyDigits(`${address.calling_code || ''}${address.phone || ''}`),
    deliveryAddress,
    paymentMethod: asNumber(data.pay_type) === 2 ? 'Dinheiro 99Food' : '99Food',
    total,
    items,
    detail: data,
  };
};

const quantitiesByProduct = (items) => items.reduce((acc, item) => {
  if (item.productId) acc[item.productId] = (acc[item.productId] || 0) + item.quantity;
  return acc;
}, {});

const stockTargetForStatus = (normalizedOrder) => (
  ACTIVE_EXTERNAL_STATUSES.has(normalizedOrder.externalStatus)
  || normalizedOrder.externalStatus === 'CONCLUDED'
    ? quantitiesByProduct(normalizedOrder.items)
    : {}
);

const diffStockTargets = (previous = {}, target = {}) => {
  const productIds = new Set([...Object.keys(previous), ...Object.keys(target)]);
  return Array.from(productIds).map((productId) => ({
    productId,
    quantityDeltaConsumed: asNumber(target[productId]) - asNumber(previous[productId]),
  })).filter((item) => item.quantityDeltaConsumed !== 0);
};

const createFood99Functions = ({
  admin,
  db,
  onCall,
  onRequest,
  onSchedule,
  onDocumentWritten,
  HttpsError,
  logger,
  verifyManagementAccess,
  userHasAccessToStores,
  STORE_ALL_KEY,
}) => {
  const FieldValue = admin.firestore.FieldValue;

  const requireStoreAccess = async (uid, lojaId) => {
    if (!uid) throw new HttpsError('unauthenticated', 'Usuario nao autenticado.');
    if (!lojaId || lojaId === STORE_ALL_KEY) {
      throw new HttpsError('failed-precondition', 'Selecione uma loja especifica.');
    }
    const requester = await verifyManagementAccess(uid);
    if (requester.role === 'dono' && requester.allStores) return requester;
    if (!userHasAccessToStores(requester.stores, [lojaId])) {
      throw new HttpsError('permission-denied', 'Sem acesso a integracao 99Food desta loja.');
    }
    return requester;
  };

  const requireCallableStore = async (request) => {
    const lojaId = cleanText(request.data?.lojaId);
    const uid = request.auth?.uid;
    const requester = await requireStoreAccess(uid, lojaId);
    return {uid, lojaId, requester};
  };

  const throwSecretManagerSaveError = (error) => {
    const code = String(error.code || '').toUpperCase();
    logger.error('[99Food] platform secret save failed', {
      code: error.code,
      message: error.message,
      details: error.details,
    });
    if (code === '7' || code === 'PERMISSION_DENIED') {
      throw new HttpsError(
        'permission-denied',
        'Nao foi possivel salvar as credenciais no Secret Manager. Verifique a permissao da conta de servico das Functions.'
      );
    }
    if (code === '3' || code === 'INVALID_ARGUMENT') {
      throw new HttpsError(
        'failed-precondition',
        'O Secret Manager recusou os metadados das credenciais. Atualize a pagina e tente salvar novamente.'
      );
    }
    if (code === '5' || code === 'NOT_FOUND') {
      throw new HttpsError(
        'failed-precondition',
        'Nao foi possivel localizar ou criar o segredo no Secret Manager.'
      );
    }
    throw new HttpsError(
      'internal',
      'Nao foi possivel salvar as credenciais globais do 99Food no Secret Manager.'
    );
  };

  const configRef = (lojaId) => db.collection('lojas').doc(lojaId).collection('food99').doc('config');
  const platformConfigRef = () => db.collection('integrations').doc('food99');
  const platformAuditCollection = () => platformConfigRef().collection('audit');
  const healthRef = (lojaId) => db.collection('lojas').doc(lojaId).collection('food99Health').doc('status');
  const auditCollection = (lojaId) => db.collection('lojas').doc(lojaId).collection('food99Audit');
  const alertCollection = (lojaId) => db.collection('lojas').doc(lojaId).collection('food99Alerts');
  const catalogCacheRef = (lojaId) => db.collection('lojas').doc(lojaId).collection('food99').doc(CATALOG_CACHE_DOC_ID);

  const isPlatformAdmin = (requester = {}) => requester.role === 'dono' && requester.allStores === true;

  const requirePlatformAdmin = async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Usuario nao autenticado.');
    const requester = await verifyManagementAccess(uid);
    if (!isPlatformAdmin(requester)) {
      throw new HttpsError('permission-denied', 'Somente Dono ou Administrador Master pode alterar a configuracao global do 99Food.');
    }
    return {uid, requester, ip: getRequestIp(request)};
  };

  const audit = async (lojaId, action, details = {}, severity = 'info') => {
    await auditCollection(lojaId).add({
      provider: PROVIDER,
      action,
      severity,
      details,
      createdAt: FieldValue.serverTimestamp(),
    });
  };

  const auditPlatform = async (action, details = {}, severity = 'info') => {
    await platformAuditCollection().add({
      provider: PROVIDER,
      action,
      severity,
      ...details,
      createdAt: FieldValue.serverTimestamp(),
    });
  };

  const trackedChanges = (before = {}, after = {}, fields = []) => fields.reduce((acc, field) => {
    const previous = before[field] ?? null;
    const next = after[field] ?? null;
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      acc[field] = {before: previous, after: next};
    }
    return acc;
  }, {});

  const createAlert = async (lojaId, type, message, context = {}) => {
    const fingerprint = context.orderId
      || context.productId
      || context.eventId
      || context.fingerprint
      || crypto.createHash('sha1').update(`${type}:${message}`).digest('hex').slice(0, 16);
    const key = safeId(`${type}_${fingerprint}`);
    await alertCollection(lojaId).doc(key).set({
      provider: PROVIDER,
      type,
      message,
      context,
      status: 'open',
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  };

  const catalogCacheFromSnap = (snap) => {
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const loadedAt = data.loadedAt?.toDate ? data.loadedAt.toDate() : null;
    const products = Array.isArray(data.products) ? data.products : [];
    const categories = Array.isArray(data.categories) ? data.categories : [];
    if (!products.length && !categories.length) return null;
    return {
      products,
      categories,
      menuState: data.menuState || {categories, items: []},
      loadedAt,
    };
  };

  const loadCatalogCache = async (lojaId) => catalogCacheFromSnap(await catalogCacheRef(lojaId).get());

  const catalogCacheAgeMs = (cache) => {
    if (!cache?.loadedAt) return Number.POSITIVE_INFINITY;
    return Date.now() - cache.loadedAt.getTime();
  };

  const isFreshCatalogCache = (cache) => catalogCacheAgeMs(cache) <= CATALOG_CACHE_TTL_MS;

  const saveCatalogCache = async (lojaId, catalogData) => {
    await catalogCacheRef(lojaId).set({
      products: catalogData.products || [],
      categories: catalogData.categories || [],
      menuState: catalogData.menuState || {categories: catalogData.categories || [], items: []},
      loadedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  };

  const isCatalogRateLimitError = (error) => (
    error?.food99Errno === 10005
    || String(error?.message || '').includes('calling frequency exceeds')
    || String(error?.message || '').includes('errno":10005')
  );

  const catalogCacheResponse = (cache, stale = false, warning = '') => ({
    categories: cache.categories || [],
    products: cache.products || [],
    menuState: cache.menuState || {categories: cache.categories || [], items: []},
    fromCache: true,
    stale,
    cacheAgeSeconds: Number.isFinite(catalogCacheAgeMs(cache))
      ? Math.max(0, Math.round(catalogCacheAgeMs(cache) / 1000))
      : null,
    warning,
  });

  const resolveAlertsByType = async (lojaId, type) => {
    const snap = await alertCollection(lojaId).where('type', '==', type).limit(50).get();
    const batch = db.batch();
    let count = 0;
    snap.docs.forEach((doc) => {
      if (doc.get('status') !== 'resolved') {
        batch.set(doc.ref, {
          status: 'resolved',
          resolvedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        count += 1;
      }
    });
    if (count) await batch.commit();
    return count;
  };

  const normalizePlatformConfig = (platformConfig = {}) => ({
    ...platformConfig,
    environment: normalizeEnvironment(platformConfig.environment),
    apiBaseUrl: cleanText(platformConfig.apiBaseUrl) || DEFAULT_API_URL,
    authUrl: cleanText(platformConfig.authUrl) || DEFAULT_AUTH_URL,
    webhookUrl: cleanText(platformConfig.webhookUrl),
    webhookEnabled: Boolean(platformConfig.webhookEnabled),
    inventoryEndpointTemplate: cleanText(platformConfig.inventoryEndpointTemplate),
    inventoryMethod: cleanText(platformConfig.inventoryMethod || 'POST').toUpperCase(),
  });

  const mergePlatformCredentials = (storeConfig = {}, platformConfigInput = {}) => {
    const platformConfig = normalizePlatformConfig(platformConfigInput);
    const platformReady = Boolean(platformConfig.clientIdSecretVersion && platformConfig.clientSecretSecretVersion);
    const storeReady = Boolean(storeConfig.clientIdSecretVersion && storeConfig.clientSecretSecretVersion);
    return {
      ...storeConfig,
      clientIdSecretVersion: platformReady ? platformConfig.clientIdSecretVersion : storeConfig.clientIdSecretVersion,
      clientSecretSecretVersion: platformReady ? platformConfig.clientSecretSecretVersion : storeConfig.clientSecretSecretVersion,
      webhookSecretVersion: platformConfig.webhookSecretVersion || storeConfig.webhookSecretVersion,
      apiBaseUrl: platformConfig.apiBaseUrl,
      authUrl: platformConfig.authUrl,
      environment: platformConfig.environment,
      webhookEnabled: platformConfig.webhookEnabled,
      webhookUrl: platformConfig.webhookUrl,
      inventoryEndpointTemplate: platformConfig.inventoryEndpointTemplate,
      inventoryMethod: platformConfig.inventoryMethod,
      credentialScope: platformReady ? 'platform' : (storeReady ? 'legacy_store' : ''),
      platformCredentialsReady: platformReady,
      platformWebhookSecretReady: Boolean(platformConfig.webhookSecretVersion),
    };
  };

  const loadConfig = async (lojaId, requireStoreConfiguration = true) => {
    const [snap, platformSnap] = await Promise.all([configRef(lojaId).get(), platformConfigRef().get()]);
    if (!snap.exists && requireStoreConfiguration) {
      throw new HttpsError('failed-precondition', 'Configure a integracao 99Food desta loja primeiro.');
    }
    return {
      ...mergePlatformCredentials(snap.exists ? {id: snap.id, ...snap.data()} : {}, platformSnap.exists ? platformSnap.data() : {}),
    };
  };

  const publicPlatformConfig = (platformConfigInput = {}, canManagePlatform = false) => {
    const platformConfig = normalizePlatformConfig(platformConfigInput);
    const credentialsReady = Boolean(platformConfig.clientIdSecretVersion && platformConfig.clientSecretSecretVersion);
    const base = {
      provider: PROVIDER,
      environment: platformConfig.environment,
      credentialsReady,
      clientIdReady: Boolean(platformConfig.clientIdSecretVersion),
      clientSecretReady: Boolean(platformConfig.clientSecretSecretVersion),
      webhookEnabled: Boolean(platformConfig.webhookEnabled),
      webhookSecretReady: Boolean(platformConfig.webhookSecretVersion),
      updatedAt: platformConfig.updatedAt || null,
      updatedByUid: platformConfig.updatedByUid || '',
    };
    if (!canManagePlatform) return base;
    return {
      ...base,
      apiBaseUrl: platformConfig.apiBaseUrl,
      authUrl: platformConfig.authUrl,
      webhookUrl: platformConfig.webhookUrl,
      inventoryEndpointTemplate: platformConfig.inventoryEndpointTemplate,
      inventoryMethod: platformConfig.inventoryMethod,
      clientIdMasked: platformConfig.clientIdMasked || (platformConfig.clientIdSecretVersion ? '********' : ''),
      clientSecretMasked: platformConfig.clientSecretMasked || (platformConfig.clientSecretSecretVersion ? '********' : ''),
      webhookSecretMasked: platformConfig.webhookSecretMasked || (platformConfig.webhookSecretVersion ? '********' : ''),
    };
  };

  const publicConfig = (config = {}, canManagePlatform = false) => ({
    provider: PROVIDER,
    enabled: Boolean(config.enabled),
    merchantId: config.merchantId || '',
    merchantName: config.merchantName || '',
    status: config.status || (config.enabled ? 'active' : 'inactive'),
    pollingEnabled: Boolean(config.pollingEnabled),
    ordersSyncEnabled: config.ordersSyncEnabled !== false,
    stockSyncEnabled: config.stockSyncEnabled !== false,
    catalogSyncEnabled: config.catalogSyncEnabled !== false,
    credentialsReady: Boolean(config.clientIdSecretVersion && config.clientSecretSecretVersion),
    platformCredentialsReady: Boolean(config.platformCredentialsReady),
    credentialScope: config.credentialScope || '',
    platformWebhookSecretReady: Boolean(config.platformWebhookSecretReady),
    ...(canManagePlatform ? {
      apiBaseUrl: config.apiBaseUrl || DEFAULT_API_URL,
      authUrl: config.authUrl || DEFAULT_AUTH_URL,
      environment: config.environment || DEFAULT_FOOD99_ENVIRONMENT,
      webhookEnabled: Boolean(config.webhookEnabled),
    } : {}),
    autoConfirm: Boolean(config.autoConfirm),
    autoStartPreparation: Boolean(config.autoStartPreparation),
    updatedAt: config.updatedAt || null,
  });

  const parseApiResponse = async (response, providerPath) => {
    const textPayload = await response.text().catch(() => '');
    let payload = {};
    try {
      payload = textPayload ? JSON.parse(textPayload) : {};
    } catch (parseError) {
      payload = {message: textPayload};
    }
    if (!response.ok) {
      const error = new HttpsError('failed-precondition', `99Food ${providerPath} falhou (${response.status}): ${food99ErrorDetail(payload)}`);
      error.httpStatus = response.status;
      error.food99Payload = payload;
      error.food99Path = providerPath;
      throw error;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'errno') && asNumber(payload.errno) !== 0) {
      const error = new HttpsError('failed-precondition', `99Food ${providerPath} retornou erro ${payload.errno}: ${food99ErrorDetail(payload)}`);
      error.httpStatus = 200;
      error.food99Payload = payload;
      error.food99Errno = asNumber(payload.errno);
      error.food99Path = providerPath;
      throw error;
    }
    return payload;
  };

  const buildUrl = (baseUrl, path, params = {}) => {
    const url = path.startsWith('http')
      ? new URL(path)
      : new URL(path, `${baseUrl || DEFAULT_API_URL}/`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && cleanText(value) !== '') {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  };

  const tokenForStore = async (lojaId, config) => {
    const cacheKey = `${lojaId}:${config.merchantId || ''}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;

    const [clientId, clientSecret] = await Promise.all([
      accessSecret(config.clientIdSecretVersion),
      accessSecret(config.clientSecretSecretVersion),
    ]);
    if (!clientId || !clientSecret) {
      throw new HttpsError('failed-precondition', 'Credenciais 99Food nao cadastradas.');
    }
    if (!config.merchantId) {
      throw new HttpsError('failed-precondition', 'Informe o app_shop_id da loja 99Food.');
    }

    const authParams = {
      app_id: clientId,
      app_secret: clientSecret,
      app_shop_id: config.merchantId,
    };
    const authBaseUrl = config.authUrl || config.apiBaseUrl || DEFAULT_AUTH_URL;
    let payload;
    try {
      const response = await fetch(buildUrl(authBaseUrl, AUTH_TOKEN_GET_PATH, authParams), {
        method: 'GET',
        headers: {Accept: 'application/json'},
      });
      payload = await parseApiResponse(response, AUTH_TOKEN_GET_PATH);
    } catch (error) {
      const refreshResponse = await fetch(buildUrl(authBaseUrl, AUTH_TOKEN_REFRESH_PATH, authParams), {
        method: 'GET',
        headers: {Accept: 'application/json'},
      });
      await parseApiResponse(refreshResponse, AUTH_TOKEN_REFRESH_PATH);
      const retryResponse = await fetch(buildUrl(authBaseUrl, AUTH_TOKEN_GET_PATH, authParams), {
        method: 'GET',
        headers: {Accept: 'application/json'},
      });
      payload = await parseApiResponse(retryResponse, AUTH_TOKEN_GET_PATH);
    }
    const tokenData = payload.data || {};
    const token = tokenData.auth_token;
    if (!token) throw new HttpsError('failed-precondition', 'Autenticacao 99Food nao retornou auth_token.');
    const expiresAtSeconds = asNumber(tokenData.token_expiration_time);
    const expiresAt = expiresAtSeconds > 0 ? expiresAtSeconds * 1000 : Date.now() + (55 * 60 * 1000);
    tokenCache.set(cacheKey, {token, expiresAt});
    return token;
  };

  const request99Food = async (lojaId, config, path, {method = 'GET', body, attempts = 4, headers = {}, query = {}} = {}) => {
    let lastError;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const token = await tokenForStore(lojaId, config);
        const upperMethod = cleanText(method || 'GET').toUpperCase();
        const params = upperMethod === 'GET' ? {...query, auth_token: token} : query;
        const url = buildUrl(config.apiBaseUrl || DEFAULT_API_URL, path, params);
        const requestBody = upperMethod === 'GET'
          ? undefined
          : JSON.stringify({auth_token: token, ...(body || {})});
        const response = await fetch(url, {
          method: upperMethod,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...headers,
          },
          body: requestBody,
        });
        if (response.status === 401 && attempt === 0) {
          tokenCache.delete(`${lojaId}:${config.merchantId || ''}`);
          continue;
        }
        return await parseApiResponse(response, `${upperMethod} ${path}`);
      } catch (error) {
        lastError = error;
        if (!RETRYABLE_STATUS.has(error.httpStatus) || attempt === attempts - 1) throw error;
        await delay(Math.min(8000, 500 * (2 ** attempt)));
      }
    }
    throw lastError || new HttpsError('internal', 'Falha inesperada na API 99Food.');
  };

  const loadMappings = async (lojaId) => {
    const snap = await db.collection('lojas').doc(lojaId).collection('food99ProductMappings').get();
    const index = new Map();
    snap.docs.forEach((mappingDoc) => {
      const mapping = {id: mappingDoc.id, productId: mappingDoc.id, ...mappingDoc.data()};
      [mapping.food99ProductId, mapping.externalCode, mapping.catalogItemId]
        .map(cleanText)
        .filter(Boolean)
        .forEach((externalId) => index.set(externalId, mapping));
    });
    return index;
  };

  const getOrderDetailWithRetry = async (lojaId, config, orderId) => {
    let lastError;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await request99Food(lojaId, config, ORDER_DETAIL_PATH, {
          query: {order_id: orderId},
        });
      } catch (error) {
        lastError = error;
        if (error.httpStatus !== 404 || attempt === 4) throw error;
        await delay(Math.min(15000, 1000 * (2 ** attempt)));
      }
    }
    throw lastError;
  };

  const persistOrderEvent = async (lojaId, event, normalizedOrder) => {
    const eventId = cleanText(event.id || `${normalizedOrder.food99OrderId}_${normalizedOrder.externalStatus}_${event.createdAt || ''}`);
    const eventRef = db.collection('lojas').doc(lojaId).collection('food99Events').doc(eventId);
    const externalOrderRef = db.collection('lojas').doc(lojaId).collection('food99Orders').doc(normalizedOrder.food99OrderId);
    const orderRef = db.collection('lojas').doc(lojaId).collection('pedidos').doc(`food99_${normalizedOrder.food99OrderId}`);
    const unmapped = normalizedOrder.items.filter((item) => !item.productId);

    const transactionResult = await db.runTransaction(async (transaction) => {
      const [eventSnap, existingOrderSnap] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(externalOrderRef),
      ]);
      if (eventSnap.exists && eventSnap.get('status') === 'processed') {
        return {duplicate: true, stockApplied: false};
      }

      const existing = existingOrderSnap.exists ? existingOrderSnap.data() || {} : {};
      const previousTarget = existing.stockTarget || {};
      const nextTarget = unmapped.length ? previousTarget : stockTargetForStatus(normalizedOrder);
      const stockChanges = diffStockTargets(previousTarget, nextTarget);
      const productSnaps = new Map();
      const stockSnaps = new Map();

      for (const change of stockChanges) {
        const productRef = db.collection('lojas').doc(lojaId).collection('produtos').doc(change.productId);
        const stockRef = db.collection('lojas').doc(lojaId).collection('estoque').doc(change.productId);
        const [productSnap, stockSnap] = await Promise.all([
          transaction.get(productRef),
          transaction.get(stockRef),
        ]);
        productSnaps.set(change.productId, {ref: productRef, snap: productSnap});
        stockSnaps.set(change.productId, {ref: stockRef, snap: stockSnap});
        const available = asNumber(productSnap.data()?.estoque ?? stockSnap.data()?.quantidade);
        if (change.quantityDeltaConsumed > available) {
          return {
            stockError: true,
            message: `Estoque insuficiente para ${change.productId}. Disponivel: ${available}. Solicitado: ${change.quantityDeltaConsumed}.`,
          };
        }
      }

      stockChanges.forEach((change) => {
        const delta = -change.quantityDeltaConsumed;
        const product = productSnaps.get(change.productId);
        const stock = stockSnaps.get(change.productId);
        const movementRef = db.collection('lojas').doc(lojaId).collection('kardex').doc(
          safeId(`food99_${eventId}_${change.productId}`)
        );
        if (product.snap.exists) {
          transaction.update(product.ref, {estoque: FieldValue.increment(delta), updatedAt: FieldValue.serverTimestamp()});
        }
        if (stock.snap.exists) {
          transaction.update(stock.ref, {quantidade: FieldValue.increment(delta), updatedAt: FieldValue.serverTimestamp()});
        }
        transaction.set(movementRef, {
          produtoId: change.productId,
          tipo: delta < 0 ? 'saida' : 'entrada',
          quantidade: Math.abs(delta),
          delta,
          motivo: normalizedOrder.externalStatus === 'CANCELLED' ? 'Estorno de cancelamento 99Food' : 'Venda 99Food',
          origem: '99Food',
          lojaId,
          food99OrderId: normalizedOrder.food99OrderId,
          food99EventId: eventId,
          createdAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      });

      const internalOrder = {
        clienteNome: normalizedOrder.customerName,
        clienteDocumento: normalizedOrder.customerDocument,
        clienteEndereco: normalizedOrder.deliveryAddress,
        itens: normalizedOrder.items.map((item) => ({
          produtoId: item.productId,
          food99ItemId: item.food99ItemId,
          nome: item.nome,
          quantity: item.quantity,
          preco: item.preco,
          observacao: item.notes,
        })),
        total: normalizedOrder.total,
        formaPagamento: normalizedOrder.paymentMethod,
        origem: '99Food',
        canalVenda: '99Food',
        status: unmapped.length ? 'Atencao 99Food' : normalizedOrder.status,
        lojaId,
        food99OrderId: normalizedOrder.food99OrderId,
        food99DisplayId: normalizedOrder.displayId,
        food99Status: normalizedOrder.externalStatus,
        updatedAt: FieldValue.serverTimestamp(),
      };
      transaction.set(orderRef, {
        ...internalOrder,
        createdAt: existing.createdAt || FieldValue.serverTimestamp(),
      }, {merge: true});
      transaction.set(externalOrderRef, {
        ...normalizedOrder,
        stockTarget: nextTarget,
        hasUnmappedItems: unmapped.length > 0,
        unmappedItems: unmapped.map((item) => ({food99ItemId: item.food99ItemId, nome: item.nome})),
        lastEventId: eventId,
        lastEventAt: event.createdAt || timestampNow(),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: existing.createdAt || FieldValue.serverTimestamp(),
      }, {merge: true});
      transaction.set(eventRef, {
        eventId,
        orderId: normalizedOrder.food99OrderId,
        code: event.code || normalizedOrder.externalStatus,
        fullCode: event.fullCode || '',
        createdAtSource: event.createdAt || null,
        payload: event,
        status: unmapped.length ? 'waiting_mapping' : 'processed',
        processedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {duplicate: false, stockApplied: stockChanges.length > 0, pendingMapping: unmapped.length > 0};
    });

    if (transactionResult.stockError) {
      await createAlert(lojaId, 'insufficient_stock', transactionResult.message, {orderId: normalizedOrder.food99OrderId});
      throw new Error(transactionResult.message);
    }
    if (unmapped.length) {
      await createAlert(lojaId, 'unmapped_product', 'Pedido 99Food recebido com item sem mapeamento interno.', {
        orderId: normalizedOrder.food99OrderId,
        items: unmapped.map((item) => ({id: item.food99ItemId, nome: item.nome})),
      });
    }
    return transactionResult;
  };

  const issueOrderCommand = async (lojaId, config, orderId, action, data = {}) => {
    const cancellationReasonId = asNumber(data.reasonId || data.reason, 1010);
    const cancellationReasonText = cleanText(data.reasonText || data.reasonDescription || data.reason) || 'Cancelado pela loja';
    const operations = {
      confirm: {path: ORDER_CONFIRM_PATH, method: 'POST', body: {order_id: orderId}},
      startPreparation: {path: ORDER_READY_PATH, method: 'GET', query: {order_id: orderId}},
      readyToPickup: {path: ORDER_READY_PATH, method: 'GET', query: {order_id: orderId}},
      dispatch: {path: ORDER_DELIVERED_PATH, method: 'GET', query: {order_id: orderId}},
      delivered: {path: ORDER_DELIVERED_PATH, method: 'GET', query: {order_id: orderId}},
      requestCancellation: {
        path: ORDER_CANCEL_PATH,
        method: 'POST',
        body: {order_id: orderId, reason_id: cancellationReasonId, reason: cancellationReasonText},
      },
      cancel: {
        path: ORDER_CANCEL_PATH,
        method: 'POST',
        body: {order_id: orderId, reason_id: cancellationReasonId, reason: cancellationReasonText},
      },
    };
    const operation = operations[action];
    if (!operation) throw new HttpsError('invalid-argument', 'Acao 99Food invalida.');
    const result = await request99Food(lojaId, config, operation.path, {
      method: operation.method,
      body: operation.body,
      query: operation.query,
    });
    await audit(lojaId, `order.${action}`, {orderId, result});
    return result;
  };

  const issueAutomatedCommand = async (lojaId, config, orderId, action) => {
    const commandRef = db.collection('lojas').doc(lojaId).collection('food99Commands').doc(
      safeId(`${orderId}_${action}`)
    );
    const existing = await commandRef.get();
    if (existing.exists && existing.get('status') === 'accepted') return existing.get('result') || {};
    try {
      const result = await issueOrderCommand(lojaId, config, orderId, action);
      await commandRef.set({
        orderId,
        action,
        status: 'accepted',
        result,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return result;
    } catch (error) {
      await commandRef.set({
        orderId,
        action,
        status: 'failed',
        error: error.message,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      throw error;
    }
  };

  const processEvent = async (lojaId, config, event) => {
    const orderId = cleanText(event.orderId || event.order_id || event.metadata?.id);
    if (!orderId) throw new Error('Evento 99Food sem orderId.');
    const status = normalizeExternalStatus(event, event.metadata || {});
    const existing = await db.collection('lojas').doc(lojaId).collection('food99Orders').doc(orderId).get();
    let detail = event.metadata || {};
    if (!TERMINAL_EXTERNAL_STATUSES.has(status) || !existing.exists) {
      try {
        detail = await getOrderDetailWithRetry(lojaId, config, orderId);
      } catch (error) {
        const eventCreatedAt = Date.parse(event.createdAt || '');
        const exceededDetailWindow = Number.isFinite(eventCreatedAt)
          && Date.now() - eventCreatedAt >= 10 * 60 * 1000;
        if (error.httpStatus === 404 && exceededDetailWindow && event.id) {
          await db.collection('lojas').doc(lojaId).collection('food99Events').doc(safeId(event.id)).set({
            eventId: event.id,
            orderId,
            payload: event,
            status: 'dead_letter_detail_unavailable',
            processedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          await createAlert(lojaId, 'order_detail_unavailable', 'Detalhes do pedido nao ficaram disponiveis em 10 minutos.', {orderId, eventId: event.id});
          await audit(lojaId, 'event.dead_letter', {eventId: event.id, orderId, reason: 'detail_unavailable'}, 'warning');
          return {acknowledge: true, deadLetter: true};
        }
        throw error;
      }
    } else if (existing.exists) {
      detail = existing.data().detail || detail;
    }
    const mappingIndex = await loadMappings(lojaId);
    const order = normalizeOrderDetail(event, detail, mappingIndex);
    const persisted = await persistOrderEvent(lojaId, event, order);
    if (persisted.pendingMapping) {
      throw new Error('Pedido aguardando mapeamento de produto 99Food antes do processamento.');
    }

    if (!order.items.some((item) => !item.productId)) {
      if (order.externalStatus === 'PLACED' && config.autoConfirm) {
        await issueAutomatedCommand(lojaId, config, orderId, 'confirm');
      }
      if (order.externalStatus === 'CONFIRMED' && config.autoStartPreparation) {
        await audit(lojaId, 'order.preparation_auto_start_not_supported', {
          orderId,
          message: '99Food OpenAPI nao possui comando separado de inicio de preparo.',
        }, 'warning');
      }
    }
    if (persisted.duplicate) return {acknowledge: true, duplicate: true};
    await audit(lojaId, 'event.processed', {eventId: event.id, orderId, status});
    return {acknowledge: true, duplicate: false};
  };

  const processEvents = async (lojaId, config, events, source) => {
    const acknowledgedEventIds = [];
    const failures = [];
    for (const event of events) {
      try {
        const result = await processEvent(lojaId, config, event);
        if (result.acknowledge && event.id) acknowledgedEventIds.push(event.id);
      } catch (error) {
        failures.push({eventId: event.id || null, orderId: event.orderId || null, message: error.message});
        await createAlert(lojaId, 'event_processing_failure', error.message, {eventId: event.id, orderId: event.orderId});
        logger.error('[99Food] event processing failed', {lojaId, event, error});
      }
    }
    await audit(lojaId, 'events.batch', {
      source,
      received: events.length,
      acknowledged: acknowledgedEventIds.length,
      failures,
    }, failures.length ? 'warning' : 'info');
    return {received: events.length, acknowledged: acknowledgedEventIds.length, failures};
  };

  const syncProductAvailability = async (lojaId, productId, reason = 'stock_change') => {
    const mappingSnap = await db.collection('lojas').doc(lojaId).collection('food99ProductMappings').doc(productId).get();
    if (!mappingSnap.exists || !mappingSnap.get('stockSyncEnabled')) return {skipped: 'not_mapped'};
    const [config, productSnap] = await Promise.all([
      loadConfig(lojaId),
      db.collection('lojas').doc(lojaId).collection('produtos').doc(productId).get(),
    ]);
    if (config.stockSyncEnabled === false) return {skipped: 'store_stock_sync_disabled'};
    const mapping = mappingSnap.data() || {};
    const quantity = Math.max(0, asNumber(productSnap.data()?.estoque));
    const appItemId = cleanText(mapping.food99ProductId || mapping.externalCode || mapping.catalogItemId);
    if (!appItemId) return {skipped: 'missing_app_item_id'};
    if (!config.merchantId) {
      await mappingSnap.ref.set({
        syncStatus: 'waiting_app_shop_id',
        pendingQuantity: quantity,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {skipped: 'app_shop_id_missing'};
    }
    const status = quantity > 0 ? 1 : 2;
    try {
      const result = await request99Food(lojaId, config, ITEM_STATUS_PATH, {
        method: 'POST',
        body: {app_item_ids: [appItemId], status},
      });
      await mappingSnap.ref.set({
        lastSyncedQuantity: quantity,
        lastSyncedAvailability: status,
        itemStatus: status,
        syncStatus: 'synced',
        lastSyncAt: FieldValue.serverTimestamp(),
        lastSyncReason: reason,
        syncError: FieldValue.delete(),
      }, {merge: true});
      return {quantity, status, result};
    } catch (error) {
      await mappingSnap.ref.set({
        pendingQuantity: quantity,
        syncStatus: 'error',
        syncError: error.message,
        lastSyncAttemptAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      await createAlert(lojaId, 'stock_sync_failure', error.message, {productId, quantity});
      throw error;
    }
  };

  const externalCodeForProduct = (productId) => `AGD_${safeId(productId).toUpperCase().slice(0, 72)}`;

  const normalizeMenuState = (payload = {}) => {
    const data = payload.data || payload;
    const menus = Array.isArray(data.menus) && data.menus.length
      ? data.menus
      : [{menu_name: 'menu', app_menu_id: 'AGD_MENU', app_category_ids: []}];
    const categories = Array.isArray(data.categories) ? data.categories : [];
    const items = Array.isArray(data.items) ? data.items : [];
    const modifierGroups = Array.isArray(data.modifier_groups) ? data.modifier_groups : [];
    return {menus, categories, items, modifierGroups};
  };

  const loadMenuState = async (lojaId, config) => {
    const payload = await request99Food(lojaId, config, CATALOG_LIST_PATH, {attempts: 3});
    return normalizeMenuState(payload);
  };

  const loadCatalogProductsFrom99Food = async (lojaId, config, options = {}) => {
    const force = Boolean(options.force);
    const allowStale = options.allowStale !== false;
    if (!config.merchantId) throw new HttpsError('failed-precondition', 'Informe o app_shop_id do 99Food.');
    const cached = await loadCatalogCache(lojaId);
    if (!force && isFreshCatalogCache(cached)) {
      return catalogCacheResponse(cached, false);
    }
    try {
      const menuState = await loadMenuState(lojaId, config);
      const categoryByItemId = new Map();
      menuState.categories.forEach((category) => {
        (category.app_item_ids || []).forEach((itemId) => {
          if (cleanText(itemId)) {
            categoryByItemId.set(cleanText(itemId), category);
          }
        });
      });
      const products = menuState.items.map((item) => {
        const itemId = cleanText(item.app_item_id);
        const category = categoryByItemId.get(itemId) || {};
        return {
          itemId,
          productId: itemId,
          name: cleanText(item.item_name || item.name || 'Produto 99Food'),
          description: cleanText(item.short_desc || item.description),
          externalCode: itemId,
          productExternalCode: cleanText(item.app_external_id),
          categoryId: cleanText(category.app_category_id),
          categoryName: cleanText(category.category_name || '99Food'),
          status: asNumber(item.status, 1),
          price: catalogItemPrice(item),
          imageUrl: cleanText(item.head_img),
        };
      }).filter((item) => item.productId || item.itemId);
      const catalogData = {categories: menuState.categories, products, menuState};
      await saveCatalogCache(lojaId, catalogData);
      return {...catalogData, fromCache: false, stale: false, cacheAgeSeconds: 0, warning: ''};
    } catch (error) {
      if (allowStale && cached && isCatalogRateLimitError(error)) {
        await audit(lojaId, 'catalog.loaded_from_cache_rate_limited', {
          ageSeconds: Math.round(catalogCacheAgeMs(cached) / 1000),
          error: error.message,
        }, 'warning');
        return catalogCacheResponse(
          cached,
          true,
          'A 99Food limitou novas consultas por frequência. Exibindo o último catálogo carregado.'
        );
      }
      throw error;
    }
  };

  const loadCatalogCategories = async (lojaId, config) => {
    const catalogData = await loadCatalogProductsFrom99Food(lojaId, config);
    return catalogData.menuState;
  };

  const findExistingCatalogMapping = async (lojaId, catalogProduct) => {
    const snap = await db.collection('lojas').doc(lojaId).collection('food99ProductMappings').get();
    return snap.docs
      .map((doc) => ({id: doc.id, productId: doc.id, ...doc.data()}))
      .find((mapping) => (
        cleanText(mapping.food99ProductId) === cleanText(catalogProduct.productId)
        || cleanText(mapping.catalogItemId) === cleanText(catalogProduct.itemId)
        || (catalogProduct.externalCode && cleanText(mapping.externalCode) === cleanText(catalogProduct.externalCode))
      )) || null;
  };

  const findConflictingCatalogMappingRefs = async (lojaId, catalogProduct, keepProductId) => {
    const snap = await db.collection('lojas').doc(lojaId).collection('food99ProductMappings').get();
    return snap.docs.filter((mappingDoc) => {
      if (mappingDoc.id === keepProductId) return false;
      const mapping = mappingDoc.data() || {};
      return cleanText(mapping.food99ProductId) === cleanText(catalogProduct.productId)
        || cleanText(mapping.catalogItemId) === cleanText(catalogProduct.itemId)
        || (catalogProduct.externalCode && cleanText(mapping.externalCode) === cleanText(catalogProduct.externalCode));
    }).map((mappingDoc) => mappingDoc.ref);
  };

  const catalogProductSelectionKey = (catalogProduct = {}) => cleanText(
    catalogProduct.itemId
    || catalogProduct.productId
    || catalogProduct.externalCode
    || catalogProduct.name
  );

  const catalogProductFromClient = (input = {}) => {
    const source = input.catalogProduct && typeof input.catalogProduct === 'object' ? input.catalogProduct : input;
    const itemId = cleanText(source.itemId);
    const productId = cleanText(source.productId || itemId);
    const name = cleanText(source.name);
    if ((!itemId && !productId) || !name) return null;
    return {
      itemId: itemId || productId,
      productId: productId || itemId,
      name,
      description: cleanText(source.description),
      externalCode: cleanText(source.externalCode || itemId || productId),
      productExternalCode: cleanText(source.productExternalCode),
      categoryId: cleanText(source.categoryId),
      categoryName: cleanText(source.categoryName || '99Food'),
      status: asNumber(source.status, 1),
      price: money(source.price),
      imageUrl: cleanText(source.imageUrl),
    };
  };

  const productBaseIdForCatalogProduct = (catalogProduct = {}) => safeId(
    `food99_${catalogProduct.productId || catalogProduct.itemId || catalogProduct.externalCode || catalogProduct.name}`
  ) || safeId(`food99_${Date.now()}`);

  const productCategoryKeys = (product = {}) => [
    product.subcategoria,
    product.categoria,
    product.categoryName,
  ].map(normalizeLookupText).filter(Boolean);

  const chooseBestExistingProductMatch = (productDocs) => {
    const ranked = [...productDocs].sort((a, b) => {
      const productA = a.data() || {};
      const productB = b.data() || {};
      const importedA = productA.food99Imported || productA.origem === '99Food' ? 1 : 0;
      const importedB = productB.food99Imported || productB.origem === '99Food' ? 1 : 0;
      if (importedA !== importedB) return importedA - importedB;
      const inactiveA = cleanText(productA.status).toLowerCase() === 'inativo' ? 1 : 0;
      const inactiveB = cleanText(productB.status).toLowerCase() === 'inativo' ? 1 : 0;
      if (inactiveA !== inactiveB) return inactiveA - inactiveB;
      return asNumber(productB.estoque) - asNumber(productA.estoque);
    });
    return ranked[0] || null;
  };

  const findExistingInternalProductForCatalog = async (lojaId, catalogProduct) => {
    const collection = db.collection('lojas').doc(lojaId).collection('produtos');
    const matchedByReference = new Map();
    const checks = [
      ['food99ProductId', catalogProduct.productId],
      ['food99CatalogItemId', catalogProduct.itemId],
      ['food99ExternalCode', catalogProduct.externalCode],
      ['codigoPDV', catalogProduct.externalCode],
      ['codigoPdv', catalogProduct.externalCode],
      ['sku', catalogProduct.externalCode],
    ].filter(([, value]) => cleanText(value));

    for (const [field, value] of checks) {
      const snap = await collection.where(field, '==', cleanText(value)).limit(1).get();
      snap.docs.forEach((productDoc) => matchedByReference.set(productDoc.id, productDoc));
    }

    const baseRef = collection.doc(productBaseIdForCatalogProduct(catalogProduct));
    const baseSnap = await baseRef.get();
    if (baseSnap.exists) matchedByReference.set(baseSnap.id, baseSnap);

    const catalogNameKey = normalizeLookupText(catalogProduct.name);
    if (!catalogNameKey) return chooseBestExistingProductMatch([...matchedByReference.values()]);

    const catalogCategoryKey = normalizeLookupText(catalogProduct.categoryName);
    const productsSnap = await collection.get();
    const nameMatches = productsSnap.docs.filter((productDoc) => (
      normalizeLookupText(productDoc.get('nome')) === catalogNameKey
    ));
    if (!nameMatches.length) return chooseBestExistingProductMatch([...matchedByReference.values()]);

    const categoryMatches = catalogCategoryKey
      ? nameMatches.filter((productDoc) => productCategoryKeys(productDoc.data()).includes(catalogCategoryKey))
      : [];
    if (categoryMatches.length) return chooseBestExistingProductMatch(categoryMatches);
    if (nameMatches.length === 1) return nameMatches[0];
    const nonImportedNameMatches = nameMatches.filter((productDoc) => {
      const data = productDoc.data() || {};
      return !data.food99Imported && data.origem !== '99Food';
    });
    return chooseBestExistingProductMatch(nonImportedNameMatches.length ? nonImportedNameMatches : nameMatches);
  };

  const nextAvailableProductRef = async (lojaId, baseId) => {
    const collection = db.collection('lojas').doc(lojaId).collection('produtos');
    for (let index = 0; index < 100; index += 1) {
      const candidateId = index === 0 ? baseId : safeId(`${baseId}_${index + 1}`);
      const candidateRef = collection.doc(candidateId);
      const candidateSnap = await candidateRef.get();
      if (!candidateSnap.exists) return candidateRef;
    }
    return collection.doc(safeId(`${baseId}_${Date.now()}`));
  };

  const importedProductDataFromCatalog = (catalogProduct, uid) => {
    const status = asNumber(catalogProduct.status, 1);
    const pdvCode = cleanText(catalogProduct.externalCode || catalogProduct.productId || catalogProduct.itemId);
    return {
      nome: catalogProduct.name,
      categoria: 'Delivery',
      subcategoria: catalogProduct.categoryName || '99Food',
      preco: catalogProduct.price || 0,
      preco99Food: catalogProduct.price || null,
      custo: 0,
      estoque: 0,
      status: status === 2 ? 'Inativo' : 'Ativo',
      descricao: catalogProduct.description || '',
      tempoPreparo: '',
      imageUrl: cleanText(catalogProduct.imageUrl),
      origem: '99Food',
      codigoPDV: pdvCode,
      codigoPdv: pdvCode,
      sku: pdvCode,
      food99Imported: true,
      food99ProductId: catalogProduct.productId,
      food99CatalogItemId: catalogProduct.itemId,
      food99ExternalCode: catalogProduct.externalCode,
      food99CategoryId: catalogProduct.categoryId,
      food99CategoryName: catalogProduct.categoryName,
      createdByUid: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
  };

  const catalogMappingData = (internalProductId, catalogProduct, overrides = {}) => ({
    productId: internalProductId,
    food99ProductId: catalogProduct.productId,
    catalogItemId: catalogProduct.itemId,
    externalCode: catalogProduct.externalCode,
    productExternalCode: catalogProduct.productExternalCode,
    categoryId: catalogProduct.categoryId,
    categoryName: catalogProduct.categoryName,
    food99Price: catalogProduct.price || 0,
    itemStatus: catalogProduct.status,
    stockSyncEnabled: false,
    catalogManaged: false,
    importStatus: 'imported_waiting_review',
    syncStatus: 'waiting_internal_stock_review',
    importedFrom99Food: true,
    importedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...overrides,
  });

  const food99ProductLinkPatch = (catalogProduct) => {
    const pdvCode = cleanText(catalogProduct.externalCode || catalogProduct.productId || catalogProduct.itemId);
    return {
      preco99Food: catalogProduct.price || null,
      codigoPDV99Food: pdvCode,
      food99ProductId: catalogProduct.productId,
      food99CatalogItemId: catalogProduct.itemId,
      food99ExternalCode: catalogProduct.externalCode,
      food99CategoryId: catalogProduct.categoryId,
      food99CategoryName: catalogProduct.categoryName,
      food99LinkedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
  };

  const importCatalogProductFrom99Food = async (lojaId, uid, catalogProduct) => {
    const itemKey = catalogProductSelectionKey(catalogProduct);
    const resultBase = {
      itemKey,
      itemId: catalogProduct.itemId,
      productId99Food: catalogProduct.productId,
      externalCode: catalogProduct.externalCode,
      name: catalogProduct.name,
      categoryName: catalogProduct.categoryName,
    };

    const existingProduct = await findExistingInternalProductForCatalog(lojaId, catalogProduct);
    const existingMapping = await findExistingCatalogMapping(lojaId, catalogProduct);
    if (existingMapping?.productId && (!existingProduct?.exists || existingProduct.id === existingMapping.productId)) {
      await audit(lojaId, 'catalog.product_import_skipped', {
        uid,
        reason: 'already_mapped',
        productId: existingMapping.productId,
        food99ProductId: catalogProduct.productId,
        catalogItemId: catalogProduct.itemId,
      }, 'info');
      return {
        ...resultBase,
        ok: true,
        status: 'ignored',
        alreadyMapped: true,
        reason: 'already_mapped',
        message: 'Produto ja vinculado/importado.',
        productId: existingMapping.productId,
        mapping: existingMapping,
      };
    }

    if (existingProduct?.exists) {
      const mappingRef = db.collection('lojas').doc(lojaId).collection('food99ProductMappings').doc(existingProduct.id);
      const conflictRefs = await findConflictingCatalogMappingRefs(lojaId, catalogProduct, existingProduct.id);
      await db.runTransaction(async (transaction) => {
        transaction.set(existingProduct.ref, food99ProductLinkPatch(catalogProduct), {merge: true});
        transaction.set(mappingRef, catalogMappingData(existingProduct.id, catalogProduct, {
          importStatus: 'existing_product_linked',
          syncStatus: 'waiting_internal_stock_review',
        }), {merge: true});
        conflictRefs.forEach((conflictRef) => transaction.delete(conflictRef));
      });
      await audit(lojaId, 'catalog.product_import_skipped', {
        uid,
        reason: 'internal_product_exists',
        productId: existingProduct.id,
        replacedMappingProductId: existingMapping?.productId || '',
        food99ProductId: catalogProduct.productId,
        catalogItemId: catalogProduct.itemId,
      }, 'info');
      return {
        ...resultBase,
        ok: true,
        status: 'ignored',
        alreadyExists: true,
        reason: 'internal_product_exists',
        message: 'Produto interno ja existia; mapeamento preservado.',
        productId: existingProduct.id,
      };
    }

    const baseId = productBaseIdForCatalogProduct(catalogProduct);
    const productRef = await nextAvailableProductRef(lojaId, baseId);
    const internalProductId = productRef.id;
    const productData = importedProductDataFromCatalog(catalogProduct, uid);
    const mappingRef = db.collection('lojas').doc(lojaId).collection('food99ProductMappings').doc(internalProductId);

    await db.runTransaction(async (transaction) => {
      transaction.set(productRef, productData, {merge: false});
      transaction.set(mappingRef, catalogMappingData(internalProductId, catalogProduct), {merge: true});
    });

    await audit(lojaId, 'catalog.product_imported', {
      uid,
      productId: internalProductId,
      food99ProductId: catalogProduct.productId,
      catalogItemId: catalogProduct.itemId,
    });
    return {
      ...resultBase,
      ok: true,
      status: 'imported',
      message: 'Produto importado.',
      productId: internalProductId,
      product: productData,
    };
  };

  const ensureCatalogCategory = (menuState, product) => {
    const categoryName = cleanText(product.subcategoria || product.categoria || 'Produtos') || 'Produtos';
    const existing = menuState.categories.find((category) => (
      cleanText(category.category_name).toLowerCase() === categoryName.toLowerCase()
    ));
    if (existing?.app_category_id) return {id: existing.app_category_id, name: categoryName, category: existing};
    const category = {
      app_category_id: `AGD_CAT_${safeId(categoryName).toUpperCase().slice(0, 54)}`,
      category_name: truncate(categoryName, 100),
      app_item_ids: [],
      priority: menuState.categories.length + 1,
    };
    menuState.categories.push(category);
    return {id: category.app_category_id, name: categoryName, category};
  };

  const publishProductTo99Food = async (lojaId, config, productId, product, menuState, reason) => {
    if (config.catalogSyncEnabled === false) {
      throw new Error('Sincronizacao de catalogo desabilitada para esta loja.');
    }
    const price = money(product.preco99Food);
    if (!(price > 0)) {
      throw new Error(`Informe o Preco 99Food de ${product.nome || productId} antes de publicar.`);
    }
    const mappingRef = db.collection('lojas').doc(lojaId).collection('food99ProductMappings').doc(productId);
    const mappingSnap = await mappingRef.get();
    const mapping = mappingSnap.exists ? mappingSnap.data() || {} : {};
    const category = ensureCatalogCategory(menuState, product);
    const categoryRecord = category.category || category;
    const food99ProductId = cleanText(mapping.food99ProductId || mapping.externalCode) || externalCodeForProduct(productId);
    const catalogItemId = cleanText(mapping.catalogItemId) || food99ProductId;
    const externalCode = cleanText(mapping.externalCode) || externalCodeForProduct(productId);
    const productExternalCode = cleanText(mapping.productExternalCode) || productId;
    const quantity = Math.max(0, asNumber(product.estoque));
    const status = product.status === 'Inativo' || quantity <= 0 ? 2 : 1;
    const itemPayload = {
      ...(menuState.items.find((item) => cleanText(item.app_item_id) === food99ProductId) || {}),
      app_item_id: food99ProductId,
      app_external_id: productExternalCode,
      item_name: truncate(product.nome || 'Produto', 50),
      short_desc: truncate(product.descricao || 'Produto Ana Guimaraes Doceria', 300),
      price: moneyToCents(price),
      status,
      is_sold_separately: true,
    };
    if (cleanText(product.imageUrl).startsWith('https://')) itemPayload.head_img = cleanText(product.imageUrl).slice(0, 300);

    const existingItemIndex = menuState.items.findIndex((item) => cleanText(item.app_item_id) === food99ProductId);
    if (existingItemIndex >= 0) {
      menuState.items[existingItemIndex] = itemPayload;
    } else {
      menuState.items.push(itemPayload);
    }
    categoryRecord.app_item_ids = Array.from(new Set([
      ...(categoryRecord.app_item_ids || []).map(cleanText).filter(Boolean),
      food99ProductId,
    ]));
    const menu = menuState.menus[0] || {menu_name: 'menu', app_menu_id: 'AGD_MENU', app_category_ids: []};
    menu.app_category_ids = Array.from(new Set([
      ...(menu.app_category_ids || []).map(cleanText).filter(Boolean),
      categoryRecord.app_category_id,
    ]));
    menuState.menus[0] = menu;

    const uploadResult = await request99Food(lojaId, config, CATALOG_UPLOAD_PATH, {
      method: 'POST',
      body: {
        menus: menuState.menus,
        categories: menuState.categories,
        items: menuState.items,
        modifier_groups: menuState.modifierGroups || [],
      },
    });

    await mappingRef.set({
      productId,
      catalogItemId,
      food99ProductId,
      externalCode,
      productExternalCode,
      categoryId: categoryRecord.app_category_id,
      categoryName: category.name,
      food99Price: price,
      itemStatus: status,
      lastSyncedQuantity: quantity,
      stockSyncEnabled: true,
      catalogManaged: true,
      publishStatus: 'synced',
      lastUploadTask: uploadResult.data || null,
      lastPublishReason: reason,
      lastPublishAt: FieldValue.serverTimestamp(),
      publishError: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    await syncProductAvailability(lojaId, productId, `${reason}_inventory`);
    return {productId, externalCode, catalogItemId, food99ProductId, price};
  };

  const reconcileFailedAvailability = async (lojaId) => {
    const failed = await db.collection('lojas').doc(lojaId).collection('food99ProductMappings')
      .where('syncStatus', '==', 'error').limit(10).get();
    const results = [];
    for (const mapping of failed.docs) {
      try {
        results.push(await syncProductAvailability(lojaId, mapping.id, 'automatic_retry'));
      } catch (error) {
        results.push({productId: mapping.id, error: error.message});
      }
    }
    return results;
  };

  const runPoll = async (lojaId, origin) => {
    const config = await loadConfig(lojaId);
    if (!config.enabled || !config.pollingEnabled || config.ordersSyncEnabled === false) return {skipped: true};
    if (!config.merchantId) {
      throw new HttpsError('failed-precondition', 'Informe o app_shop_id da loja antes de consultar a 99Food.');
    }
    const started = Date.now();
    try {
      await tokenForStore(lojaId, config);
      const inventoryRetries = await reconcileFailedAvailability(lojaId);
      const result = {received: 0, acknowledged: 0, failures: []};
      await healthRef(lojaId).set({
        provider: PROVIDER,
        status: 'online',
        lastPollAt: FieldValue.serverTimestamp(),
        latencyMs: Date.now() - started,
        lastBatch: result,
        lastInventoryRetryCount: inventoryRetries.length,
        lastError: FieldValue.delete(),
      }, {merge: true});
      await resolveAlertsByType(lojaId, 'api_poll_failure');
      return {...result, inventoryRetries: inventoryRetries.length};
    } catch (error) {
      let message = error.message;
      await healthRef(lojaId).set({
        provider: PROVIDER,
        status: 'offline',
        lastPollAt: FieldValue.serverTimestamp(),
        latencyMs: Date.now() - started,
        lastError: message,
      }, {merge: true});
      await resolveAlertsByType(lojaId, 'api_poll_failure');
      await createAlert(lojaId, 'api_poll_failure', message, {
        httpStatus: error.httpStatus || null,
        merchantId: config.merchantId || '',
        fingerprint: error.httpStatus ? `${error.httpStatus}_${config.merchantId || 'shop'}` : undefined,
      });
      throw new HttpsError(error.code || 'failed-precondition', message);
    }
  };

  return {
    food99GetConfiguration: onCall(async (request) => {
      const {lojaId, requester} = await requireCallableStore(request);
      const canManagePlatform = isPlatformAdmin(requester);
      const [config, platformSnap, healthSnap] = await Promise.all([
        loadConfig(lojaId, false),
        platformConfigRef().get(),
        healthRef(lojaId).get(),
      ]);
      return {
        config: publicConfig(config, canManagePlatform),
        platform: publicPlatformConfig(platformSnap.exists ? platformSnap.data() || {} : {}, canManagePlatform),
        permissions: {
          canManagePlatform,
          canConfigureStore: true,
        },
        health: healthSnap.exists ? healthSnap.data() : {status: 'not_configured'},
      };
    }),

    food99GetPlatformConfiguration: onCall(async (request) => {
      const {requester} = await requirePlatformAdmin(request);
      const snap = await platformConfigRef().get();
      return {
        platform: publicPlatformConfig(snap.exists ? snap.data() || {} : {}, isPlatformAdmin(requester)),
      };
    }),

    food99SavePlatformConfiguration: onCall({timeoutSeconds: 120}, async (request) => {
      const {uid, ip} = await requirePlatformAdmin(request);
      const incoming = request.data || {};
      const existingSnap = await platformConfigRef().get();
      const existing = existingSnap.exists ? existingSnap.data() || {} : {};
      const projectId = getProjectId();
      const clientId = cleanText(incoming.clientId);
      const clientSecret = String(incoming.clientSecret || '');
      const webhookSecret = String(incoming.webhookSecret || '');
      const updateCredentials = Boolean(clientId || clientSecret);
      const updateWebhookSecret = Boolean(webhookSecret);

      if (updateCredentials && !(clientId && clientSecret)) {
        throw new HttpsError('invalid-argument', 'Informe Client ID e Client Secret juntos para substituir a credencial central.');
      }
      if ((updateCredentials || updateWebhookSecret) && !projectId) {
        throw new HttpsError('failed-precondition', 'Projeto Google Cloud nao identificado.');
      }

      const beforeAudit = {
        environment: normalizeEnvironment(existing.environment),
        apiBaseUrl: cleanText(existing.apiBaseUrl) || DEFAULT_API_URL,
        authUrl: cleanText(existing.authUrl) || DEFAULT_AUTH_URL,
        webhookUrl: cleanText(existing.webhookUrl),
        webhookEnabled: Boolean(existing.webhookEnabled),
        inventoryEndpointTemplate: cleanText(existing.inventoryEndpointTemplate),
        inventoryMethod: cleanText(existing.inventoryMethod || 'POST').toUpperCase(),
        clientId: existing.clientIdMasked || (existing.clientIdSecretVersion ? '********' : ''),
        clientSecret: existing.clientSecretMasked || (existing.clientSecretSecretVersion ? '********' : ''),
        webhookSecret: existing.webhookSecretMasked || (existing.webhookSecretVersion ? '********' : ''),
      };

      const platformPatch = {
        provider: PROVIDER,
        environment: normalizeEnvironment(incoming.environment || existing.environment),
        apiBaseUrl: cleanText(incoming.apiBaseUrl || existing.apiBaseUrl) || DEFAULT_API_URL,
        authUrl: cleanText(incoming.authUrl || existing.authUrl) || DEFAULT_AUTH_URL,
        webhookUrl: cleanText(incoming.webhookUrl ?? existing.webhookUrl),
        webhookEnabled: Object.prototype.hasOwnProperty.call(incoming, 'webhookEnabled')
          ? Boolean(incoming.webhookEnabled)
          : Boolean(existing.webhookEnabled),
        inventoryEndpointTemplate: cleanText(incoming.inventoryEndpointTemplate ?? existing.inventoryEndpointTemplate),
        inventoryMethod: cleanText(incoming.inventoryMethod || existing.inventoryMethod || 'POST').toUpperCase(),
        updatedByUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
      };

      try {
        if (updateCredentials) {
          const [clientIdName, clientSecretName] = await Promise.all([
            ensureSecret(projectId, 'food99_platform_client_id', {app: 'doceria', provider: PROVIDER, scope: 'platform'}),
            ensureSecret(projectId, 'food99_platform_client_secret', {app: 'doceria', provider: PROVIDER, scope: 'platform'}),
          ]);
          const [clientIdSecretVersion, clientSecretSecretVersion] = await Promise.all([
            addSecretVersion(clientIdName, clientId),
            addSecretVersion(clientSecretName, clientSecret),
          ]);
          Object.assign(platformPatch, {
            clientIdSecretVersion,
            clientSecretSecretVersion,
            clientIdMasked: maskSecret(clientId),
            clientSecretMasked: maskSecret(clientSecret),
            clientIdFingerprint: fingerprintSecret(clientId),
            clientSecretFingerprint: fingerprintSecret(clientSecret),
          });
        }

        if (updateWebhookSecret) {
          const webhookSecretName = await ensureSecret(projectId, 'food99_platform_webhook_secret', {
            app: 'doceria',
            provider: PROVIDER,
            scope: 'platform',
          });
          Object.assign(platformPatch, {
            webhookSecretVersion: await addSecretVersion(webhookSecretName, webhookSecret),
            webhookSecretMasked: maskSecret(webhookSecret),
            webhookSecretFingerprint: fingerprintSecret(webhookSecret),
          });
        }
      } catch (error) {
        throwSecretManagerSaveError(error);
      }

      await platformConfigRef().set(platformPatch, {merge: true});
      tokenCache.clear();

      const afterAudit = {
        environment: platformPatch.environment,
        apiBaseUrl: platformPatch.apiBaseUrl,
        authUrl: platformPatch.authUrl,
        webhookUrl: platformPatch.webhookUrl,
        webhookEnabled: platformPatch.webhookEnabled,
        inventoryEndpointTemplate: platformPatch.inventoryEndpointTemplate,
        inventoryMethod: platformPatch.inventoryMethod,
        clientId: platformPatch.clientIdMasked || beforeAudit.clientId,
        clientSecret: platformPatch.clientSecretMasked || beforeAudit.clientSecret,
        webhookSecret: platformPatch.webhookSecretMasked || beforeAudit.webhookSecret,
      };
      await auditPlatform('platform.configuration.saved', {
        uid,
        ip,
        changes: trackedChanges(beforeAudit, afterAudit, Object.keys(afterAudit)),
      });

      const updatedSnap = await platformConfigRef().get();
      return {
        platform: publicPlatformConfig(updatedSnap.exists ? updatedSnap.data() || {} : {}, true),
      };
    }),

    food99SaveConfiguration: onCall({timeoutSeconds: 120}, async (request) => {
      const {uid, lojaId, requester} = await requireCallableStore(request);
      const incoming = request.data || {};
      if (hasGlobalConfigPayload(incoming)) {
        throw new HttpsError('permission-denied', 'Configuracoes globais do 99Food devem ser alteradas somente em Configuracoes > Integracoes > 99Food Developer.');
      }
      const [existingSnap, platformSnap] = await Promise.all([configRef(lojaId).get(), platformConfigRef().get()]);
      const existing = existingSnap.exists ? existingSnap.data() || {} : {};
      const platformExisting = platformSnap.exists ? platformSnap.data() || {} : {};
      const canManagePlatform = isPlatformAdmin(requester);

      const config = {
        provider: PROVIDER,
        merchantId: cleanText(incoming.merchantId || existing.merchantId),
        merchantName: cleanText(incoming.merchantName || existing.merchantName),
        enabled: Boolean(incoming.enabled),
        status: incoming.enabled ? 'active' : 'inactive',
        pollingEnabled: incoming.pollingEnabled !== false,
        ordersSyncEnabled: incoming.ordersSyncEnabled !== false,
        stockSyncEnabled: incoming.stockSyncEnabled !== false,
        catalogSyncEnabled: incoming.catalogSyncEnabled !== false,
        autoConfirm: incoming.autoConfirm !== false,
        autoStartPreparation: Boolean(incoming.autoStartPreparation),
        updatedByUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
      };
      await configRef(lojaId).set(config, {merge: true});
      tokenCache.clear();

      const beforeAudit = {
        merchantId: existing.merchantId || '',
        merchantName: existing.merchantName || '',
        enabled: Boolean(existing.enabled),
        pollingEnabled: existing.pollingEnabled !== false,
        ordersSyncEnabled: existing.ordersSyncEnabled !== false,
        stockSyncEnabled: existing.stockSyncEnabled !== false,
        catalogSyncEnabled: existing.catalogSyncEnabled !== false,
        autoConfirm: existing.autoConfirm !== false,
        autoStartPreparation: Boolean(existing.autoStartPreparation),
      };
      const afterAudit = {
        merchantId: config.merchantId,
        merchantName: config.merchantName,
        enabled: config.enabled,
        pollingEnabled: config.pollingEnabled,
        ordersSyncEnabled: config.ordersSyncEnabled,
        stockSyncEnabled: config.stockSyncEnabled,
        catalogSyncEnabled: config.catalogSyncEnabled,
        autoConfirm: config.autoConfirm,
        autoStartPreparation: config.autoStartPreparation,
      };
      await audit(lojaId, 'configuration.saved', {
        uid,
        ip: getRequestIp(request),
        changes: trackedChanges(beforeAudit, afterAudit, Object.keys(afterAudit)),
        enabled: config.enabled,
        pollingEnabled: config.pollingEnabled,
      });
      return publicConfig(mergePlatformCredentials({...existing, ...config}, platformExisting), canManagePlatform);
    }),

    food99PromoteStoredCredentials: onCall(async (request) => {
      const {uid, lojaId, requester} = await requireCallableStore(request);
      if (!isPlatformAdmin(requester)) {
        throw new HttpsError('permission-denied', 'Somente Dono ou Administrador Master pode ativar a credencial central do 99Food.');
      }
      const storeSnap = await configRef(lojaId).get();
      const storeConfig = storeSnap.exists ? storeSnap.data() || {} : {};
      if (!storeConfig.clientIdSecretVersion || !storeConfig.clientSecretSecretVersion) {
        throw new HttpsError('failed-precondition', 'Esta loja nao possui credenciais salvas para reutilizar.');
      }
      await platformConfigRef().set({
        clientIdSecretVersion: storeConfig.clientIdSecretVersion,
        clientSecretSecretVersion: storeConfig.clientSecretSecretVersion,
        migratedFromStoreId: lojaId,
        clientIdMasked: storeConfig.clientIdMasked || '********',
        clientSecretMasked: storeConfig.clientSecretMasked || '********',
        updatedByUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tokenCache.clear();
      await auditPlatform('platform.credentials.promoted', {
        uid,
        ip: getRequestIp(request),
        changes: {
          migratedFromStoreId: {before: null, after: lojaId},
          clientId: {before: null, after: storeConfig.clientIdMasked || '********'},
          clientSecret: {before: null, after: storeConfig.clientSecretMasked || '********'},
        },
      });
      await audit(lojaId, 'configuration.credentials_promoted', {uid});
      return publicConfig(await loadConfig(lojaId, false), true);
    }),

    food99TestConnection: onCall(async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const config = await loadConfig(lojaId, false);
      const started = Date.now();
      await tokenForStore(lojaId, config);
      await healthRef(lojaId).set({
        provider: PROVIDER,
        status: 'online',
        authValidatedAt: FieldValue.serverTimestamp(),
        latencyMs: Date.now() - started,
      }, {merge: true});
      return {ok: true, latencyMs: Date.now() - started};
    }),

    food99LoadMerchants: onCall(async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const config = await loadConfig(lojaId, false);
      if (!config.clientIdSecretVersion || !config.clientSecretSecretVersion) {
        throw new HttpsError('failed-precondition', 'Cadastre a credencial central do 99Food antes de carregar a loja.');
      }
      if (!config.merchantId) {
        throw new HttpsError('failed-precondition', 'Informe o app_shop_id desta loja antes de carregar os dados da 99Food.');
      }
      const payload = await request99Food(lojaId, config, SHOP_DETAIL_PATH);
      const shop = payload.data || payload;
      const merchants = [{
        id: cleanText(shop.app_shop_id || config.merchantId),
        name: cleanText(shop.name || shop.shop_name || config.merchantName),
        corporateName: cleanText(shop.poi_name || shop.name || shop.shop_name),
        document: onlyDigits(shop.cnpj || shop.document || ''),
      }].filter((merchant) => merchant.id);
      await audit(lojaId, 'shop.loaded', {shopId: config.merchantId});
      return {merchants};
    }),

    food99PollNow: onCall({timeoutSeconds: 120}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const orderId = cleanText(request.data?.orderId);
      if (orderId) {
        const config = await loadConfig(lojaId);
        const event = {
          id: safeId(`manual_${orderId}_${Date.now()}`),
          orderId,
          event_type: 'manual_lookup',
          createdAt: timestampNow(),
        };
        const result = await processEvents(lojaId, config, [event], 'manual_order_lookup');
        return result;
      }
      return runPoll(lojaId, 'manual');
    }),

    food99OrderAction: onCall({timeoutSeconds: 120}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const orderId = cleanText(request.data?.orderId);
      const action = cleanText(request.data?.action);
      if (!orderId) throw new HttpsError('invalid-argument', 'orderId obrigatorio.');
      const config = await loadConfig(lojaId);
      return issueOrderCommand(lojaId, config, orderId, action, request.data || {});
    }),

    food99GetCancellationReasons: onCall({timeoutSeconds: 120}, async (request) => {
      await requireCallableStore(request);
      const orderId = cleanText(request.data?.orderId);
      if (!orderId) throw new HttpsError('invalid-argument', 'orderId obrigatorio.');
      return {
        reasons: [
          {code: 1010, description: 'Produto indisponivel'},
          {code: 1020, description: 'Loja sem capacidade operacional'},
          {code: 1030, description: 'Cliente solicitou cancelamento'},
          {code: 1040, description: 'Endereco fora da area de atendimento'},
          {code: 1050, description: 'Problema no pagamento'},
          {code: 1060, description: 'Pedido duplicado'},
          {code: 1080, description: 'Outro motivo operacional'},
        ],
      };
    }),

    food99LoadCatalogProducts: onCall({timeoutSeconds: 120}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const config = await loadConfig(lojaId);
      const {categories, products, fromCache, stale, cacheAgeSeconds, warning} = await loadCatalogProductsFrom99Food(
        lojaId,
        config,
        {force: request.data?.force === true}
      );
      await audit(lojaId, 'catalog.loaded', {
        categories: categories.length,
        products: products.length,
        fromCache,
        stale,
        cacheAgeSeconds,
      }, stale ? 'warning' : 'info');
      return {products, fromCache, stale, cacheAgeSeconds, warning};
    }),

    food99ImportCatalogProduct: onCall({timeoutSeconds: 120}, async (request) => {
      const {uid, lojaId} = await requireCallableStore(request);
      const itemId = cleanText(request.data?.itemId);
      const productId = cleanText(request.data?.productId);
      if (!itemId && !productId) {
        throw new HttpsError('invalid-argument', 'Informe o item ou produto do catalogo 99Food.');
      }
      const config = await loadConfig(lojaId);
      const clientCatalogProduct = catalogProductFromClient(request.data || {});
      let catalogProduct = null;
      let allowClientFallback = false;
      try {
        const {products: catalogProducts} = await loadCatalogProductsFrom99Food(lojaId, config);
        catalogProduct = catalogProducts.find((item) => (
          (itemId && item.itemId === itemId) || (productId && item.productId === productId)
        )) || null;
      } catch (error) {
        if (!isCatalogRateLimitError(error) || !clientCatalogProduct) throw error;
        allowClientFallback = true;
        catalogProduct = clientCatalogProduct;
        await audit(lojaId, 'catalog.product_import_used_client_snapshot', {
          uid,
          itemId,
          productId,
          error: error.message,
        }, 'warning');
      }
      if (!catalogProduct && allowClientFallback && clientCatalogProduct) {
        catalogProduct = clientCatalogProduct;
      }
      if (!catalogProduct) throw new HttpsError('not-found', 'Produto nao encontrado no catalogo 99Food atual.');
      return importCatalogProductFrom99Food(lojaId, uid, catalogProduct);
    }),

    food99ImportCatalogProducts: onCall({timeoutSeconds: 300, memory: '512MiB'}, async (request) => {
      const {uid, lojaId} = await requireCallableStore(request);
      const requestedItems = Array.isArray(request.data?.items) ? request.data.items : [];
      const requestedKeys = new Set(requestedItems.map((item) => catalogProductSelectionKey(item)).filter(Boolean));
      if (!requestedKeys.size) {
        throw new HttpsError('invalid-argument', 'Selecione pelo menos um item do catalogo 99Food para importar.');
      }

      const config = await loadConfig(lojaId);
      let catalogProducts = [];
      let allowClientFallback = false;
      try {
        const catalogData = await loadCatalogProductsFrom99Food(lojaId, config);
        catalogProducts = catalogData.products;
      } catch (error) {
        if (!isCatalogRateLimitError(error)) throw error;
        allowClientFallback = true;
        catalogProducts = requestedItems.map(catalogProductFromClient).filter(Boolean);
        await audit(lojaId, 'catalog.products_import_used_client_snapshot', {
          uid,
          requested: requestedItems.length,
          availableSnapshots: catalogProducts.length,
          error: error.message,
        }, 'warning');
      }
      const catalogByKey = new Map();
      catalogProducts.forEach((item) => {
        [
          item.itemId,
          item.productId,
          item.externalCode,
          catalogProductSelectionKey(item),
        ].map(cleanText).filter(Boolean).forEach((key) => catalogByKey.set(key, item));
      });

      const results = [];
      for (const requested of requestedItems) {
        const requestedKey = catalogProductSelectionKey(requested);
        const catalogProduct = catalogByKey.get(cleanText(requested.itemId))
          || catalogByKey.get(cleanText(requested.productId))
          || catalogByKey.get(cleanText(requested.externalCode))
          || catalogByKey.get(requestedKey)
          || (allowClientFallback ? catalogProductFromClient(requested) : null);
        if (!catalogProduct) {
          const failedResult = {
            itemKey: requestedKey,
            itemId: cleanText(requested.itemId),
            productId99Food: cleanText(requested.productId),
            externalCode: cleanText(requested.externalCode),
            name: cleanText(requested.name) || requestedKey,
            ok: false,
            status: 'failed',
            error: 'Produto nao encontrado no catalogo 99Food atual.',
          };
          results.push(failedResult);
          await audit(lojaId, 'catalog.product_import_failed', {
            uid,
            requested,
            error: failedResult.error,
          }, 'warning');
          continue;
        }

        try {
          results.push(await importCatalogProductFrom99Food(lojaId, uid, catalogProduct));
        } catch (error) {
          const failedResult = {
            itemKey: requestedKey,
            itemId: catalogProduct.itemId,
            productId99Food: catalogProduct.productId,
            externalCode: catalogProduct.externalCode,
            name: catalogProduct.name,
            categoryName: catalogProduct.categoryName,
            ok: false,
            status: 'failed',
            error: error.message,
          };
          results.push(failedResult);
          await audit(lojaId, 'catalog.product_import_failed', {
            uid,
            food99ProductId: catalogProduct.productId,
            catalogItemId: catalogProduct.itemId,
            error: error.message,
          }, 'warning');
        }
      }

      const imported = results.filter((result) => result.status === 'imported').length;
      const ignored = results.filter((result) => result.status === 'ignored').length;
      const failed = results.filter((result) => result.status === 'failed').length;
      await audit(lojaId, 'catalog.products_imported_batch', {
        uid,
        requested: requestedItems.length,
        imported,
        ignored,
        failed,
      }, failed ? 'warning' : 'info');
      return {requested: requestedItems.length, imported, ignored, failed, results};
    }),

    food99PublishProducts: onCall({timeoutSeconds: 300, memory: '512MiB'}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const config = await loadConfig(lojaId);
      if (!config.merchantId) throw new HttpsError('failed-precondition', 'Selecione a loja 99Food antes de publicar produtos.');
      const requestedIds = Array.isArray(request.data?.productIds)
        ? request.data.productIds.map(cleanText).filter(Boolean)
        : [];
      const collection = db.collection('lojas').doc(lojaId).collection('produtos');
      const productDocs = requestedIds.length
        ? (await Promise.all(requestedIds.map((id) => collection.doc(id).get()))).filter((snap) => snap.exists)
        : (await collection.get()).docs;
      if (!productDocs.length) throw new HttpsError('not-found', 'Nenhum produto interno foi encontrado para publicar.');
      const categories = await loadCatalogCategories(lojaId, config);
      const results = [];
      for (const productDoc of productDocs) {
        try {
          const result = await publishProductTo99Food(lojaId, config, productDoc.id, productDoc.data() || {}, categories, 'manual_publish');
          results.push({...result, ok: true});
        } catch (error) {
          const mappingRef = db.collection('lojas').doc(lojaId).collection('food99ProductMappings').doc(productDoc.id);
          await mappingRef.set({
            productId: productDoc.id,
            publishStatus: 'error',
            publishError: error.message,
            lastPublishAttemptAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          await createAlert(lojaId, 'catalog_publish_failure', error.message, {productId: productDoc.id});
          results.push({productId: productDoc.id, ok: false, error: error.message});
        }
      }
      const published = results.filter((result) => result.ok).length;
      const failed = results.length - published;
      await audit(lojaId, 'catalog.published', {requested: productDocs.length, published, failed}, failed ? 'warning' : 'info');
      return {requested: productDocs.length, published, failed, results};
    }),

    food99SaveProductMapping: onCall({timeoutSeconds: 120}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const productId = cleanText(request.data?.productId);
      const food99ProductId = cleanText(request.data?.food99ProductId);
      if (!productId || !food99ProductId) {
        throw new HttpsError('invalid-argument', 'Produto interno e ID do produto 99Food sao obrigatorios.');
      }
      const catalogProduct = catalogProductFromClient(request.data || {}) || {
        itemId: cleanText(request.data?.catalogItemId) || food99ProductId,
        productId: food99ProductId,
        externalCode: cleanText(request.data?.externalCode) || food99ProductId,
        productExternalCode: '',
        categoryId: '',
        categoryName: '',
        itemStatus: null,
        price: null,
      };
      const conflictRefs = await findConflictingCatalogMappingRefs(lojaId, catalogProduct, productId);
      const productRef = db.collection('lojas').doc(lojaId).collection('produtos').doc(productId);
      const mappingRef = db.collection('lojas').doc(lojaId).collection('food99ProductMappings').doc(productId);
      await db.runTransaction(async (transaction) => {
        transaction.set(productRef, food99ProductLinkPatch(catalogProduct), {merge: true});
        transaction.set(mappingRef, {
          productId,
          food99ProductId,
          externalCode: cleanText(request.data?.externalCode),
          catalogItemId: cleanText(request.data?.catalogItemId),
          productExternalCode: cleanText(catalogProduct.productExternalCode),
          categoryId: cleanText(catalogProduct.categoryId),
          categoryName: cleanText(catalogProduct.categoryName),
          food99Price: catalogProduct.price || null,
          itemStatus: catalogProduct.status ?? null,
          stockSyncEnabled: request.data?.stockSyncEnabled !== false,
          catalogManaged: false,
          importStatus: 'manual_linked',
          syncStatus: 'mapping_saved',
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        conflictRefs.forEach((conflictRef) => transaction.delete(conflictRef));
      });
      try {
        await syncProductAvailability(lojaId, productId, 'mapping_saved');
      } catch (error) {
        logger.warn('[99Food] initial mapping sync failed', {lojaId, productId, error: error.message});
      }
      return {ok: true};
    }),

    food99SyncStockNow: onCall({timeoutSeconds: 120}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const productId = cleanText(request.data?.productId);
      if (productId) return syncProductAvailability(lojaId, productId, 'manual');
      const mappings = await db.collection('lojas').doc(lojaId).collection('food99ProductMappings')
        .where('stockSyncEnabled', '==', true).get();
      const results = [];
      for (const mapping of mappings.docs) {
        results.push(await syncProductAvailability(lojaId, mapping.id, 'manual'));
      }
      return {synced: results.length, results};
    }),

    food99ScheduledPoll: onSchedule({
      schedule: 'every 1 minutes',
      timeoutSeconds: 120,
      memory: '512MiB',
    }, async () => {
      const enabled = await db.collectionGroup('food99').where('pollingEnabled', '==', true).get();
      for (const configDoc of enabled.docs.filter((doc) => doc.id === 'config' && doc.get('enabled') === true)) {
        const lojaId = extractStoreId(configDoc);
        if (!lojaId) continue;
        try {
          await runPoll(lojaId, 'scheduler');
        } catch (error) {
          logger.error('[99Food] scheduled poll failed', {lojaId, error: error.message});
        }
      }
    }),

    food99ProductStockChanged: onDocumentWritten('lojas/{lojaId}/produtos/{productId}', async (event) => {
      if (!event.data?.after?.exists) return;
      const {lojaId, productId} = event.params;
      const beforeData = event.data?.before?.data() || {};
      const afterData = event.data.after.data() || {};
      const stockChanged = asNumber(beforeData.estoque) !== asNumber(afterData.estoque);
      const catalogChanged = [
        'preco99Food', 'nome', 'descricao', 'categoria', 'subcategoria', 'status',
      ].some((field) => String(beforeData[field] ?? '') !== String(afterData[field] ?? ''));
      if (!stockChanged && !catalogChanged) return;
      try {
        const mappingSnap = await db.collection('lojas').doc(lojaId).collection('food99ProductMappings').doc(productId).get();
        if (catalogChanged && mappingSnap.exists && mappingSnap.get('catalogManaged')) {
          const config = await loadConfig(lojaId);
          const categories = await loadCatalogCategories(lojaId, config);
          await publishProductTo99Food(lojaId, config, productId, afterData, categories, 'internal_product_change');
          return;
        }
        if (stockChanged) await syncProductAvailability(lojaId, productId, 'internal_stock_change');
      } catch (error) {
        logger.warn('[99Food] async product sync deferred', {lojaId, productId, error: error.message});
      }
    }),

    food99Webhook: onRequest({timeoutSeconds: 120, memory: '512MiB'}, async (request, response) => {
      if (request.method !== 'POST') {
        response.status(405).json({error: 'Method not allowed'});
        return;
      }
      let lojaId = cleanText(request.query.lojaId);
      try {
        if (!lojaId) {
          const appShopId = cleanText(request.body?.app_shop_id || request.body?.shop?.app_shop_id || request.body?.data?.app_shop_id);
          if (appShopId) {
            const snap = await db.collectionGroup('food99').where('merchantId', '==', appShopId).limit(1).get();
            lojaId = snap.docs[0]?.ref.parent.parent?.id || '';
          }
        }
        if (!lojaId) {
          response.status(400).json({error: 'lojaId ou app_shop_id obrigatorio'});
          return;
        }
        const config = await loadConfig(lojaId);
        if (!config.webhookEnabled) {
          response.status(409).json({error: 'Webhook desabilitado'});
          return;
        }
        if (config.webhookSecretVersion) {
          const secret = await accessSecret(config.webhookSecretVersion);
          const sentSignature = cleanText(request.get('x-99Food-signature'));
          const expected = crypto.createHmac('sha256', secret).update(request.rawBody || Buffer.from(JSON.stringify(request.body))).digest('hex');
          const valid = sentSignature.length === expected.length
            && crypto.timingSafeEqual(Buffer.from(sentSignature), Buffer.from(expected));
          if (!valid) {
            response.status(401).json({error: 'Assinatura invalida'});
            return;
          }
        }
        const payloadEvents = Array.isArray(request.body?.events) ? request.body.events : [request.body || {}];
        const events = payloadEvents.flatMap((payload, index) => {
          const orderIds = extractOrderIds(payload);
          return orderIds.map((orderId) => ({
            ...payload,
            id: cleanText(payload.id || payload.event_id) || safeId(`${orderId}_${index}_${Date.now()}`),
            orderId,
            event_type: payload.event_type || payload.eventType || payload.event || payload.type || 'webhook',
            createdAt: payload.createdAt || payload.create_time || timestampNow(),
          }));
        });
        if (!events.length) {
          await audit(lojaId, 'webhook.ignored', {reason: 'order_id_not_found', payload: request.body}, 'warning');
          response.status(202).json({acknowledged: true, ignored: true});
          return;
        }
        const result = await processEvents(lojaId, config, events, 'webhook');
        response.status(200).json({acknowledged: true, result});
      } catch (error) {
        logger.error('[99Food] webhook failed', {lojaId, error: error.message});
        response.status(500).json({error: error.message});
      }
    }),
  };
};

module.exports = {createFood99Functions};





