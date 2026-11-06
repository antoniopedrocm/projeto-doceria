/* global globalThis */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {installCustomerAccount} from '../public/customer-account-core.mjs';
import {customerAreaEntryPath,customerMenuDestination} from '../public/store-links.mjs';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

async function fixture(store,inline) {
 const storeId='ana-guimaraes-doceria-'+store,source='/cardapio-'+store;
 const entry=customerAreaEntryPath({pathname:source,search:''});
 const dom=new JSDOM('<header><button id="cart-button">Carrinho</button></header><button id="continue-email-button">Entrar com e-mail</button><main></main>',{url:'https://example.test'+(inline?entry:source)});
 const {window}=dom,previous={window:globalThis.window,document:globalThis.document};globalThis.window=window;globalThis.document=window.document;
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const cart=JSON.stringify({storeId,cart:[{id:'fixture-item',quantity:1}]});window.sessionStorage.setItem('checkoutState_v1',cart);
 if(inline)assert.equal(customerMenuDestination(window.sessionStorage,window.location.search),source);
 let observer,claimed=false,created=0,emailChecks=0,checkoutCallbacks=0;
 const calls=[],sessions=[],addresses=[{id:'legacy-address',nickname:'Casa fixture',enderecoCompleto:'Endereço sintético'}];
 const customer={id:'legacy-customer-fixture',accountLinked:true,nome:'Cliente fixture',telefone:'62985550071',enderecos:addresses};
 const auth={app:{name:'[DEFAULT]',options:{projectId:'crmdoceria-9959e'}},currentUser:null};
 const runtime={auth,functions:{},onAuthStateChanged:(_auth,fn)=>{observer=fn;return()=>{};},
  createUserWithEmailAndPassword:async(session,email,password)=>{assert.equal(session,auth);assert.equal(email,'fixture@example.test');assert.equal(password,'synthetic-password');created++;auth.currentUser={uid:'new-identity-fixture',isAnonymous:false,providerData:[{providerId:'password'}],displayName:'Cliente fixture'};observer(auth.currentUser);return {user:auth.currentUser};},
  updateProfile:async(user,data)=>{Object.assign(user,data);},sendEmailVerification:async()=>{emailChecks++;},
  httpsCallable:(_functions,name)=>async data=>{
   calls.push({name,data});
   if(name==='customerAccount')return {data:{customer:claimed?customer:null,needsPhone:!claimed}};
   if(name==='customerCompleteProfile')return {data:{claimRequired:true,identityReviewRequired:false}};
   if(name==='customerPhoneClaimStatus')return {data:{projectId:'sms-fixture-dev',enterpriseSiteKey:'fixture-site-key-long-enough'}};
   if(name==='customerPhoneClaimStart')return {data:{challengeId:'fixture-challenge',phoneMasked:'••••0071',resendAt:Date.now()+60000}};
   if(name==='customerPhoneClaimConfirm'){claimed=true;return {data:{customer}};}
   throw Error('Unexpected callable '+name);
  },signOut:async()=>assert.fail('Registration must not sign out canonical Auth'),EmailAuthProvider:{credential:()=>({})}};
 window.grecaptcha={enterprise:{ready:fn=>fn(),execute:async()=>'synthetic-score-token'}};
 const append=window.document.head.append.bind(window.document.head);window.document.head.append=node=>{append(node);if(node.tagName==='SCRIPT'){const callback=new URL(node.src).searchParams.get('onload');window.queueMicrotask(()=>window[callback]?.());}};
 window.fetch=async()=>assert.fail('No real network permitted in registration fixture');
 const api=installCustomerAccount({runtime,host:inline?window.document.querySelector('main'):null,inlineLogin:inline,createAccountButton:!inline,onSession:c=>sessions.push(c),onCustomer:()=>{checkoutCallbacks++;}});
 observer(null);await api.ready;
 const el=name=>window.document.querySelector('[data-'+name+']');
 return {window,api,auth,calls,sessions,el,customer,source,entry,cart,
  get created(){return created;},get emailChecks(){return emailChecks;},get checkoutCallbacks(){return checkoutCallbacks;},
  async register(){if(!inline)window.document.getElementById('continue-email-button').click();el('show-register').click();for(const [key,value] of Object.entries({name:'Cliente fixture',email:'fixture@example.test',phone:'62985550071',password:'synthetic-password',confirm:'synthetic-password'}))el('register-'+key).value=value;await el('register-form').onsubmit({preventDefault(){}});await tick();},
  close(){api.dispose();globalThis.window=previous.window;globalThis.document=previous.document;window.close();}};
}

for(const store of ['matriz','garavelo'])for(const inline of [false,true])test(`primeiro cadastro password ${store}, ${inline?'entrada da Área Cliente':'modal do checkout'}: claim sintético mantém origem e cadastro original`,async t=>{
 const f=await fixture(store,inline);t.after(f.close);await f.register();
 assert.equal(f.created,1);assert.equal(f.emailChecks,1);assert.equal(f.api.getCustomer(),null);
 assert.equal(f.calls.filter(c=>c.name==='customerPhoneClaimStart').length,0);
 assert.equal(f.el('claim-form').hidden,true);assert.equal(customerMenuDestination(f.window.sessionStorage,f.window.location.search),f.source);
 await f.el('claim-send').onclick();assert.equal(f.calls.filter(c=>c.name==='customerPhoneClaimStart').length,1);
 f.el('claim-code').value='123456';await f.el('claim-form').onsubmit({preventDefault(){}});await tick();
 assert.equal(f.api.getCustomer().id,f.customer.id);assert.deepEqual(f.api.getCustomer().enderecos,f.customer.enderecos);
 assert.equal(f.auth.currentUser.uid,'new-identity-fixture');assert.equal(f.el('claim-code').value,'');
 assert.equal(f.calls.filter(c=>c.name==='customerPhoneClaimConfirm').length,1);
 assert.equal(f.calls.find(c=>c.name==='customerCompleteProfile').data.phone,'62985550071');
 assert.equal(f.window.sessionStorage.getItem('checkoutState_v1'),f.cart);
 if(!inline){const href=f.window.document.getElementById('customer-account-button').getAttribute('href');assert.equal(href,f.entry);f.window.history.replaceState(null,'',href);assert.equal(f.checkoutCallbacks,1);}
 assert.equal(customerMenuDestination(f.window.sessionStorage,f.window.location.search),f.source);
 await f.api.openAccount('profile');assert.equal(f.calls.filter(c=>c.name==='customerPhoneClaimStart').length,1);assert.equal(f.created,1);
});
