// Claim the online order once before an external FCM send. An ambiguous send is
// left for manual review instead of risking a duplicate customer-facing alert.
async function claimOnlineOrderNotification({db,admin,orderRef,paymentId}) {
  const attemptRef=db.collection('checkoutNotificationAttempts').doc(paymentId);
  const paymentRef=db.collection('checkoutPayments').doc(paymentId);
  return db.runTransaction(async tx=>{
    const [order, payment, attempt]=await Promise.all([tx.get(orderRef),tx.get(paymentRef),tx.get(attemptRef)]);
    const o=order.data(),p=payment.data();
    if(attempt.exists || !o || !p || p.orderPath!==orderRef.path || o.paymentId!==paymentId ||
      o.payment_status!=='PAID' || p.payment_status!=='PAID' || o.requiresReview || p.requiresReview ||
      o.order_status==='CANCELLED') return false;
    tx.create(attemptRef,{orderPath:orderRef.path,state:'ATTEMPTED',createdAt:admin.firestore.FieldValue.serverTimestamp()});
    return true;
  });
}
module.exports={claimOnlineOrderNotification};
