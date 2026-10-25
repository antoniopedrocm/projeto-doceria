const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeCustomerPhone}=require('./customer-phone');
const {ownsCustomer}=require('./customer-ownership');
const {historicalAddresses,buildCustomerMigrationPlan,buildConsolidationProposal}=require('./customer-migration-plan');
test('formatos Brasil resolvem mesma chave, sem inventar dígitos ou país',()=>{
  const expected=normalizeCustomerPhone('62985550001');
  for(const value of ['(62) 98555-0001','+55 62 98555-0001','5562985550001'])assert.deepEqual(normalizeCustomerPhone(value),expected);
  assert.equal(expected.e164,'+5562985550001');assert.equal(expected.national,'62985550001');assert.equal(expected.type,'mobile');assert.match(expected.key,/^[a-f0-9]{64}$/);
  assert.equal(normalizeCustomerPhone('6233334444').type,'fixed');
  assert.equal(normalizeCustomerPhone('55999999999').national,'55999999999');
});
test('lista de owners não é confiável sem versão do registro privado; owner legado permanece válido',()=>{
  assert.equal(ownsCustomer({authOwnerUid:'primary',authOwnerUids:['forged']},'primary'),true);
  assert.equal(ownsCustomer({authOwnerUids:['forged']},'forged'),false);
  assert.equal(ownsCustomer({identityRegistryVersion:1,authOwnerUids:['reviewed']},'reviewed'),true);
  assert.equal(ownsCustomer({authOwnerUid:'primary',canonicalStatus:'ALIAS'},'primary'),false);
});
test('país/DDD/prefixo/comprimento inválidos são rejeitados sem completar telefone antigo',()=>{
  for(const value of ['','+1 62985550001','+55999999999','(20) 98233-0290','062985550001','6282330290','62882330290','62985550001 ramal 1','6298555000100',{},null])assert.throws(()=>normalizeCustomerPhone(value),e=>e.code==='CUSTOMER_PHONE_INVALID');
});
test('endereços CRM históricos usam campos comprovados, preservam originais/defaults e são idempotentes',()=>{
  const first={id:'saved',nickname:'Casa da minha Mãe',enderecoCompleto:'Outro destino',isDefault:true};
  const data={endereco:'Rua de teste',bairro:'Centro',cidade:'Goiânia',uf:'GO',cep:'74000000',address:{street:'Rua de teste',district:'Centro',city:'Goiânia',state:'GO',zip:'74000000'},enderecos:[first]};
  const before=JSON.stringify(data),result=historicalAddresses('stable',data);assert.equal(result.length,2);assert.equal(result[0],first);assert.equal(result[1].street,'Rua de teste');assert.equal(result[1].isDefault,false);assert.equal(result[1].lat,undefined);assert.equal(result[1].number,undefined);assert.equal(JSON.stringify(data),before);
  assert.deepEqual(historicalAddresses('stable',{...data,enderecos:result}),result);
  assert.deepEqual(historicalAddresses('stable',{enderecos:[first],newAddress:{street:'rascunho não comprovado'}}),[first]);
});
test('plano isola conflito de UIDs e não altera pedido, alias ou identidade no dry-run',()=>{
  const record=(id,telefone,extra={})=>({path:'clientes/'+id,data:{nome:'Mesmo Nome',telefone,...extra},updateTime:'2026-10-24T00:00:00Z'});
  const input={customers:[record('old','62985550001',{authOwnerUid:'a'}),record('other','+5562985550001',{authOwnerUid:'b'}),record('thiago','62985550002',{endereco:'Rua antiga',cidade:'Goiânia'}),record('missing','')],orders:[{path:'pedidos/historical',data:{clienteId:'old'}}]};
  const before=JSON.stringify(input),plan=buildCustomerMigrationPlan(input);assert.equal(plan.summary.ready,1);assert.equal(plan.summary.manualReview,1);assert.equal(plan.summary.unresolved,1);assert.equal(plan.summary.additionalAddresses,1);
  const conflict=plan.groups.find(g=>g.state!=='READY');assert.ok(conflict.reasons.includes('MULTIPLE_STRONG_UIDS'));assert.equal(conflict.customerId,null);assert.equal(conflict.proposedAddresses,null);assert.deepEqual(conflict.aliases,[]);
  assert.equal(JSON.stringify(input),before);assert.deepEqual(buildCustomerMigrationPlan(input),plan);assert.equal(plan.orderWrites,0);assert.equal(plan.identityWrites,0);assert.equal(plan.customerWrites,0);
});

test('proposta revisável preserva default canônico mesmo em duplicata, todos UIDs/originais e não aplica nada',()=>{
  const address={nickname:'Casa da minha Mãe',street:'Rua antiga',enderecoCompleto:'Rua antiga, 1',lat:-16,lng:-49};
  const records=[{path:'clientes/canonical',data:{telefone:'62985550001',authOwnerUid:'uid-a',enderecos:[{...address,id:'first'},{...address,id:'default',isDefault:true}]}},{path:'clientes/old',data:{telefone:'+5562985550001',authOwnerUid:'uid-b',enderecos:[{...address,id:'old',isDefault:true},{...address,id:'coordinate-conflict',lat:-17}]}}];
  const before=JSON.stringify(records);assert.throws(()=>buildConsolidationProposal({records,canonicalId:'canonical'}));
  const proposal=buildConsolidationProposal({records,canonicalId:'canonical',samePersonConfirmed:true});
  assert.equal(proposal.state,'PROPOSAL_ONLY_NOT_APPROVED_FOR_APPLY');assert.equal(proposal.requiresFinalApproval,true);assert.equal(proposal.addresses.length,2);assert.equal(proposal.proposedDefaultCount,1);assert.equal(proposal.addresses.find(a=>a.address.isDefault).address.id,'default');assert.equal(proposal.addresses[0].sources.length,3);
  assert.deepEqual(proposal.authOwnerUids,['uid-a','uid-b']);assert.equal(JSON.stringify(records),before);assert.equal(proposal.authUserWrites,0);assert.equal(proposal.orderWrites,0);
});
