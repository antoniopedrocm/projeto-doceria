const crypto = require('crypto');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');

const secretManager = new SecretManagerServiceClient();
const tokenCache = new Map();

const PROVIDER = 'ifood';
const DEFAULT_API_URL = 'https://merchant-api.ifood.com.br';
const DEFAULT_AUTH_URL = 'https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token';
const ORDER_BASE_PATH = '/order/v1.0/orders';
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
const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const money = (value) => Math.round((asNumber(value) + Number.EPSILON) * 100) / 100;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timestampNow = () => new Date().toISOString();

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
      labels,
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
  const status = cleanText(event.fullCode || event.code || detail.status || '').toUpperCase();
  return status === 'ORDER_PATCHED' ? status : status.replace(/^ORDER_/, '');
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
  item.id,
  item.externalCode,
  item.productId,
  item.product?.id,
  item.product?.externalCode,
  item.catalogContext?.catalogItemId,
  item.catalogContext?.externalCode,
].map(cleanText).filter(Boolean);

const itemPrice = (item = {}) => money(
  item.unitPrice?.value
  ?? item.unitPrice
  ?? item.price?.value
  ?? item.price
  ?? (asNumber(item.totalPrice?.value ?? item.totalPrice) / Math.max(1, asNumber(item.quantity, 1)))
);

