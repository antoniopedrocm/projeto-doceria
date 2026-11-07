const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPaymentService}=require('./checkout-payment');

const documentedEvents=['created','paid','settled','canceled','refunded','payment_failed','expired','overdue'];
function fixture(create) {
  const records=new Map(),writes=[],requests=[];
  const ref=path=>({path,update:async value=>{writes.push(path);records.set(path,{...records.get(path),...value});}});
  const db={doc:ref,collection:path=>({doc:id=>ref(path+'/'+id)}),runTransaction:async fn=>fn({
    get:async r=>({exists:records.has(r.path),data:()=>records.get(r.path)}),
    update:(r,value)=>{writes.push(r.path);records.set(r.path,{...records.get(r.path),...value});},
  })};
  const provider={create:async payload=>{requests.push(payload);return create?create(payload):{url:'https://checkout.infinitepay.com.br/'+payload.order_nsu};}};
  const service=createPaymentService({db,admin:{},provider});
  const seed=(id,storeId='store-a',extra={})=>records.set('checkoutPayments/'+id,{storeId,orderId:'order-'+storeId,orderPath:'lojas/'+storeId+'/pedidos/order-'+storeId,ownerUid:'owner',payment_status:'PENDING',amount:1000,handle:'merchant-'+storeId,redirectUrl:'https://example.invalid/'+storeId+'/return',webhookUrl:'https://example.invalid/'+storeId+'/webhook',...extra});
  return {records,writes,requests,service,seed};
}

test('new links select all eight documented events including paid and reuse a ready link',async()=>{
  const f=fixture(),id='a'.repeat(64);f.seed(id);
  const first=await f.service.start(id,'owner'),second=await f.service.start(id,'owner');
  assert.deepEqual(second,first);assert.equal(f.requests.length,1);
  const payload=f.requests[0];assert.deepEqual(payload.webhook,{url:'https://example.invalid/store-a/webhook',events:documentedEvents});
  assert.equal(payload.webhook.events.filter(e=>e==='paid').length,1);
  assert.equal(Object.hasOwn(payload,'webhook_url'),false);assert.equal(Object.hasOwn(payload,'options'),false);
  const stored=f.records.get('checkoutPayments/'+id);assert.equal(stored.webhookMode,'EVENTS');assert.deepEqual(stored.webhookEvents,documentedEvents);
});

test('legacy links already created are returned without recreation or subscription backfill',async()=>{
  const f=fixture(),id='b'.repeat(64);f.seed(id,'store-a',{linkState:'READY',checkoutUrl:'https://checkout.infinitepay.com.br/historical-link'});
  const before={...f.records.get('checkoutPayments/'+id)};
  const result=await f.service.start(id,'owner');assert.equal(result.checkoutUrl,before.checkoutUrl);
  assert.deepEqual(f.records.get('checkoutPayments/'+id),before);assert.equal(f.requests.length,0);assert.equal(f.writes.length,0);
});

test('new subscriptions retain each persisted merchant, URL, amount and store identity',async()=>{
  const f=fixture();for(const [id,store] of [['c'.repeat(64),'store-a'],['d'.repeat(64),'store-b']]){f.seed(id,store);await f.service.start(id,'owner');}
  assert.equal(f.requests.length,2);
  for(const [i,store] of ['store-a','store-b'].entries()){
    assert.equal(f.requests[i].handle,'merchant-'+store);assert.equal(f.requests[i].webhook.url,'https://example.invalid/'+store+'/webhook');
    assert.equal(f.requests[i].items[0].price,1000);assert.deepEqual(f.requests[i].webhook.events,documentedEvents);
  }
});

test('ambiguous link creation retains its subscription snapshot and never retries creation blindly',async()=>{
  const f=fixture(async()=>{throw new Error('synthetic provider unavailable');}),id='e'.repeat(64);f.seed(id);
  await assert.rejects(()=>f.service.start(id,'owner'),/synthetic/);
  await assert.rejects(()=>f.service.start(id,'owner'),{httpStatus:409});assert.equal(f.requests.length,1);
  const saved=f.records.get('checkoutPayments/'+id);assert.equal(saved.linkState,'RECONCILIATION_REQUIRED');assert.deepEqual(saved.webhookEvents,documentedEvents);
});
