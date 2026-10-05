process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
process.env.GCLOUD_PROJECT='demo-doceria-checkout';
process.env.FUNCTIONS_EMULATOR='true';
process.env.GOOGLE_MAPS_SERVER_API_KEY='test-only-not-a-real-key';
const {test,after,before}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const admin=require('firebase-admin');
const {digest}=require('./checkout-auth');
const originalFetch=global.fetch;
let links=0;
const linkBodies=[];
// Only this test process substitutes the external provider. Production has no mock endpoint.
global.fetch=async(url,options)=>{
  if(String(url).startsWith('https://maps.googleapis.com/maps/api/distancematrix/json?')) {
    const params=new URL(url).searchParams;
    assert.equal(params.get('mode'),'driving');
    assert.equal(params.get('key'),'test-only-not-a-real-key');
    const meters=params.get('destinations')==='Rua de teste' ? 2000 : 6000;
    return {ok:true,json:async()=>({status:'OK',rows:[{elements:[{status:'OK',distance:{value:meters}}]}]})};
  }
  if(String(url)==='https://api.checkout.infinitepay.io/links') {links++;linkBodies.push(JSON.parse(options.body));return {ok:true,json:async()=>({url:'https://buy.infinitepay.io/test-only'})};}
  if(String(url).startsWith('https://api.checkout.infinitepay.io/')) throw new Error('Unexpected provider call in test');
  return originalFetch(url,options);
};
const functions=require('./index');
const server=http.createServer(functions.api);
const store='http-test-store';let base,token,anonymousToken,customerId,db;
before(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  db=admin.firestore();
  const r=await originalFetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
  anonymousToken=(await r.json()).idToken;assert.ok(anonymousToken,'anonymous emulator token');
  const email=`checkout-${Date.now()}@example.test`;
  const accountResponse=await originalFetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'test-password-123',returnSecureToken:true})});
  const account=await accountResponse.json();token=account.idToken;assert.ok(token,'email emulator token');
  customerId=`http-customer-${account.localId}`;
  await db.doc(`clientes/${customerId}`).set({authOwnerUid:account.localId,nome:'Cliente teste',telefone:'62999991234',cuponsUsados:[]});
  await db.doc(`customerAuthIdentities/${digest('email_password',account.localId)}`).set({customerId,provider:'email_password',subject:account.localId,uid:account.localId});
  await db.doc(`lojas/${store}`).set({nome:'Loja de teste'});
  await db.doc(`lojas/${store}/configuracoes/config`).set({manualOverride:{mode:'force_open'},frete:{lat:-16,lng:-49,valorPorKm:2}});
  await db.doc(`lojas/${store}/configuracoesInternas/infinitepay`).set({enabled:true,handle:'merchant-test',redirectUrl:'https://example.com/return',webhookUrl:'https://example.com/webhook'});
  await db.doc(`lojas/${store}/produtos/product`).set({nome:'Produto fictício',ativo:true,status:'Ativo',preco:10,estoque:10});
});
after(async()=>{global.fetch=originalFetch;server.closeAllConnections();await new Promise(r=>server.close(r));await admin.app().delete();});
const body=()=>({lojaId:store,cliente:{id:customerId,nome:'Cliente teste',telefone:'62999991234',endereco:'Retirar na Loja'},itens:[{produtoId:'product',quantity:1,preco:10}],pagamento:{forma:'Online'},subtotal:10,valorFrete:0,delivery:{pickup:true},idempotencyKey:'http-test-'+Date.now()});
const send=async (b,bearer=token)=>{const r=await originalFetch(base+'/checkout/confirmar',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+bearer},body:JSON.stringify(b)});return {status:r.status,data:await r.json()};};
test('visitante e sessão anônima não iniciam pagamento online',async()=>{
  const b=body();
  assert.equal((await send(b,anonymousToken)).status,403);
  assert.equal((await send({...b,cliente:{...b.cliente,id:'demo-celular'}})).status,403);
});
test('HTTP online reserva uma vez e devolve o mesmo checkout no retry',async()=>{
  const b=body();const a=await send(b);assert.equal(a.status,200,JSON.stringify(a.data));
  const retry=await send(b);assert.equal(retry.status,200);assert.equal(retry.data.id,a.data.id);assert.equal(links,1);
  const order=(await db.doc(`lojas/${store}/pedidos/${a.data.id}`).get()).data();
  assert.equal(order.payment_status,'PENDING');assert.equal(order.order_status,'PENDING');assert.equal(order.status,'Aguardando pagamento');
  assert.equal((await db.doc(`lojas/${store}/produtos/product`).get()).data().estoque,9);
  const conflict=await send({...b,cliente:{...b.cliente,nome:'Outro'}});assert.equal(conflict.status,409);
});