const normalizeOrderDetail = (event, detail, mappingIndex) => {
  const sourceItems = Array.isArray(detail.items)
    ? detail.items
    : Array.isArray(event.metadata?.items) ? event.metadata.items : [];
  const eventStatus = normalizeExternalStatus(event, {});
  const detailStatus = normalizeExternalStatus({}, detail);
  const status = LIFECYCLE_EXTERNAL_STATUSES.has(eventStatus)
    ? eventStatus
    : (detailStatus || eventStatus);
  const items = sourceItems.map((item, index) => {
    const externalIds = itemExternalIds(item);
    const mapping = externalIds.map((id) => mappingIndex.get(id)).find(Boolean) || null;
    const quantity = Math.max(1, asNumber(item.quantity, 1));
    const price = itemPrice(item);
    return {
      index,
      externalIds,
      iFoodItemId: externalIds[0] || `item_${index + 1}`,
      productId: mapping?.productId || null,
      mappingId: mapping?.id || null,
      nome: item.name || item.product?.name || `Item iFood ${index + 1}`,
      quantity,
      quantidade: quantity,
      preco: price,
      total: money(price * quantity),
      notes: item.observations || item.options?.map((option) => option.name).join(', ') || '',
    };
  });
  const total = money(
    detail.total?.orderAmount
    ?? detail.total?.value
    ?? detail.total
    ?? items.reduce((sum, item) => sum + item.total, 0)
  );

  return {
    iFoodOrderId: cleanText(event.orderId || detail.id || event.metadata?.id),
    displayId: detail.displayId || event.metadata?.displayId || '',
    externalStatus: status,
    externalEventType: eventStatus,
    status: appStatusForExternalStatus(status),
    category: detail.category || event.metadata?.category || 'FOOD',
    orderType: detail.orderType || event.metadata?.orderType || '',
    orderTiming: detail.orderTiming || detail.schedule?.type || 'IMMEDIATE',
    customerName: detail.customer?.name || 'Cliente iFood',
    customerDocument: onlyDigits(detail.customer?.documentNumber || detail.customer?.document || ''),
    deliveryAddress: detail.delivery?.deliveryAddress?.formattedAddress
      || detail.delivery?.deliveryAddress?.streetName
      || detail.deliveryAddress?.formattedAddress
      || '',
    paymentMethod: detail.payments?.methods?.[0]?.method || 'iFood',
    total,
    items,
    detail,
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

const retryAfterMillis = (response, attempt) => {
  const retryAfter = response?.headers?.get('retry-after');
  if (retryAfter && Number.isFinite(Number(retryAfter))) return Number(retryAfter) * 1000;
  return Math.min(8000, 500 * (2 ** attempt));
};

const createIfoodFunctions = ({
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
      throw new HttpsError('permission-denied', 'Sem acesso a integracao iFood desta loja.');
    }
    return requester;
  };

  const requireCallableStore = async (request) => {
    const lojaId = cleanText(request.data?.lojaId);
    const uid = request.auth?.uid;
    await requireStoreAccess(uid, lojaId);
    return {uid, lojaId};
  };

  const configRef = (lojaId) => db.collection('lojas').doc(lojaId).collection('ifood').doc('config');
  const healthRef = (lojaId) => db.collection('lojas').doc(lojaId).collection('ifoodHealth').doc('status');
  const auditCollection = (lojaId) => db.collection('lojas').doc(lojaId).collection('ifoodAudit');
  const alertCollection = (lojaId) => db.collection('lojas').doc(lojaId).collection('ifoodAlerts');

  const audit = async (lojaId, action, details = {}, severity = 'info') => {
    await auditCollection(lojaId).add({
      provider: PROVIDER,
      action,
      severity,
      details,
      createdAt: FieldValue.serverTimestamp(),
    });
  };

  const createAlert = async (lojaId, type, message, context = {}) => {
    const key = safeId(`${type}_${context.orderId || context.productId || Date.now()}`);
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

  const loadConfig = async (lojaId) => {
    const snap = await configRef(lojaId).get();
    if (!snap.exists) {
      throw new HttpsError('failed-precondition', 'Configure a integracao iFood desta loja primeiro.');
    }
    return {id: snap.id, ...snap.data()};
  };

  const publicConfig = (config = {}) => ({
    provider: PROVIDER,
    enabled: Boolean(config.enabled),
    pollingEnabled: Boolean(config.pollingEnabled),
    webhookEnabled: Boolean(config.webhookEnabled),
    credentialsReady: Boolean(config.clientIdSecretVersion && config.clientSecretSecretVersion),
    webhookSecretReady: Boolean(config.webhookSecretVersion),
    merchantId: config.merchantId || '',
    apiBaseUrl: config.apiBaseUrl || DEFAULT_API_URL,
    authUrl: config.authUrl || DEFAULT_AUTH_URL,
    autoConfirm: Boolean(config.autoConfirm),
    autoStartPreparation: Boolean(config.autoStartPreparation),
    inventoryEndpointTemplate: config.inventoryEndpointTemplate || config.availabilityEndpointTemplate || '',
    inventoryMethod: config.inventoryMethod || config.availabilityMethod || 'POST',
    updatedAt: config.updatedAt || null,
  });

  const tokenForStore = async (lojaId, config) => {
    const cached = tokenCache.get(lojaId);
    if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;

    const [clientId, clientSecret] = await Promise.all([
      accessSecret(config.clientIdSecretVersion),
      accessSecret(config.clientSecretSecretVersion),
    ]);
    if (!clientId || !clientSecret) {
      throw new HttpsError('failed-precondition', 'Credenciais iFood nao cadastradas.');
    }

    const response = await fetch(config.authUrl || DEFAULT_AUTH_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        grantType: 'client_credentials',
        clientId,
        clientSecret,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Falha na autenticacao iFood (${response.status}): ${payload.error || payload.message || 'sem detalhe'}`);
    }
    const token = payload.accessToken || payload.access_token;
    if (!token) throw new Error('Autenticacao iFood nao retornou accessToken.');
    const expiresIn = Math.max(60, asNumber(payload.expiresIn ?? payload.expires_in, 3600));
    tokenCache.set(lojaId, {token, expiresAt: Date.now() + (expiresIn * 1000)});
    return token;
  };

  const requestIfood = async (lojaId, config, path, {method = 'GET', body, attempts = 4} = {}) => {
    const url = path.startsWith('http')
      ? path
      : new URL(path, `${config.apiBaseUrl || DEFAULT_API_URL}/`).toString();
    let lastError;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const token = await tokenForStore(lojaId, config);
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (response.status === 401 && attempt === 0) {
          tokenCache.delete(lojaId);
          continue;
        }
        const payload = await response.json().catch(() => ({}));
        if (response.ok) return payload;
        const error = new Error(`iFood ${method} ${path} falhou (${response.status}): ${payload.message || payload.error || 'sem detalhe'}`);
        error.httpStatus = response.status;
        if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts - 1) throw error;
        await delay(retryAfterMillis(response, attempt));
      } catch (error) {
        lastError = error;
        if (!RETRYABLE_STATUS.has(error.httpStatus) || attempt === attempts - 1) throw error;
      }
    }
    throw lastError || new Error('Falha inesperada na API iFood.');
  };

  const loadMappings = async (lojaId) => {
    const snap = await db.collection('lojas').doc(lojaId).collection('ifoodProductMappings').get();
    const index = new Map();
    snap.docs.forEach((mappingDoc) => {
      const mapping = {id: mappingDoc.id, productId: mappingDoc.id, ...mappingDoc.data()};
      [mapping.iFoodProductId, mapping.externalCode, mapping.catalogItemId]
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
        return await requestIfood(lojaId, config, `${ORDER_BASE_PATH}/${encodeURIComponent(orderId)}`);
      } catch (error) {
        lastError = error;
        if (error.httpStatus !== 404 || attempt === 4) throw error;
        await delay(Math.min(15000, 1000 * (2 ** attempt)));
      }
    }
    throw lastError;
  };

  const persistOrderEvent = async (lojaId, event, normalizedOrder) => {
    const eventId = cleanText(event.id || `${normalizedOrder.iFoodOrderId}_${normalizedOrder.externalStatus}_${event.createdAt || ''}`);
    const eventRef = db.collection('lojas').doc(lojaId).collection('ifoodEvents').doc(eventId);
    const externalOrderRef = db.collection('lojas').doc(lojaId).collection('ifoodOrders').doc(normalizedOrder.iFoodOrderId);
    const orderRef = db.collection('lojas').doc(lojaId).collection('pedidos').doc(`ifood_${normalizedOrder.iFoodOrderId}`);
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
          safeId(`ifood_${eventId}_${change.productId}`)
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
          motivo: normalizedOrder.externalStatus === 'CANCELLED' ? 'Estorno de cancelamento iFood' : 'Venda iFood',
          origem: 'iFood',
          lojaId,
          iFoodOrderId: normalizedOrder.iFoodOrderId,
          iFoodEventId: eventId,
          createdAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      });

      const internalOrder = {
        clienteNome: normalizedOrder.customerName,
        clienteDocumento: normalizedOrder.customerDocument,
        clienteEndereco: normalizedOrder.deliveryAddress,
        itens: normalizedOrder.items.map((item) => ({
          produtoId: item.productId,
          iFoodItemId: item.iFoodItemId,
          nome: item.nome,
          quantity: item.quantity,
          preco: item.preco,
          observacao: item.notes,
        })),
        total: normalizedOrder.total,
        formaPagamento: normalizedOrder.paymentMethod,
        origem: 'iFood',
        canalVenda: 'IFOOD',
        status: unmapped.length ? 'Atencao iFood' : normalizedOrder.status,
        lojaId,
        iFoodOrderId: normalizedOrder.iFoodOrderId,
        iFoodDisplayId: normalizedOrder.displayId,
        iFoodStatus: normalizedOrder.externalStatus,
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
        unmappedItems: unmapped.map((item) => ({iFoodItemId: item.iFoodItemId, nome: item.nome})),
        lastEventId: eventId,
        lastEventAt: event.createdAt || timestampNow(),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: existing.createdAt || FieldValue.serverTimestamp(),
      }, {merge: true});
      transaction.set(eventRef, {
        eventId,
        orderId: normalizedOrder.iFoodOrderId,
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
      await createAlert(lojaId, 'insufficient_stock', transactionResult.message, {orderId: normalizedOrder.iFoodOrderId});
      throw new Error(transactionResult.message);
    }
    if (unmapped.length) {
      await createAlert(lojaId, 'unmapped_product', 'Pedido iFood recebido com item sem mapeamento interno.', {
        orderId: normalizedOrder.iFoodOrderId,
        items: unmapped.map((item) => ({id: item.iFoodItemId, nome: item.nome})),
      });
    }
    return transactionResult;
  };

  const issueOrderCommand = async (lojaId, config, orderId, action, data = {}) => {
    const operations = {
      confirm: {path: 'confirm', body: undefined},
      startPreparation: {path: 'startPreparation', body: undefined},
      dispatch: {path: 'dispatch', body: data.deliveredBy ? {deliveredBy: data.deliveredBy} : {deliveredBy: 'MERCHANT'}},
      readyToPickup: {path: 'readyToPickup', body: undefined},
      requestCancellation: {path: 'requestCancellation', body: {reason: cleanText(data.reason)}},
      validatePickupCode: {path: 'validatePickupCode', body: {code: cleanText(data.code)}},
      verifyDeliveryCode: {path: 'verifyDeliveryCode', body: {code: cleanText(data.code)}},
    };
    const operation = operations[action];
    if (!operation) throw new HttpsError('invalid-argument', 'Acao iFood invalida.');
    if (action === 'requestCancellation' && !operation.body.reason) {
      throw new HttpsError('invalid-argument', 'Informe o motivo de cancelamento iFood.');
    }
    const result = await requestIfood(
      lojaId,
      config,
      `${ORDER_BASE_PATH}/${encodeURIComponent(orderId)}/${operation.path}`,
      {method: 'POST', body: operation.body}
    );
    await audit(lojaId, `order.${action}`, {orderId, result});
    return result;
  };

  const issueAutomatedCommand = async (lojaId, config, orderId, action) => {
    const commandRef = db.collection('lojas').doc(lojaId).collection('ifoodCommands').doc(
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
    const orderId = cleanText(event.orderId || event.metadata?.id);
    if (!orderId) throw new Error('Evento iFood sem orderId.');
    const status = normalizeExternalStatus(event, event.metadata || {});
    const existing = await db.collection('lojas').doc(lojaId).collection('ifoodOrders').doc(orderId).get();
    let detail = event.metadata || {};
    if (!TERMINAL_EXTERNAL_STATUSES.has(status) || !existing.exists) {
      try {
        detail = await getOrderDetailWithRetry(lojaId, config, orderId);
      } catch (error) {
        const eventCreatedAt = Date.parse(event.createdAt || '');
        const exceededDetailWindow = Number.isFinite(eventCreatedAt)
          && Date.now() - eventCreatedAt >= 10 * 60 * 1000;
        if (error.httpStatus === 404 && exceededDetailWindow && event.id) {
          await db.collection('lojas').doc(lojaId).collection('ifoodEvents').doc(safeId(event.id)).set({
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
      throw new Error('Pedido aguardando mapeamento de produto iFood antes do processamento.');
    }

    if (!order.items.some((item) => !item.productId)) {
      if (order.externalStatus === 'PLACED' && config.autoConfirm) {
        await issueAutomatedCommand(lojaId, config, orderId, 'confirm');
      }
      if (order.externalStatus === 'CONFIRMED' && config.autoStartPreparation) {
        await issueAutomatedCommand(lojaId, config, orderId, 'startPreparation');
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
        logger.error('[iFood] event processing failed', {lojaId, event, error});
      }
    }
    if (acknowledgedEventIds.length) {
      await requestIfood(lojaId, config, `${ORDER_BASE_PATH}:acknowledgment`, {
        method: 'POST',
        body: {acknowledgedEventIds},
      });
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
    const mappingSnap = await db.collection('lojas').doc(lojaId).collection('ifoodProductMappings').doc(productId).get();
    if (!mappingSnap.exists || !mappingSnap.get('stockSyncEnabled')) return {skipped: 'not_mapped'};
    const [config, productSnap] = await Promise.all([
      loadConfig(lojaId),
      db.collection('lojas').doc(lojaId).collection('produtos').doc(productId).get(),
    ]);
    const mapping = mappingSnap.data() || {};
    const quantity = Math.max(0, asNumber(productSnap.data()?.estoque));
    if (!config.merchantId) {
      await mappingSnap.ref.set({
        syncStatus: 'waiting_merchant_id',
        pendingQuantity: quantity,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {skipped: 'merchant_id_missing'};
    }
    const endpointTemplate = config.inventoryEndpointTemplate
      || config.availabilityEndpointTemplate
      || `/catalog/v2.0/merchants/{merchantId}/inventory`;
    const endpoint = endpointTemplate
      .replace('{merchantId}', encodeURIComponent(config.merchantId || ''))
      .replace('{ifoodProductId}', encodeURIComponent(mapping.iFoodProductId || ''));
    try {
      const result = await requestIfood(lojaId, config, endpoint, {
        method: config.inventoryMethod || config.availabilityMethod || 'POST',
        body: {productId: mapping.iFoodProductId, quantity},
      });
      await mappingSnap.ref.set({
        lastSyncedQuantity: quantity,
        syncStatus: 'synced',
        lastSyncAt: FieldValue.serverTimestamp(),
        lastSyncReason: reason,
        syncError: FieldValue.delete(),
      }, {merge: true});
      return {quantity, result};
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

  const reconcileFailedAvailability = async (lojaId) => {
    const failed = await db.collection('lojas').doc(lojaId).collection('ifoodProductMappings')
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
    if (!config.enabled || !config.pollingEnabled) return {skipped: true};
    const started = Date.now();
    try {
      const payload = await requestIfood(lojaId, config, `${ORDER_BASE_PATH}:polling`);
      const events = Array.isArray(payload) ? payload : (payload.events || []);
      const result = await processEvents(lojaId, config, events, origin);
      const inventoryRetries = await reconcileFailedAvailability(lojaId);
      await healthRef(lojaId).set({
        provider: PROVIDER,
        status: result.failures.length ? 'degraded' : 'online',
        lastPollAt: FieldValue.serverTimestamp(),
        latencyMs: Date.now() - started,
        lastBatch: result,
        lastInventoryRetryCount: inventoryRetries.length,
        lastError: FieldValue.delete(),
      }, {merge: true});
      return {...result, inventoryRetries: inventoryRetries.length};
    } catch (error) {
      await healthRef(lojaId).set({
        provider: PROVIDER,
        status: 'offline',
        lastPollAt: FieldValue.serverTimestamp(),
        latencyMs: Date.now() - started,
        lastError: error.message,
      }, {merge: true});
      await createAlert(lojaId, 'api_poll_failure', error.message);
      throw error;
    }
  };

  return {
    ifoodGetConfiguration: onCall(async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const [configSnap, healthSnap] = await Promise.all([configRef(lojaId).get(), healthRef(lojaId).get()]);
      return {
        config: publicConfig(configSnap.exists ? configSnap.data() : {}),
        health: healthSnap.exists ? healthSnap.data() : {status: 'not_configured'},
      };
    }),

    ifoodSaveConfiguration: onCall({timeoutSeconds: 120}, async (request) => {
      const {uid, lojaId} = await requireCallableStore(request);
      const incoming = request.data || {};
      const existingSnap = await configRef(lojaId).get();
      const existing = existingSnap.exists ? existingSnap.data() || {} : {};
      const clientId = cleanText(incoming.clientId);
      const clientSecret = String(incoming.clientSecret || '');
      const webhookSecret = String(incoming.webhookSecret || '');
      const projectId = getProjectId();
      let secretPatch = {};

      if ((clientId || clientSecret) && !(clientId && clientSecret)) {
        throw new HttpsError('invalid-argument', 'Informe Client ID e Client Secret juntos.');
      }
      if ((clientId && clientSecret) || webhookSecret) {
        if (!projectId) throw new HttpsError('failed-precondition', 'Projeto Google Cloud nao identificado.');
        const storeKey = safeId(lojaId);
        const labels = {app: 'doceria', provider: 'ifood', loja: storeKey.slice(0, 63)};
        if (clientId && clientSecret) {
          const [clientIdName, clientSecretName] = await Promise.all([
            ensureSecret(projectId, `ifood_${storeKey}_client_id`, labels),
            ensureSecret(projectId, `ifood_${storeKey}_client_secret`, labels),
          ]);
          const [clientIdSecretVersion, clientSecretSecretVersion] = await Promise.all([
            addSecretVersion(clientIdName, clientId),
            addSecretVersion(clientSecretName, clientSecret),
          ]);
          secretPatch = {...secretPatch, clientIdSecretVersion, clientSecretSecretVersion};
        }
        if (webhookSecret) {
          const resourceName = await ensureSecret(projectId, `ifood_${storeKey}_webhook_secret`, labels);
          secretPatch.webhookSecretVersion = await addSecretVersion(resourceName, webhookSecret);
        }
      }

      const config = {
        provider: PROVIDER,
        merchantId: cleanText(incoming.merchantId || existing.merchantId),
        enabled: Boolean(incoming.enabled),
        pollingEnabled: incoming.pollingEnabled !== false,
        webhookEnabled: Boolean(incoming.webhookEnabled),
        autoConfirm: incoming.autoConfirm !== false,
        autoStartPreparation: Boolean(incoming.autoStartPreparation),
        apiBaseUrl: cleanText(incoming.apiBaseUrl || existing.apiBaseUrl || DEFAULT_API_URL),
        authUrl: cleanText(incoming.authUrl || existing.authUrl || DEFAULT_AUTH_URL),
        inventoryEndpointTemplate: cleanText(incoming.inventoryEndpointTemplate || existing.inventoryEndpointTemplate || existing.availabilityEndpointTemplate),
        inventoryMethod: ['POST', 'PATCH', 'PUT'].includes(incoming.inventoryMethod) ? incoming.inventoryMethod : (existing.inventoryMethod || existing.availabilityMethod || 'POST'),
        ...secretPatch,
        updatedByUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
      };
      await configRef(lojaId).set(config, {merge: true});
      tokenCache.delete(lojaId);
      await audit(lojaId, 'configuration.saved', {uid, enabled: config.enabled, pollingEnabled: config.pollingEnabled});
      return publicConfig({...existing, ...config, ...secretPatch});
    }),

    ifoodTestConnection: onCall(async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const config = await loadConfig(lojaId);
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

    ifoodLoadMerchants: onCall(async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const config = await loadConfig(lojaId);
      if (!config.clientIdSecretVersion || !config.clientSecretSecretVersion) {
        throw new HttpsError('failed-precondition', 'Salve Client ID e Client Secret antes de localizar lojas.');
      }
      const payload = await requestIfood(lojaId, config, '/merchant/v1.0/merchants');
      const records = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload.merchants) ? payload.merchants : (Array.isArray(payload.data) ? payload.data : []));
      const merchants = records
        .map((merchant) => ({
          id: cleanText(merchant.id),
          name: cleanText(merchant.name),
          corporateName: cleanText(merchant.corporateName),
        }))
        .filter((merchant) => merchant.id);
      if (!merchants.length) {
        throw new HttpsError('not-found', 'Nenhuma loja autorizada foi encontrada para estas credenciais iFood.');
      }
      await audit(lojaId, 'merchants.loaded', {count: merchants.length});
      return {merchants};
    }),

    ifoodPollNow: onCall({timeoutSeconds: 120}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      return runPoll(lojaId, 'manual');
    }),

    ifoodOrderAction: onCall({timeoutSeconds: 120}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const orderId = cleanText(request.data?.orderId);
      const action = cleanText(request.data?.action);
      if (!orderId) throw new HttpsError('invalid-argument', 'orderId obrigatorio.');
      const config = await loadConfig(lojaId);
      return issueOrderCommand(lojaId, config, orderId, action, request.data || {});
    }),

    ifoodGetCancellationReasons: onCall({timeoutSeconds: 120}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const orderId = cleanText(request.data?.orderId);
      if (!orderId) throw new HttpsError('invalid-argument', 'orderId obrigatorio.');
      const config = await loadConfig(lojaId);
      const payload = await requestIfood(lojaId, config, `${ORDER_BASE_PATH}/${encodeURIComponent(orderId)}/cancellationReasons`);
      return {reasons: Array.isArray(payload) ? payload : (payload.reasons || [])};
    }),

    ifoodLoadCatalogProducts: onCall({timeoutSeconds: 120}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const config = await loadConfig(lojaId);
      if (!config.merchantId) throw new HttpsError('failed-precondition', 'Informe o Merchant ID do iFood.');
      const payload = await requestIfood(
        lojaId,
        config,
        `/catalog/v2.0/merchants/${encodeURIComponent(config.merchantId)}/categories?include_items=true`
      );
      const categories = Array.isArray(payload) ? payload : (payload.categories || []);
      const products = categories.flatMap((category) => (category.items || []).map((item) => ({
        itemId: cleanText(item.id),
        productId: cleanText(item.productId || item.product?.id),
        name: item.name || item.product?.name || 'Produto iFood',
        externalCode: cleanText(item.externalCode || item.product?.externalCode),
        categoryName: category.name || '',
        status: item.status || '',
      }))).filter((item) => item.productId);
      await audit(lojaId, 'catalog.loaded', {categories: categories.length, products: products.length});
      return {products};
    }),

    ifoodSaveProductMapping: onCall({timeoutSeconds: 120}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const productId = cleanText(request.data?.productId);
      const iFoodProductId = cleanText(request.data?.iFoodProductId);
      if (!productId || !iFoodProductId) {
        throw new HttpsError('invalid-argument', 'Produto interno e ID do produto iFood sao obrigatorios.');
      }
      const mappingRef = db.collection('lojas').doc(lojaId).collection('ifoodProductMappings').doc(productId);
      await mappingRef.set({
        productId,
        iFoodProductId,
        externalCode: cleanText(request.data?.externalCode),
        catalogItemId: cleanText(request.data?.catalogItemId),
        stockSyncEnabled: request.data?.stockSyncEnabled !== false,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      try {
        await syncProductAvailability(lojaId, productId, 'mapping_saved');
      } catch (error) {
        logger.warn('[iFood] initial mapping sync failed', {lojaId, productId, error: error.message});
      }
      return {ok: true};
    }),

    ifoodSyncStockNow: onCall({timeoutSeconds: 120}, async (request) => {
      const {lojaId} = await requireCallableStore(request);
      const productId = cleanText(request.data?.productId);
      if (productId) return syncProductAvailability(lojaId, productId, 'manual');
      const mappings = await db.collection('lojas').doc(lojaId).collection('ifoodProductMappings')
        .where('stockSyncEnabled', '==', true).get();
      const results = [];
      for (const mapping of mappings.docs) {
        results.push(await syncProductAvailability(lojaId, mapping.id, 'manual'));
      }
      return {synced: results.length, results};
    }),

    ifoodScheduledPoll: onSchedule({
      schedule: 'every 1 minutes',
      timeoutSeconds: 120,
      memory: '512MiB',
    }, async () => {
      const enabled = await db.collectionGroup('ifood').where('pollingEnabled', '==', true).get();
      for (const configDoc of enabled.docs.filter((doc) => doc.id === 'config' && doc.get('enabled') === true)) {
        const lojaId = extractStoreId(configDoc);
        if (!lojaId) continue;
        try {
          await runPoll(lojaId, 'scheduler');
        } catch (error) {
          logger.error('[iFood] scheduled poll failed', {lojaId, error: error.message});
        }
      }
    }),

    ifoodProductStockChanged: onDocumentWritten('lojas/{lojaId}/produtos/{productId}', async (event) => {
      const before = asNumber(event.data?.before?.data()?.estoque);
      const after = asNumber(event.data?.after?.data()?.estoque);
      if (!event.data?.after?.exists || before === after) return;
      const {lojaId, productId} = event.params;
      try {
        await syncProductAvailability(lojaId, productId, 'internal_stock_change');
      } catch (error) {
        logger.warn('[iFood] async stock sync deferred', {lojaId, productId, error: error.message});
      }
    }),

    ifoodWebhook: onRequest({timeoutSeconds: 120, memory: '512MiB'}, async (request, response) => {
      if (request.method !== 'POST') {
        response.status(405).json({error: 'Method not allowed'});
        return;
      }
      const lojaId = cleanText(request.query.lojaId);
      if (!lojaId) {
        response.status(400).json({error: 'lojaId obrigatorio'});
        return;
      }
      try {
        const config = await loadConfig(lojaId);
        if (!config.webhookEnabled) {
          response.status(409).json({error: 'Webhook desabilitado'});
          return;
        }
        if (config.webhookSecretVersion) {
          const secret = await accessSecret(config.webhookSecretVersion);
          const sentSignature = cleanText(request.get('x-ifood-signature'));
          const expected = crypto.createHmac('sha256', secret).update(request.rawBody || Buffer.from(JSON.stringify(request.body))).digest('hex');
          const valid = sentSignature.length === expected.length
            && crypto.timingSafeEqual(Buffer.from(sentSignature), Buffer.from(expected));
          if (!valid) {
            response.status(401).json({error: 'Assinatura invalida'});
            return;
          }
        }
        const events = Array.isArray(request.body?.events) ? request.body.events : [];
        const result = await processEvents(lojaId, config, events, 'webhook');
        response.status(200).json({acknowledged: true, result});
      } catch (error) {
        logger.error('[iFood] webhook failed', {lojaId, error: error.message});
        response.status(500).json({error: error.message});
      }
    }),
  };
};

module.exports = {createIfoodFunctions};
