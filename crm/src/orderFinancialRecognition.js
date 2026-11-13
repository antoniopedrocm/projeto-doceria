// Financial reporting must not treat an operationally finalized unpaid order
// as a receipt. Keep the historic contract only when no financial state exists.
export function isRecognizedOrderReceipt(order) {
  if(order.status!=='Finalizado')return false;
  const state=order.payment_status || order.paymentStatus;
  if(order.paymentMode || order.paymentId || state)return state==='PAID' && !order.requiresReview;
  return true;
}
export function recognizedOrderTotal(order) {
  const paid=order.adminPaymentAdjustment?.paidCents ?? order.manualPaymentReceipt?.amountCents;
  return Number.isSafeInteger(paid) && paid>=0 ? paid/100 : Number(order.total || 0);
}
