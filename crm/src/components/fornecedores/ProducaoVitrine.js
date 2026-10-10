import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  cancelarProducaoVitrine,
  criarProducaoVitrine,
  enviarProducaoVitrine,
  getProducaoVitrineErrorMessage,
  listarProducoesVitrine,
  listarProdutosProducaoVitrine,
  receberProducaoVitrine,
} from '../../services/producaoVitrineService';

const STATUS = Object.freeze({
  DRAFT: 'rascunho',
  WAITING: 'aguardando_recebimento',
  RECEIVED: 'recebido',
  DIVERGENCE: 'recebido_com_divergencia',
  CANCELLED: 'cancelado',
});

const STATUS_LABEL = {
  [STATUS.DRAFT]: 'Rascunho',
  [STATUS.WAITING]: 'Aguardando recebimento',
  [STATUS.RECEIVED]: 'Recebido',
  [STATUS.DIVERGENCE]: 'Recebido com divergência',
  [STATUS.CANCELLED]: 'Cancelado',
};

const STATUS_STYLE = {
  [STATUS.DRAFT]: 'bg-gray-100 text-gray-700',
  [STATUS.WAITING]: 'bg-amber-100 text-amber-800',
  [STATUS.RECEIVED]: 'bg-emerald-100 text-emerald-800',
  [STATUS.DIVERGENCE]: 'bg-rose-100 text-rose-800',
  [STATUS.CANCELLED]: 'bg-slate-200 text-slate-700',
};

const REASONS = [
  { value: 'quantidade_menor', label: 'Quantidade menor que a informada' },
  { value: 'quantidade_maior', label: 'Quantidade maior que a informada' },
  { value: 'produto_nao_recebido', label: 'Produto não recebido' },
  { value: 'produto_diferente', label: 'Produto diferente' },
  { value: 'produto_danificado', label: 'Produto danificado' },
  { value: 'outro', label: 'Outro' },
];

const pad = (value) => String(value).padStart(2, '0');
const toLocalDate = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const addDays = (dateText, days) => {
  const [year, month, day] = String(dateText).split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() + days);
  return toLocalDate(date);
};
const formatDate = (value) => {
  if (!value) return '-';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR');
};
const formatDateTime = (value) => {
  const date = value ? new Date(value) : null;
  return !date || Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('pt-BR');
};
const formatQuantity = (value) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const normalize = (value) => String(value || '').trim().toLowerCase();
const ownerRoles = new Set(['dono', 'owner', 'admin', 'adm', 'administrador', 'administradora', 'master', 'superadmin']);

const getUserCapabilities = (user = {}) => {
  const role = normalize(user.role);
  const area = [user.setor, user.departamento, user.funcao, user.cargo, user.perfilNome].map(normalize).join(' ');
  const owner = ownerRoles.has(role);
  const manager = ['gerente', 'gestor', 'gestora'].includes(role);
  const attendant = ['atendente', 'funcionario', 'funcionaria'].includes(role);
  const explicitlyKitchen = /cozinha|producao|produção/.test(area);
  const explicitlyFront = /atend|loja|vitrine|balcao|balcão/.test(area);
  const moduleAllowed = user?.customPermissions?.fornecedores !== false && user?.permissions?.fornecedores !== false;
  return {
    canCreate: moduleAllowed && (owner || manager || attendant) && !explicitlyFront,
    canReceive: moduleAllowed && (owner || manager || attendant) && !explicitlyKitchen,
    canCancel: moduleAllowed && (owner || manager),
    canChangeDate: owner || manager,
  };
};

