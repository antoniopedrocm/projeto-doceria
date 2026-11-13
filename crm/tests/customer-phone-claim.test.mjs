import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createCustomerPhoneClaimView} from '../public/customer-phone-claim.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
function fixture({review=false,store=true,url}={}){
  const dom=new JSDOM('<body></body>',{url:url || 'https://example.test/cardapio'+(store?'?store=loja-futura':'')});const {window}=dom;
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const calls=[],fetches=[],auth={app:{options:{projectId:'crmdoceria-9959e'}},currentUser:{uid:'claimant'}},tokens=[];
  const verifier={ready:fn=>fn(),execute:async()=>{tokens.push(true);return 'fixture-risk-token-not-reused';}};window.grecaptcha={enterprise:verifier};
  const append=window.document.head.append.bind(window.document.head);window.document.head.append=element=>{append(element);if(element.tagName==='SCRIPT'){const callback=new URL(element.src).searchParams.get('onload');window.queueMicrotask(()=>window[callback]?.());}};
  window.fetch=async url=>{fetches.push(url);return {ok:true,json:async()=>({stores:[{storeId:'loja-futura',name:'Loja de teste'}]})};};
  let linked=0;
  const call=async(name,data)=>{calls.push({name,data});return name==='customerPhoneClaimStatus'?{projectId:'sms-fixture-dev',enterpriseSiteKey:'fixture-site-key-long-enough'}:name==='customerPhoneClaimStart'?{challengeId:'fixture',phoneMasked:'••••0071',resendAt:Date.now()+60000}:{};};
  const view=createCustomerPhoneClaimView({document:window.document,window,call,auth,onLinked:async()=>{linked++;},getApiBase:async()=>'https://api.example.test'});
  const open=()=>view.open({phone:'62985550071',identityReviewRequired:review}),el=name=>window.document.querySelector(`[data-claim-${name}]`);
  return {dom,window,view,open,el,calls,fetches,auth,tokens,get linked(){return linked;},dispose(){view.dispose();window.close();}};
}
test('claim só pede SMS após ação explícita; confirma o mesmo telefone e UID sem trocar Auth ou carrinho',async()=>{
  const f=fixture();f.window.sessionStorage.setItem('checkoutState_v1','{"storeId":"loja-futura","cart":[{"id":"x","quantity":2}]}');const cart=f.window.sessionStorage.getItem('checkoutState_v1');
  await f.open();assert.equal(f.calls.length,0);assert.equal(f.el('form').hidden,true);assert.match(f.el('message').textContent,/0071/);
  await f.el('send').onclick();assert.equal(f.tokens.length,1);assert.equal(f.el('form').hidden,false);assert.equal(f.el('send').disabled,true);
  assert.equal(f.calls[1].data.phone,'62985550071');assert.equal(f.calls[1].data.storeId,'loja-futura');assert.equal(f.calls[1].data.recaptchaToken,'fixture-risk-token-not-reused');
  f.el('code').value='123456';await f.el('form').onsubmit({preventDefault(){}});assert.equal(f.linked,1);assert.equal(f.auth.currentUser.uid,'claimant');assert.equal(f.window.sessionStorage.getItem('checkoutState_v1'),cart);assert.equal(f.el('code').value,'');f.dispose();
});
test('owner diferente mostra revisão sem iniciar SMS e sem escolher Matriz como fallback',async()=>{
  const f=fixture({review:true,store:false});await f.open();assert.equal(f.el('send').hidden,true);assert.equal(f.calls.length,0);assert.match(f.el('message').textContent,/conferência/);f.dispose();
});
test('sem contexto de loja exige escolha explícita; cancelar descarta prova transitória',async()=>{
  const f=fixture({store:false});await f.open();assert.equal(f.el('store-label').hidden,false);assert.equal(f.el('store').value,'');await f.el('send').onclick();assert.equal(f.calls.length,0);
  assert.deepEqual(f.fetches,['https://api.example.test/store/public-list']);
  f.el('store').value='loja-futura';await f.el('send').onclick();assert.equal(f.calls[1].data.storeId,'loja-futura');f.el('cancel').onclick();assert.equal(f.el('form').hidden,true);assert.equal(f.el('code').value,'');assert.equal(f.linked,0);f.dispose();
});

for(const [slug,storeId] of [['cardapio-matriz','ana-guimaraes-doceria-matriz'],['cardapio-garavelo','ana-guimaraes-doceria-garavelo'],['cardapio-festa','ana-guimaraes-doceria-matriz']]) {
  test(`primeiro vínculo sem carrinho usa returnTo validado ${slug}, sem escolha ou SMS automático`,async()=>{
    const f=fixture({url:'https://example.test/area-cliente?returnTo='+encodeURIComponent('/'+slug)});
    f.window.sessionStorage.setItem('checkoutState_v1',JSON.stringify({storeId:'loja-antiga',cart:[{id:'x'}]}));
    await f.open();assert.equal(f.el('store-label').hidden,true);assert.equal(f.el('send').disabled,false);assert.equal(f.fetches.length,0);assert.equal(f.calls.length,0);
    await f.el('send').onclick();assert.deepEqual(f.calls.map(x=>x.name),['customerPhoneClaimStatus','customerPhoneClaimStart']);assert.ok(f.calls.every(x=>x.data.storeId===storeId));assert.equal(f.tokens.length,1);f.dispose();
  });
}

test('origem pública persistida sobrevive a refresh sem depender de Customer ou carrinho',async()=>{
  const f=fixture({url:'https://example.test/minha-conta'});f.window.sessionStorage.setItem('customer-public-return-v1','/cardapio-garavelo');
  await f.open();await f.el('send').onclick();assert.ok(f.calls.every(x=>x.data.storeId==='ana-guimaraes-doceria-garavelo'));assert.equal(f.fetches.length,0);f.dispose();
});

test('returnTo continua válido quando o navegador bloqueia sessionStorage',async()=>{
  const f=fixture({url:'https://example.test/area-cliente?returnTo=%2Fcardapio-matriz'});
  Object.defineProperty(f.window,'sessionStorage',{get(){throw new f.window.DOMException('Storage blocked','SecurityError');}});
  await f.open();await f.el('send').onclick();assert.ok(f.calls.every(x=>x.data.storeId==='ana-guimaraes-doceria-matriz'));assert.equal(f.fetches.length,0);f.dispose();
});

test('origem externa não seleciona loja arbitrária; erro na listagem não oferece envio sem contexto',async()=>{
  const f=fixture({url:'https://example.test/area-cliente?returnTo=https%3A%2F%2Fevil.example%2Fcardapio-matriz'});
  f.window.fetch=async()=>({ok:true,json:async()=>{throw Error('Hosting returned HTML');}});
  await f.open();assert.equal(f.el('send').disabled,true);assert.match(f.el('message').textContent,/carregar as lojas/);assert.equal(f.calls.length,0);assert.equal(f.tokens.length,0);f.dispose();
});

test('cancelar durante a listagem não reabre seletor nem inicia SMS',async()=>{
  const f=fixture({store:false});let release;f.window.fetch=()=>new Promise(resolve=>{release=resolve;});
  const opening=f.open();await new Promise(resolve=>setImmediate(resolve));f.el('cancel').onclick();release({ok:true,json:async()=>({stores:[]})});await opening;
  assert.equal(f.window.document.querySelector('dialog').open,false);assert.equal(f.el('store-label').hidden,true);assert.equal(f.calls.length,0);f.dispose();
});
