process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
process.env.GCLOUD_PROJECT='demo-doceria-checkout';
process.env.FUNCTIONS_EMULATOR='true';
process.env.GOOGLE_MAPS_SERVER_API_KEY='fixture-not-a-secret';
const {test,before,after}=require('node:test');
const {seedRegistry}=require('./customer-registry.test-fixture');
const assert=require('node:assert/strict');
const http=require('node:http');
const admin=require('firebase-admin');
const originalFetch=global.fetch;const destinations=[];
global.fetch=async(url,options)=>{
  if(String(url).startsWith('https://maps.googleapis.com/')) {
    const address=new URL(url).searchParams.get('destinations');destinations.push(address);
    return {ok:true,json:async()=>({status:'OK',rows:[{elements:[{status:'OK',distance:{value:address.includes('completa')?2000:4000}}]}]})};
  }
  if(String(url).includes('infinitepay')) assert.fail('No financial provider calls allowed');
  return originalFetch(url,options);
};
const functions=require('./index');
const {createCheckoutIdentity}=require('./checkout-identity');
const {createCheckoutAddresses}=require('./checkout-addresses');
const server=http.createServer(functions.api);
const store='loja-futura-enderecos',phone='62985550001';let db,base,identities,addresses,customer,lookup;
const source=[{id:'first-stable',nickname:'Trabalho',street:'Rua privada',number:'999',neighborhood:'Marista',enderecoCompleto:'Rua privada 999, complemento secreto'},
  {id:'default-stable',nickname:'Casa',street:'Av. completa',number:'123',neighborhood:'Bueno',enderecoCompleto:'Av. completa 123, complemento secreto',isDefault:true,cep:'74230100',lat:-16,lng:-49}];
