const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateCashConference,
  calculateCashRefundsCents,
  calculateCashRemovalsCents,
  calculateCashSalesCents,
  calculateCashWithdrawalsCents,
  calculateOtherCashEntriesCents,
  defaultCashPermissions,
  effectiveCashRemovalCents,
  isCashPayment,
  moneyToCents,
  normalizeOperationalDate,
  operationalDayBounds,
  orderReceivedCashCents,
  resolveCashPermissions,
} = require('./caixa-core');

const finalizedAtNoon = new Date('2026-07-27T15:00:00.000Z');

test('converte valores monetarios legados para centavos inteiros', () => {
  assert.equal(moneyToCents(300), 30000);
  assert.equal(moneyToCents('10,25'), 1025);
  assert.equal(moneyToCents('1.234,56'), 123456);
  assert.equal(moneyToCents(''), null);
  assert.equal(moneyToCents('invalido'), null);
});

test('valida datas operacionais reais', () => {
  assert.equal(normalizeOperationalDate('2026-07-27'), '2026-07-27');
  assert.equal(normalizeOperationalDate('2026-02-29'), '');
  assert.equal(normalizeOperationalDate('27/07/2026'), '');
});

test('calcula os limites UTC do dia em Sao Paulo', () => {
  const bounds = operationalDayBounds('2026-07-27', 'America/Sao_Paulo');
  assert.equal(bounds.start.toISOString(), '2026-07-27T03:00:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-07-28T03:00:00.000Z');
});

test('normaliza dinheiro sem confundir Pix ou cartoes', () => {
  assert.equal(isCashPayment(' Dinheiro '), true);
  assert.equal(isCashPayment('CASH'), true);
  assert.equal(isCashPayment('Pix'), false);
  assert.equal(isCashPayment('Cartao de Debito'), false);
});

test('defaults granulares preservam operacao da atendente', () => {
  const attendant = defaultCashPermissions('atendente');
  assert.deepEqual(attendant, {
    registrarInicio: true,
    registrarEncerramento: true,
    registrarRetiradaDespesa: true,
    registrarSangria: false,
    visualizarSangrias: false,
    visualizarConferencia: false,
    visualizarValoresCalculados: false,
    visualizarDivergencias: false,
  });
  assert.ok(Object.values(defaultCashPermissions('gerente')).every(Boolean));
  assert.ok(Object.values(defaultCashPermissions('dono')).every(Boolean));
  assert.ok(Object.values(defaultCashPermissions('contador')).every((v) => !v));
});

test('permissoes customizadas sao lidas de permissionDetails.caixa', () => {
  const permissions = resolveCashPermissions(
    {role: 'atendente'},
    {permissionDetails: {caixa: {registrarInicio: false}}},
  );
  assert.equal(permissions.registrarInicio, false);
  assert.equal(permissions.registrarEncerramento, true);
  assert.equal(permissions.visualizarDivergencias, false);
});

test('pedido finalizado em dinheiro conta somente no dia operacional', () => {
  const order = {
    status: 'Finalizado',
    formaPagamento: 'Dinheiro',
    total: 300,
    finalizadoEm: finalizedAtNoon,
  };
  assert.equal(orderReceivedCashCents(order, '2026-07-27'), 30000);
  assert.equal(orderReceivedCashCents(order, '2026-07-28'), 0);
  assert.equal(orderReceivedCashCents({...order, status: 'Pendente'}, '2026-07-27'), 0);
  assert.equal(orderReceivedCashCents({...order, formaPagamento: 'Pix'}, '2026-07-27'), 0);
});

test('pagamentos divididos contam apenas parcela recebida em dinheiro', () => {
  const order = {
    status: 'Finalizado',
    formaPagamento: 'Dinheiro',
    total: 999,
    finalizadoEm: finalizedAtNoon,
    pagamentos: [
      {metodo: 'Dinheiro', valorCentavos: 12000, status: 'Recebido'},
      {metodo: 'Pix', valorCentavos: 8000, status: 'Recebido'},
      {metodo: 'Dinheiro', valorCentavos: 5000, status: 'Pendente'},
    ],
  };
  assert.equal(orderReceivedCashCents(order, '2026-07-27'), 12000);
});

test('array pagamentos presente impede dupla contagem do campo legado', () => {
  const order = {
    status: 'Finalizado',
    formaPagamento: 'Dinheiro',
    totalCentavos: 30000,
    finalizadoEm: finalizedAtNoon,
    pagamentos: [{
      metodo: 'Dinheiro',
      valorCentavos: 30000,
      status: 'Recebido',
      recebidoEm: finalizedAtNoon,
    }],
  };
  assert.equal(calculateCashSalesCents([order], '2026-07-27'), 30000);
  assert.equal(calculateCashSalesCents([order, order], '2026-07-27'), 60000);
});

test('soma outras entradas e apenas retiradas de despesa pagas', () => {
  const entries = [
    {status: 'Recebido', metodo: 'Dinheiro', valor: 10, dataRecebimento: '2026-07-27'},
    {status: 'Recebido', metodo: 'Pix', valor: 20, dataRecebimento: '2026-07-27'},
  ];
  const withdrawals = [
    {status: 'Pago', origem: 'retirada_caixa', valor: 50, dataRetirada: '2026-07-27'},
    {status: 'Pendente', origem: 'retirada_caixa', valor: 70, dataRetirada: '2026-07-27'},
    {status: 'Pago', origem: 'outra', valor: 80, dataRetirada: '2026-07-27'},
  ];
  assert.equal(calculateOtherCashEntriesCents(entries, '2026-07-27'), 1000);
  assert.equal(calculateCashWithdrawalsCents(withdrawals, '2026-07-27'), 5000);
});

test('ajustes de sangria sao append-only e alteram o valor efetivo', () => {
  const removal = {
    dataOperacional: '2026-07-27',
    valorOriginalCentavos: 15000,
    ajustes: [
      {deltaCentavos: -2000},
      {deltaCentavos: 500},
    ],
  };
  assert.equal(effectiveCashRemovalCents(removal), 13500);
  assert.equal(calculateCashRemovalsCents([removal], '2026-07-27'), 13500);
  assert.equal(calculateCashRemovalsCents([removal], '2026-07-28'), 0);
});

test('estornos somam somente dinheiro concluido no dia', () => {
  const orders = [{
    estornos: [
      {metodo: 'Dinheiro', status: 'Estornado', valorCentavos: 2500, dataOperacional: '2026-07-27'},
      {metodo: 'Pix', status: 'Estornado', valorCentavos: 5000, dataOperacional: '2026-07-27'},
      {metodo: 'Dinheiro', status: 'Pendente', valorCentavos: 3000, dataOperacional: '2026-07-27'},
    ],
  }];
  assert.equal(calculateCashRefundsCents(orders, '2026-07-27'), 2500);
});

test('formula oficial usa centavos e calcula divergencia negativa', () => {
  const conference = calculateCashConference({
    initialCents: 20000,
    cashSalesCents: 30000,
    cashWithdrawalsCents: 5000,
    cashRemovalsCents: 15000,
    closingCents: 28000,
  });
  assert.deepEqual(conference, {
    expectedCents: 30000,
    differenceCents: -2000,
  });
});
