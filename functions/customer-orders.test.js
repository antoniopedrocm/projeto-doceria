const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createCustomerAccount,digest}=require('./checkout-auth');
const {serializeOrder,receiptUrl,getOrderCreatedAt,PAGE_SIZE,SCAN_BATCH_SIZE,MAX_SCAN_CANDIDATES}=require('./customer-orders');
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
        orderBy:field=>{assert.equal(field.toString(),'__name__');return query;},
        startAfter:value=>{start=value.ref.path;return query;},limit:value=>{limit=value;return query;},
        get:async()=>{queries.push({owner,start,limit});let values=[...rows].filter(([path,d])=>path.includes('/pedidos/') && d.clienteId===owner)
          .sort(([p],[q])=>p===q?0:p>q?1:-1);
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
  assert.ok(f.queries.every(q=>q.limit<=SCAN_BATCH_SIZE));assert.ok(f.reads.every(p=>!p.includes('/produtos/')));
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
test('paginação pela data normalizada mantém ordem, desempata datas e não duplica entre páginas',async()=>{
  const f=fixture();for(let i=0;i<43;i++) f.add(`order-${String(i).padStart(2,'0')}`,{createdAt:new Date(1760000000000+Math.floor(i/2)*1000)});
  const first=await f.call('orders');assert.equal(first.orders.length,20);assert.equal(first.hasMore,true);
  const second=await f.call('orders',{cursor:first.nextCursor});const third=await f.call('orders',{cursor:second.nextCursor});
  assert.equal(second.orders.length,20);assert.equal(third.orders.length,3);assert.equal(third.hasMore,false);assert.equal(third.nextCursor,null);
  const all=[...first.orders,...second.orders,...third.orders];assert.equal(new Set(all.map(o=>o.id)).size,43);
  assert.deepEqual(all.map(o=>o.id),Array.from({length:43},(_,i)=>`order-${String(42-i).padStart(2,'0')}`));
  assert.equal(f.queries[1].start,undefined); // Each bounded scan selects the next normalized logical page.
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

test('data centralizada prioriza canônico e aliases históricos válidos sem inventar datas',()=>{
  assert.equal(getOrderCreatedAt({createdAt:new Date('2026-01-01'),dataPedido:'2027-01-01'}),'2026-01-01T00:00:00.000Z');
  assert.equal(getOrderCreatedAt({createdAt:'invalid',dataPedido:'2020-03-01T10:00:00Z'}),'2020-03-01T10:00:00.000Z');
  assert.equal(getOrderCreatedAt({data:'2019-01-01'}),'2019-01-01T00:00:00.000Z');
  assert.equal(getOrderCreatedAt({createdAt:1760000000000}),'2025-10-09T08:53:20.000Z');
  for(const value of [{},{createdAt:false},{createdAt:{}},{dataEntrega:'2026-01-01'},{createdAt:'7'}]) assert.equal(getOrderCreatedAt(value),null);
});
test('ordenação conserva nanossegundos Firestore antes do desempate por caminho',async()=>{
  const {Timestamp}=require('firebase-admin/firestore');const f=fixture();
  f.add('zzz-older',{createdAt:new Timestamp(1760000000,1)});
  f.add('aaa-newer',{createdAt:new Timestamp(1760000000,2)});
  assert.deepEqual((await f.call('orders')).orders.map(o=>o.id),['aaa-newer','zzz-older']);
});
test('lista inclui próprios sem createdAt, usa fallback histórico e coloca sem data ao final',async()=>{
  const f=fixture();f.add('current');f.add('old',{createdAt:undefined,dataPedido:'2020-03-01'});
  f.add('older',{createdAt:null,data:'2019-01-01'});f.add('undated-a',{createdAt:undefined});f.add('undated-b',{createdAt:undefined});
  f.add('private',{createdAt:undefined,dataPedido:'2030-01-01',clienteId:'customer-b',ownerUid:'b'});
  f.add('phone-only',{createdAt:undefined,dataPedido:'2030-01-01',clienteId:null,telefone:'62999990000'});
  const page=await f.call('orders');assert.deepEqual(page.orders.map(o=>o.id),['current','old','older','undated-b','undated-a']);
  assert.equal(page.orders[1].createdAt,'2020-03-01T00:00:00.000Z');assert.equal(page.orders[3].createdAt,null);
  assert.equal((await f.call('orderDetail',{storeId:'matriz',orderId:'old'})).order.createdAt,page.orders[1].createdAt);
});
test('vinte candidatos filtrados não escondem pedidos elegíveis posteriores',async()=>{
  const f=fixture();for(let i=0;i<20;i++) f.add(`aaa-${i}`,{ownerUid:'b'});
  f.add('zzz-valid');assert.deepEqual((await f.call('orders')).orders.map(o=>o.id),['zzz-valid']);
});
test('múltiplos lotes vazios/parciais avançam cursor físico e completam 20 elegíveis',async()=>{
  const f=fixture();for(let i=0;i<250;i++) f.add(`aaa-${String(i).padStart(3,'0')}`,{ownerUid:'b'});
  for(let i=0;i<43;i++) f.add(`zzz-${String(i).padStart(2,'0')}`,{createdAt:i%2?undefined:new Date('2026-01-01'),...(i%2?{data:'2026-01-01'}:{})},i%3?'matriz':'garavelo');
  const all=[];let cursor;
  do {const page=await f.call('orders',cursor?{cursor}:{});all.push(...page.orders);cursor=page.nextCursor;
    if(page.hasMore) assert.equal(page.orders.length,PAGE_SIZE);
  } while(cursor);
  assert.equal(all.length,43);assert.equal(new Set(all.map(o=>`${o.storeId}/${o.id}`)).size,43);
  const expected=[...f.rows].filter(([p,d])=>p.includes('/pedidos/zzz') && d.clienteId==='customer-a').map(([p])=>p).sort().reverse();
  assert.deepEqual(all.map(o=>`lojas/${o.storeId}/pedidos/${o.id}`),expected);
  assert.ok(f.queries.some(q=>q.start?.includes('aaa-')));
  assert.ok(f.queries.every(q=>q.limit<=SCAN_BATCH_SIZE));
});
test('pedidos sem qualquer data paginam deterministicamente e cursor não serve a outro Customer',async()=>{
  const f=fixture();for(let i=0;i<23;i++) f.add(`undated-${String(i).padStart(2,'0')}`,{createdAt:undefined});
  const first=await f.call('orders'),second=await f.call('orders',{cursor:first.nextCursor});
  assert.equal(first.orders.length,20);assert.equal(second.orders.length,3);assert.equal(second.hasMore,false);
  assert.ok([...first.orders,...second.orders].every(o=>o.createdAt===null));
  await assert.rejects(f.call('orders',{cursor:first.nextCursor},'b'),e=>e.code==='not-found');
});
test('fim real de candidatos filtrados retorna vazio, sem cursor e sem loop',async()=>{
  const f=fixture();for(let i=0;i<230;i++) f.add(`discard-${i}`,{ownerUid:'b'});
  assert.deepEqual(await f.call('orders'),{orders:[],nextCursor:null,hasMore:false});assert.equal(f.queries.length,3);
});
test('limite defensivo recusa truncamento silencioso e respeita máximo de leituras',async()=>{
  const f=fixture();for(let i=0;i<=MAX_SCAN_CANDIDATES;i++) f.add(`order-${String(i).padStart(4,'0')}`);
  await assert.rejects(f.call('orders'),e=>e.code==='resource-exhausted');
  assert.equal(f.queries.length,MAX_SCAN_CANDIDATES/SCAN_BATCH_SIZE+1);assert.equal(f.queries.at(-1).limit,1);
});
test('cursor físico sem avanço é interrompido defensivamente',async()=>{
  const f=fixture();const path=f.add('repeated');
  const {createCustomerOrders}=require('./customer-orders');let calls=0;
  const query={where:()=>query,orderBy:()=>query,startAfter:()=>query,limit:()=>query,get:async()=>{calls++;return {docs:Array(SCAN_BATCH_SIZE).fill(f.snap(path))};}};
  const api=createCustomerOrders({resolve:async()=>({customerId:'customer-a',user:{uid:'a'}}),
    db:{collection:()=>({doc:()=>({get:async()=>f.snap('clientes/customer-a')})}),collectionGroup:()=>query}});
  await assert.rejects(api.list({}),e=>e.code==='internal');assert.equal(calls,1);
});
