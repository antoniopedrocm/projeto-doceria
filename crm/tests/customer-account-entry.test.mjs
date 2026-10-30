/* global globalThis */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {installCustomerAccount} from '../public/customer-account-core.mjs';

const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const identity=(uid='customer-a',provider='password')=>({uid,isAnonymous:false,providerData:[{providerId:provider}],displayName:'Customer DEV'});

// Real public controller and DOM. Only Firebase/HTTP and browser document
// navigation are boundaries: jsdom cannot load another document on anchor click.
async function fixture({user=identity(),linked=true,storeId='loja-futura-teste',url='/cardapio?store=loja-futura-teste',width=320,existing=false,embedded=false}={}) {
  const dom=new JSDOM(`<header>${existing?'<button id="customer-account-button" class="preserved" aria-haspopup="dialog" aria-expanded="false">Minha Conta</button>':''}<button id="cart-button">Carrinho</button></header>`,{url:'https://example.test'+url});
  const {window}=dom;Object.defineProperty(window,'innerWidth',{value:width});
  const previousDocument=globalThis.document,previousWindow=globalThis.window;
  globalThis.document=window.document;globalThis.window=window;
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const auth={app:{name:'[DEFAULT]'},currentUser:user};let observer;
  const calls=[],sessions=[],authCalls=[],destinations=[];
  const customer={id:'own-customer',accountLinked:true,nome:'Customer DEV',enderecos:[]};
  const runtime={auth,functions:{},httpsCallable:(_functions,name)=>async data=>{
    calls.push({name,data});assert.equal(name,'customerAccount','header entry must not invoke a write/order/payment callable');
    return {data:linked?{customer}:{customer:null,needsPhone:true}};
  },onAuthStateChanged:(_auth,fn)=>{observer=fn;return()=>{};},
  signOut:async()=>{authCalls.push('signOut');},logout:async()=>{authCalls.push('logout');},
  GoogleAuthProvider:class {},signInWithPopup:async()=>{authCalls.push('signIn');},
  EmailAuthProvider:{credential:()=>({})},sendEmailVerification:async()=>{},sendPasswordResetEmail:async()=>{},
  reauthenticateWithCredential:async()=>{},verifyBeforeUpdateEmail:async()=>{},updatePassword:async()=>{},reload:async()=>{}};
  const state=JSON.stringify({storeId,reorderOwnerUid:user?.uid||null,cart:[{id:'p',nome:'Atual',preco:12,quantity:2}],pendingOrderDetails:{context:'preserve'}});
  window.sessionStorage.setItem('checkoutState_v1',state);
  window.sessionStorage.setItem('doceria-payment-pending','existing-fixture-context');
  const host=embedded?window.document.createElement('main'):null;
  if(host)window.document.body.append(host);
  const api=installCustomerAccount({runtime,host,createAccountButton:!embedded,onSession:value=>sessions.push(value)});
  observer(user);await api.ready;
  const entry=()=>window.document.getElementById('customer-account-button') || [...window.document.querySelectorAll('header>*')].find(el=>el.textContent==='Minha Conta');
  window.document.addEventListener('click',event=>{
    const link=entry();
    if(event.target!==link || event.defaultPrevented || link?.tagName!=='A')return;
    destinations.push(link.href);event.preventDefault();
    const target=new URL(link.href);window.history.pushState(null,'',target.pathname+target.search);
  });
  return {window,api,auth,user,calls,sessions,authCalls,destinations,state,entry,host,entryPath:'/area-cliente?returnTo='+encodeURIComponent(url),
    dialog:window.document.querySelector('.customer-area-dialog'),
    async click(){entry().dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true,button:0}));await tick();},
    close(){api.dispose();globalThis.document=previousDocument;globalThis.window=previousWindow;window.close();}};
}

