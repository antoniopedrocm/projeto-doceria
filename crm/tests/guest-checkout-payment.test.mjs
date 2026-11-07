import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {paymentSelection,syncPaymentChoices,resetPaymentChoice,PAYMENT_CHOICES} from '../public/checkout-payment-choice.mjs';
import {inspectGuestPaymentAttempt,completeCheckoutAttempt} from '../public/guest-payment-attempt.mjs';
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
 document.getElementById('guest-checkout-modal').classList.remove('hidden');
 window.guestCurrentLatLng={lat:-16,lng:-49};window.guestManualAddressLocationConfirmed=true;
 window.open=url=>whatsapp.push(url);
 const identity={mode:'guest',token:'a'.repeat(64),revision:1};
 let attemptCount=0;
 const env={window,document,AbortSignal,guestPaymentPreviewGeneration:0,console:{error(){}},sessionStorage:window.sessionStorage,
  guestNameInput:document.getElementById('guest-name'),guestPhoneInput:document.getElementById('guest-phone'),guestPaymentMethodSelect:select,
  sendWhatsappButton:document.getElementById('send-whatsapp-button'),paymentMethodSelect:document.getElementById('payment-method-select'),
  checkoutIdentity:{get:()=>({...identity}),isStrong:()=>false,ready:async()=>{}},CHECKOUT_MODES:{GUEST:'guest',PHONE:'legacy_phone'},
  paymentSelection,resetPaymentChoice,inspectGuestPaymentAttempt,completeCheckoutAttempt,isLinkedCustomer:()=>false,currentClient:null,pendingOrderDetails:{},storeIsOpenNow:true,storeAvailability:'OPEN',
  guestCheckoutModal:document.getElementById('guest-checkout-modal'),paymentModal:document.getElementById('payment-modal'),createInitialGuestAddressFlowState:()=>({currentStep:1,locationConfirmed:false,formData:{}}),
  cart:[{id:'fixture-product',nome:'Produto sintético',quantity:1,preco:10}],appliedCupom:null,STORE_ID:'ana-guimaraes-doceria-matriz',API_BASE_URL:'https://api.invalid',WHATSAPP_NUMBER:'fixture-only',
  ensureCheckoutNotBlocked(){},revalidateCheckoutBeforeFinalSubmit:async()=>{},getStoreAvailabilityMessage:()=>'',savedAddressFields:()=>({}),chargedFreight:()=>4,
  paymentAttempt:()=>{const key='doceria-payment-pending',prior=JSON.parse(window.sessionStorage.getItem(key)||'null');if(prior?.idempotencyKey)return prior.idempotencyKey;
   const idempotencyKey=attemptCount++?'new-purchase-'+attemptCount:'guest-pending-attempt-fixture';window.sessionStorage.setItem(key,JSON.stringify({idempotencyKey}));return idempotencyKey;},checkoutHeaders:async()=>({'Content-Type':'application/json'}),paymentStatusHeaders:async()=>({'Content-Type':'application/json'}),
  fetch:async(url,options)=>{posted.push({url,headers:options.headers,body:JSON.parse(options.body)});return env.respond();},
  respond:async()=>({ok:true,json:async()=>({ok:true,id:'b'.repeat(64),paymentId:'b'.repeat(64),paymentReturnToken:'e'.repeat(64),checkoutUrl:'https://buy.infinitepay.io/fixture',subtotal:10,desconto:0,total:14,valorFrete:4})}),
  redirectToPayment:(data,ready)=>{ready?.();redirects.push(data);},resetWhatsAppConsent(){},clearCheckoutBlockingIssue(){},retainAuthenticatedCustomer:()=>null,removeCupom(){},clearCheckoutState(){window.sessionStorage.removeItem('checkoutState_v1');},renderCart(){},
  confirmationModal:document.getElementById('confirmation-modal'),platformConfirmationModal:document.getElementById('platform-confirmation-modal'),
  mapCriticalCheckoutError:e=>e.message,setCheckoutBlockingIssue(){},showToast:m=>messages.push(m)};
 vm.createContext(env);
  vm.runInContext(method('function showGuestPendingPayment(','async function handlePlatformOrder()')+method('async function finalizeOrder(','function applyReorderCart('),env);
 const fill=()=>{for(const [id,value] of Object.entries(values))document.getElementById(id).value=value;window.guestCurrentLatLng={lat:-16,lng:-49};window.guestManualAddressLocationConfirmed=true;document.getElementById('guest-address-step3').classList.remove('hidden');document.getElementById('guest-checkout-modal').classList.remove('hidden');};
 return {dom,document,select,identity,env,posted,redirects,whatsapp,messages,fill,close:()=>dom.window.close()};
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
test('pedido online anterior reconhecido finaliza carrinho legado sem reenviar ou cancelar o pedido',async t=>{
 const f=fixture();t.after(f.close);const id='c'.repeat(64),storage=f.dom.window.sessionStorage;
 storage.setItem('doceria-payment-pending',JSON.stringify({idempotencyKey:'prior-attempt-fixture',paymentId:id}));
 storage.setItem('doceria-payment-return:'+id,JSON.stringify({token:'d'.repeat(64)}));
 f.select.value='AGREED_LATER';const requests=[];
 f.env.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return url.endsWith('/checkout/payment-status')
  ? {ok:true,json:async()=>({id,storeId:f.env.STORE_ID,payment_status:'PENDING'})}
  : {ok:false,status:409,json:async()=>({message:'O pedido já foi enviado com outros dados. Consulte o pedido existente.'})};};
 await f.env.handleGuestOrder();assert.equal(requests.filter(r=>r.url.includes('/checkout/confirmar')).length,0);
 assert.equal(requests.filter(r=>r.url.endsWith('/checkout/payment-status')).length,1);
 assert.equal(storage.getItem('doceria-payment-pending'),null);assert.equal(f.env.cart.length,0);
 assert.ok(f.messages.some(m=>m.includes('já foi registrado')));assert.equal(f.env.sendWhatsappButton.disabled,false);
 assert.equal(f.document.querySelector('[data-existing-payment]').getAttribute('href'),'/payment-return.html?order_nsu='+id);
});
test('conflito 409 tipado informa pedido existente sem transformar a tentativa em bloqueio permanente',async t=>{
 const f=fixture();t.after(f.close);let blocked=0;f.env.setCheckoutBlockingIssue=()=>{blocked++;};
 const prior=JSON.stringify({idempotencyKey:'response-lost-attempt-fixture'});f.dom.window.sessionStorage.setItem('doceria-payment-pending',prior);f.env.paymentAttempt=()=> 'response-lost-attempt-fixture';
 f.select.value='AGREED_LATER';f.env.respond=async()=>({ok:false,status:409,json:async()=>({message:'O pedido já foi enviado com outros dados. Consulte o pedido existente.',code:'CHECKOUT_ATTEMPT_CONFLICT'})});
 await f.env.handleGuestOrder();assert.equal(blocked,0);assert.equal(f.posted.length,1);
 assert.equal(f.document.getElementById('guest-pending-payment').classList.contains('hidden'),false);
 assert.ok(f.document.getElementById('guest-pending-payment-message').textContent.includes('As alterações não foram enviadas'));
 assert.equal(f.document.getElementById('guest-pending-payment-link').classList.contains('hidden'),true);
 assert.equal(f.env.sendWhatsappButton.disabled,false);
 assert.equal(f.dom.window.sessionStorage.getItem('doceria-payment-pending'),prior);
});
test('pedido anterior em Pagar Agora também é recuperado sem segunda confirmação do checkout',async t=>{
 const f=fixture();t.after(f.close);const id='c'.repeat(64),storage=f.dom.window.sessionStorage;
 const prior=JSON.stringify({idempotencyKey:'same-online-attempt-fixture',paymentId:id});storage.setItem('doceria-payment-pending',prior);
 storage.setItem('doceria-payment-return:'+id,JSON.stringify({token:'d'.repeat(64)}));f.env.paymentAttempt=()=> 'same-online-attempt-fixture';
 const requests=[];f.env.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>url.endsWith('/checkout/payment-status')?{id,storeId:f.env.STORE_ID,payment_status:'PENDING'}:{ok:true,id,paymentId:id,checkoutUrl:'https://buy.infinitepay.io/existing-fixture'}};};
 await f.env.handleGuestOrder();const confirmation=requests.filter(r=>r.url.includes('/checkout/confirmar'));
 assert.equal(confirmation.length,0);assert.equal(f.env.cart.length,0);
 assert.equal(f.redirects.length,0);assert.equal(storage.getItem('doceria-payment-pending'),null);assert.equal(f.whatsapp.length,0);
});
test('preview de Combinar mostra pendência sem Confirmar Pedido ou enviar novo pedido',async t=>{
 const f=fixture();t.after(f.close);const id='c'.repeat(64),storage=f.dom.window.sessionStorage;
 storage.setItem('doceria-payment-pending',JSON.stringify({idempotencyKey:'preview-attempt-fixture',paymentId:id}));
 storage.setItem('doceria-payment-return:'+id,JSON.stringify({token:'d'.repeat(64)}));f.select.value='AGREED_LATER';
 const requests=[];f.env.fetch=async url=>{requests.push(url);return {ok:true,json:async()=>({payment_status:'PENDING'})};};
 await f.env.previewGuestPayment();assert.deepEqual(requests,['https://api.invalid/checkout/payment-status']);
 assert.equal(f.document.getElementById('guest-pending-payment').classList.contains('hidden'),false);assert.equal(f.posted.length,0);assert.equal(f.redirects.length,0);
});
test('preview antigo não reaplica aviso depois de mudar para Pagar Agora',async t=>{
 const f=fixture();t.after(f.close);const id='c'.repeat(64),storage=f.dom.window.sessionStorage;
 storage.setItem('doceria-payment-pending',JSON.stringify({idempotencyKey:'preview-attempt-fixture',paymentId:id}));storage.setItem('doceria-payment-return:'+id,JSON.stringify({token:'d'.repeat(64)}));
 let finish;f.env.fetch=async()=>new Promise(resolve=>{finish=resolve;});f.select.value='AGREED_LATER';const stale=f.env.previewGuestPayment();
 while(!finish)await new Promise(resolve=>setImmediate(resolve));f.select.value='ONLINE_NOW';
 f.env.fetch=async()=>({ok:true,json:async()=>({id,storeId:f.env.STORE_ID,payment_status:'PENDING'})});await f.env.previewGuestPayment();
 finish({ok:true,json:async()=>({id,storeId:f.env.STORE_ID,payment_status:'PENDING'})});await stale;
 assert.equal(f.document.getElementById('guest-pending-payment').classList.contains('hidden'),true);assert.equal(f.posted.length,0);
});
test('confirmação online encerra formulário/carrinho antes de navegar e mantém consulta do pagamento',async t=>{
 const f=fixture();t.after(f.close);f.dom.window.sessionStorage.setItem('checkoutState_v1','draft fixture');
 await f.env.handleGuestOrder();
 assert.equal(f.posted.length,1);assert.equal(f.redirects.length,1);assert.equal(f.env.cart.length,0);
 assert.equal(f.env.guestCheckoutModal.classList.contains('hidden'),true);assert.equal(f.env.guestNameInput.value,'');
 assert.equal(f.dom.window.sessionStorage.getItem('doceria-payment-pending'),null);assert.equal(f.dom.window.sessionStorage.getItem('checkoutState_v1'),null);
 assert.equal(JSON.parse(f.dom.window.sessionStorage.getItem('doceria-payment-return:'+'b'.repeat(64))).token,'e'.repeat(64));
 await f.env.handleGuestOrder();assert.equal(f.posted.length,1);
});
test('nova compra após online começa limpa com chave nova e pode concluir Combinar normalmente',async t=>{
 const f=fixture();t.after(f.close);await f.env.handleGuestOrder();const firstKey=f.posted[0].body.idempotencyKey;
 f.env.cart=[{id:'new-product',nome:'Outra compra',preco:3,quantity:1}];f.fill();f.select.value='AGREED_LATER';
 f.env.respond=async()=>({ok:true,json:async()=>({ok:true,id:'f'.repeat(64),total:7,valorFrete:4,desconto:0})});
 await f.env.handleGuestOrder();assert.equal(f.posted.length,2);assert.notEqual(f.posted[1].body.idempotencyKey,firstKey);
 assert.equal(f.posted[1].body.pagamento.mode,'AGREED_LATER');assert.equal(f.redirects.length,1);assert.equal(f.env.cart.length,0);
 assert.equal(f.dom.window.sessionStorage.getItem('doceria-payment-pending'),null);assert.equal(f.env.confirmationModal.classList.contains('hidden'),false);
 await f.env.handleGuestOrder();assert.equal(f.posted.length,2);
});
test('resposta sem confirmação válida não limpa carrinho ou chave de retry',async t=>{
 const f=fixture();t.after(f.close);f.env.respond=async()=>({ok:true,json:async()=>({ok:false})});
 await f.env.handleGuestOrder();assert.equal(f.env.cart.length,1);assert.equal(f.redirects.length,0);
 assert.equal(JSON.parse(f.dom.window.sessionStorage.getItem('doceria-payment-pending')).idempotencyKey,f.posted[0].body.idempotencyKey);
});
test('finalização compartilhada preserva checkout autenticado e por telefone',async t=>{
 for(const mode of ['strong_auth','legacy_phone']){
  const f=fixture();t.after(f.close);f.identity.mode=mode;
  f.env.checkoutIdentity.isStrong=()=>mode==='strong_auth';f.env.isLinkedCustomer=()=>true;
  const client={id:'canonical-fixture',nome:'Cliente sintético'};f.env.currentClient=client;
  f.env.retainAuthenticatedCustomer=c=>mode==='strong_auth'?c:null;
  f.env.pendingOrderDetails={clienteId:client.id,clienteNome:client.nome,clienteEndereco:'Retirar na Loja',telefone:'62981005566'};
  Object.assign(f.env,{confirmOrderButton:f.document.getElementById('confirm-order-button'),paymentError:f.document.getElementById('payment-error')});
  syncPaymentChoices(f.env.paymentMethodSelect,true,true);f.env.paymentMethodSelect.value='ONLINE_NOW';
  vm.runInContext(method('async function handlePlatformOrder()','async function finalizeOrder('),f.env);
  await f.env.handlePlatformOrder();
  assert.equal(f.posted.length,1);assert.equal(f.posted[0].body.cliente.id,client.id);assert.equal(f.redirects.length,1);
  assert.equal(f.env.cart.length,0);assert.equal(f.dom.window.sessionStorage.getItem('doceria-payment-pending'),null);
  assert.equal(f.env.currentClient,mode==='strong_auth'?client:null);
 }
});
test('consulta de compatibilidade simultânea à confirmação finaliza uma vez sem erro tardio ou reenvio',async t=>{
 const f=fixture();t.after(f.close);const id='c'.repeat(64),storage=f.dom.window.sessionStorage,resolvers=[];
 storage.setItem('doceria-payment-pending',JSON.stringify({idempotencyKey:'legacy-parallel-fixture',paymentId:id}));
 storage.setItem('doceria-payment-return:'+id,JSON.stringify({token:'d'.repeat(64)}));f.select.value='AGREED_LATER';
 f.env.fetch=async()=>new Promise(resolve=>resolvers.push(resolve));
 const preview=f.env.previewGuestPayment(),submit=f.env.handleGuestOrder();
 while(resolvers.length<2)await new Promise(resolve=>setImmediate(resolve));
 const response=()=>({ok:true,json:async()=>({id,storeId:f.env.STORE_ID,payment_status:'PENDING'})});
 resolvers[0](response());await preview;resolvers[1](response());await submit;
 assert.equal(f.env.cart.length,0);assert.equal(storage.getItem('doceria-payment-pending'),null);
 assert.equal(f.posted.length,0);assert.equal(f.messages.filter(m=>m.includes('Não foi possível')).length,0);
 assert.equal(f.document.getElementById('guest-pending-payment').classList.contains('hidden'),true);
});