const Modal = ({ open, onClose, title, children, wide = false }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

const Field = ({ label, children }) => (
  <label className="block space-y-1.5">
    <span className="text-sm font-semibold text-gray-700">{label}</span>
    {children}
  </label>
);

const inputClass = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-100 disabled:bg-gray-100';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';

const createEmptyItem = () => ({ key: `item-${Date.now()}-${Math.random()}`, productId: '', quantidade: '' });

const ProducaoVitrine = ({ currentUser, availableStores = [], storeInfoMap = {} }) => {
  const today = useMemo(() => toLocalDate(), []);
  const capabilities = useMemo(() => getUserCapabilities(currentUser), [currentUser]);
  const [records, setRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeView, setActiveView] = useState('producoes');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    dataInicial: addDays(today, -13),
    dataFinal: today,
    lojaId: '',
    produtoId: '',
    status: '',
    responsavel: '',
  });
  const [newOpen, setNewOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [draft, setDraft] = useState({ lojaDestinoId: '', dataProducao: today, observacao: '', itens: [createEmptyItem()] });
  const [draftStatus, setDraftStatus] = useState(STATUS.WAITING);
  const [viewing, setViewing] = useState(null);
  const [receiving, setReceiving] = useState(null);
  const [receiptMode, setReceiptMode] = useState('integral');
  const [receiptItems, setReceiptItems] = useState([]);
  const [receiptReason, setReceiptReason] = useState('');
  const [receiptOther, setReceiptOther] = useState('');
  const [receiptNote, setReceiptNote] = useState('');

  const storeOptions = useMemo(() => availableStores.map((store) => {
    const id = typeof store === 'string' ? store : store.id;
    return { id, nome: storeInfoMap[id]?.nome || (typeof store === 'object' ? store.nome : '') || id };
  }).filter((store) => store.id), [availableStores, storeInfoMap]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listarProducoesVitrine({ dataInicial: filters.dataInicial, dataFinal: filters.dataFinal });
      setRecords(result?.producoes || []);
    } catch (loadError) {
      setError(getProducaoVitrineErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [filters.dataFinal, filters.dataInicial]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  useEffect(() => {
    if (!draft.lojaDestinoId || !newOpen) {
      setProducts([]);
      return undefined;
    }
    let active = true;
    listarProdutosProducaoVitrine(draft.lojaDestinoId)
      .then((result) => { if (active) setProducts(result?.produtos || []); })
      .catch((productError) => { if (active) setError(getProducaoVitrineErrorMessage(productError)); });
    return () => { active = false; };
  }, [draft.lojaDestinoId, newOpen]);

  const resetNewProduction = () => {
    setDraft({ lojaDestinoId: storeOptions.length === 1 ? storeOptions[0].id : '', dataProducao: today, observacao: '', itens: [createEmptyItem()] });
    setDraftStatus(STATUS.WAITING);
    setProducts([]);
    setReviewOpen(false);
  };

  const openNewProduction = () => {
    resetNewProduction();
    setError('');
    setNewOpen(true);
  };

  const selectedProducts = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const productionSummary = useMemo(() => draft.itens.map((item) => ({
    ...item,
    produto: selectedProducts.get(item.productId),
    quantidadeNumero: Number(item.quantidade),
  })), [draft.itens, selectedProducts]);

  const validateDraft = () => {
    if (!draft.lojaDestinoId) return 'Selecione a loja/vitrine de destino.';
    if (!draft.dataProducao) return 'Informe a data da produção.';
    if (!draft.itens.length) return 'Adicione pelo menos um produto.';
    const ids = new Set();
    for (const item of productionSummary) {
      if (!item.produto) return 'Selecione todos os produtos.';
      if (!Number.isFinite(item.quantidadeNumero) || item.quantidadeNumero <= 0) return 'Informe quantidades maiores que zero.';
      if (ids.has(item.productId)) return 'Não repita o mesmo produto.';
      ids.add(item.productId);
    }
    return '';
  };

  const requestCreateReview = (status) => {
    const message = validateDraft();
    if (message) { setError(message); return; }
    setError('');
    setDraftStatus(status);
    setReviewOpen(true);
  };

  const saveProduction = async () => {
    setBusy(true);
    setError('');
    try {
      await criarProducaoVitrine({
        lojaDestinoId: draft.lojaDestinoId,
        dataProducao: draft.dataProducao,
        observacao: draft.observacao,
        status: draftStatus,
        itens: draft.itens.map((item) => ({ productId: item.productId, quantidade: Number(item.quantidade) })),
      });
      setReviewOpen(false);
      setNewOpen(false);
      resetNewProduction();
      await loadRecords();
    } catch (saveError) {
      setError(getProducaoVitrineErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const sendDraft = async (record) => {
    if (!window.confirm(`Enviar a produção ${record.numero || ''} para ${record.lojaDestinoNome || record.lojaDestinoId}?`)) return;
    setBusy(true);
    setError('');
    try {
      await enviarProducaoVitrine(record.id);
      await loadRecords();
    } catch (sendError) {
      setError(getProducaoVitrineErrorMessage(sendError));
    } finally {
      setBusy(false);
    }
  };

  const openReceipt = (record, mode) => {
    setReceiving(record);
    setReceiptMode(mode);
    setReceiptItems((record.itens || []).map((item) => ({
      productId: item.productId,
      produtoNome: item.produtoNome,
      quantidadeEnviada: Number(item.quantidadeEnviada || 0),
      quantidadeRecebida: mode === 'integral' ? Number(item.quantidadeEnviada || 0) : '',
    })));
    setReceiptReason('');
    setReceiptOther('');
    setReceiptNote('');
    setError('');
  };

  const calculatedReceiptItems = useMemo(() => receiptItems.map((item) => ({
    ...item,
    receivedNumber: item.quantidadeRecebida === '' ? null : Number(item.quantidadeRecebida),
    divergence: item.quantidadeRecebida === '' ? null : Number(item.quantidadeRecebida) - Number(item.quantidadeEnviada),
  })), [receiptItems]);
  const hasReceiptDivergence = calculatedReceiptItems.some((item) => item.divergence !== null && item.divergence !== 0);

  const confirmReceipt = async () => {
    if (calculatedReceiptItems.some((item) => item.receivedNumber === null || !Number.isFinite(item.receivedNumber) || item.receivedNumber < 0)) {
      setError('Informe todas as quantidades recebidas com valores maiores ou iguais a zero.');
      return;
    }
    if (receiptMode === 'divergencia' && !hasReceiptDivergence) {
      setError('Para esta ação, informe ao menos uma quantidade divergente.');
      return;
    }
    if (hasReceiptDivergence && !receiptReason) {
      setError('Informe o motivo da divergência.');
      return;
    }
    if (receiptReason === 'outro' && !receiptOther.trim()) {
      setError('Descreva o outro motivo da divergência.');
      return;
    }
    const prompt = hasReceiptDivergence ? 'Confirmar recebimento com divergência?' : 'Confirma o recebimento integral desta produção?';
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError('');
    try {
      await receberProducaoVitrine({
        producaoId: receiving.id,
        itens: calculatedReceiptItems.map((item) => ({ productId: item.productId, quantidadeRecebida: item.receivedNumber })),
        motivoDivergencia: hasReceiptDivergence ? receiptReason : '',
        descricaoOutroMotivo: receiptReason === 'outro' ? receiptOther : '',
        observacao: receiptNote,
      });
      setReceiving(null);
      await loadRecords();
    } catch (receiptError) {
      setError(getProducaoVitrineErrorMessage(receiptError));
    } finally {
      setBusy(false);
    }
  };

  const cancelRecord = async (record) => {
    const reason = window.prompt('Informe o motivo do cancelamento:');
    if (!reason?.trim()) return;
    setBusy(true);
    setError('');
    try {
      await cancelarProducaoVitrine(record.id, reason.trim());
      await loadRecords();
    } catch (cancelError) {
      setError(getProducaoVitrineErrorMessage(cancelError));
    } finally {
      setBusy(false);
    }
  };

  const filteredBase = useMemo(() => records.filter((record) => {
    if (filters.lojaId && record.lojaDestinoId !== filters.lojaId) return false;
    if (filters.produtoId && !(record.itens || []).some((item) => item.productId === filters.produtoId)) return false;
    if (filters.status && record.status !== filters.status) return false;
    if (filters.responsavel && !normalize(record.criadoPorNome).includes(normalize(filters.responsavel))) return false;
    return true;
  }), [filters.lojaId, filters.produtoId, filters.responsavel, filters.status, records]);

  const visibleRecords = useMemo(() => filteredBase.filter((record) => {
    if (activeView === 'aguardando') return record.status === STATUS.WAITING;
    if (activeView === 'recebidas') return record.status === STATUS.RECEIVED;
    if (activeView === 'divergencias') return record.status === STATUS.DIVERGENCE;
    if (activeView === 'historico') return [STATUS.RECEIVED, STATUS.DIVERGENCE, STATUS.CANCELLED].includes(record.status);
    return true;
  }), [activeView, filteredBase]);

  const allProductOptions = useMemo(() => {
    const map = new Map();
    records.forEach((record) => (record.itens || []).forEach((item) => map.set(item.productId, item.produtoNome || item.productId)));
    return Array.from(map, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [records]);

  const indicators = useMemo(() => filteredBase.reduce((summary, record) => {
    summary.productions += 1;
    if (record.status === STATUS.WAITING) summary.waiting += 1;
    summary.sent += Number(record.quantidadeTotalItens || 0);
    summary.received += Number(record.quantidadeTotalRecebida || 0);
    if (record.status === STATUS.DIVERGENCE) summary.divergences += 1;
    return summary;
  }, { productions: 0, waiting: 0, sent: 0, received: 0, divergences: 0 }), [filteredBase]);

  const tabOptions = [
    { id: 'producoes', label: 'Produções' },
    { id: 'aguardando', label: 'Aguardando recebimento' },
    { id: 'recebidas', label: 'Recebidas' },
    { id: 'divergencias', label: 'Com divergência' },
    { id: 'historico', label: 'Histórico' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Produção / Vitrine</h2>
          <p className="text-sm text-gray-600">Da cozinha para a loja, com conferência e estoque somente após o recebimento.</p>
        </div>
        {capabilities.canCreate && <button type="button" onClick={openNewProduction} className={primaryButton}><Plus className="h-4 w-4" /> Nova Produção</button>}
      </div>

      {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Produções do período', indicators.productions],
          ['Aguardando', indicators.waiting],
          ['Quantidade enviada', formatQuantity(indicators.sent)],
          ['Quantidade recebida', formatQuantity(indicators.received)],
          ['Divergências', indicators.divergences],
        ].map(([label, value]) => <div key={label} className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold text-gray-900">{value}</p></div>)}
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border bg-white p-4 md:grid-cols-3 xl:grid-cols-6">
        <Field label="Data inicial"><input type="date" value={filters.dataInicial} onChange={(event) => setFilters((current) => ({ ...current, dataInicial: event.target.value }))} className={inputClass} /></Field>
        <Field label="Data final"><input type="date" value={filters.dataFinal} onChange={(event) => setFilters((current) => ({ ...current, dataFinal: event.target.value }))} className={inputClass} /></Field>
        <Field label="Loja"><select value={filters.lojaId} onChange={(event) => setFilters((current) => ({ ...current, lojaId: event.target.value }))} className={inputClass}><option value="">Todas</option>{storeOptions.map((store) => <option key={store.id} value={store.id}>{store.nome}</option>)}</select></Field>
        <Field label="Produto"><select value={filters.produtoId} onChange={(event) => setFilters((current) => ({ ...current, produtoId: event.target.value }))} className={inputClass}><option value="">Todos</option>{allProductOptions.map((product) => <option key={product.id} value={product.id}>{product.nome}</option>)}</select></Field>
        <Field label="Status"><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className={inputClass}><option value="">Todos</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Responsável"><input value={filters.responsavel} onChange={(event) => setFilters((current) => ({ ...current, responsavel: event.target.value }))} placeholder="Nome" className={inputClass} /></Field>
        <div className="md:col-span-3 xl:col-span-6 flex justify-end"><button type="button" onClick={loadRecords} disabled={loading} className={secondaryButton}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button></div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border bg-white p-2">
        {tabOptions.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveView(tab.id)} className={`rounded-xl px-3 py-2 text-sm font-semibold ${activeView === tab.id ? 'bg-pink-600 text-white' : 'text-gray-600 hover:bg-pink-50'}`}>{tab.label}</button>)}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        {loading ? <div className="flex items-center justify-center gap-2 p-12 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> Carregando produções...</div> : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Número</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Loja</th><th className="px-4 py-3">Cozinha</th><th className="px-4 py-3">Itens</th><th className="px-4 py-3">Envio</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-pink-700">{record.numero || record.id.slice(0, 8)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(record.dataProducao)}</td>
                    <td className="px-4 py-3">{record.lojaDestinoNome || storeInfoMap[record.lojaDestinoId]?.nome || record.lojaDestinoId}</td>
                    <td className="px-4 py-3">{record.criadoPorNome || '-'}</td>
                    <td className="px-4 py-3">{formatQuantity(record.quantidadeTotalItens)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDateTime(record.enviadoEm)}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[record.status] || 'bg-gray-100'}`}>{STATUS_LABEL[record.status] || record.status}</span></td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1">
                      <button type="button" onClick={() => setViewing(record)} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100" title="Detalhes"><Eye className="h-4 w-4" /></button>
                      {record.status === STATUS.DRAFT && capabilities.canCreate && <button type="button" disabled={busy} onClick={() => sendDraft(record)} className="rounded-lg p-2 text-pink-700 hover:bg-pink-50" title="Enviar para Vitrine"><Send className="h-4 w-4" /></button>}
                      {record.status === STATUS.WAITING && capabilities.canReceive && <><button type="button" disabled={busy} onClick={() => openReceipt(record, 'integral')} className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50" title="Conferir sem divergência"><CheckCircle className="h-4 w-4" /></button><button type="button" disabled={busy} onClick={() => openReceipt(record, 'divergencia')} className="rounded-lg p-2 text-amber-700 hover:bg-amber-50" title="Conferir com divergência"><AlertTriangle className="h-4 w-4" /></button></>}
                      {[STATUS.DRAFT, STATUS.WAITING].includes(record.status) && capabilities.canCancel && <button type="button" disabled={busy} onClick={() => cancelRecord(record)} className="rounded-lg p-2 text-red-700 hover:bg-red-50" title="Cancelar"><Trash2 className="h-4 w-4" /></button>}
                    </div></td>
                  </tr>
                ))}
                {!visibleRecords.length && <tr><td colSpan="8" className="p-10 text-center text-gray-500">Nenhuma produção encontrada para esta visão.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={newOpen} onClose={() => !busy && setNewOpen(false)} title="Nova Produção" wide>
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Loja/Vitrine de destino"><select value={draft.lojaDestinoId} onChange={(event) => setDraft((current) => ({ ...current, lojaDestinoId: event.target.value, itens: [createEmptyItem()] }))} className={inputClass}><option value="">Selecione</option>{storeOptions.map((store) => <option key={store.id} value={store.id}>{store.nome}</option>)}</select></Field>
            <Field label="Data da produção"><input type="date" value={draft.dataProducao} disabled={!capabilities.canChangeDate} onChange={(event) => setDraft((current) => ({ ...current, dataProducao: event.target.value }))} className={inputClass} /></Field>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between"><h3 className="font-bold text-gray-900">Produtos produzidos</h3><button type="button" onClick={() => setDraft((current) => ({ ...current, itens: [...current.itens, createEmptyItem()] }))} className={secondaryButton}><Plus className="h-4 w-4" /> Adicionar produto</button></div>
            <div className="space-y-2">{draft.itens.map((item, index) => <div key={item.key} className="grid grid-cols-1 gap-2 rounded-xl border bg-gray-50 p-3 md:grid-cols-[1fr_12rem_2.5rem]">
              <select value={item.productId} onChange={(event) => setDraft((current) => ({ ...current, itens: current.itens.map((row) => row.key === item.key ? { ...row, productId: event.target.value } : row) }))} className={inputClass}><option value="">Selecione o produto</option>{products.map((product) => <option key={product.id} value={product.id} disabled={draft.itens.some((row) => row.key !== item.key && row.productId === product.id)}>{product.nome}{product.unidade ? ` (${product.unidade})` : ''}</option>)}</select>
              <input type="number" min="0.001" step="0.001" value={item.quantidade} onChange={(event) => setDraft((current) => ({ ...current, itens: current.itens.map((row) => row.key === item.key ? { ...row, quantidade: event.target.value } : row) }))} placeholder="Quantidade" aria-label={`Quantidade do item ${index + 1}`} className={inputClass} />
              <button type="button" disabled={draft.itens.length === 1} onClick={() => setDraft((current) => ({ ...current, itens: current.itens.filter((row) => row.key !== item.key) }))} className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
            </div>)}</div>
          </div>
          <Field label="Observações da produção (opcional)"><textarea rows="3" value={draft.observacao} onChange={(event) => setDraft((current) => ({ ...current, observacao: event.target.value }))} placeholder="Ex.: Produção da manhã" className={inputClass} /></Field>
          <div className="flex flex-col justify-end gap-2 border-t pt-4 sm:flex-row"><button type="button" onClick={() => setNewOpen(false)} className={secondaryButton}>Cancelar</button><button type="button" onClick={() => requestCreateReview(STATUS.DRAFT)} className={secondaryButton}>Salvar rascunho</button><button type="button" onClick={() => requestCreateReview(STATUS.WAITING)} className={primaryButton}><Send className="h-4 w-4" /> Enviar para Vitrine</button></div>
        </div>
      </Modal>

      <Modal open={reviewOpen} onClose={() => !busy && setReviewOpen(false)} title={draftStatus === STATUS.DRAFT ? 'Confirmar rascunho' : 'Confirmar envio para Vitrine'}>
        <div className="space-y-4"><div className="rounded-xl bg-pink-50 p-4"><p className="text-sm text-gray-600">Destino</p><p className="font-bold">{storeOptions.find((store) => store.id === draft.lojaDestinoId)?.nome || draft.lojaDestinoId}</p><p className="mt-2 text-sm text-gray-600">Produção</p>{productionSummary.map((item) => <div key={item.key} className="flex justify-between border-b border-pink-100 py-2 last:border-0"><span>{item.produto?.nome}</span><strong>{formatQuantity(item.quantidadeNumero)} {item.produto?.unidade}</strong></div>)}</div><p className="text-sm text-gray-600">{draftStatus === STATUS.DRAFT ? 'O registro ficará como rascunho e ainda não movimentará estoque.' : 'Após confirmar, a produção ficará aguardando conferência. Nenhum estoque será movimentado antes do recebimento.'}</p><div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setReviewOpen(false)} className={secondaryButton}>Voltar</button><button type="button" disabled={busy} onClick={saveProduction} className={primaryButton}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{draftStatus === STATUS.DRAFT ? 'Salvar rascunho' : 'Confirmar envio'}</button></div></div>
      </Modal>

      <Modal open={Boolean(receiving)} onClose={() => !busy && setReceiving(null)} title={receiptMode === 'integral' ? 'Conferir sem divergência' : 'Conferir com divergência'} wide>
        {receiving && <div className="space-y-5">
          <div className="rounded-xl bg-gray-50 p-4 text-sm"><p><strong>Produção:</strong> {receiving.numero}</p><p><strong>Loja:</strong> {receiving.lojaDestinoNome}</p><p><strong>Enviada por:</strong> {receiving.criadoPorNome}</p></div>
          <div className="overflow-x-auto rounded-xl border"><table className="min-w-full divide-y text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Produto</th><th className="px-4 py-3 text-right">Informado pela cozinha</th><th className="px-4 py-3 text-right">Quantidade recebida</th><th className="px-4 py-3 text-right">Divergência</th></tr></thead><tbody className="divide-y">{calculatedReceiptItems.map((item) => <tr key={item.productId} className={item.divergence ? 'bg-rose-50' : ''}><td className="px-4 py-3 font-medium">{item.produtoNome}</td><td className="px-4 py-3 text-right">{formatQuantity(item.quantidadeEnviada)}</td><td className="px-4 py-3 text-right">{receiptMode === 'integral' ? formatQuantity(item.receivedNumber) : <input type="number" min="0" step="0.001" value={item.quantidadeRecebida} onChange={(event) => setReceiptItems((current) => current.map((row) => row.productId === item.productId ? { ...row, quantidadeRecebida: event.target.value } : row))} className={`${inputClass} ml-auto max-w-40 text-right`} />}</td><td className={`px-4 py-3 text-right font-bold ${item.divergence ? 'text-rose-700' : 'text-gray-500'}`}>{item.divergence === null ? '-' : `${item.divergence > 0 ? '+' : ''}${formatQuantity(item.divergence)}`}</td></tr>)}</tbody></table></div>
          {receiptMode === 'divergencia' && <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Field label="Motivo da divergência"><select value={receiptReason} onChange={(event) => setReceiptReason(event.target.value)} className={inputClass}><option value="">Selecione</option>{REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></Field>{receiptReason === 'outro' && <Field label="Descrição do outro motivo"><input value={receiptOther} onChange={(event) => setReceiptOther(event.target.value)} className={inputClass} /></Field>}<div className="md:col-span-2"><Field label="Observação (opcional)"><textarea rows="3" value={receiptNote} onChange={(event) => setReceiptNote(event.target.value)} className={inputClass} /></Field></div></div>}
          <div className={`rounded-xl border p-4 ${hasReceiptDivergence ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}><h3 className="font-bold">Resumo da conferência</h3>{calculatedReceiptItems.map((item) => <p key={item.productId} className="mt-1 text-sm">{item.produtoNome}: informado <strong>{formatQuantity(item.quantidadeEnviada)}</strong>, recebido <strong>{item.receivedNumber === null ? '-' : formatQuantity(item.receivedNumber)}</strong>, divergência <strong>{item.divergence === null ? '-' : `${item.divergence > 0 ? '+' : ''}${formatQuantity(item.divergence)}`}</strong></p>)}<p className="mt-3 text-sm font-semibold">Somente a quantidade efetivamente recebida será adicionada ao estoque.</p></div>
          <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setReceiving(null)} className={secondaryButton}>Cancelar</button><button type="button" disabled={busy} onClick={confirmReceipt} className={primaryButton}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}{hasReceiptDivergence ? 'Confirmar com divergência' : 'Confirmar recebimento integral'}</button></div>
        </div>}
      </Modal>

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title="Detalhes da Produção" wide>
        {viewing && <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-4 text-sm md:grid-cols-4"><div><span className="text-gray-500">ID</span><p className="font-semibold">{viewing.numero || viewing.id}</p></div><div><span className="text-gray-500">Data</span><p className="font-semibold">{formatDate(viewing.dataProducao)}</p></div><div><span className="text-gray-500">Loja</span><p className="font-semibold">{viewing.lojaDestinoNome}</p></div><div><span className="text-gray-500">Status</span><p><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[viewing.status]}`}>{STATUS_LABEL[viewing.status]}</span></p></div><div><span className="text-gray-500">Cozinha</span><p className="font-semibold">{viewing.criadoPorNome || '-'}</p></div><div><span className="text-gray-500">Envio</span><p className="font-semibold">{formatDateTime(viewing.enviadoEm)}</p></div><div><span className="text-gray-500">Conferido por</span><p className="font-semibold">{viewing.recebidoPorNome || '-'}</p></div><div><span className="text-gray-500">Conferência</span><p className="font-semibold">{formatDateTime(viewing.recebidoEm)}</p></div></div>
          <div className="overflow-x-auto rounded-xl border"><table className="min-w-full divide-y text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Produto</th><th className="px-4 py-3 text-right">Produzido/Enviado</th><th className="px-4 py-3 text-right">Recebido</th><th className="px-4 py-3 text-right">Divergência</th></tr></thead><tbody className="divide-y">{(viewing.itens || []).map((item) => <tr key={item.productId} className={Number(item.divergencia) ? 'bg-rose-50' : ''}><td className="px-4 py-3 font-medium">{item.produtoNome}<span className="ml-1 text-xs text-gray-500">({item.unidade || 'un'})</span></td><td className="px-4 py-3 text-right">{formatQuantity(item.quantidadeEnviada)}</td><td className="px-4 py-3 text-right">{item.quantidadeRecebida === null ? '-' : formatQuantity(item.quantidadeRecebida)}</td><td className={`px-4 py-3 text-right font-bold ${Number(item.divergencia) ? 'text-rose-700' : ''}`}>{item.divergencia === null ? '-' : `${Number(item.divergencia) > 0 ? '+' : ''}${formatQuantity(item.divergencia)}`}</td></tr>)}</tbody></table></div>
          {(viewing.observacaoProducao || viewing.observacaoRecebimento || viewing.motivoDivergencia) && <div className="rounded-xl border p-4 text-sm"><h3 className="mb-2 font-bold">Observações e divergência</h3>{viewing.observacaoProducao && <p><strong>Produção:</strong> {viewing.observacaoProducao}</p>}{viewing.motivoDivergencia && <p><strong>Motivo:</strong> {REASONS.find((reason) => reason.value === viewing.motivoDivergencia)?.label || viewing.motivoDivergencia}{viewing.descricaoOutroMotivo ? ` — ${viewing.descricaoOutroMotivo}` : ''}</p>}{viewing.observacaoRecebimento && <p><strong>Recebimento:</strong> {viewing.observacaoRecebimento}</p>}</div>}
          <div><h3 className="mb-2 font-bold">Auditoria</h3><div className="space-y-2">{(viewing.historico || []).map((entry, index) => <div key={`${entry.acao}-${index}`} className="rounded-xl border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{String(entry.acao || '').replace(/_/g, ' ')}</strong><span className="text-gray-500">{formatDateTime(entry.dataHora)}</span></div><p className="text-gray-600">{entry.usuarioNome || entry.usuarioUid} · {entry.perfil || 'perfil não informado'} · {entry.statusAnterior || 'início'} → {entry.statusPosterior}</p></div>)}</div></div>
        </div>}
      </Modal>
    </div>
  );
};

export default ProducaoVitrine;
