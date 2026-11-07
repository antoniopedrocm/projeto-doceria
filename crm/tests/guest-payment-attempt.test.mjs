import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectGuestPaymentAttempt,completeCheckoutAttempt} from '../public/guest-payment-attempt.mjs';
const id='a'.repeat(64),token='b'.repeat(64),key='doceria-payment-pending',storeId='fixture-store';
function fixture(){const values=new Map([[key,JSON.stringify({paymentId:id,idempotencyKey:'original-attempt'})],['doceria-payment-return:'+id,JSON.stringify({token})],['checkoutState_v1','preserved-cart']]);return {values,storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}};}
const known=(payment_status='PENDING',extra={})=>({ok:true,data:{id,storeId,payment_status,...extra}});
const receipt={attemptKey:'original-attempt',orderId:id,paymentId:id,storeId,mode:'ONLINE_NOW'};
test('fresh purchase and response-lost attempt retain the same key without querying a guessed payment',async()=>{
 const f=fixture();f.values.delete(key);const request=async()=>assert.fail('No payment to inspect');
 assert.equal((await inspectGuestPaymentAttempt({...f,request})).blocked,false);
 const prior=JSON.stringify({idempotencyKey:'response-lost-attempt'});f.values.set(key,prior);
 assert.equal((await inspectGuestPaymentAttempt({...f,request})).blocked,false);assert.equal(f.values.get(key),prior);
});
test('server-recognized order is registered, not an impediment to a later purchase; lookup itself does not retire anything',async()=>{
 for(const payment_status of ['PENDING','PAID','EXPIRED','CANCELLED','REFUNDED']){
  const f=fixture(),prior=f.values.get(key);const result=await inspectGuestPaymentAttempt({...f,storeId,request:async body=>{assert.deepEqual(body,{paymentId:id,paymentReturnToken:token});return known(payment_status,{requiresReview:true});}});
  assert.equal(result.blocked,false);assert.equal(result.registered,true);assert.equal(result.requiresReview,true);assert.equal(result.paymentStatus,payment_status);assert.equal(f.values.get(key),prior);
 }
});
test('acknowledgement retires only its active key, retains return proof and leaves cart cleanup to the UI',()=>{
 const f=fixture();assert.equal(completeCheckoutAttempt({...f,...receipt}),true);
 assert.equal(f.values.has(key),false);assert.equal(f.values.get('checkoutState_v1'),'preserved-cart');assert.equal(JSON.parse(f.values.get('doceria-payment-return:'+id)).token,token);
 assert.deepEqual(JSON.parse(f.values.get('doceria-checkout-receipt:'+id)),{orderId:id,paymentId:id,storeId,mode:'ONLINE_NOW'});
 assert.equal(JSON.parse(f.values.get('doceria-payment-last')).paymentId,id);
});
test('another attempt is never retired by an old acknowledgement',()=>{
 const f=fixture(),prior=JSON.stringify({idempotencyKey:'newer-attempt'});f.values.set(key,prior);
 assert.equal(completeCheckoutAttempt({...f,...receipt}),false);assert.equal(f.values.get(key),prior);
});
test('HTTP/network failures retain the retry key and all original data',async()=>{
 for(const request of [async()=>({ok:false,data:{}}),async()=>{throw Error('synthetic timeout');}]){
  const f=fixture(),prior=f.values.get(key);assert.equal((await inspectGuestPaymentAttempt({...f,request})).blocked,true);assert.equal(f.values.get(key),prior);
 }
});
test('malformed attempt or missing return capability never queries or deletes the key',async()=>{
 for(const setup of [f=>f.values.set(key,'{broken'),f=>f.values.set(key,JSON.stringify({paymentId:'https://outside.test'})),f=>f.values.delete('doceria-payment-return:'+id)]){
  const f=fixture();setup(f);const prior=f.values.get(key);assert.equal((await inspectGuestPaymentAttempt({...f,request:async()=>assert.fail('No proof')})).blocked,true);assert.equal(f.values.get(key),prior);
 }
});
test('late response cannot complete a newer purchase',async()=>{
 const f=fixture(),newer=JSON.stringify({idempotencyKey:'newer-attempt'});
 const result=await inspectGuestPaymentAttempt({...f,request:async()=>{f.values.set(key,newer);return known();}});
 assert.equal(result.blocked,true);assert.equal(f.values.get(key),newer);
});
test('unknown/unbound server response is never treated as accepted checkout',async()=>{
 for(const data of [{payment_status:'PENDING'},{id,storeId,payment_status:'UNKNOWN'},{id:'c'.repeat(64),storeId,payment_status:'PAID'}]){
  const f=fixture(),prior=f.values.get(key);assert.equal((await inspectGuestPaymentAttempt({...f,request:async()=>({ok:true,data})})).blocked,true);assert.equal(f.values.get(key),prior);
 }
});
test('other-store receipt is identified separately so the current store cart can be preserved',async()=>{
 const f=fixture();const result=await inspectGuestPaymentAttempt({...f,storeId:'other-store',request:async()=>known()});
 assert.equal(result.registered,true);assert.equal(result.otherStore,true);assert.equal(result.storeId,storeId);assert.equal(f.values.get('checkoutState_v1'),'preserved-cart');
});
test('forged local terminal status neither cancels a payment nor changes its server-reported status',async()=>{
 const f=fixture(),prior=JSON.stringify({paymentId:id,idempotencyKey:'original-attempt',payment_status:'EXPIRED'});f.values.set(key,prior);
 const result=await inspectGuestPaymentAttempt({...f,request:async()=>known()});assert.equal(result.paymentStatus,'PENDING');assert.equal(f.values.get(key),prior);
});
test('storage failure cannot discard an unacknowledged key',()=>{
 const f=fixture(),prior=f.values.get(key);f.storage.setItem=()=>{throw Error('storage fixture');};
 assert.throws(()=>completeCheckoutAttempt({...f,...receipt}),/storage fixture/);assert.equal(f.values.get(key),prior);
});
test('invalid receipt is rejected before mutating storage',()=>{
 const f=fixture(),before=[...f.values];
 assert.throws(()=>completeCheckoutAttempt({...f,...receipt,paymentId:'c'.repeat(64)}),/Referência/);
 assert.deepEqual([...f.values],before);
});
test('offline receipt stores no payment proof/status and future online return proof remains intact',()=>{
 const f=fixture();assert.equal(completeCheckoutAttempt({...f,...receipt,paymentId:null,mode:'AGREED_LATER'}),true);
 const saved=JSON.parse(f.values.get('doceria-checkout-receipt:'+id));assert.equal(saved.paymentId,null);assert.equal(saved.payment_status,undefined);assert.equal(saved.paid,undefined);assert.ok(f.values.has('doceria-payment-return:'+id));
});
