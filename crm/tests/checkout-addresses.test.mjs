import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {renderCheckoutAddresses as createAddressCards,savedAddressFields,appendCheckoutAddress} from '../public/checkout-addresses.mjs';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const source=fs.readFileSync(new URL('../public/cardapio.html',import.meta.url),'utf8');
const saved={id:'addr_saved',nickname:'Casa',summary:'Av. ••, nº •• · Bueno',saved:true};
test('cards compactos: padrão primeiro, seleção por registro, sem excluir privados e sem HTML injetado',()=>{
  const dom=new JSDOM('<main></main>');let selection;
  const items=[saved,{...saved,id:'default-id',nickname:'Trabalho',isDefault:true},{...saved,id:'third',summary:'<script>unsafe</script>'}];
  const cards=createAddressCards({document:dom.window.document,addresses:items,weak:true,onSelect:(text,address)=>{selection=address;},onDelete:()=>assert.fail('private delete')});
  dom.window.document.querySelector('main').append(...cards);
  assert.match(cards[0].textContent,/TrabalhoPadrão/);assert.equal(cards[0].querySelectorAll('button').length,1);
  assert.equal(cards[0].classList.contains('p-3'),true);assert.equal(cards[0].classList.contains('mb-2'),true);
  cards[1].querySelector('button').click();assert.equal(selection,saved);
  assert.equal(dom.window.document.querySelector('script'),null);
  assert.equal(createAddressCards({document:dom.window.document,onSelect:()=>{}}).length,0);dom.window.close();
});
test('strong preserva descrição; novo endereço weak atualiza lista/padrão em memória sem editar cadastro privado',()=>{
  const dom=new JSDOM();const original=[{...saved,isDefault:true}];
  const next=appendCheckoutAddress(original,{nickname:'Trabalho',isDefault:true,enderecoCompleto:'Rua informada, 123'});
  assert.equal(original[0].isDefault,true);assert.equal(next[0].isDefault,false);
  const weak=createAddressCards({document:dom.window.document,addresses:next,weak:true,onSelect:()=>{}});
  assert.match(weak[0].textContent,/TrabalhoPadrão/);assert.doesNotMatch(weak[0].textContent,/Rua informada|123/);
  const strong=createAddressCards({document:dom.window.document,addresses:[{id:'real',nickname:'Casa',enderecoCompleto:'Rua completa 42'}],onSelect:()=>{}});
  assert.match(strong[0].textContent,/Rua completa 42/);dom.window.close();
});

test('apelido personalizado é preservado nos cards weak/strong/default e não vira Endereço N',()=>{
  const dom=new JSDOM();
  for(const weak of [true,false])for(const isSaved of [true,false]) {
    const address={...saved,nickname:'Casa da minha Mãe',saved:isSaved,isDefault:true,enderecoCompleto:'Descrição autorizada'};let selected;
    const [card]=createAddressCards({document:dom.window.document,addresses:[address],weak,onSelect:(_,value)=>{selected=value;}});
    assert.equal(card.querySelector('strong').textContent,'Casa da minha Mãe');assert.match(card.textContent,/Padrão/);
    card.querySelector('button').click();assert.equal(selected,address);assert.equal(address.nickname,'Casa da minha Mãe');
  }
  dom.window.close();
});

