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
