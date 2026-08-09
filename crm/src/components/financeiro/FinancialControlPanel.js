import React, { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileClock,
  Filter,
  Plus,
  RotateCcw,
  X
} from 'lucide-react';
import { functions } from '../../firebaseConfig.js';
import AnnualCashFlowChart from './AnnualCashFlowChart.js';
import { DEFAULT_FINANCIAL_FILTERS } from './financialAnalysis.js';
import FinancialKpiCard from './FinancialKpiCard.js';
import { buildNextMonthPlan, buildPrepareSelectionPayload } from './financialPlanning.js';
import FinancialRankings from './FinancialRankings.js';
import TransactionTable from './TransactionTable.js';
import { useFinancialComparison } from './useFinancialComparison.js';
import {
  ALL_COST_CENTERS,
  ALL_FILTER_VALUE,
  currentMonthKey,
  DEFAULT_EXPENSE_CATEGORIES,
  EVENTS_COST_CENTER,
  EXPENSE_RECURRENCE_OPTIONS,
  expenseNeedsInvoice,
  formatCurrency,
  getExpenseRecurrence,
  getPaymentMethod,
  isValidMonthKey,
  matchesCostCenter,
  moneyToCents,
  normalizeIncomeSource,
  periodDisplay,
  resolveExpenseMonth,
  resolveOrderMonth,
  resolveReceivableMonth,
  shiftMonthKey,
  toDateInput
} from './financialUtils.js';

const STORE_ALL_KEY = '__all__';
const tabs = [
  { id: 'dashboard', label: 'Raio-X' },
  { id: 'pagar', label: 'Despesas' },
  { id: 'receber', label: 'Entradas' },
  { id: 'fluxo', label: 'Fluxo' }
];

const usePersistedValue = (key, defaultValue) => {
  const [value, setValue] = useState(() => {
    try {
      return window.localStorage.getItem(key) || defaultValue;
    } catch (error) {
      return defaultValue;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // Persistência local é opcional; o estado da sessão continua funcional.
    }
  }, [key, value]);
  return [value, setValue];
};

const Field = ({ label, children }) => (
  <label className="block space-y-1.5 text-sm font-medium text-gray-700"><span>{label}</span>{children}</label>
);

const inputClassName = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-100 disabled:bg-gray-100 disabled:text-gray-500';
const TextInput = (props) => <input {...props} className={`${inputClassName} ${props.className || ''}`} />;
const SelectInput = ({ children, ...props }) => <select {...props} className={`${inputClassName} ${props.className || ''}`}>{children}</select>;

const PanelModal = ({ title, onClose, children, size = 'max-w-2xl' }) => (
  <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 py-8">
    <section className={`max-h-full w-full ${size} overflow-y-auto rounded-2xl bg-white shadow-2xl`}>
      <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <button type="button" title="Fechar" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
      </header>
      {children}
    </section>
  </div>
);

const lastDateOfMonth = (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  const maxDay = new Date(year, month, 0).getDate();
  return `${monthKey}-${String(maxDay).padStart(2, '0')}`;
};

const buildDefaultDate = (monthKey) => {
  const maxDay = Number(lastDateOfMonth(monthKey).slice(-2));
  return `${monthKey}-${String(Math.min(new Date().getDate(), maxDay)).padStart(2, '0')}`;
};

