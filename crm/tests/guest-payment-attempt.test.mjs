import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectGuestPaymentAttempt} from '../public/guest-payment-attempt.mjs';
const id='a'.repeat(64),token='b'.repeat(64),key='doceria-payment-pending';
function fixture(){const values=new Map([[key,JSON.stringify({paymentId:id,idempotencyKey:'original-attempt'})],['doceria-payment-return:'+id,JSON.stringify({token})],['checkoutState_v1','preserved-cart']]);return {values,storage:{getItem:k=>values.get(k)||null,removeItem:k=>values.delete(k)}};}
test('fresh purchase and response-lost attempt without payment ID retain idempotency unchanged',async()=>{
 const f=fixture();f.values.delete(key);const request=async()=>assert.fail('No payment to inspect');
 assert.equal((await inspectGuestPaymentAttempt({...f,request})).blocked,false);
 const prior=JSON.stringify({idempotencyKey:'response-lost-attempt'});f.values.set(key,prior);
 assert.equal((await inspectGuestPaymentAttempt({...f,request})).blocked,false);assert.equal(f.values.get(key),prior);
});
test('pending online attempt is preserved and only its payment capability is used for lookup',async()=>{
 const f=fixture(),prior=f.values.get(key);let calls=0;
 const result=await inspectGuestPaymentAttempt({...f,request:async body=>{calls++;assert.deepEqual(body,{paymentId:id,paymentReturnToken:token});return {ok:true,data:{payment_status:'PENDING'}};}});
 assert.equal(result.blocked,true);assert.equal(result.paymentId,id);assert.match(result.message,/online em andamento/);assert.equal(calls,1);assert.equal(f.values.get(key),prior);
});
test('paid, review and unknown states never clear the key or claim a new order',async()=>{
 for(const data of [{payment_status:'PAID'},{payment_status:'EXPIRED',requiresReview:true},{payment_status:'UNKNOWN'},{}]){
  const f=fixture(),prior=f.values.get(key);assert.equal((await inspectGuestPaymentAttempt({...f,request:async()=>({ok:true,data})})).blocked,true);assert.equal(f.values.get(key),prior);
 }
});
test('only server-confirmed expired/cancelled/refunded attempt can retire the old key, preserving cart and return proof',async()=>{
 for(const payment_status of ['EXPIRED','CANCELLED','REFUNDED']){
  const f=fixture();assert.equal((await inspectGuestPaymentAttempt({...f,request:async()=>({ok:true,data:{payment_status}})})).blocked,false);
  assert.equal(f.values.has(key),false);assert.equal(f.values.get('checkoutState_v1'),'preserved-cart');assert.ok(f.values.has('doceria-payment-return:'+id));
 }
});
test('HTTP and network failure preserve attempt for safe retry',async()=>{
 for(const request of [async()=>({ok:false,data:{payment_status:'EXPIRED'}}),async()=>{throw Error('synthetic timeout');}]){
  const f=fixture(),prior=f.values.get(key);assert.equal((await inspectGuestPaymentAttempt({...f,request})).blocked,true);assert.equal(f.values.get(key),prior);
 }
});
test('malformed state or missing return capability never queries or deletes a pending key',async()=>{
 const request=async()=>assert.fail('No unauthenticated payment query');
 for(const setup of [f=>f.values.set(key,'{broken'),f=>f.values.set(key,JSON.stringify({paymentId:'https://outside.test'})),f=>f.values.delete('doceria-payment-return:'+id)]){
  const f=fixture();setup(f);const prior=f.values.get(key);assert.equal((await inspectGuestPaymentAttempt({...f,request})).blocked,true);assert.equal(f.values.get(key),prior);
 }
});
test('late terminal response cannot remove another pending attempt',async()=>{
 const f=fixture(),newer=JSON.stringify({paymentId:'c'.repeat(64),idempotencyKey:'newer-attempt'});
 const result=await inspectGuestPaymentAttempt({...f,request:async()=>{f.values.set(key,newer);return {ok:true,data:{payment_status:'EXPIRED'}};}});
 assert.equal(result.blocked,true);assert.equal(f.values.get(key),newer);
});
test('local terminal hints are never authority over a server pending state',async()=>{
 const f=fixture(),prior=JSON.stringify({paymentId:id,idempotencyKey:'original-attempt',payment_status:'EXPIRED'});f.values.set(key,prior);
 const result=await inspectGuestPaymentAttempt({...f,request:async()=>({ok:true,data:{payment_status:'PENDING'}})});
 assert.equal(result.blocked,true);assert.equal(f.values.get(key),prior);
});
test('resuming ONLINE_NOW retains the same attempt and delegates matching/authorization to the backend',async()=>{
 const f=fixture(),prior=f.values.get(key);
 const result=await inspectGuestPaymentAttempt({...f,paymentMode:'ONLINE_NOW',request:async()=>({ok:true,data:{payment_status:'PENDING'}})});
 assert.equal(result.blocked,false);assert.equal(result.paymentId,id);assert.equal(f.values.get(key),prior);
});
test('preview never retires the terminal key while a confirmation may be in flight',async()=>{
 const f=fixture(),prior=f.values.get(key);
 const result=await inspectGuestPaymentAttempt({...f,retireTerminal:false,request:async()=>({ok:true,data:{payment_status:'EXPIRED'}})});
 assert.equal(result.blocked,false);assert.equal(f.values.get(key),prior);
});