test('HTTP mantém item 12 + frete 4 no pedido e no valor enviado à InfinitePay',async()=>{
  await db.doc(`lojas/${store}/produtos/freight-test`).set({nome:'Doce teste',ativo:true,status:'Ativo',preco:12,estoque:2});
  const b=body();
  Object.assign(b,{itens:[{produtoId:'freight-test',quantity:1,preco:12}],subtotal:12,valorFrete:4,distanciaFreteKm:2,
    whatsappConsent:{accepted:true,version:'order-confirmation-v1'},delivery:{pickup:false,lat:-16,lng:-49}});
  b.cliente.endereco='Rua de teste';
  const result=await send(b);
  assert.equal(result.status,200,JSON.stringify(result));
  const order=(await db.doc(`lojas/${store}/pedidos/${result.data.id}`).get()).data();
  const payment=(await db.doc(`checkoutPayments/${result.data.paymentId}`).get()).data();
  assert.equal(order.valorFrete,4);
  assert.equal(order.total,16);
  assert.equal(payment.amount,1600);
  assert.equal(linkBodies.at(-1).items[0].price,1600);
  assert.equal(linkBodies.at(-1).handle,'merchant-test');
  assert.equal(order.whatsappConfirmation.consent.granted,true);
  assert.equal(result.data.whatsappPhoneStatus,'valid');
  const retry=await send(b);
  assert.equal(retry.data.id,result.data.id);
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
test('HTTP valida frete e distância contra endereço server-side e snapshot no retry',async()=>{
  const b=body();
  Object.assign(b,{cliente:{...b.cliente,endereco:'Rua de teste'},valorFrete:4,distanciaFreteKm:2,
    delivery:{pickup:false,lat:-80,lng:100}});
  // Caller coordinates cannot replace the persisted delivery address in pricing.
  const accepted=await send(b);assert.equal(accepted.status,200,JSON.stringify(accepted));
  const attempts=[{valorFrete:1},{valorFrete:0},{valorFrete:4,frete:0},
    {valorFrete:false},{distanciaFreteKm:0},{cliente:{...b.cliente,endereco:'Outro endereço'}},
    {cliente:{...b.cliente,endereco:'Retirar na Loja'},delivery:{pickup:false}}];
  for(const changes of attempts) {
    const response=await send({...b,...changes,idempotencyKey:require('node:crypto').randomUUID()});
    assert.equal(response.status,409,JSON.stringify({changes,response}));
  }
  assert.equal((await send({...b,valorFrete:0})).status,409);
  assert.equal((await send(b)).data.id,accepted.data.id);
  const legacy=await originalFetch(base+`/pedidos?lojaId=${store}`,{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({itens:b.itens,clienteEndereco:'Rua de teste',distanciaFreteKm:2,frete:0})});
  assert.equal(legacy.status,409);
  const alias=await originalFetch(base+`/pedidos?lojaId=${store}`,{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({itens:b.itens,clienteEndereco:'Outro endereço',cliente:{endereco:'Rua de teste'},frete:4,distanciaFreteKm:2})});
  assert.equal(alias.status,409);
  const offline=await send({...b,cliente:{...b.cliente,id:null},pagamento:{forma:'Dinheiro'},
    idempotencyKey:require('node:crypto').randomUUID()},anonymousToken);
  assert.equal(offline.status,200,JSON.stringify(offline));
  assert.equal(offline.data.total,14);
  const configRef=db.doc(`lojas/${store}/configuracoes/config`);
  const original=(await configRef.get()).data();
  try {
    await configRef.set({...original,frete:{...original.frete,valorPorKm:0,valorMinimoFrete:0}});
    const zero=await send({...b,valorFrete:0,idempotencyKey:require('node:crypto').randomUUID()});
    assert.equal(zero.status,200,JSON.stringify(zero));
    assert.equal((await db.doc(`lojas/${store}/pedidos/${zero.data.id}`).get()).data().valorFrete,0);
  } finally {await configRef.set(original);}
});
test('visitante offline preserva criação sem gateway e status não é controlado pelo navegador',async()=>{
  const previousLinks=links;
  const b=body();b.pagamento.forma='Dinheiro';b.status='Entregue';b.cliente.id=null;
  const r=await send(b,anonymousToken);assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal((await db.doc(`lojas/${store}/pedidos/${r.data.id}`).get()).data().status,'Pendente');assert.equal(links,previousLinks);
});
test('HTTP reserva limite de cupom entre compras concorrentes e libera após expiração',async()=>{
  const {createPaymentService}=require('./checkout-payment');
  const coupon=db.doc(`lojas/${store}/configuracoes/config/cupons/reservation`);
  const customer=db.doc(`clientes/${customerId}`);
  await coupon.set({codigo:'RESERVA',status:'Ativo',limiteUso:1,usos:0,tipoDesconto:'fixo',valor:1});
  await customer.set({cuponsUsados:[],cuponsReservados:[]},{merge:true});
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

test('HTTP distingue loja fechada de configuração operacional indisponível',async()=>{
  const configRef=db.doc(`lojas/${store}/configuracoes/config`);
  const originalConfig=(await configRef.get()).data();
  const attempt=()=>send({...body(),idempotencyKey:`availability-${require('node:crypto').randomUUID()}`});
  const previousLinks=links;
  try {
    await configRef.delete();
    const missing=await attempt();
    assert.equal(missing.status,503,JSON.stringify(missing));
    assert.equal(missing.data.code,'CONFIG_UNAVAILABLE');
    const legacy=await originalFetch(base+`/pedidos?lojaId=${store}`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body())
    });
    assert.equal(legacy.status,503);
    assert.equal((await legacy.json()).code,'CONFIG_UNAVAILABLE');

    await configRef.set({timezone:'America/Sao_Paulo',manualOverride:{mode:'auto'},frete:originalConfig.frete});
    const noSchedule=await attempt();
    assert.equal(noSchedule.status,503,JSON.stringify(noSchedule));
    assert.equal(noSchedule.data.code,'CONFIG_UNAVAILABLE');

    await configRef.set({...originalConfig,manualOverride:{mode:'force_closed'}});
    const closed=await attempt();
    assert.equal(closed.status,403,JSON.stringify(closed));
    assert.equal(closed.data.code,'STORE_CLOSED');
    assert.equal(links,previousLinks);
  } finally {
    await configRef.set(originalConfig);
  }
});
