import {
  ALL_FILTER_VALUE,
  centsToMoney,
  expenseNeedsInvoice,
  getExpenseRecurrence,
  getIncomeSource,
  getPaymentMethod,
  getTransactionStatus,
  isDueSoon,
  matchesCostCenter,
  moneyToCents,
  MONTH_LABELS,
  normalizeText,
  resolveExpenseMonth,
  resolveOrderMonth,
  resolveReceivableMonth,
  shiftMonthKey,
  sumMoneyCents,
  toDateKey
} from './financialUtils.js';

export const DEFAULT_FINANCIAL_FILTERS = Object.freeze({
  category: ALL_FILTER_VALUE,
  status: ALL_FILTER_VALUE,
  recurrence: ALL_FILTER_VALUE,
  paymentMethod: ALL_FILTER_VALUE,
  startDate: '',
  endDate: ''
});

const matchesPeriod = (item, type, filters) => {
  if (!filters.startDate && !filters.endDate) return true;
  const value = type === 'pagar'
    ? item.dataVencimento
    : (type === 'receber' ? (item.dataRecebimento || item.createdAt) : (item.createdAt || item.dataPedido || item.data));
  const dateKey = toDateKey(value);
  if (!dateKey) return false;
  if (filters.startDate && dateKey < filters.startDate) return false;
  if (filters.endDate && dateKey > filters.endDate) return false;
  return true;
};

const matchesStatus = (item, type, status, today) => (
  !status
  || status === ALL_FILTER_VALUE
  || getTransactionStatus(item, type, today) === status
);

const matchesExpenseFilters = (item, filters, today) => (
  (filters.category === ALL_FILTER_VALUE || item.categoria === filters.category)
  && (filters.recurrence === ALL_FILTER_VALUE || getExpenseRecurrence(item) === filters.recurrence)
  && matchesStatus(item, 'pagar', filters.status, today)
  && matchesPeriod(item, 'pagar', filters)
);

const matchesIncomeFilters = (item, type, filters, today) => {
  if (filters.paymentMethod !== ALL_FILTER_VALUE
    && normalizeText(getPaymentMethod(item)) !== normalizeText(filters.paymentMethod)) return false;
  if (!matchesPeriod(item, type, filters)) return false;
  if (type === 'pedido') return filters.status === ALL_FILTER_VALUE || filters.status === 'settled';
  return matchesStatus(item, 'receber', filters.status, today);
};

const aggregateCents = (items, labelFn) => Object.values(items.reduce((groups, item) => {
  const label = labelFn(item) || 'Sem categoria';
  if (!groups[label]) groups[label] = { label, valueCents: 0, count: 0 };
  groups[label].valueCents += moneyToCents(item.valor ?? item.total);
  groups[label].count += 1;
  return groups;
}, {}));

const mergeComparison = (currentItems, previousItems, totalCents) => {
  const previousByLabel = Object.fromEntries(previousItems.map((entry) => [entry.label, entry.valueCents]));
  return currentItems.map((entry) => ({
    ...entry,
    value: centsToMoney(entry.valueCents),
    previousValue: centsToMoney(previousByLabel[entry.label] || 0),
    participation: totalCents > 0 ? (entry.valueCents / totalCents) * 100 : 0
  }));
};

const expenseRows = (items, totalCents) => items
  .map((item) => ({
    id: `${item.lojaId || ''}:${item.id || ''}`,
    label: item.descricao || 'Sem descrição',
    valueCents: moneyToCents(item.valor),
    value: centsToMoney(moneyToCents(item.valor)),
    participation: totalCents > 0 ? (moneyToCents(item.valor) / totalCents) * 100 : 0,
    item
  }))
  .sort((first, second) => second.valueCents - first.valueCents);

