const FINALIZED_ORDER_STATUS = 'Finalizado';

const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');

const moneyToCents = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }

  if (typeof value !== 'string') return 0;
  const normalized = value.trim().replace(/\s/g, '');
  if (!normalized) return 0;

  const decimal = normalized.includes(',') ?
    normalized.replace(/\./g, '').replace(',', '.') :
    normalized;
  const parsed = Number(decimal);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

const timestampMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getOrderPurchaseDate = (order = {}) => (
  order.createdAt ||
  order.data ||
  order.finalizadoEm ||
  order.finalizedAt ||
  order.completedAt ||
  null
);

const isValidPurchaseOrder = (order = {}) => (
  String(order.status || '').trim() === FINALIZED_ORDER_STATUS
);

const aggregateCustomerOrders = (orders = [], customerId = '') => {
  let totalCents = 0;
  let purchaseCount = 0;
  let lastPurchase = null;
  let lastPurchaseMillis = 0;

  orders.forEach((order) => {
    if (!isValidPurchaseOrder(order)) return;
    if (customerId && String(order.clienteId || '') !== String(customerId)) return;

    totalCents += moneyToCents(order.total);
    purchaseCount += 1;

    const purchaseDate = getOrderPurchaseDate(order);
    const purchaseMillis = timestampMillis(purchaseDate);
    if (purchaseMillis > lastPurchaseMillis) {
      lastPurchase = purchaseDate;
      lastPurchaseMillis = purchaseMillis;
    }
  });

  return {
    totalCents,
    purchaseCount,
    lastPurchase,
    lastPurchaseMillis,
  };
};

const addUniqueIndexValue = (index, key, customerId) => {
  if (!key) return;
  if (!index.has(key)) {
    index.set(key, customerId);
    return;
  }
  if (index.get(key) !== customerId) index.set(key, null);
};

const buildCustomerIdentityIndex = (customers = []) => {
  const ids = new Set();
  const documents = new Map();
  const phones = new Map();

  customers.forEach((customer) => {
    const customerId = String(customer?.id || '').trim();
    if (!customerId) return;
    ids.add(customerId);

    [customer.cpf, customer.documento]
        .map(normalizeDigits)
        .filter(Boolean)
        .forEach((document) => addUniqueIndexValue(documents, document, customerId));

    [customer.telefone, customer.phone]
        .map(normalizeDigits)
        .filter(Boolean)
        .forEach((phone) => addUniqueIndexValue(phones, phone, customerId));
  });

  return {ids, documents, phones};
};

const resolveOrderCustomerId = (order = {}, identityIndex) => {
  const explicitId = String(order.clienteId || order.customerId || '').trim();
  if (explicitId) return identityIndex.ids.has(explicitId) ? explicitId : null;

  const documentKeys = [
    order.clienteDocumento,
    order.customerDocument,
    order.documento,
    order.cpf,
  ].map(normalizeDigits).filter(Boolean);
  const phoneKeys = [
    order.telefone,
    order.clienteTelefone,
    order.customerPhone,
    order.phone,
  ].map(normalizeDigits).filter(Boolean);

  const matchedIds = new Set();
  documentKeys.forEach((key) => {
    const matched = identityIndex.documents.get(key);
    if (matched) matchedIds.add(matched);
  });
  phoneKeys.forEach((key) => {
    const matched = identityIndex.phones.get(key);
    if (matched) matchedIds.add(matched);
  });

  return matchedIds.size === 1 ? Array.from(matchedIds)[0] : null;
};

const summarizeStoreMetrics = (metricsByStore = {}) => {
  let totalCents = 0;
  let purchaseCount = 0;
  let lastPurchase = null;
  let lastPurchaseMillis = 0;

  Object.values(metricsByStore || {}).forEach((metric) => {
    totalCents += Number(metric?.valorEmComprasCentavos) || 0;
    purchaseCount += Number(metric?.numeroDeCompras) || 0;
    const metricMillis = Number(metric?.ultimaCompraMillis) ||
      timestampMillis(metric?.ultimaCompra);
    if (metricMillis > lastPurchaseMillis) {
      lastPurchase = metric?.ultimaCompra || null;
      lastPurchaseMillis = metricMillis;
    }
  });

  return {
    totalCents,
    purchaseCount,
    lastPurchase,
    lastPurchaseMillis,
  };
};

module.exports = {
  FINALIZED_ORDER_STATUS,
  aggregateCustomerOrders,
  buildCustomerIdentityIndex,
  getOrderPurchaseDate,
  isValidPurchaseOrder,
  moneyToCents,
  normalizeDigits,
  resolveOrderCustomerId,
  summarizeStoreMetrics,
  timestampMillis,
};
