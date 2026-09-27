process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
process.env.GCLOUD_PROJECT='demo-doceria-checkout';
process.env.FUNCTIONS_EMULATOR='true';
const {test,after,before}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const admin=require('firebase-admin');
const originalFetch=global.fetch;
let links=0;
// Only this test process substitutes the external provider. Production has no mock endpoint.
global.fetch=async(url,options)=>{
  if(String(url)==='https://api.checkout.infinitepay.io/links') {links++;return {ok:true,json:async()=>({url:'https://buy.infinitepay.io/test-only'})};}
  if(String(url).startsWith('https://api.checkout.infinitepay.io/')) throw new Error('Unexpected provider call in test');
  return originalFetch(url,options);
};
const functions=require('./index');
const server=http.createServer(functions.api);
const store='http-test-store';let base,token,db;
before(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  db=admin.firestore();
  const r=await originalFetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
  token=(await r.json()).idToken;assert.ok(token,'anonymous emulator token');
  await db.doc(`lojas/${store}`).set({nome:'Loja de teste'});
  await db.doc(`lojas/${store}/configuracoes/config`).set({manualOverride:{mode:'force_open'},frete:{lat:-16,lng:-49,valorPorKm:2}});
  await db.doc(`lojas/${store}/configuracoesInternas/infinitepay`).set({enabled:true,handle:'merchant-test',redirectUrl:'https://example.com/return',webhookUrl:'https://example.com/webhook'});
  await db.doc(`lojas/${store}/produtos/product`).set({nome:'Produto fictício',ativo:true,status:'Ativo',preco:10,estoque:10});
});
after(async()=>{global.fetch=originalFetch;server.closeAllConnections();await new Promise(r=>server.close(r));await admin.app().delete();});
const body=()=>({lojaId:store,cliente:{nome:'Cliente teste',telefone:'62999991234',endereco:'Retirar na Loja'},itens:[{produtoId:'product',quantity:1,preco:10}],pagamento:{forma:'Online'},subtotal:10,valorFrete:0,delivery:{pickup:true},idempotencyKey:'http-test-'+Date.now()});
const send=async b=>{const r=await originalFetch(base+'/checkout/confirmar',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(b)});return {status:r.status,data:await r.json()};};
test('HTTP online reserva uma vez e devolve o mesmo checkout no retry',async()=>{
  const b=body();const a=await send(b);assert.equal(a.status,200,JSON.stringify(a.data));
  const retry=await send(b);assert.equal(retry.status,200);assert.equal(retry.data.id,a.data.id);assert.equal(links,1);
  const order=(await db.doc(`lojas/${store}/pedidos/${a.data.id}`).get()).data();
  assert.equal(order.payment_status,'PENDING');assert.equal(order.order_status,'PENDING');assert.equal(order.status,'Aguardando pagamento');
  assert.equal((await db.doc(`lojas/${store}/produtos/product`).get()).data().estoque,9);
  const conflict=await send({...b,cliente:{...b.cliente,nome:'Outro'}});assert.equal(conflict.status,409);
});
test('falha temporária na consulta do provedor retorna 5xx ao webhook para permitir retry',async()=>{
  const b=body();const created=await send(b);
  assert.equal(created.status,200);
  const response=await originalFetch(base+'/checkout/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_nsu:created.data.paymentId,transaction_nsu:'unavailable',invoice_slug:'unavailable'})});
  assert.equal(response.status,500);
  assert.equal((await db.doc(`checkoutPayments/${created.data.paymentId}`).get()).data().payment_status,'PENDING');
});
test('HTTP rejeita quantidade duplicada/preço/frete manipulados',async()=>{
  const b=body();
  assert.equal((await send({...b,itens:[...b.itens,...b.itens],subtotal:20})).status,400);
  assert.equal((await send({...b,itens:[{...b.itens[0],preco:1}],subtotal:1})).status,409);
  assert.equal((await send({...b,cliente:{...b.cliente,endereco:'Entrega'},delivery:{lat:-17,lng:-49}})).status,409);
});
test('visitante offline preserva criação sem gateway e status não é controlado pelo navegador',async()=>{
  const previousLinks=links;
  const b=body();b.pagamento.forma='Dinheiro';b.status='Entregue';
  const r=await send(b);assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal((await db.doc(`lojas/${store}/pedidos/${r.data.id}`).get()).data().status,'Pendente');assert.equal(links,previousLinks);
});
test('HTTP reserva limite de cupom entre compras concorrentes e libera após expiração',async()=>{
  const {createPaymentService}=require('./checkout-payment');
  const coupon=db.doc(`lojas/${store}/configuracoes/config/cupons/reservation`);
  const customer=db.doc('clientes/http-coupon-reservation');
  await coupon.set({codigo:'RESERVA',status:'Ativo',limiteUso:1,usos:0,tipoDesconto:'fixo',valor:1});
  await customer.set({nome:'Teste',cuponsUsados:[]});
  const b={...body(),cupom:{codigo:'RESERVA'},cliente:{...body().cliente,id:customer.id}};
  const other={...b,idempotencyKey:b.idempotencyKey+'-other'};
  const attempts=await Promise.all([send(b),send(other)]);
  assert.equal(attempts.filter(r=>r.status===200).length,1,JSON.stringify(attempts));
  const accepted=attempts.find(r=>r.status===200).data;
  assert.equal((await coupon.get()).data().usos,0);
  assert.equal((await coupon.get()).data().reservados,1);
  assert.deepEqual((await customer.get()).data().cuponsUsados,[]);
  assert.deepEqual((await customer.get()).data().cuponsReservados,['RESERVA']);
  assert.notEqual((await send({...other,pagamento:{forma:'Dinheiro'}})).status,200);
  const payment=db.doc(`checkoutPayments/${accepted.paymentId}`);
  await payment.update({expiresAt:admin.firestore.Timestamp.fromMillis(1)});
  await createPaymentService({db,admin}).expire(accepted.paymentId);
  assert.equal((await coupon.get()).data().reservados,0);
  assert.deepEqual((await customer.get()).data().cuponsReservados,[]);
  const retry=await send({...b,idempotencyKey:b.idempotencyKey+'-new'});
  assert.equal(retry.status,200,JSON.stringify(retry));
});
