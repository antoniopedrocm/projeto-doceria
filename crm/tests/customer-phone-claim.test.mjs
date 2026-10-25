import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createCustomerPhoneClaimView} from '../public/customer-phone-claim.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
function fixture({review=false,store=true}={}){
  const dom=new JSDOM('<body></body>',{url:'https://example.test/cardapio'+(store?'?store=loja-futura':'')});const {window}=dom;
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const calls=[],auth={app:{options:{projectId:'crmdoceria-9959e'}},currentUser:{uid:'claimant'}},tokens=[];
  const verifier={ready:fn=>fn(),execute:async()=>{tokens.push(true);return 'fixture-risk-token-not-reused';}};window.grecaptcha={enterprise:verifier};
  const append=window.document.head.append.bind(window.document.head);window.document.head.append=element=>{append(element);if(element.tagName==='SCRIPT'){const callback=new URL(element.src).searchParams.get('onload');window.queueMicrotask(()=>window[callback]?.());}};
  window.fetch=async()=>({ok:true,json:async()=>({stores:[{storeId:'loja-futura',name:'Loja de teste'}]})});
  let linked=0;
  const call=async(name,data)=>{calls.push({name,data});return name==='customerPhoneClaimStatus'?{projectId:'sms-fixture-dev',enterpriseSiteKey:'fixture-site-key-long-enough'}:name==='customerPhoneClaimStart'?{challengeId:'fixture',phoneMasked:'••••0071',resendAt:Date.now()+60000}:{};};
  const view=createCustomerPhoneClaimView({document:window.document,window,call,auth,onLinked:async()=>{linked++;}});
  const open=()=>view.open({phone:'62985550071',identityReviewRequired:review}),el=name=>window.document.querySelector(`[data-claim-${name}]`);
  return {dom,window,view,open,el,calls,auth,tokens,get linked(){return linked;},dispose(){view.dispose();window.close();}};
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
  f.el('store').value='loja-futura';await f.el('send').onclick();assert.equal(f.calls[1].data.storeId,'loja-futura');f.el('cancel').onclick();assert.equal(f.el('form').hidden,true);assert.equal(f.el('code').value,'');assert.equal(f.linked,0);f.dispose();
});
