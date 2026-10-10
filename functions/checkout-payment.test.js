const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assertPaid,cents,InfinitePayProvider}=require('./checkout-payment');
test('somente resposta server-side paga com valor correspondente confirma',()=>{
  const paid={success:true,paid:true,amount:1000,paid_amount:1010,capture_method:'pix'};
  assert.doesNotThrow(()=>assertPaid(paid,1000));
  for(const p of [{...paid,paid:false},{...paid,success:false},{...paid,amount:999},{...paid,paid_amount:900},{...paid,capture_method:'cash'}]) assert.throws(()=>assertPaid(p,1000));
});
test('valores convertidos para centavos sem NaN ou saldo negativo',()=>{
  assert.equal(cents(10.01),1001);for(const v of [NaN,Infinity,-1,0,'abc']) assert.throws(()=>cents(v));
});
test('provider envia JSON somente ao endpoint oficial e não aceita falha HTTP',async()=>{
  let seen;const provider=new InfinitePayProvider({fetchImpl:async(url,options)=>{seen={url,options};return {ok:true,json:async()=>({paid:false})};}});
  await provider.check({handle:'loja',order_nsu:'pedido'});
  assert.equal(seen.url,'https://api.checkout.infinitepay.io/payment_check');
  assert.deepEqual(JSON.parse(seen.options.body),{handle:'loja',order_nsu:'pedido'});
  await assert.rejects(()=>new InfinitePayProvider({fetchImpl:async()=>({ok:false}),logError:()=>{}}).create({}), {httpStatus:502});
});