for(const [name,storeId,url] of [
  ['Matriz','ana-guimaraes-doceria-matriz','/cardapio-matriz'],
  ['Garavelo','ana-guimaraes-doceria-garavelo','/cardapio-garavelo'],
  ['Festas/canal','ana-guimaraes-doceria-matriz','/cardapio-festa'],
  ['loja futura','loja-futura-teste','/cardapio?store=loja-futura-teste'],
]) test(`header ${name} goes to Customer home without modal, auth change or cart/store mutation`,async t=>{
  const f=await fixture({storeId,url});t.after(f.close);
  const beforeCalls=f.calls.length,beforeSessions=f.sessions.length;
  assert.equal(f.entry().tagName,'A');assert.equal(f.entry().getAttribute('href'),f.entryPath);
  assert.equal(f.entry().textContent,'Minha Conta');
  await f.click();
  assert.deepEqual(f.destinations,['https://example.test'+f.entryPath]);
  assert.equal(f.window.location.pathname,'/area-cliente');assert.equal(f.dialog.open,false);
  assert.equal(f.auth.currentUser,f.user);assert.deepEqual(f.authCalls,[]);
  assert.equal(f.calls.length,beforeCalls);assert.equal(f.sessions.length,beforeSessions);
  assert.equal(f.window.sessionStorage.getItem('checkoutState_v1'),f.state);
  assert.equal(f.window.sessionStorage.getItem('doceria-payment-pending'),'existing-fixture-context');
});

test('existing modal button becomes a single accessible navigation link',async t=>{
  const f=await fixture({existing:true});t.after(f.close);
  assert.equal(f.window.document.querySelectorAll('#customer-account-button').length,1);
  const link=f.entry();assert.equal(link.tagName,'A');assert.equal(link.className,'preserved');
  assert.equal(link.hasAttribute('aria-haspopup'),false);assert.equal(link.hasAttribute('aria-expanded'),false);
  assert.equal(link.getAttribute('href'),f.entryPath);await f.click();assert.equal(f.dialog.open,false);
});

for(const width of [320,1440]) test(`same header navigation semantics at ${width} CSS px`,async t=>{
  const f=await fixture({width});t.after(f.close);
  assert.equal(f.window.innerWidth,width);assert.equal(f.entry().tagName,'A');
  assert.equal(f.entry().getAttribute('href'),f.entryPath);await f.click();assert.equal(f.dialog.open,false);
});

for(const [label,user] of [['signed out',null],['anonymous',{...identity(),isAnonymous:true}],['legacy phone',identity('legacy','phone')]]) {
  test(`${label}: entry is only a route and never grants private Customer access`,async t=>{
    const f=await fixture({user,linked:false});t.after(f.close);await f.click();
    assert.equal(f.window.location.pathname,'/area-cliente');assert.equal(f.dialog.open,false);
    assert.equal(f.api.getCustomer(),null);assert.equal(f.dialog.querySelector('[data-area]').hidden,true);
    assert.equal(f.sessions.length,0);assert.equal(f.calls.length,0);assert.deepEqual(f.authCalls,[]);
  });
}

test('needsPhone remains onboarding with no published Customer or automatic completion',async t=>{
  const f=await fixture({linked:false,user:identity('needs-phone','google.com')});t.after(f.close);await f.click();
  assert.equal(f.window.location.pathname,'/area-cliente');assert.equal(f.dialog.open,false);
  assert.equal(f.api.getCustomer(),null);assert.equal(f.dialog.querySelector('[data-area]').hidden,true);
  assert.equal(f.dialog.querySelector('[data-phone]').hidden,false);assert.equal(f.sessions.length,0);
  assert.deepEqual(f.calls.map(c=>c.name),['customerAccount']);assert.deepEqual(f.authCalls,[]);
});

test('history Back restores menu URL without opening an old modal',{timeout:2000},async t=>{
  const f=await fixture({url:'/cardapio?store=loja-futura-teste'});t.after(f.close);await f.click();
  assert.equal(f.window.location.pathname,'/area-cliente');
  const back=new Promise(resolve=>f.window.addEventListener('popstate',resolve,{once:true}));
  f.window.history.back();await back;
  assert.equal(f.window.location.pathname+f.window.location.search,'/cardapio?store=loja-futura-teste');
  assert.equal(f.dialog.open,false);assert.equal(f.window.sessionStorage.getItem('checkoutState_v1'),f.state);
});

test('embedded profile keeps the approved controller API without creating a header entry',async t=>{
  const f=await fixture({embedded:true});t.after(f.close);
  assert.equal(f.entry(),undefined);await f.api.openAccount('profile');
  assert.equal(f.host.querySelector('[data-profile]').hidden,false);
  assert.equal(f.host.querySelector('[data-orders-panel]').hidden,true);
  assert.equal(f.host.querySelector('.customer-area-dialog').tagName,'SECTION');
});
