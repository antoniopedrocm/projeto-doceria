/* global globalThis */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {installCustomerAccount} from '../public/customer-account-core.mjs';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture({inlineLogin=true,embedded=true,failLogin=false}={}) {
 const dom=new JSDOM('<main></main>',{url:'https://example.test/area-cliente'});
 const previous={window:globalThis.window,document:globalThis.document};globalThis.window=dom.window;globalThis.document=dom.window.document;
 const {window}=dom;window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const auth={app:{name:'[DEFAULT]'},currentUser:null},calls=[],sdkCalls=[],sessions=[];let observer;
 const customer={id:'own-fixture',accountLinked:true,nome:'Cliente fictício',enderecos:[]};
 const signIn=provider=>{auth.currentUser={uid:'fixture-uid',providerData:[{providerId:provider}],isAnonymous:false};return {user:auth.currentUser};};
 const runtime={auth,functions:{},onAuthStateChanged:(_auth,fn)=>{observer=fn;return()=>{};},httpsCallable:(_functions,name)=>async()=>{calls.push(name);assert.equal(name,'customerAccount');return {data:{customer}};},
 GoogleAuthProvider:class {},signInWithPopup:async(session,provider)=>{sdkCalls.push({kind:'google',session,provider});return signIn('google.com');},
 signInWithEmailAndPassword:async(session,email,password)=>{sdkCalls.push({kind:'email',session,email,password});if(failLogin)throw Object.assign(new Error('Fixture credentials rejected'),{code:'auth/invalid-credential'});return signIn('password');},
 sendPasswordResetEmail:async(session,email)=>{sdkCalls.push({kind:'reset',session,email});},
 signOut:async()=>{},EmailAuthProvider:{credential:()=>({})}};
 window.sessionStorage.setItem('checkoutState_v1','{"storeId":"fixture-store","cart":[{"id":"fixture-item","quantity":2}]}');
 const cart=window.sessionStorage.getItem('checkoutState_v1'),host=embedded?window.document.querySelector('main'):null;
 const api=installCustomerAccount({host,runtime,inlineLogin,createAccountButton:false,onSession:value=>sessions.push(value)});
 observer(null);await api.ready;
 const get=name=>window.document.querySelector(`[data-${name}]`);
 return {window,auth,api,get,host,sdkCalls,sessions,calls,
 async click(name){get(name).click();await tick();},
 async submit(){get('login-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();},
 close(){assert.equal(window.sessionStorage.getItem('checkoutState_v1'),cart);api.dispose();globalThis.window=previous.window;globalThis.document=previous.document;window.close();}};
}
test('inline entry exposes labelled Email/password, reset, primary email, divider and Google without a second dialog',async t=>{
 const f=await fixture();t.after(f.close);
 assert.equal(f.get('login-form').hidden,false);assert.equal(f.get('login-email').type,'email');assert.equal(f.get('login-password').autocomplete,'current-password');
 assert.equal(f.get('login-email').parentElement.textContent,'Email');assert.equal(f.get('forgot').textContent,'Esqueci a senha');
 assert.equal(f.get('login-form').querySelector('button:not([type])').textContent,'Entrar com email');
 assert.equal(f.window.document.querySelector('.customer-login-divider').textContent,'ou');
 assert.equal(f.get('account-google').textContent,'Entrar com Google');assert.ok(f.get('account-google').querySelector('svg[aria-hidden=true]'));
 assert.equal(f.get('account-email').hidden,true);assert.equal(f.get('email-message').textContent,'');assert.equal(f.get('message').textContent,'');
 assert.equal(f.window.document.querySelector('dialog[aria-label="Entrar com e-mail"]'),null);assert.deepEqual(f.sdkCalls,[]);assert.deepEqual(f.calls,[]);
});
test('email submission uses the existing SDK handler and canonical Auth; private Customer resolves and cart stays intact',async t=>{
 const f=await fixture();t.after(f.close);f.get('login-email').value=' customer@example.test ';f.get('login-password').value='fixture-password';await f.submit();
 assert.equal(f.sdkCalls.length,1);assert.equal(f.sdkCalls[0].kind,'email');assert.equal(f.sdkCalls[0].session,f.auth);assert.equal(f.sdkCalls[0].email,'customer@example.test');
 assert.equal(f.api.getCustomer().id,'own-fixture');assert.equal(f.sessions.at(-1).id,'own-fixture');assert.deepEqual(f.calls,['customerAccount']);
});
test('recovery uses the same handler without requiring a password or creating a Customer session',async t=>{
 const f=await fixture();t.after(f.close);await f.click('forgot');assert.equal(f.sdkCalls.length,0);assert.match(f.get('email-message').textContent,/Informe seu e-mail/);
 f.get('login-email').value='customer@example.test';await f.click('forgot');assert.equal(f.sdkCalls[0].kind,'reset');assert.equal(f.sdkCalls[0].session,f.auth);
 assert.equal(f.sdkCalls[0].email,'customer@example.test');assert.match(f.get('email-message').textContent,/Enviamos as instruções/);assert.equal(f.auth.currentUser,null);assert.deepEqual(f.calls,[]);
});
test('Google button uses the existing popup handler and resolves the same Customer without email/password',async t=>{
 const f=await fixture();t.after(f.close);await f.click('account-google');assert.equal(f.sdkCalls[0].kind,'google');assert.equal(f.sdkCalls[0].session,f.auth);
 assert.equal(f.auth.currentUser.providerData[0].providerId,'google.com');assert.equal(f.api.getCustomer().id,'own-fixture');assert.deepEqual(f.calls,['customerAccount']);
});
test('invalid credentials keep the public form available, show safe error and re-enable submit',async t=>{
 const f=await fixture({failLogin:true});t.after(f.close);f.get('login-email').value='customer@example.test';f.get('login-password').value='fixture-password';await f.submit();
 assert.ok(f.get('email-message').textContent.length);assert.equal(f.get('login-form').querySelector('button:not([type])').disabled,false);
 assert.equal(f.auth.currentUser,null);assert.equal(f.api.getCustomer(),null);assert.deepEqual(f.calls,[]);assert.equal(f.get('login-form').hidden,false);
});
test('existing registration navigation remains available and returns to the inline login form',async t=>{
 const f=await fixture();t.after(f.close);await f.click('show-register');assert.equal(f.get('register-form').hidden,false);assert.equal(f.get('login-form').hidden,true);
 assert.equal(f.get('account-google').hidden,true);await f.click('show-login');assert.equal(f.get('register-form').hidden,true);assert.equal(f.get('login-form').hidden,false);assert.equal(f.get('account-google').hidden,false);
 assert.deepEqual(f.sdkCalls,[]);
});
for(const config of [{inlineLogin:false,embedded:true},{inlineLogin:true,embedded:false}])test(`non-opt-in flow retains email dialog: ${JSON.stringify(config)}`,async t=>{
 const f=await fixture(config);t.after(f.close);const dialog=f.window.document.querySelector('dialog[aria-label="Entrar com e-mail"]');assert.ok(dialog);assert.equal(dialog.open,false);
 await f.click('account-email');assert.equal(dialog.open,true);assert.equal(f.get('account-email').hidden,false);assert.equal(f.window.document.querySelector('.customer-inline-login'),null);assert.deepEqual(f.sdkCalls,[]);
});
