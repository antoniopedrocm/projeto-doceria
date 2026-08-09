export const ALL_COST_CENTERS = '__all__';
export const EVENTS_COST_CENTER = 'festas_eventos';
export const ALL_FILTER_VALUE = '__all__';

export const MONTH_LABELS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

export const EXPENSE_RECURRENCE_OPTIONS = [
  { value: 'avulsa', label: 'Avulsa' },
  { value: 'fixa', label: 'Fixa mensal' },
  { value: 'variavel', label: 'Variável mensal' }
];

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Aluguel',
  'Salários',
  'Internet',
  'Energia elétrica',
  'Água',
  'Fornecedores',
  'Marketing',
  'Impostos',
  'Outros'
];

export const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

export const moneyToCents = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const normalized = trimmed.includes(',')
      ? trimmed.replace(/\./g, '').replace(',', '.')
      : trimmed;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

export const centsToMoney = (value) => Math.round(Number(value) || 0) / 100;

export const formatCurrency = (value) => (
  centsToMoney(moneyToCents(value)).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
);

export const sumMoneyCents = (items, valueSelector = (item) => item?.valor ?? item?.total) => (
  (items || []).reduce((total, item) => total + moneyToCents(valueSelector(item)), 0)
);

export const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsedLocalDate = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsedLocalDate.getTime()) ? null : parsedLocalDate;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const toDateKey = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = toDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const monthKeyFromDate = (value) => {
  const dateKey = toDateKey(value);
  return dateKey ? dateKey.slice(0, 7) : '';
};

export const currentMonthKey = () => monthKeyFromDate(new Date());

export const shiftMonthKey = (monthKey, delta) => {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  const base = match
    ? new Date(Number(match[1]), Number(match[2]) - 1 + delta, 1)
    : new Date(new Date().getFullYear(), new Date().getMonth() + delta, 1);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
};

export const isValidMonthKey = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));

export const resolveExpenseMonth = (item = {}) => (
  isValidMonthKey(item.competencia)
    ? item.competencia
    : monthKeyFromDate(item.dataVencimento || item.createdAt)
);

export const resolveReceivableMonth = (item = {}) => (
  isValidMonthKey(item.competencia)
    ? item.competencia
    : monthKeyFromDate(item.dataRecebimento || item.createdAt)
);

export const resolveOrderMonth = (item = {}) => (
  monthKeyFromDate(item.createdAt || item.dataPedido || item.data)
);

export const isEventsRecord = (item = {}) => {
  const text = normalizeText(`${item.centroCusto || ''} ${item.categoria || ''} ${item.origem || ''}`);
  return item.centroCusto === EVENTS_COST_CENTER || text.includes('festa') || text.includes('evento');
};

export const matchesCostCenter = (item = {}, centerId) => {
  if (!centerId || centerId === ALL_COST_CENTERS) return true;
  if (centerId === EVENTS_COST_CENTER) return isEventsRecord(item);
  return item.lojaId === centerId || item.centroCusto === centerId;
};

export const getExpenseRecurrence = (item = {}) => {
  const configured = normalizeText(item.tipoRecorrencia || item.recorrenciaTipo);
  if (['fixa', 'variavel', 'avulsa'].includes(configured)) return configured;
  const category = normalizeText(item.categoria);
  if (category === 'despesa fixa') return 'fixa';
  if (category === 'despesa variavel') return 'variavel';
  return item.recorrente === true ? 'fixa' : 'avulsa';
};

export const expenseNeedsInvoice = (item = {}) => (
  getExpenseRecurrence(item) === 'variavel'
  && (item.aguardandoFatura === true || moneyToCents(item.valor) === 0)
);

export const normalizeIncomeSource = (source) => (
  source === 'Outras receitas' ? 'Outras entradas' : source
);

export const getIncomeSource = (item = {}, kind) => {
  if (kind === 'pedido') {
    if (isEventsRecord(item)) return 'Festas/Eventos';
    if (['Cardapio Online', 'Plataforma'].includes(item.origem)) return 'Cardápio online';
    return 'Venda presencial';
  }
  return normalizeIncomeSource(item.categoria || item.descricao || 'Outras entradas');
};

export const getPaymentMethod = (item = {}) => (
  item.metodo || item.formaPagamento || item.paymentMethod || 'Não informado'
);

export const getTransactionStatus = (item = {}, type, today = new Date()) => {
  const settledStatus = type === 'pagar' ? 'Pago' : 'Recebido';
  if (item.status === settledStatus) return 'settled';
  const dateValue = type === 'pagar' ? item.dataVencimento : item.dataRecebimento;
  const dateKey = toDateKey(dateValue);
  const todayKey = toDateKey(today);
  if (dateKey && todayKey && dateKey < todayKey) return 'overdue';
  return 'pending';
};

export const isDueSoon = (item = {}, type, today = new Date(), days = 7) => {
  if (getTransactionStatus(item, type, today) !== 'pending') return false;
  const dueDate = toDate(type === 'pagar' ? item.dataVencimento : item.dataRecebimento);
  const start = toDate(toDateKey(today));
  if (!dueDate || !start) return false;
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return dueDate >= start && dueDate <= end;
};

export const toDateInput = (value) => toDateKey(value);

export const periodDisplay = (monthKey) => {
  if (!isValidMonthKey(monthKey)) return '-';
  const [year, month] = monthKey.split('-').map(Number);
  return `${MONTH_LABELS[month - 1]} ${year}`;
};

export const rollDueDate = (dueDate, targetMonth) => {
  const dayMatch = toDateKey(dueDate).match(/\d{4}-\d{2}-(\d{2})/);
  const requestedDay = dayMatch ? Number(dayMatch[1]) : 1;
  const [year, month] = targetMonth.split('-').map(Number);
  const maxDay = new Date(year, month, 0).getDate();
  return `${targetMonth}-${String(Math.min(requestedDay, maxDay)).padStart(2, '0')}`;
};

export const recurrenceSeriesId = (item = {}) => String(
  item.serieRecorrenciaId || item.recorrenciaOrigemId || item.id || ''
);

export const recurrenceTargetId = (item, targetMonth) => `${recurrenceSeriesId(item)}__${targetMonth}`;

export const expenseLogicalSignature = (item = {}, targetMonth = resolveExpenseMonth(item)) => {
  const storeId = item.lojaId || '';
  const supplier = item.fornecedorId || item.fornecedorNome || item.fornecedor || '';
  const dueDate = targetMonth === resolveExpenseMonth(item)
    ? toDateKey(item.dataVencimento)
    : rollDueDate(item.dataVencimento, targetMonth);
  return [
    storeId,
    normalizeText(item.descricao),
    normalizeText(item.categoria),
    normalizeText(supplier),
    getExpenseRecurrence(item),
    dueDate
  ].join('|');
};

export const isEquivalentPreparedExpense = (source, target, targetMonth) => {
  if (resolveExpenseMonth(target) !== targetMonth) return false;
  const sourceSeries = recurrenceSeriesId(source);
  return target.id === recurrenceTargetId(source, targetMonth)
    || recurrenceSeriesId(target) === sourceSeries
    || expenseLogicalSignature(source, targetMonth) === expenseLogicalSignature(target, targetMonth)
    || (
      String(target.recorrenciaOrigemId || '') === String(source.id || '')
      && target.recorrenciaOrigemCompetencia === resolveExpenseMonth(source)
    );
};
