import test from 'node:test';
import assert from 'node:assert/strict';
import {retireLegacySession,createCanonicalLogout,syncPrivateCart,rememberStaffDevice,staffDevice} from '../crm/public/canonical-session.mjs';
const session=uid=>({currentUser:uid?{uid}:null,authStateReady:async()=>{}});
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('same UID retires ONLY legacy without copying credentials or signing out canonical',async()=>{
  const auth=session('a'),legacyAuth=session('a'),out=[];
  assert.equal(await retireLegacySession({auth,legacyAuth,signOut:async a=>{out.push(a);a.currentUser=null;}}),'READY');
  assert.deepEqual(out,[legacyAuth]);assert.equal(auth.currentUser.uid,'a');
});
test('different UIDs both end, no implicit account selection',async()=>{
  const auth=session('a'),legacyAuth=session('b'),out=[];
  assert.equal(await retireLegacySession({auth,legacyAuth,signOut:async a=>{out.push(a);a.currentUser=null;}}),'CONFLICT');assert.equal(out.length,2);assert.equal(auth.currentUser,null);assert.equal(legacyAuth.currentUser,null);
});
test('legacy only asks reentry and never adopts old User',async()=>{
  const auth=session(null),legacyAuth=session('a');
  assert.equal(await retireLegacySession({auth,legacyAuth,signOut:async a=>{a.currentUser=null;}}),'REENTRY_REQUIRED');assert.equal(auth.currentUser,null);
});
test('same UID switch preserves cart; different UID/logout clears private cart only',()=>{
  const s=storage();s.setItem('public-setting','keep');syncPrivateCart(s,'a');s.setItem('checkoutState_v1','{"cart":[1]}');s.setItem('doceria-payment-pending','private');syncPrivateCart(s,'a');assert.ok(s.getItem('checkoutState_v1'));syncPrivateCart(s,'b');assert.equal(s.getItem('checkoutState_v1'),null);assert.equal(s.getItem('doceria-payment-pending'),null);assert.equal(s.getItem('public-setting'),'keep');
});
test('anonymous cart is not erased on initial signed-out observation',()=>{
  const s=storage();s.setItem('checkoutState_v1','{"cart":[1]}');syncPrivateCart(s,null);assert.ok(s.getItem('checkoutState_v1'));
});
test('central logout cleans only current Staff device, before signOut, deduplicates concurrent calls',async()=>{
  const auth=session('a'),legacyAuth=session('a'),s=storage(),events=[];
  rememberStaffDevice(s,'a','fixture');assert.equal(staffDevice(s,'b'),null);syncPrivateCart(s,'a');s.setItem('checkoutState_v1','private');
  const logout=createCanonicalLogout({auth,legacyAuth,storage:s,signOut:async a=>{events.push('out');a.currentUser=null;},beforeSignOut:async(uid,token)=>{assert.equal(auth.currentUser.uid,'a');assert.equal(uid,'a');assert.equal(token,'fixture');events.push('cleanup');}});
  await Promise.all([logout(),logout()]);assert.deepEqual(events,['cleanup','out','out']);assert.equal(s.getItem('checkoutState_v1'),null);
});
test('cleanup failure still ends both identities',async()=>{
  const auth=session('a'),legacyAuth=session('b');const logout=createCanonicalLogout({auth,legacyAuth,storage:storage(),signOut:async a=>{a.currentUser=null;},beforeSignOut:async()=>{throw Error('cleanup');}});
  await assert.doesNotReject(logout);assert.equal(auth.currentUser,null);assert.equal(legacyAuth.currentUser,null);
});

test('cleanup timeout ends both sessions and aborts late cleanup, without holding private cart', async()=>{
  const auth=session('a'),legacyAuth=session('a'),s=storage(),warnings=[];let signal;
  syncPrivateCart(s,'a');s.setItem('checkoutState_v1','private');
  const logout=createCanonicalLogout({auth,legacyAuth,storage:s,cleanupTimeoutMs:15,
    onCleanupError:code=>warnings.push(code),beforeSignOut:(_uid,_token,abort)=>{signal=abort;return new Promise(()=>{});},
    signOut:async current=>{current.currentUser=null;}});
  await logout();assert.equal(signal.aborted,true);assert.equal(auth.currentUser,null);
  assert.equal(legacyAuth.currentUser,null);assert.equal(s.getItem('checkoutState_v1'),null);
  assert.ok(warnings.includes('cleanup-incomplete'));
});

test('live cart same UID/initial observation never erases a restored public or Customer cart',async()=>{
  const {createCartOwnerObserver}=await import('../crm/public/canonical-session.mjs');
  const calls=[];const observe=createCartOwnerObserver({initialUid:'a',onClear:()=>calls.push('clear'),onOwner:uid=>calls.push(uid)});
  observe({uid:'a'});observe({uid:'a'});assert.deepEqual(calls,[]);
});
test('live cart changes owner and clears even if the old Customer profile never resolved',async()=>{
  const {createCartOwnerObserver}=await import('../crm/public/canonical-session.mjs');
  const calls=[];const observe=createCartOwnerObserver({initialUid:'a',onClear:()=>calls.push('clear'),onOwner:uid=>calls.push(uid)});
  observe({uid:'b'});observe(null);assert.deepEqual(calls,['clear','b','clear',null]);
});
test('visitor/anonymous initial cart survives; login claims it without sharing another UID',async()=>{
  const {createCartOwnerObserver}=await import('../crm/public/canonical-session.mjs');
  const calls=[];const observe=createCartOwnerObserver({onClear:()=>calls.push('clear'),onOwner:uid=>calls.push(uid)});
  observe(null);observe({uid:'anonymous',isAnonymous:true});observe({uid:'a'});assert.deepEqual(calls,['a']);
});
