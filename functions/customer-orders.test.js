const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createCustomerAccount,digest}=require('./checkout-auth');
const {serializeOrder,receiptUrl,PAGE_SIZE}=require('./customer-orders');
function fixture(provider='password') {
  const users=Object.fromEntries(['a','b'].map(uid=>[uid,{uid,email:`${uid}@example.com`,providerData:[{providerId:provider,uid:provider==='google.com'?`google-${uid}`:`${uid}@example.com`}]}]));
  const rows=new Map(),reads=[],queries=[];
  for(const uid of ['a','b']) {
    rows.set(`clientes/customer-${uid}`,{authOwnerUid:uid,telefone:'62999990000',enderecos:[{enderecoCompleto:'Endereço atual'}]});
    rows.set(`customerAuthIdentities/${digest(provider==='google.com'?'google':'email_password',provider==='google.com'?`google-${uid}`:uid)}`,{customerId:`customer-${uid}`});
  }
  for(const store of ['matriz','garavelo']) rows.set(`lojas/${store}`,{nome:`Loja ${store}`,secret:'never return'});
  const snap=path=>({id:path.split('/').at(-1),ref:{path},exists:rows.has(path),data:()=>rows.get(path)});
  const db={doc:path=>({get:async()=>{reads.push(path);return snap(path);}}),collection:name=>({doc:id=>db.doc(`${name}/${id}`)}),
    getAll:async(...refs)=>Promise.all(refs.map(ref=>ref.get())),
    collectionGroup:name=>{
      assert.equal(name,'pedidos');let owner,start,limit;
      const query={where:(field,op,value)=>{assert.equal(field,'clienteId');assert.equal(op,'==');owner=value;return query;},
        orderBy:(field,direction)=>{assert.equal(field,'createdAt');assert.equal(direction,'desc');return query;},
        startAfter:value=>{start=value.ref.path;return query;},limit:value=>{limit=value;return query;},
        get:async()=>{queries.push({owner,start,limit});let values=[...rows].filter(([path,d])=>path.includes('/pedidos/') && d.clienteId===owner && d.createdAt!==undefined)
          .sort(([p,a],[q,b])=>new Date(b.createdAt)-new Date(a.createdAt) || q.localeCompare(p));
          if(start) values=values.slice(values.findIndex(([path])=>path===start)+1);
          return {docs:values.slice(0,limit).map(([path])=>snap(path))};}};
      return query;
    }};
  const api=createCustomerAccount({db,admin:{auth:()=>({getUser:async uid=>users[uid]})}});
  const request=(uid='a',data={})=>({auth:{uid,token:{email:`${uid}@example.com`,firebase:{identities:provider==='google.com'?{'google.com':[`google-${uid}`]}:{email:[`${uid}@example.com`]}}}},data});
  const call=(method,data={},uid='a')=>api[method](request(uid,data));
  const add=(id,extra={},store='matriz')=>{const path=`lojas/${store}/pedidos/${id}`;rows.set(path,{clienteId:'customer-a',ownerUid:'a',createdAt:new Date('2026-10-01T17:00:00Z'),total:16,...extra});return path;};
  return {api,rows,reads,queries,snap,call,add,request,users};
}
test('listagem usa identidade própria, exclui legado por telefone e não mistura Customers/lojas',async()=>{
  const f=fixture();f.add('a');f.add('cross',{clienteId:'customer-b',ownerUid:'b'});f.add('legacy',{clienteId:null,telefone:'62999990000'});
  f.add('wrong-owner',{ownerUid:'b'});f.add('second',{},'garavelo');
  f.rows.set('outra/x/pedidos/misplaced',{clienteId:'customer-a',createdAt:new Date(),total:999});
  const a=await f.call('orders',{customerId:'customer-b',uid:'b'});
  assert.deepEqual(new Set(a.orders.map(o=>o.id)),new Set(['a','second']));
  assert.deepEqual(new Set(a.orders.map(o=>o.storeId)),new Set(['matriz','garavelo']));
  assert.ok(a.orders.every(o=>o.storeName===`Loja ${o.storeId}`));
  assert.deepEqual((await f.call('orders',{},'b')).orders.map(o=>o.id),['cross']);
  assert.ok(f.queries.every(q=>q.limit===PAGE_SIZE+1));assert.ok(f.reads.every(p=>!p.includes('/produtos/')));
});
test('histórico privado recusa visitante, identidade de celular e ownership adulterado',async()=>{
  const f=fixture();await assert.rejects(f.api.orders({data:{customerId:'customer-a'}}),e=>e.code==='unauthenticated');
  f.users.a.providerData=[{providerId:'phone',uid:'62999990000'}];await assert.rejects(f.call('orders'),e=>e.code==='unauthenticated');
  f.users.a.providerData=[{providerId:'password'}];f.rows.get('clientes/customer-a').authOwnerUid='b';
  await assert.rejects(f.call('orders'),e=>e.code==='permission-denied');assert.equal(f.queries.length,0);
});
test('Google e password acessam o próprio histórico sem exigir e-mail verificado',async()=>{
  for(const provider of ['google.com','password']) {const f=fixture(provider);f.add('own');assert.equal((await f.call('orders')).orders[0].id,'own');}
});
test('paginação por snapshot mantém ordem, desempata datas e não duplica entre páginas',async()=>{
  const f=fixture();for(let i=0;i<43;i++) f.add(`order-${String(i).padStart(2,'0')}`,{createdAt:new Date(1760000000000+Math.floor(i/2)*1000)});
  const first=await f.call('orders');assert.equal(first.orders.length,20);assert.equal(first.hasMore,true);
  const second=await f.call('orders',{cursor:first.nextCursor});const third=await f.call('orders',{cursor:second.nextCursor});
  assert.equal(second.orders.length,20);assert.equal(third.orders.length,3);assert.equal(third.hasMore,false);assert.equal(third.nextCursor,null);
  const all=[...first.orders,...second.orders,...third.orders];assert.equal(new Set(all.map(o=>o.id)).size,43);
  assert.deepEqual(all.map(o=>o.id),Array.from({length:43},(_,i)=>`order-${String(42-i).padStart(2,'0')}`));
  assert.equal(f.queries[1].start,first.nextCursor);
});
test('cursor de outro Customer, arbitrário ou de outra coleção não autoriza paginação',async()=>{
  const f=fixture();const path=f.add('private',{clienteId:'customer-b',ownerUid:'b'});
  for(const cursor of [path,'clientes/customer-b','lojas/matriz/pedidos/missing','../../private',{},''])
    await assert.rejects(f.call('orders',{cursor}),e=>e.code==='not-found' && e.message==='Pedido não encontrado.');
});
test('detalhe usa caminho da loja e retorna mesmo erro para pedido alheio/inexistente',async()=>{
  const f=fixture();f.add('same');f.add('same',{clienteId:'customer-b',ownerUid:'b'},'garavelo');
  assert.equal((await f.call('orderDetail',{storeId:'matriz',orderId:'same',customerId:'customer-b'})).order.storeId,'matriz');
  for(const args of [{storeId:'garavelo',orderId:'same'},{storeId:'matriz',orderId:'missing'},{storeId:'../garavelo',orderId:'same'},{orderId:'same'}])
    await assert.rejects(f.call('orderDetail',args),e=>e.code==='not-found' && e.message==='Pedido não encontrado.');
  await assert.rejects(f.api.orderDetail({data:{storeId:'matriz',orderId:'same'}}),e=>e.code==='unauthenticated');
});
test('snapshots financeiros e endereço histórico permanecem sem catálogo/perfil atual',async()=>{
  const f=fixture();const path=f.add('historic',{numeroPedido:1048,lojaNome:'Nome na compra',subtotal:12,desconto:2,valorFrete:4,total:14,clienteEndereco:'Rua antiga, 20',
    itens:[{nome:'Brownie histórico',description:'Descrição antiga',quantity:1,preco:12,total:12}],order_status:'DELIVERED',payment_status:'PAID',formaPagamento:'Pix',receipt_url:'https://receipt.infinitepay.io/receipt',
    PAN:'4111111111111111',CVV:'123',paymentToken:'secret'});
  const before=JSON.stringify(f.rows.get(path));const result=(await f.call('orderDetail',{storeId:'matriz',orderId:'historic'})).order;
  assert.equal(result.total,14);assert.equal(result.subtotal,12);assert.equal(result.desconto,2);assert.equal(result.frete,4);
  assert.equal(result.itens[0].preco,12);assert.equal(result.itens[0].total,12);assert.equal(result.endereco,'Rua antiga, 20');assert.equal(result.storeName,'Nome na compra');
  assert.equal(result.status,'DELIVERED');assert.equal(result.payment_status,'PAID');assert.match(result.receipt_url,/receipt/);
  assert.equal(JSON.stringify(f.rows.get(path)),before);assert.doesNotMatch(JSON.stringify(result),/4111111111111111|CVV|paymentToken|Endereço atual/);
});
test('schemas antigos/campos ausentes preservam total, status separado e retirada',async()=>{
  const f=fixture();const path=f.add('legacy',{ownerUid:undefined,createdAt:undefined,dataPedido:'2020-03-01T10:00:00Z',status:'Finalizado',clienteEndereco:'Retirar na Loja',itens:[{nome:'Antigo',quantidade:2,preco:7}],total:14});
  const order=serializeOrder(f.snap(path));assert.equal(order.modalidade,'retirada');assert.equal(order.endereco,'');assert.equal(order.total,14);
  assert.equal(order.payment_status,null);assert.equal(order.receipt_url,null);assert.equal(order.subtotal,null);assert.equal(order.itens[0].quantity,2);assert.equal(order.itens[0].total,14);assert.match(order.createdAt,/2020/);
  assert.equal((await f.call('orderDetail',{storeId:'matriz',orderId:'legacy'})).order.total,14);
  // eslint-disable-next-line no-script-url -- Deliberately unsafe receipt fixture.
  f.rows.set(path,{clienteId:'customer-a',itens:'invalid',total:'invalid',createdAt:'invalid',formaPagamento:'4111111111111111',receipt_url:'javascript:alert(1)',clienteEndereco:{texto:'Endereço antigo'}});
  const malformed=serializeOrder(f.snap(path));assert.deepEqual(malformed.itens,[]);assert.equal(malformed.total,null);assert.equal(malformed.createdAt,null);assert.equal(malformed.formaPagamento,'');assert.equal(malformed.endereco,'Endereço antigo');
});
test('comprovante opcional aceita HTTPS sem credenciais e ignora URLs inseguras',()=>{
  // eslint-disable-next-line no-script-url -- These malicious schemes must be rejected.
  for(const url of [null,'javascript:alert(1)','http://receipt.example.com','https://user:secret@example.com','data:text/html,secret']) assert.equal(receiptUrl(url),null);
  assert.equal(receiptUrl('https://receipt.example.com/order'),'https://receipt.example.com/order');
});
test('nenhum pedido não produz cursor e pedido único mantém pagamento sem inferir pelo status',async()=>{
  const f=fixture();assert.deepEqual(await f.call('orders'),{orders:[],nextCursor:null,hasMore:false});
  f.add('single',{order_status:'CONFIRMED',payment_status:'FAILED'});const page=await f.call('orders');
  assert.equal(page.orders.length,1);assert.equal(page.orders[0].payment_status,'FAILED');assert.equal(page.hasMore,false);
});
