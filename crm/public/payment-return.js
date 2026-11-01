import {apiBaseUrl} from './checkout-environment.js';
import {paymentStatusHeaders} from './checkout-payment-client.js';
import {customerMenuDestination} from './store-links.mjs';
const status=document.getElementById('status');const button=document.getElementById('check');
const params=new URLSearchParams(window.location.search);
let saved={};try{saved=JSON.parse(sessionStorage.getItem('doceria-payment-pending') || '{}') || {};}catch{ /* Invalid cache grants no access. */ }
const paymentId=params.get('order_nsu') || saved.paymentId;
const returnLink=document.getElementById('return-menu');
if(returnLink)returnLink.href=customerMenuDestination(sessionStorage);
let credential=null;
try {credential=JSON.parse(sessionStorage.getItem('doceria-payment-return:'+paymentId) || 'null')?.token;} catch { /* A missing capability does not grant access. */ }
async function check() {
  button.disabled=true;
  try {
    if(!paymentId) throw new Error('Pedido não identificado. Consulte Minha Conta ou fale com a loja.');
    const r=await fetch(`${apiBaseUrl}/checkout/payment-status`,{method:'POST',headers:await paymentStatusHeaders(!!credential),body:JSON.stringify({paymentId,paymentReturnToken:credential,transaction_nsu:params.get('transaction_nsu'),slug:params.get('slug')}),signal:AbortSignal.timeout(20000)});
    const data=await r.json();if(!r.ok) throw new Error(data.message || 'Não foi possível consultar.');
    if(data.requiresReview) status.textContent='Seu pagamento ou pedido precisa de conferência pela loja. Não refaça o pagamento.';
    else if(data.payment_status==='EXPIRED') status.textContent='A reserva expirou. Não pague o link antigo. Se já pagou, consulte novamente ou fale com a loja.';
    else if(data.payment_status==='PAID') {status.textContent='Pagamento confirmado! Seu pedido foi enviado à loja.';sessionStorage.removeItem('doceria-payment-pending');button.hidden=true;}
    else if(data.payment_status==='REFUNDED') status.textContent='Estorno registrado e conciliado pela loja.';
    else if(data.payment_status==='CANCELLED') status.textContent='Pagamento cancelado. Não pague o link antigo.';
    else status.textContent=data.requiresReview?'Seu pedido precisa de uma conferência pela loja. Não refaça o pagamento.':'Aguardando confirmação do pagamento. Você pode consultar novamente em instantes.';
  } catch(e) {status.textContent=e.message;}
  finally {button.disabled=false;}
}
button.onclick=check;check();
