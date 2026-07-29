import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Loader2,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { createIdempotencyKey, formatCentsBRL } from '../../caixa/caixaCore';
import {
  alterarSituacaoAlertaCaixa,
  atualizarEstadoNotificacaoCaixa,
  excluirAlertaCaixa,
  excluirAlertasCaixaEmLote,
  listarAlertasCaixa,
  obterConfiguracaoAlertasCaixa,
  obterDetalhesAlertaCaixa,
  salvarConfiguracaoAlertasCaixa,
} from '../../services/caixaService';

const DESTINATION_OPTIONS = [
  {
    value: 'somente_dono',
    title: 'Somente dono',
    description: 'O dono sempre recebe alertas de divergência desta loja.',
  },
  {
    value: 'dono_e_gerentes',
    title: 'Dono e gerentes vinculados à loja',
    description: 'Além do dono, gerentes associados a esta loja recebem os alertas no sino.',
  },
];

const DEFAULT_FILTERS = {
  dataInicio: '',
  dataFim: '',
  tipo: 'todos',
  situacao: 'todas',
  severidade: 'todas',
  responsavel: '',
  divergencia: 'todas',
  pesquisa: '',
  ordenacao: 'mais_recentes',
};

const STATUS_LABELS = {
  nao_lido: 'Não lido',
  lido: 'Lido',
  aberto: 'Aberto',
  em_analise: 'Em análise',
  resolvido: 'Resolvido',
};

const TYPE_LABELS = {
  CAIXA_INICIO_DIVERGENTE: 'Divergência no valor inicial',
  CAIXA_ENCERRAMENTO_DIVERGENTE: 'Divergência no encerramento',
};

const getErrorMessage = (error) => String(
  error?.details?.message || error?.message || 'Não foi possível concluir a operação.',
).replace(/^FirebaseError:\s*/i, '');

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateTime = (value) => toDate(value)?.toLocaleString('pt-BR') || '-';

const formatOperationalDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || '-';
};

const getSituation = (alert) => alert?.situacaoExibicao || (
  alert?.situacao === 'em_analise' || alert?.situacao === 'resolvido'
    ? alert.situacao
    : (alert?.lida ? 'lido' : 'nao_lido')
);

const statusClasses = (status) => ({
  nao_lido: 'border-rose-200 bg-rose-50 text-rose-700',
  lido: 'border-gray-200 bg-gray-50 text-gray-600',
  em_analise: 'border-amber-200 bg-amber-50 text-amber-700',
  resolvido: 'border-green-200 bg-green-50 text-green-700',
}[status] || 'border-gray-200 bg-gray-50 text-gray-600');

const emitCashAlertsUpdated = () => {
  window.dispatchEvent(new CustomEvent('caixa-alerts-updated'));
};

