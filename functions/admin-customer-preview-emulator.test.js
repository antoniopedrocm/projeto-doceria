process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.GCLOUD_PROJECT='demo-doceria-checkout';process.env.FUNCTIONS_EMULATOR='true';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),admin=require('firebase-admin');
const {createHash}=require('node:crypto');
const handlers=require('./index'),db=admin.firestore(),server=http.createServer(handlers.api);
let base,session;const actors={};
async function send(method,path,{actor='owner',session:token=session,body,auth=true}={}) {
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+actors[actor].token}:{}),...(token?{'X-Customer-Preview':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json(),cache:response.headers.get('cache-control')};
}
const prefix='/admin/customer-preview';
before(async()=>{
  for(const [name,profile] of Object.entries({owner:{role:'dono'},manager:{role:'gerente',lojaIds:['preview-one']},staff:{role:'atendente'},customer:{role:'cliente'}})) {
    const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`preview-${name}-${Date.now()}@example.test`,password:'Emulator-fixture-only-123!',returnSecureToken:true})});
    const user=await response.json();assert.ok(user.idToken);actors[name]={uid:user.localId,token:user.idToken};await db.doc('users/'+user.localId).set({...profile,ativo:true});
  }
  await db.doc('clientes/preview-canonical').set({nome:'Cliente de teste',authOwnerUid:'customer-owner',authOwnerUids:['customer-owner','alias-owner'],identityRegistryVersion:1,
    legacyCustomerIds:['preview-alias'],legacyOrderPaths:['pedidos/preview-approved'],enderecos:Array.from({length:12},(_,i)=>({id:'address-'+i,nomeEndereco:'Casa '+i,enderecoCompleto:'Endereço fixture '+i,isDefault:i===0})),endereco:'orphan-do-not-return'});
  await db.doc('clientes/preview-alias').set({canonicalStatus:'ALIAS',canonicalCustomerId:'preview-canonical'});
  await db.doc('integrations/customerRegistry/aliases/'+createHash('sha256').update('preview-alias').digest('hex')).set({state:'READY',customerId:'preview-canonical'});
  await db.doc('clientes/preview-foreign').set({nome:'Outro cliente',authOwnerUid:'foreign'});
  for(const id of ['preview-one','preview-two'])await db.doc('lojas/'+id).set({nome:id});
  for(let i=0;i<63;i++) await db.doc(`lojas/${i%2?'preview-one':'preview-two'}/pedidos/preview-order-${i}`).set({clienteId:i%2?'preview-alias':'preview-canonical',ownerUid:i%2?'alias-owner':'customer-owner',createdAt:'2026-10-20',total:9.9,itens:[{nome:'Item fixture',quantity:1,preco:9.9}],clienteEndereco:'Snapshot fixture',payment_status:'PAID',order_status:'CONFIRMED'});
  await db.doc('pedidos/preview-approved').set({clienteId:'preview-alias',total:9.9});
  await db.doc('pedidos/preview-unapproved').set({clienteId:'preview-alias',total:999});
  await db.doc('lojas/preview-one/pedidos/preview-phone-only').set({telefone:'fake',total:999});
  await db.doc('lojas/preview-two/pedidos/preview-foreign').set({clienteId:'preview-foreign',ownerUid:'foreign',total:999});
  await db.doc('lojas/preview-one/pedidos/preview-conflicting-owner').set({clienteId:'preview-canonical',ownerUid:'foreign',total:999});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await admin.app().delete();});
