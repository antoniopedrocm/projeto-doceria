const test = require('node:test');
const assert = require('node:assert/strict');
const {
  aggregateTransfers,
  hasReportPermission,
  isTransferVisible,
  validateFilters,
} = require('./entre-lojas-report');

const item = (produtoId, nome, quantidade, repasse = 2, revenda = 3) => ({
  produtoId,
  nome,
  quantidade,
  valorUnitarioRepasse: repasse,
  valorUnitarioRevenda: revenda,
  totalRepasse: quantidade * repasse,
  totalRevenda: quantidade * revenda,
});

const transfer = ({
  id,
  date,
  destination = 'garavelo',
  status = 'aguardando_conferencia',
  items,
}) => ({
  id,
  numero: id,
  dataRemessa: date,
  lojaOrigemId: 'matriz',
  lojaOrigemNome: 'Matriz',
  lojaDestinoId: destination,
  lojaDestinoNome: destination === 'garavelo' ? 'Garavelo' : 'Loja X',
  status,
  itens: items,
});

test('agrupa produtos por ID e respeita o filtro de loja destino', () => {
  const report = aggregateTransfers([
    transfer({
      id: '1',
      date: '2026-08-05',
      items: [item('brownie', 'Brownie', 20), item('brigadeiro', 'Brigadeiro', 30)],
    }),
    transfer({
      id: '2',
      date: '2026-08-10',
      items: [item('brownie', 'Brownie', 40), item('brigadeiro', 'Brigadeiro', 10)],
    }),
    transfer({
      id: '3',
      date: '2026-08-12',
      destination: 'loja-x',
      items: [item('brownie', 'Brownie', 50)],
    }),
  ], {destinoId: 'garavelo'});

  assert.deepEqual(
      report.summary.map((row) => [row.productId, row.quantity]),
      [['brownie', 60], ['brigadeiro', 40]],
  );
  assert.equal(report.totals.transferCount, 2);
  assert.equal(report.totals.quantity, 100);
});

test('o filtro de período usa limites ISO inclusivos sem misturar julho', () => {
  const filters = validateFilters({
    startDate: '2026-08-01',
    endDate: '2026-08-31',
  });
  const rows = [
    transfer({id: 'jul', date: '2026-07-31', items: [item('brownie', 'Brownie', 20)]}),
    transfer({id: 'ago', date: '2026-08-01', items: [item('brownie', 'Brownie', 30)]}),
  ].filter((row) => (
    row.dataRemessa >= filters.startDate && row.dataRemessa <= filters.endDate
  ));
  const report = aggregateTransfers(rows, filters);
  assert.equal(report.summary[0].quantity, 30);
});

test('exclui rascunhos e remessas canceladas dos totais efetivos', () => {
  const report = aggregateTransfers([
    transfer({id: 'normal', date: '2026-08-01', items: [item('brownie', 'Brownie', 50)]}),
    transfer({
      id: 'cancelada',
      date: '2026-08-02',
      status: 'cancelado',
      items: [item('brownie', 'Brownie', 100)],
    }),
    transfer({
      id: 'rascunho',
      date: '2026-08-03',
      status: 'rascunho',
      items: [item('brownie', 'Brownie', 200)],
    }),
  ]);
  assert.equal(report.summary[0].quantity, 50);
  assert.equal(report.totals.transferCount, 1);
});

test('não duplica remessa e consolida o mesmo produto repetido no documento', () => {
  const repeated = transfer({
    id: 'unica',
    date: '2026-08-01',
    items: [
      item('brownie', 'Brownie antigo', 20),
      item('brownie', 'Brownie', 30),
    ],
  });
  const report = aggregateTransfers([repeated, repeated]);
  assert.equal(report.summary.length, 1);
  assert.equal(report.summary[0].quantity, 50);
  assert.equal(report.summary[0].transferCount, 1);
  assert.equal(report.detail.length, 1);
});

test('usa valores financeiros históricos dos itens', () => {
  const report = aggregateTransfers([
    transfer({
      id: 'historica',
      date: '2026-08-01',
      items: [item('brownie', 'Brownie', 10, 4.5, 7.25)],
    }),
  ]);
  assert.equal(report.totals.transferTotal, 45);
  assert.equal(report.totals.resaleTotal, 72.5);
});

test('usuário restrito não consulta remessa exclusiva de outra loja', () => {
  const storeIds = ['garavelo'];
  assert.equal(isTransferVisible({
    transfer: {lojaOrigemId: 'matriz', lojaDestinoId: 'loja-x'},
    isOwner: false,
    storeIds,
  }), false);
  assert.equal(isTransferVisible({
    transfer: {lojaOrigemId: 'matriz', lojaDestinoId: 'garavelo'},
    isOwner: false,
    storeIds,
  }), true);
});

test('permissão de relatórios não é concedida por ausência de perfil compatível', () => {
  assert.equal(hasReportPermission({
    profile: {role: 'atendente'},
    customProfile: {permissions: {relatorios: false}},
  }), false);
  assert.equal(hasReportPermission({
    profile: {role: 'gerente'},
  }), true);
  assert.equal(hasReportPermission({
    profile: {role: 'dono'},
    customProfile: {permissions: {relatorios: false}},
  }), true);
});
