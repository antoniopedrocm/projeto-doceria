const crypto = require('crypto');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const {
  CURRENT_FOOD99_HOST,
  FOOD99_ENVIRONMENTS,
  alertFingerprint,
  canRunAuthorizedOperation,
  catalogQueueKey,
  classifyFood99Failure,
  constantTimeEqual,
  dedupeIds,
  environmentDocId,
  extractFood99AppIdFromRawBody,
  findBoundFood99Shop,
  friendlyFood99Error,
  jitteredBackoffMs,
  lockKey,
  mappingDocId,
  nextCatalogAttemptAt,
  normalizeFood99Environment,
  parseFood99JsonPreservingLargeIntegers,
  resolveFood99BaseUrl,
  safeKeyPart,
  sanitizeLogContext,
  secretSafePublicConfig,
  shouldRefreshToken,
  signFood99Params,
  signFood99Webhook,
  tokenCacheKey,
  validateAuthorizationUrl,
  validateFood99ApiBaseUrl,
  validatePublicWebhookUrl,
} = require('./food99-core');

const secretManager = new SecretManagerServiceClient();
const tokenCache = new Map();
const tokenFlights = new Map();

const PROVIDER = 'food99';
const DEFAULT_API_URL = CURRENT_FOOD99_HOST;
const DEFAULT_AUTH_URL = CURRENT_FOOD99_HOST;
const DEFAULT_FOOD99_ENVIRONMENT = FOOD99_ENVIRONMENTS.DEVELOPMENT;
const AUTH_TOKEN_GET_PATH = '/v1/auth/authtoken/get';
const AUTH_TOKEN_REFRESH_PATH = '/v1/auth/authtoken/refresh';
const AUTHORIZATION_PAGE_PATH = '/v1/auth/authorizationpage/getUrl';
const BOUND_SHOPS_LIST_PATH = '/v1/shop/shop/list';
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
const AUTH_LOCK_TTL_MS = 120 * 1000;
const BOUND_SHOPS_RATE_WINDOW_MS = 20 * 1000;
const CATALOG_LOCK_TTL_MS = 90 * 1000;
const HTTP_TIMEOUT_MS = 15 * 1000;
const ACTIVE_EXTERNAL_STATUSES = new Set([
  'PLACED',
  'CONFIRMED',
  'PREPARATION_STARTED',
  'READY_TO_PICKUP',
  'DISPATCHED',
]);
const TERMINAL_EXTERNAL_STATUSES = new Set(['CONCLUDED', 'CANCELLED']);
const LIFECYCLE_EXTERNAL_STATUSES = new Set([...ACTIVE_EXTERNAL_STATUSES, ...TERMINAL_EXTERNAL_STATUSES]);
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const COMPLETED_APP_STATUSES = new Set(['finalizado', 'concluido', 'concluído', 'completed', 'complete', 'finished', 'delivered']);
const CANCELLED_APP_STATUSES = new Set(['cancelado', 'cancelled', 'canceled']);

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

