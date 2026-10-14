// No live project, credentials or external provider. Only localhost emulators.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
process.env.GCLOUD_PROJECT='demo-doceria-checkout';
process.env.FUNCTIONS_EMULATOR='true';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const admin=require('firebase-admin');
const handlers=require('./index');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,collection,getDocs}=require('firebase/firestore');
after(()=>Promise.all(admin.apps.map(app=>app.delete())));
test('Customer Google/password não chama Functions administrativas, inclusive sem users/{uid}',async()=>{
  const db=admin.firestore();
  for(const provider of ['google.com','password']) {
    const uid='shell-'+provider.replace('.','-');
    // Match a genuine authenticated Customer: Auth record exists, Staff profile does not.
    await admin.auth().getUser(uid).catch(error=>{if(error.code!=='auth/user-not-found') throw error;return admin.auth().createUser({uid});});
    // No fake Staff record is created to make a Customer enter the application.
    await db.doc('users/'+uid).delete();
    for(const name of ['listAllUsers','createUser','updateUser','deleteUser','createStore','prepareNextFinancialMonth','paymentSettingsGet']) {
      await assert.rejects(()=>handlers[name].run({auth:{uid,token:{firebase:{sign_in_provider:provider}}},data:{storeId:'shell-store'}}),error=>['permission-denied','not-found'].includes(error.code),name+' must deny '+provider);
    }
    assert.equal((await db.doc('users/'+uid).get()).exists,false);
  }
});
test('Customer não lê administrativo privado nem escreve produtos/clientes/pedidos/configurações',async()=>{
  const env=await initializeTestEnvironment({projectId:'demo-doceria-checkout',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
  try {
    const db=admin.firestore();
    for(const p of ['lojas/shell-store/configuracoesInternas/infinitepay','lojas/shell-store/contas_a_pagar/private','lojas/shell-store/pedidos/private','clientes/shell-private']) await db.doc(p).set({nome:'Privado',total:12});
    for(const provider of ['google.com','password']) {
      const customer=env.authenticatedContext('shell-'+provider,{firebase:{sign_in_provider:provider}}).firestore();
      for(const p of ['lojas/shell-store/configuracoesInternas/infinitepay','lojas/shell-store/contas_a_pagar/private','lojas/shell-store/pedidos/private','clientes/shell-private']) await assertFails(getDoc(doc(customer,p)));
      await assertFails(getDocs(collection(customer,'users')));
      for(const p of ['lojas/shell-store/produtos/private','lojas/shell-store/pedidos/private','lojas/shell-store/configuracoesInternas/infinitepay','clientes/shell-private']) await assertFails(setDoc(doc(customer,p),{nome:'Adulterado'}));
    }
  } finally {await env.cleanup();}
});

test('dual-role Staff remains subject to Customer ownership; Staff-only lookup has no Customer writes',async()=>{
  const db=admin.firestore();
  const user=async(uid,email)=>{
    await admin.auth().getUser(uid).catch(error=>{if(error.code!=='auth/user-not-found') throw error;return admin.auth().createUser({uid,email,password:'Emulator-only-credential-123!'});});
    return {uid,token:{email,firebase:{identities:{email:[email]},sign_in_provider:'password'}}};
  };
  const dual=await user('dual-context-owner','dual-context@example.test');
  const other=await user('dual-context-other','dual-other@example.test');
  await db.doc('users/'+dual.uid).set({role:'dono',ativo:true,lojaIds:[]});
  const before=await handlers.customerAccount.run({auth:dual,data:{}});
  assert.equal(before.needsPhone,true);
  assert.equal((await db.collection('clientes').where('authOwnerUid','==',dual.uid).get()).size,0);
  const own=await handlers.customerCompleteProfile.run({auth:dual,data:{nome:'Dual fixture',phone:'62999999991'}});
  const foreign=await handlers.customerCompleteProfile.run({auth:other,data:{nome:'Other fixture',phone:'62999999992'}});
  assert.ok(own.customer.id);assert.notEqual(own.customer.id,foreign.customer.id);
  const foreignRef=db.doc('clientes/'+foreign.customer.id);
  await foreignRef.update({enderecos:[{id:'fixture-foreign-address',nickname:'Fixture',enderecoCompleto:'DEV only',lat:-16,lng:-49,isDefault:true}]});
  const original=JSON.stringify((await foreignRef.get()).data());
  await db.doc('lojas/shell-store/pedidos/foreign-dual-order').set({clienteId:foreign.customer.id,ownerUid:other.uid,itens:[],total:1});
  for(const name of ['customerOrderDetail','customerReorderPreview']) {
    await assert.rejects(()=>handlers[name].run({auth:dual,data:{storeId:'shell-store',orderId:'foreign-dual-order',customerId:foreign.customer.id}}),error=>error.code==='not-found',name);
  }
  await assert.rejects(()=>handlers.customerUpdateAddress.run({auth:dual,data:{customerId:foreign.customer.id,addressId:'fixture-foreign-address',address:{nickname:'MUST NOT APPLY'}}}),error=>error.code==='not-found');
  assert.equal(JSON.stringify((await foreignRef.get()).data()),original);
  assert.equal((await handlers.customerAccount.run({auth:dual,data:{customerId:foreign.customer.id}})).customer.id,own.customer.id);
});
