const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createCustomerAccount,digest}=require('./checkout-auth');
const {serializeOrder}=require('./customer-orders');
function fixture(provider='password') {
  const rows=new Map(),reads=[];
  for(const uid of ['a','b']) {
    rows.set(`clientes/customer-${uid}`,{authOwnerUid:uid});
    rows.set(`customerAuthIdentities/${digest(provider==='google.com'?'google':'email_password',provider==='google.com'?`google-${uid}`:uid)}`,{customerId:`customer-${uid}`});
  }
  rows.set('lojas/matriz',{nome:'Matriz'});rows.set('lojas/garavelo',{nome:'Garavelo'});
  rows.set('lojas/matriz/configuracoes/config',{manualOverride:{mode:'force_open'}});
  rows.set('lojas/matriz/produtos/brownie',{nome:'Brownie atual',preco:16,estoque:3,categoria:'Delivery',status:'Ativo'});
  rows.set('lojas/matriz/pedidos/old',{clienteId:'customer-a',ownerUid:'a',itens:[{produtoId:'brownie',nome:'Antigo',preco:12,quantity:4}],total:52,
    valorFrete:4,cupom:{codigo:'OLD'},clienteEndereco:'Endereço histórico',payment_status:'PAID',order_nsu:'old-nsu',receipt_url:'https://example.test/old'});
  const snap=path=>({id:path.split('/').at(-1),ref:{path},exists:rows.has(path),data:()=>rows.get(path)});
  const db={doc:path=>({path,get:async()=>{reads.push(path);return snap(path);}}),collection:name=>({doc:id=>db.doc(`${name}/${id}`)}),
    getAll:async(...refs)=>Promise.all(refs.map(ref=>ref.get()))};
  const api=createCustomerAccount({db,admin:{auth:()=>({getUser:async uid=>({uid,email:`${uid}@example.test`,providerData:[{providerId:provider,uid:`google-${uid}`} ]})})},
    getStoreAvailability:config=>config?.manualOverride?.mode==='force_open'?'OPEN':config?.manualOverride?.mode==='force_closed'?'CLOSED':'CONFIG_UNAVAILABLE'});
  const request=(uid='a',extra={})=>({auth:{uid,token:{email:`${uid}@example.test`,firebase:{identities:provider==='google.com'?{'google.com':[`google-${uid}`]}:{email:[`${uid}@example.test`]}}}},
    data:{storeId:'matriz',orderId:'old',...extra}});
  return {db,rows,reads,snap,api,request,call:(extra={},uid='a')=>api.reorderPreview(request(uid,extra))};
}
test('recompra lê somente pedido próprio e catálogo atual da loja original, sem qualquer escrita',async()=>{
  const f=fixture(),before=JSON.stringify([...f.rows]);const result=await f.call({customerId:'customer-b',authUid:'b'});
  assert.equal(result.order.storeId,'matriz');assert.equal(result.order.itens[0].productId,'brownie');
  assert.equal(result.products[0].preco,16);assert.equal(result.products[0].estoque,3);assert.equal(result.products[0].available,true);
  assert.doesNotMatch(JSON.stringify(result),/old-nsu|Endereço histórico|OLD|receipt_url|payment_status/);
  assert.equal(JSON.stringify([...f.rows]),before);assert.ok(f.reads.filter(p=>p.includes('/produtos/')).every(p=>p.startsWith('lojas/matriz/')));
});
test('IDs reais produtoId/productId/id são serializados e nomes não viram IDs',()=>{
  const f=fixture();for(const key of ['produtoId','productId','id']) {
    f.rows.get('lojas/matriz/pedidos/old').itens=[{[key]:'brownie',nome:'Antigo'}];assert.equal(serializeOrder(f.snap('lojas/matriz/pedidos/old')).itens[0].productId,'brownie');
  }
  f.rows.get('lojas/matriz/pedidos/old').itens=[{nome:'brownie'},{produtoId:'../../private'}];
  assert.ok(serializeOrder(f.snap('lojas/matriz/pedidos/old')).itens.every(i=>i.productId===null));
});
test('Customer B, ID arbitrário e pedido legado falham antes de consultar catálogo',async()=>{
  const f=fixture();await assert.rejects(f.call({},'b'),e=>e.code==='not-found');
  await assert.rejects(f.call({orderId:'missing'}),e=>e.code==='not-found');
  f.rows.get('lojas/matriz/pedidos/old').clienteId=null;
  await assert.rejects(f.call(),e=>e.code==='not-found');assert.ok(f.reads.every(p=>!p.includes('/produtos/')));
});
test('visitante/telefone legado não acessam recompra; Google autenticado acessa',async()=>{
  const f=fixture();await assert.rejects(f.api.reorderPreview({data:{storeId:'matriz',orderId:'old'}}),e=>e.code==='unauthenticated');
  await assert.rejects(fixture('phone').call(),e=>e.code==='unauthenticated');assert.equal((await fixture('google.com').call()).products.length,1);
});
test('loja ausente, inativa, fechada ou configuração indisponível bloqueiam preparação',async()=>{
  for(const mode of ['missing','inactive','closed','config']) {
    const f=fixture();if(mode==='missing') f.rows.delete('lojas/matriz');
    if(mode==='inactive') f.rows.get('lojas/matriz').ativo=false;
    if(mode==='closed') f.rows.get('lojas/matriz/configuracoes/config').manualOverride.mode='force_closed';
    if(mode==='config') f.rows.delete('lojas/matriz/configuracoes/config');
    await assert.rejects(f.call(),e=>e.code==='failed-precondition');assert.ok(f.reads.every(p=>!p.includes('/produtos/')));
  }
});
test('catálogo trata removido, inativo, categoria, preço inválido e propriedade de loja',async()=>{
  for(const patch of [{status:'Inativo'},{ativo:false},{categoria:'Outro'},{preco:''},{preco:-1},{preco:'invalid'},{storeId:'garavelo'},{lojaId:'garavelo'}]) {
    const f=fixture();Object.assign(f.rows.get('lojas/matriz/produtos/brownie'),patch);assert.equal((await f.call()).products[0].available,false);
  }
  const f=fixture();f.rows.delete('lojas/matriz/produtos/brownie');assert.deepEqual((await f.call()).products,[]);
});
test('estoque nulo/ausente é não controlado; zero e malformado não são liberados',async()=>{
  for(const stock of [null,undefined,0,'invalid']) {
    const f=fixture();f.rows.get('lojas/matriz/produtos/brownie').estoque=stock;
    assert.equal((await f.call()).products[0].estoque,stock===null || stock===undefined?null:0);
  }
});
test('IDs extras são limitados e sempre consultados na loja do pedido, sem fallback',async()=>{
  const f=fixture();f.rows.set('lojas/garavelo/produtos/secret',{nome:'Outra loja',preco:1,categoria:'Delivery'});
  assert.deepEqual((await f.call({cartProductIds:['secret']})).products.map(p=>p.id),['brownie']);
  assert.ok(f.reads.every(p=>!p.startsWith('lojas/garavelo/')));
  for(const ids of [['../secret'],Array(101).fill('brownie'),'brownie']) await assert.rejects(f.call({cartProductIds:ids}),e=>e.code==='invalid-argument');
});
test('falha de leitura propaga sem criar pedido/pagamento nem modificar pedido histórico',async()=>{
  const f=fixture(),before=JSON.stringify([...f.rows]);f.db.getAll=async()=>{throw Error('read unavailable');};
  await assert.rejects(f.call(),/read unavailable/);assert.equal(JSON.stringify([...f.rows]),before);
});
