const FINANCIAL_RECURRENCE_FIXED = 'fixa';
const FINANCIAL_RECURRENCE_VARIABLE = 'variavel';
const FINANCIAL_RECURRENCE_SINGLE = 'avulsa';

const isValidFinancialMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));

const shiftFinancialMonth = (monthKey, delta) => {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const getExpenseRecurrenceType = (expense = {}) => {
  const configured = normalizeText(expense.tipoRecorrencia || expense.recorrenciaTipo);
  if ([FINANCIAL_RECURRENCE_FIXED, FINANCIAL_RECURRENCE_VARIABLE, FINANCIAL_RECURRENCE_SINGLE].includes(configured)) {
    return configured;
  }
  const category = normalizeText(expense.categoria);
  if (category === 'despesa fixa') return FINANCIAL_RECURRENCE_FIXED;
  if (category === 'despesa variavel') return FINANCIAL_RECURRENCE_VARIABLE;
  return expense.recorrente === true ? FINANCIAL_RECURRENCE_FIXED : FINANCIAL_RECURRENCE_SINGLE;
};

const getExpenseMonth = (expense = {}) => {
  if (isValidFinancialMonth(expense.competencia)) return expense.competencia;
  if (typeof expense.dataVencimento === 'string' && isValidFinancialMonth(expense.dataVencimento.slice(0, 7))) {
    return expense.dataVencimento.slice(0, 7);
  }
  if (expense.dataVencimento && typeof expense.dataVencimento.toDate === 'function') {
    const date = expense.dataVencimento.toDate();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  return '';
};

const rollFinancialDueDate = (dueDate, targetMonth) => {
  const dayMatch = String(dueDate || '').match(/^\d{4}-\d{2}-(\d{2})/);
  const requestedDay = dayMatch ? Number(dayMatch[1]) : 1;
  const [year, month] = targetMonth.split('-').map(Number);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${targetMonth}-${String(Math.min(requestedDay, maxDay)).padStart(2, '0')}`;
};

const isValidDueDateForMonth = (dueDate, monthKey) => {
  const match = String(dueDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || `${match[1]}-${match[2]}` !== monthKey) return false;
  const [year, month] = monthKey.split('-').map(Number);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Number(match[3]) >= 1 && Number(match[3]) <= maxDay;
};

const expenseSeriesId = (expense = {}, expenseId = '') => String(
  expense.serieRecorrenciaId || expense.recorrenciaOrigemId || expenseId
);

const safeSeriesId = (seriesId) => {
  const cleaned = String(seriesId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 500);
  return cleaned || 'recorrencia';
};

const recurrenceTargetId = (expense, expenseId, targetMonth) => (
  `${safeSeriesId(expenseSeriesId(expense, expenseId))}__${targetMonth}`
);

const expenseLogicalKey = (expense = {}, storeId, targetMonth, dueDate = null) => [
  storeId || expense.lojaId || '',
  normalizeText(expense.descricao),
  normalizeText(expense.categoria),
  normalizeText(expense.fornecedorId || expense.fornecedorNome || expense.fornecedor),
  getExpenseRecurrenceType(expense),
  dueDate || rollFinancialDueDate(expense.dataVencimento, targetMonth)
].join('|');

const paymentStateFields = [
  'dataPagamento', 'dataEfetivaPagamento', 'pagoEm', 'pagoPor', 'baixadoEm', 'baixadoPor',
  'comprovante', 'comprovanteUrl', 'comprovanteStoragePath', 'arquivoComprovante',
  'conciliacao', 'conciliado', 'conciliadoEm', 'conciliadoPor', 'dataConciliacao',
  'movimentoFinanceiroId', 'movimentoCaixaId', 'caixaRegistroId', 'efetivadoEm', 'settledAt', 'paidAt'
];

const normalizeMoneyCents = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fallback;
  return parsed;
};

const buildTargetExpense = (expense, {
  expenseId,
  storeId,
  sourceMonth,
  targetMonth,
  valueCents,
  dueDate,
  serverTimestamp,
  requesterUid
}) => {
  const recurrenceType = getExpenseRecurrenceType(expense);
  const defaultValueCents = recurrenceType === FINANCIAL_RECURRENCE_VARIABLE
    ? 0
    : Math.round((Number(expense.valor) || 0) * 100);
  const normalizedValueCents = normalizeMoneyCents(valueCents, defaultValueCents);
  const seriesId = expenseSeriesId(expense, expenseId);
  const targetStoreId = storeId || expense.lojaId || '';
  const idempotencyKey = `${targetStoreId}:${seriesId}:${targetMonth}`;
  const targetExpense = {
    ...expense,
    lojaId: targetStoreId,
    valor: normalizedValueCents / 100,
    dataVencimento: isValidDueDateForMonth(dueDate, targetMonth)
      ? dueDate
      : rollFinancialDueDate(expense.dataVencimento, targetMonth),
    competencia: targetMonth,
    status: 'Pendente',
    tipoRecorrencia: recurrenceType,
    recorrente: true,
    aguardandoFatura: recurrenceType === FINANCIAL_RECURRENCE_VARIABLE && normalizedValueCents === 0,
    serieRecorrenciaId: seriesId,
    geradoPorRecorrencia: true,
    recorrenciaOrigemId: expenseId,
    recorrenciaOrigemCompetencia: sourceMonth,
    chaveIdempotenciaFinanceira: idempotencyKey,
    preparadoPor: requesterUid,
    preparadoEm: serverTimestamp,
    createdAt: serverTimestamp,
    updatedAt: serverTimestamp
  };
  paymentStateFields.forEach((field) => delete targetExpense[field]);
  return targetExpense;
};

module.exports = {
  FINANCIAL_RECURRENCE_FIXED,
  FINANCIAL_RECURRENCE_VARIABLE,
  FINANCIAL_RECURRENCE_SINGLE,
  buildTargetExpense,
  expenseLogicalKey,
  expenseSeriesId,
  getExpenseMonth,
  getExpenseRecurrenceType,
  isValidDueDateForMonth,
  isValidFinancialMonth,
  normalizeMoneyCents,
  recurrenceTargetId,
  rollFinancialDueDate,
  shiftFinancialMonth
};