const FinancialControlPanel = ({
  data = {},
  addItem,
  updateItem,
  deleteItem,
  setConfirmDelete,
  availableStores = [],
  storeInfoMap = {},
  currentStoreId,
  user
}) => {
  const defaultMonth = currentMonthKey();
  const [persistedMonth, setSelectedMonth] = usePersistedValue('financeiro_month', defaultMonth);
  const selectedMonth = isValidMonthKey(persistedMonth) ? persistedMonth : defaultMonth;
  const [selectedCenter, setSelectedCenter] = usePersistedValue('financeiro_cost_center', ALL_COST_CENTERS);
  const [activeTab, setActiveTab] = usePersistedValue('financeiro_panel_tab', 'dashboard');
  const [filters, setFilters] = useState({ ...DEFAULT_FINANCIAL_FILTERS });
  const [modal, setModal] = useState(null);
  const [formData, setFormData] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [planning, setPlanning] = useState(null);
  const [rollingForward, setRollingForward] = useState(false);
  const today = useMemo(() => new Date(), []);
  const normalizedRole = String(user?.role || '').toLowerCase().trim();
  const canManage = ['dono', 'gerente', 'admin', 'administrador', 'administradora'].includes(normalizedRole);

  const allStoreIds = useMemo(() => {
    const ids = new Set((availableStores || []).filter(Boolean));
    if (currentStoreId && currentStoreId !== STORE_ALL_KEY) ids.add(currentStoreId);
    if (user?.lojaId) ids.add(user.lojaId);
    (user?.lojaIds || []).forEach((storeId) => ids.add(storeId));
    Object.values(data || {}).forEach((items) => {
      if (!Array.isArray(items)) return;
      items.forEach((item) => { if (item.lojaId) ids.add(item.lojaId); });
    });
    return Array.from(ids);
  }, [availableStores, currentStoreId, user, data]);

  const isSpecificStoreView = Boolean(currentStoreId && currentStoreId !== STORE_ALL_KEY);
  const scopedStoreIds = useMemo(
    () => (isSpecificStoreView ? [currentStoreId] : allStoreIds),
    [allStoreIds, currentStoreId, isSpecificStoreView]
  );
  const centerOptions = useMemo(() => isSpecificStoreView ? [
    { value: ALL_COST_CENTERS, label: `Toda a unidade — ${storeInfoMap[currentStoreId]?.nome || currentStoreId}` },
    { value: EVENTS_COST_CENTER, label: 'Festas/Eventos desta unidade' }
  ] : [
    { value: ALL_COST_CENTERS, label: 'Visão geral autorizada' },
    ...allStoreIds.map((storeId) => ({ value: storeId, label: storeInfoMap[storeId]?.nome || storeInfoMap[storeId]?.razaoSocial || storeId })),
    { value: EVENTS_COST_CENTER, label: 'Festas/Eventos' }
  ], [allStoreIds, currentStoreId, isSpecificStoreView, storeInfoMap]);

  useEffect(() => {
    if (!centerOptions.some((option) => option.value === selectedCenter)) setSelectedCenter(ALL_COST_CENTERS);
  }, [centerOptions, selectedCenter, setSelectedCenter]);

  useEffect(() => {
    setFilters((current) => {
      const startDate = current.startDate?.startsWith(`${selectedMonth}-`) ? current.startDate : '';
      const endDate = current.endDate?.startsWith(`${selectedMonth}-`) ? current.endDate : '';
      return startDate === current.startDate && endDate === current.endDate
        ? current
        : { ...current, startDate, endDate };
    });
  }, [selectedMonth]);

  const activeCenter = centerOptions.some((option) => option.value === selectedCenter) ? selectedCenter : ALL_COST_CENTERS;
  const insights = useFinancialComparison({ data, selectedMonth, selectedCenter: activeCenter, filters, today });

  const monthScopedExpenses = useMemo(() => (data.contas_a_pagar || []).filter(
    (item) => matchesCostCenter(item, activeCenter) && resolveExpenseMonth(item) === selectedMonth
  ), [data.contas_a_pagar, activeCenter, selectedMonth]);
  const monthScopedReceivables = useMemo(() => (data.contas_a_receber || []).filter(
    (item) => matchesCostCenter(item, activeCenter) && resolveReceivableMonth(item) === selectedMonth
  ), [data.contas_a_receber, activeCenter, selectedMonth]);
  const monthScopedOrders = useMemo(() => (data.pedidos || []).filter(
    (item) => matchesCostCenter(item, activeCenter) && resolveOrderMonth(item) === selectedMonth
  ), [data.pedidos, activeCenter, selectedMonth]);

  const expenseCategories = useMemo(() => Array.from(new Set([
    ...DEFAULT_EXPENSE_CATEGORIES,
    ...monthScopedExpenses.map((item) => item.categoria).filter(Boolean)
  ])).sort((a, b) => a.localeCompare(b, 'pt-BR')), [monthScopedExpenses]);
  const paymentMethods = useMemo(() => Array.from(new Set([
    ...monthScopedReceivables.map(getPaymentMethod),
    ...monthScopedOrders.map(getPaymentMethod)
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')), [monthScopedReceivables, monthScopedOrders]);

  const defaultWriteStoreId = () => {
    if (isSpecificStoreView) return currentStoreId;
    if (activeCenter !== ALL_COST_CENTERS && activeCenter !== EVENTS_COST_CENTER) return activeCenter;
    return scopedStoreIds[0] || '';
  };

  const transactionCenterOptions = useMemo(() => [
    ...scopedStoreIds.map((storeId) => ({ value: storeId, label: storeInfoMap[storeId]?.nome || storeInfoMap[storeId]?.razaoSocial || storeId })),
    { value: EVENTS_COST_CENTER, label: 'Festas/Eventos' }
  ], [scopedStoreIds, storeInfoMap]);

  const openNew = (type) => {
    if (!canManage) return;
    const storeId = defaultWriteStoreId();
    const base = {
      descricao: '', valor: '', status: 'Pendente', competencia: selectedMonth,
      centroCusto: activeCenter === ALL_COST_CENTERS ? (storeId || EVENTS_COST_CENTER) : activeCenter,
      lojaId: storeId, observacao: ''
    };
    setFormData(type === 'pagar'
      ? { ...base, dataVencimento: buildDefaultDate(selectedMonth), categoria: 'Fornecedores', tipoRecorrencia: 'avulsa', fornecedorNome: '' }
      : { ...base, dataRecebimento: buildDefaultDate(selectedMonth), categoria: 'Outras entradas', metodo: 'Pix' });
    setModal({ type, item: null });
  };

  const openEdit = (type, item) => {
    if (!canManage) return;
    setFormData({
      ...item,
      valor: String(item.valor ?? ''),
      competencia: type === 'pagar' ? resolveExpenseMonth(item) : resolveReceivableMonth(item),
      dataVencimento: toDateInput(item.dataVencimento),
      dataRecebimento: toDateInput(item.dataRecebimento),
      categoria: type === 'pagar' ? item.categoria : normalizeIncomeSource(item.categoria),
      centroCusto: item.centroCusto || item.lojaId,
      lojaId: item.lojaId || defaultWriteStoreId()
    });
    setModal({ type, item });
  };

  const closeModal = () => { setModal(null); setFormData({}); };

  const saveTransaction = async (event) => {
    event.preventDefault();
    if (!modal || !canManage) return;
    setFeedback(null);
    const isExpense = modal.type === 'pagar';
    const collectionName = isExpense ? 'contas_a_pagar' : 'contas_a_receber';
    const storeId = formData.lojaId || defaultWriteStoreId();
    if (!storeId) return setFeedback({ type: 'error', message: 'Selecione a loja responsável pelo lançamento.' });
    const valueCents = moneyToCents(formData.valor);
    const payload = {
      descricao: String(formData.descricao || '').trim(),
      valor: valueCents / 100,
      status: formData.status || 'Pendente',
      categoria: formData.categoria || '',
      competencia: formData.competencia || selectedMonth,
      centroCusto: formData.centroCusto || storeId,
      lojaId: storeId,
      observacao: String(formData.observacao || '').trim()
    };
    if (isExpense) {
      payload.dataVencimento = formData.dataVencimento;
      payload.tipoRecorrencia = formData.tipoRecorrencia || 'avulsa';
      payload.recorrente = payload.tipoRecorrencia !== 'avulsa';
      payload.aguardandoFatura = payload.tipoRecorrencia === 'variavel' && valueCents === 0;
      payload.fornecedorNome = String(formData.fornecedorNome || '').trim();
    } else {
      payload.dataRecebimento = formData.dataRecebimento;
      payload.metodo = formData.metodo || 'Pix';
    }
    try {
      if (modal.item) await updateItem(collectionName, modal.item.id, payload, modal.item.lojaId || storeId);
      else await addItem(collectionName, payload, storeId);
      closeModal();
      setFeedback({ type: 'success', message: 'Lançamento salvo.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error?.message || 'Não foi possível salvar o lançamento.' });
    }
  };

  const settleTransaction = async (type, item) => {
    if (!canManage) return;
    if (type === 'pagar' && expenseNeedsInvoice(item)) return setFeedback({ type: 'error', message: 'Informe o valor da fatura antes de marcar a despesa como paga.' });
    try {
      await updateItem(type === 'pagar' ? 'contas_a_pagar' : 'contas_a_receber', item.id, {
        status: type === 'pagar' ? 'Pago' : 'Recebido',
        ...(type === 'pagar' ? { aguardandoFatura: false } : {})
      }, item.lojaId);
    } catch (error) {
      setFeedback({ type: 'error', message: error?.message || 'Não foi possível atualizar o status.' });
    }
  };

  const removeTransaction = (type, item) => {
    if (!canManage) return;
    setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem(type === 'pagar' ? 'contas_a_pagar' : 'contas_a_receber', item.id, item.lojaId) });
  };

  const openPlanning = () => {
    if (!canManage) return;
    const eligibleIds = insights.currentExpenses.map((item) => `${item.lojaId || defaultWriteStoreId()}:${item.id}`);
    const nextPlan = buildNextMonthPlan({
      expenses: data.contas_a_pagar || [], sourceMonth: selectedMonth, selectedCenter: activeCenter,
      fallbackStoreId: defaultWriteStoreId(), eligibleIds
    });
    if (!nextPlan.items.length) {
      setFeedback({ type: 'error', message: 'Nenhuma despesa recorrente elegível nesta seleção.' });
      return;
    }
    setPlanning(nextPlan);
  };

  const updatePlanItem = (key, changes) => setPlanning((previous) => ({
    ...previous,
    items: previous.items.map((item) => item.key === key ? { ...item, ...changes } : item)
  }));

  const selectAllPlanning = (selected) => setPlanning((previous) => ({
    ...previous,
    items: previous.items.map((item) => item.alreadyAdded ? item : { ...item, selected })
  }));

  const submitPlanning = async () => {
    const selectedExpenses = buildPrepareSelectionPayload(planning?.items || []);
    if (!selectedExpenses.length) return setFeedback({ type: 'error', message: 'Selecione ao menos uma despesa para preparar.' });
    setRollingForward(true);
    setFeedback(null);
    try {
      const prepareNextMonth = httpsCallable(functions, 'prepareNextFinancialMonth');
      const result = await prepareNextMonth({
        sourceMonth: planning.sourceMonth,
        targetMonth: planning.targetMonth,
        selectedExpenses
      });
      const createdCount = result.data?.createdCount || 0;
      const ignoredCount = result.data?.ignoredCount || 0;
      setPlanning(null);
      setSelectedMonth(planning.targetMonth);
      setFeedback({ type: 'success', message: `${createdCount} despesa(s) preparada(s) para ${periodDisplay(planning.targetMonth)}${ignoredCount ? `; ${ignoredCount} já existia(m).` : '.'}` });
    } catch (error) {
      setFeedback({ type: 'error', message: error?.message || 'Não foi possível preparar o próximo mês.' });
    } finally {
      setRollingForward(false);
    }
  };

  const nextMonth = shiftMonthKey(selectedMonth, 1);
  const hasNextMonthData = useMemo(() => (
    (data.contas_a_pagar || []).some((item) => matchesCostCenter(item, activeCenter) && resolveExpenseMonth(item) === nextMonth)
    || (data.contas_a_receber || []).some((item) => matchesCostCenter(item, activeCenter) && resolveReceivableMonth(item) === nextMonth)
    || (data.pedidos || []).some((item) => matchesCostCenter(item, activeCenter) && resolveOrderMonth(item) === nextMonth)
    || monthScopedExpenses.some((item) => getExpenseRecurrence(item) !== 'avulsa')
  ), [data, activeCenter, nextMonth, monthScopedExpenses]);
  const canNavigateNext = selectedMonth < defaultMonth || hasNextMonthData;
  const selectedPlanningCount = planning?.items.filter((item) => item.selected && !item.alreadyAdded).length || 0;
  const allPlanningSelected = Boolean(planning?.items.some((item) => !item.alreadyAdded))
    && planning.items.filter((item) => !item.alreadyAdded).every((item) => item.selected);
  const showStoreColumn = !isSpecificStoreView && activeCenter === ALL_COST_CENTERS;

  const renderDashboard = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FinancialKpiCard title="Entradas realizadas" value={insights.summary.actualIncome} previousValue={insights.summary.priorActualIncome} icon={ArrowUpCircle} iconClassName="bg-emerald-50 text-emerald-600" />
        <FinancialKpiCard title="Saídas pagas" value={insights.summary.actualExpense} previousValue={insights.summary.priorActualExpense} favorableIncrease={false} icon={ArrowDownCircle} iconClassName="bg-rose-50 text-rose-600" />
        <FinancialKpiCard title="Resultado realizado" value={insights.summary.result} icon={DollarSign} iconClassName="bg-blue-50 text-blue-600" detail={`Projetado: ${formatCurrency(insights.summary.projectedResult)}`} />
        <FinancialKpiCard title="A pagar" value={insights.summary.payableAmount} icon={FileClock} iconClassName="bg-amber-50 text-amber-600" detail={`${insights.summary.dueSoonCount} conta(s) vencem em até 7 dias`} />
        <FinancialKpiCard title="Vencido" value={insights.summary.overdueAmount} icon={AlertTriangle} iconClassName="bg-red-50 text-red-600" detail={`${insights.summary.overdueCount} conta(s) vencida(s)`} />
        <FinancialKpiCard title={`Previsto em ${periodDisplay(insights.summary.nextMonth)}`} value={insights.summary.nextMonthExpense} icon={Calendar} iconClassName="bg-violet-50 text-violet-600" detail="Despesas já planejadas na próxima competência" />
      </div>
      <AnnualCashFlowChart data={insights.yearlySeries} year={selectedMonth.split('-')[0]} />
      <FinancialRankings largestExpenses={insights.largestExpenses} expenseRanking={insights.expenseRanking} incomeSources={insights.incomeSources} />
    </div>
  );

  const renderCashFlow = () => (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-gray-500">Realizado</p><p className={`mt-3 text-3xl font-bold ${insights.summary.result >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(insights.summary.result)}</p><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-gray-500">Entradas</dt><dd className="font-semibold text-emerald-600">{formatCurrency(insights.summary.actualIncome)}</dd></div><div className="flex justify-between"><dt className="text-gray-500">Saídas pagas</dt><dd className="font-semibold text-red-600">{formatCurrency(insights.summary.actualExpense)}</dd></div></dl></section>
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-gray-500">Previsão</p><p className={`mt-3 text-3xl font-bold ${insights.summary.projectedResult >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(insights.summary.projectedResult)}</p><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-gray-500">A receber</dt><dd className="font-semibold">{formatCurrency(insights.summary.receivableAmount)}</dd></div><div className="flex justify-between"><dt className="text-gray-500">Despesas previstas</dt><dd className="font-semibold">{formatCurrency(insights.summary.expectedExpense)}</dd></div></dl></section>
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><p className="text-xs font-semibold uppercase text-amber-700">Atenções</p><p className="mt-3 text-3xl font-bold text-amber-800">{insights.summary.awaitingInvoices}</p><p className="mt-2 text-sm text-amber-800">Fatura(s) sem valor</p><p className="mt-4 text-sm text-red-700">{insights.summary.overdueCount} vencida(s), total de {formatCurrency(insights.summary.overdueAmount)}</p></section>
    </div>
  );

  return (
    <main className="min-h-full bg-gray-50 p-4 md:p-6">
      <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><h1 className="bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-3xl font-bold text-transparent">Financeiro</h1><p className="mt-1 text-sm text-gray-500">Fluxo de caixa, compromissos e planejamento por competência</p></div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Mês / Competência">
            <div className="flex items-center rounded-xl border border-gray-300 bg-white">
              <button type="button" title="Mês anterior" onClick={() => setSelectedMonth(shiftMonthKey(selectedMonth, -1))} className="p-2.5 text-gray-600 hover:bg-gray-50"><ChevronLeft className="h-5 w-5" /></button>
              <input type="month" value={selectedMonth} onChange={(event) => event.target.value && setSelectedMonth(event.target.value)} className="w-[145px] border-x border-gray-200 px-2 py-2.5 text-sm outline-none" />
              <button type="button" title="Próximo mês" disabled={!canNavigateNext} onClick={() => setSelectedMonth(nextMonth)} className="p-2.5 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </Field>
          <button type="button" onClick={() => setSelectedMonth(defaultMonth)} className="h-[42px] rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">Mês atual</button>
          <Field label="Loja / Centro de custo"><SelectInput value={activeCenter} onChange={(event) => setSelectedCenter(event.target.value)}>{centerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectInput></Field>
          {canManage && <button type="button" onClick={openPlanning} className="inline-flex h-[42px] items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"><CalendarPlus className="h-4 w-4" /> Preparar próximo mês</button>}
        </div>
      </header>

      <section className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between"><h2 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800"><Filter className="h-4 w-4 text-pink-600" /> Filtros da análise</h2><button type="button" onClick={() => setFilters({ ...DEFAULT_FINANCIAL_FILTERS })} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-pink-600"><RotateCcw className="h-3.5 w-3.5" /> Limpar</button></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Field label="Categoria"><SelectInput value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}><option value={ALL_FILTER_VALUE}>Todas</option>{expenseCategories.map((category) => <option key={category} value={category}>{category}</option>)}</SelectInput></Field>
          <Field label="Status"><SelectInput value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value={ALL_FILTER_VALUE}>Todos</option><option value="settled">Pago / Recebido</option><option value="pending">Pendente</option><option value="overdue">Vencido</option></SelectInput></Field>
          <Field label="Tipo de despesa"><SelectInput value={filters.recurrence} onChange={(event) => setFilters((current) => ({ ...current, recurrence: event.target.value }))}><option value={ALL_FILTER_VALUE}>Todos</option>{EXPENSE_RECURRENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectInput></Field>
          <Field label="Forma de pagamento"><SelectInput value={filters.paymentMethod} onChange={(event) => setFilters((current) => ({ ...current, paymentMethod: event.target.value }))}><option value={ALL_FILTER_VALUE}>Todas</option>{paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</SelectInput></Field>
          <Field label="Período inicial"><TextInput type="date" min={`${selectedMonth}-01`} max={lastDateOfMonth(selectedMonth)} value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} /></Field>
          <Field label="Período final"><TextInput type="date" min={`${selectedMonth}-01`} max={lastDateOfMonth(selectedMonth)} value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} /></Field>
        </div>
      </section>

      {feedback && <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${feedback.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{feedback.message}</div>}
      {!canManage && <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">Acesso somente leitura: análises e filtros estão disponíveis; operações de escrita permanecem bloqueadas.</div>}

      <nav className="mb-5 flex w-fit max-w-full overflow-x-auto rounded-xl border border-gray-200 bg-white p-1">
        {tabs.map((tab) => <button type="button" key={tab.id} onClick={() => setActiveTab(tab.id)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === tab.id ? 'bg-pink-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{tab.label}</button>)}
      </nav>

      {activeTab === 'dashboard' && renderDashboard()}
      {activeTab === 'pagar' && <section className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold text-gray-900">Despesas de {periodDisplay(selectedMonth)}</h2>{canManage && <button type="button" onClick={() => openNew('pagar')} className="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-700"><Plus className="h-4 w-4" /> Nova despesa</button>}</div><TransactionTable type="pagar" items={insights.currentExpenses} canManage={canManage} onEdit={(item) => openEdit('pagar', item)} onDelete={(item) => removeTransaction('pagar', item)} onSettle={(item) => settleTransaction('pagar', item)} storeInfoMap={storeInfoMap} showStore={showStoreColumn} today={today} /></section>}
      {activeTab === 'receber' && <section className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold text-gray-900">Entradas de {periodDisplay(selectedMonth)}</h2>{canManage && <button type="button" onClick={() => openNew('receber')} className="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-700"><Plus className="h-4 w-4" /> Nova entrada</button>}</div><TransactionTable type="receber" items={insights.currentReceivables} canManage={canManage} onEdit={(item) => openEdit('receber', item)} onDelete={(item) => removeTransaction('receber', item)} onSettle={(item) => settleTransaction('receber', item)} storeInfoMap={storeInfoMap} showStore={showStoreColumn} today={today} /></section>}
      {activeTab === 'fluxo' && renderCashFlow()}

      {modal && <PanelModal title={modal.item ? 'Editar lançamento' : 'Novo lançamento'} onClose={closeModal}>
        <form className="space-y-4 p-5" onSubmit={saveTransaction}>
          <Field label="Descrição"><TextInput value={formData.descricao || ''} onChange={(event) => setFormData({ ...formData, descricao: event.target.value })} required /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Valor (R$)"><TextInput inputMode="decimal" value={formData.valor || ''} onChange={(event) => setFormData({ ...formData, valor: event.target.value })} required /></Field><Field label="Competência"><TextInput type="month" value={formData.competencia || selectedMonth} onChange={(event) => setFormData({ ...formData, competencia: event.target.value })} required /></Field></div>
          {modal.type === 'pagar' ? <><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Data de vencimento"><TextInput type="date" value={formData.dataVencimento || ''} onChange={(event) => setFormData({ ...formData, dataVencimento: event.target.value })} required /></Field><Field label="Recorrência"><SelectInput value={formData.tipoRecorrencia || 'avulsa'} onChange={(event) => setFormData({ ...formData, tipoRecorrencia: event.target.value })}>{EXPENSE_RECURRENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectInput></Field></div><Field label="Categoria"><TextInput list="financeiro-categorias" value={formData.categoria || ''} onChange={(event) => setFormData({ ...formData, categoria: event.target.value })} required /><datalist id="financeiro-categorias">{expenseCategories.map((category) => <option key={category} value={category} />)}</datalist></Field><Field label="Fornecedor (opcional)"><TextInput value={formData.fornecedorNome || ''} onChange={(event) => setFormData({ ...formData, fornecedorNome: event.target.value })} /></Field></> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Data de recebimento"><TextInput type="date" value={formData.dataRecebimento || ''} onChange={(event) => setFormData({ ...formData, dataRecebimento: event.target.value })} required /></Field><Field label="Método"><SelectInput value={formData.metodo || 'Pix'} onChange={(event) => setFormData({ ...formData, metodo: event.target.value })}><option value="Pix">Pix</option><option value="Cartao">Cartão</option><option value="Dinheiro">Dinheiro</option><option value="Outro">Outro</option></SelectInput></Field><Field label="Fonte"><TextInput value={formData.categoria || ''} onChange={(event) => setFormData({ ...formData, categoria: event.target.value })} required /></Field></div>}
          <Field label="Observação (opcional)"><textarea className={inputClassName} rows={3} value={formData.observacao || ''} onChange={(event) => setFormData({ ...formData, observacao: event.target.value })} /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Centro de custo"><SelectInput value={formData.centroCusto || ''} onChange={(event) => setFormData({ ...formData, centroCusto: event.target.value })} required>{transactionCenterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectInput></Field><Field label="Loja responsável"><SelectInput value={formData.lojaId || ''} onChange={(event) => setFormData({ ...formData, lojaId: event.target.value })} required>{scopedStoreIds.map((storeId) => <option key={storeId} value={storeId}>{storeInfoMap[storeId]?.nome || storeId}</option>)}</SelectInput></Field></div>
          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4"><button type="button" onClick={closeModal} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700">Cancelar</button><button type="submit" className="rounded-xl bg-pink-600 px-5 py-2.5 text-sm font-semibold text-white">Salvar</button></div>
        </form>
      </PanelModal>}

      {planning && <PanelModal title={`Preparar despesas para ${periodDisplay(planning.targetMonth)}`} onClose={() => !rollingForward && setPlanning(null)} size="max-w-4xl">
        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">Revise, selecione e ajuste os valores. Pagamento, comprovantes e conciliação não serão copiados.</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Competência de origem"><TextInput type="month" value={planning.sourceMonth} disabled /></Field><Field label="Próxima competência"><TextInput type="month" value={planning.targetMonth} disabled /></Field></div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700"><input type="checkbox" checked={allPlanningSelected} onChange={(event) => selectAllPlanning(event.target.checked)} /> Selecionar todas as elegíveis</label>
          <div className="max-h-[420px] space-y-2 overflow-y-auto">
            {planning.items.map((item) => <div key={item.key} className={`grid grid-cols-1 gap-3 rounded-xl border p-4 md:grid-cols-[minmax(0,1fr)_150px_160px] ${item.alreadyAdded ? 'border-gray-200 bg-gray-50 opacity-75' : 'border-gray-200 bg-white'}`}>
              <div className="flex gap-3"><input type="checkbox" className="mt-1" checked={item.selected} disabled={item.alreadyAdded} onChange={(event) => updatePlanItem(item.key, { selected: event.target.checked })} /><div className="min-w-0"><p className="font-semibold text-gray-900">{item.description}</p><p className="mt-1 text-xs text-gray-500">{item.category} · {item.recurrence === 'fixa' ? 'Fixa mensal' : 'Variável mensal'}{item.supplier ? ` · ${item.supplier}` : ''}</p>{item.alreadyAdded && <span className="mt-2 inline-flex rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Já adicionada</span>}</div></div>
              <Field label="Valor (R$)"><TextInput inputMode="decimal" value={item.value} disabled={item.alreadyAdded} onChange={(event) => updatePlanItem(item.key, { value: event.target.value })} /></Field>
              <Field label="Vencimento"><TextInput type="date" min={`${planning.targetMonth}-01`} max={lastDateOfMonth(planning.targetMonth)} value={item.dueDate} disabled={item.alreadyAdded} onChange={(event) => updatePlanItem(item.key, { dueDate: event.target.value })} /></Field>
            </div>)}
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 pt-4"><span className="text-sm text-gray-500">{selectedPlanningCount} selecionada(s)</span><div className="flex gap-3"><button type="button" disabled={rollingForward} onClick={() => setPlanning(null)} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700">Cancelar</button><button type="button" disabled={rollingForward || !selectedPlanningCount} onClick={submitPlanning} className="rounded-xl bg-pink-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{rollingForward ? 'Preparando...' : 'Confirmar preparação'}</button></div></div>
        </div>
      </PanelModal>}
    </main>
  );
};

export default FinancialControlPanel;
