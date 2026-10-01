const OWNER_ROLES = new Set([
  'dono', 'owner', 'admin', 'adm', 'administrador', 'administradora',
  'administrador_master', 'administradora_master', 'admin_master', 'master',
  'superadmin',
]);
const STORE_ORDER_ROLES = new Set(['gerente', 'gestor', 'gestora', 'atendente']);
const NEW_ORDER_STATUS = 'Pendente';
const MAX_TEXT_LENGTH = 180;

const normalizeRole = (value) => String(value || '').trim().toLowerCase();
const truncate = (value, maxLength = MAX_TEXT_LENGTH) => String(value || '').trim().slice(0, maxLength);

const addStoreValue = (value, result) => {
  if (typeof value === 'string') {
    const storeId = value.trim();
    if (storeId) result.add(storeId);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => addStoreValue(item, result));
    return;
  }
  if (value && typeof value === 'object') {
    addStoreValue(value.id || value.lojaId || value.storeId, result);
  }
};

const extractProfileStoreIds = (profile = {}) => {
  const result = new Set();
  addStoreValue(profile.lojaId, result);
  addStoreValue(profile.lojaIds, result);
  addStoreValue(profile.lojas, result);
  return [...result];
};

const canUseOrdersModule = (profile = {}, customProfile = null) => {
  if (profile.permissions?.pedidos === false) return false;
  if (customProfile?.permissions?.pedidos === false) return false;
  return true;
};

const profileCanReceiveOrder = (profile, storeId, customProfile = null) => {
  if (!profile || profile.ativo === false || profile.authDisabled === true) return false;
  if (String(profile.status || '').trim().toLowerCase() === 'inativo') return false;
  if (!canUseOrdersModule(profile, customProfile)) return false;

  const role = normalizeRole(profile.role);
  const isOwner = OWNER_ROLES.has(role);
  if (!isOwner && !STORE_ORDER_ROLES.has(role)) return false;

  const storeIds = extractProfileStoreIds(profile);
  if (isOwner && storeIds.length === 0) return true;
  return storeIds.includes(String(storeId || '').trim());
};

const getPauseTimestamp = (pause = null) => {
  const value = pause?.pausedUntil;
  if (Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return 0;
};

const isAlarmPauseActive = (pause, now = Date.now()) => getPauseTimestamp(pause) > now;

const getTimestampMillis = (value) => {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') return Date.parse(value);
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const shouldInterruptAlarmPause = (pause, orderCreatedAt, now = Date.now()) => {
  if (!isAlarmPauseActive(pause, now)) return false;

  const pauseStartedAt = getTimestampMillis(pause?.updatedAt);
  const orderCreatedAtMillis = getTimestampMillis(orderCreatedAt);
  if (!pauseStartedAt || !orderCreatedAtMillis) return true;

  return pauseStartedAt <= orderCreatedAtMillis;
};

const isNewPendingOrder = (order) => Boolean(order && order.status === NEW_ORDER_STATUS);

const formatMoney = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return amount.toFixed(2).replace('.', ',');
};

const buildNewOrderData = ({orderId, storeId, order = {}}) => {
  const normalizedOrderId = truncate(orderId, 180);
  const normalizedStoreId = truncate(storeId, 180);
  const customerName = truncate(
      order.clienteNome || order.nomeCliente || order.nome || order.cliente?.nome,
      100,
  );
  const category = truncate(order.categoria || order.tipoEntrega || order.origem, 80);
  const total = truncate(formatMoney(order.total), 30);
  const orderCode = truncate(
      order.numeroPedido || order.codigo || order.numero || normalizedOrderId.slice(0, 8),
      40,
  );
  const details = [total ? `R$ ${total}` : '', category, customerName].filter(Boolean);

  return {
    type: 'new_order',
    orderId: normalizedOrderId,
    storeId: normalizedStoreId,
    dedupeKey: `${normalizedStoreId}:${normalizedOrderId}`,
    customerName,
    total,
    category,
    title: '🔔 NOVO PEDIDO',
    body: truncate(`Pedido #${orderCode}${details.length ? ` • ${details.join(' • ')}` : ''}`, 240),
    source: 'new-order',
    url: `/?page=pedidos&orderId=${encodeURIComponent(normalizedOrderId)}`,
  };
};

module.exports = {
  buildNewOrderData,
  canUseOrdersModule,
  extractProfileStoreIds,
  isAlarmPauseActive,
  isNewPendingOrder,
  profileCanReceiveOrder,
  shouldInterruptAlarmPause,
};
