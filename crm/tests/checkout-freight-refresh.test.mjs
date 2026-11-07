import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const {JSDOM}=createRequire(import.meta.url)('../node_modules/jsdom');
const html=fs.readFileSync(new URL('../public/cardapio.html',import.meta.url),'utf8');
const part=(from,to)=>{const start=html.indexOf(from);assert.ok(start>=0,from);return html.slice(start,html.indexOf(to,start));};
function fixture(t) {
 const dom=new JSDOM(html,{url:'https://example.test/cardapio-matriz'});t.after(()=>dom.window.close());
 const {window}=dom,document=window.document,storage=window.sessionStorage;
 const state={mode:'guest',revision:1};
 const env={window,document,sessionStorage:storage,Number,console:{warn(){},error(){}},
  CHECKOUT_STORAGE_KEY:'checkoutState_v1',STORE_ID:'fixture-store',cartHydrated:true,preservedCartStoreId:null,
  cart:[{id:'fixture-product',nome:'Produto sintético',preco:1,quantity:1}],reorderOwnerUid:null,
  currentClient:null,allProducts:[],pendingOrderDetails:{},appliedCupom:null,addressStep:1,
  createInitialGuestAddressFlowState:()=>({currentStep:1,locationConfirmed:false,formData:{}}),
  getAuth:()=>({currentUser:null}),app:{},selectedAddressText:document.createElement('span'),
  checkoutIdentity:{get:()=>({...state}),select:async mode=>{state.mode=mode;state.revision++;}},
  syncCheckoutPayment(){},showToast(){},clearCheckoutBlockingIssue(){},setCheckoutBlockingIssue(){},
  cartCount:document.getElementById('cart-count'),cartSubtotal:document.getElementById('cart-subtotal'),cartTotal:document.getElementById('cart-total'),
  cartDiscount:document.getElementById('cart-discount'),cartDiscountLine:document.getElementById('discount-line'),
  cartShipping:document.getElementById('cart-shipping'),cartShippingLine:document.getElementById('shipping-line'),
  renderCart(){env.updateCartInfo();},updateAllSummaries(){env.updateCartInfo();env.updateGuestSummary();},
  showGuestMapWarning(){},syncGuestAddressFlowState(){},normalizeGuestLatLng:coords=>coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)?{...coords}:null};
 vm.createContext(env);
 vm.runInContext(part('const invalidateCheckoutFreight =','function persistCheckoutState(')+';globalThis.invalidateCheckoutFreight=invalidateCheckoutFreight;globalThis.applyCheckoutFreight=applyCheckoutFreight;',env);
 vm.runInContext(part('function persistCheckoutState(','window.persistCheckoutState = persistCheckoutState;'),env);
 vm.runInContext(part('function chargedFreight(','function updateAllSummaries('),env);
 vm.runInContext(part('function updateCartInfo()','// Funções de Navegação'),env);
 vm.runInContext(part('function updateGuestSummary()','window.updateGuestSummary = updateGuestSummary;'),env);
 vm.runInContext(part('async function updateGuestShippingAndSummary(','function fillGuestAddressFields('),env);
 vm.runInContext(part('async function selectWeakCheckout(','const CHECKOUT_STORAGE_KEY'),env);
 Object.assign(window,{persistCheckoutState:env.persistCheckoutState,updateGuestSummary:env.updateGuestSummary,
  updateAllSummaries:env.updateAllSummaries,showToast(){},clearCheckoutBlockingIssue(){},setCheckoutBlockingIssue(){},
  freightQuoteState:'UNQUOTED',guestFreightGeneration:0,valorFrete:0,freteACombinar:false,
  guestCurrentLatLng:{lat:-16,lng:-49},guestManualAddressLocationConfirmed:true,
  guestAddressFlowState:{currentStep:3,locationConfirmed:true,formData:{street:'Rua sintética'}},
  calcularFreteParaEndereco:async()=>({valorFrete:4,distanciaKm:2})});
 return {env,window,document,storage,state};
}
test('refresh ignora cotação antiga, preservando carrinho/endereço e chave idempotente',t=>{
 const f=fixture(t),key=JSON.stringify({idempotencyKey:'same-fixture-key'});
 f.storage.setItem('doceria-payment-pending',key);
 f.storage.setItem('checkoutState_v1',JSON.stringify({storeId:'fixture-store',cart:f.env.cart,
  guestCurrentLatLng:{lat:-16,lng:-49},guestManualAddressLocationConfirmed:true,
  guestAddressFlowState:{currentStep:3,locationConfirmed:true,formData:{street:'Rua sintética'}},valorFrete:11.48,distanciaFreteKm:8}));
 f.env.restoreCheckoutState();
 assert.equal(f.window.valorFrete,0);assert.equal(f.window.distanciaFreteKm,null);
 assert.equal(f.env.cart.length,1);assert.equal(f.window.guestAddressFlowState.formData.street,'Rua sintética');
 assert.equal(f.storage.getItem('doceria-payment-pending'),key);
 assert.doesNotMatch(f.document.getElementById('cart-total').textContent,/12\.48/);
 assert.match(f.document.getElementById('cart-shipping').textContent,/calcular/i);
});
test('persistência preserva rascunho, nunca cotação numérica nem distância calculada',t=>{
 const f=fixture(t);f.window.valorFrete=11.48;f.window.distanciaFreteKm=8;f.env.persistCheckoutState();
 const saved=JSON.parse(f.storage.getItem('checkoutState_v1'));
 assert.equal(saved.valorFrete,undefined);assert.equal(saved.distanciaFreteKm,undefined);
 assert.equal(saved.cart.length,1);assert.equal(saved.guestAddressFlowState.formData.street,'Rua sintética');
});
test('selecionar visitante invalida o frete compartilhado de checkout anterior',async t=>{
 const f=fixture(t);f.window.valorFrete=11.48;f.window.freightQuoteState='READY';
 await f.env.selectWeakCheckout('guest');f.env.updateAllSummaries();
 assert.equal(f.window.valorFrete,0);assert.equal(f.window.freightQuoteState,'UNQUOTED');
 assert.match(f.document.getElementById('guest-total').textContent,/frete/i);
});
test('nova cotação mostra Calculando sem somar frete antigo, depois aplica resposta atual',async t=>{
 const f=fixture(t);let resolve;f.window.calcularFreteParaEndereco=()=>new Promise(r=>{resolve=r;});
 f.window.valorFrete=11.48;f.window.freightQuoteState='READY';
 const pending=f.env.updateGuestShippingAndSummary({lat:-16,lng:-49});
 assert.equal(f.window.valorFrete,0);assert.match(f.document.getElementById('guest-shipping').textContent,/Calculando/);
 assert.doesNotMatch(f.document.getElementById('guest-total').textContent,/12\.48/);
 resolve({valorFrete:4,distanciaKm:2});await pending;
 assert.equal(f.window.valorFrete,4);assert.equal(f.window.freightQuoteState,'READY');
 assert.match(f.document.getElementById('guest-shipping').textContent,/4\.00/);
});
test('resposta atrasada de endereço anterior não substitui o frete do endereço novo',async t=>{
 const f=fixture(t),requests=[];f.window.calcularFreteParaEndereco=()=>new Promise(resolve=>requests.push(resolve));
 const a=f.env.updateGuestShippingAndSummary({lat:-16,lng:-49}),b=f.env.updateGuestShippingAndSummary({lat:-17,lng:-48});
 requests[1]({valorFrete:8,distanciaKm:3});await b;
 requests[0]({valorFrete:11.48,distanciaKm:8});await a;
 assert.equal(f.window.valorFrete,8);assert.equal(f.window.distanciaFreteKm,3);
});
test('mudança de contexto invalida resposta de frete que estava em andamento',async t=>{
 const f=fixture(t);let resolve;f.window.calcularFreteParaEndereco=()=>new Promise(r=>{resolve=r;});
 const pending=f.env.updateGuestShippingAndSummary({lat:-16,lng:-49});
 await f.env.selectWeakCheckout('legacy_phone');resolve({valorFrete:11.48});await pending;
 assert.equal(f.window.valorFrete,0);assert.notEqual(f.window.freightQuoteState,'READY');
});
test('falha/valor inválido não vira frete grátis confirmado nem restaura valor anterior',async t=>{
 for(const response of [{valorFrete:null},{valorFrete:-1},{valorFrete:'4'},new Error('network fixture')]){
  const f=fixture(t);f.window.valorFrete=11.48;
  f.window.calcularFreteParaEndereco=async()=>{if(response instanceof Error)throw response;return response;};
  await f.env.updateGuestShippingAndSummary({lat:-16,lng:-49});
  assert.equal(f.window.valorFrete,0);assert.equal(f.window.freightQuoteState,'ERROR');
  assert.match(f.document.getElementById('guest-shipping').textContent,/calcular|validar|confirmar/i);
  assert.match(f.document.getElementById('guest-total').textContent,/frete/i);
 }
});
test('editar rua/CEP invalida cotação; apelido e dados pessoais não invalidam preço',t=>{
 const f=fixture(t);
 vm.runInContext(part('// Editing delivery fields invalidates the price','const guestNoNumberCheckbox'),f.env);
 f.env.applyCheckoutFreight({valorFrete:4});
 f.document.getElementById('guest-address-nickname').dispatchEvent(new f.window.Event('input'));
 assert.equal(f.window.valorFrete,4);assert.equal(f.window.guestManualAddressLocationConfirmed,true);
 for(const field of ['guest-address-street','guest-address-zip']){
  f.env.applyCheckoutFreight({valorFrete:4});f.window.guestManualAddressLocationConfirmed=true;
  f.document.getElementById(field).dispatchEvent(new f.window.Event('input'));
  assert.equal(f.window.valorFrete,0);assert.equal(f.window.guestManualAddressLocationConfirmed,false);
 }
});
test('falha atrasada não apaga cotação nova e frete zero legítimo continua válido',async t=>{
 const f=fixture(t),requests=[];f.window.calcularFreteParaEndereco=()=>new Promise((resolve,reject)=>requests.push({resolve,reject}));
 const a=f.env.updateGuestShippingAndSummary({lat:-16,lng:-49}),b=f.env.updateGuestShippingAndSummary({lat:-17,lng:-48});
 requests[1].resolve({valorFrete:0,distanciaKm:0});await b;
 requests[0].reject(new Error('late fixture'));await a;
 assert.equal(f.window.freightQuoteState,'READY');assert.equal(f.window.valorFrete,0);
 assert.equal(f.document.getElementById('guest-shipping').textContent,'R$ 0,00');
 assert.doesNotMatch(f.document.getElementById('guest-total').textContent,/\+ frete/);
});
test('retomar endereço confirmado recalcula uma vez, sem mapa oculto sobrescrever o resumo',async t=>{
 const f=fixture(t);let quoted=0,maps=0;
 f.window.calcularFreteParaEndereco=async()=>{quoted++;return {valorFrete:5};};
 Object.assign(f.env,{applyGuestAddressFormData(){},initGuestAddressStep1Search:async()=>{},
  showGuestAddressStep(){},clearGuestMapWarning(){},showGuestMapWarning(){}});
 f.window.initGuestAddressMap=async()=>{maps++;};
 f.window.updateGuestShippingAndSummary=f.env.updateGuestShippingAndSummary;
 vm.runInContext(part('window.initGuestAddressFlow = async function()','// Editing delivery fields invalidates the price'),f.env);
 await f.window.initGuestAddressFlow();
 assert.equal(quoted,1);assert.equal(maps,0);assert.equal(f.window.valorFrete,5);
});
test('callback de mapa oculto após confirmação não altera endereço ou cotação',t=>{
 const f=fixture(t);let callback,filled=0;
 Object.assign(f.env,{guestGeocoder:{geocode:(_,fn)=>{callback=fn;}},fillGuestAddressFields:()=>{filled++;}});
 vm.runInContext(part('function reverseGeocodeGuest(','async function initGuestAddressStep1Search('),f.env);
 f.env.reverseGeocodeGuest({lat:-16,lng:-49});
 f.window.guestAddressStep=3;f.env.applyCheckoutFreight({valorFrete:5});
 callback([{formatted_address:'fixture'}],'OK');
 assert.equal(filled,0);assert.equal(f.window.valorFrete,5);assert.equal(f.window.guestManualAddressLocationConfirmed,true);
});
test('checkout da outra loja não restaura carrinho/endereço/cotação da loja anterior',t=>{
 const f=fixture(t);f.storage.setItem('checkoutState_v1',JSON.stringify({storeId:'other-store',cart:[{id:'other-product',preco:5,quantity:1}],valorFrete:11.48}));
 f.env.restoreCheckoutState();
 assert.equal(f.env.preservedCartStoreId,'other-store');assert.equal(f.env.cart[0].id,'fixture-product');assert.equal(f.window.valorFrete,0);
 assert.equal(JSON.parse(f.storage.getItem('checkoutState_v1')).storeId,'other-store');
});
test('revalidação antes da confirmação não aplica resposta de endereço já alterado',async t=>{
 const f=fixture(t);let resolve;
 Object.assign(f.env,{ensureCheckoutNotBlocked(){},API_BASE_URL:'http://fixture.invalid',savedAddressFields:()=>({}),
  fetch:()=>new Promise(r=>{resolve=r;}),revalidateCartProductsBeforeSubmit:async()=>{}});
 vm.runInContext(part('async function revalidateCheckoutBeforeFinalSubmit(','const invalidateCheckoutFreight ='),f.env);
 const pending=f.env.revalidateCheckoutBeforeFinalSubmit({clienteEndereco:'Endereço sintético'});
 f.env.invalidateCheckoutFreight();resolve({ok:true,json:async()=>({valorFrete:11.48})});
 await assert.rejects(pending,/endereço mudou/);assert.equal(f.window.valorFrete,0);
});
test('geocodificação atrasada não invalida cálculo iniciado ao confirmar o local',async t=>{
 const f=fixture(t);let callback,resolve,filled=0;
 Object.assign(f.env,{guestGeocoder:{geocode:(_,fn)=>{callback=fn;}},fillGuestAddressFields:()=>{filled++;}});
 vm.runInContext(part('function reverseGeocodeGuest(','async function initGuestAddressStep1Search('),f.env);
 f.window.guestAddressStep=2;f.env.reverseGeocodeGuest({lat:-16,lng:-49});
 f.window.calcularFreteParaEndereco=()=>new Promise(r=>{resolve=r;});
 const pending=f.env.updateGuestShippingAndSummary({lat:-16,lng:-49});
 callback([{formatted_address:'fixture'}],'OK');resolve({valorFrete:4});await pending;
 assert.equal(filled,0);assert.equal(f.window.valorFrete,4);assert.equal(f.window.freightQuoteState,'READY');
});
test('somente a resposta de geocodificação mais recente pode atualizar o local',t=>{
 const f=fixture(t),callbacks=[];let filled=0;
 Object.assign(f.env,{guestGeocoder:{geocode:(_,fn)=>callbacks.push(fn)},fillGuestAddressFields:()=>{filled++;}});
 vm.runInContext(part('function reverseGeocodeGuest(','async function initGuestAddressStep1Search('),f.env);
 f.window.guestAddressStep=2;
 f.env.reverseGeocodeGuest({lat:-16,lng:-49});f.env.reverseGeocodeGuest({lat:-17,lng:-48});
 callbacks[1]([{}],'OK');callbacks[0]([{}],'OK');
 assert.equal(filled,1);assert.equal(f.window.guestCurrentLatLng.lat,-17);
});
test('conclusão/limpeza do rascunho retira frete sem apagar a prova da tentativa',t=>{
 const f=fixture(t);f.env.applyCheckoutFreight({valorFrete:11.48});f.env.persistCheckoutState();
 f.storage.setItem('doceria-payment-pending',JSON.stringify({idempotencyKey:'preserved-fixture'}));
 f.env.clearCheckoutState();f.env.updateAllSummaries();
 assert.equal(f.window.valorFrete,0);assert.equal(f.window.freightQuoteState,'UNQUOTED');
 assert.equal(f.storage.getItem('checkoutState_v1'),null);assert.notEqual(f.storage.getItem('doceria-payment-pending'),null);
 assert.match(f.document.getElementById('cart-shipping').textContent,/calcular/i);
});
test('recompra inicia carrinho sem herdar cotação READY do pedido anterior',t=>{
 const f=fixture(t);f.env.applyCheckoutFreight({valorFrete:11.48});f.window.addressFlowState={};
 Object.assign(f.env,{checkoutBlockingIssue:null,resetWhatsAppConsent(){},paymentMethodSelect:null,guestPaymentMethodSelect:null,
  paymentCupomInput:null,paymentCupomMessage:null,paymentError:null,paymentVerifyCupomButton:null});
 vm.runInContext(part('function applyReorderCart(','const reorderCart='),f.env);
 f.env.applyReorderCart({items:[{id:'new-fixture',nome:'Novo item sintético',preco:3,quantity:1}],products:[],uid:null});
 assert.equal(f.window.valorFrete,0);assert.equal(f.window.freightQuoteState,'UNQUOTED');assert.equal(f.env.cart[0].id,'new-fixture');
 assert.equal(f.document.getElementById('cart-total').textContent,'R$ 3.00 + frete');
});
