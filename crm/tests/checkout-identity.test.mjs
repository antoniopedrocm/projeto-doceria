import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCheckoutIdentity,CHECKOUT_MODES as M} from '../public/checkout-identity.mjs';
function fixture(storeId='loja-futura-teste') {
  const records=new Map();let uid='customer-a',server={};
  const storage={getItem:k=>records.get(k),setItem:(k,v)=>records.set(k,v)};
  const request=async input=>{server={...input,token:input.checkoutIdentityToken || 'a'.repeat(64),revision:(server.revision || 0)+1};return server;};
  const create=()=>createCheckoutIdentity({storage,storeId,request,getUid:()=>uid});
  return {records,storage,create,setUid:value=>{uid=value;},server:()=>server};
}
test('sessão antiga não promove GUEST; modo forte exige seleção explícita e UID correto',async()=>{
  const f=fixture(),identity=f.create();assert.equal(identity.isStrong(),false);
  await identity.select(M.STRONG);assert.equal(identity.isStrong(),true);
  f.setUid('customer-b');assert.equal(identity.isStrong(),false);
  f.setUid(null);assert.equal(identity.isStrong(),false);
});
test('STRONG → PHONE do próprio/outro Customer, Staff ou dual-role sempre bloqueia antes da rede',async()=>{
  for(const uid of ['customer-a','customer-b','staff','dual-role']) {
    const f=fixture();f.setUid(uid);const identity=f.create();await identity.select(M.STRONG);
    const pending=identity.select(M.PHONE);assert.equal(identity.isStrong(),false);
    await pending;assert.equal(identity.get().mode,M.PHONE);assert.equal(identity.get().uid,null);
  }
});
test('PHONE → STRONG preserva snapshot, loja e referência; refresh conserva modo weak',async()=>{
  const f=fixture(),identity=f.create();
  f.storage.setItem('checkoutState_v1',JSON.stringify({storeId:'loja-futura-teste',cart:[{id:'doce',quantity:2}],cupom:'VALIDO'}));
  const before=f.storage.getItem('checkoutState_v1');
  await identity.select(M.PHONE);const phone=identity.get();
  const restored=f.create();assert.equal(restored.get().mode,M.PHONE);assert.equal(restored.isStrong(),false);
  await restored.select(M.STRONG);assert.equal(restored.isStrong(),true);
  assert.equal(restored.get().token,phone.token);assert.equal(f.server().storeId,'loja-futura-teste');
  assert.equal(f.storage.getItem('checkoutState_v1'),before);
});
test('guest explícito, contexto Staff/Customer e refresh não apagam carrinho nem elevam modo',async()=>{
  const f=fixture(),identity=f.create();f.records.set('checkoutState_v1','existing-cart');
  await identity.select(M.GUEST);assert.equal(f.create().isStrong(),false);
  identity.invalidate();f.setUid('customer-b');assert.equal(identity.isStrong(),false);
  assert.equal(f.records.get('checkoutState_v1'),'existing-cart');
});
test('store scope e storage corrompido isolados, sem fallback',async()=>{
  const f=fixture();f.storage.setItem('checkoutIdentity_v1:loja-futura-teste','{broken');
  const identity=f.create();assert.equal(identity.get().mode,M.GUEST);
  await identity.select(M.PHONE);
  const other=createCheckoutIdentity({storage:f.storage,storeId:'outra-loja',request:async()=>{},getUid:()=>null});
  assert.equal(other.get().token,null);
});
test('seleções concorrentes não republicam strong depois de escolha weak',async()=>{
  let finish;const pending=new Promise(resolve=>{finish=resolve;});let count=0;
  const identity=createCheckoutIdentity({storage:{getItem:()=>null,setItem:()=>{}},storeId:'future',getUid:()=> 'uid',
    request:async input=>{if(++count===1) await pending;return {...input,token:'a'.repeat(64),revision:count};}});
  const first=identity.select(M.STRONG);const second=identity.select(M.PHONE);
  finish();await first;assert.equal(identity.isStrong(),false);await second;assert.equal(identity.get().mode,M.PHONE);
});
test('cardápio mantém convite strong e não promove publicação passiva; weak não grava perfil/endereço',()=>{
  const page=fs.readFileSync(new URL('../public/cardapio.html',import.meta.url),'utf8');
  assert.match(page,/if\(checkoutIdentity\.isStrong\(\)\) currentClient=client/);
  assert.match(page,/Para pagar online, entre com Google ou e-mail/);
  assert.match(page,/checkoutHeaders\(online,checkoutIdentity\)/);
  assert.match(page,/checkoutIdentityToken:checkoutIdentity\.get\(\)\.token/);
  assert.match(page,/const draft=createCheckoutAddressDraft\(newAddress,crypto.randomUUID\(\)\)/);
  assert.match(page,/onPromote:address=>getPhoneAddressManager\(\)\.perform\('create',address\)/);
  assert.match(page,/edit-profile-btn'\)\.hidden=checkoutIdentity\.get\(\)\.mode===CHECKOUT_MODES.PHONE/);
});