export const buildFinancialInsights = ({
  data = {},
  selectedMonth,
  selectedCenter,
  filters = DEFAULT_FINANCIAL_FILTERS,
  today = new Date()
}) => {
  const appliedFilters = { ...DEFAULT_FINANCIAL_FILTERS, ...(filters || {}) };
  const previousMonth = shiftMonthKey(selectedMonth, -1);
  const nextMonth = shiftMonthKey(selectedMonth, 1);
  const selectedYear = Number(String(selectedMonth).split('-')[0]);

  const scopedExpenses = (data.contas_a_pagar || [])
    .filter((item) => matchesCostCenter(item, selectedCenter));
  const scopedReceivables = (data.contas_a_receber || [])
    .filter((item) => matchesCostCenter(item, selectedCenter));
  const scopedOrders = (data.pedidos || [])
    .filter((item) => matchesCostCenter(item, selectedCenter));

  const filteredExpenses = scopedExpenses.filter((item) => matchesExpenseFilters(item, appliedFilters, today));
  const filteredReceivables = scopedReceivables.filter((item) => matchesIncomeFilters(item, 'receber', appliedFilters, today));
  const filteredOrders = scopedOrders.filter((item) => matchesIncomeFilters(item, 'pedido', appliedFilters, today));

  const currentExpenses = filteredExpenses.filter((item) => resolveExpenseMonth(item) === selectedMonth);
  const priorExpenses = filteredExpenses.filter((item) => resolveExpenseMonth(item) === previousMonth);
  const nextExpenses = filteredExpenses.filter((item) => resolveExpenseMonth(item) === nextMonth);
  const paidExpenses = currentExpenses.filter((item) => getTransactionStatus(item, 'pagar', today) === 'settled');
  const pendingExpenses = currentExpenses.filter((item) => getTransactionStatus(item, 'pagar', today) !== 'settled');
  const overdueExpenses = currentExpenses.filter((item) => getTransactionStatus(item, 'pagar', today) === 'overdue');
  const dueSoonExpenses = currentExpenses.filter((item) => isDueSoon(item, 'pagar', today));

  const currentReceivables = filteredReceivables.filter((item) => resolveReceivableMonth(item) === selectedMonth);
  const priorReceivables = filteredReceivables.filter((item) => resolveReceivableMonth(item) === previousMonth);
  const receivedReceivables = currentReceivables.filter((item) => getTransactionStatus(item, 'receber', today) === 'settled');
  const priorReceivedReceivables = priorReceivables.filter((item) => getTransactionStatus(item, 'receber', today) === 'settled');
  const completedOrders = filteredOrders.filter(
    (item) => resolveOrderMonth(item) === selectedMonth && item.status === 'Finalizado'
  );
  const priorCompletedOrders = filteredOrders.filter(
    (item) => resolveOrderMonth(item) === previousMonth && item.status === 'Finalizado'
  );

  const actualIncomeCents = sumMoneyCents([...completedOrders, ...receivedReceivables]);
  const priorActualIncomeCents = sumMoneyCents([...priorCompletedOrders, ...priorReceivedReceivables]);
  const actualExpenseCents = sumMoneyCents(paidExpenses);
  const priorActualExpenseCents = sumMoneyCents(
    priorExpenses.filter((item) => getTransactionStatus(item, 'pagar', today) === 'settled')
  );
  const expectedExpenseCents = sumMoneyCents(currentExpenses);
  const payableCents = sumMoneyCents(pendingExpenses);
  const receivableCents = sumMoneyCents(
    currentReceivables.filter((item) => getTransactionStatus(item, 'receber', today) !== 'settled')
  );
  const overdueCents = sumMoneyCents(overdueExpenses);
  const dueSoonCents = sumMoneyCents(dueSoonExpenses);
  const nextMonthExpenseCents = sumMoneyCents(nextExpenses);

  const currentCategoryGroups = aggregateCents(currentExpenses, (item) => item.categoria || 'Sem categoria')
    .sort((first, second) => second.valueCents - first.valueCents);
  const priorCategoryGroups = aggregateCents(priorExpenses, (item) => item.categoria || 'Sem categoria');

  const currentIncomeEntries = [
    ...completedOrders.map((item) => ({ ...item, source: getIncomeSource(item, 'pedido') })),
    ...receivedReceivables.map((item) => ({ ...item, source: getIncomeSource(item, 'receber') }))
  ];
  const previousIncomeEntries = [
    ...priorCompletedOrders.map((item) => ({ ...item, source: getIncomeSource(item, 'pedido') })),
    ...priorReceivedReceivables.map((item) => ({ ...item, source: getIncomeSource(item, 'receber') }))
  ];
  const currentIncomeGroups = aggregateCents(currentIncomeEntries, (item) => item.source)
    .sort((first, second) => second.valueCents - first.valueCents);
  const previousIncomeGroups = aggregateCents(previousIncomeEntries, (item) => item.source);

  const yearlySeries = MONTH_LABELS.map((month, index) => {
    const monthKey = `${selectedYear}-${String(index + 1).padStart(2, '0')}`;
    const revenueCents = sumMoneyCents(
      filteredOrders.filter((item) => item.status === 'Finalizado' && resolveOrderMonth(item) === monthKey)
        .concat(filteredReceivables.filter(
          (item) => getTransactionStatus(item, 'receber', today) === 'settled'
            && resolveReceivableMonth(item) === monthKey
        ))
    );
    const expenseCents = sumMoneyCents(filteredExpenses.filter(
      (item) => getTransactionStatus(item, 'pagar', today) === 'settled'
        && resolveExpenseMonth(item) === monthKey
    ));
    return {
      month,
      receita: centsToMoney(revenueCents),
      despesa: centsToMoney(expenseCents),
      receitaCents: revenueCents,
      despesaCents: expenseCents
    };
  });

  return {
    summary: {
      actualIncome: centsToMoney(actualIncomeCents),
      priorActualIncome: centsToMoney(priorActualIncomeCents),
      actualExpense: centsToMoney(actualExpenseCents),
      priorActualExpense: centsToMoney(priorActualExpenseCents),
      expectedExpense: centsToMoney(expectedExpenseCents),
      payableAmount: centsToMoney(payableCents),
      receivableAmount: centsToMoney(receivableCents),
      overdueAmount: centsToMoney(overdueCents),
      overdueCount: overdueExpenses.length,
      dueSoonAmount: centsToMoney(dueSoonCents),
      dueSoonCount: dueSoonExpenses.length,
      nextMonthExpense: centsToMoney(nextMonthExpenseCents),
      nextMonth,
      result: centsToMoney(actualIncomeCents - actualExpenseCents),
      projectedResult: centsToMoney(actualIncomeCents + receivableCents - expectedExpenseCents),
      awaitingInvoices: currentExpenses.filter(expenseNeedsInvoice).length
    },
    currentExpenses,
    currentReceivables,
    paidExpenses,
    pendingExpenses,
    overdueExpenses,
    completedOrders,
    largestExpenses: expenseRows(currentExpenses, expectedExpenseCents),
    expenseRanking: mergeComparison(currentCategoryGroups, priorCategoryGroups, expectedExpenseCents),
    incomeSources: mergeComparison(currentIncomeGroups, previousIncomeGroups, actualIncomeCents),
    yearlySeries,
    filtered: {
      expenses: filteredExpenses,
      receivables: filteredReceivables,
      orders: filteredOrders
    }
  };
};