const AlertDetailModal = ({ detail, loading, onClose, onRead, onStatus, onDelete, onOpenCash, busy }) => {
  if (!detail && !loading) return null;
  const alert = detail?.alerta;
  const readStatus = alert?.lida ? 'lido' : 'nao_lido';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-pink-600">Detalhes do alerta</p>
            <h3 className="text-lg font-bold text-gray-900">{alert?.titulo || 'Carregando alerta...'}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando detalhes...
          </div>
        ) : (
          <div className="space-y-6 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(readStatus)}`}>
                Leitura: {STATUS_LABELS[readStatus]}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(alert?.situacao)}`}>
                Situação: {STATUS_LABELS[alert?.situacao] || 'Aberto'}
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Severidade: {alert?.severidade || 'warning'}
              </span>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                {TYPE_LABELS[alert?.tipo] || alert?.tipo}
              </span>
            </div>

            <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">{alert?.mensagem || '-'}</p>

            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-xs text-gray-500">Loja</dt><dd className="font-semibold">{alert?.lojaNome || alert?.lojaId || '-'}</dd></div>
              <div><dt className="text-xs text-gray-500">Data operacional</dt><dd className="font-semibold">{formatOperationalDate(alert?.dataOperacional)}</dd></div>
              <div><dt className="text-xs text-gray-500">Criado em</dt><dd className="font-semibold">{formatDateTime(alert?.criadoEm)}</dd></div>
              <div><dt className="text-xs text-gray-500">Responsável</dt><dd className="font-semibold">{alert?.responsavelNome || alert?.responsavelEmail || '-'}</dd></div>
              <div><dt className="text-xs text-gray-500">Valor esperado</dt><dd className="font-semibold">{alert?.valorEsperadoCentavos === null ? '-' : formatCentsBRL(alert?.valorEsperadoCentavos)}</dd></div>
              <div><dt className="text-xs text-gray-500">Valor informado</dt><dd className="font-semibold">{alert?.valorInformadoCentavos === null ? '-' : formatCentsBRL(alert?.valorInformadoCentavos)}</dd></div>
              <div><dt className="text-xs text-gray-500">Diferença</dt><dd className={`font-bold ${(alert?.diferencaCentavos || 0) < 0 ? 'text-rose-700' : 'text-blue-700'}`}>{alert?.diferencaCentavos === null ? '-' : formatCentsBRL(alert?.diferencaCentavos)}</dd></div>
              <div><dt className="text-xs text-gray-500">Origem</dt><dd className="font-semibold">{TYPE_LABELS[alert?.tipo] || '-'}</dd></div>
              <div><dt className="text-xs text-gray-500">Referência</dt><dd className="break-all font-mono text-xs">{alert?.referencia || '-'}</dd></div>
            </dl>

            <div>
              <h4 className="mb-2 font-bold text-gray-900">Destinatários e leituras</h4>
              <div className="overflow-x-auto rounded-xl border">
                <table className="min-w-full divide-y text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="p-3">Destinatário</th><th className="p-3">Perfil</th><th className="p-3">Leitura</th><th className="p-3">Data</th></tr></thead>
                  <tbody className="divide-y">
                    {(detail?.destinatarios || []).map((recipient) => (
                      <tr key={recipient.uid}><td className="p-3 font-semibold">{recipient.nome}</td><td className="p-3">{recipient.perfil}</td><td className="p-3">{recipient.lida ? 'Lido' : 'Não lido'}</td><td className="p-3">{formatDateTime(recipient.lidaEm)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="mb-2 font-bold text-gray-900">Histórico e auditoria</h4>
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border p-3">
                {(detail?.auditoria || []).length ? detail.auditoria.map((entry) => (
                  <div key={entry.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2"><strong>{String(entry.action || '').replaceAll('_', ' ')}</strong><span className="text-xs text-gray-500">{formatDateTime(entry.criadoEm)}</span></div>
                    <p className="mt-1 text-xs text-gray-600">{entry.usuarioNome || entry.usuarioEmail || '-'} ({entry.perfil || '-'})</p>
                    {(entry.estadoAnterior || entry.estadoNovo) && <p className="mt-1 text-xs">{entry.estadoAnterior || '-'} → {entry.estadoNovo || '-'}</p>}
                    {entry.detalhes && <p className="mt-1 text-xs text-gray-600">{entry.detalhes}</p>}
                  </div>
                )) : <p className="p-3 text-center text-sm text-gray-500">Nenhuma movimentação adicional registrada.</p>}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t pt-4">
              <button type="button" disabled={busy} onClick={() => onRead(alert)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50">
                {alert?.lida ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{alert?.lida ? 'Marcar como não lido' : 'Marcar como lido'}
              </button>
              <button type="button" disabled={busy} onClick={() => onStatus(alert, 'em_analise')} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-700 disabled:opacity-50"><Clock3 className="h-4 w-4" /> Em análise</button>
              <button type="button" disabled={busy} onClick={() => onStatus(alert, 'resolvido')} className="inline-flex items-center gap-2 rounded-xl border border-green-300 px-3 py-2 text-sm font-semibold text-green-700 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Resolver</button>
              <button type="button" onClick={() => onOpenCash(alert)} className="inline-flex items-center gap-2 rounded-xl border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700"><ExternalLink className="h-4 w-4" /> Abrir Caixa</button>
              {detail?.podeExcluir && <button type="button" disabled={busy} onClick={() => onDelete([alert.id])} className="inline-flex items-center gap-2 rounded-xl border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Excluir alerta</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const AlertasNotificacoesTab = ({ user, storeId, storeName, onOpenCashRecord }) => {
  const role = String(user?.role || '').trim().toLowerCase();
  const isOwner = role === 'dono' || ['owner', 'admin', 'administrador'].includes(role);
  const isManagement = isOwner || role === 'gerente';
  const [destination, setDestination] = useState('somente_dono');
  const [canEditFromServer, setCanEditFromServer] = useState(false);
  const [canViewAlerts, setCanViewAlerts] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState({ naoLidos: 0, emAnalise: 0, resolvidos: 0, total: 0 });
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const [pageCursor, setPageCursor] = useState('');
  const [nextCursor, setNextCursor] = useState('');
  const [cursorStack, setCursorStack] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [busyIds, setBusyIds] = useState(new Set());
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, ids: [], reason: '' });
  const canEdit = isOwner && canEditFromServer;

  const loadConfiguration = useCallback(async () => {
    if (!storeId || !isManagement) return;
    setIsLoadingConfig(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await obterConfiguracaoAlertasCaixa({ lojaId: storeId });
      const configuredDestination = response?.configuracao?.destinatarios;
      setDestination(DESTINATION_OPTIONS.some((option) => option.value === configuredDestination) ? configuredDestination : 'somente_dono');
      setCanEditFromServer(Boolean(response?.canEdit ?? response?.podeEditar));
      setCanViewAlerts(Boolean(response?.canViewAlerts ?? response?.podeVisualizarAlertas ?? isOwner));
    } catch (error) {
      setCanEditFromServer(false);
      setCanViewAlerts(false);
      setMessage({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setIsLoadingConfig(false);
    }
  }, [isManagement, isOwner, storeId]);

  useEffect(() => {
    setPageCursor('');
    setNextCursor('');
    setCursorStack([]);
    setSelectedIds(new Set());
    if (storeId && isManagement) loadConfiguration();
  }, [isManagement, loadConfiguration, storeId]);

  const loadAlerts = useCallback(async () => {
    if (!storeId || !canViewAlerts) {
      setAlerts([]);
      return;
    }
    setIsLoadingAlerts(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await listarAlertasCaixa({
        lojaId: storeId,
        ...appliedFilters,
        cursor: pageCursor || undefined,
        tamanhoPagina: 25,
      });
      setAlerts(response?.alertas || []);
      setSummary(response?.resumoPagina || { naoLidos: 0, emAnalise: 0, resolvidos: 0, total: 0 });
      setNextCursor(response?.temMais ? response?.proximoCursor || '' : '');
      setSelectedIds(new Set());
    } catch (error) {
      setAlerts([]);
      setMessage({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setIsLoadingAlerts(false);
    }
  }, [appliedFilters, canViewAlerts, pageCursor, storeId]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  const handleSave = async (event) => {
    event.preventDefault();
    if (!storeId || !canEdit || isSaving) return;
    setIsSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await salvarConfiguracaoAlertasCaixa({
        lojaId: storeId,
        destinatarios: destination,
        idempotencyKey: createIdempotencyKey(`config-alertas:${storeId}`),
      });
      setDestination(response?.configuracao?.destinatarios || destination);
      setCanViewAlerts(true);
      setMessage({ type: 'success', text: 'Configuração de alertas salva com sucesso.' });
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  };

  const refreshAfterMutation = async (alertId = '') => {
    emitCashAlertsUpdated();
    await loadAlerts();
    if (detail?.alerta?.id === alertId) await openDetail(alertId);
  };

  const runBusy = async (ids, action) => {
    setBusyIds((current) => new Set([...current, ...ids]));
    setMessage({ type: '', text: '' });
    try {
      await action();
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const handleRead = (alert) => runBusy([alert.id], async () => {
    await atualizarEstadoNotificacaoCaixa({ notificacaoId: alert.id, lida: alert.lida !== true });
    await refreshAfterMutation(alert.id);
  });

  const handleStatus = (alert, situation) => {
    const observation = window.prompt(
      situation === 'resolvido' ? 'Observação da resolução (opcional):' : 'Observação da análise (opcional):',
      '',
    );
    if (observation === null) return;
    runBusy([alert.id], async () => {
      await alterarSituacaoAlertaCaixa({
        lojaId: storeId,
        alertaId: alert.id,
        situacao: situation,
        observacao: observation,
        idempotencyKey: createIdempotencyKey(`situacao-alerta:${alert.id}`),
      });
      await refreshAfterMutation(alert.id);
    });
  };

  const openDetail = async (alertId) => {
    setDetailLoading(true);
    setDetail({ alerta: alerts.find((item) => item.id === alertId) || { id: alertId } });
    try {
      const response = await obterDetalhesAlertaCaixa({ lojaId: storeId, alertaId: alertId });
      setDetail(response);
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error) });
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmDelete = (ids) => setDeleteDialog({ open: true, ids, reason: '' });

  const executeDelete = () => runBusy(deleteDialog.ids, async () => {
    if (deleteDialog.ids.length === 1) {
      await excluirAlertaCaixa({
        lojaId: storeId,
        alertaId: deleteDialog.ids[0],
        motivo: deleteDialog.reason,
        idempotencyKey: createIdempotencyKey(`excluir-alerta:${deleteDialog.ids[0]}`),
      });
    } else {
      await excluirAlertasCaixaEmLote({
        lojaId: storeId,
        alertasIds: deleteDialog.ids,
        motivo: deleteDialog.reason,
        idempotencyKey: createIdempotencyKey(`excluir-alertas:${storeId}`),
      });
    }
    setDeleteDialog({ open: false, ids: [], reason: '' });
    setDetail(null);
    setMessage({ type: 'success', text: `${deleteDialog.ids.length} alerta(s) excluído(s) logicamente e registrado(s) na auditoria.` });
    emitCashAlertsUpdated();
    await loadAlerts();
  });

  const applyFilters = (event) => {
    event.preventDefault();
    setPageCursor('');
    setCursorStack([]);
    setAppliedFilters({ ...filters });
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setPageCursor('');
    setCursorStack([]);
  };

  const selectAllPage = () => setSelectedIds(new Set(alerts.map((alert) => alert.id)));
  const toggleSelection = (alertId) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(alertId)) next.delete(alertId); else next.add(alertId);
    return next;
  });

  const goNext = () => {
    if (!nextCursor) return;
    setCursorStack((current) => [...current, pageCursor]);
    setPageCursor(nextCursor);
  };

  const goPrevious = () => {
    if (!cursorStack.length) return;
    const previous = cursorStack[cursorStack.length - 1];
    setCursorStack((current) => current.slice(0, -1));
    setPageCursor(previous);
  };

  const openCashRecord = (alert) => {
    if (typeof onOpenCashRecord === 'function') onOpenCashRecord(alert);
  };

  if (!storeId) return <div className="mt-6 rounded-2xl border bg-white p-6 text-center text-gray-500 shadow-lg">Selecione uma loja específica no topo da página para visualizar os alertas e notificações.</div>;
  if (!isManagement) return <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">Seu perfil não possui acesso aos alertas financeiros do caixa.</div>;

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-lg md:p-6">
        <form onSubmit={handleSave} className="max-w-2xl space-y-5">
          <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pink-100 text-pink-700"><BellRing className="h-5 w-5" /></div><div><h3 className="text-xl font-bold text-gray-800">Alertas e Notificações</h3><p className="mt-1 text-sm text-gray-500">Defina quem recebe no sino os alertas de divergência do caixa de {storeName || storeId}.</p></div></div>
          {isLoadingConfig ? <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">Carregando configuração...</div> : (
            <fieldset className="space-y-3" disabled={!canEdit || isSaving}>
              <legend className="mb-2 text-sm font-semibold text-gray-800">Destinatários por loja</legend>
              {DESTINATION_OPTIONS.map((option) => <label key={option.value} className={`flex items-start gap-3 rounded-xl border p-4 ${destination === option.value ? 'border-pink-300 bg-pink-50' : 'border-gray-200 bg-white'} ${canEdit ? 'cursor-pointer hover:border-pink-200' : 'cursor-default'}`}><input type="radio" name="cash-alert-destination" value={option.value} checked={destination === option.value} onChange={(event) => setDestination(event.target.value)} className="mt-1 h-4 w-4 text-pink-600" /><span><span className="block text-sm font-semibold text-gray-800">{option.title}</span><span className="mt-1 block text-xs text-gray-500">{option.description}</span></span></label>)}
            </fieldset>
          )}
          <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">{isOwner ? 'O dono sempre recebe. A alteração vale somente para a loja selecionada.' : 'Você pode visualizar esta configuração, mas somente o dono pode alterá-la.'} Atendentes, contadores e clientes nunca recebem alertas de caixa.</p>
          {canEdit && <button type="submit" disabled={isSaving || isLoadingConfig} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 px-5 py-3 font-medium text-white shadow-lg disabled:opacity-50"><Save className="h-4 w-4" />{isSaving ? 'Salvando...' : 'Salvar configuração'}</button>}
        </form>
      </section>

      {message.text && <p className={`rounded-xl border p-3 text-sm ${message.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{message.text}</p>}

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-lg md:p-6">
        <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><AlertTriangle className="h-5 w-5" /></div><div><h3 className="text-xl font-bold text-gray-800">Histórico de alertas</h3><p className="mt-1 text-sm text-gray-500">Consulte e gerencie os alertas de divergência registrados para esta loja. Os alertas permanecem disponíveis até serem excluídos manualmente pelo Dono.</p></div></div>

        {!canViewAlerts && !isLoadingConfig ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Os alertas desta loja estão configurados para acesso exclusivo do Dono.</div> : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">{[
              ['Não lidos', summary.naoLidos, 'text-rose-700'],
              ['Em análise', summary.emAnalise, 'text-amber-700'],
              ['Resolvidos', summary.resolvidos, 'text-green-700'],
              ['Nesta página', summary.total, 'text-gray-800'],
            ].map(([label, value, color]) => <div key={label} className="rounded-xl border bg-gray-50 p-3"><p className="text-xs text-gray-500">{label}</p><p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p></div>)}</div>

            <form onSubmit={applyFilters} className="mt-5 space-y-3 rounded-2xl border bg-gray-50 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-800"><Filter className="h-4 w-4" /> Filtros</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-semibold text-gray-600">Período inicial<input type="date" value={filters.dataInicio} onChange={(event) => setFilters((current) => ({ ...current, dataInicio: event.target.value }))} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" /></label>
                <label className="text-xs font-semibold text-gray-600">Período final<input type="date" value={filters.dataFim} onChange={(event) => setFilters((current) => ({ ...current, dataFim: event.target.value }))} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" /></label>
                <label className="text-xs font-semibold text-gray-600">Tipo<select value={filters.tipo} onChange={(event) => setFilters((current) => ({ ...current, tipo: event.target.value }))} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"><option value="todos">Todos</option><option value="CAIXA_INICIO_DIVERGENTE">Valor inicial</option><option value="CAIXA_ENCERRAMENTO_DIVERGENTE">Encerramento</option></select></label>
                <label className="text-xs font-semibold text-gray-600">Situação<select value={filters.situacao} onChange={(event) => setFilters((current) => ({ ...current, situacao: event.target.value }))} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"><option value="todas">Todas</option><option value="nao_lido">Não lidos</option><option value="lido">Lidos</option><option value="em_analise">Em análise</option><option value="resolvido">Resolvidos</option></select></label>
                <label className="text-xs font-semibold text-gray-600">Severidade<select value={filters.severidade} onChange={(event) => setFilters((current) => ({ ...current, severidade: event.target.value }))} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"><option value="todas">Todas</option><option value="warning">Atenção</option><option value="critical">Crítica</option></select></label>
                <label className="text-xs font-semibold text-gray-600">Responsável<input value={filters.responsavel} onChange={(event) => setFilters((current) => ({ ...current, responsavel: event.target.value }))} placeholder="Nome ou e-mail" className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" /></label>
                <label className="text-xs font-semibold text-gray-600">Diferença<select value={filters.divergencia} onChange={(event) => setFilters((current) => ({ ...current, divergencia: event.target.value }))} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"><option value="todas">Todas</option><option value="positiva">Positiva</option><option value="negativa">Negativa</option></select></label>
                <label className="text-xs font-semibold text-gray-600">Ordenação<select value={filters.ordenacao} onChange={(event) => setFilters((current) => ({ ...current, ordenacao: event.target.value }))} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"><option value="mais_recentes">Não lidos e mais recentes</option><option value="mais_antigos">Mais antigos</option><option value="maior_diferenca">Maior diferença</option><option value="menor_diferenca">Menor diferença</option></select></label>
              </div>
              <label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><input value={filters.pesquisa} onChange={(event) => setFilters((current) => ({ ...current, pesquisa: event.target.value }))} placeholder="Pesquisar por título, descrição, responsável ou data operacional" className="w-full rounded-lg border bg-white py-2 pl-10 pr-3 text-sm" /></label>
              <div className="flex flex-wrap gap-2"><button type="submit" className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white">Aplicar filtros</button><button type="button" onClick={clearFilters} className="rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700">Limpar filtros</button></div>
            </form>

            {isOwner && alerts.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border bg-gray-50 p-3 text-sm"><button type="button" onClick={selectAllPage} className="font-semibold text-pink-700">Selecionar todos da página</button><span className="text-gray-300">|</span><button type="button" onClick={() => setSelectedIds(new Set())} className="font-semibold text-gray-600">Desmarcar todos</button><span className="ml-auto font-semibold">{selectedIds.size} selecionado(s)</span><button type="button" disabled={!selectedIds.size} onClick={() => confirmDelete([...selectedIds])} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 font-semibold text-white disabled:opacity-40"><Trash2 className="h-4 w-4" /> Excluir selecionados</button></div>}

            <div className="mt-4 overflow-x-auto rounded-xl border">
              <table className="min-w-[1100px] w-full divide-y text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr>{isOwner && <th className="p-3">Sel.</th>}<th className="p-3">Status / Tipo</th><th className="p-3">Data</th><th className="p-3">Descrição</th><th className="p-3">Responsável</th><th className="p-3 text-right">Esperado</th><th className="p-3 text-right">Informado</th><th className="p-3 text-right">Diferença</th><th className="p-3">Ações</th></tr></thead>
                <tbody className="divide-y bg-white">
                  {isLoadingAlerts ? <tr><td colSpan={isOwner ? 9 : 8} className="p-10 text-center text-gray-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Carregando alertas...</td></tr> : alerts.length ? alerts.map((alert) => {
                    const situation = getSituation(alert);
                    const readStatus = alert.lida ? 'lido' : 'nao_lido';
                    const busy = busyIds.has(alert.id);
                    return <tr key={alert.id} className={alert.lida ? 'bg-white' : 'bg-rose-50/40'}>{isOwner && <td className="p-3"><input type="checkbox" checked={selectedIds.has(alert.id)} onChange={() => toggleSelection(alert.id)} className="h-4 w-4 rounded text-pink-600" /></td>}<td className="p-3"><span className={`inline-block rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses(readStatus)}`}>{STATUS_LABELS[readStatus]}</span>{alert.situacao !== 'aberto' && <span className={`ml-1 inline-block rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses(situation)}`}>{STATUS_LABELS[situation] || situation}</span>}<p className="mt-2 max-w-44 text-xs font-semibold text-gray-700">{TYPE_LABELS[alert.tipo] || alert.tipo}</p></td><td className="p-3"><p className="font-semibold">{formatOperationalDate(alert.dataOperacional)}</p><p className="mt-1 text-xs text-gray-500">{formatDateTime(alert.criadoEm)}</p></td><td className="max-w-xs p-3"><p className="font-semibold text-gray-900">{alert.titulo}</p><p className="mt-1 line-clamp-2 text-xs text-gray-500">{alert.mensagem}</p></td><td className="p-3">{alert.responsavelNome || alert.responsavelEmail || '-'}</td><td className="p-3 text-right font-medium">{alert.valorEsperadoCentavos === null ? '-' : formatCentsBRL(alert.valorEsperadoCentavos)}</td><td className="p-3 text-right font-medium">{alert.valorInformadoCentavos === null ? '-' : formatCentsBRL(alert.valorInformadoCentavos)}</td><td className={`p-3 text-right font-bold ${(alert.diferencaCentavos || 0) < 0 ? 'text-rose-700' : 'text-blue-700'}`}>{alert.diferencaCentavos === null ? '-' : formatCentsBRL(alert.diferencaCentavos)}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => openDetail(alert.id)} className="text-xs font-semibold text-blue-700">Detalhes</button><button type="button" disabled={busy} onClick={() => handleRead(alert)} className="text-xs font-semibold text-pink-700 disabled:opacity-40">{alert.lida ? 'Não lido' : 'Lido'}</button><button type="button" disabled={busy} onClick={() => handleStatus(alert, 'em_analise')} className="text-xs font-semibold text-amber-700 disabled:opacity-40">Em análise</button><button type="button" disabled={busy} onClick={() => handleStatus(alert, 'resolvido')} className="text-xs font-semibold text-green-700 disabled:opacity-40">Resolver</button><button type="button" onClick={() => openCashRecord(alert)} className="text-xs font-semibold text-blue-700">Abrir Caixa</button>{isOwner && <button type="button" disabled={busy} onClick={() => confirmDelete([alert.id])} className="text-xs font-semibold text-red-700 disabled:opacity-40">Excluir</button>}</div></td></tr>;
                  }) : <tr><td colSpan={isOwner ? 9 : 8} className="p-10 text-center text-gray-500">Nenhum alerta encontrado para os filtros selecionados.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between"><button type="button" disabled={!cursorStack.length || isLoadingAlerts} onClick={goPrevious} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Anterior</button><span className="text-xs text-gray-500">Página {cursorStack.length + 1} • até 25 alertas</span><button type="button" disabled={!nextCursor || isLoadingAlerts} onClick={goNext} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40">Próxima <ChevronRight className="h-4 w-4" /></button></div>
          </>
        )}
      </section>

      <AlertDetailModal detail={detail} loading={detailLoading} onClose={() => setDetail(null)} onRead={handleRead} onStatus={handleStatus} onDelete={confirmDelete} onOpenCash={openCashRecord} busy={detail?.alerta?.id ? busyIds.has(detail.alerta.id) : false} />

      {deleteDialog.open && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><h3 className="text-lg font-bold text-gray-900">Excluir {deleteDialog.ids.length > 1 ? `${deleteDialog.ids.length} alertas` : 'alerta'}?</h3><p className="mt-3 whitespace-pre-line text-sm text-gray-600">Deseja excluir este alerta?{deleteDialog.ids.length > 1 ? `\nForam selecionados ${deleteDialog.ids.length} alertas.` : ''}{'\n\n'}O alerta deixará de aparecer no Histórico de alertas e no sino dos destinatários. A ação ficará registrada na auditoria.</p><label className="mt-4 block text-sm font-semibold text-gray-700">Motivo da exclusão (opcional)<textarea value={deleteDialog.reason} onChange={(event) => setDeleteDialog((current) => ({ ...current, reason: event.target.value }))} maxLength={1000} className="mt-1 min-h-24 w-full rounded-xl border p-3 font-normal" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeleteDialog({ open: false, ids: [], reason: '' })} className="rounded-xl border px-4 py-2 font-semibold">Cancelar</button><button type="button" onClick={executeDelete} className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white">Excluir alerta</button></div></div></div>}
    </div>
  );
};

export default AlertasNotificacoesTab;
