import {
  centsToMoney,
  getExpenseRecurrence,
  isEquivalentPreparedExpense,
  matchesCostCenter,
  moneyToCents,
  recurrenceTargetId,
  resolveExpenseMonth,
  rollDueDate,
  shiftMonthKey
} from './financialUtils.js';

export const buildNextMonthPlan = ({
  expenses = [],
  sourceMonth,
  selectedCenter,
  fallbackStoreId = '',
  eligibleIds = null
}) => {
  const targetMonth = shiftMonthKey(sourceMonth, 1);
  const allowedIds = eligibleIds ? new Set(eligibleIds) : null;
  const sources = expenses.filter((item) => (
    matchesCostCenter(item, selectedCenter)
    && resolveExpenseMonth(item) === sourceMonth
    && getExpenseRecurrence(item) !== 'avulsa'
    && (!allowedIds || allowedIds.has(`${item.lojaId || fallbackStoreId}:${item.id}`))
  ));
  const targetExpenses = expenses.filter((item) => resolveExpenseMonth(item) === targetMonth);

  return {
    sourceMonth,
    targetMonth,
    items: sources.map((source) => {
      const recurrence = getExpenseRecurrence(source);
      const alreadyAdded = targetExpenses.some((target) => (
        (target.lojaId || fallbackStoreId) === (source.lojaId || fallbackStoreId)
        && isEquivalentPreparedExpense(source, target, targetMonth)
      ));
      const valueCents = recurrence === 'variavel' ? 0 : moneyToCents(source.valor);
      return {
        key: `${source.lojaId || fallbackStoreId}:${source.id}`,
        storeId: source.lojaId || fallbackStoreId,
        expenseId: source.id,
        targetId: recurrenceTargetId(source, targetMonth),
        description: source.descricao || 'Sem descrição',
        category: source.categoria || 'Sem categoria',
        supplier: source.fornecedorNome || source.fornecedor || '',
        recurrence,
        alreadyAdded,
        selected: !alreadyAdded,
        valueCents,
        value: centsToMoney(valueCents),
        dueDate: rollDueDate(source.dataVencimento, targetMonth)
      };
    })
  };
};

export const buildPrepareSelectionPayload = (planItems = []) => planItems
  .filter((item) => item.selected && !item.alreadyAdded)
  .map((item) => ({
    storeId: item.storeId,
    expenseId: item.expenseId,
    valorCentavos: moneyToCents(item.value),
    dataVencimento: item.dueDate
  }));
