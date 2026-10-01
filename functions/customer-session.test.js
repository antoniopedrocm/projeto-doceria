const {test} = require('node:test');
const assert = require('node:assert/strict');

test('checkout pula identificação somente para Customer autenticado e vinculado',async()=>{
  const {isLinkedCustomer}=await import('../crm/public/customer-session.mjs');
  assert.equal(isLinkedCustomer({id:'customer-1',accountLinked:true}),true);
  assert.equal(isLinkedCustomer({id:'legacy-1'}),false);
  assert.equal(isLinkedCustomer(null),false);
});

test('pedido concluído mantém apenas a sessão Customer autenticada',async()=>{
  const {retainAuthenticatedCustomer}=await import('../crm/public/customer-session.mjs');
  const authenticated={id:'customer-1',accountLinked:true};
  assert.equal(retainAuthenticatedCustomer(authenticated),authenticated);
  assert.equal(retainAuthenticatedCustomer({id:'legacy-1'}),null);
});

test('logout em outra aba invalida uma única vez o Customer publicado',async()=>{
  const {createCustomerAuthState}=await import('../crm/public/customer-session.mjs');
  let invalidations=0;
  const state=createCustomerAuthState({onInvalidate:()=>{invalidations+=1;}});
  const accountA=state.observe('uid-a');
  assert.equal(state.publish(accountA),true);

  state.observe(null);
  state.observe(null);

  assert.equal(invalidations,1);
  assert.equal(state.invalidate(),false);
});

test('troca de conta limpa a sessão anterior e rejeita resposta assíncrona antiga',async()=>{
  const {createCustomerAuthState}=await import('../crm/public/customer-session.mjs');
  let invalidations=0;
  const state=createCustomerAuthState({onInvalidate:()=>{invalidations+=1;}});
  const accountA=state.observe('uid-a');
  assert.equal(state.publish(accountA),true);

  const accountB=state.observe('uid-b');

  assert.equal(invalidations,1);
  assert.equal(state.isCurrent(accountA),false);
  assert.equal(state.publish(accountA),false);
  assert.equal(state.isCurrent(accountB),true);
  assert.equal(state.publish(accountB),true);
});

test('conta sem perfil completo pode trocar ou sair sem publicar sessão obsoleta',async()=>{
  const {createCustomerAuthState}=await import('../crm/public/customer-session.mjs');
  let invalidations=0;
  const state=createCustomerAuthState({onInvalidate:()=>{invalidations+=1;}});
  const incomplete=state.observe('uid-incomplete');

  const replacement=state.observe('uid-complete');
  assert.equal(state.isCurrent(incomplete),false);
  assert.equal(invalidations,0);
  assert.equal(state.publish(replacement),true);

  state.observe(null);
  assert.equal(invalidations,1);
});

test('módulo de conta propaga invalidação aos dois contratos dos consumidores',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'..','crm','public','customer-account.js'),'utf8');
  assert.match(source,/createCustomerAuthState\(\{onInvalidate:clearPublishedSession\}\)/);
  assert.match(source,/onSession\(null\);onLogout\(\)/);
});