test('acesso 401/403: anônimo, Customer, Staff e gerente sem capability',async()=>{
  assert.equal((await send('POST',prefix+'/sessions',{auth:false,session:null,body:{targetCustomerId:'preview-canonical'}})).status,401);
  for(const actor of ['customer','staff','manager'])assert.equal((await send('POST',prefix+'/sessions',{actor,session:null,body:{targetCustomerId:'preview-canonical'}})).status,403);
});
test('Dono abre alias canônico, lê perfil e 12 endereços; sessão vinculada ao UID e sem cache',async()=>{
  const result=await send('POST',prefix+'/sessions',{session:null,body:{targetCustomerId:'preview-alias'}});assert.equal(result.status,200);session=result.data.session;
  assert.equal(result.data.mode,'ADMIN_CUSTOMER_PREVIEW');assert.equal(result.data.customer.id,'preview-canonical');assert.equal(result.cache,'no-store');
  assert.equal((await send('GET',prefix+'/profile')).data.customer.nome,'Cliente de teste');
  const addresses=(await send('GET',prefix+'/addresses')).data.addresses;assert.equal(addresses.length,12);assert.equal(addresses.filter(a=>a.isDefault).length,1);
  assert.equal((await send('GET',prefix+'/profile',{actor:'staff'})).status,403);
  assert.equal((await send('GET',prefix+'/profile',{session:'forged'})).status,403);
});
test('64 pedidos consolidados, paginação e snapshot; exclui phone-only, root não revisto, outro Customer/owner',async()=>{
  const before=(await db.collectionGroup('pedidos').get()).docs.map(s=>[s.ref.path,s.data()]);let cursor,orders=[];
  do {const r=await send('GET',prefix+'/orders'+(cursor?'?cursor='+encodeURIComponent(cursor):''));assert.equal(r.status,200);orders.push(...r.data.orders);cursor=r.data.nextCursor;}while(cursor);
  assert.equal(orders.length,64);assert.equal(orders.filter(o=>o.source==='legacy').length,1);
  const detail=await send('GET',prefix+'/order?storeId=preview-one&orderId=preview-order-1');assert.equal(detail.status,200);assert.equal(detail.data.order.endereco,'Snapshot fixture');assert.equal(detail.data.order.receipt_url,null);
  assert.equal((await send('GET',prefix+'/order?storeId=preview-two&orderId=preview-foreign')).status,404);
  assert.equal((await send('GET',prefix+'/order?source=legacy&orderId=preview-unapproved')).status,404);
  assert.deepEqual((await db.collectionGroup('pedidos').get()).docs.map(s=>[s.ref.path,s.data()]),before);
});
for(const operation of ['profile','addresses','delete-address','default-address','reorder','checkout','infinitepay','coupon','sms','logout'])test('preview rejeita mutação '+operation,async()=>{
  assert.equal((await send('POST',prefix+'/'+operation,{body:{targetCustomerId:'preview-foreign'}})).status,403);
});
test('marcador preview não atravessa APIs CRM, checkout, pagamento ou SMS',async()=>{
  for(const path of ['/clientes/preview-canonical','/checkout/orders','/checkout/payment','/checkout/address-verification/start'])assert.equal((await send('POST',path,{body:{customerId:'preview-canonical'}})).status,403);
  for(const name of ['customerUpdate','customerAddAddress','customerDeleteAddress','customerUpdateAddress','customerSetDefaultAddress','customerReorderPreview','customerPhoneClaimStart'])await assert.rejects(()=>handlers[name].run({auth:{uid:actors.owner.uid},rawRequest:{headers:{'x-customer-preview':session}},data:{customerId:'preview-canonical'}}),e=>e.code==='permission-denied');
});
test('token preview não é Firebase token; lease bloqueia Customer/checkout mesmo removendo marcador e mantendo token Firebase válido',async()=>{
  await assert.rejects(()=>admin.auth().verifyIdToken(session));
  const token=await admin.auth().verifyIdToken(actors.owner.token);
  for(const method of ['customerUpdate','customerAddAddress','customerDeleteAddress','customerUpdateAddress','customerSetDefaultAddress','customerReorderPreview','customerPhoneClaimStart','updateClientProfile','addClientAddress'])await assert.rejects(()=>handlers[method].run({auth:{uid:actors.owner.uid,token},data:{nome:'forged',customerId:'preview-canonical'}}),e=>e.code==='permission-denied');
  for(const path of ['/checkout/identity','/pedidos','/cupons/verificar','/checkout/confirmar','/checkout/payment-status','/clientes']) {
    const r=await send('POST',path,{session:null,body:{customerId:'preview-canonical',mode:'strong_auth'}});assert.equal(r.status,403);assert.equal(r.data.code,'PREVIEW_READ_ONLY');
  }
  assert.equal((await db.doc('clientes/preview-canonical').get()).data().nome,'Cliente de teste');
});
test('gerente com grant explícito recebe só loja permitida; nem detalhe nem cursor vazam loja/root',async()=>{
  await db.doc('customProfiles/'+actors.manager.uid).set({permissions:{clientes:true},permissionDetails:{clientes:{view_customer_as_readonly:true}}});
  const started=await send('POST',prefix+'/sessions',{actor:'manager',session:null,body:{targetCustomerId:'preview-canonical'}});assert.equal(started.status,200);const token=started.data.session;
  const orders=(await send('GET',prefix+'/orders',{actor:'manager',session:token})).data.orders;assert.ok(orders.length);assert.ok(orders.every(o=>o.storeId==='preview-one'));
  assert.equal((await send('GET',prefix+'/order?storeId=preview-two&orderId=preview-order-0',{actor:'manager',session:token})).status,404);
  assert.equal((await send('GET',prefix+'/orders?cursor=lojas%2Fpreview-two%2Fpedidos%2Fpreview-order-0',{actor:'manager',session:token})).status,404);
  assert.equal((await send('POST',prefix+'/sessions',{actor:'manager',session:null,body:{targetCustomerId:'preview-foreign'}})).status,403);
  await db.doc('customProfiles/'+actors.manager.uid).update({'permissionDetails.clientes.view_customer_as_readonly':false});
  assert.equal((await send('GET',prefix+'/profile',{actor:'manager',session:token})).status,403);
});
test('gerente não concede capability de preview pela administração de usuários',async()=>{
  const staff=await admin.auth().getUser(actors.staff.uid);
  await assert.rejects(()=>handlers.updateUser.run({auth:{uid:actors.manager.uid},data:{uid:actors.staff.uid,nome:'Staff fixture',email:staff.email,role:'gerente',lojaIds:['preview-one'],permissions:{clientes:true},permissionDetails:{clientes:{view_customer_as_readonly:true}}}}),e=>e.code==='permission-denied' && e.message.includes('Somente um Dono'));
  assert.equal((await db.doc('users/'+actors.staff.uid).get()).data().role,'atendente');
});
test('sessão expirada é rejeitada, sair é idempotente, audita IDs sem PII e não altera Auth/Customer',async()=>{
  const customerBefore=(await db.doc('clientes/preview-canonical').get()).data(),actorBefore=await admin.auth().getUser(actors.owner.uid);
  assert.equal((await send('POST',prefix+'/end')).status,200);assert.equal((await send('POST',prefix+'/end')).status,200);
  assert.equal((await send('GET',prefix+'/profile')).status,403);
  await require('./admin-customer-preview').assertNoPreviewMutation(db,actors.owner.uid);
  const started=await send('POST',prefix+'/sessions',{session:null,body:{targetCustomerId:'preview-canonical'}}),token=started.data.session;
  await db.doc('integrations/adminCustomerPreview/sessions/'+createHash('sha256').update(token).digest('hex')).update({expiresAt:Date.now()-1});
  assert.equal((await send('GET',prefix+'/addresses',{session:token})).status,403);
  const logs=(await db.collection('integrations/adminCustomerPreview/audit').get()).docs.map(s=>s.data());
  for(const type of ['ADMIN_CUSTOMER_PREVIEW_STARTED','ADMIN_CUSTOMER_PREVIEW_ENDED','ADMIN_CUSTOMER_ORDER_VIEWED'])assert.ok(logs.some(d=>d.type===type));
  assert.equal(JSON.stringify(logs).includes('Endereço fixture'),false);assert.equal(JSON.stringify(logs).includes('@example.test'),false);
  assert.deepEqual((await db.doc('clientes/preview-canonical').get()).data(),customerBefore);assert.equal((await admin.auth().getUser(actors.owner.uid)).uid,actorBefore.uid);
});
test('Rules negam sessão, lease e auditoria a SDK Customer e Staff, inclusive Dono',async()=>{
  const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
  const {doc,setDoc,getDoc}=require('firebase/firestore'),fs=require('node:fs'),path=require('node:path');
  const env=await initializeTestEnvironment({projectId:'demo-admin-preview-rules',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
  try {
    await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),'users/owner'),{role:'dono',ativo:true});});
    for(const uid of ['owner','customer'])for(const collection of ['sessions','actors','audit']) {
      const ref=doc(env.authenticatedContext(uid).firestore(),`integrations/adminCustomerPreview/${collection}/forged`);
      await assertFails(getDoc(ref));await assertFails(setDoc(ref,{adminUid:uid,expiresAt:Date.now()+100000}));
    }
  } finally {await env.cleanup();}
});
