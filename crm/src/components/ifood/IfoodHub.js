import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CheckCircle, Clock, DollarSign, Moon, Package,
  Pencil, RefreshCw, Save, Search, Settings, ShoppingCart, Sun, Truck, Wifi, WifiOff, X
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebaseConfig.js';

const tabs = [
  {id: 'operacao', label: 'Operacao', icon: ShoppingCart},
  {id: 'catalogo', label: 'Catalogo e estoque', icon: Package},
  {id: 'configuracao', label: 'Configuracao', icon: Settings},
  {id: 'auditoria', label: 'Auditoria', icon: Clock},
];

const initialConfig = {
  merchantId: '',
  enabled: false,
  pollingEnabled: true,
  webhookEnabled: false,
  autoConfirm: true,
  autoStartPreparation: false,
  apiBaseUrl: 'https://merchant-api.ifood.com.br',
  authUrl: 'https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token',
  inventoryEndpointTemplate: '',
  inventoryMethod: 'POST',
  credentialsReady: false,
  webhookSecretReady: false,
};

const money = (value) => (Number(value) || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const dateTime = (value) => toDate(value)?.toLocaleString('pt-BR') || '-';

const statusClass = (status, dark) => {
  const map = {
    Pendente: dark ? 'bg-amber-400/15 text-amber-300' : 'bg-amber-50 text-amber-700',
    'Em Preparo': dark ? 'bg-sky-400/15 text-sky-300' : 'bg-sky-50 text-sky-700',
    Pronto: dark ? 'bg-cyan-400/15 text-cyan-300' : 'bg-cyan-50 text-cyan-700',
    'Saiu para Entrega': dark ? 'bg-indigo-400/15 text-indigo-300' : 'bg-indigo-50 text-indigo-700',
    Finalizado: dark ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700',
    Cancelado: dark ? 'bg-rose-400/15 text-rose-300' : 'bg-rose-50 text-rose-700',
  };
  return map[status] || (dark ? 'bg-rose-400/15 text-rose-300' : 'bg-rose-50 text-rose-700');
};

const Button = ({children, onClick, disabled, primary = false, dark = false, type = 'button'}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
      primary
        ? 'bg-pink-600 text-white hover:bg-pink-700'
        : dark
          ? 'border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
          : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
    }`}
  >
    {children}
  </button>
);

const Field = ({label, hint, dark, children}) => (
  <label className="block space-y-2">
    <span className={`text-sm font-medium ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{label}</span>
    {children}
    {hint && <span className={`block text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{hint}</span>}
  </label>
);

const inputClass = (dark) => `h-11 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 focus:ring-pink-500 ${
  dark ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-gray-200 bg-white text-gray-800'
}`;

const ProtectedSecretField = ({
  label, stored, editing, value, onChange, onEdit, onCancel, emptyHint, dark,
}) => (
  <Field
    dark={dark}
    label={label}
    hint={stored ? 'Armazenado no Secret Manager. Use Substituir para cadastrar um novo valor.' : emptyHint}
  >
    <div className="flex items-center gap-2">
      <input
        type={stored && !editing ? 'text' : 'password'}
        readOnly={stored && !editing}
        className={inputClass(dark)}
        value={stored && !editing ? '********' : value}
        onChange={(event) => onChange(event.target.value)}
      />
      {stored && !editing && (
        <Button dark={dark} onClick={onEdit}>
          <Pencil className="h-4 w-4" />Substituir
        </Button>
      )}
      {stored && editing && (
        <Button dark={dark} onClick={onCancel}>
          <X className="h-4 w-4" />Cancelar
        </Button>
      )}
    </div>
  </Field>
);

const Metric = ({label, value, icon: Icon, tone, dark}) => (
  <div className={`rounded-lg border p-4 ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className={`text-xs font-medium ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{label}</p>
        <p className={`mt-2 text-2xl font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>{value}</p>
      </div>
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
    </div>
  </div>
);

const Toggle = ({label, checked, onChange, dark}) => (
  <label className={`flex items-center justify-between gap-4 rounded-lg border p-3 ${dark ? 'border-slate-800 text-slate-200' : 'border-gray-100 text-gray-700'}`}>
    <span className="text-sm">{label}</span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-pink-600" />
  </label>
);

export default function IfoodHub({data, effectiveStoreId, selectedStoreId, availableStores = [], storeInfoMap, onSelectStore}) {
  const [tab, setTab] = useState('operacao');
  const [dark, setDark] = useState(() => window.localStorage.getItem('ifood-hub-theme') === 'dark');
  const [config, setConfig] = useState(initialConfig);
  const [secrets, setSecrets] = useState({clientId: '', clientSecret: '', webhookSecret: ''});
  const [editingSecrets, setEditingSecrets] = useState({clientId: false, clientSecret: false, webhookSecret: false});
  const [remoteHealth, setRemoteHealth] = useState({status: 'not_configured'});
  const [merchants, setMerchants] = useState([]);
  const [mapping, setMapping] = useState({productId: '', iFoodProductId: '', externalCode: '', catalogItemId: ''});
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [cancellation, setCancellation] = useState({order: null, reasons: [], reason: ''});
  const [validation, setValidation] = useState({order: null, action: '', code: ''});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);

  const invoke = useCallback(async (name, payload = {}) => {
    if (!effectiveStoreId) throw new Error('Selecione uma loja especifica para operar o iFood.');
    const response = await httpsCallable(functions, name)({lojaId: effectiveStoreId, ...payload});
    return response.data;
  }, [effectiveStoreId]);

  const loadConfiguration = useCallback(async () => {
    if (!effectiveStoreId) return;
    setBusy('configuration-load');
    try {
      const result = await invoke('ifoodGetConfiguration');
      setConfig({...initialConfig, ...(result.config || {})});
      setRemoteHealth(result.health || {status: 'not_configured'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy('');
    }
  }, [effectiveStoreId, invoke]);

  useEffect(() => {
    setMessage(null);
    setConfig(initialConfig);
    setSecrets({clientId: '', clientSecret: '', webhookSecret: ''});
    setEditingSecrets({clientId: false, clientSecret: false, webhookSecret: false});
    setMerchants([]);
    loadConfiguration();
  }, [loadConfiguration]);

  useEffect(() => {
    window.localStorage.setItem('ifood-hub-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const orders = useMemo(() => [...(data.ifoodOrders || [])].sort(
    (a, b) => (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0)
  ), [data.ifoodOrders]);
  const productMappings = data.ifoodProductMappings || [];
  const products = data.produtos || [];
  const alerts = [...(data.ifoodAlerts || [])].sort(
    (a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)
  );
  const audit = [...(data.ifoodAudit || [])].sort(
    (a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)
  );
  const health = (data.ifoodHealth || []).find((entry) => entry.id === 'status') || remoteHealth;
  const isOnline = health.status === 'online';
  const storeLabel = storeInfoMap?.[effectiveStoreId]?.nome || effectiveStoreId || selectedStoreId || 'loja';

  const summary = useMemo(() => {
    const current = orders.filter((order) => order.status !== 'Cancelado');
    const active = orders.filter((order) => ['Pendente', 'Em Preparo', 'Pronto', 'Saiu para Entrega'].includes(order.status));
    const pendingSla = active.filter((order) => {
      const created = toDate(order.createdAt);
      return created && Date.now() - created.getTime() > 8 * 60 * 1000 && order.status === 'Pendente';
    }).length;
    const completeTimes = orders.filter((order) => order.status === 'Finalizado').map((order) => {
      const created = toDate(order.createdAt);
      const updated = toDate(order.updatedAt);
      return created && updated ? (updated.getTime() - created.getTime()) / 60000 : null;
    }).filter((minutes) => minutes !== null);
    return {
      novos: orders.filter((order) => order.status === 'Pendente').length,
      preparo: orders.filter((order) => order.status === 'Em Preparo').length,
      finalizados: orders.filter((order) => order.status === 'Finalizado').length,
      cancelados: orders.filter((order) => order.status === 'Cancelado').length,
      revenue: current.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
      sla: pendingSla,
      mean: completeTimes.length ? Math.round(completeTimes.reduce((a, b) => a + b, 0) / completeTimes.length) : 0,
    };
  }, [orders]);

  const mappedProducts = useMemo(() => productMappings.map((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    return {...item, productName: product?.nome || item.productId, quantity: Number(product?.estoque) || 0};
  }), [productMappings, products]);
  const critical = mappedProducts.filter((item) => item.quantity <= 3).length;
  const bestSellers = useMemo(() => {
    const totals = new Map();
    orders.filter((order) => order.status !== 'Cancelado').forEach((order) => {
      (order.items || []).forEach((item) => {
        const name = item.nome || item.name || 'Produto iFood';
        totals.set(name, (totals.get(name) || 0) + (Number(item.quantity || item.quantidade) || 0));
      });
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [orders]);

  const perform = async (busyKey, action, success) => {
    setBusy(busyKey);
    setMessage(null);
    try {
      await action();
      setMessage({type: 'success', text: success});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy('');
    }
  };

  const actionForOrder = (order, action, extra = {}) => perform(
    `${order.id}-${action}`,
    () => invoke('ifoodOrderAction', {orderId: order.iFoodOrderId || order.id, action, ...extra}),
    'Comando enviado ao iFood. O novo status sera refletido pelo proximo evento.'
  );

  const openCancellation = async (order) => {
    setBusy(`reasons-${order.id}`);
    try {
      const result = await invoke('ifoodGetCancellationReasons', {orderId: order.iFoodOrderId || order.id});
      setCancellation({order, reasons: result.reasons || [], reason: ''});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy('');
    }
  };

  const requestCancellation = (event) => {
    event.preventDefault();
    const order = cancellation.order;
    perform('cancellation', async () => {
      await invoke('ifoodOrderAction', {
        orderId: order.iFoodOrderId || order.id,
        action: 'requestCancellation',
        reason: cancellation.reason,
      });
      setCancellation({order: null, reasons: [], reason: ''});
    }, 'Solicitacao de cancelamento enviada. O resultado chegara em evento do iFood.');
  };

  const submitValidation = (event) => {
    event.preventDefault();
    const order = validation.order;
    perform('validation', async () => {
      await invoke('ifoodOrderAction', {
        orderId: order.iFoodOrderId || order.id,
        action: validation.action,
        code: validation.code,
      });
      setValidation({order: null, action: '', code: ''});
    }, validation.action === 'validatePickupCode' ? 'Codigo de coleta validado.' : 'Codigo de entrega validado; acompanhe a conclusao pelo evento iFood.');
  };

  const saveConfiguration = (event) => {
    event.preventDefault();
    perform('config-save', async () => {
      const saved = await invoke('ifoodSaveConfiguration', {...config, ...secrets});
      setConfig({...initialConfig, ...saved});
      setSecrets({clientId: '', clientSecret: '', webhookSecret: ''});
      setEditingSecrets({clientId: false, clientSecret: false, webhookSecret: false});
    }, 'Configuracao salva. Os valores protegidos ficam ocultos na tela e permanecem no Google Secret Manager.');
  };

  const editSecret = (field) => {
    setSecrets((current) => ({...current, [field]: ''}));
    setEditingSecrets((current) => ({...current, [field]: true}));
  };

  const cancelSecretEdit = (field) => {
    setSecrets((current) => ({...current, [field]: ''}));
    setEditingSecrets((current) => ({...current, [field]: false}));
  };

  const editCredentials = () => {
    setSecrets((current) => ({...current, clientId: '', clientSecret: ''}));
    setEditingSecrets((current) => ({...current, clientId: true, clientSecret: true}));
  };

  const cancelCredentialsEdit = () => {
    setSecrets((current) => ({...current, clientId: '', clientSecret: ''}));
    setEditingSecrets((current) => ({...current, clientId: false, clientSecret: false}));
  };

  const loadMerchants = () => perform('merchant-load', async () => {
    const result = await invoke('ifoodLoadMerchants');
    const availableMerchants = result.merchants || [];
    setMerchants(availableMerchants);
    if (availableMerchants.length === 1) {
      setConfig((current) => ({...current, merchantId: availableMerchants[0].id}));
    }
  }, 'Lojas autorizadas localizadas. Confirme o Merchant ID selecionado e salve a configuracao.');

  const saveMapping = (event) => {
    event.preventDefault();
    if (!mapping.productId || !mapping.iFoodProductId) return;
    perform('mapping-save', async () => {
      await invoke('ifoodSaveProductMapping', {...mapping, stockSyncEnabled: true});
      setMapping({productId: '', iFoodProductId: '', externalCode: '', catalogItemId: ''});
    }, 'Produto mapeado e sincronizacao de estoque iniciada.');
  };

  const loadCatalogProducts = () => perform('catalog-load', async () => {
    const result = await invoke('ifoodLoadCatalogProducts');
    setCatalogProducts(result.products || []);
  }, 'Catalogo iFood carregado. Selecione o produto para vincular ao estoque.');

  if (!effectiveStoreId) {
    return (
      <div className="min-h-full bg-gray-50 p-4 sm:p-6">
        <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">iFood Hub</h1>
          <p className="mt-2 text-sm text-gray-600">Escolha uma loja para configurar credenciais, estoque e pedidos do iFood.</p>
          {availableStores.length ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {availableStores.map((storeId) => (
                <button
                  key={storeId}
                  type="button"
                  onClick={() => onSelectStore?.(storeId)}
                  className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-4 text-left transition hover:border-pink-300 hover:bg-pink-50"
                >
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{storeInfoMap?.[storeId]?.nome || storeId}</span>
                    <span className="mt-1 block text-xs text-gray-500">{storeId}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-pink-600" />
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Nenhuma loja cadastrada foi identificada para este usuario.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-full p-4 sm:p-6 ${dark ? 'bg-slate-950 text-slate-100' : 'bg-gray-50 text-gray-900'}`}>
      <header className={`mb-5 flex flex-col justify-between gap-4 rounded-lg border p-5 lg:flex-row lg:items-center ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
        <div>
          <div className="mb-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold">iFood Hub</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${isOnline ? (dark ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700') : (dark ? 'bg-rose-400/15 text-rose-300' : 'bg-rose-50 text-rose-700')}`}>
              {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              API {isOnline ? 'online' : health.status || 'nao configurada'}
            </span>
          </div>
          <p className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Operacao, estoque e pedidos em tempo real para {storeLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button dark={dark} onClick={() => setDark(!dark)}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{dark ? 'Claro' : 'Escuro'}</Button>
          <Button dark={dark} disabled={busy === 'poll'} onClick={() => perform('poll', () => invoke('ifoodPollNow'), 'Eventos consultados e processados.')}>
            <RefreshCw className={`h-4 w-4 ${busy === 'poll' ? 'animate-spin' : ''}`} />Consultar agora
          </Button>
        </div>
      </header>

      {message && (
        <div className={`mb-5 flex items-center gap-2 rounded-lg border p-3 text-sm ${
          message.type === 'success'
            ? (dark ? 'border-emerald-700 bg-emerald-950 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800')
            : (dark ? 'border-rose-800 bg-rose-950 text-rose-200' : 'border-rose-200 bg-rose-50 text-rose-800')
        }`}>
          {message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Metric dark={dark} label="Novos pedidos" value={summary.novos} icon={ShoppingCart} tone={dark ? 'bg-amber-400/15 text-amber-300' : 'bg-amber-50 text-amber-600'} />
        <Metric dark={dark} label="Em preparo" value={summary.preparo} icon={Clock} tone={dark ? 'bg-sky-400/15 text-sky-300' : 'bg-sky-50 text-sky-600'} />
        <Metric dark={dark} label="Concluidos" value={summary.finalizados} icon={CheckCircle} tone={dark ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-50 text-emerald-600'} />
        <Metric dark={dark} label="Faturamento" value={money(summary.revenue)} icon={DollarSign} tone={dark ? 'bg-teal-400/15 text-teal-300' : 'bg-teal-50 text-teal-600'} />
        <Metric dark={dark} label="Tempo medio" value={`${summary.mean} min`} icon={Clock} tone={dark ? 'bg-indigo-400/15 text-indigo-300' : 'bg-indigo-50 text-indigo-600'} />
        <Metric dark={dark} label="Alertas SLA" value={summary.sla} icon={AlertTriangle} tone={dark ? 'bg-rose-400/15 text-rose-300' : 'bg-rose-50 text-rose-600'} />
        <Metric dark={dark} label="Cancelados" value={summary.cancelados} icon={AlertTriangle} tone={dark ? 'bg-orange-400/15 text-orange-300' : 'bg-orange-50 text-orange-600'} />
        <Metric dark={dark} label="Estoque critico" value={critical} icon={Package} tone={dark ? 'bg-fuchsia-400/15 text-fuchsia-300' : 'bg-fuchsia-50 text-fuchsia-600'} />
      </section>

      <nav className={`mb-5 flex gap-1 overflow-x-auto rounded-lg border p-1 ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
        {tabs.map(({id, label, icon: Icon}) => (
          <button key={id} onClick={() => setTab(id)} className={`flex h-10 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors ${
            tab === id ? 'bg-pink-600 text-white' : (dark ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-50')
          }`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </nav>

      {tab === 'operacao' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className={`overflow-hidden rounded-lg border ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
            <div className={`flex items-center justify-between border-b p-4 ${dark ? 'border-slate-800' : 'border-gray-100'}`}>
              <h2 className="font-semibold">Fila operacional</h2>
              <span className={`text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{orders.length} pedidos recebidos</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className={dark ? 'text-slate-400' : 'bg-gray-50 text-gray-500'}>
                  <tr><th className="px-4 py-3 text-left font-medium">Pedido</th><th className="px-4 py-3 text-left font-medium">Cliente</th><th className="px-4 py-3 text-left font-medium">Status</th><th className="px-4 py-3 text-left font-medium">Total</th><th className="px-4 py-3 text-right font-medium">Acao</th></tr>
                </thead>
                <tbody>
                  {orders.slice(0, 30).map((order) => (
                    <tr key={order.id} className={`border-t ${dark ? 'border-slate-800' : 'border-gray-100'}`}>
                      <td className="px-4 py-3"><p className="font-medium">#{order.displayId || order.iFoodOrderId || order.id}</p><p className={`text-xs ${dark ? 'text-slate-500' : 'text-gray-400'}`}>{dateTime(order.createdAt)}</p></td>
                      <td className="px-4 py-3">{order.customerName || 'Cliente iFood'}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(order.status, dark)}`}>{order.status}</span></td>
                      <td className="px-4 py-3 font-medium">{money(order.total)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {order.externalStatus === 'PLACED' && <Button dark={dark} disabled={busy !== ''} onClick={() => actionForOrder(order, 'confirm')}>Confirmar</Button>}
                          {order.externalStatus === 'CONFIRMED' && <Button dark={dark} disabled={busy !== ''} onClick={() => actionForOrder(order, 'startPreparation')}>Preparar</Button>}
                          {order.externalStatus === 'PREPARATION_STARTED' && String(order.orderType).toUpperCase() === 'DELIVERY' && <Button dark={dark} disabled={busy !== ''} onClick={() => actionForOrder(order, 'dispatch', {deliveredBy: 'MERCHANT'})}><Truck className="h-4 w-4" />Despachar</Button>}
                          {order.externalStatus === 'PREPARATION_STARTED' && String(order.orderType).toUpperCase() !== 'DELIVERY' && <Button dark={dark} disabled={busy !== ''} onClick={() => actionForOrder(order, 'readyToPickup')}>Pronto</Button>}
                          {order.externalStatus === 'READY_TO_PICKUP' && <Button dark={dark} disabled={busy !== ''} onClick={() => setValidation({order, action: 'validatePickupCode', code: ''})}>Validar coleta</Button>}
                          {order.externalStatus === 'DISPATCHED' && <Button dark={dark} disabled={busy !== ''} onClick={() => setValidation({order, action: 'verifyDeliveryCode', code: ''})}>Validar entrega</Button>}
                          {!['CONCLUDED', 'CANCELLED'].includes(order.externalStatus) && <Button dark={dark} disabled={busy !== ''} onClick={() => openCancellation(order)}>Cancelar</Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!orders.length && <tr><td colSpan="5" className={`px-4 py-10 text-center ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Nenhum evento de pedido recebido ainda.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <aside className={`rounded-lg border p-4 ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Alertas</h2>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${alerts.length ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{alerts.length}</span>
            </div>
            <div className="space-y-3">
              {alerts.slice(0, 8).map((alert) => (
                <div key={alert.id} className={`rounded-lg border p-3 text-sm ${dark ? 'border-slate-800 bg-slate-950' : 'border-gray-100 bg-gray-50'}`}>
                  <p className="font-medium">{alert.type || 'Falha de sincronizacao'}</p>
                  <p className={`mt-1 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{alert.message}</p>
                  <p className={`mt-2 text-xs ${dark ? 'text-slate-500' : 'text-gray-400'}`}>{dateTime(alert.createdAt)}</p>
                </div>
              ))}
              {!alerts.length && <p className={`py-8 text-center text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Operacao sem alertas ativos.</p>}
            </div>
            <div className={`mt-5 border-t pt-4 ${dark ? 'border-slate-800' : 'border-gray-100'}`}>
              <h2 className="mb-3 font-semibold">Mais vendidos</h2>
              <div className="space-y-3">
                {bestSellers.map(([name, quantity], index) => (
                  <div key={name} className="flex items-center justify-between gap-3 text-sm">
                    <span className={dark ? 'text-slate-300' : 'text-gray-700'}>{index + 1}. {name}</span>
                    <span className="font-medium">{quantity} un.</span>
                  </div>
                ))}
                {!bestSellers.length && <p className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Sem vendas processadas.</p>}
              </div>
            </div>
          </aside>
        </div>
      )}

      {tab === 'catalogo' && (
        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <form onSubmit={saveMapping} className={`space-y-4 rounded-lg border p-5 ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
            <h2 className="font-semibold">Mapear produto</h2>
            <Button dark={dark} disabled={busy === 'catalog-load'} onClick={loadCatalogProducts}>
              <RefreshCw className={`h-4 w-4 ${busy === 'catalog-load' ? 'animate-spin' : ''}`} />Importar catalogo iFood
            </Button>
            <Field dark={dark} label="Produto interno">
              <select className={inputClass(dark)} value={mapping.productId} onChange={(event) => setMapping({...mapping, productId: event.target.value})} required>
                <option value="">Selecione</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.nome} ({Number(product.estoque) || 0})</option>)}
              </select>
            </Field>
            {catalogProducts.length > 0 ? (
              <Field dark={dark} label="Produto no catalogo iFood">
                <select className={inputClass(dark)} value={mapping.catalogItemId} onChange={(event) => {
                  const selected = catalogProducts.find((product) => product.itemId === event.target.value);
                  setMapping({
                    ...mapping,
                    catalogItemId: selected?.itemId || '',
                    iFoodProductId: selected?.productId || '',
                    externalCode: selected?.externalCode || '',
                  });
                }} required>
                  <option value="">Selecione</option>
                  {catalogProducts.map((product) => (
                    <option key={product.itemId} value={product.itemId}>{product.name} - {product.categoryName}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field dark={dark} label="ID do produto no iFood"><input className={inputClass(dark)} value={mapping.iFoodProductId} onChange={(event) => setMapping({...mapping, iFoodProductId: event.target.value})} required /></Field>
            )}
            <Field dark={dark} label="Codigo externo (opcional)"><input className={inputClass(dark)} value={mapping.externalCode} onChange={(event) => setMapping({...mapping, externalCode: event.target.value})} /></Field>
            <Button type="submit" primary disabled={busy === 'mapping-save'}><Save className="h-4 w-4" />Salvar mapeamento</Button>
          </form>
          <section className={`overflow-hidden rounded-lg border ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
            <div className={`flex items-center justify-between border-b p-4 ${dark ? 'border-slate-800' : 'border-gray-100'}`}>
              <h2 className="font-semibold">Estoque publicado</h2>
              <div className="flex items-center gap-3 text-sm"><span className={dark ? 'text-slate-400' : 'text-gray-500'}>{mappedProducts.length} vinculados</span><span className="text-rose-600">{critical} criticos</span></div>
            </div>
            {mappedProducts.map((item) => (
              <div key={item.id} className={`grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b px-4 py-3 text-sm ${dark ? 'border-slate-800' : 'border-gray-100'}`}>
                <div><p className="font-medium">{item.productName}</p><p className={dark ? 'text-slate-400' : 'text-gray-500'}>{item.iFoodProductId}</p></div>
                <span className={`font-semibold ${item.quantity <= 3 ? 'text-rose-500' : 'text-emerald-600'}`}>{item.quantity} un.</span>
                <span className={`rounded-full px-2 py-1 text-xs ${item.syncStatus === 'synced' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.syncStatus || 'pendente'}</span>
              </div>
            ))}
            {!mappedProducts.length && <p className={`p-10 text-center text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Mapeie produtos para ativar estoque bidirecional.</p>}
            <div className="p-4">
              <Button dark={dark} disabled={busy === 'sync'} onClick={() => perform('sync', () => invoke('ifoodSyncStockNow'), 'Sincronizacao de estoque solicitada.')}>
                <RefreshCw className={`h-4 w-4 ${busy === 'sync' ? 'animate-spin' : ''}`} />Reconciliar estoque
              </Button>
            </div>
          </section>
        </div>
      )}

      {tab === 'configuracao' && (
        <form onSubmit={saveConfiguration} className={`space-y-6 rounded-lg border p-5 ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-semibold">Conexao oficial iFood Developer</h2><p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Credenciais e webhook sao armazenados como segredos independentes para esta loja.</p></div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${config.credentialsReady ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{config.credentialsReady ? 'Credenciais protegidas' : 'Credenciais pendentes'}</span>
          </div>
          {config.credentialsReady && !config.merchantId && (
            <div className={`rounded-lg border p-4 text-sm ${dark ? 'border-amber-700/50 bg-amber-400/10 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              Suas credenciais ja foram armazenadas. Use <strong>Localizar lojas iFood</strong> para selecionar o Merchant ID autorizado e concluir a configuracao.
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <Field dark={dark} label="Merchant ID" hint="Identificador da loja no iFood; nao e o CNPJ nem o Client ID.">
              <input className={inputClass(dark)} placeholder="Selecione ou informe o Merchant ID" value={config.merchantId} onChange={(event) => setConfig({...config, merchantId: event.target.value})} />
              <Button dark={dark} disabled={!config.credentialsReady || busy === 'merchant-load'} onClick={loadMerchants}>
                <Search className={`h-4 w-4 ${busy === 'merchant-load' ? 'animate-pulse' : ''}`} />Localizar lojas iFood
              </Button>
              {merchants.length > 0 && (
                <select className={inputClass(dark)} value={config.merchantId} onChange={(event) => setConfig({...config, merchantId: event.target.value})}>
                  <option value="">Selecione a loja autorizada</option>
                  {merchants.map((merchant) => (
                    <option key={merchant.id} value={merchant.id}>{merchant.name || merchant.corporateName || merchant.id}</option>
                  ))}
                </select>
              )}
            </Field>
            <ProtectedSecretField dark={dark} label="Client ID" stored={config.credentialsReady} editing={editingSecrets.clientId} value={secrets.clientId} onChange={(value) => setSecrets({...secrets, clientId: value})} onEdit={editCredentials} onCancel={cancelCredentialsEdit} />
            <ProtectedSecretField dark={dark} label="Client Secret" stored={config.credentialsReady} editing={editingSecrets.clientSecret} value={secrets.clientSecret} onChange={(value) => setSecrets({...secrets, clientSecret: value})} onEdit={editCredentials} onCancel={cancelCredentialsEdit} />
            <Field dark={dark} label="API base URL"><input className={inputClass(dark)} value={config.apiBaseUrl} onChange={(event) => setConfig({...config, apiBaseUrl: event.target.value})} /></Field>
            <Field dark={dark} label="URL de autenticacao"><input className={inputClass(dark)} value={config.authUrl} onChange={(event) => setConfig({...config, authUrl: event.target.value})} /></Field>
            <ProtectedSecretField dark={dark} label="Segredo de webhook futuro" stored={config.webhookSecretReady} editing={editingSecrets.webhookSecret} value={secrets.webhookSecret} onChange={(value) => setSecrets({...secrets, webhookSecret: value})} onEdit={() => editSecret('webhookSecret')} onCancel={() => cancelSecretEdit('webhookSecret')} emptyHint="Deixe vazio enquanto utilizar polling." />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium">Automacao operacional</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Toggle dark={dark} label="Integracao ativa" checked={config.enabled} onChange={(value) => setConfig({...config, enabled: value})} />
              <Toggle dark={dark} label="Polling automatico" checked={config.pollingEnabled} onChange={(value) => setConfig({...config, pollingEnabled: value})} />
              <Toggle dark={dark} label="Confirmar pedidos" checked={config.autoConfirm} onChange={(value) => setConfig({...config, autoConfirm: value})} />
              <Toggle dark={dark} label="Iniciar preparo" checked={config.autoStartPreparation} onChange={(value) => setConfig({...config, autoStartPreparation: value})} />
              <Toggle dark={dark} label="Webhook homologado" checked={config.webhookEnabled} onChange={(value) => setConfig({...config, webhookEnabled: value})} />
            </div>
          </div>
          <div className={`rounded-lg border p-4 ${dark ? 'border-slate-800 bg-slate-950' : 'border-gray-100 bg-gray-50'}`}>
            <h3 className="mb-3 text-sm font-medium">Inventario oficial do Catalog v2.0</h3>
            <div className="grid gap-4 lg:grid-cols-[120px_1fr]">
              <Field dark={dark} label="Metodo">
                <select className={inputClass(dark)} value={config.inventoryMethod} onChange={(event) => setConfig({...config, inventoryMethod: event.target.value})}>
                  <option>POST</option><option>PATCH</option><option>PUT</option>
                </select>
              </Field>
              <Field dark={dark} label="Endpoint alternativo (opcional)">
                <input className={inputClass(dark)} placeholder="/catalog/v2.0/merchants/{merchantId}/inventory" value={config.inventoryEndpointTemplate} onChange={(event) => setConfig({...config, inventoryEndpointTemplate: event.target.value})} />
              </Field>
            </div>
            <p className={`mt-3 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Sem endpoint alternativo, o sistema publica automaticamente em /catalog/v2.0/merchants/{'{merchantId}'}/inventory com productId e quantity.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" primary disabled={busy === 'config-save'}><Save className="h-4 w-4" />Salvar configuracao</Button>
            <Button dark={dark} disabled={!config.credentialsReady || busy === 'test'} onClick={() => perform('test', () => invoke('ifoodTestConnection'), 'Autenticacao iFood validada com sucesso.')}>
              <ArrowRight className="h-4 w-4" />Testar conexao
            </Button>
          </div>
        </form>
      )}

      {tab === 'auditoria' && (
        <section className={`overflow-hidden rounded-lg border ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
          <div className={`border-b p-4 ${dark ? 'border-slate-800' : 'border-gray-100'}`}><h2 className="font-semibold">Trilha de eventos e comandos</h2></div>
          {audit.slice(0, 100).map((entry) => (
            <div key={entry.id} className={`grid gap-2 border-b px-4 py-3 text-sm md:grid-cols-[190px_210px_1fr] ${dark ? 'border-slate-800' : 'border-gray-100'}`}>
              <span className={dark ? 'text-slate-400' : 'text-gray-500'}>{dateTime(entry.createdAt)}</span>
              <span className="font-medium">{entry.action}</span>
              <span className={dark ? 'text-slate-400' : 'text-gray-500'}>{entry.details?.message || entry.details?.orderId || entry.severity || '-'}</span>
            </div>
          ))}
          {!audit.length && <p className={`p-10 text-center text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Eventos processados e comandos aparecerao aqui.</p>}
        </section>
      )}

      {cancellation.order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={requestCancellation} className={`w-full max-w-md rounded-lg border p-5 shadow-xl ${dark ? 'border-slate-700 bg-slate-900' : 'border-gray-100 bg-white'}`}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Solicitar cancelamento</h2>
                <p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Pedido #{cancellation.order.displayId || cancellation.order.iFoodOrderId}</p>
              </div>
              <button type="button" onClick={() => setCancellation({order: null, reasons: [], reason: ''})} className={`rounded-md p-2 ${dark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`} aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>
            <Field dark={dark} label="Motivo autorizado pelo iFood">
              <select required className={inputClass(dark)} value={cancellation.reason} onChange={(event) => setCancellation({...cancellation, reason: event.target.value})}>
                <option value="">Selecione um motivo</option>
                {cancellation.reasons.map((reason) => <option key={reason.code} value={reason.code}>{reason.code} - {reason.description}</option>)}
              </select>
            </Field>
            <div className="mt-5 flex justify-end gap-2">
              <Button dark={dark} onClick={() => setCancellation({order: null, reasons: [], reason: ''})}>Voltar</Button>
              <Button type="submit" primary disabled={busy === 'cancellation'}>Confirmar solicitacao</Button>
            </div>
          </form>
        </div>
      )}

      {validation.order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={submitValidation} className={`w-full max-w-md rounded-lg border p-5 shadow-xl ${dark ? 'border-slate-700 bg-slate-900' : 'border-gray-100 bg-white'}`}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{validation.action === 'validatePickupCode' ? 'Validar coleta' : 'Validar entrega'}</h2>
                <p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Pedido #{validation.order.displayId || validation.order.iFoodOrderId}</p>
              </div>
              <button type="button" onClick={() => setValidation({order: null, action: '', code: ''})} className={`rounded-md p-2 ${dark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`} aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>
            <Field dark={dark} label="Codigo informado pelo entregador">
              <input required className={inputClass(dark)} value={validation.code} onChange={(event) => setValidation({...validation, code: event.target.value})} />
            </Field>
            <div className="mt-5 flex justify-end gap-2">
              <Button dark={dark} onClick={() => setValidation({order: null, action: '', code: ''})}>Voltar</Button>
              <Button type="submit" primary disabled={busy === 'validation'}>Validar codigo</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