test('fallback só com apelido ausente/inválido e texto do apelido nunca injeta HTML',()=>{
  const dom=new JSDOM();
  for(const nickname of [undefined,null,3,'  ','x'.repeat(61),'Casa\nprivada']){
    const [card]=createAddressCards({document:dom.window.document,addresses:[{...saved,nickname}],weak:true,onSelect:()=>{}});assert.equal(card.querySelector('strong').textContent,'Endereço 1');
  }
  const nickname='<img src=x onerror=alert(1)>';
  const [card]=createAddressCards({document:dom.window.document,addresses:[{...saved,nickname}],weak:true,onSelect:()=>{}});assert.equal(card.querySelector('strong').textContent,nickname);assert.equal(card.querySelector('img'),null);dom.window.close();
});
function harness(page=source) {
  const dom=new JSDOM('<div id="address-list"></div><button id="edit-profile-btn"></button><div id="new-address-section"></div><div id="show-new-address-wrapper"></div><button id="show-new-address-btn"></button><div id="modal"></div><div id="payment" class="hidden"></div>');
  let identity={mode:'legacy_phone',token:'token',revision:2};const requests=[],snapshots=[];
  const c={document:dom.window.document,window:{},publicStore:{pickup:{enabled:true},delivery:{available:true}},
    CHECKOUT_MODES:{PHONE:'legacy_phone',GUEST:'guest'},checkoutIdentity:{get:()=>identity},renderCheckoutAddresses:createAddressCards,
    currentClient:{id:'opaque',nome:'Cliente',telefone:'fixture',enderecos:[saved]},pendingOrderDetails:{},
    API_BASE_URL:'http://local',STORE_ID:'loja-futura-teste',syncCheckoutPayment:()=>{},
    addressList:dom.window.document.getElementById('address-list'),confirmCustomerName:{},selectedAddressText:{},
    addressManagementModal:dom.window.document.getElementById('modal'),paymentModal:dom.window.document.getElementById('payment'),
    clearCheckoutBlockingIssue:()=>{},updateAllSummaries:()=>{},showToast:()=>{},persistCheckoutState:()=>snapshots.push(JSON.stringify(c.pendingOrderDetails)),
    fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({valorFrete:4,distanciaKm:2})};}};
  vm.createContext(c);
  vm.runInContext(page.slice(page.indexOf('function openAddressManagementModal(client)'),page.indexOf('async function deleteAddress')),c);
  c.deleteAddress=()=>{};
  vm.runInContext(page.slice(page.indexOf('function usePickupAddress()'),page.indexOf('function getTodayIsoDate()')),c);
  return {c,requests,snapshots,dom,setIdentity:v=>{identity=v;}};
}
test('lookup real recebe e abre os resumos automaticamente, sem sobrescrever lista com vazio',async()=>{
  for(const page of [source]) {
    const h=harness(page),document=h.dom.window.document;
    Object.assign(h.c,{app:{},getFunctions:()=>({}),httpsCallable:()=>async()=>({data:{found:true,clientId:'opaque',
      checkoutIdentity:{mode:'legacy_phone',token:'token',revision:3},client:{nome:'Cliente',enderecos:[saved]}}}),
    phoneInput:{value:'62985550001'},phoneError:document.createElement('div'),searchPhoneButton:document.createElement('button'),phoneLoginModal:document.createElement('div'),console});
    h.c.checkoutIdentity.ready=async()=>{};h.c.checkoutIdentity.acceptPhone=h.setIdentity;
    vm.runInContext(page.slice(page.indexOf('async function handlePhoneSearch()'),page.indexOf('function chargedFreight(')),h.c);
    await h.c.handlePhoneSearch();
    assert.equal(document.querySelectorAll('.use-address-btn').length,1);
    assert.equal(h.c.currentClient.enderecos.length,1);h.dom.window.close();
  }
});
test('lookup → modal mostra endereço automaticamente; GUEST não herda lista, retirada permanece',()=>{
  const h=harness();h.c.openAddressManagementModal(h.c.currentClient);
  assert.match(h.dom.window.document.body.textContent,/Casa|Selecionar Retirada/);
  assert.equal(h.dom.window.document.querySelectorAll('.use-address-btn').length,1);
  h.setIdentity({mode:'guest',revision:3});h.c.openAddressManagementModal(h.c.currentClient);
  assert.equal(h.dom.window.document.querySelectorAll('.use-address-btn').length,0);
  assert.ok(h.dom.window.document.querySelector('.use-pickup-btn'));h.dom.window.close();
});
test('seleção e reabertura/refresh transportam apenas referência e revisão; pickup limpa referência',async()=>{
  const h=harness();await h.c.useExistingAddress(saved.summary,saved);
  assert.equal(h.requests[0].checkoutAddressId,saved.id);assert.equal(h.requests[0].checkoutAddressRevision,2);
  assert.equal(h.requests[0].clienteEndereco,undefined);assert.equal(h.c.window.valorFrete,4);
  const restored=JSON.parse(h.snapshots[0]);assert.deepEqual(savedAddressFields(restored),{checkoutAddressId:saved.id,checkoutAddressRevision:2});
  assert.equal(restored.address,undefined);assert.equal(h.c.window.currentLatLng,null);
  h.c.usePickupAddress();assert.deepEqual(savedAddressFields(h.c.pendingOrderDetails),{});assert.equal(h.c.window.valorFrete,0);
  h.dom.window.close();
});
test('resposta tardia após guest/troca de cliente ou retirada não aplica endereço antigo',async()=>{
  const h=harness();let resolve;h.c.fetch=()=>new Promise(r=>{resolve=r;});
  const pending=h.c.useExistingAddress(saved.summary,saved);
  h.setIdentity({mode:'guest',token:'token',revision:3});h.c.usePickupAddress();
  resolve({ok:true,json:async()=>({valorFrete:8})});await pending;
  assert.equal(h.c.pendingOrderDetails.clienteEndereco,'Retirar na Loja');assert.equal(h.c.window.valorFrete,0);h.dom.window.close();
});
