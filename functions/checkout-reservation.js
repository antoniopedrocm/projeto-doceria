// Local reservation deadline, not a cancellation of the provider's payment link.
const RESERVATION_MS = 30 * 60 * 1000;
function operationalState(status) {
  return {'Pendente':'CONFIRMED','Em Produção':'PREPARING','Pronto para Entrega':'READY',
    'Finalizado':'DELIVERED','Cancelado':'CANCELLED'}[status] || null;
}
function shouldNotifyOrder(previous, order) {
  if (!order) return false;
  if (!order.payment_status) return !previous;
  return order.payment_status === 'PAID' && order.order_status === 'CONFIRMED' &&
    !order.requiresReview && previous?.payment_status !== 'PAID';
}
async function readReservation(tx, db, payment) {
  const reservation = payment.reservation;
  if (reservation?.state !== 'HELD') return null;
  const paths = [...reservation.stock.map(item => item.path),
    reservation.couponPath, reservation.customerPath].filter(Boolean);
  const snapshots = await Promise.all(paths.map(path => tx.get(db.doc(path))));
  const docs = new Map(snapshots.map(snap => [snap.ref.path, snap]));
  for (const item of reservation.stock) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
        !Number.isFinite(docs.get(item.path)?.data()?.estoque)) {
      throw new Error('Reserva de estoque requer conciliação manual.');
    }
  }
  if (reservation.couponPath && !(docs.get(reservation.couponPath)?.data()?.reservados >= 1)) {
    throw new Error('Reserva de cupom requer conciliação manual.');
  }
  return {reservation, docs};
}
function settleReservation(tx, db, admin, held, consume) {
  if (!held) return;
  const {reservation: r, docs} = held;
  const fields = admin.firestore.FieldValue;
  if (!consume) for (const item of r.stock) {
    tx.update(db.doc(item.path), {estoque: fields.increment(item.quantity)});
  }
  if (r.couponPath) tx.update(db.doc(r.couponPath), {
    reservados: fields.increment(-1), ...(consume ? {usos: fields.increment(1)} : {}),
  });
  if (r.customerPath && docs.get(r.customerPath)?.exists) tx.update(db.doc(r.customerPath), {
    cuponsReservados: fields.arrayRemove(r.couponCode),
    ...(consume ? {cuponsUsados: fields.arrayUnion(r.couponCode)} : {}),
    atualizadoEm: fields.serverTimestamp(),
  });
}
module.exports = {RESERVATION_MS, operationalState, shouldNotifyOrder, readReservation, settleReservation};
