process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
process.env.GCLOUD_PROJECT='demo-doceria-checkout';process.env.FUNCTIONS_EMULATOR='true';
const {before,after,test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const admin=require('firebase-admin'),originalFetch=global.fetch;
const {seedRegistry}=require('./customer-registry.test-fixture');
let calls=[],checks=[];
global.fetch=async(url,options)=>{
 if(String(url)==='https://api.checkout.infinitepay.io/links') {calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({url:'https://buy.infinitepay.io/phone-fixture'})};}
 if(String(url)==='https://api.checkout.infinitepay.io/payment_check') {checks.push(JSON.parse(options.body));return {ok:true,json:async()=>({success:true,paid:true,amount:1000,paid_amount:1000,capture_method:'pix'})};}
 return originalFetch(url,options);
};
const functions=require('./index'),server=http.createServer(functions.api);
const store='phone-payment-store',customer='phone-payment-customer',phone='62981234567';
let base,db,identity;
const post=async(path,body)=>{
 const r=await originalFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 return {status:r.status,data:await r.json()};
};
before(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;db=admin.firestore();
 await Promise.all([
  db.doc('clientes/'+customer).set({nome:'Pessoa fictícia',telefone:phone,normalizedPhone:'+55'+phone,authOwnerUid:'different-real-owner',email:'private@example.test',enderecos:[{id:'a',nickname:'Casa',enderecoCompleto:'Rua privada'}]}),
  db.doc('lojas/'+store).set({nome:'Fixture telefone'}),
  db.doc(`lojas/${store}/configuracoes/config`).set({manualOverride:{mode:'force_open'}}),
  db.doc(`lojas/${store}/configuracoesInternas/infinitepay`).set({enabled:true,handle:'phone-fixture',redirectUrl:'https://example.test/payment-return',webhookUrl:'https://example.test/webhook'}),
  db.doc(`lojas/${store}/produtos/doce`).set({nome:'Doce fixture',preco:10,estoque:10,ativo:true}),
 ]);
 await seedRegistry(db);
 const found=await functions.lookupClientByPhone.run({data:{lojaId:store,telefone:phone},rawRequest:{ip:'phone-payment-fixture',headers:{}}});
 identity=found.checkoutIdentity;assert.equal(found.found,true);assert.equal(found.client.enderecos[0].enderecoCompleto,undefined);
});
after(async()=>{global.fetch=originalFetch;server.closeAllConnections();await new Promise(r=>server.close(r));await admin.app().delete();});
const order=(key,mode='ONLINE_NOW')=>({lojaId:store,checkoutIdentityToken:identity.token,cliente:{id:'forged-customer-id',nome:'Nome fornecido',telefone:phone,endereco:'Retirar na Loja'},itens:[{produtoId:'doce',preco:10,quantity:1}],subtotal:10,valorFrete:0,delivery:{pickup:true},pagamento:{mode,forma:mode==='ONLINE_NOW'?'Online':'A combinar'},idempotencyKey:key});
let created;
test('LEGACY_PHONE orders and pays without SMS/Auth; no private ownership or email is inherited',async()=>{
 const before=(await db.doc('clientes/'+customer).get()).data();
 created=await post('/checkout/confirmar',order('phone-now-fixture-01'));
 assert.equal(created.status,200,JSON.stringify(created));assert.equal(calls.length,1);
 assert.equal(calls[0].customer.phone_number,'+55'+phone);assert.equal(calls[0].customer.email,undefined);assert.equal(calls[0].customer.name,'Nome fornecido');
 const saved=(await db.doc(`lojas/${store}/pedidos/${created.data.id}`).get()).data();
 assert.equal(saved.clienteId,customer);assert.equal(saved.ownerUid,null);assert.equal(saved.payment_status,'PENDING');
 assert.equal(saved.paymentMethod,null);assert.equal(saved.checkoutIdentity.mode,'legacy_phone');
 assert.deepEqual((await db.doc('clientes/'+customer).get()).data(),before);
 const retry=await post('/checkout/confirmar',order('phone-now-fixture-01'));
 assert.equal(retry.status,200);assert.equal(retry.data.paymentId,created.data.paymentId);assert.equal(retry.data.paymentReturnToken,created.data.paymentReturnToken);
 assert.equal(calls.length,1);assert.equal((await db.doc(`lojas/${store}/produtos/doce`).get()).data().estoque,9);
});
test('AGREED_LATER creates an unpaid order idempotently without an online link or fabricated method',async()=>{
 const payload=order('phone-agreed-fixture-01','AGREED_LATER');const a=await post('/checkout/confirmar',payload),b=await post('/checkout/confirmar',payload);
 assert.equal(a.status,200,JSON.stringify(a));assert.equal(b.data.id,a.data.id);assert.equal(calls.length,1);
 const saved=(await db.doc(`lojas/${store}/pedidos/${a.data.id}`).get()).data();
 assert.equal(saved.paymentStatus,'PENDING');assert.equal(saved.paymentMethod,null);assert.equal(saved.ownerUid,null);assert.equal(saved.paymentId,undefined);
});
test('return capability works without login after refresh, checks provider server-side and exposes no Customer data',async()=>{
 const paymentId=created.data.paymentId,body={paymentId,paymentReturnToken:created.data.paymentReturnToken};
 assert.equal((await post('/checkout/payment-status',{paymentId})).status,404);
 assert.equal((await post('/checkout/payment-status',{...body,paymentReturnToken:'f'.repeat(64)})).status,404);
 assert.equal((await post('/checkout/payment-status',{...body,paymentId:'d'.repeat(64)})).status,404);
 const status=await post('/checkout/payment-status',body);assert.equal(status.status,200);assert.equal(status.data.checkoutUrl,null);
 const paid=await post('/checkout/payment-status',{...body,transaction_nsu:'phone-fixture-paid',slug:'phone-invoice'});
 assert.equal(paid.status,200,JSON.stringify(paid));assert.equal(paid.data.payment_status,'PAID');assert.equal(checks.length,1);
 assert.deepEqual(Object.keys(paid.data).sort(),['checkoutUrl','id','payment_status','requiresReview']);
 assert.equal((await post('/checkout/payment-status',body)).data.payment_status,'PAID');
 assert.equal((await db.doc(`lojas/${store}/produtos/doce`).get()).data().estoque,8);
 const ref=db.doc('checkoutPayments/'+paymentId);await ref.update({'returnAuthorization.expiresAt':Date.now()-1});
 assert.equal((await post('/checkout/payment-status',body)).status,404);
});
test('phone/context mismatch, missing context and guest selection cannot create online checkout',async()=>{
 const links=calls.length;
 for(const patch of [{checkoutIdentityToken:null},{cliente:{...order('x').cliente,telefone:'62989999999'}}]) {
  const denied=await post('/checkout/confirmar',{...order('phone-invalid-context-01'),...patch});assert.equal(denied.status,403,JSON.stringify(denied));
 }
 const identities=require('./checkout-identity').createCheckoutIdentity({db});await identities.select({token:identity.token,storeId:store,mode:'guest'});
 assert.equal((await post('/checkout/confirmar',order('phone-demoted-fixture-01'))).status,403);assert.equal(calls.length,links);
});
