import {auth} from './firebaseClientConfig.js';
import {apiBaseUrl} from './checkout-environment.js';
import {isLinkedCustomer} from './customer-session.mjs';
const key='doceria-payment-pending';
export async function checkoutHeaders(online=false) {
  await auth.authStateReady();
  if(online && (!auth.currentUser || auth.currentUser.isAnonymous ||
    !auth.currentUser.providerData.some(p=>['google.com','password'].includes(p.providerId)))) {
    throw new Error('Entre com Google ou e-mail em Minha Conta para pagar online.');
  }
  const headers={'Content-Type':'application/json'};
  if(auth.currentUser) headers.Authorization=`Bearer ${await auth.currentUser.getIdToken()}`;
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
  if(data.payment_status==='PAID') {location.href=`./payment-return.html?order_nsu=${encodeURIComponent(data.paymentId)}`;return;}
  if(!data.checkoutUrl) throw new Error('Seu pedido está aguardando confirmação. Consulte Minha Conta.');
  const url=new URL(data.checkoutUrl);
  if(url.protocol!=='https:' || !(url.hostname==='infinitepay.io'||url.hostname.endsWith('.infinitepay.io'))) throw new Error('Link de pagamento inválido.');
  location.assign(url.href);
}
let onlineEnabled=false;
export function syncOnlinePaymentOption(customer) {
  const select=document.getElementById('payment-method-select');
  const guest=document.getElementById('guest-payment-method');
  guest?.querySelector('option[value="Online"]')?.remove();
  if(!select) return;
  const option=select.querySelector('option[value="Online"]');
  if(!onlineEnabled || !isLinkedCustomer(customer)) {
    if(select.value==='Online') select.value='';
    option?.remove();
  } else if(!option) select.add(new Option('Pagar online — Pix ou cartão','Online'));
}
export async function enableOnlinePayment(storeId,getCustomer=()=>null) {
  try {
    const r=await fetch(`${apiBaseUrl}/checkout/config?lojaId=${encodeURIComponent(storeId)}`);
    const config=await r.json();
    onlineEnabled=r.ok && config.enabled===true;
    syncOnlinePaymentOption(getCustomer());
  } catch { /* Store keeps its current payment methods until configured. */ }
}
