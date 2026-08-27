const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PRODUCTION_STATUS,
  calculateReceiptItems,
  canReceiveProduction,
  getMovementId,
  getNextReceiptStatus,
  getProductionPermissions,
  isReceiptAlreadyProcessed,
  sanitizeProductionItems,
  validateDivergence,
} = require('./producao-vitrine-core');

test('preserva enviado e calcula falta e excesso separadamente', () => {
  const result = calculateReceiptItems([
    {productId: 'brigadeiro', produtoNome: 'Brigadeiro', quantidadeEnviada: 50},
    {productId: 'brownie', produtoNome: 'Brownie', quantidadeEnviada: 30},
  ], [
    {productId: 'brigadeiro', quantidadeRecebida: 48},
    {productId: 'brownie', quantidadeRecebida: 32},
  ]);
  assert.deepEqual(result.map(({quantidadeEnviada, quantidadeRecebida, divergencia}) => ({
    quantidadeEnviada, quantidadeRecebida, divergencia,
  })), [
    {quantidadeEnviada: 50, quantidadeRecebida: 48, divergencia: -2},
    {quantidadeEnviada: 30, quantidadeRecebida: 32, divergencia: 2},
  ]);
});

test('produto não recebido aceita zero e produz divergência integral', () => {
  const [item] = calculateReceiptItems(
      [{productId: 'bolo', quantidadeEnviada: 20}],
      [{productId: 'bolo', quantidadeRecebida: 0}],
  );
  assert.equal(item.quantidadeRecebida, 0);
  assert.equal(item.divergencia, -20);
});

test('sem divergência resulta em recebido', () => {
  const items = calculateReceiptItems(
      [{productId: 'a', quantidadeEnviada: 5}],
      [{productId: 'a', quantidadeRecebida: 5}],
  );
  assert.equal(getNextReceiptStatus(items), PRODUCTION_STATUS.RECEIVED);
});

test('com divergência exige motivo e outro exige descrição', () => {
  const items = [{divergencia: -1}];
  assert.throws(() => validateDivergence(items, ''), /motivo válido/);
  assert.throws(() => validateDivergence(items, 'outro'), /Descreva/);
  assert.equal(validateDivergence(items, 'produto_danificado').hasDivergence, true);
});

test('itens duplicados são rejeitados', () => {
  assert.throws(() => sanitizeProductionItems([
    {productId: 'a', quantidade: 1},
    {productId: 'a', quantidade: 2},
  ]), /Não repita/);
});

test('movimento usa chave determinística de produção e produto', () => {
  assert.equal(getMovementId('prod-1', 'item-9'), getMovementId('prod-1', 'item-9'));
  assert.notEqual(getMovementId('prod-1', 'item-9'), getMovementId('prod-1', 'item-10'));
});

test('status recebido torna retries idempotentes', () => {
  assert.equal(canReceiveProduction(PRODUCTION_STATUS.WAITING), true);
  assert.equal(isReceiptAlreadyProcessed(PRODUCTION_STATUS.RECEIVED), true);
  assert.equal(isReceiptAlreadyProcessed(PRODUCTION_STATUS.RECEIVED_WITH_DIVERGENCE), true);
  assert.equal(canReceiveProduction(PRODUCTION_STATUS.RECEIVED), false);
});

test('permissões respeitam loja e separação explícita de cozinha e atendimento', () => {
  const kitchen = {role: 'atendente', lojaIds: ['matriz'], setor: 'Cozinha'};
  const front = {role: 'atendente', lojaIds: ['matriz'], setor: 'Atendimento'};
  assert.deepEqual(getProductionPermissions(kitchen, 'matriz'), {
    canRead: true, canCreate: true, canReceive: false, canCancel: false,
  });
  assert.deepEqual(getProductionPermissions(front, 'matriz'), {
    canRead: true, canCreate: false, canReceive: true, canCancel: false,
  });
  assert.equal(getProductionPermissions(front, 'garavelo').canRead, false);
});
