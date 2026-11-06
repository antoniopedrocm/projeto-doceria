const {test}=require('node:test'),assert=require('node:assert/strict');
const {memoryFirestore}=require('./customer-legacy.test-fixture');
const {createCustomerAccount}=require('./checkout-auth');
const {createCustomerPhoneClaim}=require('./customer-phone-claim');
const {normalizeCustomerPhone}=require('./customer-phone');
const {MAX_LEGACY_PHONE_CANDIDATES}=require('./customer-registry');
const phone='62985550061',otherPhone='62985550062';
function fixture(provider='google',extra={}) {
  const db=memoryFirestore({'integrations/customerRegistry':{state:'READY'},'lojas/synthetic-store':{nome:'Synthetic store'},
    'clientes/original':{nome:'Original',telefone:'(62) 98555-0061',endereco:'Rua antiga',bairro:'Centro',...extra},
    'lojas/synthetic-store/pedidos/old':{clienteId:'original',total:35,createdAt:'2026-10-01',itens:[]},
    'users/a':{role:'dono',lojaIds:['synthetic-store']}});
  const users=Object.fromEntries(['a','b'].map(uid=>[uid,{uid,email:uid+'@example.test',providerData:[{providerId:uid==='a'&&provider==='google'?'google.com':'password',uid:uid==='a'&&provider==='google'?'google-a':uid+'@example.test'}]}]));
  const request=(data={},uid='a')=>({auth:{uid,token:{email:users[uid].email,firebase:{identities:users[uid].providerData[0].providerId==='google.com'?{'google.com':['google-a']}:{email:[users[uid].email]}}}},rawRequest:{ip:'synthetic-local'},data:{storeId:'synthetic-store',phone,...data}});
  const accounts=createCustomerAccount({db,admin:{auth:()=>({getUser:async uid=>users[uid]})}});
  let time=1800000000000,sends=0,providerFailure=false,failCommit=false;
  const providerStub={load:async()=>({channels:{sms:{synthetic:true}},policy:{otpMs:300000,resendMs:60000,phoneHourly:5,ipHourly:10,globalDaily:50,maxAttempts:5}}),
    start:async()=>{sends++;if(providerFailure)throw Error('Synthetic provider failure');return {synthetic:true};},
    verify:async({code})=>{if(failCommit){failCommit=false;db.failNextCommit=true;}return code==='123456';}};
  const claim=createCustomerPhoneClaim({db,accounts,provider:providerStub,now:()=>time});
  const count=prefix=>[...db.rows.keys()].filter(path=>path.startsWith(prefix)).length;
  const identity=uid=>({user:users[uid],provider:uid==='a'&&provider==='google'?'google':'email_password',sub:uid==='a'&&provider==='google'?'google-a':uid});
  return {db,request,accounts,claim,count,identity,get sends(){return sends;},advance:ms=>{time+=ms;},failProvider:()=>{providerFailure=true;},failClaimCommit:()=>{failCommit=true;}};
}
for(const provider of ['google','email_password']) {
  test(provider+': missing index reuses original only after purpose-specific proof, preserving data and Staff',async()=>{
    const f=fixture(provider),original=structuredClone(f.db.rows.get('clientes/original')),order=structuredClone(f.db.rows.get('lojas/synthetic-store/pedidos/old')),staff=structuredClone(f.db.rows.get('users/a'));
    const pending=await f.accounts.completeProfile(f.request({nome:'Must not replace'}));
    assert.equal(pending.claimRequired,true);assert.equal(pending.identityReviewRequired,false);assert.equal(f.count('clientes/'),1);assert.equal(f.sends,0);
    assert.equal((await f.accounts.account(f.request())).needsPhone,true);assert.deepEqual(f.db.rows.get('clientes/original'),original);
    const challenge=await f.claim.start(f.request()),result=await f.claim.confirm(f.request({challengeId:challenge.challengeId,code:'123456'}));
    assert.equal(result.customer.id,'original');assert.equal(result.customer.nome,original.nome);assert.equal(result.customer.enderecos.length,1);assert.equal(f.count('clientes/'),1);
    for(const [key,value]of Object.entries(original))assert.deepEqual(f.db.rows.get('clientes/original')[key],value,key);
    assert.deepEqual(f.db.rows.get('lojas/synthetic-store/pedidos/old'),order);assert.deepEqual(f.db.rows.get('users/a'),staff);
    assert.equal((await f.accounts.orders(f.request())).orders.length,1);
    assert.equal((await f.accounts.account(f.request())).customer.id,'original'); // independent reload/login resolution
    const index=f.db.rows.get(f.accounts.registry.phoneRef(normalizeCustomerPhone(phone)).path);assert.equal(index.customerId,'original');
    await assert.rejects(()=>f.claim.confirm(f.request({challengeId:challenge.challengeId,code:'123456'})));
    assert.equal(f.count('integrations/customerRegistry/audit/'),1);assert.equal(f.count('customerAuthIdentities/'),1);
    await assert.rejects(()=>f.accounts.orders({data:{}}),e=>e.code==='unauthenticated');
    assert.equal((await f.accounts.account(f.request({},'b'))).needsPhone,true);
    assert.equal((await f.accounts.completeProfile(f.request({},'b'))).identityReviewRequired,true);
  });
  test(provider+': genuinely new phone is created once and repeated onboarding is idempotent',async()=>{
    const f=fixture(provider);const first=await f.accounts.completeProfile(f.request({phone:otherPhone,nome:'New synthetic customer'}));
    const repeated=await f.accounts.completeProfile(f.request({phone:'+55 (62) 98555-0062',nome:'Do not replace'}));
    assert.equal(first.customer.id,repeated.customer.id);assert.notEqual(first.customer.id,'original');assert.equal(f.count('clientes/'),2);assert.equal(f.sends,0);
    assert.equal(repeated.customer.nome,'New synthetic customer');assert.equal(f.db.rows.get('clientes/original').authOwnerUid,undefined);
  });
}
test('missing index: equivalent formats/number types locate original without writing',async()=>{
  for(const raw of ['62985550061','+55 (62) 98555-0061',5562985550061]){
    const f=fixture();f.db.rows.get('clientes/original').telefone=raw;
    const result=await f.accounts.registry.resolvePhone(phone);assert.equal(result.customerId,'original');assert.equal(f.db.writes.length,0);
    assert.deepEqual(f.db.queries[0].fields,['telefone','phone_number','normalizedPhone','canonicalStatus']);
  }
});
test('missing index: CRM createOrGet also preserves the original instead of creating a duplicate',async()=>{
  const f=fixture(),before=structuredClone(f.db.rows.get('clientes/original'));
  const result=await f.accounts.registry.createOrGet({phone,data:{nome:'Must not replace'}});
  assert.equal(result.customerId,'original');assert.equal(result.created,false);assert.deepEqual(f.db.rows.get('clientes/original'),before);assert.equal(f.db.writes.length,0);
});
test('legacy phone_number is usable; normalizedPhone alone never manufactures a contact record',async()=>{
  const f=fixture('google',{telefone:undefined,phone_number:'+5562985550061'});
  assert.equal((await f.accounts.completeProfile(f.request())).claimRequired,true);
  const challenge=await f.claim.start(f.request()),result=await f.claim.confirm(f.request({challengeId:challenge.challengeId,code:'123456'}));
  assert.equal(result.customer.id,'original');assert.equal(result.customer.telefone,'+5562985550061');
  const invalid=fixture('google',{telefone:undefined,normalizedPhone:'+5562985550061'});
  await assert.rejects(()=>invalid.accounts.completeProfile(invalid.request()),e=>e.code==='failed-precondition');assert.equal(invalid.db.writes.length,0);
});
test('conflicting records, conflicting phone fields and unreviewed aliases require regularization',async()=>{
  for(const change of [f=>f.db.rows.set('clientes/duplicate',{telefone:phone}),f=>{f.db.rows.get('clientes/original').phone_number='+5562985550062';},f=>{f.db.rows.get('clientes/original').canonicalStatus='ALIAS';},f=>{f.db.rows.set('clientes/invalid legacy id',f.db.rows.get('clientes/original'));f.db.rows.delete('clientes/original');}]){
    const f=fixture();change(f);const before=JSON.stringify([...f.db.rows]);
    await assert.rejects(()=>f.accounts.completeProfile(f.request()),e=>e.code==='failed-precondition');assert.equal(JSON.stringify([...f.db.rows]),before);assert.equal(f.db.writes.length,0);
  }
});
test('incomplete or failed coverage never creates a new customer; known indexed phones bypass scanning',async()=>{
  const f=fixture();for(let i=0;i<MAX_LEGACY_PHONE_CANDIDATES;i++)f.db.rows.set('clientes/filler-'+i,{nome:'Unassigned fixture'});
  await assert.rejects(()=>f.accounts.completeProfile(f.request({phone:otherPhone})),e=>e.code==='failed-precondition');assert.equal(f.db.writes.length,0);
  f.db.rows.set(f.accounts.registry.phoneRef(normalizeCustomerPhone(phone)).path,{state:'READY',customerId:'original',normalizedPhone:normalizeCustomerPhone(phone).e164});
  assert.equal((await f.accounts.completeProfile(f.request())).claimRequired,true);
  const failed=fixture();failed.db.collection=()=>{throw Error('Synthetic unavailable query');};
  await assert.rejects(()=>failed.accounts.registry.resolvePhone(phone),e=>e.code==='CUSTOMER_REGISTRY_COVERAGE_REQUIRED');assert.equal(failed.db.writes.length,0);
});
test('two concurrent claims cannot acquire the same legacy customer for different UIDs',async()=>{
  const f=fixture(),a=await f.claim.start(f.request());f.advance(60001);const b=await f.claim.start(f.request({},'b'));
  const results=await Promise.allSettled([f.claim.confirm(f.request({challengeId:a.challengeId,code:'123456'})),f.claim.confirm(f.request({challengeId:b.challengeId,code:'123456'},'b'))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal(f.count('clientes/'),1);assert.equal(f.count('customerAuthIdentities/'),1);assert.equal(f.count('integrations/customerRegistry/audit/'),1);
  assert.equal(f.db.rows.get('clientes/original').authOwnerUids.length,1);
});
test('concurrent replay of one proof consumes it once',async()=>{
  const f=fixture(),challenge=await f.claim.start(f.request()),request=f.request({challengeId:challenge.challengeId,code:'123456'});
  const results=await Promise.allSettled([f.claim.confirm(request),f.claim.confirm(request)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.count('integrations/customerRegistry/audit/'),1);assert.equal(f.count('clientes/'),1);
});
test('atomic claim failure preserves sources/mappings, then an authorized retry can complete once',async()=>{
  const f=fixture(),original=structuredClone(f.db.rows.get('clientes/original')),challenge=await f.claim.start(f.request());f.failClaimCommit();
  const request=f.request({challengeId:challenge.challengeId,code:'123456'});await assert.rejects(()=>f.claim.confirm(request));
  assert.deepEqual(f.db.rows.get('clientes/original'),original);assert.equal(f.count('customerAuthIdentities/'),0);assert.equal(f.count('integrations/customerRegistry/phones/'),0);
  f.advance(20001);assert.equal((await f.claim.confirm(request)).customer.id,'original');assert.equal(f.count('integrations/customerRegistry/audit/'),1);
});
test('expired/incorrect proof and provider send failure leave original history and addresses intact',async()=>{
  const f=fixture(),before=JSON.stringify(f.db.rows.get('clientes/original')),order=JSON.stringify(f.db.rows.get('lojas/synthetic-store/pedidos/old'));
  const challenge=await f.claim.start(f.request());await assert.rejects(()=>f.claim.confirm(f.request({challengeId:challenge.challengeId,code:'000000'})));
  f.advance(300001);await assert.rejects(()=>f.claim.confirm(f.request({challengeId:challenge.challengeId,code:'123456'})));
  f.failProvider();await assert.rejects(()=>f.claim.start(f.request()));
  assert.equal(JSON.stringify(f.db.rows.get('clientes/original')),before);assert.equal(JSON.stringify(f.db.rows.get('lojas/synthetic-store/pedidos/old')),order);assert.equal(f.count('customerAuthIdentities/'),0);
});
async function ownedFixture(extra) {
  const f=fixture('google',extra),identity=f.identity('a');
  Object.assign(f.db.rows.get('clientes/original'),{authOwnerUid:'a',authOwnerUids:['a'],identityRegistryVersion:1});
  f.db.rows.set(f.accounts.registry.uidRef('a').path,{uid:'a',customerId:'original'});
  f.db.rows.set(f.accounts.registry.identityRef(identity).path,{uid:'a',customerId:'original'});return f;
}
test('legacy endereco/address are read without migration; existing enderecos including [] is authoritative',async()=>{
  for(const extra of [{endereco:'Rua antiga'}, {endereco:undefined,address:{street:'Rua antiga',district:'Centro'}}, {enderecos:[]}, {enderecos:[{id:'saved',enderecoCompleto:'Saved',isDefault:true}]}]){
    const f=await ownedFixture(extra),before=JSON.stringify(f.db.rows.get('clientes/original'));
    const first=await f.accounts.account(f.request()),second=await f.accounts.account(f.request());
    assert.equal(first.customer.enderecos.length,Array.isArray(extra.enderecos)?extra.enderecos.length:1);assert.deepEqual(first.customer.enderecos,second.customer.enderecos);
    assert.equal(JSON.stringify(f.db.rows.get('clientes/original')),before);assert.equal(f.db.writes.length,0);
  }
});
test('equivalent legacy endereco/address are not duplicated; deleting virtual address does not resurrect it',async()=>{
  const f=await ownedFixture({address:{street:'Rua antiga',district:'Centro'}}),profile=await f.accounts.account(f.request());assert.equal(profile.customer.enderecos.length,1);
  const id=profile.customer.enderecos[0].id;await f.accounts.deleteAddress(f.request({addressId:id}));
  assert.deepEqual((await f.accounts.account(f.request())).customer.enderecos,[]);assert.equal(f.db.rows.get('clientes/original').endereco,'Rua antiga');assert.equal(f.db.rows.get('clientes/original').address.street,'Rua antiga');
});
test('editing and adding addresses preserves virtual legacy IDs and original source fields',async()=>{
  const f=await ownedFixture({}),legacy=(await f.accounts.account(f.request())).customer.enderecos[0];
  await f.accounts.updateAddress(f.request({addressId:legacy.id,address:{nickname:'Antiga',lat:-16,lng:-49}}));
  await f.accounts.addAddress(f.request({address:{nickname:'Nova',enderecoCompleto:'Rua nova',lat:-16,lng:-49}}));
  const profile=(await f.accounts.account(f.request())).customer;assert.equal(profile.enderecos.length,2);assert.equal(profile.enderecos[0].id,legacy.id);assert.equal(f.db.rows.get('clientes/original').endereco,'Rua antiga');
});
test('reviewed root paths and alternate references list/detail without changing historical documents',async()=>{
  const f=await ownedFixture({enderecos:[],legacyCustomerIds:['old-alias'],legacyOrderPaths:['pedidos/root-customer','pedidos/root-client']});
  f.db.rows.set('pedidos/root-customer',{customerId:'original',total:35,createdAt:'2026-10-02'});
  f.db.rows.set('pedidos/root-client',{clientId:'old-alias',total:50,createdAt:'2026-10-03'});
  f.db.rows.set('lojas/synthetic-store/pedidos/alternate',{customerId:'original',clientId:'old-alias',total:60,createdAt:'2026-10-04'});
  const before=JSON.stringify([...f.db.rows]);const list=await f.accounts.orders(f.request());
  assert.deepEqual(list.orders.map(o=>o.id),['alternate','root-client','root-customer','old']);assert.equal(new Set(list.orders.map(o=>o.id)).size,4);
  assert.equal((await f.accounts.orderDetail(f.request({source:'legacy',orderId:'root-client'}))).order.total,50);
  assert.equal((await f.accounts.orderDetail(f.request({storeId:'synthetic-store',orderId:'alternate'}))).order.total,60);
  assert.equal(JSON.stringify([...f.db.rows]),before);assert.equal(f.db.writes.length,0);
});
test('foreign/conflicting references, foreign owners, unreviewed root paths and forged request IDs are denied',async()=>{
  const f=await ownedFixture({enderecos:[],legacyOrderPaths:['pedidos/conflict']});
  for(const [id,data]of Object.entries({foreign:{customerId:'other'},conflict:{clienteId:'other',customerId:'original'},reverse:{clienteId:'original',clientId:'other'},owner:{clientId:'original',ownerUid:'b'},invalid:{clienteId:{id:'original'},customerId:'original'}}))f.db.rows.set('lojas/synthetic-store/pedidos/'+id,{...data,total:999});
  f.db.rows.set('pedidos/conflict',{customerId:'original',clientId:'other'});f.db.rows.set('pedidos/unreviewed',{clientId:'original'});
  assert.deepEqual((await f.accounts.orders(f.request({customerId:'other',uid:'b'}))).orders.map(o=>o.id),['old']);
  for(const orderId of ['foreign','conflict','reverse','owner','invalid'])await assert.rejects(()=>f.accounts.orderDetail(f.request({storeId:'synthetic-store',orderId})),e=>e.code==='not-found');
  for(const orderId of ['conflict','unreviewed'])await assert.rejects(()=>f.accounts.orderDetail(f.request({source:'legacy',orderId})),e=>e.code==='not-found');
});
test('alternate references preserve pagination and the defensive candidate budget',async()=>{
  const f=await ownedFixture({enderecos:[]});f.db.rows.delete('lojas/synthetic-store/pedidos/old');
  for(let i=0;i<43;i++)f.db.rows.set('lojas/synthetic-store/pedidos/order-'+String(i).padStart(4,'0'),{[i%2?'clientId':'customerId']:'original',createdAt:new Date(1800000000000+i).toISOString(),total:1});
  const a=await f.accounts.orders(f.request()),b=await f.accounts.orders(f.request({cursor:a.nextCursor})),c=await f.accounts.orders(f.request({cursor:b.nextCursor}));
  assert.deepEqual([a.orders.length,b.orders.length,c.orders.length],[20,20,3]);assert.equal(new Set([...a.orders,...b.orders,...c.orders].map(o=>o.id)).size,43);
  for(let i=43;i<1001;i++)f.db.rows.set('lojas/synthetic-store/pedidos/order-'+String(i).padStart(4,'0'),{clientId:'original',total:1});
  await assert.rejects(()=>f.accounts.orders(f.request()),e=>e.code==='resource-exhausted');
});
