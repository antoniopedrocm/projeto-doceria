// All writes and Auth users are confined to the local demo emulators.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
process.env.GCLOUD_PROJECT='demo-doceria-checkout';
process.env.FUNCTIONS_EMULATOR='true';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http'),express=require('express'),admin=require('firebase-admin');
const functions=require('./index');
const app=express();app.use(express.json());
app.post('/list',functions.customerOrders);app.post('/detail',functions.customerOrderDetail);app.post('/profile',functions.customerCompleteProfile);
app.post('/reorder',functions.customerReorderPreview);
const server=http.createServer(app),db=admin.firestore();
let base,a,b,anonymous,customerA,customerB;
async function signup(email) {
  const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(email?{email,password:'test-password-123'}:{}),returnSecureToken:true})});
  const data=await response.json();assert.ok(data.idToken);return data;
}
async function send(route,data={},token=a?.idToken) {
  const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({data})});
  return {status:response.status,body:await response.json()};
}
before(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  a=await signup(`history-a-${Date.now()}@example.test`);b=await signup(`history-b-${Date.now()}@example.test`);anonymous=await signup();
  const pa=await send('/profile',{nome:'Customer A',phone:'+5562999991234'}),pb=await send('/profile',{nome:'Customer B',phone:'+5562999991234'},b.idToken);
  assert.equal(pa.status,200);assert.equal(pb.status,200);customerA=pa.body.result.customer.id;customerB=pb.body.result.customer.id;
  const batch=db.batch();
  for(const store of ['history-matriz','history-garavelo']) {
    batch.set(db.doc(`lojas/${store}`),{nome:`Loja ${store}`});
    batch.set(db.doc(`lojas/${store}/configuracoes/config`),{manualOverride:{mode:'force_open'}});
    batch.set(db.doc(`lojas/${store}/produtos/brownie`),{nome:`Brownie ${store}`,preco:store==='history-matriz'?20:16,estoque:3,categoria:'Delivery',status:'Ativo'});
  }
  for(let i=0;i<43;i++) batch.set(db.doc(`lojas/${i%2?'history-matriz':'history-garavelo'}/pedidos/history-${String(i).padStart(2,'0')}`),{
    clienteId:customerA,ownerUid:a.localId,createdAt:admin.firestore.Timestamp.fromMillis(1760000000000+Math.floor(i/2)*1000),
    total:16,subtotal:12,desconto:0,valorFrete:4,clienteEndereco:'Rua histórica, 20',formaPagamento:'Cartão de Crédito',
    itens:[{produtoId:'brownie',nome:'Brownie na compra',quantity:1,preco:12,total:12}],order_status:'CONFIRMED',payment_status:'PAID',receipt_url:'https://receipt.example.test/old'});
  batch.set(db.doc('lojas/history-matriz/pedidos/history-private-b'),{clienteId:customerB,ownerUid:b.localId,createdAt:admin.firestore.Timestamp.now(),total:100,endereco:'Private B'});
  batch.set(db.doc('lojas/history-matriz/pedidos/history-phone-only'),{telefone:'62999991234',createdAt:admin.firestore.Timestamp.now(),total:999});
  await batch.commit();
});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await admin.app().delete();});
test('callable com Auth real pagina por cursor, preserva ordem e isolamento multiloja',async()=>{
  const first=await send('/list',{customerId:customerB,uid:b.localId});assert.equal(first.status,200);
  const second=await send('/list',{cursor:first.body.result.nextCursor}),third=await send('/list',{cursor:second.body.result.nextCursor});
  const pages=[first,second,third].map(r=>r.body.result);
  assert.deepEqual(pages.map(p=>p.orders.length),[20,20,3]);assert.equal(pages[2].hasMore,false);assert.equal(pages[2].nextCursor,null);
  const all=pages.flatMap(p=>p.orders);assert.equal(new Set(all.map(o=>`${o.storeId}/${o.id}`)).size,43);
  assert.deepEqual(all.map(o=>o.id),Array.from({length:43},(_,i)=>`history-${String(42-i).padStart(2,'0')}`));
  assert.equal(new Set(all.map(o=>o.storeId)).size,2);assert.ok(all.every(o=>o.storeName===`Loja ${o.storeId}`));
  const ownB=await send('/list',{},b.idToken);assert.deepEqual(ownB.body.result.orders.map(o=>o.id),['history-private-b']);
});
test('detalhe lê snapshot financeiro/endereço histórico sem escrever nem consultar catálogo',async()=>{
  const ref=db.doc('lojas/history-garavelo/pedidos/history-42'),before=(await ref.get()).data();
  const result=await send('/detail',{storeId:'history-garavelo',orderId:'history-42',customerId:customerB});assert.equal(result.status,200);
  const order=result.body.result.order;assert.equal(order.total,16);assert.equal(order.frete,4);assert.equal(order.itens[0].preco,12);
  assert.equal(order.endereco,'Rua histórica, 20');assert.equal(order.receipt_url,'https://receipt.example.test/old');assert.equal(order.payment_status,'PAID');
  assert.deepEqual((await ref.get()).data(),before);
});
test('pedido/cursor de B e inexistente retornam erro indistinguível sem detalhes privados',async()=>{
  const peer=await send('/detail',{storeId:'history-matriz',orderId:'history-private-b'});
  const absent=await send('/detail',{storeId:'history-matriz',orderId:'missing'});
  assert.equal(peer.status,404);assert.deepEqual(peer.body,absent.body);assert.doesNotMatch(JSON.stringify(peer.body),/Private B|100|customer-/);
  const cursor=await send('/list',{cursor:'lojas/history-matriz/pedidos/history-private-b'});assert.equal(cursor.status,404);
  const previous=(await send('/list')).body.result.nextCursor;
  assert.equal((await send('/list',{cursor:previous},b.idToken)).status,404);
});
test('ausência de Auth/sessão anônima não concede histórico ou detalhe privado',async()=>{
  for(const token of [null,anonymous.idToken]) {
    const list=await send('/list',{customerId:customerA},token),detail=await send('/detail',{storeId:'history-garavelo',orderId:'history-42'},token);
    assert.equal(list.status,401);assert.equal(detail.status,401);assert.equal(list.body.error.status,'UNAUTHENTICATED');
  }
});
test('Firestore real inclui datas legadas/ausentes e mantém ordenação entre páginas',async()=>{
  const user=await signup(`history-legacy-${Date.now()}@example.test`);
  const profile=await send('/profile',{nome:'Legacy dates',phone:'+5562999991234'},user.idToken);
  const owner={clienteId:profile.body.result.customer.id,ownerUid:user.localId,total:16};
  const batch=db.batch();
  for(let i=0;i<23;i++) batch.set(db.doc(`lojas/history-matriz/pedidos/legacy-${String(i).padStart(2,'0')}`),{
    ...owner,...(i<20?{createdAt:admin.firestore.Timestamp.fromMillis(1760000000000+i*1000)}:i===20?{dataPedido:'2020-03-01'}:i===21?{data:'2019-01-01'}:{})});
  await batch.commit();
  const first=(await send('/list',{},user.idToken)).body.result;
  const second=(await send('/list',{cursor:first.nextCursor},user.idToken)).body.result;
  assert.equal(first.orders.length,20);assert.deepEqual(second.orders.map(o=>o.id),['legacy-20','legacy-21','legacy-22']);
  assert.equal(second.orders[0].createdAt,'2020-03-01T00:00:00.000Z');assert.equal(second.orders[2].createdAt,null);
  assert.equal(second.nextCursor,null);assert.equal(second.hasMore,false);
  const detail=await send('/detail',{storeId:'history-matriz',orderId:'legacy-20'},user.idToken);
  assert.equal(detail.body.result.order.createdAt,second.orders[0].createdAt);
});
test('Firestore real atravessa lotes totalmente filtrados sem perder pedidos próprios multiloja',async()=>{
  const user=await signup(`history-filtered-${Date.now()}@example.test`);
  const profile=await send('/profile',{nome:'Filtered batches',phone:'+5562999991234'},user.idToken);
  const owner={clienteId:profile.body.result.customer.id,total:16,createdAt:admin.firestore.Timestamp.fromMillis(1760000000000)};
  const batch=db.batch();
  for(let i=0;i<220;i++) batch.set(db.doc(`lojas/history-garavelo/pedidos/aaa-filtered-${i}`),{...owner,ownerUid:b.localId});
  for(let i=0;i<25;i++) batch.set(db.doc(`lojas/${i%2?'history-matriz':'history-garavelo'}/pedidos/zzz-valid-${String(i).padStart(2,'0')}`),{...owner,ownerUid:user.localId});
  await batch.commit();
  const first=(await send('/list',{},user.idToken)).body.result;
  const second=(await send('/list',{cursor:first.nextCursor},user.idToken)).body.result;
  assert.deepEqual([first.orders.length,second.orders.length],[20,5]);
  const all=[...first.orders,...second.orders];assert.equal(new Set(all.map(o=>`${o.storeId}/${o.id}`)).size,25);
  assert.ok(all.every(o=>o.id.startsWith('zzz-valid')));assert.equal(new Set(all.map(o=>o.storeId)).size,2);
  assert.equal(second.hasMore,false);assert.equal(second.nextCursor,null);
});

