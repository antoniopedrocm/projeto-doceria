process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
process.env.GCLOUD_PROJECT='demo-doceria-checkout';
process.env.FUNCTIONS_EMULATOR='true';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const admin=require('firebase-admin');
const functions=require('./index');
after(()=>admin.app().delete());
test('cadastro vinculado permite identificação mínima sem conceder perfil ou ownership',async()=>{
  const db=admin.firestore();
  await db.doc('lojas/phone-fixture').set({nome:'Fixture'});
  const ref=db.doc('clientes/phone-linked-fixture');
  const original={nome:'Cliente Privado Teste',telefone:'62987654321',authOwnerUid:'private-owner',
    email:'private@example.test',aniversario:'2000-01-01',enderecos:[{enderecoCompleto:'Privado'}],roles:['private']};
  await ref.set(original);
  const result=await functions.lookupClientByPhone.run({data:{telefone:'62987654321',lojaId:'phone-fixture'},
    rawRequest:{headers:{},ip:'fixture-no-auth'}});
  assert.equal(result.found,true);
  assert.notEqual(result.clientId,ref.id);
  assert.deepEqual(Object.keys(result.client).sort(),['enderecos','nome','nomeAbreviado']);
  assert.equal(result.client.enderecos.length,1);
  assert.equal(result.client.enderecos[0].saved,true);
  assert.equal(result.client.enderecos[0].summary.includes('Privado'),false);
  assert.deepEqual((await ref.get()).data(),original);
  for(const uid of ['private-owner','different-customer','staff-dual-role']) {
    const again=await functions.lookupClientByPhone.run({auth:{uid},data:{telefone:'62987654321',lojaId:'phone-fixture',checkoutIdentityToken:result.checkoutIdentity.token},rawRequest:{headers:{},ip:'fixture-'+uid}});
    assert.equal(again.checkoutIdentity.mode,'legacy_phone');
    assert.deepEqual(Object.keys(again.client).sort(),['enderecos','nome','nomeAbreviado']);
    assert.deepEqual((await ref.get()).data(),original);
  }
});
test('telefone ausente retorna found false e contexto weak; rate limit não depende de trocar UID',async()=>{
  const request={data:{telefone:'62911112222',lojaId:'phone-fixture'},rawRequest:{headers:{},ip:'fixture-rate'}};
  for(let i=0;i<8;i++) {
    const result=await functions.lookupClientByPhone.run({...request,auth:{uid:'different-'+i}});
    assert.equal(result.found,false);assert.equal(result.checkoutIdentity.mode,'legacy_phone');
    assert.equal(result.client,undefined);
  }
  await assert.rejects(()=>functions.lookupClientByPhone.run({...request,auth:{uid:'new-uid'}}),e=>e.code==='permission-denied');
});
test('lookup atrasado não demove contexto promovido e expirado não concede assurance',async()=>{
  const {createCheckoutIdentity}=require('./checkout-identity');
  const db=admin.firestore(),identities=createCheckoutIdentity({db});
  const selected=await identities.select({storeId:'loja-futura-teste',mode:'legacy_phone'});
  await identities.select({token:selected.token,storeId:'loja-futura-teste',mode:'strong_auth',uid:'uid-a',customerId:'customer-a'});
  await assert.rejects(()=>identities.select({token:selected.token,storeId:'loja-futura-teste',mode:'legacy_phone',expectedRevision:selected.revision}));
  assert.equal((await identities.read(selected.token,'loja-futura-teste')).mode,'strong_auth');
  await identities.ref(selected.token).update({expiresAt:1});
  await assert.rejects(()=>identities.read(selected.token,'loja-futura-teste'));
  const renewed=await identities.select({token:selected.token,storeId:'loja-futura-teste',mode:'guest'});
  assert.notEqual(renewed.token,selected.token);assert.equal(renewed.mode,'guest');
});
