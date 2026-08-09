import { buildNextMonthPlan, buildPrepareSelectionPayload } from './financialPlanning.js';
import { ALL_COST_CENTERS } from './financialUtils.js';

const expenses = [
  { id: 'aluguel', lojaId: 'loja-a', descricao: 'Aluguel', categoria: 'Aluguel', valor: 1000, competencia: '2026-08', dataVencimento: '2026-08-31', status: 'Pago', tipoRecorrencia: 'fixa' },
  { id: 'energia', lojaId: 'loja-a', descricao: 'Energia', categoria: 'Energia elétrica', valor: 450, competencia: '2026-08', dataVencimento: '2026-08-15', status: 'Pendente', tipoRecorrencia: 'variavel' },
  { id: 'equipamento', lojaId: 'loja-a', descricao: 'Equipamento', categoria: 'Outros', valor: 2000, competencia: '2026-08', dataVencimento: '2026-08-20', status: 'Pago', tipoRecorrencia: 'avulsa' },
  { id: 'copia-legada-aluguel', lojaId: 'loja-a', descricao: 'Aluguel', categoria: 'Aluguel', valor: 1000, competencia: '2026-09', dataVencimento: '2026-09-30', status: 'Pendente', tipoRecorrencia: 'fixa' }
];

test('prepara somente recorrentes, adapta datas e marca o que já foi adicionado', () => {
  const plan = buildNextMonthPlan({ expenses, sourceMonth: '2026-08', selectedCenter: ALL_COST_CENTERS, fallbackStoreId: 'loja-a' });
  expect(plan.targetMonth).toBe('2026-09');
  expect(plan.items.map((item) => item.expenseId)).toEqual(['aluguel', 'energia']);
  expect(plan.items[0]).toMatchObject({ alreadyAdded: true, selected: false, dueDate: '2026-09-30', value: 1000 });
  expect(plan.items[1]).toMatchObject({ alreadyAdded: false, selected: true, dueDate: '2026-09-15', value: 0 });
});

test('payload contém somente itens selecionados e nunca reenvia já adicionados', () => {
  const plan = buildNextMonthPlan({ expenses, sourceMonth: '2026-08', selectedCenter: ALL_COST_CENTERS, fallbackStoreId: 'loja-a' });
  const payload = buildPrepareSelectionPayload(plan.items);
  expect(payload).toEqual([{ storeId: 'loja-a', expenseId: 'energia', valorCentavos: 0, dataVencimento: '2026-09-15' }]);
});
