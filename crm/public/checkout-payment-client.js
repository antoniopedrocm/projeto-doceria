import {auth} from './firebaseClientConfig.js?v=20261015-persistence';
import {apiBaseUrl} from './checkout-environment.js';
import {isLinkedCustomer} from './customer-session.mjs';
import {syncPaymentChoices} from './checkout-payment-choice.mjs';
const key='doceria-payment-pending';
export async function checkoutHeaders(online=false,identity=null) {
  // Explicit guest purchase has no Auth dependency or Customer identity.
  if(identity?.get().mode==='guest' && identity?.get().token) return {'Content-Type':'application/json'};
  await auth.authStateReady();
  const publicCheckout=['legacy_phone','guest'].includes(identity?.get().mode) && !!identity?.get().token;
  if(online && !publicCheckout && (!identity?.isStrong() || !auth.currentUser || auth.currentUser.isAnonymous ||
    !auth.currentUser.providerData.some(p=>['google.com','password'].includes(p.providerId)))) {
    throw new Error('Identifique seu celular ou entre em Minha Conta para continuar.');
  }
  const headers={'Content-Type':'application/json'};
  if(identity?.isStrong() && auth.currentUser) headers.Authorization=`Bearer ${await auth.currentUser.getIdToken()}`;
  return headers;
}
export async function paymentStatusHeaders(hasReturnCapability=false) {
  // A bearer capability suffices after logout. Historical attempts without it
  // still support their original, explicitly authenticated owner contract.
  const headers={'Content-Type':'application/json'};
  if(hasReturnCapability) return headers;
  await auth.authStateReady();
  const user=auth.currentUser;
  if(user && !user.isAnonymous && user.providerData.some(p=>['google.com','password'].includes(p.providerId))) headers.Authorization=`Bearer ${await user.getIdToken()}`;
  return headers;
}
export function paymentAttempt() {
  const prior=JSON.parse(sessionStorage.getItem(key) || 'null');
  if(prior?.idempotencyKey) return prior.idempotencyKey;
  const idempotencyKey=crypto.randomUUID();sessionStorage.setItem(key,JSON.stringify({idempotencyKey}));return idempotencyKey;
}
export function redirectToPayment(data) {
  const prior=JSON.parse(sessionStorage.getItem(key) || '{}');
  sessionStorage.setItem(key,JSON.stringify({...prior,paymentId:data.paymentId}));
  if(data.paymentReturnToken) sessionStorage.setItem('doceria-payment-return:'+data.paymentId,JSON.stringify({token:data.paymentReturnToken}));
  if(data.payment_status==='PAID') {window.location.href=`./payment-return.html?order_nsu=${encodeURIComponent(data.paymentId)}`;return;}
  if(!data.checkoutUrl) throw new Error('Seu pedido está aguardando confirmação. Consulte Minha Conta.');
  const url=new URL(data.checkoutUrl);
  if(url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443') ||
    !(url.hostname==='infinitepay.io'||url.hostname.endsWith('.infinitepay.io')||url.hostname==='checkout.infinitepay.com.br')) throw new Error('Link de pagamento inválido.');
  window.location.assign(url.href);
}
let onlineEnabled=false;
export function syncOnlinePaymentOption(customer,strong=false,phone=false) {
  const select=document.getElementById('payment-method-select');
  const guest=document.getElementById('guest-payment-method');
  syncPaymentChoices(guest,true,onlineEnabled,'guest-v1');
  if(!select) return;
  syncPaymentChoices(select, (strong && isLinkedCustomer(customer)) || (phone && !!customer), onlineEnabled);
}
export async function enableOnlinePayment(storeId,getCustomer=()=>null,isStrong=()=>false,isPhone=()=>false) {
  try {
    const r=await fetch(`${apiBaseUrl}/checkout/config?lojaId=${encodeURIComponent(storeId)}`);
    const config=await r.json();
    onlineEnabled=r.ok && config.enabled===true;
    syncOnlinePaymentOption(getCustomer(),isStrong(),isPhone());
  } catch { /* Store keeps its current payment methods until configured. */ }
}
