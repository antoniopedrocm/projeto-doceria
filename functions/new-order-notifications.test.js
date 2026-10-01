const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildNewOrderData,
  isAlarmPauseActive,
  isNewPendingOrder,
  profileCanReceiveOrder,
  shouldInterruptAlarmPause,
} = require('./new-order-notifications');

test('autoriza somente perfil vinculado à loja do pedido', () => {
  assert.equal(profileCanReceiveOrder({role: 'gerente', lojaIds: ['matriz']}, 'matriz'), true);
  assert.equal(profileCanReceiveOrder({role: 'gerente', lojaIds: ['garavelo']}, 'matriz'), false);
  assert.equal(profileCanReceiveOrder({role: 'cliente', lojaIds: ['matriz']}, 'matriz'), false);
  assert.equal(profileCanReceiveOrder({role: 'dono', lojaIds: []}, 'matriz'), true);
  assert.equal(profileCanReceiveOrder({role: 'dono', ativo: false}, 'matriz'), false);
  assert.equal(profileCanReceiveOrder({role: 'gerente', authDisabled: true, lojaIds: ['matriz']}, 'matriz'), false);
  assert.equal(profileCanReceiveOrder(
      {role: 'gerente', lojaIds: ['matriz']},
      'matriz',
      {permissions: {pedidos: false}},
  ), false);
  assert.equal(profileCanReceiveOrder({role: 'fornecedor', lojaIds: ['matriz']}, 'matriz'), false);
});

test('reconhece apenas criação com o status exato usado pelo sistema', () => {
  assert.equal(isNewPendingOrder({status: 'Pendente'}), true);
  assert.equal(isNewPendingOrder({status: 'pendente'}), false);
  assert.equal(isNewPendingOrder({}), false);
  assert.equal(isNewPendingOrder({status: 'Finalizado'}), false);
});

test('considera pausa somente enquanto o prazo da combinação está ativo', () => {
  assert.equal(isAlarmPauseActive({pausedUntil: 2_000}, 1_000), true);
  assert.equal(isAlarmPauseActive({pausedUntil: 1_000}, 1_000), false);
  assert.equal(isAlarmPauseActive(null, 1_000), false);
});

test('novo pedido interrompe somente uma pausa que já estava ativa quando ele entrou', () => {
  const pause = {pausedUntil: 20_000, updatedAt: new Date(5_000)};

  assert.equal(shouldInterruptAlarmPause(pause, new Date(10_000), 10_000), true);
  assert.equal(shouldInterruptAlarmPause(pause, new Date(4_000), 10_000), false);
  assert.equal(shouldInterruptAlarmPause({pausedUntil: 9_000}, new Date(10_000), 10_000), false);
});

test('cria payload de dados mínimo para novo pedido', () => {
  const payload = buildNewOrderData({
    orderId: 'ABC123',
    storeId: 'matriz',
    order: {clienteNome: 'Yasmin', total: 51, categoria: 'Delivery'},
  });

  assert.equal(payload.type, 'new_order');
  assert.equal(payload.orderId, 'ABC123');
  assert.equal(payload.storeId, 'matriz');
  assert.equal(payload.dedupeKey, 'matriz:ABC123');
  assert.equal(payload.total, '51,00');
  assert.match(payload.body, /Yasmin/);
  Object.values(payload).forEach((value) => assert.equal(typeof value, 'string'));
});

test('limita textos do payload para permanecer abaixo do teto do FCM', () => {
  const longText = 'x'.repeat(2_000);
  const payload = buildNewOrderData({
    orderId: 'pedido-longo',
    storeId: 'matriz',
    order: {clienteNome: longText, categoria: longText, numeroPedido: longText},
  });

  assert.ok(payload.customerName.length <= 100);
  assert.ok(payload.category.length <= 80);
  assert.ok(payload.body.length <= 240);
});
