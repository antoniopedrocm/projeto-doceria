const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildCustomerMigrationPlan,buildConsolidationProposal}=require('./customer-migration-plan');
const {fields,buildSafeMigrationWrites,buildReviewedMigrationWrites}=require('./customer-migration-writes');
const record=(id,telefone,extra={})=>({path:'clientes/'+id,updateTime:'2026-10-24T01:00:00Z',data:{nome:'Fixture',telefone,...extra}});
const raw=r=>({name:'projects/demo-migration/databases/(default)/documents/'+r.path,updateTime:r.updateTime,fields:fields(r.data)});
test('cobertura segura guarda tipos originais, adiciona histórico sem default e isola o grupo manual',()=>{
  const customers=[record('safe','62985550061',{enderecos:[{id:'owned',nickname:'Casa',enderecoCompleto:'Destino teste'}],address:{street:'Rua histórica',city:'Goiânia'}}),record('a','62985550062',{authOwnerUid:'a'}),record('b','62985550062',{authOwnerUid:'b'})];
  const plan=buildCustomerMigrationPlan({customers,orders:[{path:'pedidos/historical',data:{clienteId:'safe'}}]}),typed=customers.map(raw);
  typed[0].fields.enderecos.arrayValue.values[0].mapValue.fields.criadoEm={timestampValue:'2025-01-01T00:00:00Z'};
  const writes=buildSafeMigrationWrites({plan,rawCustomers:typed,now:'2026-10-24'});
  const saved=writes.find(w=>w.path==='clientes/safe');assert.equal(saved.fields.enderecos.arrayValue.values.length,2);assert.deepEqual(saved.fields.enderecos.arrayValue.values[0],typed[0].fields.enderecos.arrayValue.values[0]);assert.equal(saved.fields.enderecos.arrayValue.values[1].mapValue.fields.isDefault.booleanValue,false);
  assert.equal(writes.filter(w=>w.path.startsWith('clientes/')).length,1);assert.ok(writes.every(w=>!w.path.startsWith('pedidos/')&&!w.path.startsWith('lojas/')));assert.equal(saved.fields.legacyOrderPaths.arrayValue.values[0].stringValue,'pedidos/historical');
  assert.equal(saved.updateTime,customers[0].updateTime);
  typed[0].updateTime='changed';assert.throws(()=>buildSafeMigrationWrites({plan,rawCustomers:typed,now:'fixture'}));
});
test('migração rejeita metadado de ownership pré-semeado e vínculo forte contraditório',()=>{
  const customers=[record('a','62985550063')],plan=buildCustomerMigrationPlan({customers}),typed=customers.map(raw);
  typed[0].fields.authOwnerUids=fields({uids:['attacker']}).uids;assert.throws(()=>buildSafeMigrationWrites({plan,rawCustomers:typed,now:'fixture'}));
  delete typed[0].fields.authOwnerUids;assert.throws(()=>buildSafeMigrationWrites({plan,rawCustomers:typed,identities:[{data:{customerId:'a',uid:'attacker'}}],now:'fixture'}));
});
test('consolidação mantém originals dos aliases e tipos, só muda mapping de identity e nunca pedido',()=>{
  const customers=[record('a','62985550064',{authOwnerUid:'one',enderecos:[{id:'saved',nickname:'Casa',enderecoCompleto:'Destino teste',isDefault:true}],lojasVisitadas:['store-a'],cuponsUsados:['USED']}),record('b','62985550064',{authOwnerUid:'two',enderecos:[{id:'old',nickname:'Trabalho',enderecoCompleto:'Outro destino'}],lojasVisitadas:['store-b'],cuponsUsados:['USED','OTHER']})];
  const identities=[{path:'customerAuthIdentities/fixture',updateTime:'2026-10-24T01:00:00Z',data:{customerId:'b',uid:'two'}}];
  const proposal=buildConsolidationProposal({records:customers,canonicalId:'a',samePersonConfirmed:true,identities,orders:[{path:'pedidos/old',data:{clienteId:'b'}}]}),typed=customers.map(raw);
  typed[0].fields.enderecos.arrayValue.values[0].mapValue.fields.criadoEm={timestampValue:'2025-01-01T00:00:00Z'};
  const writes=buildReviewedMigrationWrites({proposal,rawCustomers:typed,identities,migrationId:'fixture',now:'fixture'}),canonical=writes.find(w=>w.path==='clientes/a'),alias=writes.find(w=>w.path==='clientes/b');
  assert.equal(canonical.fields.enderecos.arrayValue.values[0].mapValue.fields.criadoEm.timestampValue,'2025-01-01T00:00:00Z');assert.equal(alias.fields.enderecos,undefined);assert.deepEqual(canonical.fields.cuponsUsados.arrayValue.values.map(v=>v.stringValue),['USED','OTHER']);assert.deepEqual(canonical.fields.lojasVisitadas.arrayValue.values.map(v=>v.stringValue),['store-a','store-b']);
  assert.ok(writes.every(w=>!w.path.startsWith('pedidos/')&&!w.path.startsWith('lojas/')));assert.deepEqual(writes.find(w=>w.path===identities[0].path).updateMask,['customerId']);assert.equal(canonical.fields.authOwnerUids.arrayValue.values.length,2);
});