test('recompra callable autentica ownership e lê produto corrente somente da loja original',async()=>{
  const ref=db.doc('lojas/history-garavelo/pedidos/history-42'),before=(await ref.get()).data();
  const paymentsBefore=(await db.collection('checkoutPayments').get()).size;
  const result=await send('/reorder',{storeId:'history-garavelo',orderId:'history-42',customerId:customerB});
  assert.equal(result.status,200);assert.equal(result.body.result.order.itens[0].productId,'brownie');
  assert.equal(result.body.result.products[0].preco,16);assert.equal(result.body.result.products[0].nome,'Brownie history-garavelo');
  assert.doesNotMatch(JSON.stringify(result.body.result),/receipt_url|Rua histórica|payment_status/);
  assert.deepEqual((await ref.get()).data(),before);assert.equal((await db.collection('checkoutPayments').get()).size,paymentsBefore);
  const matrix=await send('/reorder',{storeId:'history-matriz',orderId:'history-41'});assert.equal(matrix.body.result.products[0].preco,20);
});
test('recompra privada recusa visitante/telefone anônimo, Customer alheio e orderId inexistente',async()=>{
  for(const token of [null,anonymous.idToken,b.idToken]) {
    const response=await send('/reorder',{storeId:'history-garavelo',orderId:'history-42',customerId:customerA},token);
    assert.equal(response.status,token===b.idToken?404:401);
  }
  const peer=await send('/reorder',{storeId:'history-matriz',orderId:'history-private-b'});
  const missing=await send('/reorder',{storeId:'history-matriz',orderId:'missing'});assert.deepEqual(peer.body,missing.body);
  assert.equal((await send('/reorder',{storeId:'history-matriz',orderId:'history-phone-only'})).status,404);
});
test('recompra respeita horário e falha segura sem configuração sem alterar histórico',async()=>{
  const ref=db.doc('lojas/history-garavelo/configuracoes/config'),previous=(await ref.get()).data();
  try {
    await ref.set({manualOverride:{mode:'force_closed'}});
    assert.equal((await send('/reorder',{storeId:'history-garavelo',orderId:'history-42'})).status,400);
    await ref.delete();assert.equal((await send('/reorder',{storeId:'history-garavelo',orderId:'history-42'})).body.error.status,'FAILED_PRECONDITION');
  } finally {await ref.set(previous);}
});
test('recompra não usa produto de outra loja como fallback e limita IDs enviados',async()=>{
  await db.doc('lojas/history-matriz/produtos/only-matrix').set({nome:'Matriz only',preco:1,categoria:'Delivery'});
  const result=await send('/reorder',{storeId:'history-garavelo',orderId:'history-42',cartProductIds:['only-matrix']});
  assert.deepEqual(result.body.result.products.map(p=>p.id),['brownie']);
  assert.equal((await send('/reorder',{storeId:'history-garavelo',orderId:'history-42',cartProductIds:['../private']})).status,400);
});
