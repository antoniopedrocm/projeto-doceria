import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  CalendarDays,
  History,
  Plus,
  Save,
  Search,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import {
  createIdempotencyKey,
  formatCentsBRL,
  getDocumentCents,
  getLocalOperationalDate,
  getMonthStartDate,
  parseCurrencyToCents,
  sanitizeCaixaPermissions,
} from '../../caixa/caixaCore';
import {
  ajustarSangriaCaixa,
  listarConferenciasCaixa,
  listarSangriasCaixa,
  obterRegistroDiarioCaixa,
  registrarEncerramentoCaixa,
  registrarSangriaCaixa,
  registrarValorInicialCaixa,
} from '../../services/caixaService';

const getErrorMessage = (error, fallback) => String(
  error?.details?.message || error?.message || fallback,
).replace(/^FirebaseError:\s*/i, '');

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateTime = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleString('pt-BR') : '-';
};

const formatDate = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  const date = toDate(value);
  return date ? date.toLocaleDateString('pt-BR') : '-';
};

const firstValue = (source, keys, fallback = null) => {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== '') {
      return source[key];
    }
  }
  return fallback;
};

const getRegistrant = (source, prefix) => firstValue(source, [
  `${prefix}ResponsavelNome`,
  `${prefix}RegistradoPorNome`,
  `${prefix}PorNome`,
  `${prefix}ResponsavelEmail`,
  `${prefix}RegistradoPorEmail`,
  `${prefix}PorEmail`,
  `${prefix}ResponsavelUid`,
  `${prefix}RegistradoPorUid`,
], '-');

const inputClassName = 'w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500';
const primaryButtonClassName = 'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 px-5 py-3 font-medium text-white shadow-lg transition hover:from-pink-600 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClassName = 'inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';

const getInitialOperationalDate = () => {
  try {
    const requestedDate = sessionStorage.getItem('caixa_operational_date');
    sessionStorage.removeItem('caixa_operational_date');
    return /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '')
      ? requestedDate
      : getLocalOperationalDate();
  } catch (error) {
    return getLocalOperationalDate();
  }
};

const SectionCard = ({ title, description, icon: Icon, children }) => (
  <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-lg md:p-6">
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pink-100 text-pink-700">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-gray-800">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
    </div>
    {children}
  </section>
);

const Feedback = ({ feedback }) => feedback?.text ? (
  <p className={`rounded-xl border p-3 text-sm ${
    feedback.type === 'success'
      ? 'border-green-200 bg-green-50 text-green-800'
      : 'border-red-200 bg-red-50 text-red-800'
  }`}>
    {feedback.text}
  </p>
) : null;

const ValueSummary = ({ label, cents, registrant, timestamp, observation }) => (
  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
    <p className="mt-1 text-xl font-bold text-gray-900">
      {cents === null ? 'Ainda não informado' : formatCentsBRL(cents)}
    </p>
    {cents !== null && (
      <div className="mt-2 space-y-1 text-xs text-gray-500">
        <p>Registrado por: {registrant || '-'}</p>
        <p>Data e hora: {formatDateTime(timestamp)}</p>
        {observation && <p>Observação: {observation}</p>}
      </div>
    )}
  </div>
);

