process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.GCLOUD_PROJECT='demo-doceria-customer-registry';
const {test,after}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const {createCustomerRegistry}=require('./customer-registry');
const app=admin.initializeApp({projectId:'demo-doceria-customer-registry'},'customer-registry-tests'),db=app.firestore(),registry=createCustomerRegistry({db});
after(()=>app.delete());
test('sem cobertura de migração não cria Customer e não faz fallback por variantes',async()=>{
  await assert.rejects(()=>registry.createOrGet({phone:'62985550001',data:{nome:'Fixture'}}),e=>e.code==='CUSTOMER_REGISTRY_UNAVAILABLE');
  assert.equal((await db.collection('clientes').get()).size,0);await db.doc('integrations/customerRegistry').set({state:'READY'});
});
test('criações concorrentes de formatos equivalentes geram só um Customer/índice e preservam primeiro payload',async()=>{
  const results=await Promise.all(Array.from({length:8},(_,i)=>registry.createOrGet({phone:i%2?'(62) 98555-0001':'+5562985550001',data:{nome:'Fixture'}})));
  assert.equal(new Set(results.map(r=>r.customerId)).size,1);assert.equal(results.filter(r=>r.created).length,1);assert.equal((await db.collection('clientes').get()).size,1);
  const id=results[0].customerId;const repeated=await registry.createOrGet({phone:'62985550001',data:{nome:'Não substituir'}});assert.equal(repeated.created,false);assert.equal((await db.doc('clientes/'+id).get()).data().nome,'Fixture');
  await assert.rejects(()=>registry.createOrGet({phone:'62985550001',data:{authOwnerUid:'forged'}}),e=>e.httpStatus===403);
});
test('grupo review e índice órfão nunca escolhem primeiro cadastro nem geram Customer adicional',async()=>{
  const first=await registry.resolvePhone('62985550001');const count=(await db.collection('clientes').get()).size;
  await registry.phoneRef(first.phone).update({state:'MANUAL_REVIEW_REQUIRED'});await assert.rejects(()=>registry.resolvePhone('62985550001'),e=>e.code==='CUSTOMER_PHONE_REVIEW');
  await registry.phoneRef(first.phone).update({state:'READY',customerId:'missing'});await assert.rejects(()=>registry.createOrGet({phone:'62985550001'}),e=>e.code==='CUSTOMER_PHONE_REVIEW');assert.equal((await db.collection('clientes').get()).size,count);
});
test('alias resolve explicitamente, ciclos falham e mudança de telefone não é simples update',async()=>{
  await registry.aliasRef('old').set({state:'READY',customerId:'canonical'});assert.equal(await registry.resolveId('old'),'canonical');
  await registry.aliasRef('canonical').set({state:'READY',customerId:'old'});await assert.rejects(()=>registry.resolveId('old'),e=>e.code==='CUSTOMER_PHONE_REVIEW');
  registry.assertPhoneUnchanged({telefone:'62985550001'},'+55 (62) 98555-0001');
  assert.throws(()=>registry.assertPhoneUnchanged({telefone:'62985550001'},'62985550002'),e=>e.code==='CUSTOMER_PHONE_CHANGE_REQUIRES_VERIFICATION');
});

test('primeiro cadastro forte sem SMS é atômico; outro UID não ganha o Customer pelo mesmo telefone',async()=>{
  const identity=uid=>({user:{uid},provider:'email_password',sub:uid});
  const results=await Promise.all(['first-a','first-b'].map(uid=>registry.createForStrong({identity:identity(uid),phone:'62985550020',nome:'Fixture'})));
  assert.equal(results.filter(r=>!r.claimRequired).length,1);assert.equal(results.filter(r=>r.claimRequired&&r.identityReviewRequired).length,1);
  const record=await registry.resolvePhone('62985550020');assert.equal(record.customer.data().authOwnerUids.length,1);assert.equal(record.customer.data().phone_verified_at,null);
  const uid=record.customer.data().authOwnerUid;
  const other=uid==='first-a'?'first-b':'first-a';assert.equal((await registry.resolveStrongIdentity(identity(other))).customerId,null);
  assert.equal((await registry.resolveStrongIdentity(identity(uid))).customerId,record.customerId);
  const google={user:{uid},provider:'google',sub:'provider-sub-fixture'};
  assert.equal((await registry.resolveStrongIdentity(google)).customerId,record.customerId);
  const linked=await registry.createForStrong({identity:google,phone:'+5562985550020',nome:'Não sobrescrever'});assert.equal(linked.customerId,record.customerId);
  assert.equal((await db.doc('clientes/'+record.customerId).get()).data().nome,'Fixture');
});

test('telefone legado existente não gera novo Customer nem vínculo forte antes de SMS',async()=>{
  const created=await registry.createOrGet({phone:'62985550030',data:{nome:'Legado',enderecos:[{id:'old',enderecoCompleto:'Destino antigo'}]}});
  const before=(await db.doc('clientes/'+created.customerId).get()).data();
  const identity={user:{uid:'claimant'},provider:'email_password',sub:'claimant'};
  const result=await registry.createForStrong({identity,phone:'62985550030',nome:'Não substituir'});assert.equal(result.claimRequired,true);assert.equal(result.identityReviewRequired,false);
  assert.deepEqual((await db.doc('clientes/'+created.customerId).get()).data(),before);assert.equal((await registry.resolveStrongIdentity(identity)).customerId,null);
});

test('o mesmo UID concorrente não reserva dois telefones nem deixa índice órfão',async()=>{
  const identity={user:{uid:'one-uid-two-phones'},provider:'email_password',sub:'one-uid-two-phones'},phones=['62985550071','62985550072'];
  const results=await Promise.allSettled(phones.map(phone=>registry.createForStrong({identity,phone,nome:'Fixture'})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.collection('clientes').where('authOwnerUid','==',identity.user.uid).get()).size,1);
  const resolved=await Promise.all(phones.map(phone=>registry.resolvePhone(phone)));assert.equal(resolved.filter(r=>r.customerId).length,1);
});
