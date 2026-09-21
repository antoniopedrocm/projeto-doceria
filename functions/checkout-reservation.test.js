const {test} = require('node:test');
const assert = require('node:assert/strict');
const {shouldNotifyOrder} = require('./checkout-reservation');
test('notificação preserva criação legada e exige confirmação financeira e operacional online', () => {
  assert.equal(shouldNotifyOrder(null, {status:'Pendente'}), true);
  assert.equal(shouldNotifyOrder({status:'Pendente'}, {status:'Entregue'}), false);
  assert.equal(shouldNotifyOrder(null, null), false);
  for (const payment_status of ['PENDING','EXPIRED','FAILED','REFUNDED']) {
    assert.equal(shouldNotifyOrder(null, {payment_status}), false);
  }
  const paid={payment_status:'PAID',order_status:'CONFIRMED'};
  assert.equal(shouldNotifyOrder({payment_status:'PENDING'}, paid), true);
  assert.equal(shouldNotifyOrder(paid, paid), false);
  assert.equal(shouldNotifyOrder(null, {...paid,requiresReview:true}), false);
  assert.equal(shouldNotifyOrder(null, {...paid,order_status:'CANCELLED'}), false);
});
