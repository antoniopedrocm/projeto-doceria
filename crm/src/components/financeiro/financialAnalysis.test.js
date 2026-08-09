import { buildFinancialInsights, DEFAULT_FINANCIAL_FILTERS } from './financialAnalysis.js';
import { ALL_COST_CENTERS, ALL_FILTER_VALUE, moneyToCents } from './financialUtils.js';

const expense = (id, lojaId, competencia, valor, categoria, status, dataVencimento, extra = {}) => ({
  id, lojaId, competencia, valor, categoria, status, dataVencimento, descricao: id, ...extra
});

const data = {
  contas_a_pagar: [
    expense('jun-insumos', 'loja-a', '2026-06', 10.10, 'Insumos', 'Pago', '2026-06-10'),
    expense('jun-aluguel', 'loja-a', '2026-06', 20.20, 'Aluguel', 'Pago', '2026-06-05'),
    expense('jul-insumos', 'loja-a', '2026-07', 100.10, 'Insumos', 'Pago', '2026-07-10'),
    expense('jul-aluguel', 'loja-a', '2026-07', 50.25, 'Aluguel', 'Pago', '2026-07-05'),
    expense('ago-insumos-pago', 'loja-a', '2026-08', 120.20, 'Insumos', 'Pago', '2026-08-08', { tipoRecorrencia: 'fixa' }),
    expense('ago-insumos-pendente', 'loja-a', '2026-08', 30.10, 'Insumos', 'Pendente', '2026-08-20'),
    expense('ago-aluguel-vencido', 'loja-a', '2026-08', 50.05, 'Aluguel', 'Pendente', '2026-08-10', { tipoRecorrencia: 'fixa' }),
    expense('ago-outra-loja', 'loja-b', '2026-08', 999, 'Insumos', 'Pago', '2026-08-08')
  ],
  contas_a_receber: [
    { id: 'receber-jul', lojaId: 'loja-a', competencia: '2026-07', valor: 300.30, status: 'Recebido', dataRecebimento: '2026-07-12', metodo: 'Pix', categoria: 'Outras entradas' },
    { id: 'receber-ago', lojaId: 'loja-a', competencia: '2026-08', valor: 400.40, status: 'Recebido', dataRecebimento: '2026-08-12', metodo: 'Pix', categoria: 'Outras entradas' }
  ],
  pedidos: [
    { id: 'pedido-jul', lojaId: 'loja-a', total: 200.20, status: 'Finalizado', createdAt: '2026-07-15T12:00:00-03:00', formaPagamento: 'Pix', origem: 'Manual' },
    { id: 'pedido-ago', lojaId: 'loja-a', total: 500.50, status: 'Finalizado', createdAt: '2026-08-15T12:00:00-03:00', formaPagamento: 'Pix', origem: 'Manual' }
  ]
};

const analyze = (selectedMonth, filters = DEFAULT_FINANCIAL_FILTERS, selectedCenter = 'loja-a') => buildFinancialInsights({
  data,
  selectedMonth,
  selectedCenter,
  filters,
  today: new Date('2026-08-15T12:00:00-03:00')
});

test.each([
  ['2026-06', 30.30],
  ['2026-07', 150.35],
  ['2026-08', 120.20]
])('altera toda a análise ao navegar para %s', (month, expectedPaid) => {
  expect(moneyToCents(analyze(month).summary.actualExpense)).toBe(moneyToCents(expectedPaid));
});

test('usa a mesma seleção combinada em cards, tabela e ranking', () => {
  const insights = analyze('2026-08', {
    ...DEFAULT_FINANCIAL_FILTERS,
    category: 'Insumos',
    status: 'settled',
    recurrence: ALL_FILTER_VALUE
  });
  expect(insights.currentExpenses.map((item) => item.id)).toEqual(['ago-insumos-pago']);
  expect(moneyToCents(insights.summary.actualExpense)).toBe(12020);
  expect(moneyToCents(insights.summary.expectedExpense)).toBe(12020);
  expect(insights.expenseRanking).toHaveLength(1);
  expect(moneyToCents(insights.expenseRanking[0].value)).toBe(12020);
});

test('isola loja e calcula vencido, pendente e próximos vencimentos em centavos', () => {
  const insights = analyze('2026-08');
  expect(moneyToCents(insights.summary.expectedExpense)).toBe(20035);
  expect(moneyToCents(insights.summary.payableAmount)).toBe(8015);
  expect(moneyToCents(insights.summary.overdueAmount)).toBe(5005);
  expect(insights.summary.overdueCount).toBe(1);
  expect(moneyToCents(insights.summary.dueSoonAmount)).toBe(3010);
  expect(insights.summary.dueSoonCount).toBe(1);
});

test('ordena maiores gastos e categorias e mantém a soma matemática', () => {
  const insights = analyze('2026-08');
  expect(insights.largestExpenses.map((row) => row.label)).toEqual([
    'ago-insumos-pago', 'ago-aluguel-vencido', 'ago-insumos-pendente'
  ]);
  expect(insights.expenseRanking.map((row) => row.label)).toEqual(['Insumos', 'Aluguel']);
  const rankingCents = insights.expenseRanking.reduce((sum, row) => sum + moneyToCents(row.value), 0);
  expect(rankingCents).toBe(moneyToCents(insights.summary.expectedExpense));
  expect(insights.expenseRanking[0].participation).toBeCloseTo((15030 / 20035) * 100, 5);
});

test('visão geral consolida somente os dados fornecidos e filtro de loja não mistura unidades', () => {
  expect(moneyToCents(analyze('2026-08', DEFAULT_FINANCIAL_FILTERS, ALL_COST_CENTERS).summary.actualExpense)).toBe(111920);
  expect(moneyToCents(analyze('2026-08', DEFAULT_FINANCIAL_FILTERS, 'loja-a').summary.actualExpense)).toBe(12020);
});

test('período adicional usa a mesma base filtrada da competência', () => {
  const insights = analyze('2026-08', {
    ...DEFAULT_FINANCIAL_FILTERS,
    startDate: '2026-08-10',
    endDate: '2026-08-12'
  });
  expect(insights.currentExpenses.map((item) => item.id)).toEqual(['ago-aluguel-vencido']);
  expect(insights.currentReceivables.map((item) => item.id)).toEqual(['receber-ago']);
  expect(moneyToCents(insights.summary.expectedExpense)).toBe(5005);
  expect(moneyToCents(insights.summary.actualIncome)).toBe(40040);
  expect(insights.completedOrders).toHaveLength(0);
});
