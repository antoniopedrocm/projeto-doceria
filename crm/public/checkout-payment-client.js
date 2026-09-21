import {auth} from './firebaseClientConfig.js';
import {apiBaseUrl} from './checkout-environment.js';
import {signInAnonymously} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
const key='doceria-payment-pending';
export async function checkoutHeaders(online=false) {
  await auth.authStateReady();
  if(online && !auth.currentUser) await signInAnonymously(auth);
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
export async function enableOnlinePayment(storeId) {
  try {
    const r=await fetch(`${apiBaseUrl}/checkout/config?lojaId=${encodeURIComponent(storeId)}`);
    const config=await r.json();
    if(config.enabled) for(const id of ['payment-method-select','guest-payment-method']) {
      const select=document.getElementById(id);if(!select) continue;
      const option=new Option('Pagar online — Pix ou cartão','Online',true,true);select.prepend(option);
    }
  } catch { /* Store keeps its current payment methods until configured. */ }
}
