const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPaymentVerification}=require('./payment-verification');
function fixture(provider){const records=new Map();let clock=100000;const db={doc:path=>({path}),runTransaction:async fn=>fn({get:async ref=>({data:()=>records.get(ref.path)}),set:(ref,value)=>records.set(ref.path,value),update:(ref,patch)=>records.set(ref.path,{...records.get(ref.path),...patch})})};return {check:createPaymentVerification({db,provider,now:()=>clock}),advance:ms=>{clock+=ms;},records};}
const input={handle:'merchant',order_nsu:'a'.repeat(64),transaction_nsu:'transaction',slug:'invoice'};
test('same concurrent verification is coalesced; lease releases even on provider failure',async()=>{
 let finish,started,count=0;const ready=new Promise(resolve=>{started=resolve;});
 const f=fixture({check:()=>{count++;return new Promise(resolve=>{finish=resolve;started();});}});
 const first=f.check(input),second=f.check(input);await ready;finish({paid:false});
 assert.deepEqual(await first,await second);assert.equal(count,1);assert.equal([...f.records.values()][0].leaseUntil,0);
 const failed=fixture({check:async()=>{throw Error('fixture offline');}});await assert.rejects(()=>failed.check(input));assert.equal([...failed.records.values()][0].leaseUntil,0);
});
test('known-order verification quota bounds provider work, expires, and does not contaminate a different order',async()=>{
 let count=0;const f=fixture({check:async()=>{count++;return {paid:false};}});
 for(let i=0;i<30;i++)await f.check(input);await assert.rejects(()=>f.check(input),{httpStatus:503});assert.equal(count,30);
 await f.check({...input,order_nsu:'b'.repeat(64)});assert.equal(count,31);f.advance(60001);await f.check(input);assert.equal(count,32);
});