let sequence=0;
const find=(number=phone,extra={})=>functions.lookupClientByPhone.run({data:{telefone:number,lojaId:store,...extra},rawRequest:{headers:{},ip:'address-fixture-'+(++sequence)}});
const request=async(path,body)=>{const r=await originalFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lojaId:store,...body})});return {status:r.status,data:await r.json()};};
const selection=(result=lookup,index=0)=>({checkoutIdentityToken:result.checkoutIdentity.token,checkoutAddressId:result.client.enderecos[index].id,checkoutAddressRevision:result.checkoutIdentity.revision});
before(async()=>{
  db=admin.firestore();identities=createCheckoutIdentity({db});addresses=createCheckoutAddresses({db,identities});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  await db.doc(`lojas/${store}`).set({nome:'Fixture'});
  await db.doc(`lojas/${store}/configuracoes/config`).set({manualOverride:{mode:'force_open'},frete:{lat:-16,lng:-49,valorPorKm:2,valorMinimoFrete:3}});
  customer=db.doc('clientes/address-fixture-customer');await customer.set({nome:'Cliente privado',telefone:phone,authOwnerUid:'different-private-owner',enderecos:source});
  await seedRegistry(db);lookup=await find();
});
after(async()=>{global.fetch=originalFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await admin.app().delete();});
test('lookup sem strong retorna resumos por cliente canônico, vários endereços/default sem dados privados',async()=>{
  assert.equal(lookup.client.enderecos.length,2);assert.equal(lookup.client.enderecos[0].nickname,'Casa');
  assert.equal(lookup.client.enderecos[0].isDefault,true);
  const visible=JSON.stringify(lookup.client.enderecos.map(({id,...display})=>display));
  for(const secret of ['default-stable','first-stable','123','999','74230100','complemento','different-private-owner','address-fixture-customer']) assert.equal(visible.includes(secret),false,secret);
  assert.deepEqual((await customer.get()).data().enderecos,source);
  const again=await find(phone,{checkoutIdentityToken:lookup.checkoutIdentity.token});
  assert.equal(again.client.enderecos[0].id,lookup.client.enderecos[0].id);
  lookup=again;
});
test('frete usa endereço persistido, ignora destino/coords do browser e não retorna endereço completo',async()=>{
  const result=await request('/frete/calcular',{...selection(),clienteEndereco:'endereço atacante',clienteLat:0,clienteLng:0,distanciaKm:999});
  assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.valorFrete,4);
  assert.equal(destinations.at(-1),source[1].enderecoCompleto);
  assert.equal(JSON.stringify(result.data).includes('completa'),false);
});
test('confirmação offline resolve full address dentro da transação, não associa ownership e não expõe dados',async()=>{
  await db.doc(`lojas/${store}/produtos/address-product`).set({nome:'Fixture',preco:10,estoque:2,ativo:true});
  const result=await request('/checkout/confirmar',{...selection(),cliente:{id:'forged-private-id',nome:'Cliente',telefone:phone,endereco:'summary must not be stored'},
    itens:[{produtoId:'address-product',quantity:1,preco:10}],pagamento:{forma:'Dinheiro'},subtotal:10,valorFrete:4,distanciaFreteKm:2});
  assert.equal(result.status,200,JSON.stringify(result));
  const order=(await db.doc(`lojas/${store}/pedidos/${result.data.id}`).get()).data();
  assert.equal(order.clienteEndereco,source[1].enderecoCompleto);assert.equal(order.clienteId,customer.id);assert.equal(order.ownerUid,undefined);
  assert.equal(order.total,14);assert.equal(JSON.stringify(result.data).includes('completa'),false);
  assert.equal((await db.doc(`lojas/${store}/produtos/address-product`).get()).data().estoque,1);
  assert.deepEqual((await customer.get()).data().enderecos,source);
});
test('endereço novo sem SMS pode ser usado no checkout, sem gravar/default/alterar endereços do cliente',async()=>{
  await db.doc(`lojas/${store}/produtos/draft-product`).set({nome:'Fixture',preco:10,estoque:2,ativo:true});
  const before=(await customer.get()).data();
  const result=await request('/checkout/confirmar',{checkoutIdentityToken:lookup.checkoutIdentity.token,
    cliente:{id:lookup.clientId,nome:'Fixture',telefone:phone,endereco:'Rua nova digitada pelo usuário'},
    itens:[{produtoId:'draft-product',quantity:1,preco:10}],pagamento:{forma:'Dinheiro'},subtotal:10,valorFrete:8,
    delivery:{address:{enderecoCompleto:'Rua nova digitada pelo usuário',lat:-16,lng:-49},lat:-16,lng:-49},clienteLat:-16,clienteLng:-49,distanciaFreteKm:4});
  assert.equal(result.status,200,JSON.stringify(result));
  const order=(await db.doc(`lojas/${store}/pedidos/${result.data.id}`).get()).data();
  assert.equal(order.clienteEndereco,'Rua nova digitada pelo usuário');assert.equal(order.clienteId,customer.id);
  assert.deepEqual((await customer.get()).data().enderecos,before.enderecos);assert.equal(order.ownerUid,undefined);
});
test('referência não atravessa cliente, loja, revisão, identidade, expiração ou ID forjado',async()=>{
  await db.doc('clientes/address-other').set({nome:'Outro cliente',telefone:'62985550002',enderecos:source});await seedRegistry(db);
  const other=await find('62985550002');
  const options=[{...selection(),checkoutIdentityToken:other.checkoutIdentity.token,checkoutAddressRevision:other.checkoutIdentity.revision},
    {...selection(),lojaId:'other-store'}, {...selection(),checkoutAddressRevision:0},
    {...selection(),checkoutAddressId:'default-stable'}];
  for(const fields of options) assert.notEqual((await request('/frete/calcular',fields)).status,200);
  const transient=await find();const fields=selection(transient);
  await identities.select({token:fields.checkoutIdentityToken,storeId:store,mode:'guest'});
  assert.notEqual((await request('/frete/calcular',fields)).status,200);
  await identities.ref(fields.checkoutIdentityToken).update({expiresAt:1});
  assert.notEqual((await request('/frete/calcular',fields)).status,200);
});
test('array reordenado usa ID estável; exclusão não redireciona para outro endereço',async()=>{
  await customer.update({enderecos:[source[1],source[0]]});
  const fields=selection();
  const address=await addresses.resolve({token:fields.checkoutIdentityToken,storeId:store,id:fields.checkoutAddressId,revision:fields.checkoutAddressRevision});
  assert.equal(address.id,'default-stable');
  await customer.update({enderecos:[source[0]]});
  assert.equal((await request('/frete/calcular',fields)).status,409);
  await customer.update({enderecos:source});
});
test('endereços globais podem ser usados em outra loja com contexto próprio, sem fallback',async()=>{
  await db.doc('lojas/address-second-store').set({nome:'Segunda fixture'});
  const result=await functions.lookupClientByPhone.run({data:{telefone:phone,lojaId:'address-second-store'},rawRequest:{headers:{},ip:'address-second'}});
  assert.equal(result.client.enderecos.length,2);assert.notEqual(result.client.enderecos[0].id,lookup.client.enderecos[0].id);
  const fields=selection(result);
  assert.equal((await addresses.resolve({token:fields.checkoutIdentityToken,storeId:'address-second-store',id:fields.checkoutAddressId,revision:fields.checkoutAddressRevision})).id,'default-stable');
});
test('sem endereço retorna lista vazia; telefone duplicado não escolhe cadastro arbitrário nem faz merge',async()=>{
  await db.doc('clientes/address-empty').set({nome:'Sem endereço',telefone:'62985550003'});
  await seedRegistry(db);assert.deepEqual((await find('62985550003')).client.enderecos,[]);
  await db.doc('clientes/address-duplicate-a').set({nome:'A',telefone:'62985550004',enderecos:source});
  await db.doc('clientes/address-duplicate-b').set({nome:'B',telefone:'62985550004',enderecos:source});
  await seedRegistry(db);await assert.rejects(()=>find('62985550004'),e=>e.code==='failed-precondition');
  assert.deepEqual((await customer.get()).data().enderecos,source);
});
test('HTTP Salvar sem SMS → nova identificação → lista mascarada → frete/snapshot persistidos e Online bloqueado',async()=>{
  const input={storeId:store,checkoutIdentityToken:lookup.checkoutIdentity.token,checkoutIdentityRevision:lookup.checkoutIdentity.revision,
    requestId:'abcdef12-1234-4234-8234-123456789abc',address:{nickname:'Casa da minha Mãe',street:'Rua nova privada',number:'87',city:'Goiânia',neighborhood:'Centro',cep:'74000000',complement:'Sala confidencial',referencia:'Portão interno',isDefault:true,lat:-16,lng:-49}};
  const save=async body=>{const r=await originalFetch(base+'/checkout/addresses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,cache:r.headers.get('cache-control'),data:await r.json()};};
  for(const extra of [{customerId:'other'},{addressId:source[0].id},{phone}])assert.equal((await save({...input,...extra})).status,403);
  const created=await save(input);assert.equal(created.status,200,JSON.stringify(created));assert.equal(created.cache,'no-store');assert.equal(created.data.created,true);
  assert.equal(created.data.addresses.find(a=>a.id===created.data.addressId).nickname,'Casa da minha Mãe');
  const projected=JSON.stringify(created.data.addresses.map(({id,...value})=>value));
  for(const secret of ['Rua nova privada','87','74000000','Sala confidencial','Portão interno','-16','-49','creationFingerprint'])assert.equal(projected.includes(secret),false,secret);
  const retried=await save(input);assert.equal(retried.data.addressId,created.data.addressId);assert.equal(retried.data.created,false);
  const data=(await customer.get()).data(),saved=data.enderecos.at(-1);assert.equal(saved.createdVia,'legacy_phone');assert.equal(saved.isDefault,false);assert.equal(saved.nickname,'Casa da minha Mãe');
  const fresh=await find(),index=fresh.client.enderecos.findIndex(a=>a.nickname==='Casa da minha Mãe');assert.ok(index>=0);assert.notEqual(fresh.client.enderecos[index].id,created.data.addressId);
  const ref=selection(fresh,index);const quote=await request('/frete/calcular',{...ref,clienteEndereco:'Destino adulterado',clienteLat:0,clienteLng:0});assert.equal(quote.status,200);assert.equal(destinations.at(-1),saved.enderecoCompleto);
  await db.doc(`lojas/${store}/produtos/weak-saved-product`).set({nome:'Fixture',preco:10,estoque:2,ativo:true});
  await db.doc(`lojas/${store}/configuracoesInternas/infinitepay`).set({enabled:true,handle:'merchant-test',redirectUrl:'https://example.com/return',webhookUrl:'https://example.com/webhook'});
  const orderBody={...ref,cliente:{id:'forged',nome:'Fixture',telefone:phone,endereco:'Texto adulterado'},itens:[{produtoId:'weak-saved-product',quantity:1,preco:10}],pagamento:{forma:'Online'},subtotal:10,valorFrete:8,distanciaFreteKm:4};
  assert.equal((await request('/checkout/confirmar',orderBody)).status,401);
  const confirmed=await request('/checkout/confirmar',{...orderBody,pagamento:{forma:'Dinheiro'}});assert.equal(confirmed.status,200,JSON.stringify(confirmed));
  const order=(await db.doc(`lojas/${store}/pedidos/${confirmed.data.id}`).get()).data();assert.equal(order.clienteEndereco,saved.enderecoCompleto);assert.equal(order.ownerUid,undefined);assert.equal(order.clienteId,customer.id);
  assert.equal((await customer.get()).data().enderecos.find(a=>a.id===saved.id).nickname,'Casa da minha Mãe');
  const {createCustomerAccount,digest}=require('./checkout-auth'),uid='different-private-owner',email='address-owner@example.com';
  await db.doc(`customerAuthIdentities/${digest('email_password',uid)}`).set({customerId:customer.id,uid});
  const account=createCustomerAccount({db,admin:{auth:()=>({getUser:async()=>({uid,email,providerData:[{providerId:'password',uid:email}]})})}});
  const strong=await account.account({auth:{uid,token:{email,firebase:{identities:{email:[email]}}}}});
  assert.equal(strong.customer.enderecos.find(a=>a.id===saved.id).nickname,'Casa da minha Mãe');
});