const dateKeyInTimezone = (value, timezone = DEFAULT_TIMEZONE) => {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const todayIntervalInTimezone = (timezone = DEFAULT_TIMEZONE) => {
  const now = new Date();
  const todayKey = dateKeyInTimezone(now, timezone);
  return {
    timezone,
    todayKey,
    startLabel: `${todayKey}T00:00:00`,
    endIso: now.toISOString(),
  };
};

const firestoreDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'number') {
    const millis = value > 100000000000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const orderRelevantDate = (order = {}) => firestoreDate(
  order.completedAt
  || order.finalizedAt
  || order.deliveredAt
  || order.cancelledAt
  || order.updatedAt
  || order.lastEventAt
  || order.createdAt
  || order.data
);

const normalizedStatusText = (value) => cleanText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const isCompletedOrderStatus = (order = {}) => {
  const external = cleanText(order.externalStatus || order.food99Status || order.status99Food).toUpperCase();
  if (['CONCLUDED', 'COMPLETED', 'DELIVERED', 'FINISHED'].includes(external)) return true;
  const status = normalizedStatusText(order.status);
  return COMPLETED_APP_STATUSES.has(status);
};

const isCancelledOrderStatus = (order = {}) => {
  const external = cleanText(order.externalStatus || order.food99Status || order.status99Food).toUpperCase();
  if (['CANCELLED', 'CANCELED'].includes(external)) return true;
  const status = normalizedStatusText(order.status);
  return CANCELLED_APP_STATUSES.has(status);
};

const fingerprintSecret = (value) => {
  const text = String(value || '');
  return text ? crypto.createHash('sha256').update(text).digest('hex').slice(0, 16) : '';
};

const normalizeEnvironment = (value) => normalizeFood99Environment(value, DEFAULT_FOOD99_ENVIRONMENT);
const strictEnvironment = (value) => normalizeFood99Environment(value, '');

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

const destroySecretVersion = async (versionName) => {
  if (!versionName) return;
  await secretManager.destroySecretVersion({name: versionName});
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

const secretValuesEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const extractAppShopIds = (payload) => {
  const found = new Set();
  const visit = (node, key = '') => {
    if (node == null) return;
    if (Array.isArray(node)) {
      node.forEach((value) => visit(value, key));
      return;
    }
    if (typeof node === 'object') {
      Object.entries(node).forEach(([childKey, value]) => visit(value, childKey));
      return;
    }
    const normalizedKey = cleanText(key).toLowerCase().replace(/_/g, '');
    if (['appshopid', 'appshopidlist'].includes(normalizedKey)) {
      const value = cleanText(node);
      if (value) found.add(value);
    }
  };
  visit(payload);
  return [...found];
};

const isShopBindStatusEvent = (payload = {}) => cleanText(
  payload.event_type
  || payload.eventType
  || payload.event
  || payload.type
  || payload.biz_type
  || payload.data?.event_type
  || payload.data?.eventType
  || payload.data?.event
  || payload.data?.type
).toLowerCase().replace(/[^a-z]/g, '').includes('shopbindstatus');

const isAuthorizedBindStatus = (payload = {}) => {
  const raw = payload.bindStatus ?? payload.bind_status ?? payload.data?.bindStatus ?? payload.data?.bind_status;
  const normalized = cleanText(raw).toLowerCase();
  return raw === true || Number(raw) === 1 || ['bound', 'bind', 'authorized', 'success'].includes(normalized);
};

const bindStatusDecision = (payload = {}) => {
  const raw = payload.bindStatus ?? payload.bind_status ?? payload.data?.bindStatus ?? payload.data?.bind_status;
  const normalized = cleanText(raw).toLowerCase();
  if (isAuthorizedBindStatus(payload)) return true;
  if (raw === false
    || (normalized && Number(raw) === 0)
    || ['unbound', 'unbind', 'revoked', 'revoke'].includes(normalized)) return false;
  return null;
};

const bindEventTimestampMs = (payload = {}) => {
  const raw = payload.timestamp
    ?? payload.event_timestamp
    ?? payload.eventTimestamp
    ?? payload.data?.timestamp
    ?? payload.data?.event_timestamp
    ?? payload.data?.eventTimestamp;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric > 100000000000 ? Math.floor(numeric) : Math.floor(numeric * 1000);
};

const bindEventFingerprint = ({appId, environment, appShopIds, authorized, timestampMs}) => crypto
  .createHash('sha256')
  .update(JSON.stringify({
    appId: cleanText(appId),
    environment: strictEnvironment(environment),
    appShopIds: dedupeIds(appShopIds).sort(),
    authorized: Boolean(authorized),
    timestampMs: Math.max(0, Number(timestampMs) || 0),
  }), 'utf8')
  .digest('hex');

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
  const statusChangedAt = data.complete_time
    || data.delivered_time
    || data.delivery_time
    || data.finish_time
    || data.cancel_time
    || data.update_time
    || data.updated_at
    || event.createdAt
    || data.create_time
    || data.created_at
    || timestampNow();
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
    statusChangedAt,
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
  food99SecretAccess = accessSecret,
  food99SecretEnsure = ensureSecret,
  food99SecretAddVersion = addSecretVersion,
  food99SecretDestroyVersion = destroySecretVersion,
  food99Fetch = fetch,
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

  const legacyConfigRef = (lojaId) => db.collection('lojas').doc(lojaId).collection('food99').doc('config');
  const configRef = (lojaId, environment) => db.collection('lojas').doc(lojaId).collection('food99')
    .doc(`config_${normalizeEnvironment(environment)}`);
  const platformConfigRef = () => db.collection('integrations').doc('food99');
  const platformEnvironmentConfigRef = (environment) => platformConfigRef().collection('environments')
    .doc(normalizeEnvironment(environment));
  const platformAuditCollection = () => platformConfigRef().collection('audit');
  const healthRef = (lojaId, environment) => db.collection('lojas').doc(lojaId).collection('food99Health')
    .doc(`status_${normalizeEnvironment(environment)}`);
  const legacyHealthRef = (lojaId) => db.collection('lojas').doc(lojaId).collection('food99Health').doc('status');
  const auditCollection = (lojaId) => db.collection('lojas').doc(lojaId).collection('food99Audit');
  const alertCollection = (lojaId) => db.collection('lojas').doc(lojaId).collection('food99Alerts');
  const catalogCacheRef = (lojaId, environment, appKey = 'app') => db.collection('lojas').doc(lojaId)
    .collection('food99').doc(environmentDocId(CATALOG_CACHE_DOC_ID, environment, appKey));
  const authorizationRef = (lojaId, environment, appKey = 'app') => db.collection('lojas').doc(lojaId)
    .collection('food99').doc(environmentDocId('authorization', environment, appKey));
  const authorizationCheckRateRef = (environment, appKey = 'app') => platformConfigRef()
    .collection('rateLimits').doc(environmentDocId('shop_list', environment, appKey));
  const authorizationSearchRef = (lojaId, environment, appKey = 'app') => db.collection('lojas').doc(lojaId)
    .collection('food99').doc(environmentDocId('authorization_search', environment, appKey));
  const platformLockRef = (key) => platformConfigRef().collection('locks').doc(key);
  const catalogQueueRef = (environment, appKey) => platformConfigRef().collection('catalogQueues')
    .doc(catalogQueueKey({environment, appKey}));
  const mappingCollection = (lojaId) => db.collection('lojas').doc(lojaId).collection('food99ProductMappings');
  const scopedMappingRef = (lojaId, productId, environment) => mappingCollection(lojaId)
    .doc(mappingDocId(environment, productId));

  const mappingBelongsToEnvironment = (mapping = {}, environment) => {
    const recordEnvironment = strictEnvironment(mapping.environment);
    return recordEnvironment
      ? recordEnvironment === environment
      : environment === FOOD99_ENVIRONMENTS.PRODUCTION;
  };

  const readProductMapping = async (lojaId, productId, environment) => {
    const effectiveEnvironment = normalizeEnvironment(environment);
    const writeRef = scopedMappingRef(lojaId, productId, effectiveEnvironment);
    const scopedSnap = await writeRef.get();
    if (scopedSnap.exists || effectiveEnvironment !== FOOD99_ENVIRONMENTS.PRODUCTION) {
      return {snapshot: scopedSnap, writeRef, legacy: false};
    }
    const legacySnap = await mappingCollection(lojaId).doc(productId).get();
    return {snapshot: legacySnap, writeRef, legacy: legacySnap.exists};
  };

  const dedupeMappingDocs = (docs = [], environment) => {
    const byProductId = new Map();
    docs
      .filter((doc) => mappingBelongsToEnvironment(doc.data() || {}, environment))
      .sort((left, right) => Number(Boolean(strictEnvironment(left.get('environment'))))
        - Number(Boolean(strictEnvironment(right.get('environment')))))
      .forEach((doc) => {
        const productId = cleanText(doc.get('productId')) || doc.id;
        byProductId.set(productId, doc);
      });
    return [...byProductId.values()];
  };

  const requestEnvironment = (request) => {
    const environment = strictEnvironment(request.data?.environment);
    if (!environment) {
      throw new HttpsError('invalid-argument', 'Selecione explicitamente o ambiente Desenvolvimento ou Produção.');
    }
    return environment;
  };

  const dateMillis = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const readPlatformConfig = async (environment) => {
    const effectiveEnvironment = normalizeEnvironment(environment);
    const scopedSnap = await platformEnvironmentConfigRef(effectiveEnvironment).get();
    if (effectiveEnvironment !== FOOD99_ENVIRONMENTS.PRODUCTION) {
      return scopedSnap.exists
        ? {id: scopedSnap.id, ...scopedSnap.data(), environment: effectiveEnvironment}
        : {environment: effectiveEnvironment};
    }
    const legacySnap = await platformConfigRef().get();
    if (scopedSnap.exists) {
      return {
        ...(legacySnap.exists ? legacySnap.data() : {}),
        id: scopedSnap.id,
        ...scopedSnap.data(),
        environment: effectiveEnvironment,
        legacyFallback: legacySnap.exists,
      };
    }
    return legacySnap.exists
      ? {id: legacySnap.id, ...legacySnap.data(), environment: effectiveEnvironment, legacyFallback: true}
      : {environment: effectiveEnvironment};
  };

  const readStoreConfig = async (lojaId, environment) => {
    const effectiveEnvironment = normalizeEnvironment(environment);
    const scopedSnap = await configRef(lojaId, effectiveEnvironment).get();
    if (scopedSnap.exists) return {exists: true, data: {id: scopedSnap.id, ...scopedSnap.data(), environment: effectiveEnvironment}};
    if (effectiveEnvironment !== FOOD99_ENVIRONMENTS.PRODUCTION) return {exists: false, data: {environment: effectiveEnvironment}};
    const legacySnap = await legacyConfigRef(lojaId).get();
    return legacySnap.exists
      ? {exists: true, data: {id: legacySnap.id, ...legacySnap.data(), environment: effectiveEnvironment, legacyFallback: true}}
      : {exists: false, data: {environment: effectiveEnvironment}};
  };

  const readHealth = async (lojaId, environment) => {
    const effectiveEnvironment = normalizeEnvironment(environment);
    const scopedSnap = await healthRef(lojaId, effectiveEnvironment).get();
    if (scopedSnap.exists) return scopedSnap.data() || {};
    if (effectiveEnvironment === FOOD99_ENVIRONMENTS.PRODUCTION) {
      const legacySnap = await legacyHealthRef(lojaId).get();
      if (legacySnap.exists) return {...legacySnap.data(), environment: effectiveEnvironment, legacyFallback: true};
    }
    return {status: 'not_configured', environment: effectiveEnvironment};
  };

  const isPlatformAdmin = (requester = {}) => requester.role === 'dono' && requester.allStores === true;

  const setNoStoreHeaders = (request) => {
    const response = request.rawRequest?.res;
    if (!response || typeof response.setHeader !== 'function') return;
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.setHeader('Pragma', 'no-cache');
  };

  const requireCallablePost = (request) => {
    const method = cleanText(request.rawRequest?.method || 'POST').toUpperCase();
    if (method !== 'POST') {
      throw new HttpsError('invalid-argument', 'Metodo nao permitido para esta operacao.');
    }
  };

  const actorFromRequest = (request, uid) => truncate(
    request.auth?.token?.name || request.auth?.token?.email || uid,
    200
  );

  const requirePlatformAdmin = async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Usuario nao autenticado.');
    const requester = await verifyManagementAccess(uid);
    if (!isPlatformAdmin(requester)) {
      throw new HttpsError('permission-denied', 'Informacao protegida - disponivel apenas para o perfil Dono.');
    }
    return {
      uid,
      requester,
      ip: getRequestIp(request),
      actor: actorFromRequest(request, uid),
    };
  };

  const audit = async (lojaId, action, details = {}, severity = 'info', environment = details.environment) => {
    const effectiveEnvironment = normalizeEnvironment(environment);
    await auditCollection(lojaId).add({
      provider: PROVIDER,
      environment: effectiveEnvironment,
      lojaId,
      action,
      severity,
      details: sanitizeLogContext({...details, environment: effectiveEnvironment}),
      createdAt: FieldValue.serverTimestamp(),
    });
  };

  const auditPlatform = async (action, details = {}, severity = 'info', environment = details.environment) => {
    const effectiveEnvironment = normalizeEnvironment(environment);
    await platformAuditCollection().add({
      provider: PROVIDER,
      environment: effectiveEnvironment,
      action,
      severity,
      ...sanitizeLogContext(details),
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

  const createAlert = async (lojaId, type, message, context = {}, environment = context.environment) => {
    const effectiveEnvironment = normalizeEnvironment(environment);
    const classification = classifyFood99Failure({errno: context.errno, httpStatus: context.httpStatus});
    const cause = cleanText(context.cause || classification.cause || type);
    const endpoint = cleanText(context.endpoint || context.path || 'internal');
    const fingerprint = alertFingerprint({
      integration: PROVIDER,
      lojaId,
      environment: effectiveEnvironment,
      endpoint,
      errno: context.errno,
      cause,
    });
    const key = safeId(`${type}_${fingerprint}`);
    const ref = alertCollection(lojaId).doc(key);
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      const previous = existing.exists ? existing.data() || {} : {};
      transaction.set(ref, {
        provider: PROVIDER,
        lojaId,
        environment: effectiveEnvironment,
        type,
        message,
        endpoint,
        errno: Number(context.errno || 0) || null,
        requestId: cleanText(context.requestId),
        cause,
        context: sanitizeLogContext({...context, environment: effectiveEnvironment}),
        fingerprint,
        status: 'open',
        count: Math.max(0, asNumber(previous.count)) + 1,
        firstSeenAt: previous.firstSeenAt || FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: previous.createdAt || FieldValue.serverTimestamp(),
        resolvedAt: FieldValue.delete(),
      }, {merge: true});
    });
    return key;
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

  const loadCatalogCache = async (lojaId, config) => catalogCacheFromSnap(
    await catalogCacheRef(lojaId, config.environment, config.appKey).get()
  );

  const catalogCacheAgeMs = (cache) => {
    if (!cache?.loadedAt) return Number.POSITIVE_INFINITY;
    return Date.now() - cache.loadedAt.getTime();
  };

  const isFreshCatalogCache = (cache) => catalogCacheAgeMs(cache) <= CATALOG_CACHE_TTL_MS;

  const saveCatalogCache = async (lojaId, config, catalogData) => {
    await catalogCacheRef(lojaId, config.environment, config.appKey).set({
      provider: PROVIDER,
      lojaId,
      environment: config.environment,
      appKey: config.appKey,
      products: catalogData.products || [],
      categories: catalogData.categories || [],
      menuState: catalogData.menuState || {categories: catalogData.categories || [], items: []},
      loadedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  };

  const isCatalogRateLimitError = (error) => classifyFood99Failure({
    errno: error?.food99Errno,
    httpStatus: error?.httpStatus,
    endpoint: error?.food99Path,
    errmsg: error?.food99Errmsg,
  }).cause === 'rate_limited';

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

  const resolveAlertsByType = async (lojaId, type, environment, predicate = () => true) => {
    const effectiveEnvironment = normalizeEnvironment(environment);
    const snap = await alertCollection(lojaId).where('type', '==', type).limit(50).get();
    const batch = db.batch();
    let count = 0;
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const recordEnvironment = normalizeEnvironment(data.environment);
      if (recordEnvironment === effectiveEnvironment && data.status !== 'resolved' && predicate(data)) {
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

  const setHealth = async (lojaId, environment, patch = {}) => {
    const effectiveEnvironment = normalizeEnvironment(environment);
    await healthRef(lojaId, effectiveEnvironment).set({
      provider: PROVIDER,
      lojaId,
      environment: effectiveEnvironment,
      ...sanitizeLogContext(patch),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  };

  const acquireDistributedLock = async (key, ttlMs) => {
    const ref = platformLockRef(key);
    const owner = crypto.randomUUID();
    const now = Date.now();
    const acquired = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const existing = snap.exists ? snap.data() || {} : {};
      if (dateMillis(existing.leaseUntil) > now && existing.owner && existing.owner !== owner) return false;
      transaction.set(ref, {
        owner,
        leaseUntil: new Date(now + ttlMs),
        acquiredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return true;
    });
    return acquired ? {key, owner, ref} : null;
  };

  const releaseDistributedLock = async (lock) => {
    if (!lock) return;
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(lock.ref);
      if (!snap.exists || snap.get('owner') !== lock.owner) return;
      transaction.set(lock.ref, {
        owner: FieldValue.delete(),
        leaseUntil: new Date(0),
        releasedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    });
  };

  const runSingleFlight = async (key, operation) => {
    const existing = tokenFlights.get(key);
    if (existing) return existing;
    const flight = Promise.resolve().then(operation).finally(() => tokenFlights.delete(key));
    tokenFlights.set(key, flight);
    return flight;
  };

  const normalizePlatformConfig = (platformConfig = {}) => ({
    ...platformConfig,
    environment: normalizeEnvironment(platformConfig.environment),
    apiBaseUrl: resolveFood99BaseUrl({
      environment: platformConfig.environment,
      savedUrl: platformConfig.apiBaseUrl,
      allowLegacyProduction: Boolean(platformConfig.legacyFallback),
    }),
    authUrl: resolveFood99BaseUrl({
      environment: platformConfig.environment,
      savedUrl: platformConfig.authUrl,
      allowLegacyProduction: Boolean(platformConfig.legacyFallback),
    }),
    webhookUrl: cleanText(platformConfig.webhookUrl),
    webhookEnabled: Boolean(platformConfig.webhookEnabled),
    inventoryEndpointTemplate: cleanText(platformConfig.inventoryEndpointTemplate),
    inventoryMethod: cleanText(platformConfig.inventoryMethod || 'POST').toUpperCase(),
  });

  const mergePlatformCredentials = (storeConfig = {}, platformConfigInput = {}) => {
    const platformConfig = normalizePlatformConfig(platformConfigInput);
    const platformReady = Boolean(platformConfig.clientIdSecretVersion && platformConfig.clientSecretSecretVersion);
    const storeReady = platformConfig.environment === FOOD99_ENVIRONMENTS.PRODUCTION
      && Boolean(storeConfig.clientIdSecretVersion && storeConfig.clientSecretSecretVersion);
    return {
      ...storeConfig,
      clientIdSecretVersion: platformReady
        ? platformConfig.clientIdSecretVersion
        : (storeReady ? storeConfig.clientIdSecretVersion : ''),
      clientSecretSecretVersion: platformReady
        ? platformConfig.clientSecretSecretVersion
        : (storeReady ? storeConfig.clientSecretSecretVersion : ''),
      webhookSecretVersion: platformConfig.webhookSecretVersion
        || (storeReady ? storeConfig.webhookSecretVersion : ''),
      apiBaseUrl: platformConfig.apiBaseUrl,
      authUrl: platformConfig.authUrl,
      environment: platformConfig.environment,
      webhookEnabled: platformConfig.webhookEnabled,
      webhookUrl: platformConfig.webhookUrl,
      inventoryEndpointTemplate: platformConfig.inventoryEndpointTemplate,
      inventoryMethod: platformConfig.inventoryMethod,
      clientIdFingerprint: platformConfig.clientIdFingerprint
        || (storeReady ? storeConfig.clientIdFingerprint : '')
        || '',
      clientIdSuffix: platformConfig.clientIdSuffix
        || cleanText(platformConfig.clientIdMasked).slice(-4)
        || (storeReady ? cleanText(storeConfig.clientIdMasked).slice(-4) : ''),
      credentialScope: platformReady ? 'platform' : (storeReady ? 'legacy_store' : ''),
      platformCredentialsReady: platformReady,
      platformWebhookSecretReady: Boolean(platformConfig.webhookSecretVersion),
      credentialsReady: platformReady || storeReady,
      legacyFallback: Boolean(platformConfig.legacyFallback || storeConfig.legacyFallback),
    };
  };

  const loadConfig = async (lojaId, requireStoreConfiguration = true, environment = DEFAULT_FOOD99_ENVIRONMENT) => {
    const effectiveEnvironment = normalizeEnvironment(environment);
    const [storeResult, platformConfig] = await Promise.all([
      readStoreConfig(lojaId, effectiveEnvironment),
      readPlatformConfig(effectiveEnvironment),
    ]);
    if (!storeResult.exists && requireStoreConfiguration) {
      throw new HttpsError('failed-precondition', 'Configure a integracao 99Food desta loja primeiro.');
    }
    const merged = mergePlatformCredentials(storeResult.data, platformConfig);
    const appKey = merged.clientIdFingerprint || merged.clientIdSuffix || 'app';
    const authSnap = await authorizationRef(lojaId, effectiveEnvironment, appKey).get();
    const authorization = authSnap.exists ? authSnap.data() || {} : {};
    const authorizationRevision = crypto.createHash('sha256').update(JSON.stringify({
      exists: authSnap.exists,
      status: cleanText(authorization.status),
      merchantId: cleanText(authorization.merchantId),
      tokenSecretVersion: cleanText(authorization.tokenSecretVersion),
      tokenExpiresAt: dateMillis(authorization.tokenExpiresAt),
      lastBindEventTimestampMs: asNumber(authorization.lastBindEventTimestampMs),
      lastBindEventKey: cleanText(authorization.lastBindEventKey),
      updatedAt: dateMillis(authorization.updatedAt),
    })).digest('hex');
    const authorizationStatus = !storeResult.exists && !merged.credentialsReady
      ? 'not_configured'
      : (!merged.credentialsReady || !merged.merchantId
        ? 'configuration_incomplete'
        : (authorization.status || merged.authorizationStatus || 'awaiting_authorization'));
    return {
      ...merged,
      environment: effectiveEnvironment,
      appKey,
      authorizationStatus,
      tokenSecretVersion: authorization.tokenSecretVersion || '',
      tokenExpiresAt: authorization.tokenExpiresAt || null,
      tokenRecoveryRequired: Boolean(authorization.tokenRecoveryRequired),
      tokenRecoveryMode: cleanText(authorization.tokenRecoveryMode),
      tokenRecoveryAttempts: asNumber(authorization.tokenRecoveryAttempts),
      authorizationUpdatedAt: authorization.updatedAt || null,
      authorizationRevision,
      pollingSuspendedReason: authorization.suspendReason || merged.pollingSuspendedReason || '',
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
      apiBaseUrl: platformConfig.apiBaseUrl,
      authUrl: platformConfig.authUrl,
      webhookUrl: platformConfig.webhookUrl,
      inventoryEndpointTemplate: platformConfig.inventoryEndpointTemplate,
      inventoryMethod: platformConfig.inventoryMethod,
      webhookEnabled: Boolean(platformConfig.webhookEnabled),
      updatedAt: platformConfig.updatedAt || null,
      updatedByUid: platformConfig.updatedByUid || '',
    };
    if (!canManagePlatform) return base;
    return {...base, webhookSecretReady: Boolean(platformConfig.webhookSecretVersion)};
  };

  const publicConfig = (config = {}, canManagePlatform = false) => secretSafePublicConfig({
    provider: PROVIDER,
    environment: normalizeEnvironment(config.environment),
    apiBaseUrl: config.apiBaseUrl || DEFAULT_API_URL,
    authUrl: config.authUrl || DEFAULT_AUTH_URL,
    enabled: Boolean(config.enabled),
    merchantId: config.merchantId || '',
    merchantName: config.merchantName || '',
    status: config.authorizationStatus || config.status || (config.enabled ? 'configuration_incomplete' : 'not_configured'),
    authorizationStatus: config.authorizationStatus || 'awaiting_authorization',
    pollingSuspendedReason: config.pollingSuspendedReason || '',
    pollingEnabled: Boolean(config.pollingEnabled),
    ordersSyncEnabled: config.ordersSyncEnabled !== false,
    stockSyncEnabled: config.stockSyncEnabled !== false,
    catalogSyncEnabled: config.catalogSyncEnabled !== false,
    credentialsReady: Boolean(config.credentialsReady || (config.clientIdSecretVersion && config.clientSecretSecretVersion)),
    platformCredentialsReady: Boolean(config.platformCredentialsReady),
    credentialScope: config.credentialScope || '',
    platformWebhookSecretReady: Boolean(config.platformWebhookSecretReady),
    ...(canManagePlatform ? {
      webhookEnabled: Boolean(config.webhookEnabled),
    } : {}),
    autoConfirm: Boolean(config.autoConfirm),
    autoStartPreparation: Boolean(config.autoStartPreparation),
    updatedAt: config.updatedAt || null,
  });

  const safeProviderError = (payload = {}) => ({
    errno: asNumber(payload.errno) || null,
    errmsg: truncate(payload.errmsg || payload.message || payload.error || '', 500),
    requestId: truncate(payload.requestId || payload.request_id || '', 160),
  });

  const parseApiResponse = async (response, providerPath, {
    preserveLargeIntegers = false,
    requireJson = false,
  } = {}) => {
    const textPayload = await response.text().catch(() => '');
    let payload = {};
    try {
      payload = textPayload
        ? (preserveLargeIntegers
          ? parseFood99JsonPreservingLargeIntegers(textPayload)
          : JSON.parse(textPayload))
        : {};
    } catch (parseError) {
      if (requireJson) {
        const error = new HttpsError('failed-precondition', `A 99Food retornou JSON inválido em ${providerPath}.`);
        error.httpStatus = 502;
        error.food99Path = providerPath;
        throw error;
      }
      payload = {message: textPayload};
    }
    const providerError = safeProviderError(payload);
    if (!response.ok) {
      const error = new HttpsError('failed-precondition', `99Food ${providerPath} falhou (${response.status}).`);
      error.httpStatus = response.status;
      error.food99Errno = providerError.errno;
      error.food99RequestId = providerError.requestId;
      error.food99Errmsg = providerError.errmsg;
      error.food99Path = providerPath;
      throw error;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'errno') && asNumber(payload.errno) !== 0) {
      const error = new HttpsError('failed-precondition', friendlyFood99Error({
        errno: providerError.errno,
        requestId: providerError.requestId,
        endpoint: providerPath,
        errmsg: providerError.errmsg,
      }));
      error.httpStatus = 200;
      error.food99Errno = providerError.errno;
      error.food99RequestId = providerError.requestId;
      error.food99Errmsg = providerError.errmsg;
      error.food99Path = providerPath;
      throw error;
    }
    return payload;
  };

  const buildUrl = (baseUrl, path, params = {}) => {
    if (!String(path || '').startsWith('/') || String(path || '').startsWith('//')) {
      throw new HttpsError('invalid-argument', 'Endpoint 99Food inválido.');
    }
    const url = new URL(path, `${baseUrl || DEFAULT_API_URL}/`);
    if (url.origin !== CURRENT_FOOD99_HOST) {
      throw new HttpsError('failed-precondition', 'Host 99Food fora da allowlist do backend.');
    }
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && cleanText(value) !== '') {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  };

  const fetchWithTimeout = async (url, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      return await food99Fetch(url, {...options, signal: controller.signal, redirect: 'error'});
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new HttpsError('deadline-exceeded', 'A 99Food não respondeu dentro do tempo limite.');
        timeoutError.httpStatus = 408;
        throw timeoutError;
      }
      const networkError = new HttpsError('unavailable', 'Falha de rede ao acessar a 99Food.');
      networkError.httpStatus = 503;
      throw networkError;
    } finally {
      clearTimeout(timeout);
    }
  };

  const credentialsForConfig = async (config) => {
    const [clientId, clientSecret] = await Promise.all([
      food99SecretAccess(config.clientIdSecretVersion),
      food99SecretAccess(config.clientSecretSecretVersion),
    ]);
    if (!clientId || !clientSecret) {
      throw new HttpsError('failed-precondition', 'App ID/App Secret não cadastrados para o ambiente selecionado.');
    }
    return {clientId, clientSecret};
  };

  const persistAuthToken = async (lojaId, config, tokenData, {
    authorizationPatch = {},
    persistAuthorization = true,
    cacheToken = true,
  } = {}) => {
    const token = cleanText(tokenData.auth_token);
    if (!token) throw new HttpsError('failed-precondition', 'A autenticação 99Food não retornou auth_token.');
    const projectId = getProjectId();
    if (!projectId) throw new HttpsError('failed-precondition', 'Projeto Google Cloud não identificado para proteger o token.');
    const expiresAtSeconds = asNumber(tokenData.token_expiration_time);
    const expiresAt = expiresAtSeconds > 0
      ? new Date(expiresAtSeconds > 100000000000 ? expiresAtSeconds : expiresAtSeconds * 1000)
      : new Date(Date.now() + (55 * 60 * 1000));
    const secretId = safeId([
      'food99_auth_token',
      config.environment,
      config.appKey,
      lojaId,
      config.merchantId,
    ].join('_')).slice(0, 240);
    const resourceName = await food99SecretEnsure(projectId, secretId, {
      app: 'doceria',
      provider: PROVIDER,
      environment: config.environment,
      store: lojaId,
    });
    const tokenSecretVersion = await food99SecretAddVersion(resourceName, token);
    if (persistAuthorization) {
      await authorizationRef(lojaId, config.environment, config.appKey).set({
        provider: PROVIDER,
        recordType: 'authorization',
        lojaId,
        environment: config.environment,
        appKey: config.appKey,
        merchantId: config.merchantId,
        status: 'authorized',
        tokenSecretVersion,
        tokenExpiresAt: expiresAt,
        tokenRecoveryRequired: FieldValue.delete(),
        tokenRecoveryMode: FieldValue.delete(),
        tokenRecoveryReason: FieldValue.delete(),
        tokenRecoveryRequestedAt: FieldValue.delete(),
        suspendReason: FieldValue.delete(),
        authorizedAt: FieldValue.serverTimestamp(),
        ...authorizationPatch,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
    const cacheKey = tokenCacheKey({
      environment: config.environment,
      lojaId,
      appKey: config.appKey,
      merchantId: config.merchantId,
    });
    if (cacheToken) tokenCache.set(cacheKey, {token, expiresAt: expiresAt.getTime()});
    config.tokenSecretVersion = tokenSecretVersion;
    config.tokenExpiresAt = expiresAt;
    config.tokenRecoveryRequired = false;
    return token;
  };

  const suspendAuthorization = async (lojaId, config, status, error) => {
    await authorizationRef(lojaId, config.environment, config.appKey).set({
      provider: PROVIDER,
      recordType: 'authorization',
      lojaId,
      environment: config.environment,
      appKey: config.appKey,
      merchantId: config.merchantId || '',
      status,
      suspendReason: error?.food99Errno || error?.code || 'provider_error',
      lastErrno: error?.food99Errno || null,
      lastRequestId: error?.food99RequestId || '',
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    await setHealth(lojaId, config.environment, {
      status,
      authorizationStatus: status,
      lastErrno: error?.food99Errno || null,
      lastRequestId: error?.food99RequestId || '',
      lastError: error?.message || '',
    });
  };

  const prepareTokenRecovery = async (lojaId, config, mode, error, cacheKey) => {
    tokenCache.delete(cacheKey);
    const ref = authorizationRef(lojaId, config.environment, config.appKey);
    const expectedVersion = cleanText(config.tokenSecretVersion);
    const prepared = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return false;
      const currentVersion = cleanText(snap.get('tokenSecretVersion'));
      if (expectedVersion && currentVersion && currentVersion !== expectedVersion) return 'already_rotated';
      const recoveryAttempts = asNumber(snap.get('tokenRecoveryAttempts'));
      if (recoveryAttempts >= 3) return false;
      transaction.set(ref, {
        tokenExpiresAt: new Date(0),
        tokenRecoveryRequired: true,
        tokenRecoveryMode: mode,
        tokenRecoveryReason: Number(error.food99Errno) || Number(error.httpStatus) || 'provider_rejected_token',
        tokenRecoveryAttempts: recoveryAttempts + 1,
        tokenRecoveryRequestedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return true;
    });
    if (prepared === true) {
      config.tokenExpiresAt = new Date(0);
      config.tokenRecoveryRequired = true;
      config.tokenRecoveryMode = mode;
      config.tokenRecoveryAttempts = asNumber(config.tokenRecoveryAttempts) + 1;
    }
    if (prepared) error.food99TokenRecoveryPrepared = true;
    return Boolean(prepared);
  };

  const clearTokenRecoveryHistory = async (lojaId, config) => {
    if (asNumber(config.tokenRecoveryAttempts) <= 0) return;
    await authorizationRef(lojaId, config.environment, config.appKey).set({
      tokenRecoveryAttempts: FieldValue.delete(),
      tokenRecoveryReason: FieldValue.delete(),
      tokenRecoveryRequestedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    config.tokenRecoveryAttempts = 0;
  };

  const getTokenPayload = async (config, credentials) => {
    const response = await fetchWithTimeout(buildUrl(config.authUrl, AUTH_TOKEN_GET_PATH, {
      app_id: credentials.clientId,
      app_secret: credentials.clientSecret,
      app_shop_id: config.merchantId,
    }), {method: 'GET', headers: {Accept: 'application/json'}});
    return parseApiResponse(response, AUTH_TOKEN_GET_PATH);
  };

  const refreshTokenPayload = async (config, credentials) => {
    const response = await fetchWithTimeout(buildUrl(config.authUrl, AUTH_TOKEN_REFRESH_PATH, {
      app_id: credentials.clientId,
      app_secret: credentials.clientSecret,
      app_shop_id: config.merchantId,
    }), {method: 'GET', headers: {Accept: 'application/json'}});
    return parseApiResponse(response, AUTH_TOKEN_REFRESH_PATH);
  };

  const tokenForStore = async (lojaId, config, {
    allowDisabled = false,
    forceReload = false,
    forceRefresh = false,
  } = {}) => {
    const eligible = canRunAuthorizedOperation(config)
      || (allowDisabled && config.credentialsReady && config.merchantId && config.authorizationStatus === 'authorized');
    if (!eligible) {
      throw new HttpsError('failed-precondition', 'A loja precisa estar habilitada e autorizada neste ambiente antes desta operação.');
    }
    const cacheKey = tokenCacheKey({
      environment: config.environment,
      lojaId,
      appKey: config.appKey,
      merchantId: config.merchantId,
    });
    const cached = tokenCache.get(cacheKey);
    if (!forceReload && !forceRefresh && !config.tokenRecoveryRequired
      && cached && cached.expiresAt > Date.now() + 60000) return cached.token;

    return runSingleFlight(cacheKey, async () => {
      const current = tokenCache.get(cacheKey);
      if (!forceReload && !forceRefresh && !config.tokenRecoveryRequired
        && current && current.expiresAt > Date.now() + 60000) return current.token;
      if (!forceReload && !forceRefresh && !config.tokenRecoveryRequired
        && config.tokenSecretVersion && dateMillis(config.tokenExpiresAt) > Date.now() + 60000) {
        const persistedToken = await food99SecretAccess(config.tokenSecretVersion);
        if (persistedToken) {
          tokenCache.set(cacheKey, {token: persistedToken, expiresAt: dateMillis(config.tokenExpiresAt)});
          return persistedToken;
        }
      }

      const distributedKey = lockKey({
        environment: config.environment,
        appKey: config.appKey,
        lojaId,
        operation: 'auth_token_refresh',
      });
      const lock = await acquireDistributedLock(distributedKey, AUTH_LOCK_TTL_MS);
      if (!lock) {
        const lockError = new HttpsError('aborted', 'A obtenção do token já está em andamento. Tente novamente em instantes.');
        lockError.httpStatus = 425;
        throw lockError;
      }
      try {
        const latestAuthorizationSnap = await authorizationRef(lojaId, config.environment, config.appKey).get();
        const latestAuthorization = latestAuthorizationSnap.exists ? latestAuthorizationSnap.data() || {} : {};
        const lockedConfig = {
          ...config,
          authorizationStatus: latestAuthorization.status || config.authorizationStatus,
          tokenSecretVersion: latestAuthorization.tokenSecretVersion || config.tokenSecretVersion,
          tokenExpiresAt: latestAuthorization.tokenExpiresAt || config.tokenExpiresAt,
          tokenRecoveryRequired: Boolean(latestAuthorization.tokenRecoveryRequired),
          tokenRecoveryMode: cleanText(latestAuthorization.tokenRecoveryMode),
          tokenRecoveryAttempts: asNumber(latestAuthorization.tokenRecoveryAttempts),
        };
        if (lockedConfig.authorizationStatus !== 'authorized') {
          throw new HttpsError('failed-precondition', 'A loja ainda não confirmou a autorização neste ambiente.');
        }
        const requestedRecoveryMode = forceRefresh
          ? 'refresh'
          : (forceReload ? 'reload' : (lockedConfig.tokenRecoveryRequired ? lockedConfig.tokenRecoveryMode : ''));
        const anotherWorkerRotatedToken = (forceReload || forceRefresh)
          && Boolean(latestAuthorization.tokenSecretVersion)
          && latestAuthorization.tokenSecretVersion !== config.tokenSecretVersion;
        if ((!requestedRecoveryMode || anotherWorkerRotatedToken)
          && lockedConfig.tokenSecretVersion
          && dateMillis(lockedConfig.tokenExpiresAt) > Date.now() + 60000) {
          const latestToken = await food99SecretAccess(lockedConfig.tokenSecretVersion);
          if (latestToken) {
            tokenCache.set(cacheKey, {token: latestToken, expiresAt: dateMillis(lockedConfig.tokenExpiresAt)});
            config.tokenSecretVersion = lockedConfig.tokenSecretVersion;
            config.tokenExpiresAt = lockedConfig.tokenExpiresAt;
            config.tokenRecoveryRequired = false;
            config.tokenRecoveryAttempts = lockedConfig.tokenRecoveryAttempts;
            return latestToken;
          }
        }

        const credentials = await credentialsForConfig(lockedConfig);
        let payload;
        try {
          if (requestedRecoveryMode === 'refresh') {
            const refreshAllowed = shouldRefreshToken({
              errno: 10102,
              expiresAtMs: dateMillis(lockedConfig.tokenExpiresAt),
              hasPersistedToken: Boolean(lockedConfig.tokenSecretVersion),
              authorizationStatus: lockedConfig.authorizationStatus,
            });
            if (!refreshAllowed) {
              throw new HttpsError('failed-precondition', 'Não existe token autorizado persistido para renovar nesta loja.');
            }
            await refreshTokenPayload(lockedConfig, credentials);
            payload = await getTokenPayload(lockedConfig, credentials);
          } else {
            try {
              payload = await getTokenPayload(lockedConfig, credentials);
            } catch (error) {
              const refreshAllowed = shouldRefreshToken({
                errno: error.food99Errno,
                expiresAtMs: dateMillis(lockedConfig.tokenExpiresAt),
                hasPersistedToken: Boolean(lockedConfig.tokenSecretVersion),
                authorizationStatus: lockedConfig.authorizationStatus,
              });
              if (!refreshAllowed) throw error;
              await refreshTokenPayload(lockedConfig, credentials);
              payload = await getTokenPayload(lockedConfig, credentials);
            }
          }
        } catch (error) {
          logger.warn('[99Food] token request failed', sanitizeLogContext({
            environment: lockedConfig.environment,
            host: lockedConfig.authUrl,
            endpoint: error.food99Path || AUTH_TOKEN_GET_PATH,
            lojaId,
            merchantId: lockedConfig.merchantId,
            errno: error.food99Errno || null,
            requestId: error.food99RequestId || '',
            attempt: 1,
          }));
          if (Number(error.food99Errno) === 10101) {
            await suspendAuthorization(lojaId, lockedConfig, 'awaiting_authorization', error);
          } else if ([14105, 14106].includes(Number(error.food99Errno))) {
            await suspendAuthorization(lojaId, lockedConfig, 'credentials_invalid', error);
          }
          throw error;
        }
        const token = await persistAuthToken(lojaId, lockedConfig, payload.data || {});
        config.tokenSecretVersion = lockedConfig.tokenSecretVersion;
        config.tokenExpiresAt = lockedConfig.tokenExpiresAt;
        config.tokenRecoveryRequired = false;
        config.tokenRecoveryMode = '';
        config.tokenRecoveryAttempts = lockedConfig.tokenRecoveryAttempts;
        return token;
      } finally {
        await releaseDistributedLock(lock);
      }
    });
  };

  const request99Food = async (lojaId, config, path, {
    method = 'GET',
    body,
    attempts = 4,
    headers = {},
    query = {},
    allowDisabled = false,
  } = {}) => {
    let lastError;
    let tokenRecoveryMode = '';
    let tokenRecoveryAttempted = false;
    const cacheKey = tokenCacheKey({
      environment: config.environment,
      lojaId,
      appKey: config.appKey,
      merchantId: config.merchantId,
    });

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const token = await tokenForStore(lojaId, config, {
          allowDisabled,
          forceReload: tokenRecoveryMode === 'reload',
          forceRefresh: tokenRecoveryMode === 'refresh',
        });
        tokenRecoveryMode = '';
        const upperMethod = cleanText(method || 'GET').toUpperCase();
        const params = upperMethod === 'GET' ? {...query, auth_token: token} : query;
        const url = buildUrl(config.apiBaseUrl || DEFAULT_API_URL, path, params);
        const requestBody = upperMethod === 'GET'
          ? undefined
          : JSON.stringify({auth_token: token, ...(body || {})});
        const response = await fetchWithTimeout(url, {
          method: upperMethod,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...headers,
          },
          body: requestBody,
        });
        const payload = await parseApiResponse(response, `${upperMethod} ${path}`);
        await clearTokenRecoveryHistory(lojaId, config);
        return payload;
      } catch (error) {
        lastError = error;
        const classification = classifyFood99Failure({
          errno: error.food99Errno,
          httpStatus: error.httpStatus,
          endpoint: path,
          errmsg: error.food99Errmsg,
        });
        const providerPath = cleanText(error.food99Path);
        const cameFromTokenEndpoint = providerPath.includes('/v1/auth/authtoken/');
        const tokenExpired = Number(error.food99Errno) === 10102 && !cameFromTokenEndpoint;
        const tokenRejected = Number(error.httpStatus) === 401 && !cameFromTokenEndpoint;
        if (tokenExpired || tokenRejected) {
          await prepareTokenRecovery(
            lojaId,
            config,
            tokenExpired ? 'refresh' : 'reload',
            error,
            cacheKey
          );
        }
        const canRecoverToken = (tokenExpired || tokenRejected)
          && !tokenRecoveryAttempted
          && attempt < attempts - 1;
        if (canRecoverToken) {
          tokenRecoveryMode = tokenExpired ? 'refresh' : 'reload';
          tokenRecoveryAttempted = true;
        }
        const willRetry = canRecoverToken
          || ((!tokenExpired && !tokenRejected) && classification.retryable && attempt < attempts - 1);
        const retryDelayMs = willRetry
          ? (canRecoverToken ? 250 : jitteredBackoffMs(attempt, {baseMs: 500, capMs: 8000}))
          : 0;
        logger.warn('[99Food] request failed', sanitizeLogContext({
          environment: config.environment,
          host: config.apiBaseUrl,
          endpoint: path,
          lojaId,
          merchantId: config.merchantId,
          errno: error.food99Errno || null,
          requestId: error.food99RequestId || '',
          attempt: attempt + 1,
          nextRetryAt: willRetry ? new Date(Date.now() + retryDelayMs).toISOString() : '',
        }));
        if (!willRetry) throw error;
        await delay(retryDelayMs);
      }
    }
    throw lastError || new HttpsError('internal', 'Falha inesperada na API 99Food.');
  };

  const loadMappings = async (lojaId, config) => {
    const snap = await mappingCollection(lojaId).get();
    const index = new Map();
    snap.docs
      .map((mappingDoc) => ({id: mappingDoc.id, productId: mappingDoc.id, ...mappingDoc.data()}))
      .filter((mapping) => mappingBelongsToEnvironment(mapping, config.environment))
      .sort((left, right) => Number(Boolean(strictEnvironment(left.environment)))
        - Number(Boolean(strictEnvironment(right.environment))))
      .forEach((mapping) => {
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

  const persistOrderEvent = async (lojaId, config, event, normalizedOrder) => {
    const eventId = cleanText(event.id || `${normalizedOrder.food99OrderId}_${normalizedOrder.externalStatus}_${event.createdAt || ''}`);
    const eventRef = db.collection('lojas').doc(lojaId).collection('food99Events')
      .doc(environmentDocId('event', config.environment, eventId));
    const externalOrderRef = db.collection('lojas').doc(lojaId).collection('food99Orders')
      .doc(environmentDocId('order', config.environment, normalizedOrder.food99OrderId));
    const orderRef = db.collection('lojas').doc(lojaId).collection('pedidos')
      .doc(`food99_${config.environment}_${safeId(normalizedOrder.food99OrderId)}`);
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
          environmentDocId('food99_movement', config.environment, eventId, change.productId)
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
          environment: config.environment,
          food99OrderId: normalizedOrder.food99OrderId,
          food99EventId: eventId,
          createdAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      });

      const terminalDate = firestoreDate(normalizedOrder.statusChangedAt || event.createdAt) || new Date();
      const terminalPatch = normalizedOrder.externalStatus === 'CONCLUDED'
        ? {completedAt: terminalDate, finalizedAt: terminalDate}
        : normalizedOrder.externalStatus === 'CANCELLED'
          ? {cancelledAt: terminalDate}
          : {};

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
        food99Environment: config.environment,
        food99OrderId: normalizedOrder.food99OrderId,
        food99DisplayId: normalizedOrder.displayId,
        food99Status: normalizedOrder.externalStatus,
        ...terminalPatch,
        updatedAt: FieldValue.serverTimestamp(),
      };
      transaction.set(orderRef, {
        ...internalOrder,
        createdAt: existing.createdAt || FieldValue.serverTimestamp(),
      }, {merge: true});
      transaction.set(externalOrderRef, {
        ...normalizedOrder,
        provider: PROVIDER,
        lojaId,
        environment: config.environment,
        stockTarget: nextTarget,
        hasUnmappedItems: unmapped.length > 0,
        unmappedItems: unmapped.map((item) => ({food99ItemId: item.food99ItemId, nome: item.nome})),
        lastEventId: eventId,
        lastEventAt: event.createdAt || timestampNow(),
        ...terminalPatch,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: existing.createdAt || FieldValue.serverTimestamp(),
      }, {merge: true});
      transaction.set(eventRef, {
        provider: PROVIDER,
        lojaId,
        environment: config.environment,
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
      await createAlert(lojaId, 'insufficient_stock', transactionResult.message, {
        orderId: normalizedOrder.food99OrderId,
      }, config.environment);
      throw new Error(transactionResult.message);
    }
    if (unmapped.length) {
      await createAlert(lojaId, 'unmapped_product', 'Pedido 99Food recebido com item sem mapeamento interno.', {
        orderId: normalizedOrder.food99OrderId,
        items: unmapped.map((item) => ({id: item.food99ItemId, nome: item.nome})),
      }, config.environment);
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
    await audit(lojaId, `order.${action}`, {orderId}, 'info', config.environment);
    return secretSafePublicConfig(result);
  };

  const issueAutomatedCommand = async (lojaId, config, orderId, action) => {
    const commandRef = db.collection('lojas').doc(lojaId).collection('food99Commands').doc(
      environmentDocId('command', config.environment, orderId, action)
    );
    const existing = await commandRef.get();
    if (existing.exists && existing.get('status') === 'accepted') return existing.get('result') || {};
    try {
      const result = await issueOrderCommand(lojaId, config, orderId, action);
      await commandRef.set({
        provider: PROVIDER,
        environment: config.environment,
        orderId,
        action,
        status: 'accepted',
        result,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return result;
    } catch (error) {
      await commandRef.set({
        provider: PROVIDER,
        environment: config.environment,
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
    const existing = await db.collection('lojas').doc(lojaId).collection('food99Orders')
      .doc(environmentDocId('order', config.environment, orderId)).get();
    let detail = event.metadata || {};
    if (!TERMINAL_EXTERNAL_STATUSES.has(status) || !existing.exists) {
      try {
        detail = await getOrderDetailWithRetry(lojaId, config, orderId);
      } catch (error) {
        const eventCreatedAt = Date.parse(event.createdAt || '');
        const exceededDetailWindow = Number.isFinite(eventCreatedAt)
          && Date.now() - eventCreatedAt >= 10 * 60 * 1000;
        if (error.httpStatus === 404 && exceededDetailWindow && event.id) {
          await db.collection('lojas').doc(lojaId).collection('food99Events')
            .doc(environmentDocId('event', config.environment, event.id)).set({
            provider: PROVIDER,
            lojaId,
            environment: config.environment,
            eventId: event.id,
            orderId,
            payload: event,
            status: 'dead_letter_detail_unavailable',
            processedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          await createAlert(lojaId, 'order_detail_unavailable', 'Detalhes do pedido nao ficaram disponiveis em 10 minutos.', {
            orderId,
            eventId: event.id,
          }, config.environment);
          await audit(lojaId, 'event.dead_letter', {
            eventId: event.id,
            orderId,
            reason: 'detail_unavailable',
          }, 'warning', config.environment);
          return {acknowledge: true, deadLetter: true};
        }
        throw error;
      }
    } else if (existing.exists) {
      detail = existing.data().detail || detail;
    }
    const mappingIndex = await loadMappings(lojaId, config);
    const order = normalizeOrderDetail(event, detail, mappingIndex);
    const persisted = await persistOrderEvent(lojaId, config, event, order);
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
        }, 'warning', config.environment);
      }
    }
    if (persisted.duplicate) return {acknowledge: true, duplicate: true};
    await audit(lojaId, 'event.processed', {eventId: event.id, orderId, status}, 'info', config.environment);
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
        await createAlert(lojaId, 'event_processing_failure', error.message, {
          eventId: event.id,
          orderId: event.orderId,
          endpoint: ORDER_DETAIL_PATH,
          errno: error.food99Errno,
          requestId: error.food99RequestId,
        }, config.environment);
        logger.error('[99Food] event processing failed', sanitizeLogContext({
          lojaId,
          environment: config.environment,
          endpoint: ORDER_DETAIL_PATH,
          errno: error.food99Errno,
          requestId: error.food99RequestId,
        }));
      }
    }
    await audit(lojaId, 'events.batch', {
      source,
      received: events.length,
      acknowledged: acknowledgedEventIds.length,
      failures,
    }, failures.length ? 'warning' : 'info', config.environment);
    return {received: events.length, acknowledged: acknowledgedEventIds.length, failures};
  };

  const buildDailyDashboardSummary = async (lojaId, environment, interval = todayIntervalInTimezone()) => {
    const [externalSnap, internalSnap] = await Promise.all([
      db.collection('lojas').doc(lojaId).collection('food99Orders').get(),
      db.collection('lojas').doc(lojaId).collection('pedidos').get(),
    ]);
    const byOrderId = new Map();
    externalSnap.docs.forEach((orderDoc) => {
      const order = {id: orderDoc.id, ...orderDoc.data()};
      const recordEnvironment = strictEnvironment(order.environment);
      if (recordEnvironment && recordEnvironment !== environment) return;
      if (!recordEnvironment && environment !== FOOD99_ENVIRONMENTS.PRODUCTION) return;
      const key = cleanText(order.food99OrderId || order.id || orderDoc.id);
      if (key) byOrderId.set(key, order);
    });
    internalSnap.docs.forEach((orderDoc) => {
      const data = orderDoc.data() || {};
      const isFood99 = cleanText(data.origem).toLowerCase() === '99food'
        || cleanText(data.canalVenda).toLowerCase() === '99food'
        || cleanText(data.food99OrderId);
      if (!isFood99) return;
      const recordEnvironment = strictEnvironment(data.food99Environment || data.environment);
      if (recordEnvironment && recordEnvironment !== environment) return;
      if (!recordEnvironment && environment !== FOOD99_ENVIRONMENTS.PRODUCTION) return;
      const order = {id: orderDoc.id, ...data};
      const key = cleanText(order.food99OrderId || order.id || orderDoc.id);
      if (!key) return;
      byOrderId.set(key, {...(byOrderId.get(key) || {}), ...order});
    });

    const todayOrders = [...byOrderId.values()].filter((order) => {
      const relevantDate = orderRelevantDate(order);
      return relevantDate && dateKeyInTimezone(relevantDate, interval.timezone) === interval.todayKey;
    });
    const activeStatuses = new Set(['pendente', 'em preparo', 'pronto', 'saiu para entrega']);
    const pendingOrders = todayOrders.filter((order) => normalizedStatusText(order.status) === 'pendente');
    const preparingOrders = todayOrders.filter((order) => normalizedStatusText(order.status) === 'em preparo');
    const completedOrders = todayOrders.filter(isCompletedOrderStatus);
    const cancelledOrders = todayOrders.filter(isCancelledOrderStatus);
    const activeOrders = todayOrders.filter((order) => activeStatuses.has(normalizedStatusText(order.status)));
    const pendingSla = pendingOrders.filter((order) => {
      const created = firestoreDate(order.createdAt || order.data);
      return created && Date.now() - created.getTime() > 8 * 60 * 1000;
    }).length;
    const completeTimes = completedOrders.map((order) => {
      const created = firestoreDate(order.createdAt || order.data);
      const completed = orderRelevantDate(order);
      return created && completed ? (completed.getTime() - created.getTime()) / 60000 : null;
    }).filter((minutes) => minutes !== null && Number.isFinite(minutes));
    const revenue = todayOrders
      .filter((order) => !isCancelledOrderStatus(order))
      .reduce((sum, order) => sum + (Number(order.total) || 0), 0);
    const summary = {
      novos: pendingOrders.length,
      preparo: preparingOrders.length,
      finalizados: completedOrders.length,
      cancelados: cancelledOrders.length,
      revenue: money(revenue),
      sla: pendingSla,
      mean: completeTimes.length ? Math.round(completeTimes.reduce((a, b) => a + b, 0) / completeTimes.length) : 0,
      totalToday: todayOrders.length,
      activeToday: activeOrders.length,
    };
    logger.info('[99Food] daily dashboard summary', {
      lojaId,
      environment,
      interval,
      food99OrdersRead: externalSnap.size,
      internalOrdersRead: internalSnap.size,
      todayOrders: todayOrders.length,
      completedToday: summary.finalizados,
      revenue: summary.revenue,
    });
    return {summary, interval, ordersRead: byOrderId.size};
  };

  const syncProductAvailability = async (lojaId, productId, reason = 'stock_change', environment = DEFAULT_FOOD99_ENVIRONMENT) => {
    const effectiveEnvironment = normalizeEnvironment(environment);
    const mappingRecord = await readProductMapping(lojaId, productId, effectiveEnvironment);
    const mappingSnap = mappingRecord.snapshot;
    if (!mappingSnap.exists || !mappingSnap.get('stockSyncEnabled')) return {skipped: 'not_mapped'};
    const [config, productSnap] = await Promise.all([
      loadConfig(lojaId, true, effectiveEnvironment),
      db.collection('lojas').doc(lojaId).collection('produtos').doc(productId).get(),
    ]);
    if (config.stockSyncEnabled === false) return {skipped: 'store_stock_sync_disabled'};
    const mapping = mappingSnap.data() || {};
    const mappingWriteBase = mappingRecord.legacy ? {
      ...mapping,
      provider: PROVIDER,
      environment: effectiveEnvironment,
      productId,
      migratedFromLegacyMapping: true,
    } : {};
    const quantity = Math.max(0, asNumber(productSnap.data()?.estoque));
    const appItemId = cleanText(mapping.food99ProductId || mapping.externalCode || mapping.catalogItemId);
    if (!appItemId) return {skipped: 'missing_app_item_id'};
    if (!config.merchantId) {
      await mappingRecord.writeRef.set({
        ...mappingWriteBase,
        environment: effectiveEnvironment,
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
      await mappingRecord.writeRef.set({
        ...mappingWriteBase,
        environment: effectiveEnvironment,
        lastSyncedQuantity: quantity,
        lastSyncedAvailability: status,
        itemStatus: status,
        syncStatus: 'synced',
        lastSyncAt: FieldValue.serverTimestamp(),
        lastSyncReason: reason,
        syncError: FieldValue.delete(),
      }, {merge: true});
      return {quantity, status, result: secretSafePublicConfig(result)};
    } catch (error) {
      await mappingRecord.writeRef.set({
        ...mappingWriteBase,
        pendingQuantity: quantity,
        syncStatus: 'error',
        syncError: error.message,
        lastSyncAttemptAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      await createAlert(lojaId, 'stock_sync_failure', error.message, {
        productId,
        quantity,
        endpoint: ITEM_STATUS_PATH,
        errno: error.food99Errno,
        requestId: error.food99RequestId,
      }, effectiveEnvironment);
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
    const cached = await loadCatalogCache(lojaId, config);
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
      await saveCatalogCache(lojaId, config, catalogData);
      return {...catalogData, fromCache: false, stale: false, cacheAgeSeconds: 0, warning: ''};
    } catch (error) {
      if (allowStale && cached && isCatalogRateLimitError(error)) {
        await audit(lojaId, 'catalog.loaded_from_cache_rate_limited', {
          ageSeconds: Math.round(catalogCacheAgeMs(cached) / 1000),
          error: error.message,
        }, 'warning', config.environment);
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

  const findExistingCatalogMapping = async (lojaId, catalogProduct, environment) => {
    const snap = await mappingCollection(lojaId).get();
    return snap.docs
      .map((doc) => ({id: doc.id, productId: doc.id, ...doc.data()}))
      .find((mapping) => (
        mappingBelongsToEnvironment(mapping, environment)
        && (cleanText(mapping.food99ProductId) === cleanText(catalogProduct.productId)
        || cleanText(mapping.catalogItemId) === cleanText(catalogProduct.itemId)
        || (catalogProduct.externalCode && cleanText(mapping.externalCode) === cleanText(catalogProduct.externalCode)))
      )) || null;
  };

  const findConflictingCatalogMappingRefs = async (lojaId, catalogProduct, keepProductId, environment) => {
    const snap = await mappingCollection(lojaId).get();
    return snap.docs.filter((mappingDoc) => {
      const mapping = mappingDoc.data() || {};
      if (strictEnvironment(mapping.environment) !== environment || mapping.productId === keepProductId) return false;
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

  const importCatalogProductFrom99Food = async (lojaId, uid, config, catalogProduct) => {
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
    const existingMapping = await findExistingCatalogMapping(lojaId, catalogProduct, config.environment);
    if (existingMapping?.productId && (!existingProduct?.exists || existingProduct.id === existingMapping.productId)) {
      await audit(lojaId, 'catalog.product_import_skipped', {
        uid,
        reason: 'already_mapped',
        productId: existingMapping.productId,
        food99ProductId: catalogProduct.productId,
        catalogItemId: catalogProduct.itemId,
      }, 'info', config.environment);
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
      const mappingRef = scopedMappingRef(lojaId, existingProduct.id, config.environment);
      const conflictRefs = await findConflictingCatalogMappingRefs(
        lojaId,
        catalogProduct,
        existingProduct.id,
        config.environment
      );
      await db.runTransaction(async (transaction) => {
        transaction.set(existingProduct.ref, food99ProductLinkPatch(catalogProduct), {merge: true});
        transaction.set(mappingRef, catalogMappingData(existingProduct.id, catalogProduct, {
          environment: config.environment,
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
      }, 'info', config.environment);
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
    const mappingRef = scopedMappingRef(lojaId, internalProductId, config.environment);

    await db.runTransaction(async (transaction) => {
      transaction.set(productRef, productData, {merge: false});
      transaction.set(mappingRef, catalogMappingData(internalProductId, catalogProduct, {
        environment: config.environment,
      }), {merge: true});
    });

    await audit(lojaId, 'catalog.product_imported', {
      uid,
      productId: internalProductId,
      food99ProductId: catalogProduct.productId,
      catalogItemId: catalogProduct.itemId,
    }, 'info', config.environment);
    return {
      ...resultBase,
      ok: true,
      status: 'imported',
      message: 'Produto importado.',
      productId: internalProductId,
      product: productData,
    };
  };

  const linkCatalogProductToExistingInternalProduct = async (lojaId, uid, config, catalogProduct) => {
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
    if (!existingProduct?.exists) {
      await audit(lojaId, 'catalog.product_link_failed', {
        uid,
        reason: 'internal_product_not_found',
        food99ProductId: catalogProduct.productId,
        catalogItemId: catalogProduct.itemId,
        name: catalogProduct.name,
      }, 'warning', config.environment);
      return {
        ...resultBase,
        ok: false,
        status: 'failed',
        reason: 'internal_product_not_found',
        error: 'Produto interno correspondente nao encontrado.',
      };
    }

    const existingMapping = await findExistingCatalogMapping(lojaId, catalogProduct, config.environment);
    const mappingRef = scopedMappingRef(lojaId, existingProduct.id, config.environment);
    const conflictRefs = await findConflictingCatalogMappingRefs(
      lojaId,
      catalogProduct,
      existingProduct.id,
      config.environment
    );
    await db.runTransaction(async (transaction) => {
      transaction.set(existingProduct.ref, food99ProductLinkPatch(catalogProduct), {merge: true});
      transaction.set(mappingRef, catalogMappingData(existingProduct.id, catalogProduct, {
        environment: config.environment,
        importStatus: 'manual_batch_linked',
        syncStatus: 'waiting_internal_stock_review',
      }), {merge: true});
      conflictRefs.forEach((conflictRef) => transaction.delete(conflictRef));
    });
    await audit(lojaId, 'catalog.product_linked_batch', {
      uid,
      productId: existingProduct.id,
      replacedMappingProductId: existingMapping?.productId || '',
      food99ProductId: catalogProduct.productId,
      catalogItemId: catalogProduct.itemId,
    }, 'info', config.environment);
    return {
      ...resultBase,
      ok: true,
      status: 'linked',
      productId: existingProduct.id,
      replacedMappingProductId: existingMapping?.productId || '',
      message: 'Produto vinculado ao item 99Food.',
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

  const applyProductToMenu = async (lojaId, config, productId, product, menuState) => {
    const price = money(product.preco99Food);
    if (!(price > 0)) {
      throw new Error(`Informe o Preco 99Food de ${product.nome || productId} antes de publicar.`);
    }
    const mappingRecord = await readProductMapping(lojaId, productId, config.environment);
    const mappingRef = mappingRecord.writeRef;
    const mappingSnap = mappingRecord.snapshot;
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
    return {
      mappingRef,
      mappingPatch: {
        provider: PROVIDER,
        environment: config.environment,
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
      },
      result: {productId, externalCode, catalogItemId, food99ProductId, price},
    };
  };

  const publishConsolidatedCatalog = async (lojaId, config, productIds, reason) => {
    if (!canRunAuthorizedOperation(config) || config.catalogSyncEnabled === false) {
      throw new HttpsError('failed-precondition', 'Catálogo suspenso: habilite e autorize a loja neste ambiente.');
    }
    const collection = db.collection('lojas').doc(lojaId).collection('produtos');
    const requestedIds = dedupeIds(productIds);
    const productDocs = requestedIds.length
      ? (await Promise.all(requestedIds.map((id) => collection.doc(id).get()))).filter((snap) => snap.exists)
      : (await collection.get()).docs;
    if (!productDocs.length) throw new HttpsError('not-found', 'Nenhum produto interno foi encontrado para publicar.');

    const menuState = await loadCatalogCategories(lojaId, config);
    const prepared = [];
    for (const productDoc of productDocs) {
      prepared.push(await applyProductToMenu(lojaId, config, productDoc.id, productDoc.data() || {}, menuState));
    }
    const uploadResult = await request99Food(lojaId, config, CATALOG_UPLOAD_PATH, {
      method: 'POST',
      attempts: 1,
      body: {
        menus: menuState.menus,
        categories: menuState.categories,
        items: menuState.items,
        modifier_groups: menuState.modifierGroups || [],
      },
    });
    const batch = db.batch();
    prepared.forEach(({mappingRef, mappingPatch}) => batch.set(mappingRef, {
      ...mappingPatch,
      publishStatus: 'submitted',
      lastUploadTask: uploadResult.data || null,
      lastPublishReason: reason,
      lastPublishAt: FieldValue.serverTimestamp(),
      publishError: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true}));
    await batch.commit();
    await resolveAlertsByType(lojaId, 'catalog_publish_failure', config.environment);
    return {
      published: prepared.length,
      task: uploadResult.data || null,
      results: prepared.map(({result}) => result),
    };
  };

  const enqueueCatalogPublish = async (lojaId, config, productIds, reason, uid = '') => {
    if (!canRunAuthorizedOperation(config) || config.catalogSyncEnabled === false) {
      throw new HttpsError('failed-precondition', 'A loja precisa estar autorizada para enfileirar o catálogo.');
    }
    const queueRef = catalogQueueRef(config.environment, config.appKey);
    const jobRef = queueRef.collection('jobs').doc(safeKeyPart(lojaId));
    const requestedIds = dedupeIds(productIds);
    const queued = await db.runTransaction(async (transaction) => {
      const [queueSnap, jobSnap] = await Promise.all([
        transaction.get(queueRef),
        transaction.get(jobRef),
      ]);
      const queue = queueSnap.exists ? queueSnap.data() || {} : {};
      const job = jobSnap.exists ? jobSnap.data() || {} : {};
      transaction.set(queueRef, {
        provider: PROVIDER,
        environment: config.environment,
        appKey: config.appKey,
        endpoint: CATALOG_UPLOAD_PATH,
        nextAllowedAt: queue.nextAllowedAt || new Date(0),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      transaction.set(jobRef, {
        provider: PROVIDER,
        environment: config.environment,
        appKey: config.appKey,
        lojaId,
        merchantId: config.merchantId,
        productIds: dedupeIds([...(job.productIds || []), ...requestedIds]),
        reasons: dedupeIds([...(job.reasons || []), reason]),
        requestedByUid: uid || job.requestedByUid || '',
        status: 'queued',
        generation: asNumber(job.generation) + 1,
        scheduledAt: queue.nextAllowedAt || new Date(0),
        attempt: asNumber(job.attempt),
        createdAt: job.createdAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {
        status: dateMillis(queue.nextAllowedAt) > Date.now() ? 'scheduled' : 'queued',
        nextAllowedAt: dateMillis(queue.nextAllowedAt)
          ? new Date(dateMillis(queue.nextAllowedAt)).toISOString()
          : null,
      };
    });
    return {queued: true, ...queued};
  };

  const processCatalogQueue = async (environment, appKey, {preferredStoreId = ''} = {}) => {
    const queueRef = catalogQueueRef(environment, appKey);
    const lock = await acquireDistributedLock(lockKey({
      environment,
      appKey,
      operation: CATALOG_UPLOAD_PATH,
    }), CATALOG_LOCK_TTL_MS);
    if (!lock) return {queued: true, status: 'queued', reason: 'dispatcher_locked'};
    try {
      const queueSnap = await queueRef.get();
      const queue = queueSnap.exists ? queueSnap.data() || {} : {};
      const nextAllowedMs = dateMillis(queue.nextAllowedAt);
      if (nextAllowedMs > Date.now()) {
        return {queued: true, status: 'scheduled', nextAllowedAt: new Date(nextAllowedMs).toISOString()};
      }
      const jobsSnap = await queueRef.collection('jobs').where('status', '==', 'queued').limit(20).get();
      const jobs = jobsSnap.docs.sort((left, right) => {
        if (left.id === safeKeyPart(preferredStoreId)) return -1;
        if (right.id === safeKeyPart(preferredStoreId)) return 1;
        return dateMillis(left.get('createdAt')) - dateMillis(right.get('createdAt'));
      });
      const jobSnap = jobs[0];
      if (!jobSnap) return {queued: false, status: 'empty'};
      const job = jobSnap.data() || {};
      const config = await loadConfig(job.lojaId, true, environment);
      if (config.appKey !== appKey || !canRunAuthorizedOperation(config)) {
        await jobSnap.ref.set({
          status: 'suspended',
          suspendReason: 'authorization_or_application_mismatch',
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        return {queued: false, status: 'suspended'};
      }

      await jobSnap.ref.set({
        status: 'running',
        attempt: FieldValue.increment(1),
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      try {
        const result = await publishConsolidatedCatalog(
          job.lojaId,
          config,
          job.productIds || [],
          (job.reasons || []).join(',') || 'queued_publish'
        );
        const nextAllowedAt = new Date(nextCatalogAttemptAt());
        const persistedResult = {published: result.published, task: result.task || null};
        await queueRef.set({
          lastExecutedAt: FieldValue.serverTimestamp(),
          nextAllowedAt,
          lastStoreId: job.lojaId,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        await db.runTransaction(async (transaction) => {
          const currentSnap = await transaction.get(jobSnap.ref);
          const current = currentSnap.exists ? currentSnap.data() || {} : {};
          const changedWhileRunning = asNumber(current.generation) > asNumber(job.generation);
          transaction.set(jobSnap.ref, changedWhileRunning ? {
            status: 'queued',
            scheduledAt: nextAllowedAt,
            result: persistedResult,
            completedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          } : {
            status: 'completed',
            productIds: [],
            reasons: [],
            result: persistedResult,
            completedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
        });
        return {queued: false, status: 'submitted', nextAllowedAt: nextAllowedAt.toISOString(), ...result};
      } catch (error) {
        const classification = classifyFood99Failure({
          errno: error.food99Errno,
          httpStatus: error.httpStatus,
          endpoint: CATALOG_UPLOAD_PATH,
          errmsg: error.food99Errmsg,
        });
        if ([10101, 14105, 14106].includes(Number(error.food99Errno))) {
          await jobSnap.ref.set({
            status: 'suspended',
            suspendReason: classification.cause,
            lastErrno: error.food99Errno,
            lastRequestId: error.food99RequestId || '',
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          return {queued: false, status: 'suspended', reason: classification.cause};
        }
        if (classification.cause === 'rate_limited' || classification.retryable || error.food99TokenRecoveryPrepared) {
          const nextAllowedAt = new Date(nextCatalogAttemptAt());
          await Promise.all([
            queueRef.set({nextAllowedAt, updatedAt: FieldValue.serverTimestamp()}, {merge: true}),
            jobSnap.ref.set({
              status: 'queued',
              scheduledAt: nextAllowedAt,
              lastErrno: error.food99Errno || null,
              lastRequestId: error.food99RequestId || '',
              lastError: error.message,
              updatedAt: FieldValue.serverTimestamp(),
            }, {merge: true}),
          ]);
          await createAlert(job.lojaId, 'catalog_publish_failure', error.message, {
            endpoint: CATALOG_UPLOAD_PATH,
            errno: error.food99Errno,
            requestId: error.food99RequestId,
            cause: classification.cause,
          }, environment);
          return {queued: true, status: 'scheduled', nextAllowedAt: nextAllowedAt.toISOString()};
        }
        await jobSnap.ref.set({
          status: 'suspended',
          lastErrno: error.food99Errno || null,
          lastRequestId: error.food99RequestId || '',
          lastError: error.message,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        await createAlert(job.lojaId, 'catalog_publish_failure', error.message, {
          endpoint: CATALOG_UPLOAD_PATH,
          errno: error.food99Errno,
          requestId: error.food99RequestId,
          cause: classification.cause,
        }, environment);
        throw error;
      }
    } finally {
      await releaseDistributedLock(lock);
    }
  };

  const reconcileFailedAvailability = async (lojaId, environment) => {
    const failed = await mappingCollection(lojaId).where('syncStatus', '==', 'error').limit(20).get();
    const results = [];
    for (const mapping of dedupeMappingDocs(failed.docs, environment).slice(0, 10)) {
      const productId = cleanText(mapping.get('productId')) || mapping.id;
      if (!strictEnvironment(mapping.get('environment')) && environment === FOOD99_ENVIRONMENTS.PRODUCTION) {
        const scopedSnap = await scopedMappingRef(lojaId, productId, environment).get();
        if (scopedSnap.exists) continue;
      }
      try {
        results.push(await syncProductAvailability(lojaId, productId, 'automatic_retry', environment));
      } catch (error) {
        results.push({productId, error: error.message});
      }
    }
    return results;
  };

  const runPoll = async (lojaId, origin, environment) => {
    const config = await loadConfig(lojaId, true, environment);
    if (!canRunAuthorizedOperation(config) || !config.pollingEnabled || config.ordersSyncEnabled === false) {
      return {skipped: true, reason: config.authorizationStatus || 'disabled'};
    }
    if (!config.merchantId) {
      throw new HttpsError('failed-precondition', 'Informe o app_shop_id da loja antes de consultar a 99Food.');
    }
    const started = Date.now();
    try {
      await tokenForStore(lojaId, config);
      const inventoryRetries = await reconcileFailedAvailability(lojaId, config.environment);
      const interval = todayIntervalInTimezone();
      const dashboard = await buildDailyDashboardSummary(lojaId, config.environment, interval);
      const result = {received: 0, acknowledged: 0, failures: []};
      await setHealth(lojaId, config.environment, {
        status: 'authorized',
        authorizationStatus: 'authorized',
        lastPollAt: FieldValue.serverTimestamp(),
        latencyMs: Date.now() - started,
        lastBatch: result,
        lastDashboardSummary: dashboard.summary,
        lastDashboardInterval: dashboard.interval,
        lastDashboardOrdersRead: dashboard.ordersRead,
        lastInventoryRetryCount: inventoryRetries.length,
        consecutiveFailures: 0,
        lastError: FieldValue.delete(),
      });
      logger.info('[99Food] poll completed', {
        lojaId,
        environment: config.environment,
        host: config.apiBaseUrl,
        origin,
        interval: dashboard.interval,
        eventsReceived: result.received,
        ordersUpdated: result.acknowledged,
        completedToday: dashboard.summary.finalizados,
        ordersRead: dashboard.ordersRead,
        inventoryRetries: inventoryRetries.length,
      });
      await audit(lojaId, 'poll.completed', {
        origin,
        interval: dashboard.interval,
        eventsReceived: result.received,
        ordersUpdated: result.acknowledged,
        completedToday: dashboard.summary.finalizados,
        ordersRead: dashboard.ordersRead,
      }, 'info', config.environment);
      await resolveAlertsByType(lojaId, 'api_poll_failure', config.environment);
      return {
        ...result,
        inventoryRetries: inventoryRetries.length,
        dashboardSummary: dashboard.summary,
        interval: dashboard.interval,
      };
    } catch (error) {
      const message = error.message;
      const classification = classifyFood99Failure({
        errno: error.food99Errno,
        httpStatus: error.httpStatus,
        endpoint: error.food99Path,
        errmsg: error.food99Errmsg,
      });
      const previousHealth = await readHealth(lojaId, config.environment);
      const consecutiveFailures = asNumber(previousHealth.consecutiveFailures) + 1;
      const status = Number(error.food99Errno) === 10101
        ? 'awaiting_authorization'
        : ([14105, 14106].includes(Number(error.food99Errno))
          ? 'credentials_invalid'
          : (classification.retryable && consecutiveFailures < 3 ? 'degraded' : 'offline'));
      await setHealth(lojaId, config.environment, {
        status,
        authorizationStatus: status,
        lastPollAt: FieldValue.serverTimestamp(),
        latencyMs: Date.now() - started,
        lastError: message,
        lastErrno: error.food99Errno || null,
        lastRequestId: error.food99RequestId || '',
        consecutiveFailures,
      });
      if (['awaiting_authorization', 'credentials_invalid'].includes(status)) {
        return {skipped: true, reason: status};
      }
      await createAlert(lojaId, 'api_poll_failure', message, {
        httpStatus: error.httpStatus || null,
        merchantId: config.merchantId || '',
        endpoint: error.food99Path || 'poll',
        errno: error.food99Errno,
        requestId: error.food99RequestId,
        cause: classification.cause,
      }, config.environment);
      throw new HttpsError(error.code || 'failed-precondition', message);
    }
  };

  const validateStoreConnection = async (lojaId, config, environment) => {
    const started = Date.now();
    await setHealth(lojaId, environment, {
      status: 'connecting',
      authorizationStatus: 'connecting',
    });
    try {
      await request99Food(lojaId, config, SHOP_DETAIL_PATH, {allowDisabled: true, attempts: 2});
      const latencyMs = Date.now() - started;
      await setHealth(lojaId, environment, {
        status: 'authorized',
        authorizationStatus: 'authorized',
        authValidatedAt: FieldValue.serverTimestamp(),
        latencyMs,
        consecutiveFailures: 0,
        lastError: FieldValue.delete(),
        lastErrno: FieldValue.delete(),
        lastRequestId: FieldValue.delete(),
      });
      await resolveAlertsByType(lojaId, 'api_poll_failure', environment);
      return latencyMs;
    } catch (error) {
      const classification = classifyFood99Failure({
        errno: error.food99Errno,
        httpStatus: error.httpStatus,
        endpoint: error.food99Path || SHOP_DETAIL_PATH,
        errmsg: error.food99Errmsg,
      });
      const previousHealth = await readHealth(lojaId, environment);
      const consecutiveFailures = asNumber(previousHealth.consecutiveFailures) + 1;
      const status = Number(error.food99Errno) === 10101
        ? 'awaiting_authorization'
        : ([14105, 14106].includes(Number(error.food99Errno))
          ? 'credentials_invalid'
          : (consecutiveFailures >= 3 ? 'offline' : 'degraded'));
      await setHealth(lojaId, environment, {
        status,
        authorizationStatus: status,
        latencyMs: Date.now() - started,
        consecutiveFailures,
        lastError: error.message,
        lastErrno: error.food99Errno || null,
        lastRequestId: error.food99RequestId || '',
        failureCause: classification.cause,
      });
      throw error;
    }
  };

  const validateStoreToken = async (config, token) => {
    const started = Date.now();
    const cleanToken = cleanText(token);
    if (!cleanToken) throw new HttpsError('failed-precondition', 'A autenticação 99Food não retornou auth_token.');
    const response = await fetchWithTimeout(buildUrl(
      config.apiBaseUrl || DEFAULT_API_URL,
      SHOP_DETAIL_PATH,
      {auth_token: cleanToken}
    ), {method: 'GET', headers: {Accept: 'application/json'}});
    await parseApiResponse(response, `GET ${SHOP_DETAIL_PATH}`);
    return Date.now() - started;
  };

  const claimBoundShopsRateWindow = async (config) => {
    const ref = authorizationCheckRateRef(config.environment, config.appKey);
    const now = Date.now();
    return db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const current = snap.exists ? snap.data() || {} : {};
      const nextAllowedMs = dateMillis(current.nextAllowedAt);
      if (nextAllowedMs > now) {
        return {
          claimed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((nextAllowedMs - now) / 1000)),
        };
      }
      transaction.set(ref, {
        provider: PROVIDER,
        environment: config.environment,
        appKey: config.appKey,
        endpoint: BOUND_SHOPS_LIST_PATH,
        nextAllowedAt: new Date(now + BOUND_SHOPS_RATE_WINDOW_MS),
        lastRequestedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {claimed: true, retryAfterSeconds: 0};
    });
  };

  const fetchBoundShopForConfig = async (lojaId, config) => {
    const rateWindow = await claimBoundShopsRateWindow(config);
    if (!rateWindow.claimed) return {rateLimited: true, ...rateWindow};

    const searchRef = authorizationSearchRef(lojaId, config.environment, config.appKey);
    const searchSnap = await searchRef.get();
    const savedMerchantId = searchSnap.exists ? cleanText(searchSnap.get('merchantId')) : '';
    const savedPage = searchSnap.exists && savedMerchantId === cleanText(config.merchantId)
      ? Math.floor(asNumber(searchSnap.get('nextPage')))
      : 0;
    const pageNo = Math.max(1, Math.min(100000, savedPage || 1));

    const credentials = await credentialsForConfig(config);
    const appId = cleanText(credentials.clientId);
    if (!/^\d+$/.test(appId)) {
      throw new HttpsError('failed-precondition', 'O App ID protegido da 99Food deve conter somente dígitos.');
    }
    const unsignedBody = {
      app_id: appId,
      page_no: pageNo,
      page_size: 100,
      timestamp: Math.floor(Date.now() / 1000),
    };
    const signedBody = {
      ...unsignedBody,
      sign: signFood99Params(unsignedBody, credentials.clientSecret),
    };
    // app_id is a 64-bit JSON integer in the official contract. Keep it
    // unquoted without ever converting it to a JavaScript Number.
    const serializedBody = JSON.stringify(signedBody).replace(
      `"app_id":${JSON.stringify(appId)}`,
      `"app_id":${appId}`
    );
    const response = await fetchWithTimeout(buildUrl(config.apiBaseUrl, BOUND_SHOPS_LIST_PATH), {
      method: 'POST',
      headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
      body: serializedBody,
    });
    const payload = await parseApiResponse(response, `POST ${BOUND_SHOPS_LIST_PATH}`, {
      preserveLargeIntegers: true,
      requireJson: true,
    });
    const data = payload.data;
    const totalPagesValue = Number(data?.total_page);
    const responsePageValue = Number(data?.page_no);
    const validSchema = data
      && typeof data === 'object'
      && !Array.isArray(data)
      && Array.isArray(data.shops)
      && Number.isInteger(totalPagesValue)
      && totalPagesValue >= 0
      && Number.isInteger(responsePageValue)
      && responsePageValue === pageNo
      && data.shops.every((shop) => (
        shop
        && typeof shop === 'object'
        && !Array.isArray(shop)
        && typeof shop.app_shop_id === 'string'
        && cleanText(shop.app_shop_id) !== ''
        && [0, 1].includes(Number(shop.bound_flag))
        && Number.isInteger(Number(shop.bound_flag))
      ));
    if (!validSchema) {
      const schemaError = new HttpsError(
        'failed-precondition',
        'A 99Food retornou uma lista de lojas incompleta; nenhuma autorização foi alterada.'
      );
      schemaError.httpStatus = 502;
      schemaError.food99Path = `POST ${BOUND_SHOPS_LIST_PATH}`;
      throw schemaError;
    }
    const shops = data.shops;
    const totalPages = Math.max(1, totalPagesValue);
    const responsePage = responsePageValue;
    const cursorInvalidated = responsePage > totalPages;
    const match = cursorInvalidated ? null : findBoundFood99Shop(shops, config.merchantId);
    const searchComplete = !cursorInvalidated && (Boolean(match) || responsePage >= totalPages);
    const nextPage = searchComplete || cursorInvalidated ? 1 : responsePage + 1;
    await searchRef.set({
      provider: PROVIDER,
      recordType: 'authorization_search',
      lojaId,
      environment: config.environment,
      appKey: config.appKey,
      merchantId: config.merchantId,
      lastPage: responsePage,
      nextPage,
      totalPages,
      searchComplete,
      cursorInvalidated,
      lastCheckedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {
      match,
      pageNo: responsePage,
      nextPage,
      totalPages,
      searchComplete,
      cursorInvalidated,
    };
  };

  const assertReconciliationConfigUnchanged = async (
    transaction,
    lojaId,
    config,
    environment,
    {checkAuthorization = true} = {}
  ) => {
    const [scopedStoreSnap, scopedPlatformSnap, legacyStoreSnap, legacyPlatformSnap, currentAuthSnap] = await Promise.all([
      transaction.get(configRef(lojaId, environment)),
      transaction.get(platformEnvironmentConfigRef(environment)),
      environment === FOOD99_ENVIRONMENTS.PRODUCTION
        ? transaction.get(legacyConfigRef(lojaId))
        : Promise.resolve(null),
      environment === FOOD99_ENVIRONMENTS.PRODUCTION
        ? transaction.get(platformConfigRef())
        : Promise.resolve(null),
      checkAuthorization
        ? transaction.get(authorizationRef(lojaId, environment, config.appKey))
        : Promise.resolve(null),
    ]);
    const storeData = scopedStoreSnap.exists
      ? scopedStoreSnap.data() || {}
      : (legacyStoreSnap?.exists ? legacyStoreSnap.data() || {} : null);
    if (!storeData) {
      throw new HttpsError('aborted', 'A configuração da loja mudou durante a verificação. Atualize a tela e tente novamente.');
    }
    const platformData = scopedPlatformSnap.exists
      ? {
        ...(legacyPlatformSnap?.exists ? legacyPlatformSnap.data() || {} : {}),
        ...(scopedPlatformSnap.data() || {}),
        environment,
      }
      : (legacyPlatformSnap?.exists
        ? {...(legacyPlatformSnap.data() || {}), environment}
        : {environment});
    const current = mergePlatformCredentials({...storeData, environment}, platformData);
    const currentAppKey = current.clientIdFingerprint || current.clientIdSuffix || 'app';
    const unchanged = cleanText(current.merchantId) === cleanText(config.merchantId)
      && cleanText(currentAppKey) === cleanText(config.appKey)
      && cleanText(current.clientIdSecretVersion) === cleanText(config.clientIdSecretVersion)
      && cleanText(current.clientSecretSecretVersion) === cleanText(config.clientSecretSecretVersion);
    if (!unchanged) {
      throw new HttpsError('aborted', 'A configuração da loja mudou durante a verificação. Atualize a tela e tente novamente.');
    }
    if (checkAuthorization) {
      const currentAuthorization = currentAuthSnap.exists ? currentAuthSnap.data() || {} : {};
      const currentRevision = crypto.createHash('sha256').update(JSON.stringify({
        exists: currentAuthSnap.exists,
        status: cleanText(currentAuthorization.status),
        merchantId: cleanText(currentAuthorization.merchantId),
        tokenSecretVersion: cleanText(currentAuthorization.tokenSecretVersion),
        tokenExpiresAt: dateMillis(currentAuthorization.tokenExpiresAt),
        lastBindEventTimestampMs: asNumber(currentAuthorization.lastBindEventTimestampMs),
        lastBindEventKey: cleanText(currentAuthorization.lastBindEventKey),
        updatedAt: dateMillis(currentAuthorization.updatedAt),
      })).digest('hex');
      if (currentRevision !== config.authorizationRevision) {
        throw new HttpsError('aborted', 'A autorização mudou durante a verificação. Atualize a tela e tente novamente.');
      }
    }
  };

  const reconcileStoreAuthorization = async (lojaId, config, environment, uid) => {
    const wasAuthorized = config.authorizationStatus === 'authorized';
    const lookup = await fetchBoundShopForConfig(lojaId, config);
    if (lookup.rateLimited) {
      return {
        authorized: wasAuthorized,
        authorizationStatus: wasAuthorized ? 'authorized' : 'awaiting_authorization',
        retryAfterSeconds: lookup.retryAfterSeconds,
        message: `A consulta oficial já foi executada. Aguarde ${lookup.retryAfterSeconds}s para verificar novamente.`,
      };
    }
    if (!lookup.match) {
      const message = lookup.cursorInvalidated
        ? 'A lista oficial mudou durante a consulta. O cursor voltou à página 1; aguarde 20s e verifique novamente.'
        : (!lookup.searchComplete
          ? `A página ${lookup.pageNo} de ${lookup.totalPages} foi verificada. Aguarde 20s e use “Verificar autorização” para continuar na página ${lookup.nextPage}.`
          : 'A busca oficial foi concluída, mas o app_shop_id salvo não consta como vinculado a este App ID.');
      if (lookup.searchComplete) {
        const pendingAuditRef = auditCollection(lojaId).doc(environmentDocId(
          'authorization_pending',
          environment,
          crypto.randomUUID()
        ));
        await db.runTransaction(async (transaction) => {
          await assertReconciliationConfigUnchanged(transaction, lojaId, config, environment);
          transaction.set(authorizationRef(lojaId, environment, config.appKey), {
            provider: PROVIDER,
            recordType: 'authorization',
            lojaId,
            environment,
            appKey: config.appKey,
            merchantId: config.merchantId,
            status: 'awaiting_authorization',
            suspendReason: 'shop_not_bound',
            tokenSecretVersion: FieldValue.delete(),
            tokenExpiresAt: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          transaction.set(healthRef(lojaId, environment), {
            provider: PROVIDER,
            lojaId,
            environment,
            status: 'awaiting_authorization',
            authorizationStatus: 'awaiting_authorization',
            lastAuthorizationCheckAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          transaction.set(pendingAuditRef, {
            provider: PROVIDER,
            environment,
            lojaId,
            action: 'authorization.reconciliation_pending',
            severity: 'warning',
            details: {
              environment,
              uid,
              endpoint: BOUND_SHOPS_LIST_PATH,
              reason: 'shop_not_bound',
              pageNo: lookup.pageNo,
              totalPages: lookup.totalPages,
            },
            createdAt: FieldValue.serverTimestamp(),
          });
        });
        tokenCache.delete(tokenCacheKey({
          environment,
          lojaId,
          appKey: config.appKey,
          merchantId: config.merchantId,
        }));
        return {authorized: false, authorizationStatus: 'awaiting_authorization', message};
      }

      await audit(lojaId, 'authorization.reconciliation_pending', {
        uid,
        endpoint: BOUND_SHOPS_LIST_PATH,
        reason: lookup.cursorInvalidated ? 'cursor_invalidated' : 'additional_pages',
        pageNo: lookup.pageNo,
        totalPages: lookup.totalPages,
      }, 'warning', environment);
      return {
        authorized: wasAuthorized,
        authorizationStatus: wasAuthorized ? 'authorized' : 'awaiting_authorization',
        message,
      };
    }

    const hasReusableToken = wasAuthorized
      && Boolean(config.tokenSecretVersion)
      && !config.tokenRecoveryRequired
      && dateMillis(config.tokenExpiresAt) > Date.now() + 60000;
    if (hasReusableToken) {
      const existingToken = await food99SecretAccess(config.tokenSecretVersion);
      if (!existingToken) {
        config.tokenSecretVersion = '';
        config.tokenExpiresAt = null;
      } else {
      const latencyMs = await validateStoreToken(config, existingToken);
      const verificationAuditRef = auditCollection(lojaId).doc(environmentDocId(
        'authorization_verified',
        environment,
        crypto.randomUUID()
      ));
      await db.runTransaction(async (transaction) => {
        await assertReconciliationConfigUnchanged(transaction, lojaId, config, environment);
        transaction.set(authorizationRef(lojaId, environment, config.appKey), {
          authorizationSource: 'shop_list_reconciliation',
          authorizationConfirmedAt: FieldValue.serverTimestamp(),
          reconciliationEndpoint: BOUND_SHOPS_LIST_PATH,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        transaction.set(healthRef(lojaId, environment), {
          provider: PROVIDER,
          lojaId,
          environment,
          status: 'authorized',
          authorizationStatus: 'authorized',
          authValidatedAt: FieldValue.serverTimestamp(),
          latencyMs,
          consecutiveFailures: 0,
          lastError: FieldValue.delete(),
          lastErrno: FieldValue.delete(),
          lastRequestId: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        transaction.set(verificationAuditRef, {
          provider: PROVIDER,
          environment,
          lojaId,
          action: 'authorization.verified',
          severity: 'info',
          details: {
            environment,
            uid,
            endpoint: BOUND_SHOPS_LIST_PATH,
            appShopId: lookup.match.appShopId,
            source: 'official_bound_store_list',
          },
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      return {
        authorized: true,
        authorizationStatus: 'authorized',
        source: 'shop_list',
        latencyMs,
        message: 'Vínculo e token confirmados pela lista oficial da 99Food.',
      };
      }
    }

    const credentials = await credentialsForConfig(config);
    const tokenPayload = await getTokenPayload(config, credentials);
    const tokenData = tokenPayload.data || {};
    const latencyMs = await validateStoreToken(config, tokenData.auth_token);
    const token = await persistAuthToken(lojaId, config, tokenData, {
      persistAuthorization: false,
      cacheToken: false,
    });
    config.authorizationStatus = 'authorized';
    const reconciliationAuditRef = auditCollection(lojaId).doc(environmentDocId(
      'authorization_reconciled',
      environment,
      crypto.randomUUID()
    ));
    try {
      await db.runTransaction(async (transaction) => {
        await assertReconciliationConfigUnchanged(transaction, lojaId, config, environment);
        transaction.set(authorizationRef(lojaId, environment, config.appKey), {
        provider: PROVIDER,
        recordType: 'authorization',
        lojaId,
        environment,
        appKey: config.appKey,
        merchantId: config.merchantId,
        status: 'authorized',
        tokenSecretVersion: config.tokenSecretVersion,
        tokenExpiresAt: config.tokenExpiresAt,
        tokenRecoveryRequired: FieldValue.delete(),
        tokenRecoveryMode: FieldValue.delete(),
        tokenRecoveryReason: FieldValue.delete(),
        tokenRecoveryRequestedAt: FieldValue.delete(),
        suspendReason: FieldValue.delete(),
        authorizationSource: 'shop_list_reconciliation',
        authorizationConfirmedAt: FieldValue.serverTimestamp(),
        reconciliationEndpoint: BOUND_SHOPS_LIST_PATH,
        authorizedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
        transaction.set(healthRef(lojaId, environment), {
        provider: PROVIDER,
        lojaId,
        environment,
        status: 'authorized',
        authorizationStatus: 'authorized',
        authValidatedAt: FieldValue.serverTimestamp(),
        latencyMs,
        consecutiveFailures: 0,
        lastError: FieldValue.delete(),
        lastErrno: FieldValue.delete(),
        lastRequestId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
        transaction.set(reconciliationAuditRef, {
        provider: PROVIDER,
        environment,
        lojaId,
        action: 'authorization.reconciled',
        severity: 'info',
        details: {
          environment,
          uid,
          endpoint: BOUND_SHOPS_LIST_PATH,
          appShopId: lookup.match.appShopId,
          source: 'official_bound_store_list',
        },
        createdAt: FieldValue.serverTimestamp(),
        });
      });
    } catch (error) {
      let versionReferenced = true;
      try {
        const latestAuthSnap = await authorizationRef(lojaId, environment, config.appKey).get();
        versionReferenced = latestAuthSnap.exists
          && cleanText(latestAuthSnap.get('tokenSecretVersion')) === cleanText(config.tokenSecretVersion);
      } catch (referenceError) {
        logger.error('[99Food] token version reference check failed', sanitizeLogContext({
          environment,
          lojaId,
          merchantId: config.merchantId,
          code: referenceError?.code || '',
        }));
      }
      if (!versionReferenced) {
        try {
          await food99SecretDestroyVersion(config.tokenSecretVersion);
          config.tokenSecretVersion = '';
          config.tokenExpiresAt = null;
        } catch (cleanupError) {
          logger.error('[99Food] orphan token version cleanup failed', sanitizeLogContext({
            environment,
            lojaId,
            merchantId: config.merchantId,
            code: cleanupError?.code || '',
          }));
        }
      }
      throw error;
    }
    tokenCache.set(tokenCacheKey({
      environment,
      lojaId,
      appKey: config.appKey,
      merchantId: config.merchantId,
    }), {token, expiresAt: dateMillis(config.tokenExpiresAt)});
    return {
      authorized: true,
      authorizationStatus: 'authorized',
      source: 'shop_list',
      latencyMs,
      message: 'Vínculo confirmado pela lista oficial de lojas autorizadas da 99Food.',
    };
  };

  const buildPlatformSettings = (currentInput, incoming, environment) => {
    const current = normalizePlatformConfig({...currentInput, environment});
    const has = (field) => Object.prototype.hasOwnProperty.call(incoming, field);
    const apiBaseInput = has('apiBaseUrl') ? cleanText(incoming.apiBaseUrl) : current.apiBaseUrl;
    const authInput = has('authUrl') ? cleanText(incoming.authUrl) : current.authUrl;
    const webhookInput = has('webhookUrl') ? cleanText(incoming.webhookUrl) : current.webhookUrl;

    if (!apiBaseInput || !authInput) {
      throw new HttpsError('invalid-argument', 'API base e URL de autenticacao sao obrigatorias.');
    }
    const apiBaseUrl = validateFood99ApiBaseUrl(apiBaseInput);
    const authUrl = validateFood99ApiBaseUrl(authInput);
    if (!apiBaseUrl || !authUrl) {
      throw new HttpsError('invalid-argument', 'URL não autorizada para a integração 99Food.');
    }
    if (has('webhookUrl') && !webhookInput) {
      throw new HttpsError('invalid-argument', 'A URL publica do webhook nao pode ficar vazia.');
    }
    const webhookUrl = webhookInput ? validatePublicWebhookUrl(webhookInput) : '';
    if (webhookInput && !webhookUrl) {
      throw new HttpsError('invalid-argument', 'URL publica do webhook invalida. Use HTTPS e um host publico.');
    }

    const inventoryMethod = cleanText(incoming.inventoryMethod || current.inventoryMethod || 'POST').toUpperCase();
    if (!['POST', 'PUT', 'PATCH'].includes(inventoryMethod)) {
      throw new HttpsError('invalid-argument', 'Metodo de disponibilidade invalido.');
    }

    const before = {
      apiBaseUrl: current.apiBaseUrl,
      authUrl: current.authUrl,
      webhookUrl: current.webhookUrl,
      webhookEnabled: Boolean(current.webhookEnabled),
      inventoryEndpointTemplate: cleanText(current.inventoryEndpointTemplate),
      inventoryMethod: cleanText(current.inventoryMethod || 'POST').toUpperCase(),
    };
    const after = {
      apiBaseUrl,
      authUrl,
      webhookUrl,
      webhookEnabled: has('webhookEnabled') ? Boolean(incoming.webhookEnabled) : before.webhookEnabled,
      inventoryEndpointTemplate: has('inventoryEndpointTemplate')
        ? cleanText(incoming.inventoryEndpointTemplate)
        : before.inventoryEndpointTemplate,
      inventoryMethod,
    };
    return {
      before,
      after,
      changes: trackedChanges(before, after, Object.keys(after)),
    };
  };

  const platformSecretDefinition = (kind, environment) => {
    if (kind === 'app_id') {
      return {
        secretId: `food99_${environment}_platform_app_id`,
        pointerField: 'clientIdSecretVersion',
        patch: (value, version) => ({
          clientIdSecretVersion: version,
          clientIdSuffix: value.slice(-4),
          clientIdMasked: '********',
          clientIdFingerprint: fingerprintSecret(value),
        }),
      };
    }
    if (kind === 'app_secret') {
      return {
        secretId: `food99_${environment}_platform_app_secret`,
        pointerField: 'clientSecretSecretVersion',
        patch: (value, version) => ({
          clientSecretSecretVersion: version,
          clientSecretMasked: '********',
          clientSecretFingerprint: fingerprintSecret(value),
        }),
      };
    }
    throw new HttpsError('invalid-argument', 'Credencial 99Food invalida.');
  };

  const mappedStoreIdsForAppShopIds = async (appShopIds, environment, hintedStoreId = '') => {
    const matchedStoreIds = new Set(hintedStoreId ? [hintedStoreId] : []);
    for (const appShopId of dedupeIds(appShopIds)) {
      const snap = await db.collectionGroup('food99').where('merchantId', '==', appShopId).get();
      snap.docs.forEach((doc) => {
        const docEnvironment = doc.id === 'config_development'
          ? FOOD99_ENVIRONMENTS.DEVELOPMENT
          : (doc.id === 'config_production' || doc.id === 'config'
            ? FOOD99_ENVIRONMENTS.PRODUCTION
            : strictEnvironment(doc.get('environment')));
        if (docEnvironment !== environment) return;
        const storeId = extractStoreId(doc);
        if (storeId) matchedStoreIds.add(storeId);
      });
    }
    return [...matchedStoreIds];
  };

  const applyShopBindEvent = async ({
    storeId,
    config,
    environment,
    appId,
    appShopIds,
    authorized,
    timestampMs,
  }) => {
    const eventKey = bindEventFingerprint({appId, environment, appShopIds, authorized, timestampMs});
    const eventRef = db.collection('lojas').doc(storeId).collection('food99WebhookEvents')
      .doc(environmentDocId('shop_bind', environment, eventKey));
    const authRef = authorizationRef(storeId, environment, config.appKey);
    const currentHealthRef = healthRef(storeId, environment);
    const auditRef = auditCollection(storeId).doc(environmentDocId('shop_bind', environment, eventKey));
    const eventTime = timestampMs > 0 ? new Date(timestampMs) : null;

    const result = await db.runTransaction(async (transaction) => {
      await assertReconciliationConfigUnchanged(transaction, storeId, config, environment, {
        checkAuthorization: false,
      });
      const [eventSnap, authSnap] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(authRef),
      ]);
      if (eventSnap.exists) return {duplicate: true, applied: false};

      const previousTimestampMs = authSnap.exists
        ? asNumber(authSnap.get('lastBindEventTimestampMs'))
        : 0;
      const outOfOrder = timestampMs > 0
        && previousTimestampMs > 0
        && previousTimestampMs > timestampMs;

      transaction.set(eventRef, {
        provider: PROVIDER,
        recordType: 'shop_bind_event',
        lojaId: storeId,
        environment,
        appKey: config.appKey,
        appShopIds: dedupeIds(appShopIds),
        authorized,
        eventTimestampMs: timestampMs || null,
        eventAt: eventTime || FieldValue.delete(),
        eventKey,
        status: outOfOrder ? 'ignored_out_of_order' : 'processed',
        processedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});

      if (outOfOrder) return {duplicate: false, applied: false, outOfOrder: true};

      transaction.set(authRef, {
        provider: PROVIDER,
        recordType: 'authorization',
        lojaId: storeId,
        environment,
        appKey: config.appKey,
        merchantId: config.merchantId,
        status: authorized ? 'authorized' : 'awaiting_authorization',
        suspendReason: authorized ? FieldValue.delete() : 'shop_unbound',
        ...(authorized ? {} : {
          tokenSecretVersion: FieldValue.delete(),
          tokenExpiresAt: FieldValue.delete(),
        }),
        authorizationSource: 'shop_bind_webhook',
        authorizationConfirmedAt: eventTime || FieldValue.serverTimestamp(),
        ...(timestampMs > 0 ? {
          lastBindEventAt: eventTime,
          lastBindEventTimestampMs: timestampMs,
        } : {}),
        lastBindReceivedAt: FieldValue.serverTimestamp(),
        lastBindEventKey: eventKey,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      transaction.set(currentHealthRef, {
        provider: PROVIDER,
        lojaId: storeId,
        environment,
        status: authorized ? 'authorized' : 'awaiting_authorization',
        authorizationStatus: authorized ? 'authorized' : 'awaiting_authorization',
        lastWebhookAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      transaction.set(auditRef, {
        provider: PROVIDER,
        environment,
        lojaId: storeId,
        action: authorized ? 'authorization.confirmed' : 'authorization.revoked',
        severity: authorized ? 'info' : 'warning',
        details: {
          environment,
          endpoint: 'shopBindStatus',
          appShopId: config.merchantId,
          eventKey,
        },
        createdAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {duplicate: false, applied: true};
    });

    if (!authorized && result.applied) {
      tokenCache.delete(tokenCacheKey({
        environment,
        lojaId: storeId,
        appKey: config.appKey,
        merchantId: config.merchantId,
      }));
    }
    return result;
  };

  return {
    food99GetConfiguration: onCall(async (request) => {
      const {lojaId, requester} = await requireCallableStore(request);
      const environment = requestEnvironment(request);
      const canManagePlatform = isPlatformAdmin(requester);
      const [config, platformConfig, health] = await Promise.all([
        loadConfig(lojaId, false, environment),
        readPlatformConfig(environment),
        readHealth(lojaId, environment),
      ]);
      const queueSnap = await catalogQueueRef(environment, config.appKey).get();
      const queue = queueSnap.exists ? secretSafePublicConfig(queueSnap.data() || {}) : {};
      return {
        config: publicConfig(config, canManagePlatform),
        platform: publicPlatformConfig(platformConfig, canManagePlatform),
        environment,
        effectiveApiBaseUrl: config.apiBaseUrl,
        effectiveAuthUrl: config.authUrl,
        platformEffectiveApiBaseUrl: config.apiBaseUrl,
        platformEffectiveAuthUrl: config.authUrl,
        authorizationStatus: config.authorizationStatus,
        queue,
        permissions: {
          canManagePlatform,
          canConfigureStore: true,
        },
        health,
      };
    }),

    food99GetPlatformConfiguration: onCall(async (request) => {
      setNoStoreHeaders(request);
      requireCallablePost(request);
      const {requester, uid} = await requirePlatformAdmin(request);
      const environment = requestEnvironment(request);
      const platformConfig = await readPlatformConfig(environment);
      let appId = '';
      try {
        appId = await food99SecretAccess(platformConfig.clientIdSecretVersion);
      } catch (error) {
        logger.error('[99Food] protected App ID read failed', {uid, environment, code: error.code});
        throw new HttpsError('internal', 'Nao foi possivel carregar o App ID protegido.');
      }
      return {
        platform: publicPlatformConfig(platformConfig, isPlatformAdmin(requester)),
        appId,
      };
    }),

    food99RevealPlatformAppSecret: onCall(async (request) => {
      setNoStoreHeaders(request);
      requireCallablePost(request);
      const {uid, actor, ip} = await requirePlatformAdmin(request);
      const environment = requestEnvironment(request);
      const platformConfig = await readPlatformConfig(environment);
      if (!platformConfig.clientSecretSecretVersion) {
        throw new HttpsError('failed-precondition', 'App Secret ainda nao cadastrado para este ambiente.');
      }
      let appSecret = '';
      try {
        appSecret = await food99SecretAccess(platformConfig.clientSecretSecretVersion);
      } catch (error) {
        logger.error('[99Food] protected App Secret read failed', {uid, environment, code: error.code});
        throw new HttpsError('internal', 'Nao foi possivel revelar o App Secret protegido.');
      }
      await auditPlatform('platform.app_secret.revealed', {
        uid,
        user: actor,
        ip,
        contextLojaId: truncate(request.data?.lojaId, 120),
        secretName: `food99_${environment}_platform_app_secret`,
        version: cleanText(platformConfig.clientSecretSecretVersion).split('/').pop(),
      }, 'info', environment);
      return {appSecret};
    }),

    food99AuditPlatformAppSecretCopy: onCall(async (request) => {
      requireCallablePost(request);
      const {uid, actor, ip} = await requirePlatformAdmin(request);
      const environment = requestEnvironment(request);
      const platformConfig = await readPlatformConfig(environment);
      await auditPlatform('platform.app_secret.copied', {
        uid,
        user: actor,
        ip,
        contextLojaId: truncate(request.data?.lojaId, 120),
        secretName: `food99_${environment}_platform_app_secret`,
        version: cleanText(platformConfig.clientSecretSecretVersion).split('/').pop(),
      }, 'info', environment);
      return {recorded: true};
    }),

    food99ReplacePlatformSecret: onCall({timeoutSeconds: 120}, async (request) => {
      setNoStoreHeaders(request);
      requireCallablePost(request);
      const {uid, actor, ip} = await requirePlatformAdmin(request);
      const environment = requestEnvironment(request);
      const incoming = request.data || {};
      if (incoming.confirmed !== true) {
        throw new HttpsError('failed-precondition', 'Confirme explicitamente a substituicao da credencial.');
      }
      const kind = cleanText(incoming.kind).toLowerCase();
      const definition = platformSecretDefinition(kind, environment);
      const rawValue = typeof incoming.value === 'string' ? incoming.value : '';
      const value = kind === 'app_id' ? rawValue.trim() : rawValue;
      if (!value.trim()) {
        throw new HttpsError('invalid-argument', 'Informe o novo valor antes de substituir.');
      }

      const existing = await readPlatformConfig(environment);
      let currentValue = '';
      try {
        currentValue = await food99SecretAccess(existing[definition.pointerField]);
      } catch (error) {
        logger.error('[99Food] protected credential comparison failed', {uid, environment, kind, code: error.code});
        throw new HttpsError('internal', 'Nao foi possivel validar a credencial protegida atual.');
      }
      if (currentValue && secretValuesEqual(currentValue, value)) {
        return {
          changed: false,
          secretName: definition.secretId,
          version: cleanText(existing[definition.pointerField]).split('/').pop(),
        };
      }

      const projectId = getProjectId();
      if (!projectId) throw new HttpsError('failed-precondition', 'Projeto Google Cloud nao identificado.');
      let secretVersion = '';
      try {
        const resourceName = await food99SecretEnsure(projectId, definition.secretId, {
          app: 'doceria',
          provider: PROVIDER,
          scope: 'platform',
          environment,
        });
        secretVersion = await food99SecretAddVersion(resourceName, value);
      } catch (error) {
        throwSecretManagerSaveError(error);
      }

      const version = cleanText(secretVersion).split('/').pop();
      const auditRef = platformAuditCollection().doc();
      try {
        await db.runTransaction(async (transaction) => {
          transaction.set(platformEnvironmentConfigRef(environment), {
            provider: PROVIDER,
            environment,
            ...definition.patch(value, secretVersion),
            updatedByUid: uid,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          transaction.set(auditRef, {
            provider: PROVIDER,
            environment,
            action: 'platform.secret.replaced',
            severity: 'info',
            uid,
            user: actor,
            ip,
            contextLojaId: truncate(incoming.lojaId, 120),
            secretName: definition.secretId,
            version,
            createdAt: FieldValue.serverTimestamp(),
          });
        });
      } catch (error) {
        logger.error('[99Food] credential pointer update failed', {uid, environment, kind, code: error.code});
        throw new HttpsError('internal', 'Nao foi possivel ativar a nova versao da credencial protegida.');
      }
      tokenCache.clear();
      return {changed: true, secretName: definition.secretId, version};
    }),

    food99SavePlatformConfiguration: onCall({timeoutSeconds: 120}, async (request) => {
      requireCallablePost(request);
      const {uid, actor, ip} = await requirePlatformAdmin(request);
      const incoming = request.data || {};
      const environment = requestEnvironment(request);
      const existing = await readPlatformConfig(environment);
      if (['clientId', 'clientSecret', 'webhookSecret', 'kind', 'value'].some((field) => (
        Object.prototype.hasOwnProperty.call(incoming, field)
      ))) {
        throw new HttpsError('invalid-argument', 'Use a acao Substituir para alterar credenciais protegidas.');
      }

      const configRefForEnvironment = platformEnvironmentConfigRef(environment);
      const auditRef = platformAuditCollection().doc();
      let outcome;
      try {
        outcome = await db.runTransaction(async (transaction) => {
          const scopedSnap = await transaction.get(configRefForEnvironment);
          const current = scopedSnap.exists ? {...existing, ...scopedSnap.data()} : existing;
          const settings = buildPlatformSettings(current, incoming, environment);
          if (!Object.keys(settings.changes).length) return {changed: false};
          transaction.set(configRefForEnvironment, {
            provider: PROVIDER,
            environment,
            ...settings.after,
            updatedByUid: uid,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          transaction.set(auditRef, {
            provider: PROVIDER,
            environment,
            action: 'platform.configuration.saved',
            severity: 'info',
            uid,
            user: actor,
            ip,
            contextLojaId: truncate(incoming.lojaId, 120),
            fields: Object.keys(settings.changes),
            changes: settings.changes,
            createdAt: FieldValue.serverTimestamp(),
          });
          return {changed: true};
        });
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        logger.error('[99Food] platform configuration transaction failed', {uid, environment, code: error.code});
        throw new HttpsError('internal', 'Nao foi possivel salvar a configuracao global do 99Food.');
      }
      if (outcome.changed) tokenCache.clear();
      const updated = outcome.changed ? await readPlatformConfig(environment) : existing;
      return {
        platform: publicPlatformConfig(updated, true),
        changed: outcome.changed,
      };
    }),

    food99SaveConfiguration: onCall({timeoutSeconds: 120}, async (request) => {
      const {uid, lojaId, requester} = await requireCallableStore(request);
      const incoming = request.data || {};
      const environment = requestEnvironment(request);
      if (hasGlobalConfigPayload(incoming)) {
        throw new HttpsError('permission-denied', 'Configuracoes globais do 99Food devem ser alteradas somente em Configuracoes > Integracoes > 99Food Developer.');
      }
      const [existingResult, platformExisting] = await Promise.all([
        readStoreConfig(lojaId, environment),
        readPlatformConfig(environment),
      ]);
      const existing = existingResult.data || {};
      const canManagePlatform = isPlatformAdmin(requester);

      const config = {
        provider: PROVIDER,
        environment,
        merchantId: cleanText(incoming.merchantId || existing.merchantId),
        merchantName: cleanText(incoming.merchantName || existing.merchantName),
        enabled: Boolean(incoming.enabled),
        status: existing.authorizationStatus || 'awaiting_authorization',
        authorizationStatus: existing.authorizationStatus || 'awaiting_authorization',
        pollingEnabled: incoming.pollingEnabled !== false,
        ordersSyncEnabled: incoming.ordersSyncEnabled !== false,
        stockSyncEnabled: incoming.stockSyncEnabled !== false,
        catalogSyncEnabled: incoming.catalogSyncEnabled !== false,
        autoConfirm: incoming.autoConfirm !== false,
        autoStartPreparation: Boolean(incoming.autoStartPreparation),
        updatedByUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
      };
      await configRef(lojaId, environment).set(config, {merge: true});
      const mergedForAppKey = mergePlatformCredentials({...existing, ...config}, platformExisting);
      const appKey = mergedForAppKey.clientIdFingerprint || mergedForAppKey.clientIdSuffix || 'app';
      const merchantChanged = Boolean(existing.merchantId && existing.merchantId !== config.merchantId);
      const currentAuthorizationSnap = await authorizationRef(lojaId, environment, appKey).get();
      const currentAuthorizationStatus = currentAuthorizationSnap.exists
        ? currentAuthorizationSnap.get('status')
        : existing.authorizationStatus;
      await authorizationRef(lojaId, environment, appKey).set({
        provider: PROVIDER,
        recordType: 'authorization',
        lojaId,
        environment,
        appKey,
        merchantId: config.merchantId,
        status: merchantChanged ? 'awaiting_authorization' : (currentAuthorizationStatus || 'awaiting_authorization'),
        ...(merchantChanged ? {
          tokenSecretVersion: FieldValue.delete(),
          tokenExpiresAt: FieldValue.delete(),
          suspendReason: 'merchant_changed',
        } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
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
      }, 'info', environment);
      const saved = await loadConfig(lojaId, false, environment);
      return {config: publicConfig(saved, canManagePlatform)};
    }),

    food99PromoteStoredCredentials: onCall(async (request) => {
      const {uid, lojaId, requester} = await requireCallableStore(request);
      const environment = requestEnvironment(request);
      if (!isPlatformAdmin(requester)) {
        throw new HttpsError('permission-denied', 'Somente Dono ou Administrador Master pode ativar a credencial central do 99Food.');
      }
      if (environment !== FOOD99_ENVIRONMENTS.PRODUCTION) {
        throw new HttpsError('failed-precondition', 'Credenciais legadas de Produção não podem ser promovidas para Desenvolvimento.');
      }
      const storeResult = await readStoreConfig(lojaId, environment);
      const storeConfig = storeResult.data || {};
      if (!storeConfig.clientIdSecretVersion || !storeConfig.clientSecretSecretVersion) {
        throw new HttpsError('failed-precondition', 'Esta loja nao possui credenciais salvas para reutilizar.');
      }
      await platformEnvironmentConfigRef(environment).set({
        provider: PROVIDER,
        environment,
        apiBaseUrl: CURRENT_FOOD99_HOST,
        authUrl: CURRENT_FOOD99_HOST,
        clientIdSecretVersion: storeConfig.clientIdSecretVersion,
        clientSecretSecretVersion: storeConfig.clientSecretSecretVersion,
        migratedFromStoreId: lojaId,
        clientIdMasked: '********',
        clientSecretMasked: '********',
        updatedByUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tokenCache.clear();
      await auditPlatform('platform.credentials.promoted', {
        uid,
        ip: getRequestIp(request),
        changes: {
          migratedFromStoreId: {before: null, after: lojaId},
          clientIdReady: {before: false, after: true},
          clientSecretReady: {before: false, after: true},
        },
      }, 'info', environment);
      await audit(lojaId, 'configuration.credentials_promoted', {uid}, 'info', environment);
      return {config: publicConfig(await loadConfig(lojaId, false, environment), true)};
    }),

    food99StartAuthorization: onCall(async (request) => {
      const {uid, lojaId} = await requireCallableStore(request);
      const environment = requestEnvironment(request);
      const config = await loadConfig(lojaId, false, environment);
      if (!config.credentialsReady) {
        throw new HttpsError('failed-precondition', 'Cadastre App ID e App Secret deste ambiente antes de autorizar.');
      }
      if (!config.merchantId) {
        throw new HttpsError('failed-precondition', 'Informe e salve o app_shop_id da loja antes de autorizar.');
      }
      const {clientId} = await credentialsForConfig(config);
      // O contrato deste endpoint declara somente app_id; timestamp/sign não
      // pertencem ao request. A própria 99Food devolve a URL temporária assinada.
      const response = await fetchWithTimeout(buildUrl(config.authUrl, AUTHORIZATION_PAGE_PATH), {
        method: 'POST',
        headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
        body: JSON.stringify({app_id: clientId}),
      });
      const payload = await parseApiResponse(response, AUTHORIZATION_PAGE_PATH);
      const rawAuthorizationUrl = typeof payload.data === 'string'
        ? payload.data
        : (payload.data?.url || payload.data?.authorization_url || payload.url || '');
      const authorizationUrl = validateAuthorizationUrl(rawAuthorizationUrl);
      if (!authorizationUrl) {
        throw new HttpsError('failed-precondition', 'A 99Food não retornou uma URL oficial de autorização válida.');
      }
      const authorizationRequestId = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
      await authorizationRef(lojaId, environment, config.appKey).set({
        provider: PROVIDER,
        recordType: 'authorization',
        lojaId,
        environment,
        appKey: config.appKey,
        merchantId: config.merchantId,
        status: 'awaiting_authorization',
        authorizationRequestId,
        requestedByUid: uid,
        requestExpiresAt: expiresAt,
        requestedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      await setHealth(lojaId, environment, {
        status: 'awaiting_authorization',
        authorizationStatus: 'awaiting_authorization',
      });
      await audit(lojaId, 'authorization.started', {
        uid,
        authorizationRequestId,
        expiresAt: expiresAt.toISOString(),
        endpoint: AUTHORIZATION_PAGE_PATH,
        host: config.authUrl,
      }, 'info', environment);
      return {
        authorizationUrl,
        authorizationStatus: 'awaiting_authorization',
        expiresAt: expiresAt.toISOString(),
        message: 'Conclua a autorização no portal oficial e depois verifique o vínculo.',
      };
    }),

    food99CheckAuthorization: onCall(async (request) => {
      const {uid, lojaId} = await requireCallableStore(request);
      const environment = requestEnvironment(request);
      const config = await loadConfig(lojaId, false, environment);
      if (!config.credentialsReady || !config.merchantId) {
        return {
          authorized: false,
          authorizationStatus: 'configuration_incomplete',
          message: 'Cadastre as credenciais e o app_shop_id deste ambiente.',
        };
      }
      return reconcileStoreAuthorization(lojaId, config, environment, uid);
    }),

    food99TestConnection: onCall(async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const environment = requestEnvironment(request);
      const config = await loadConfig(lojaId, false, environment);
      if (!config.credentialsReady) {
        await setHealth(lojaId, environment, {status: 'configuration_incomplete'});
        return {
          ok: false,
          authorizationStatus: 'configuration_incomplete',
          message: 'App ID/App Secret ainda não foram cadastrados neste ambiente.',
        };
      }
      await credentialsForConfig(config);
      if (!config.merchantId) {
        await setHealth(lojaId, environment, {status: 'configuration_incomplete'});
        return {
          ok: false,
          credentialsStored: true,
          authorizationStatus: 'configuration_incomplete',
          message: 'Credenciais protegidas. Informe e salve o app_shop_id para continuar.',
        };
      }
      if (config.authorizationStatus !== 'authorized') {
        await setHealth(lojaId, environment, {
          status: 'awaiting_authorization',
          authorizationStatus: 'awaiting_authorization',
        });
        return {
          ok: false,
          credentialsStored: true,
          authorizationStatus: 'awaiting_authorization',
          message: 'Credenciais protegidas e host validados. A validação completa depende da autorização da loja.',
        };
      }
      const latencyMs = await validateStoreConnection(lojaId, config, environment);
      return {
        ok: true,
        authorized: true,
        authorizationStatus: 'authorized',
        latencyMs,
        message: 'Credenciais, token e loja validados no ambiente selecionado.',
      };
    }),

    food99LoadMerchants: onCall(async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const environment = requestEnvironment(request);
      const config = await loadConfig(lojaId, false, environment);
      if (!config.clientIdSecretVersion || !config.clientSecretSecretVersion) {
        throw new HttpsError('failed-precondition', 'Cadastre a credencial central do 99Food antes de carregar a loja.');
      }
      if (!config.merchantId) {
        throw new HttpsError('failed-precondition', 'Informe o app_shop_id desta loja antes de carregar os dados da 99Food.');
      }
      const payload = await request99Food(lojaId, config, SHOP_DETAIL_PATH, {allowDisabled: true});
      const shop = payload.data || payload;
      const merchants = [{
        id: cleanText(shop.app_shop_id || config.merchantId),
        name: cleanText(shop.name || shop.shop_name || config.merchantName),
        corporateName: cleanText(shop.poi_name || shop.name || shop.shop_name),
        document: onlyDigits(shop.cnpj || shop.document || ''),
      }].filter((merchant) => merchant.id);
      await audit(lojaId, 'shop.loaded', {shopId: config.merchantId}, 'info', environment);
      return {merchants};
    }),

    food99PollNow: onCall({timeoutSeconds: 120}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const environment = requestEnvironment(request);
      const orderId = cleanText(request.data?.orderId);
      if (orderId) {
        const config = await loadConfig(lojaId, true, environment);
        const event = {
          id: safeId(`manual_${orderId}_${Date.now()}`),
          orderId,
          event_type: 'manual_lookup',
          createdAt: timestampNow(),
        };
        const result = await processEvents(lojaId, config, [event], 'manual_order_lookup');
        return result;
      }
      return runPoll(lojaId, 'manual', environment);
    }),

    food99OrderAction: onCall({timeoutSeconds: 120}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const environment = requestEnvironment(request);
      const orderId = cleanText(request.data?.orderId);
      const action = cleanText(request.data?.action);
      if (!orderId) throw new HttpsError('invalid-argument', 'orderId obrigatorio.');
      const config = await loadConfig(lojaId, true, environment);
      return issueOrderCommand(lojaId, config, orderId, action, request.data || {});
    }),

    food99GetCancellationReasons: onCall({timeoutSeconds: 120}, async (request) => {
      await requireCallableStore(request);
      requestEnvironment(request);
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
      const environment = requestEnvironment(request);
      const config = await loadConfig(lojaId, true, environment);
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
      }, stale ? 'warning' : 'info', environment);
      return {products, fromCache, stale, cacheAgeSeconds, warning};
    }),

    food99ImportCatalogProduct: onCall({timeoutSeconds: 120}, async (request) => {
      const {uid, lojaId} = await requireCallableStore(request);
      const environment = requestEnvironment(request);
      const itemId = cleanText(request.data?.itemId);
      const productId = cleanText(request.data?.productId);
      if (!itemId && !productId) {
        throw new HttpsError('invalid-argument', 'Informe o item ou produto do catalogo 99Food.');
      }
      const config = await loadConfig(lojaId, true, environment);
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
        }, 'warning', environment);
      }
      if (!catalogProduct && allowClientFallback && clientCatalogProduct) {
        catalogProduct = clientCatalogProduct;
      }
      if (!catalogProduct) throw new HttpsError('not-found', 'Produto nao encontrado no catalogo 99Food atual.');
      return importCatalogProductFrom99Food(lojaId, uid, config, catalogProduct);
    }),

    food99ImportCatalogProducts: onCall({timeoutSeconds: 300, memory: '512MiB'}, async (request) => {
      const {uid, lojaId} = await requireCallableStore(request);
      const environment = requestEnvironment(request);
      const requestedItems = Array.isArray(request.data?.items) ? request.data.items : [];
      const requestedKeys = new Set(requestedItems.map((item) => catalogProductSelectionKey(item)).filter(Boolean));
      if (!requestedKeys.size) {
        throw new HttpsError('invalid-argument', 'Selecione pelo menos um item do catalogo 99Food para importar.');
      }

      const config = await loadConfig(lojaId, true, environment);
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
        }, 'warning', environment);
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
          }, 'warning', environment);
          continue;
        }

        try {
          results.push(await importCatalogProductFrom99Food(lojaId, uid, config, catalogProduct));
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
          }, 'warning', environment);
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
      }, failed ? 'warning' : 'info', environment);
      return {requested: requestedItems.length, imported, ignored, failed, results};
    }),

    food99LinkCatalogProducts: onCall({timeoutSeconds: 300, memory: '512MiB'}, async (request) => {
      const {uid, lojaId} = await requireCallableStore(request);
      const environment = requestEnvironment(request);
      const requestedItems = Array.isArray(request.data?.items) ? request.data.items : [];
      const requestedKeys = new Set(requestedItems.map((item) => catalogProductSelectionKey(item)).filter(Boolean));
      if (!requestedKeys.size) {
        throw new HttpsError('invalid-argument', 'Selecione pelo menos um item do catalogo 99Food para vincular.');
      }

      const config = await loadConfig(lojaId, true, environment);
      let catalogProducts = [];
      let allowClientFallback = false;
      try {
        const catalogData = await loadCatalogProductsFrom99Food(lojaId, config);
        catalogProducts = catalogData.products;
      } catch (error) {
        if (!isCatalogRateLimitError(error)) throw error;
        allowClientFallback = true;
        catalogProducts = requestedItems.map(catalogProductFromClient).filter(Boolean);
        await audit(lojaId, 'catalog.products_link_used_client_snapshot', {
          uid,
          requested: requestedItems.length,
          availableSnapshots: catalogProducts.length,
          error: error.message,
        }, 'warning', environment);
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
          await audit(lojaId, 'catalog.product_link_failed', {
            uid,
            requested,
            error: failedResult.error,
          }, 'warning', environment);
          continue;
        }

        try {
          results.push(await linkCatalogProductToExistingInternalProduct(lojaId, uid, config, catalogProduct));
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
          await audit(lojaId, 'catalog.product_link_failed', {
            uid,
            food99ProductId: catalogProduct.productId,
            catalogItemId: catalogProduct.itemId,
            error: error.message,
          }, 'warning', environment);
        }
      }

      const linked = results.filter((result) => result.status === 'linked').length;
      const failed = results.filter((result) => result.status === 'failed').length;
      await audit(lojaId, 'catalog.products_linked_batch', {
        uid,
        requested: requestedItems.length,
        linked,
        failed,
      }, failed ? 'warning' : 'info', environment);
      return {requested: requestedItems.length, linked, failed, results};
    }),

    food99PublishProducts: onCall({timeoutSeconds: 300, memory: '512MiB'}, async (request) => {
      const {uid, lojaId} = await requireCallableStore(request);
      const environment = requestEnvironment(request);
      const config = await loadConfig(lojaId, true, environment);
      if (!config.merchantId) throw new HttpsError('failed-precondition', 'Selecione a loja 99Food antes de publicar produtos.');
      const requestedIds = dedupeIds(request.data?.productIds || []);
      const result = await enqueueCatalogPublish(lojaId, config, requestedIds, 'manual_publish', uid);
      await audit(lojaId, 'catalog.queued', {
        requested: requestedIds.length,
        endpoint: CATALOG_UPLOAD_PATH,
        queueStatus: result.status,
        nextAllowedAt: result.nextAllowedAt || '',
      }, 'info', environment);
      return {
        ...result,
        queued: result.status === 'queued' || result.status === 'scheduled',
        queuedCount: requestedIds.length,
        requested: requestedIds.length,
        queue: {
          status: result.status,
          nextAllowedAt: result.nextAllowedAt || null,
        },
      };
    }),

    food99SaveProductMapping: onCall({timeoutSeconds: 120}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const environment = requestEnvironment(request);
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
      const conflictRefs = await findConflictingCatalogMappingRefs(lojaId, catalogProduct, productId, environment);
      const productRef = db.collection('lojas').doc(lojaId).collection('produtos').doc(productId);
      const mappingRef = scopedMappingRef(lojaId, productId, environment);
      await db.runTransaction(async (transaction) => {
        transaction.set(productRef, food99ProductLinkPatch(catalogProduct), {merge: true});
        transaction.set(mappingRef, {
          provider: PROVIDER,
          environment,
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
        await syncProductAvailability(lojaId, productId, 'mapping_saved', environment);
      } catch (error) {
        logger.warn('[99Food] initial mapping sync deferred', sanitizeLogContext({
          lojaId,
          productId,
          environment,
          errno: error.food99Errno,
          requestId: error.food99RequestId,
        }));
      }
      return {ok: true};
    }),

    food99SyncStockNow: onCall({timeoutSeconds: 120}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const environment = requestEnvironment(request);
      const productId = cleanText(request.data?.productId);
      if (productId) return syncProductAvailability(lojaId, productId, 'manual', environment);
      const mappings = await mappingCollection(lojaId)
        .where('stockSyncEnabled', '==', true).get();
      const results = [];
      for (const mapping of dedupeMappingDocs(mappings.docs, environment)) {
        results.push(await syncProductAvailability(lojaId, mapping.get('productId') || mapping.id, 'manual', environment));
      }
      return {synced: results.length, results};
    }),

    food99ScheduledPoll: onSchedule({
      schedule: 'every 1 minutes',
      timeoutSeconds: 120,
      memory: '512MiB',
    }, async () => {
      const enabled = await db.collectionGroup('food99').where('pollingEnabled', '==', true).get();
      for (const configDoc of enabled.docs.filter((doc) => /^config(_development|_production)?$/.test(doc.id) && doc.get('enabled') === true)) {
        const lojaId = extractStoreId(configDoc);
        if (!lojaId) continue;
        const environment = configDoc.id === 'config_development'
          ? FOOD99_ENVIRONMENTS.DEVELOPMENT
          : FOOD99_ENVIRONMENTS.PRODUCTION;
        try {
          await runPoll(lojaId, 'scheduler', environment);
        } catch (error) {
          logger.error('[99Food] scheduled poll failed', sanitizeLogContext({
            lojaId,
            environment,
            errno: error.food99Errno,
            requestId: error.food99RequestId,
          }));
        }
      }
      const queues = await platformConfigRef().collection('catalogQueues').get();
      for (const queueDoc of queues.docs) {
        const queue = queueDoc.data() || {};
        if (!strictEnvironment(queue.environment) || !queue.appKey) continue;
        try {
          await processCatalogQueue(queue.environment, queue.appKey);
        } catch (error) {
          logger.error('[99Food] catalog queue dispatch failed', sanitizeLogContext({
            environment: queue.environment,
            endpoint: CATALOG_UPLOAD_PATH,
            errno: error.food99Errno,
            requestId: error.food99RequestId,
          }));
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
      for (const environment of [FOOD99_ENVIRONMENTS.DEVELOPMENT, FOOD99_ENVIRONMENTS.PRODUCTION]) {
        try {
          const config = await loadConfig(lojaId, false, environment);
          if (!canRunAuthorizedOperation(config)) continue;
          const mappingRecord = await readProductMapping(lojaId, productId, environment);
          const mappingSnap = mappingRecord.snapshot;
          if (!mappingSnap.exists) continue;
          if (catalogChanged && mappingSnap.get('catalogManaged')) {
            await enqueueCatalogPublish(lojaId, config, [productId], 'internal_product_change');
          }
          if (stockChanged) {
            await syncProductAvailability(lojaId, productId, 'internal_stock_change', environment);
          }
        } catch (error) {
          logger.warn('[99Food] async product sync deferred', sanitizeLogContext({
            lojaId,
            productId,
            environment,
            errno: error.food99Errno,
            requestId: error.food99RequestId,
          }));
        }
      }
    }),

    food99Webhook: onRequest({timeoutSeconds: 120, memory: '512MiB'}, async (request, response) => {
      if (request.method !== 'POST') {
        response.status(405).json({errno: 1, errmsg: 'method not allowed'});
        return;
      }
      const environment = strictEnvironment(request.query.environment);
      let lojaId = cleanText(request.query.lojaId);
      try {
        if (!environment) {
          response.status(400).json({errno: 1, errmsg: 'environment required'});
          return;
        }
        const platformConfig = normalizePlatformConfig(await readPlatformConfig(environment));
        if (!platformConfig.webhookEnabled
          || !platformConfig.clientIdSecretVersion
          || !platformConfig.clientSecretSecretVersion) {
          response.status(409).json({errno: 1, errmsg: 'webhook disabled'});
          return;
        }
        if (!Buffer.isBuffer(request.rawBody)) {
          response.status(400).json({errno: 1, errmsg: 'raw body unavailable'});
          return;
        }
        const [configuredAppId, appSecret] = await Promise.all([
          food99SecretAccess(platformConfig.clientIdSecretVersion),
          food99SecretAccess(platformConfig.clientSecretSecretVersion),
        ]);
        const sentSignature = cleanText(request.get('didi-header-sign'));
        const expectedSignature = signFood99Webhook(request.rawBody, appSecret);
        if (!sentSignature || !constantTimeEqual(sentSignature, expectedSignature)) {
          response.status(401).json({errno: 1, errmsg: 'invalid signature'});
          return;
        }

        let webhookPayload;
        try {
          webhookPayload = parseFood99JsonPreservingLargeIntegers(request.rawBody);
        } catch (error) {
          response.status(400).json({errno: 1, errmsg: 'invalid json'});
          return;
        }
        const payloadEvents = Array.isArray(webhookPayload?.events)
          ? webhookPayload.events
          : [webhookPayload || {}];
        const payloadAppId = extractFood99AppIdFromRawBody(request.rawBody);
        if (!payloadAppId || !secretValuesEqual(payloadAppId, configuredAppId)) {
          response.status(403).json({errno: 1, errmsg: 'application mismatch'});
          return;
        }

        const bindEvents = payloadEvents.filter(isShopBindStatusEvent);
        if (bindEvents.length) {
          let handledStores = 0;
          let recognizedEvents = 0;
          for (const bindEvent of bindEvents) {
            const authorized = bindStatusDecision(bindEvent);
            if (authorized === null) continue;
            recognizedEvents += 1;
            const eventAppShopIds = dedupeIds(extractAppShopIds(bindEvent));
            if (!eventAppShopIds.length) continue;
            const timestampMs = bindEventTimestampMs(bindEvent)
              || bindEventTimestampMs(webhookPayload);
            if (!timestampMs) {
              logger.warn('[99Food] shopBindStatus ignored without provider timestamp', {environment});
              continue;
            }
            const eventStoreIds = await mappedStoreIdsForAppShopIds(eventAppShopIds, environment, lojaId);
            for (const storeId of eventStoreIds) {
              const config = await loadConfig(storeId, false, environment);
              if (!config.merchantId || !eventAppShopIds.includes(config.merchantId)) continue;
              handledStores += 1;
              await applyShopBindEvent({
                storeId,
                config,
                environment,
                appId: payloadAppId,
                appShopIds: eventAppShopIds,
                authorized,
                timestampMs,
              });
            }
          }
          response.status(handledStores || !recognizedEvents ? 200 : 202).json({errno: 0});
          return;
        }

        const appShopIds = dedupeIds(payloadEvents.flatMap(extractAppShopIds));
        const storeIds = await mappedStoreIdsForAppShopIds(appShopIds, environment, lojaId);

        if (!storeIds.length) {
          response.status(400).json({errno: 1, errmsg: 'store not mapped'});
          return;
        }
        lojaId = storeIds[0];
        const config = await loadConfig(lojaId, true, environment);
        if (appShopIds.length && config.merchantId && !appShopIds.includes(config.merchantId)) {
          response.status(403).json({errno: 1, errmsg: 'store mismatch'});
          return;
        }
        if (!canRunAuthorizedOperation(config)) {
          response.status(202).json({errno: 0});
          return;
        }
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
          await audit(lojaId, 'webhook.ignored', {reason: 'order_id_not_found'}, 'warning', environment);
          response.status(200).json({errno: 0});
          return;
        }
        const result = await processEvents(lojaId, config, events, 'webhook');
        const interval = todayIntervalInTimezone();
        const dashboard = await buildDailyDashboardSummary(lojaId, environment, interval);
        await setHealth(lojaId, environment, {
          status: 'authorized',
          authorizationStatus: 'authorized',
          consecutiveFailures: 0,
          lastWebhookAt: FieldValue.serverTimestamp(),
          lastDashboardSummary: dashboard.summary,
          lastDashboardInterval: dashboard.interval,
          lastDashboardOrdersRead: dashboard.ordersRead,
        });
        logger.info('[99Food] webhook processed', {
          lojaId,
          environment,
          eventsReceived: events.length,
          ordersUpdated: result.acknowledged,
          completedToday: dashboard.summary.finalizados,
          interval: dashboard.interval,
        });
        response.status(200).json({errno: 0});
      } catch (error) {
        logger.error('[99Food] webhook failed', sanitizeLogContext({
          lojaId,
          environment,
          endpoint: 'webhook',
          errno: error.food99Errno,
          requestId: error.food99RequestId,
        }));
        response.status(500).json({errno: 1, errmsg: 'processing failed'});
      }
    }),
  };
};

module.exports = {createFood99Functions};





