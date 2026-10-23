import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {storeMenuUrl,createStoredCartBridge,prepareReorder} from '../public/reorder-cart.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
globalThis.location={hostname:'127.0.0.1'};
const {bootstrapPublicStore,fetchPublicStore}=await import('../public/store-public-config.mjs');
test('nova loja navega genericamente, rejeita path inválido e mantém carrinho isolado',()=>{
  assert.equal(storeMenuUrl('loja-futura-teste'),'/cardapio?store=loja-futura-teste');assert.equal(storeMenuUrl('../private'),null);
  const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  let url;createStoredCartBridge({storage,navigate:value=>{url=value;}}).apply({storeId:'loja-futura-teste',items:[{id:'p',preco:7,quantity:1}],uid:'a'});
  assert.equal(url,storeMenuUrl('loja-futura-teste'));assert.equal(JSON.parse(values.get('checkoutState_v1')).storeId,'loja-futura-teste');
  assert.throws(()=>prepareReorder({order:{storeId:'loja-futura-teste',itens:[]},cart:{storeId:'outra',items:[{}]},mode:'add'}),/misturar lojas/);
});
test('bootstrap genérico e alias usam o mesmo endpoint público sem login ou Firestore',async()=>{
  const calls=[],config={storeId:'loja-futura-teste',name:'Loja futura',active:true,catalog:{enabled:true},delivery:{available:false}};
  for(const pathname of ['/cardapio','/cardapio-festa']) {
    const dom=new JSDOM('<header></header><div id="loading-message"></div>');
    const result=await bootstrapPublicStore({location:{pathname,search:pathname==='/cardapio'?'?store=loja-futura-teste':''},document:dom.window.document,fetchImpl:async url=>{calls.push(url);return {ok:true,json:async()=>config};}});
    assert.equal(result.storeId,config.storeId);assert.ok(dom.window.document.querySelector('header').textContent.includes('Loja futura'));dom.window.close();
  }
  assert.match(calls[0],/storeId=loja-futura-teste/);assert.match(calls[1],/alias=cardapio-festa/);
});
test('loja inexistente/inativa exibe estado seguro, sem redirecionar ou buscar Matriz',async()=>{
  const dom=new JSDOM('<header></header><div id="loading-message"></div>');let calls=0;
  const result=await bootstrapPublicStore({location:{pathname:'/cardapio',search:'?store=missing'},document:dom.window.document,fetchImpl:async()=>{calls++;return {ok:false,json:async()=>({code:'STORE_NOT_FOUND'})};}});
  assert.equal(result,null);assert.equal(calls,1);assert.match(dom.window.document.body.textContent,/Loja não encontrada/);
  await assert.rejects(fetchPublicStore({storeId:'inactive'},{fetchImpl:async()=>({ok:false,json:async()=>({code:'STORE_INACTIVE'})})}));dom.window.close();
});
test('template único e aliases de compatibilidade têm os mesmos bytes e nenhum storeId fixo',()=>{
  const source=fs.readFileSync(new URL('../public/cardapio.html',import.meta.url),'utf8');
  for(const alias of ['matriz','garavelo','festa']) assert.equal(fs.readFileSync(new URL(`../public/cardapio-${alias}.html`,import.meta.url),'utf8'),source);
  assert.doesNotMatch(source,/ana-guimaraes-doceria-(matriz|garavelo)|info', 'dados|carregarConfiguracoesFrete/);
  assert.equal(fs.readFileSync(new URL('../public/store-links.mjs',import.meta.url),'utf8'),fs.readFileSync(new URL('../src/storefront/storeRoutes.mjs',import.meta.url),'utf8'));
});
test('sem frete mostra retirada e esconde seleção de entrega no modal real',()=>{
  const html=fs.readFileSync(new URL('../public/cardapio.html',import.meta.url),'utf8');
  const start=html.indexOf('function openAddressManagementModal(client)'),end=html.indexOf('async function deleteAddress',start);
  const dom=new JSDOM('<button id="edit-profile-btn"></button><div id="address-list"></div><div id="new-address-section"></div><div id="show-new-address-wrapper"></div><button id="show-new-address-btn"></button><div id="modal"></div>');
  const document=dom.window.document,context={document,window:{},publicStore:{pickup:{enabled:true},delivery:{available:false}},
    checkoutIdentity:{get:()=>({mode:'guest'})},CHECKOUT_MODES:{PHONE:'legacy_phone'},syncCheckoutPayment:()=>{},
    addressList:document.getElementById('address-list'),confirmCustomerName:{},addressManagementModal:document.getElementById('modal'),usePickupAddress:()=>{}};
  vm.runInNewContext(html.slice(start,end),context);context.openAddressManagementModal({nome:'Fixture',enderecos:[]});
  assert.equal(document.querySelector('.use-pickup-btn').parentElement.hidden,false);
  assert.equal(document.getElementById('show-new-address-wrapper').hidden,true);assert.match(document.body.textContent,/Entrega indisponível/);dom.window.close();
});

test('modo celular oculta Editar Perfil mesmo com display flex; modo forte restaura controle',()=>{
  const html=fs.readFileSync(new URL('../public/cardapio.html',import.meta.url),'utf8');
  const start=html.indexOf('function openAddressManagementModal(client)'),end=html.indexOf('async function deleteAddress',start);
  const dom=new JSDOM('<style>.flex{display:flex}.hidden{display:none}</style><button id="edit-profile-btn" class="flex">Editar Perfil</button><div id="address-list"></div><div id="new-address-section"></div><div id="show-new-address-wrapper"></div><button id="show-new-address-btn"></button><div id="modal"></div>');
  let mode='legacy_phone';
  const document=dom.window.document,context={document,window:{},publicStore:{pickup:{enabled:true},delivery:{available:false}},
    checkoutIdentity:{get:()=>({mode})},CHECKOUT_MODES:{PHONE:'legacy_phone'},syncCheckoutPayment:()=>{},
    addressList:document.getElementById('address-list'),confirmCustomerName:{},addressManagementModal:document.getElementById('modal'),usePickupAddress:()=>{}};
  vm.runInNewContext(html.slice(start,end),context);
  try {
    const button=document.getElementById('edit-profile-btn');
    context.openAddressManagementModal({nome:'Fixture',enderecos:[]});
    assert.equal(dom.window.getComputedStyle(button).display,'none');
    mode='strong_auth';context.openAddressManagementModal({nome:'Fixture',enderecos:[]});
    assert.equal(button.hidden,false);assert.equal(dom.window.getComputedStyle(button).display,'flex');
  } finally {dom.window.close();}
});
