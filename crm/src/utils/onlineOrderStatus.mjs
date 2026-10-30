export const OPERATIONAL_ORDER_STATUSES = ['Pendente', 'Em Produção', 'Pronto para Entrega', 'Finalizado', 'Cancelado'];

// A paid checkout owns its financial snapshot and stock movements. Staff changes
// only the legacy operational status used by the existing fiscal eligibility rule.
export async function saveOnlineOrderStatus({db, runTransaction, orderRef, logRef, storeId, status, expectedStatus, adminUid, timestamp}) {
  if (!adminUid || !storeId || !OPERATIONAL_ORDER_STATUSES.includes(status)) {
    throw new Error('Não foi possível validar a atualização do status.');
  }
  if (orderRef.path !== `lojas/${storeId}/pedidos/${orderRef.id}`) {
    throw new Error('A loja do pedido não corresponde à atualização.');
  }
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error('Este pedido não existe mais. Atualize a lista.');
    const order = snapshot.data();
    if (order.lojaId !== storeId || !order.paymentId || order.payment_status !== 'PAID'
      || !['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'].includes(order.order_status)
      || order.requiresReview === true) {
      throw new Error('O pagamento deste pedido ainda não permite atualizar o status operacional.');
    }
    if (order.status === status) return false;
    if (order.status !== expectedStatus) throw new Error('O status foi atualizado por outra sessão. Atualize a lista e tente novamente.');
    transaction.update(orderRef, {status, updatedAt: timestamp()});
    transaction.set(logRef, {
      action: 'Status operacional de pedido online atualizado', orderId: orderRef.id,
      lojaId: storeId, adminUid, previousStatus: order.status, status, timestamp: timestamp()
    });
    return true;
  });
}
