const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createStoreResolver} = require('./store-config');
const {createPaymentService} = require('./checkout-payment');
const {createCustomerReorder} = require('./customer-reorder');
const {storeFixtures} = require('./fixtures/stores-v1.cjs');
async function fixture() {
  const {getStoreAvailability} = await import('../crm/public/store-availability.mjs');
  const data=storeFixtures(),reads=[],snap=path=>({id:path.split('/').pop(),exists:data.has(path),data:()=>data.get(path)});
  const db={doc:path=>({path,get:async()=>{reads.push(path);return snap(path);}}),collection:()=>({}),getAll:async(...refs)=>refs.map(ref=>{reads.push(ref.path);return snap(ref.path);})};
  const payments=createPaymentService({db,provider:{create:()=>{throw Error('NO_PROVIDER_CALL');},check:()=>{throw Error('NO_PROVIDER_CALL');}}});
  const availability=c=>getStoreAvailability(c,new Date('2026-10-15T15:00:00Z'));
  return {data,reads,db,resolver:createStoreResolver({db,getAvailability:availability,loadPaymentConfig:payments.config}),availability};
}
test('loja futura resolve todos os domínios sem lista fixa e não expõe configuração privada',async()=>{
  const f=await fixture(),c=await f.resolver.publicConfig({storeId:'loja-futura-teste'});
  assert.deepEqual(c.readiness,{store:'READY',catalog:'READY',schedule:'READY',pickup:'READY',delivery:'READY',payment:'READY'});
  assert.deepEqual(Object.keys(c).sort(),['storeId','name','active','catalog','schedule','pickup','delivery','onlinePayment','readiness'].sort());
  assert.deepEqual(Object.keys(c.schedule).sort(),['timezone','schedule','effectiveAvailability'].sort());
  assert.doesNotMatch(JSON.stringify(c),/PRIVATE|secret|handle|criadoPor|updatedBy|webhook|redirectUrl|lat|valorPorKm/);
  assert.ok(f.reads.every(path=>path==='lojas/loja-futura-teste' || path.startsWith('lojas/loja-futura-teste/')));
});
test('sem frete bloqueia somente entrega, sem consultar loja ou configuração global',async()=>{
  const f=await fixture(),c=await f.resolver.publicConfig({storeId:'loja-futura-sem-frete'});
  assert.equal(c.readiness.catalog,'READY');assert.equal(c.readiness.pickup,'READY');assert.equal(c.readiness.delivery,'BLOCKED');assert.equal(c.readiness.payment,'READY');
  assert.ok(f.reads.every(p=>p==='lojas/loja-futura-sem-frete'||p.startsWith('lojas/loja-futura-sem-frete/')));
});
test('sem pagamento não usa outro handle nem derruba catálogo/entrega',async()=>{
  const f=await fixture(),c=await f.resolver.publicConfig({storeId:'loja-futura-sem-pagamento'});
  assert.equal(c.readiness.payment,'BLOCKED');assert.equal(c.readiness.delivery,'READY');assert.equal(c.readiness.catalog,'READY');
  assert.ok(f.reads.every(p=>p==='lojas/loja-futura-sem-pagamento'||p.startsWith('lojas/loja-futura-sem-pagamento/')));
});
test('V1 exige mínimo explícito; legado preserva compatibilidade sem copiar tarifa',async()=>{
  const f=await fixture(),root='lojas/loja-futura-teste';delete f.data.get(root+'/configuracoes/config').frete.valorMinimoFrete;
  assert.equal((await f.resolver.publicConfig({storeId:'loja-futura-teste'})).readiness.delivery,'BLOCKED');
  delete f.data.get(root).storeConfigVersion;f.data.delete(root+'/configuracoes/storefront');
  assert.equal((await f.resolver.resolve('loja-futura-teste')).legacy,true);
  assert.equal((await f.resolver.publicConfig({storeId:'loja-futura-teste'})).readiness.delivery,'READY');
});
test('inexistente, inválida, inativa e draft nunca caem em outra loja',async()=>{
  const f=await fixture();for(const id of ['unknown','../matriz']) await assert.rejects(f.resolver.publicConfig({storeId:id}),e=>e.code==='STORE_NOT_FOUND');
  assert.equal((await f.resolver.publicConfig({storeId:'loja-inativa'})).active,false);
  f.data.get('lojas/loja-futura-teste').status='DRAFT';assert.equal((await f.resolver.publicConfig({storeId:'loja-futura-teste'})).readiness.store,'BLOCKED');
});
test('versão inválida não rebaixa a loja silenciosamente ao contrato legado',async()=>{
  const f=await fixture();
  for(const version of [2,'1',null]) {
    f.data.get('lojas/loja-futura-teste').storeConfigVersion=version;
    f.data.delete('lojas/loja-futura-teste/configuracoes/storefront');
    assert.equal((await f.resolver.publicConfig({storeId:'loja-futura-teste'})).readiness.store,'BLOCKED');
  }
});
test('aliases e Festas resolvem somente dados; canal ausente/inválido é negado',async()=>{
  const f=await fixture();assert.equal((await f.resolver.publicConfig({alias:'cardapio-garavelo'})).storeId,'ana-guimaraes-doceria-garavelo');
  const c=await f.resolver.publicConfig({alias:'cardapio-festa'});assert.equal(c.channel.id,'festas');assert.equal(c.storeId,'ana-guimaraes-doceria-matriz');
  await assert.rejects(f.resolver.publicConfig({storeId:'loja-futura-teste',channelId:'festas'}),e=>e.code==='CHANNEL_UNAVAILABLE');
  f.data.get('lojas/ana-guimaraes-doceria-matriz/canais/festas').storeId='loja-inativa';await assert.rejects(f.resolver.publicConfig({alias:'cardapio-festa'}));
});
test('recompra futura consulta preço/estoque atuais da loja histórica',async()=>{
  const f=await fixture(),storeId='loja-futura-teste';
  const api=createCustomerReorder({db:f.db,resolveStore:f.resolver.resolve,getStoreAvailability:f.availability,readOrder:async()=>({order:{id:'historic',storeId,itens:[{productId:'p1',quantity:1,preco:1}]}})});
  const result=await api({data:{}});assert.equal(result.order.storeId,storeId);assert.equal(result.products[0].preco,7);assert.equal(result.products[0].estoque,2);
  assert.ok(f.reads.every(p=>p===`lojas/${storeId}`||p.startsWith(`lojas/${storeId}/`)));
});
