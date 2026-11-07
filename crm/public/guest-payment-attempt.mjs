const pendingKey='doceria-payment-pending';
const validId=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const uncertain='Não foi possível verificar o pedido anterior. Consulte o pagamento antes de confirmar novamente.';

// Checkout completion is not payment completion/cancellation. Return proof and
// receipt are separate from the key for an unacknowledged confirmation POST.
export function completeCheckoutAttempt({storage,attemptKey,orderId,paymentId=null,paymentReturnToken,storeId,mode}) {
 if(!validId(orderId) || !['ONLINE_NOW','AGREED_LATER'].includes(mode) || typeof storeId!=='string' || !storeId || !attemptKey)throw Error('Confirmação do pedido inválida.');
 if(paymentId && (!validId(paymentId) || paymentId!==orderId))throw Error('Referência de pagamento inválida.');
 if(paymentReturnToken) {
  if(!paymentId || !validId(paymentReturnToken))throw Error('Prova de pagamento inválida.');
  storage.setItem('doceria-payment-return:'+paymentId,JSON.stringify({token:paymentReturnToken}));
 }
 storage.setItem('doceria-checkout-receipt:'+orderId,JSON.stringify({orderId,paymentId,storeId,mode}));
 const raw=storage.getItem(pendingKey),pending=JSON.parse(raw || 'null');
 if(pending?.idempotencyKey!==attemptKey || storage.getItem(pendingKey)!==raw)return false;
 if(paymentId)storage.setItem('doceria-payment-last',JSON.stringify({paymentId,storeId}));
 let draft;try{draft=JSON.parse(storage.getItem('checkoutState_v1') || 'null');}catch{ /* UI cleans an invalid draft after acknowledgement. */ }
 // Clear the matching persisted cart before the attempt key. An interruption
 // between these writes must not restore the old cart with a fresh key.
 if(draft?.storeId===storeId)storage.removeItem('checkoutState_v1');
 storage.removeItem(pendingKey);return true;
}

// Compatibility recovery for releases that redirected without finishing the cart.
// An unknown/lost response never rotates the key or submits a replacement.
export async function inspectGuestPaymentAttempt({storage,request,storeId}) {
 let raw,previous;
 try {raw=storage.getItem(pendingKey);previous=JSON.parse(raw || 'null');}
 catch {return {blocked:true,message:uncertain};}
 if(!previous?.paymentId) return {blocked:false};
 if(!validId(previous.paymentId) || typeof previous.idempotencyKey!=='string')return {blocked:true,message:uncertain};
 const paymentId=previous.paymentId,blocked=()=>({blocked:true,paymentId,message:uncertain});
 let token;
 try {token=JSON.parse(storage.getItem('doceria-payment-return:'+paymentId) || 'null')?.token;}
 catch {return blocked();}
 if(!validId(token))return blocked();
 try {
  const result=await request({paymentId,paymentReturnToken:token});
  const data=result.data;
  if(!result.ok || data?.id!==paymentId || typeof data.storeId!=='string' || !data.storeId ||
    !['PENDING','PAID','EXPIRED','CANCELLED','REFUNDED'].includes(data.payment_status))return blocked();
  if(storage.getItem(pendingKey)!==raw)return blocked();
  return {blocked:false,registered:true,otherStore:!!storeId && data.storeId!==storeId,
   paymentId,orderId:data.id,storeId:data.storeId,attemptKey:previous.idempotencyKey,
   paymentStatus:data.payment_status,requiresReview:!!data.requiresReview};
 } catch {return blocked();}
}
