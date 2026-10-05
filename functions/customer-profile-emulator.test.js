// Dedicated local demo project, no live Firebase credentials or endpoints.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.GCLOUD_PROJECT='demo-doceria-checkout';
const {test,after,before}=require('node:test');
const assert=require('node:assert/strict');
const admin=require('firebase-admin');
const {createCustomerAccount,digest}=require('./checkout-auth');
const app=admin.initializeApp({projectId:'demo-doceria-checkout'},'profile-tests');
const db=app.firestore();
const uid='profile-owner', email='profile@example.com';
const user={uid,email,emailVerified:false,providerData:[{providerId:'password',uid:email}]};
const api=createCustomerAccount({db,admin:{auth:()=>({getUser:async()=>user})}});
const request=data=>({auth:{uid,token:{email,firebase:{identities:{email:[email]}}}},data});
const call=(name,data={})=>api[name](request(data));
const ref=db.doc('clientes/profile-owner');
const address=nickname=>({nickname,enderecoCompleto:`Rua ${nickname}, 10`,lat:-16,lng:-49,isDefault:true});
before(async()=>{
  await db.doc(`customerAuthIdentities/${digest('email_password',uid)}`).set({customerId:'profile-owner',uid});
  await ref.set({nome:'Ana',telefone:'62999991234',phone_verified_at:'old-proof',authOwnerUid:uid,enderecos:[]});
  await db.doc('clientes/profile-other').set({nome:'Outro',authOwnerUid:'other-uid',enderecos:[{...address('Privado'),id:'private-id'}]});
});
after(()=>app.delete());
test('perfil em transação atualiza contato e não associa Customer com telefone igual',async()=>{
  await db.doc('clientes/profile-legacy').set({nome:'Legado',telefone:'62999990000'});
  const result=await call('update',{nome:' Nova   Ana ',telefone:'62999990000',customerId:'profile-other'});
  assert.equal(result.customer.id,'profile-owner');assert.equal(result.customer.nome,'Nova Ana');
  assert.equal((await ref.get()).data().phone_verified_at,null);
  assert.equal((await db.doc('clientes/profile-legacy').get()).data().authOwnerUid,undefined);
});
test('adições concorrentes geram IDs únicos e apenas um padrão',async()=>{
  await ref.update({enderecos:[]});
  await Promise.all(['Casa','Trabalho','Outro'].map(n=>call('addAddress',{address:address(n)})));
  const values=(await ref.get()).data().enderecos;
  assert.equal(values.length,3);assert.equal(new Set(values.map(a=>a.id)).size,3);assert.equal(values.filter(a=>a.isDefault).length,1);
});
test('trocas concorrentes de padrão são atômicas; edição/exclusão usam ID',async()=>{
  const values=(await ref.get()).data().enderecos;
  await Promise.all(values.map(a=>call('setDefaultAddress',{addressId:a.id})));
  let saved=(await ref.get()).data().enderecos;assert.equal(saved.filter(a=>a.isDefault).length,1);
  const selected=saved.find(a=>a.isDefault);
  await call('updateAddress',{addressId:selected.id,address:address('Atualizado')});
  assert.equal((await ref.get()).data().enderecos.find(a=>a.id===selected.id).nickname,'Atualizado');
  await call('deleteAddress',{addressId:selected.id});
  saved=(await ref.get()).data().enderecos;assert.equal(saved.length,2);assert.equal(saved.filter(a=>a.isDefault).length,1);
});
test('endereço de outro Customer e vínculo corrompido não autorizam escrita',async()=>{
  const other=db.doc('clientes/profile-other'), before=(await other.get()).data();
  for(const method of ['updateAddress','setDefaultAddress','deleteAddress']) {
    await assert.rejects(call(method,{customerId:'profile-other',addressId:'private-id',address:address('Invadido')}));
  }
  const identity=db.doc(`customerAuthIdentities/${digest('email_password',uid)}`);
  await identity.update({customerId:'profile-other'});
  try {
    await assert.rejects(call('update',{nome:'Invadido'}),e=>e.code==='permission-denied');
    await assert.rejects(call('account'),e=>e.code==='not-found');
  } finally {await identity.update({customerId:'profile-owner'});}
  assert.deepEqual((await other.get()).data(),before);
});

test('campos opcionais omitidos/vazios/novos persistem com isolamento e obrigatórios protegidos',async()=>{
  const other=db.doc('clientes/profile-other'), before=(await other.get()).data();
  await call('addAddress',{address:{...address('Casa'),complement:'Apto 101',complemento:'Apto 101',street:'Rua antiga',referencia:'Portão azul'}});
  const id=(await ref.get()).data().enderecos.at(-1).id;
  await call('updateAddress',{addressId:id,address:{nickname:'Casa editada'}});
  let saved=(await call('account')).customer.enderecos.find(a=>a.id===id);
  assert.equal(saved.complemento,'Apto 101');assert.equal(saved.referencia,'Portão azul');
  await call('updateAddress',{customerId:'profile-other',addressId:id,address:{complemento:'',street:'',referencia:''}});
  saved=(await ref.get()).data().enderecos.find(a=>a.id===id);
  assert.equal(saved.complemento,'');assert.equal(saved.complement,'');assert.equal(saved.street,'');assert.equal(saved.referencia,'');
  assert.equal((await call('account')).customer.enderecos.find(a=>a.id===id).complement,'');
  await call('updateAddress',{addressId:id,address:{complemento:'Casa 2',authOwnerUid:'other-uid',id:'forged'}});
  saved=(await call('account')).customer.enderecos.find(a=>a.id===id);
  assert.equal(saved.complemento,'Casa 2');assert.equal(saved.complement,'Casa 2');assert.equal(saved.authOwnerUid,undefined);
  await assert.rejects(call('updateAddress',{addressId:id,address:{enderecoCompleto:''}}),e=>e.code==='invalid-argument');
  await assert.rejects(call('updateAddress',{customerId:'profile-other',addressId:'private-id',address:{complemento:''}}),e=>e.code==='not-found');
  assert.deepEqual((await other.get()).data(),before);
});
