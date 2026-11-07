const pendingKey='doceria-payment-pending';
const validId=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const uncertain='Não foi possível verificar a tentativa anterior. Consulte o pagamento existente antes de confirmar outro pedido.';

// Session cache is only a hint. Never rotate a submitted attempt because its
// address/payment choice changed, or because the last response was lost.
export async function inspectGuestPaymentAttempt({storage,request,paymentMode='AGREED_LATER',retireTerminal=true}) {
 let raw,previous;
 try {raw=storage.getItem(pendingKey);previous=JSON.parse(raw || 'null');}
 catch {return {blocked:true,message:uncertain};}
 if(!previous?.paymentId) return {blocked:false};
 if(!validId(previous.paymentId))return {blocked:true,message:uncertain};
 const paymentId=previous.paymentId,blocked=message=>({blocked:true,paymentId,message});
 let token;
 try {token=JSON.parse(storage.getItem('doceria-payment-return:'+paymentId) || 'null')?.token;}
 catch {return blocked(uncertain);}
 if(!validId(token))return blocked(uncertain);
 try {
  const result=await request({paymentId,paymentReturnToken:token});
  if(!result.ok || result.data?.requiresReview)return blocked(uncertain);
  if(['EXPIRED','CANCELLED','REFUNDED'].includes(result.data?.payment_status)) {
   if(!retireTerminal)return {blocked:false};
   if(storage.getItem(pendingKey)!==raw)return blocked('A tentativa mudou durante a consulta. Confira o pedido antes de continuar.');
   storage.removeItem(pendingKey);return {blocked:false};
  }
  if(result.data?.payment_status==='PAID')return blocked('Já existe um pedido com pagamento confirmado nesta tentativa. Consulte o pedido antes de confirmar outro.');
  if(result.data?.payment_status==='PENDING') {
   // Resuming the same online attempt still goes through the backend's full
   // fingerprint/context guard and must retain its original idempotency key.
   if(paymentMode==='ONLINE_NOW')return {blocked:false,paymentId};
   return blocked('Já existe um pedido com pagamento online em andamento nesta aba. Consulte o pagamento existente antes de trocar a forma de pagamento ou confirmar outro pedido.');
  }
  return blocked(uncertain);
 } catch {return blocked(uncertain);}
}
