const test = require('node:test');
const assert = require('node:assert/strict');

const {
  aggregateCustomerOrders,
  buildCustomerIdentityIndex,
  resolveOrderCustomerId,
  summarizeStoreMetrics,
} = require('./customer-purchase-metrics-core');

const order = (overrides = {}) => ({
  clienteId: 'sablina',
  total: 51,
  createdAt: new Date('2026-08-20T12:00:00.000Z'),
  origem: 'Plataforma',
  status: 'Finalizado',
  ...overrides,
});

test('contabiliza o pedido finalizado de Plataforma da SABLINA', () => {
  const result = aggregateCustomerOrders([order()], 'sablina');
  assert.equal(result.totalCents, 5100);
  assert.equal(result.purchaseCount, 1);
  assert.equal(result.lastPurchaseMillis, Date.parse('2026-08-20T12:00:00.000Z'));
});

test('soma vários pedidos em centavos e ignora cancelados', () => {
  const result = aggregateCustomerOrders([
    order({total: 10, origem: 'Manual'}),
    order({total: 20, origem: 'Plataforma'}),
    order({total: 30, origem: '99Food'}),
    order({total: 99, status: 'Cancelado'}),
  ], 'sablina');
  assert.equal(result.totalCents, 6000);
  assert.equal(result.purchaseCount, 3);
});

test('cliente sem pedidos permanece zerado', () => {
  const result = aggregateCustomerOrders([], 'sem-pedidos');
  assert.deepEqual(result, {
    totalCents: 0,
    purchaseCount: 0,
    lastPurchase: null,
    lastPurchaseMillis: 0,
  });
});

test('reprocessamento recalculado não duplica o pedido', () => {
  const orders = [order()];
  assert.equal(aggregateCustomerOrders(orders, 'sablina').totalCents, 5100);
  assert.equal(aggregateCustomerOrders(orders, 'sablina').totalCents, 5100);
});

test('alteração e cancelamento são refletidos por recálculo completo', () => {
  assert.equal(aggregateCustomerOrders([order({total: 61})], 'sablina').totalCents, 6100);
  assert.equal(aggregateCustomerOrders([
    order({total: 61, status: 'Cancelado'}),
  ], 'sablina').totalCents, 0);
});

test('última compra usa o pedido válido mais recente', () => {
  const result = aggregateCustomerOrders([
    order({total: 10, createdAt: new Date('2026-08-10T12:00:00.000Z')}),
    order({total: 20, createdAt: new Date('2026-08-20T12:00:00.000Z')}),
    order({
      total: 30,
      status: 'Cancelado',
      createdAt: new Date('2026-08-21T12:00:00.000Z'),
    }),
  ], 'sablina');
  assert.equal(result.lastPurchaseMillis, Date.parse('2026-08-20T12:00:00.000Z'));
});

test('histórico sem clienteId só vincula por documento ou telefone únicos', () => {
  const index = buildCustomerIdentityIndex([
    {id: 'sablina', nome: 'SABLINA CARNEIRO', cpf: '123.456.789-00', telefone: '62982671475'},
    {id: 'homonima', nome: 'SABLINA CARNEIRO', telefone: '62999999999'},
  ]);
  assert.equal(resolveOrderCustomerId({clienteDocumento: '12345678900'}, index), 'sablina');
  assert.equal(resolveOrderCustomerId({telefone: '(62) 98267-1475'}, index), 'sablina');
  assert.equal(resolveOrderCustomerId({clienteNome: 'SABLINA CARNEIRO'}, index), null);
});

test('identificador duplicado não associa clientes diferentes', () => {
  const index = buildCustomerIdentityIndex([
    {id: 'a', telefone: '62999999999'},
    {id: 'b', telefone: '62999999999'},
  ]);
  assert.equal(resolveOrderCustomerId({telefone: '62999999999'}, index), null);
});

test('consolidação global soma lojas sem misturar a exibição por loja', () => {
  const storeA = {
    valorEmComprasCentavos: 5100,
    numeroDeCompras: 1,
    ultimaCompra: new Date('2026-08-20T12:00:00.000Z'),
    ultimaCompraMillis: Date.parse('2026-08-20T12:00:00.000Z'),
  };
  const storeB = {
    valorEmComprasCentavos: 2000,
    numeroDeCompras: 1,
    ultimaCompra: new Date('2026-08-19T12:00:00.000Z'),
    ultimaCompraMillis: Date.parse('2026-08-19T12:00:00.000Z'),
  };
  const global = summarizeStoreMetrics({matriz: storeA, filial: storeB});
  assert.equal(storeA.valorEmComprasCentavos, 5100);
  assert.equal(global.totalCents, 7100);
  assert.equal(global.purchaseCount, 2);
  assert.equal(global.lastPurchase, storeA.ultimaCompra);
});
