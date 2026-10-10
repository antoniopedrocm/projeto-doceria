import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Eye, EyeOff, Filter, X } from 'lucide-react';
import { formatCentsBRL, isCashNotification } from '../../caixa/caixaCore';
import {
  atualizarEstadoNotificacaoCaixa,
  listarNotificacoesCaixa,
  marcarTodasNotificacoesCaixaComoLidas,
} from '../../services/caixaService';

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getNotificationDate = (notification) => toDate(
  notification?.criadoEm || notification?.createdAt || notification?.timestamp || notification?.data,
);

const getErrorMessage = (error) => String(
  error?.details?.message || error?.message || 'Não foi possível atualizar a notificação.',
).replace(/^FirebaseError:\s*/i, '');

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const NotificationsBell = ({
  user,
  pendingOrders = [],
  isOpen,
  onToggle,
  onClose,
  onOpenOrders,
  storeInfoMap = {},
}) => {
  const role = normalizeRole(user?.role);
  const canReceiveCashAlerts = role === 'dono' || role === 'gerente';
  const uid = user?.auth?.uid || user?.uid || '';
  const [cashNotifications, setCashNotifications] = useState([]);
  const [activeSection, setActiveSection] = useState('orders');
  const [storeFilter, setStoreFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('30');
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [busyIds, setBusyIds] = useState(new Set());
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadCashNotifications = useCallback(async () => {
    if (!canReceiveCashAlerts || !uid) {
      setCashNotifications([]);
      return;
    }
    try {
      const response = await listarNotificacoesCaixa();
      const rows = (response?.notificacoes || [])
        .filter((item) => item?.isDeleted !== true && isCashNotification(item))
        .sort((a, b) => (getNotificationDate(b)?.getTime() || 0) - (getNotificationDate(a)?.getTime() || 0));
      setCashNotifications(rows);
      setSelectedNotification((current) => (
        current ? rows.find((row) => row.id === current.id) || null : null
      ));
      setErrorMessage('');
    } catch (error) {
      console.error('Erro ao carregar notificações individuais do caixa:', error);
      setCashNotifications([]);
      setErrorMessage('Não foi possível carregar os alertas de caixa.');
    }
  }, [canReceiveCashAlerts, uid]);

  useEffect(() => {
    if (!canReceiveCashAlerts || !uid) {
      setCashNotifications([]);
      return undefined;
    }
    loadCashNotifications();
    const handleUpdate = () => loadCashNotifications();
    window.addEventListener('caixa-alerts-updated', handleUpdate);
    const intervalId = window.setInterval(loadCashNotifications, 30000);
    return () => {
      window.removeEventListener('caixa-alerts-updated', handleUpdate);
      window.clearInterval(intervalId);
    };
  }, [canReceiveCashAlerts, loadCashNotifications, uid]);

  const unreadCashCount = useMemo(() => cashNotifications.filter((item) => item.lida !== true).length, [cashNotifications]);
  const badgeCount = pendingOrders.length + unreadCashCount;

  const storeOptions = useMemo(() => Array.from(new Set(
    cashNotifications.map((item) => item.lojaId).filter(Boolean),
  )), [cashNotifications]);

  const filteredCashNotifications = useMemo(() => {
    const now = Date.now();
    const periodDays = Number(periodFilter);
    return cashNotifications.filter((item) => {
      if (storeFilter !== 'all' && item.lojaId !== storeFilter) return false;
      const type = String(item.tipo || item.type || '').toUpperCase();
      if (typeFilter !== 'all' && type !== typeFilter) return false;
      if (Number.isFinite(periodDays) && periodDays > 0) {
        const createdAt = getNotificationDate(item);
        if (!createdAt || now - createdAt.getTime() > periodDays * 24 * 60 * 60 * 1000) return false;
      }
      return true;
    });
  }, [cashNotifications, periodFilter, storeFilter, typeFilter]);

  const updateReadState = async (notification, lida) => {
    if (!notification?.id || busyIds.has(notification.id)) return;
    setBusyIds((current) => new Set([...current, notification.id]));
    setErrorMessage('');
    try {
      await atualizarEstadoNotificacaoCaixa({ notificacaoId: notification.id, lida });
      setCashNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, lida } : item
      )));
      setSelectedNotification((current) => (
        current?.id === notification.id ? { ...current, lida } : current
      ));
      window.dispatchEvent(new CustomEvent('caixa-alerts-updated'));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(notification.id);
        return next;
      });
    }
  };

  const markAllAsRead = async () => {
    if (isMarkingAll || unreadCashCount === 0) return;
    setIsMarkingAll(true);
    setErrorMessage('');
    try {
      await marcarTodasNotificacoesCaixaComoLidas({
        lojaId: storeFilter === 'all' ? undefined : storeFilter,
      });
      setCashNotifications((current) => current.map((item) => (
        storeFilter === 'all' || item.lojaId === storeFilter ? { ...item, lida: true } : item
      )));
      window.dispatchEvent(new CustomEvent('caixa-alerts-updated'));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMarkingAll(false);
    }
  };

  const openDetail = (notification) => {
    setSelectedNotification(notification);
    if (notification.lida !== true) updateReadState(notification, true);
  };

  const renderOrderList = () => (
    <div className="max-h-96 overflow-y-auto p-2">
      {pendingOrders.length > 0 ? pendingOrders.map((order) => (
        <button
          type="button"
          key={order.id}
          className="block w-full border-b p-2 text-left hover:bg-gray-50"
          onClick={() => { onOpenOrders(); onClose(); }}
        >
          <p className="font-semibold">{order.clienteNome || 'Cliente'}</p>
          <p className="text-sm text-gray-500">ID: {order.id?.substring(0, 8) || 'N/A'}</p>
          <p className="text-sm text-gray-500">Data: {toDate(order.createdAt)?.toLocaleDateString('pt-BR') || '-'}</p>
          <p className="text-sm">Status: <span className="font-medium">{order.status}</span></p>
        </button>
      )) : <p className="p-4 text-center text-gray-500">Nenhum pedido pendente.</p>}
    </div>
  );

  const renderCashDetail = () => {
    const item = selectedNotification;
    if (!item) return null;
    const values = item.valores && typeof item.valores === 'object' ? item.valores : item;
    const centsFrom = (centsKeys, legacyKeys = []) => {
      for (const source of [values, item]) {
        for (const key of centsKeys) {
          const rawCents = source?.[key];
          if (rawCents === null || rawCents === undefined || rawCents === '') continue;
          const cents = Number(rawCents);
          if (Number.isFinite(cents)) return Math.round(cents);
        }
        for (const key of legacyKeys) {
          const rawLegacyValue = source?.[key];
          if (rawLegacyValue === null || rawLegacyValue === undefined || rawLegacyValue === '') continue;
          const legacyValue = Number(rawLegacyValue);
          if (Number.isFinite(legacyValue)) return Math.round(legacyValue * 100);
        }
      }
      return null;
    };
    const notificationType = String(item.tipo || item.type || '').toUpperCase();
    const difference = centsFrom(['diferencaCentavos'], ['diferenca']);
    const previous = centsFrom(
      ['encerramentoAnteriorCentavos', 'valorAnteriorCentavos'],
      ['encerramentoAnterior', 'valorAnterior'],
    );
    const informed = notificationType === 'CAIXA_INICIO_DIVERGENTE'
      ? centsFrom(['valorInicialCentavos', 'valorInformadoCentavos'], ['valorInicial', 'valorInformado'])
      : centsFrom(['valorEncerramentoCentavos', 'valorInformadoCentavos'], ['valorEncerramento', 'valorInformado']);
    const expected = centsFrom(['valorEsperadoCentavos'], ['valorEsperado']);

    return (
      <div className="space-y-4 p-4">
        <button type="button" onClick={() => setSelectedNotification(null)} className="text-sm font-semibold text-pink-700 hover:underline">
          ← Voltar aos alertas
        </button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Detalhe relacionado</p>
          <h3 className="mt-1 text-lg font-bold text-gray-900">{item.titulo || item.title || 'Divergência de caixa'}</h3>
          <p className="mt-2 text-sm text-gray-600">{item.mensagem || item.message || 'Foi identificada uma diferença no registro do caixa.'}</p>
        </div>
        <dl className="grid grid-cols-1 gap-3 rounded-xl bg-gray-50 p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-gray-500">Loja</dt><dd className="font-semibold">{storeInfoMap[item.lojaId]?.nome || item.lojaNome || item.lojaId || '-'}</dd></div>
          <div><dt className="text-xs text-gray-500">Data operacional</dt><dd className="font-semibold">{item.dataOperacional || '-'}</dd></div>
          <div><dt className="text-xs text-gray-500">Criado em</dt><dd className="font-semibold">{getNotificationDate(item)?.toLocaleString('pt-BR') || '-'}</dd></div>
          <div><dt className="text-xs text-gray-500">Responsável</dt><dd className="font-semibold">{item.responsavelNome || item.responsavelEmail || item.responsavelUid || '-'}</dd></div>
          {previous !== null && <div><dt className="text-xs text-gray-500">Valor anterior</dt><dd className="font-semibold">{formatCentsBRL(previous)}</dd></div>}
          {expected !== null && <div><dt className="text-xs text-gray-500">Valor esperado</dt><dd className="font-semibold">{formatCentsBRL(expected)}</dd></div>}
          {informed !== null && <div><dt className="text-xs text-gray-500">Valor informado</dt><dd className="font-semibold">{formatCentsBRL(informed)}</dd></div>}
          {difference !== null && <div><dt className="text-xs text-gray-500">Diferença</dt><dd className={`font-bold ${difference === 0 ? 'text-green-700' : 'text-rose-700'}`}>{formatCentsBRL(difference)}</dd></div>}
        </dl>
        <button
          type="button"
          onClick={() => updateReadState(item, item.lida === true ? false : true)}
          disabled={busyIds.has(item.id)}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
        >
          {item.lida === true ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {item.lida === true ? 'Marcar como não lido' : 'Marcar como lido'}
        </button>
      </div>
    );
  };

  const renderCashList = () => selectedNotification ? renderCashDetail() : (
    <div>
      <div className="space-y-3 border-b p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600"><Filter className="h-4 w-4" /> Filtros</span>
          <button type="button" onClick={markAllAsRead} disabled={isMarkingAll || unreadCashCount === 0} className="inline-flex items-center gap-1 text-xs font-semibold text-pink-700 disabled:text-gray-400">
            <CheckCheck className="h-4 w-4" /> {isMarkingAll ? 'Marcando...' : 'Marcar todos como lidos'}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-xs">
            <option value="all">Todas as lojas</option>
            {storeOptions.map((storeId) => <option key={storeId} value={storeId}>{storeInfoMap[storeId]?.nome || storeId}</option>)}
          </select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-xs">
            <option value="all">Todos os tipos</option>
            <option value="CAIXA_INICIO_DIVERGENTE">Valor inicial</option>
            <option value="CAIXA_ENCERRAMENTO_DIVERGENTE">Encerramento</option>
          </select>
          <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-xs">
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="all">Todo o período</option>
          </select>
        </div>
      </div>
      {errorMessage && <p className="m-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{errorMessage}</p>}
      <div className="max-h-[26rem] overflow-y-auto p-2">
        {filteredCashNotifications.length ? filteredCashNotifications.map((item) => (
          <div key={item.id} className={`mb-2 rounded-xl border p-3 ${item.lida === true ? 'border-gray-200 bg-white' : 'border-rose-200 bg-rose-50'}`}>
            <button type="button" onClick={() => openDetail(item)} className="block w-full text-left">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">{item.titulo || item.title || 'Divergência de caixa'}</p>
                {item.lida !== true && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-label="Não lido" />}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-gray-600">{item.mensagem || item.message || 'Foi identificada uma diferença no caixa.'}</p>
              <p className="mt-2 text-[11px] text-gray-500">{storeInfoMap[item.lojaId]?.nome || item.lojaNome || item.lojaId || '-'} • {getNotificationDate(item)?.toLocaleString('pt-BR') || '-'}</p>
            </button>
            <button type="button" onClick={() => updateReadState(item, item.lida === true ? false : true)} disabled={busyIds.has(item.id)} className="mt-2 text-xs font-semibold text-pink-700 disabled:text-gray-400">
              {item.lida === true ? 'Marcar como não lido' : 'Marcar como lido'}
            </button>
          </div>
        )) : <p className="p-6 text-center text-sm text-gray-500">Nenhum alerta de caixa encontrado.</p>}
      </div>
    </div>
  );

  return (
    <div className="relative">
      <button type="button" onClick={onToggle} className="relative rounded-full p-2 hover:bg-gray-100" aria-label="Abrir notificações">
        <Bell className="h-5 w-5 text-gray-600" />
        {badgeCount > 0 && (
          <span className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white ${!canReceiveCashAlerts ? 'animate-pulse' : ''}`}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>

      {isOpen && !canReceiveCashAlerts && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border bg-white shadow-xl">
          <div className="border-b p-4 font-bold">Pedidos Pendentes ({pendingOrders.length})</div>
          {renderOrderList()}
        </div>
      )}

      {isOpen && canReceiveCashAlerts && (
        <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b p-3">
            <p className="font-bold text-gray-900">Notificações</p>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100" aria-label="Fechar notificações"><X className="h-4 w-4" /></button>
          </div>

          <div className="grid grid-cols-2 border-b p-2">
            <button type="button" onClick={() => { setActiveSection('orders'); setSelectedNotification(null); }} className={`rounded-lg px-3 py-2 text-sm font-semibold ${activeSection === 'orders' ? 'bg-pink-100 text-pink-800' : 'text-gray-600'}`}>
              Pedidos ({pendingOrders.length})
            </button>
            <button type="button" onClick={() => setActiveSection('cash')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${activeSection === 'cash' ? 'bg-pink-100 text-pink-800' : 'text-gray-600'}`}>
              Alertas de caixa ({unreadCashCount})
            </button>
          </div>
          {activeSection === 'orders' ? renderOrderList() : renderCashList()}
        </div>
      )}
    </div>
  );
};

export default NotificationsBell;