const CaixaTab = ({
  currentUser,
  effectiveStoreId,
  availableStores = [],
  storeInfoMap = {},
  retiradas = [],
  getRetiradaDate,
  getRetiradaRegistrant,
  onNewRetirada,
}) => {
  const permissions = useMemo(() => sanitizeCaixaPermissions(
    currentUser?.permissionDetails?.caixa || currentUser?.customPermissionDetails?.caixa,
    currentUser?.role,
  ), [currentUser]);

  const storeOptions = useMemo(() => {
    const ids = new Set((availableStores || []).filter(Boolean));
    if (effectiveStoreId) ids.add(effectiveStoreId);
    return Array.from(ids);
  }, [availableStores, effectiveStoreId]);

  const [storeId, setStoreId] = useState(effectiveStoreId || storeOptions[0] || '');
  const [activeArea, setActiveArea] = useState('registro');
  const [operationalDate, setOperationalDate] = useState(getInitialOperationalDate);
  const [record, setRecord] = useState(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [initialValue, setInitialValue] = useState('');
  const [initialObservation, setInitialObservation] = useState('');
  const [closingValue, setClosingValue] = useState('');
  const [closingObservation, setClosingObservation] = useState('');
  const [savingInitial, setSavingInitial] = useState(false);
  const [savingClosing, setSavingClosing] = useState(false);
  const [recordFeedback, setRecordFeedback] = useState({ type: '', text: '' });
  const initialSubmittingRef = useRef(false);
  const closingSubmittingRef = useRef(false);
  const initialIdempotencyRef = useRef(createIdempotencyKey('caixa-inicio'));
  const closingIdempotencyRef = useRef(createIdempotencyKey('caixa-encerramento'));

  const [sangriaValue, setSangriaValue] = useState('');
  const [sangriaReason, setSangriaReason] = useState('');
  const [sangriaObservation, setSangriaObservation] = useState('');
  const [sangriaDestination, setSangriaDestination] = useState('');
  const [savingSangria, setSavingSangria] = useState(false);
  const [sangrias, setSangrias] = useState([]);
  const [sangriaStart, setSangriaStart] = useState(getMonthStartDate());
  const [sangriaEnd, setSangriaEnd] = useState(getLocalOperationalDate());
  const [sangriasLoading, setSangriasLoading] = useState(false);
  const [sangriaFeedback, setSangriaFeedback] = useState({ type: '', text: '' });
  const sangriaSubmittingRef = useRef(false);
  const sangriaIdempotencyRef = useRef(createIdempotencyKey('caixa-sangria'));
  const [sangriaAdjustment, setSangriaAdjustment] = useState({
    id: '',
    value: '',
    reason: '',
    observation: '',
  });
  const [savingSangriaAdjustment, setSavingSangriaAdjustment] = useState(false);
  const sangriaAdjustmentSubmittingRef = useRef(false);
  const sangriaAdjustmentIdempotencyRef = useRef(createIdempotencyKey('caixa-ajuste-sangria'));

  const [historyStart, setHistoryStart] = useState(getMonthStartDate());
  const [historyEnd, setHistoryEnd] = useState(getLocalOperationalDate());
  const [historyResponsible, setHistoryResponsible] = useState('');
  const [historyDifference, setHistoryDifference] = useState('all');
  const [conferences, setConferences] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFeedback, setHistoryFeedback] = useState({ type: '', text: '' });

  useEffect(() => {
    if (effectiveStoreId) {
      setStoreId(effectiveStoreId);
    } else if (!storeId && storeOptions.length) {
      setStoreId(storeOptions[0]);
    }
  }, [effectiveStoreId, storeId, storeOptions]);

  useEffect(() => {
    initialIdempotencyRef.current = createIdempotencyKey(`${storeId || 'sem-loja'}:${operationalDate}:inicio`);
    closingIdempotencyRef.current = createIdempotencyKey(`${storeId || 'sem-loja'}:${operationalDate}:encerramento`);
    sangriaIdempotencyRef.current = createIdempotencyKey(`${storeId || 'sem-loja'}:${operationalDate}:sangria`);
  }, [operationalDate, storeId]);

  const areaOptions = useMemo(() => {
    const options = [
      { id: 'registro', label: 'Registro do dia', icon: CalendarDays },
      { id: 'retiradas', label: 'Retiradas para despesas', icon: WalletCards },
    ];
    if (permissions.registrarSangria || permissions.visualizarSangrias) {
      options.push({ id: 'sangrias', label: 'Sangrias', icon: ShieldCheck });
    }
    if (permissions.visualizarConferencia) {
      options.push({ id: 'historico', label: 'Histórico gerencial', icon: History });
    }
    return options;
  }, [permissions]);

  useEffect(() => {
    if (!areaOptions.some((option) => option.id === activeArea)) {
      setActiveArea('registro');
    }
  }, [activeArea, areaOptions]);

  const loadRecord = useCallback(async () => {
    if (!storeId || !operationalDate) {
      setRecord(null);
      return;
    }
    setRecordLoading(true);
    setRecordFeedback({ type: '', text: '' });
    try {
      const response = await obterRegistroDiarioCaixa({ lojaId: storeId, dataOperacional: operationalDate });
      setRecord(response?.registro || null);
    } catch (error) {
      setRecord(null);
      setRecordFeedback({
        type: 'error',
        text: getErrorMessage(error, 'Não foi possível carregar o registro do dia.'),
      });
    } finally {
      setRecordLoading(false);
    }
  }, [operationalDate, storeId]);

  useEffect(() => {
    loadRecord();
  }, [loadRecord]);

  const initialCents = getDocumentCents(record, 'valorInicialCentavos', 'valorInicial');
  const closingCents = getDocumentCents(record, 'valorEncerramentoCentavos', 'valorEncerramento');
  const hasInitial = initialCents !== null;
  const hasClosing = closingCents !== null;

  const submitDailyValue = async (type) => {
    const isInitial = type === 'initial';
    const submittingRef = isInitial ? initialSubmittingRef : closingSubmittingRef;
    if (submittingRef.current) return;
    const rawValue = isInitial ? initialValue : closingValue;
    const valueCents = parseCurrencyToCents(rawValue);
    if (!storeId) {
      setRecordFeedback({ type: 'error', text: 'Selecione uma loja.' });
      return;
    }
    if (!Number.isSafeInteger(valueCents) || valueCents < 0) {
      setRecordFeedback({ type: 'error', text: 'Informe um valor válido.' });
      return;
    }

    const setSaving = isInitial ? setSavingInitial : setSavingClosing;
    submittingRef.current = true;
    setSaving(true);
    setRecordFeedback({ type: '', text: '' });
    try {
      const payload = {
        lojaId: storeId,
        dataOperacional: operationalDate,
        valorCentavos: valueCents,
        observacao: isInitial ? initialObservation.trim() : closingObservation.trim(),
        idempotencyKey: isInitial ? initialIdempotencyRef.current : closingIdempotencyRef.current,
      };
      const response = isInitial
        ? await registrarValorInicialCaixa(payload)
        : await registrarEncerramentoCaixa(payload);

      if (response?.registro) setRecord(response.registro);
      if (isInitial) {
        setInitialValue('');
        setInitialObservation('');
      } else {
        setClosingValue('');
        setClosingObservation('');
      }
      setRecordFeedback({
        type: 'success',
        text: isInitial
          ? 'Valor inicial registrado com sucesso.'
          : 'Encerramento registrado com sucesso.',
      });
      if (isInitial) {
        initialIdempotencyRef.current = createIdempotencyKey(`${storeId}:${operationalDate}:inicio`);
      } else {
        closingIdempotencyRef.current = createIdempotencyKey(`${storeId}:${operationalDate}:encerramento`);
      }
      await loadRecord();
    } catch (error) {
      setRecordFeedback({
        type: 'error',
        text: getErrorMessage(error, `Não foi possível registrar o ${isInitial ? 'valor inicial' : 'encerramento'}.`),
      });
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  const filteredWithdrawals = useMemo(() => (retiradas || []).filter((item) => (
    !item?.lojaId || !storeId || item.lojaId === storeId
  )), [retiradas, storeId]);

  const withdrawalsTotalCents = useMemo(() => filteredWithdrawals.reduce((total, item) => {
    const cents = getDocumentCents(item, 'valorCentavos', 'valor');
    return total + (cents || 0);
  }, 0), [filteredWithdrawals]);

  const loadSangrias = useCallback(async () => {
    if (!permissions.visualizarSangrias || !storeId) {
      setSangrias([]);
      return;
    }
    setSangriasLoading(true);
    setSangriaFeedback((current) => (current.type === 'success' ? current : { type: '', text: '' }));
    try {
      const response = await listarSangriasCaixa({
        lojaId: storeId,
        dataInicio: sangriaStart || undefined,
        dataFim: sangriaEnd || undefined,
        limit: 200,
      });
      setSangrias(Array.isArray(response?.sangrias) ? response.sangrias : []);
    } catch (error) {
      setSangrias([]);
      setSangriaFeedback({
        type: 'error',
        text: getErrorMessage(error, 'Não foi possível carregar as sangrias.'),
      });
    } finally {
      setSangriasLoading(false);
    }
  }, [permissions.visualizarSangrias, sangriaEnd, sangriaStart, storeId]);

  useEffect(() => {
    if (activeArea === 'sangrias') loadSangrias();
  }, [activeArea, loadSangrias]);

  const handleSangriaSubmit = async (event) => {
    event.preventDefault();
    if (sangriaSubmittingRef.current) return;
    const valueCents = parseCurrencyToCents(sangriaValue);
    if (!storeId || !operationalDate) {
      setSangriaFeedback({ type: 'error', text: 'Selecione a loja e a data operacional.' });
      return;
    }
    if (!Number.isSafeInteger(valueCents) || valueCents <= 0) {
      setSangriaFeedback({ type: 'error', text: 'Informe um valor de sangria maior que zero.' });
      return;
    }
    if (!sangriaReason.trim() && !sangriaObservation.trim()) {
      setSangriaFeedback({ type: 'error', text: 'Informe o motivo ou uma observação.' });
      return;
    }

    sangriaSubmittingRef.current = true;
    setSavingSangria(true);
    setSangriaFeedback({ type: '', text: '' });
    try {
      await registrarSangriaCaixa({
        lojaId: storeId,
        dataOperacional: operationalDate,
        valorCentavos: valueCents,
        motivo: sangriaReason.trim(),
        observacao: sangriaObservation.trim(),
        destino: sangriaDestination.trim(),
        idempotencyKey: sangriaIdempotencyRef.current,
      });
      setSangriaValue('');
      setSangriaReason('');
      setSangriaObservation('');
      setSangriaDestination('');
      setSangriaFeedback({ type: 'success', text: 'Sangria registrada com sucesso.' });
      sangriaIdempotencyRef.current = createIdempotencyKey(`${storeId}:${operationalDate}:sangria`);
      await loadSangrias();
    } catch (error) {
      setSangriaFeedback({
        type: 'error',
        text: getErrorMessage(error, 'Não foi possível registrar a sangria.'),
      });
    } finally {
      sangriaSubmittingRef.current = false;
      setSavingSangria(false);
    }
  };

  const openSangriaAdjustment = (item) => {
    const currentCents = getDocumentCents(item, 'valorCentavos', 'valor');
    setSangriaAdjustment({
      id: item.id,
      value: Number.isSafeInteger(currentCents)
        ? (currentCents / 100).toFixed(2).replace('.', ',')
        : '',
      reason: '',
      observation: '',
    });
    sangriaAdjustmentIdempotencyRef.current = createIdempotencyKey(`caixa-ajuste-sangria:${item.id}`);
    setSangriaFeedback({ type: '', text: '' });
  };

  const closeSangriaAdjustment = () => {
    if (savingSangriaAdjustment) return;
    setSangriaAdjustment({ id: '', value: '', reason: '', observation: '' });
  };

  const handleSangriaAdjustmentSubmit = async (event) => {
    event.preventDefault();
    if (sangriaAdjustmentSubmittingRef.current || !sangriaAdjustment.id) return;
    const newValueCents = parseCurrencyToCents(sangriaAdjustment.value);
    if (!Number.isSafeInteger(newValueCents) || newValueCents < 0) {
      setSangriaFeedback({ type: 'error', text: 'Informe um novo valor válido, igual ou maior que zero.' });
      return;
    }
    if (!sangriaAdjustment.reason.trim()) {
      setSangriaFeedback({ type: 'error', text: 'Informe o motivo auditável do ajuste.' });
      return;
    }

    sangriaAdjustmentSubmittingRef.current = true;
    setSavingSangriaAdjustment(true);
    setSangriaFeedback({ type: '', text: '' });
    try {
      await ajustarSangriaCaixa({
        lojaId: storeId,
        sangriaId: sangriaAdjustment.id,
        novoValorCentavos: newValueCents,
        motivoAjuste: sangriaAdjustment.reason.trim(),
        observacao: sangriaAdjustment.observation.trim(),
        idempotencyKey: sangriaAdjustmentIdempotencyRef.current,
      });
      setSangriaAdjustment({ id: '', value: '', reason: '', observation: '' });
      setSangriaFeedback({ type: 'success', text: 'Ajuste de sangria registrado com auditoria.' });
      await loadSangrias();
    } catch (error) {
      setSangriaFeedback({
        type: 'error',
        text: getErrorMessage(error, 'Não foi possível ajustar a sangria.'),
      });
    } finally {
      sangriaAdjustmentSubmittingRef.current = false;
      setSavingSangriaAdjustment(false);
    }
  };

  const loadConferences = async (event) => {
    if (event) event.preventDefault();
    if (!permissions.visualizarConferencia || !storeId || historyLoading) return;
    setHistoryLoading(true);
    setHistoryFeedback({ type: '', text: '' });
    try {
      const response = await listarConferenciasCaixa({
        lojaId: storeId,
        dataInicio: historyStart,
        dataFim: historyEnd,
        responsavelUid: historyResponsible.trim() || undefined,
        comDiferenca: permissions.visualizarDivergencias && historyDifference !== 'all'
          ? historyDifference === 'with'
          : undefined,
        limit: 200,
      });
      setConferences(Array.isArray(response?.conferencias) ? response.conferencias : []);
    } catch (error) {
      setConferences([]);
      setHistoryFeedback({
        type: 'error',
        text: getErrorMessage(error, 'Não foi possível carregar o histórico gerencial.'),
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  const renderStoreAndDateFilters = () => (
    <div className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:grid-cols-2">
      <label className="space-y-1 text-sm font-medium text-gray-700">
        <span>Loja</span>
        <select value={storeId} onChange={(event) => setStoreId(event.target.value)} className={inputClassName}>
          {!storeOptions.length && <option value="">Nenhuma loja disponível</option>}
          {storeOptions.map((id) => (
            <option key={id} value={id}>{storeInfoMap[id]?.nome || id}</option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm font-medium text-gray-700">
        <span>Data operacional</span>
        <input type="date" value={operationalDate} onChange={(event) => setOperationalDate(event.target.value)} className={inputClassName} />
      </label>
    </div>
  );

  const renderRecordArea = () => (
    <SectionCard
      title="Registro do dia"
      description="Informe os valores contados no início e no encerramento. As vendas não alteram esta tela."
      icon={CalendarDays}
    >
      {recordLoading ? (
        <p className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">Carregando registro...</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ValueSummary
              label="Valor inicial do dia"
              cents={initialCents}
              registrant={getRegistrant(record, 'valorInicial')}
              timestamp={firstValue(record, ['valorInicialRegistradoEm', 'inicioRegistradoEm', 'registradoInicioEm'])}
              observation={firstValue(record, ['observacaoInicial', 'valorInicialObservacao'])}
            />
            <ValueSummary
              label="Valor de encerramento"
              cents={closingCents}
              registrant={getRegistrant(record, 'valorEncerramento')}
              timestamp={firstValue(record, ['valorEncerramentoRegistradoEm', 'encerramentoRegistradoEm', 'registradoEncerramentoEm'])}
              observation={firstValue(record, ['observacaoEncerramento', 'valorEncerramentoObservacao'])}
            />
          </div>

          <Feedback feedback={recordFeedback} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {permissions.registrarInicio && (
              <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                <div>
                  <h3 className="font-semibold text-gray-800">Informar valor inicial do dia</h3>
                  <p className="mt-1 text-xs text-gray-500">A conferência com o encerramento anterior é feita com segurança pelo sistema.</p>
                </div>
                <label className="block space-y-1 text-sm font-medium text-gray-700">
                  <span>Valor contado (R$)</span>
                  <input inputMode="decimal" value={initialValue} onChange={(event) => setInitialValue(event.target.value)} disabled={hasInitial || savingInitial} className={inputClassName} placeholder="0,00" />
                </label>
                <label className="block space-y-1 text-sm font-medium text-gray-700">
                  <span>Observação opcional</span>
                  <textarea rows="2" value={initialObservation} onChange={(event) => setInitialObservation(event.target.value)} disabled={hasInitial || savingInitial} className={inputClassName} />
                </label>
                <button type="button" onClick={() => submitDailyValue('initial')} disabled={hasInitial || savingInitial} className={primaryButtonClassName}>
                  <Save className="h-4 w-4" /> {savingInitial ? 'Registrando...' : 'Registrar valor inicial'}
                </button>
              </div>
            )}

            {permissions.registrarEncerramento && (
              <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                <div>
                  <h3 className="font-semibold text-gray-800">Informar valor de encerramento</h3>
                  <p className="mt-1 text-xs text-gray-500">Informe somente o valor contado. Os cálculos não são exibidos nesta área operacional.</p>
                </div>
                <label className="block space-y-1 text-sm font-medium text-gray-700">
                  <span>Valor contado (R$)</span>
                  <input inputMode="decimal" value={closingValue} onChange={(event) => setClosingValue(event.target.value)} disabled={hasClosing || savingClosing} className={inputClassName} placeholder="0,00" />
                </label>
                <label className="block space-y-1 text-sm font-medium text-gray-700">
                  <span>Observação opcional</span>
                  <textarea rows="2" value={closingObservation} onChange={(event) => setClosingObservation(event.target.value)} disabled={hasClosing || savingClosing} className={inputClassName} />
                </label>
                <button type="button" onClick={() => submitDailyValue('closing')} disabled={hasClosing || savingClosing} className={primaryButtonClassName}>
                  <Save className="h-4 w-4" /> {savingClosing ? 'Registrando...' : 'Registrar encerramento do dia'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );

  const renderWithdrawalsArea = () => (
    <SectionCard
      title="Retiradas para despesas"
      description="Dinheiro retirado para pagar uma despesa. O lançamento continua contabilizado como despesa paga."
      icon={WalletCards}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
            <p className="text-sm text-rose-700">Total retirado no período carregado</p>
            <p className="mt-1 text-2xl font-bold text-rose-900">{formatCentsBRL(withdrawalsTotalCents)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm text-gray-500">Registros</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{filteredWithdrawals.length}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">Cada retirada fica vinculada à loja, data e responsável.</p>
          {permissions.registrarRetiradaDespesa && (
            <button type="button" onClick={() => onNewRetirada(storeId, operationalDate)} disabled={!storeId} className={primaryButtonClassName}>
              <Plus className="h-4 w-4" /> Nova retirada para despesa
            </button>
          )}
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-gray-200 md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3">Observação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredWithdrawals.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">{formatDate(getRetiradaDate(item))}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.motivo || item.descricao || '-'}</td>
                  <td className="px-4 py-3 font-semibold text-rose-600">{formatCentsBRL(getDocumentCents(item, 'valorCentavos', 'valor') || 0)}</td>
                  <td className="px-4 py-3">{getRetiradaRegistrant(item)}</td>
                  <td className="px-4 py-3">{item.observacoes || item.observacao || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {filteredWithdrawals.map((item) => (
            <div key={item.id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{item.motivo || item.descricao || '-'}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatDate(getRetiradaDate(item))} • {getRetiradaRegistrant(item)}</p>
                </div>
                <p className="font-bold text-rose-600">{formatCentsBRL(getDocumentCents(item, 'valorCentavos', 'valor') || 0)}</p>
              </div>
              {(item.observacoes || item.observacao) && <p className="mt-3 text-sm text-gray-600">{item.observacoes || item.observacao}</p>}
            </div>
          ))}
        </div>

        {!filteredWithdrawals.length && (
          <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500">
            Nenhuma retirada para despesa registrada.
          </p>
        )}
      </div>
    </SectionCard>
  );

  const renderSangriasArea = () => (
    <SectionCard
      title="Sangrias"
      description="Retiradas por segurança para depósito ou transferência à conta da loja. Não são despesas."
      icon={ShieldCheck}
    >
      <div className="space-y-6">
        <Feedback feedback={sangriaFeedback} />

        {permissions.registrarSangria && (
          <form onSubmit={handleSangriaSubmit} className="space-y-4 rounded-xl border border-gray-200 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-gray-700">
                <span>Valor (R$)</span>
                <input inputMode="decimal" value={sangriaValue} onChange={(event) => setSangriaValue(event.target.value)} className={inputClassName} placeholder="0,00" required />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                <span>Destino ou identificação do depósito (opcional)</span>
                <input value={sangriaDestination} onChange={(event) => setSangriaDestination(event.target.value)} className={inputClassName} />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                <span>Motivo</span>
                <input value={sangriaReason} onChange={(event) => setSangriaReason(event.target.value)} className={inputClassName} />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                <span>Observação</span>
                <input value={sangriaObservation} onChange={(event) => setSangriaObservation(event.target.value)} className={inputClassName} />
              </label>
            </div>
            {!hasInitial && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Informe primeiro o valor inicial deste dia.</p>}
            {hasClosing && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Não é possível registrar sangria depois do encerramento deste dia.</p>}
            <button type="submit" disabled={savingSangria || !hasInitial || hasClosing} className={primaryButtonClassName}>
              <Save className="h-4 w-4" /> {savingSangria ? 'Registrando...' : 'Registrar sangria'}
            </button>
          </form>
        )}

        {permissions.visualizarSangrias && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-sm font-medium text-gray-700">
                <span>Data inicial</span>
                <input type="date" value={sangriaStart} onChange={(event) => setSangriaStart(event.target.value)} className={inputClassName} />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                <span>Data final</span>
                <input type="date" value={sangriaEnd} onChange={(event) => setSangriaEnd(event.target.value)} className={inputClassName} />
              </label>
              <div className="flex items-end">
                <button type="button" onClick={loadSangrias} disabled={sangriasLoading} className={secondaryButtonClassName}>
                  <Search className="h-4 w-4" /> {sangriasLoading ? 'Buscando...' : 'Buscar sangrias'}
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {sangrias.map((item) => (
                <div key={item.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row">
                    <div>
                      <p className="font-semibold text-gray-900">{item.motivo || item.observacao || 'Sangria'}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatDateTime(firstValue(item, ['criadoEm', 'createdAt', 'registradoEm']))} • {firstValue(item, ['responsavelNome', 'registradoPorNome', 'responsavelEmail', 'responsavelUid'], '-')}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{formatCentsBRL(getDocumentCents(item, 'valorCentavos', 'valor') || 0)}</p>
                  </div>
                  {item.destino && <p className="mt-2 text-sm text-gray-600">Destino: {item.destino}</p>}
                  {item.observacao && item.observacao !== item.motivo && <p className="mt-1 text-sm text-gray-600">{item.observacao}</p>}
                  {Array.isArray(item.ajustes) && item.ajustes.length > 0 && (
                    <details className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                      <summary className="cursor-pointer font-semibold text-gray-700">
                        Histórico de ajustes ({item.ajustes.length})
                      </summary>
                      <div className="mt-2 space-y-2">
                        {item.ajustes.map((adjustment) => (
                          <div key={adjustment.id || `${adjustment.registradoEm}-${adjustment.valorNovoCentavos}`} className="border-t border-gray-200 pt-2 first:border-0 first:pt-0">
                            <p>
                              {formatCentsBRL(adjustment.valorAnteriorCentavos)} → {formatCentsBRL(adjustment.valorNovoCentavos)}
                            </p>
                            <p>{adjustment.motivo || 'Motivo não informado'} • {adjustment.responsavelNome || adjustment.responsavelEmail || adjustment.responsavelUid || '-'}</p>
                            <p>{formatDateTime(adjustment.registradoEm)}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {permissions.registrarSangria && sangriaAdjustment.id !== item.id && (
                    <button type="button" onClick={() => openSangriaAdjustment(item)} className={`${secondaryButtonClassName} mt-3`}>
                      Ajustar sangria
                    </button>
                  )}
                  {permissions.registrarSangria && sangriaAdjustment.id === item.id && (
                    <form onSubmit={handleSangriaAdjustmentSubmit} className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs font-semibold text-amber-900">Correção append-only: o lançamento original e este motivo permanecerão na auditoria.</p>
                      <label className="block space-y-1 text-sm font-medium text-gray-700">
                        <span>Novo valor (R$)</span>
                        <input inputMode="decimal" value={sangriaAdjustment.value} onChange={(event) => setSangriaAdjustment((current) => ({ ...current, value: event.target.value }))} className={inputClassName} required />
                      </label>
                      <label className="block space-y-1 text-sm font-medium text-gray-700">
                        <span>Motivo do ajuste</span>
                        <input value={sangriaAdjustment.reason} onChange={(event) => setSangriaAdjustment((current) => ({ ...current, reason: event.target.value }))} className={inputClassName} required />
                      </label>
                      <label className="block space-y-1 text-sm font-medium text-gray-700">
                        <span>Observação opcional</span>
                        <input value={sangriaAdjustment.observation} onChange={(event) => setSangriaAdjustment((current) => ({ ...current, observation: event.target.value }))} className={inputClassName} />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" disabled={savingSangriaAdjustment} className={primaryButtonClassName}>
                          {savingSangriaAdjustment ? 'Registrando ajuste...' : 'Registrar ajuste auditado'}
                        </button>
                        <button type="button" disabled={savingSangriaAdjustment} onClick={closeSangriaAdjustment} className={secondaryButtonClassName}>
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ))}
              {!sangriasLoading && !sangrias.length && <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-gray-500">Nenhuma sangria encontrada.</p>}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );

  const renderHistoryArea = () => (
    <SectionCard
      title="Histórico gerencial e conferência"
      description="Consulte a memória de cálculo protegida por loja e período."
      icon={History}
    >
      <div className="space-y-5">
        <form onSubmit={loadConferences} className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 p-4 md:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1 text-sm font-medium text-gray-700">
            <span>Data inicial</span>
            <input type="date" value={historyStart} onChange={(event) => setHistoryStart(event.target.value)} className={inputClassName} required />
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700">
            <span>Data final</span>
            <input type="date" value={historyEnd} onChange={(event) => setHistoryEnd(event.target.value)} className={inputClassName} required />
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700">
            <span>Responsável</span>
            <input value={historyResponsible} onChange={(event) => setHistoryResponsible(event.target.value)} className={inputClassName} placeholder="Opcional" />
          </label>
          {permissions.visualizarDivergencias && (
            <label className="space-y-1 text-sm font-medium text-gray-700">
              <span>Diferença</span>
              <select value={historyDifference} onChange={(event) => setHistoryDifference(event.target.value)} className={inputClassName}>
                <option value="all">Todos</option>
                <option value="with">Com diferença</option>
                <option value="without">Sem diferença</option>
              </select>
            </label>
          )}
          <div className="flex items-end">
            <button type="submit" disabled={historyLoading} className={primaryButtonClassName}>
              <Search className="h-4 w-4" /> {historyLoading ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
        </form>

        <Feedback feedback={historyFeedback} />

        <div className="space-y-4">
          {conferences.map((item) => {
            const value = (centsKeys, legacyKeys) => {
              const centsKeyList = Array.isArray(centsKeys) ? centsKeys : [centsKeys];
              const legacyKeyList = Array.isArray(legacyKeys) ? legacyKeys : [legacyKeys];
              for (const centsKey of centsKeyList) {
                const cents = Number(item?.[centsKey]);
                if (Number.isFinite(cents)) return Math.round(cents);
              }
              for (const legacyKey of legacyKeyList) {
                const legacyValue = Number(item?.[legacyKey]);
                if (Number.isFinite(legacyValue)) return Math.round(legacyValue * 100);
              }
              return 0;
            };
            const difference = value('diferencaCentavos', 'diferenca');
            return (
              <article key={item.id || `${item.lojaId}-${item.dataOperacional}`} className="rounded-2xl border border-gray-200 p-4 md:p-5">
                <div className="flex flex-col justify-between gap-2 border-b border-gray-100 pb-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="font-bold text-gray-900">{formatDate(item.dataOperacional || item.data)}</h3>
                    <p className="text-xs text-gray-500">{storeInfoMap[item.lojaId || storeId]?.nome || item.lojaId || storeId}</p>
                  </div>
                  {permissions.visualizarDivergencias && (
                    <p className={`rounded-full px-3 py-1 text-sm font-bold ${difference === 0 ? 'bg-green-100 text-green-800' : 'bg-rose-100 text-rose-800'}`}>
                      Diferença: {formatCentsBRL(difference)}
                    </p>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div><p className="text-xs text-gray-500">Valor inicial</p><p className="font-semibold">{formatCentsBRL(value('valorInicialCentavos', 'valorInicial'))}</p></div>
                  {permissions.visualizarValoresCalculados && <div><p className="text-xs text-gray-500">Vendas em dinheiro</p><p className="font-semibold">{formatCentsBRL(value('vendasDinheiroCentavos', 'vendasDinheiro'))}</p></div>}
                  {permissions.visualizarValoresCalculados && <div><p className="text-xs text-gray-500">Outras entradas</p><p className="font-semibold">{formatCentsBRL(value(['outrasEntradasDinheiroCentavos', 'outrasEntradasCentavos'], ['outrasEntradasDinheiro', 'outrasEntradas']))}</p></div>}
                  {permissions.visualizarValoresCalculados && <div><p className="text-xs text-gray-500">Retiradas para despesas</p><p className="font-semibold">{formatCentsBRL(value(['retiradasDespesaCentavos', 'retiradasDespesasCentavos'], ['retiradasDespesa', 'retiradasDespesas']))}</p></div>}
                  {permissions.visualizarSangrias && <div><p className="text-xs text-gray-500">Sangrias</p><p className="font-semibold">{formatCentsBRL(value('sangriasCentavos', 'sangrias'))}</p></div>}
                  {permissions.visualizarValoresCalculados && <div><p className="text-xs text-gray-500">Estornos em dinheiro</p><p className="font-semibold">{formatCentsBRL(value('estornosDinheiroCentavos', 'estornosDinheiro'))}</p></div>}
                  {permissions.visualizarValoresCalculados && <div><p className="text-xs text-gray-500">Valor esperado</p><p className="font-semibold">{formatCentsBRL(value('valorEsperadoCentavos', 'valorEsperado'))}</p></div>}
                  <div><p className="text-xs text-gray-500">Valor informado</p><p className="font-semibold">{formatCentsBRL(value('valorEncerramentoCentavos', 'valorEncerramento'))}</p></div>
                </div>
                <div className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
                  <p><strong>Responsável pelo início:</strong> {getRegistrant(item, 'valorInicial')}</p>
                  <p><strong>Responsável pelo encerramento:</strong> {getRegistrant(item, 'valorEncerramento')}</p>
                  {permissions.visualizarValoresCalculados && (
                    <p className="mt-2">
                      <strong>Memória de cálculo:</strong> valor inicial + vendas em dinheiro + outras entradas − retiradas para despesas − sangrias − estornos em dinheiro.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
          {!historyLoading && !conferences.length && (
            <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500">
              Use os filtros para consultar as conferências do caixa.
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );

  return (
    <div className="space-y-5">
      {renderStoreAndDateFilters()}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm">
        {areaOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setActiveArea(option.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              activeArea === option.id ? 'bg-pink-600 text-white' : 'text-gray-700 hover:bg-pink-50'
            }`}
          >
            <option.icon className="h-4 w-4" /> {option.label}
          </button>
        ))}
      </div>

      {activeArea === 'registro' && renderRecordArea()}
      {activeArea === 'retiradas' && renderWithdrawalsArea()}
      {activeArea === 'sangrias' && permissions.visualizarSangrias && renderSangriasArea()}
      {activeArea === 'sangrias' && permissions.registrarSangria && !permissions.visualizarSangrias && renderSangriasArea()}
      {activeArea === 'historico' && permissions.visualizarConferencia && renderHistoryArea()}
    </div>
  );
};

export default CaixaTab;
