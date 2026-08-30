export const PENDING_ORDER_STATUS = 'Pendente';

const normalizeId = (value) => String(value || '').trim();

export const isPendingOrder = (order) => (
  Boolean(order) && order.status === PENDING_ORDER_STATUS
);

export const getPendingOrdersForStore = (orders = [], storeId = '') => {
  const normalizedStoreId = normalizeId(storeId);
  if (!normalizedStoreId || !Array.isArray(orders)) return [];

  return orders.filter((order) => (
    isPendingOrder(order) && normalizeId(order.lojaId) === normalizedStoreId
  ));
};

export const getPendingOrderIdsForStore = (orders = [], storeId = '') => (
  getPendingOrdersForStore(orders, storeId)
    .map((order) => normalizeId(order.id))
    .filter(Boolean)
);

export const resolveOrderAlarmCondition = ({
  orders = [],
  storeId = '',
  isPaused = false,
  pausedPendingOrderIds = null,
} = {}) => {
  const pendingOrderIds = getPendingOrderIdsForStore(orders, storeId);
  const hasPendingOrders = pendingOrderIds.length > 0;
  const pauseBaselineIsKnown = Array.isArray(pausedPendingOrderIds);
  const pausedOrderIdSet = new Set(
    pauseBaselineIsKnown ? pausedPendingOrderIds.map(normalizeId).filter(Boolean) : []
  );
  const hasNewPendingOrderDuringPause = Boolean(
    isPaused
    && pauseBaselineIsKnown
    && pendingOrderIds.some((orderId) => !pausedOrderIdSet.has(orderId))
  );

  return {
    pendingOrderIds,
    hasPendingOrders,
    hasNewPendingOrderDuringPause,
    shouldPlay: hasPendingOrders && (!isPaused || hasNewPendingOrderDuringPause),
  };
};
