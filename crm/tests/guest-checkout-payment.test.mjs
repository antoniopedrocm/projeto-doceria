import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {paymentSelection,syncPaymentChoices,resetPaymentChoice,PAYMENT_CHOICES} from '../public/checkout-payment-choice.mjs';
const {JSDOM}=createRequire(import.meta.url)('../node_modules/jsdom');
const html=fs.readFileSync(new URL('../public/cardapio.html',import.meta.url),'utf8');
const method=(from,to)=>html.slice(html.indexOf(from),html.indexOf(to,html.indexOf(from)));
function fixture() {
 const dom=new JSDOM(html,{url:'https://example.test/cardapio-matriz'}),{window}=dom,document=window.document;
 const select=document.getElementById('guest-payment-method'),posted=[],redirects=[],messages=[],whatsapp=[];
 syncPaymentChoices(select,true,true,'guest-v1');
 const values={'guest-name':'Visitante sintético','guest-phone':'62981005566','guest-address-street':'Rua sintética','guest-address-number':'10','guest-address-neighborhood':'Centro','guest-address-city':'Goiânia','guest-address-zip':'74000000','guest-address-nickname':'Endereço informado'};
 for(const [id,value] of Object.entries(values))document.getElementById(id).value=value;
 document.getElementById('guest-address-step3').classList.remove('hidden');
 window.guestCurrentLatLng={lat:-16,lng:-49};window.guestManualAddressLocationConfirmed=true;
 window.open=url=>whatsapp.push(url);
 const identity={mode:'guest',token:'a'.repeat(64),revision:1};
 const env={window,document,console:{error(){}},sessionStorage:window.sessionStorage,
  guestNameInput:document.getElementById('guest-name'),guestPhoneInput:document.getElementById('guest-phone'),guestPaymentMethodSelect:select,
  sendWhatsappButton:document.getElementById('send-whatsapp-button'),paymentMethodSelect:document.getElementById('payment-method-select'),
  checkoutIdentity:{get:()=>({...identity}),isStrong:()=>false,ready:async()=>{}},CHECKOUT_MODES:{GUEST:'guest',PHONE:'legacy_phone'},
  paymentSelection,resetPaymentChoice,isLinkedCustomer:()=>false,currentClient:null,pendingOrderDetails:{},storeIsOpenNow:true,storeAvailability:'OPEN',
  cart:[{id:'fixture-product',nome:'Produto sintético',quantity:1,preco:10}],appliedCupom:null,STORE_ID:'ana-guimaraes-doceria-matriz',API_BASE_URL:'https://api.invalid',WHATSAPP_NUMBER:'fixture-only',
  ensureCheckoutNotBlocked(){},revalidateCheckoutBeforeFinalSubmit:async()=>{},getStoreAvailabilityMessage:()=>'',savedAddressFields:()=>({}),chargedFreight:()=>4,
  paymentAttempt:()=> 'guest-pending-attempt-fixture',checkoutHeaders:async()=>({'Content-Type':'application/json'}),
  fetch:async(url,options)=>{posted.push({url,headers:options.headers,body:JSON.parse(options.body)});return env.respond();},
  respond:async()=>({ok:true,json:async()=>({ok:true,id:'b'.repeat(64),paymentId:'b'.repeat(64),checkoutUrl:'https://buy.infinitepay.io/fixture',subtotal:10,desconto:0,total:14,valorFrete:4})}),
  redirectToPayment:data=>redirects.push(data),resetWhatsAppConsent(){},clearCheckoutBlockingIssue(){},retainAuthenticatedCustomer:()=>null,removeCupom(){},clearCheckoutState(){},renderCart(){},
  confirmationModal:document.getElementById('confirmation-modal'),platformConfirmationModal:document.getElementById('platform-confirmation-modal'),
  mapCriticalCheckoutError:e=>e.message,setCheckoutBlockingIssue(){},showToast:m=>messages.push(m)};
 vm.createContext(env);
 vm.runInContext(method('async function handleGuestOrder()','async function handlePlatformOrder()')+method('async function finalizeOrder(','function applyReorderCart('),env);
 return {dom,document,select,identity,env,posted,redirects,whatsapp,messages,close:()=>dom.window.close()};
}
test('guest tem exatamente duas opções e helper independente do checkout autenticado; sem convite de login',t=>{
 const f=fixture();t.after(f.close);
 const modal=f.document.getElementById('guest-checkout-modal');assert.ok(modal);
 assert.deepEqual([...f.select.options].map(o=>o.textContent),['Pagar Agora — Pix ou Cartão','Combinar Pagamento']);
 assert.equal(f.select.value,'ONLINE_NOW');assert.equal(f.select.dataset.paymentChoices,'guest-v1');
 assert.equal(modal.querySelector('[data-checkout-strong-invitation]'),null);
 const startup=method('for(const container of [document.getElementById(\'payment-method-select\')]','syncCheckoutPayment();');
 assert.ok(startup);assert.equal(startup.includes("document.getElementById('guest-payment-method')"),false);
 const helper=f.document.getElementById('guest-payment-choice-help');assert.equal(helper.textContent,PAYMENT_CHOICES.ONLINE_NOW.helper);
 const authenticatedHelper=f.document.getElementById('payment-choice-help').textContent;
 f.select.value='AGREED_LATER';f.select.dispatchEvent(new f.dom.window.Event('change'));
 assert.equal(helper.textContent,PAYMENT_CHOICES.AGREED_LATER.helper);assert.equal(f.document.getElementById('payment-choice-help').textContent,authenticatedHelper);
 syncPaymentChoices(f.select,true,true,'guest-v1');assert.equal(f.select.value,'AGREED_LATER');resetPaymentChoice(f.select);assert.equal(f.select.value,'ONLINE_NOW');
});
test('handler real GUEST online envia os dados informados e redireciona sem WhatsApp antecipado',async t=>{
 const f=fixture();t.after(f.close);await f.env.handleGuestOrder();
 assert.equal(f.messages.length,0);assert.equal(f.posted.length,1);assert.equal(f.redirects.length,1);assert.equal(f.whatsapp.length,0);
 const request=f.posted[0];assert.equal(request.body.pagamento.mode,'ONLINE_NOW');assert.equal(request.body.pagamento.forma,'Online');
 assert.equal(request.body.cliente.id,null);assert.equal(request.body.cliente.nome,'Visitante sintético');assert.equal(request.body.cliente.telefone,'62981005566');
 assert.equal(request.body.checkoutIdentityToken,f.identity.token);assert.equal(request.body.lojaId,'ana-guimaraes-doceria-matriz');
 assert.equal(request.body.delivery.pickup,false);assert.equal(request.body.delivery.address.street,'Rua sintética');assert.equal(request.body.delivery.lat,-16);
 assert.equal(request.headers.Authorization,undefined);assert.equal(request.body.idempotencyKey,'guest-pending-attempt-fixture');
 assert.equal(f.env.sendWhatsappButton.disabled,false);
});
test('handler real GUEST combinar envia modo sem método falso e conserva mensagem WhatsApp após salvar',async t=>{
 const f=fixture();t.after(f.close);f.select.value='AGREED_LATER';f.document.getElementById('guest-whatsapp-consent').checked=true;
 await f.env.handleGuestOrder();assert.deepEqual(f.messages,[]);assert.equal(f.posted.length,1);
 assert.equal(f.posted[0].body.pagamento.mode,'AGREED_LATER');assert.equal(f.posted[0].body.pagamento.forma,'A combinar');assert.equal(f.posted[0].body.pagamento.paymentMethod,undefined);
 assert.equal(f.posted[0].body.whatsappConsent.accepted,true);assert.equal(f.redirects.length,0);assert.equal(f.whatsapp.length,1);
 assert.ok(decodeURIComponent(f.whatsapp[0]).includes('Pagamento: A combinar'));assert.equal(f.env.sendWhatsappButton.disabled,false);
});
test('duplo clique em voo envia uma vez; erro permite retry com a mesma tentativa',async t=>{
 const f=fixture();t.after(f.close);let finish;
 f.env.respond=()=>new Promise(resolve=>{finish=resolve;});const first=f.env.handleGuestOrder();
 while(!finish)await new Promise(resolve=>setImmediate(resolve));
 await f.env.handleGuestOrder();assert.equal(f.posted.length,1);assert.equal(f.env.sendWhatsappButton.disabled,true);
 finish({ok:false,json:async()=>({message:'Falha sintética de rede'})});await first;
 assert.equal(f.env.sendWhatsappButton.disabled,false);assert.ok(f.messages.includes('Falha sintética de rede'));
 f.env.respond=async()=>({ok:true,json:async()=>({ok:true,id:'b'.repeat(64),paymentId:'b'.repeat(64),checkoutUrl:'https://buy.infinitepay.io/fixture'})});
 await f.env.handleGuestOrder();assert.equal(f.posted.length,2);assert.equal(f.posted[0].body.idempotencyKey,f.posted[1].body.idempotencyKey);assert.equal(f.redirects.length,1);
});
test('online desabilitado ou endereço não confirmado não envia pedido; combinar continua selecionável',async t=>{
 const f=fixture();t.after(f.close);syncPaymentChoices(f.select,true,false,'guest-v1');
 await f.env.handleGuestOrder();assert.equal(f.posted.length,0);assert.ok(f.messages.some(m=>m.includes('online indisponível')));
 f.select.value='AGREED_LATER';f.env.window.guestManualAddressLocationConfirmed=false;await f.env.handleGuestOrder();assert.equal(f.posted.length,0);
 f.env.window.guestManualAddressLocationConfirmed=true;await f.env.handleGuestOrder();assert.equal(f.posted.length,1);
});
test('mudança do contexto visitante para outra identidade não herda Customer/endereços nem envia',async t=>{
 const f=fixture();t.after(f.close);f.identity.mode='legacy_phone';await f.env.handleGuestOrder();assert.equal(f.posted.length,0);assert.ok(f.messages.includes('Selecione novamente como continuar.'));
});
