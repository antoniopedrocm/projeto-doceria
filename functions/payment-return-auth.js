const crypto=require('node:crypto');
const TTL_MS=48*60*60*1000;
const valid=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function returnToken(contextToken,paymentId) {
  if(!valid(contextToken) || !valid(paymentId)) throw new Error('Invalid payment return context');
  // The checkout context is random, per-tab and server-issued. Domain separation
  // makes this credential usable for exactly one attempt, never as an identity.
  return crypto.createHmac('sha256',contextToken).update('payment-return:v1:'+paymentId).digest('hex');
}
function returnAuthorization(contextToken,paymentId,now=Date.now()) {
  return {hash:digest(returnToken(contextToken,paymentId)),expiresAt:now+TTL_MS};
}
function canReadPayment(payment,uid,token,now=Date.now()) {
  if(typeof uid==='string' && uid && payment?.ownerUid===uid) return true;
  const grant=payment?.returnAuthorization;
  if(!valid(token) || !valid(grant?.hash) || !Number.isFinite(grant.expiresAt) || grant.expiresAt<=now) return false;
  return crypto.timingSafeEqual(Buffer.from(grant.hash,'hex'),Buffer.from(digest(token),'hex'));
}
module.exports={returnToken,returnAuthorization,canReadPayment,TTL_MS};
