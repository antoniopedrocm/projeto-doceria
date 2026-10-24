import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createCheckoutAddressDraft,mergeCheckoutAddressOptions,renderCheckoutAddresses} from '../public/checkout-addresses.mjs';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const source=fs.readFileSync(new URL('../public/cardapio.html',import.meta.url),'utf8');
test('salvar endereço novo usa somente checkout, sem OTP, escrita de cliente, default ou perda de loja/carrinho',async()=>{
  const dom=new JSDOM();
  const fields={street:'Rua fictícia',number:'12',complement:'Sala 2',neighborhood:'Centro',city:'Goiânia',zip:'74000000',reference:'Teste'};
  for(const [field,value] of Object.entries(fields)){const input=dom.window.document.createElement('input');input.id='manual-address-'+field;input.value=value;dom.window.document.body.append(input);}
  const defaultInput=dom.window.document.createElement('input');defaultInput.id='manual-address-frequent-location';defaultInput.checked=true;dom.window.document.body.append(defaultInput);
  const saved={id:'opaque',saved:true,isDefault:true,summary:'Endereço protegido'};
  const cart=[{id:'produto-futuro',quantity:2}],selected=[];let canceled=0;
  const context={document:dom.window.document,window:{currentLatLng:{lat:-16,lng:-49},manualAddressLocationConfirmed:true},
    currentClient:{id:'canonical-opaque',enderecos:[saved]},CHECKOUT_MODES:{PHONE:'legacy_phone'},checkoutIdentity:{get:()=>({mode:'legacy_phone'})},
    getManualAddressNickname:()=> 'Casa',showToast:()=>assert.fail('unexpected error'),app:{},getFunctions:()=>({}),
    httpsCallable:()=>assert.fail('no customer API'),getPhoneAddressManager:()=>assert.fail('no OTP needed'),
    createCheckoutAddressDraft,crypto:{randomUUID:()=> 'draft-stable'},cancelNewAddress:()=>{canceled++;},openAddressManagementModal:()=>{},
    useExistingAddress:async(text,address)=>selected.push({text,address}),cart,STORE_ID:'loja-futura-teste',console};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('async function saveManualAddress()'),source.indexOf('let phoneAddressManager=null')),context);
  await context.saveManualAddress();
  assert.equal(canceled,1);assert.equal(selected.length,1);assert.equal(selected[0].address.checkoutOnly,true);
  assert.equal(selected[0].address.isDefault,false);assert.equal(selected[0].address.city,'Goiânia');assert.equal(selected[0].address.saved,false);
  assert.equal(context.currentClient.enderecos[0],saved);assert.equal(saved.isDefault,true);assert.equal(cart[0].quantity,2);assert.equal(context.STORE_ID,'loja-futura-teste');
  const restored=JSON.parse(JSON.stringify(selected[0].address));assert.equal(restored.checkoutOnly,true);assert.equal(restored.isDefault,false);dom.window.close();
});
test('cards privados nunca carregam detalhes; Ver e promoção explícita são ações separadas',()=>{
  const dom=new JSDOM();const seen=[];
  const saved={id:'private-ref',saved:true,nickname:'Casa',summary:'Goiânia · Endereço protegido',isDefault:true};
  const draft=createCheckoutAddressDraft({nickname:'Trabalho',enderecoCompleto:'Rua digitada pelo usuário, 12',isDefault:true},'draft');
  const view=renderCheckoutAddresses({document:dom.window.document,addresses:[saved,draft],weak:true,onSelect:()=>{},onView:a=>seen.push(['view',a.id]),onEdit:()=>{},onDefault:()=>{},onPromote:a=>seen.push(['promote',a.id])});
  dom.window.document.body.append(...view);
  assert.doesNotMatch(view[0].textContent,/Rua digitada/);assert.match(view[0].textContent,/Ver endereço completo/);assert.match(view[1].textContent,/somente neste checkout/);
  for(const text of ['Ver endereço completo','Salvar na minha conta'])[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent===text).click();
  assert.deepEqual(seen,[['view','private-ref'],['promote','draft']]);assert.equal(draft.isDefault,false);
  const merged=mergeCheckoutAddressOptions([saved],[draft]);assert.equal(merged.length,2);assert.equal(merged[0].isDefault,true);dom.window.close();
});
