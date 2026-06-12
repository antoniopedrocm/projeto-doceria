import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  merchantName: '',
  enabled: false,
  pollingEnabled: true,
  ordersSyncEnabled: true,
  stockSyncEnabled: true,
  catalogSyncEnabled: true,
  autoConfirm: true,
  autoStartPreparation: false,
  credentialsReady: false,
  platformCredentialsReady: false,
  credentialScope: '',
  platformWebhookSecretReady: false,
};

const initialPlatformConfig = {
  environment: 'production',
  apiBaseUrl: 'https://openapi.didi-food.com',
  authUrl: 'https://openapi.didi-food.com',
  webhookUrl: '',
  webhookEnabled: false,
  inventoryEndpointTemplate: '',
  inventoryMethod: 'POST',
  credentialsReady: false,
  clientIdReady: false,
  clientSecretReady: false,
  webhookSecretReady: false,
  clientIdMasked: '',
  clientSecretMasked: '',
  webhookSecretMasked: '',
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

const catalogSelectionKey = (item = {}) => String(
  item.itemId
  || item.productId
  || item.externalCode
  || item.name
  || ''
).trim();

const catalogProductPayload = (item = {}) => ({
  itemId: item.itemId || '',
  productId: item.productId || '',
  externalCode: item.externalCode || '',
  productExternalCode: item.productExternalCode || '',
  name: item.name || '',
  description: item.description || '',
  categoryId: item.categoryId || '',
  categoryName: item.categoryName || '',
  status: item.status ?? 1,
  price: Number(item.price) || 0,
  imageUrl: item.imageUrl || '',
});

const normalizeLookupText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const productCategoryKeys = (product = {}) => [
  product.subcategoria,
  product.categoria,
  product.categoryName,
].map(normalizeLookupText).filter(Boolean);

const catalogStatus = (item = {}) => {
  const linked = item.linked || {};
  if (linked.syncStatus === 'error' || linked.publishStatus === 'error' || linked.syncError || linked.publishError) {
    return {id: 'sync_error', label: 'Erro de sincronizacao'};
  }
  if (!item.linked) return {id: 'not_imported', label: 'Nao importado'};
  if (linked.importedFrom99Food && (
    linked.importStatus === 'imported_waiting_review'
    || linked.stockSyncEnabled === false
    || linked.syncStatus === 'waiting_internal_stock_review'
  )) {
    return {id: 'imported_waiting_link', label: 'Importado aguardando vinculo'};
  }
  return {id: 'linked', label: `Vinculado${item.linkedProductName ? ` a ${item.linkedProductName}` : ''}`};
};

const catalogStatusClass = (statusId, dark) => {
  const map = {
    linked: dark ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700',
    not_imported: dark ? 'bg-amber-400/15 text-amber-300' : 'bg-amber-50 text-amber-700',
    imported_waiting_link: dark ? 'bg-sky-400/15 text-sky-300' : 'bg-sky-50 text-sky-700',
    sync_error: dark ? 'bg-rose-400/15 text-rose-300' : 'bg-rose-50 text-rose-700',
  };
  return map[statusId] || map.not_imported;
};

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

export default function Food99Hub({data, effectiveStoreId, selectedStoreId, availableStores = [], storeInfoMap, onSelectStore, currentUser}) {
  const [tab, setTab] = useState('operacao');
  const [dark, setDark] = useState(() => window.localStorage.getItem('99Food-hub-theme') === 'dark');
  const mappingPanelRef = useRef(null);
  const [config, setConfig] = useState(initialConfig);
  const [platformConfig, setPlatformConfig] = useState(initialPlatformConfig);
  const [platformSecrets, setPlatformSecrets] = useState({clientId: '', clientSecret: '', webhookSecret: ''});
  const [editingPlatformSecrets, setEditingPlatformSecrets] = useState({clientId: false, clientSecret: false, webhookSecret: false});
  const [remoteHealth, setRemoteHealth] = useState({status: 'not_configured'});
  const [merchants, setMerchants] = useState([]);
  const [mappingPanelOpen, setMappingPanelOpen] = useState(false);
  const [mapping, setMapping] = useState({productId: '', food99ProductId: '', externalCode: '', catalogItemId: ''});
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCatalogKeys, setSelectedCatalogKeys] = useState([]);
  const [bulkImportResult, setBulkImportResult] = useState(null);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [cancellation, setCancellation] = useState({order: null, reasons: [], reason: ''});
  const [validation, setValidation] = useState({order: null, action: '', code: ''});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const isPlatformAdmin = currentUser?.role === 'dono' && currentUser?.canAccessAllStores;

  const invoke = useCallback(async (name, payload = {}) => {
    if (!effectiveStoreId) throw new Error('Selecione uma loja especifica para operar o 99Food.');
    const response = await httpsCallable(functions, name)({lojaId: effectiveStoreId, ...payload});
    return response.data;
  }, [effectiveStoreId]);

  const invokePlatform = useCallback(async (name, payload = {}) => {
    const response = await httpsCallable(functions, name)(payload);
    return response.data;
  }, []);

  const loadConfiguration = useCallback(async () => {
    if (!effectiveStoreId) return;
    setBusy('configuration-load');
    try {
      const result = await invoke('food99GetConfiguration');
      setConfig({...initialConfig, ...(result.config || {})});
      setPlatformConfig({...initialPlatformConfig, ...(result.platform || {})});
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
    setPlatformConfig(initialPlatformConfig);
    setPlatformSecrets({clientId: '', clientSecret: '', webhookSecret: ''});
    setEditingPlatformSecrets({clientId: false, clientSecret: false, webhookSecret: false});
    setMerchants([]);
    setSelectedProductIds([]);
    setSelectedCatalogKeys([]);
    setBulkImportResult(null);
    setMappingPanelOpen(false);
    setMapping({productId: '', food99ProductId: '', externalCode: '', catalogItemId: ''});
    loadConfiguration();
  }, [loadConfiguration]);

  useEffect(() => {
    window.localStorage.setItem('99Food-hub-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    const availableKeys = new Set(catalogProducts.map(catalogSelectionKey).filter(Boolean));
    setSelectedCatalogKeys((current) => current.filter((key) => availableKeys.has(key)));
  }, [catalogProducts]);

  const orders = useMemo(() => [...(data.food99Orders || [])].sort(
    (a, b) => (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0)
  ), [data.food99Orders]);
  const productMappings = data.food99ProductMappings || [];
  const products = data.produtos || [];
  const alerts = [...(data.food99Alerts || [])]
    .filter((alert) => !['resolved', 'closed'].includes(String(alert.status || '').toLowerCase()))
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
  const audit = [...(data.food99Audit || [])].sort(
    (a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)
  );
  const health = (data.food99Health || []).find((entry) => entry.id === 'status') || remoteHealth;
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
    return {...item, productName: product?.nome || item.productId, quantity: Number(product?.estoque) || 0, product};
  }), [productMappings, products]);
  const mappingByProductId = useMemo(() => new Map(productMappings.map((item) => [item.productId, item])), [productMappings]);
  const catalogRowsAll = useMemo(() => catalogProducts.map((catalog) => {
      const linked = productMappings.find((mappingItem) => (
        mappingItem.food99ProductId === catalog.productId
        || mappingItem.catalogItemId === catalog.itemId
        || (catalog.externalCode && mappingItem.externalCode === catalog.externalCode)
      ));
      const product = linked ? products.find((candidate) => candidate.id === linked.productId) : null;
      return {
        ...catalog,
        selectionKey: catalogSelectionKey(catalog),
        linked,
        product,
        linkedProductName: product?.nome || linked?.productId || '',
      };
    }), [catalogProducts, productMappings, products]);
  const catalogRows = useMemo(() => {
    const search = catalogSearch.trim().toLowerCase();
    return catalogRowsAll.filter((row) => {
      if (!search) return true;
      return [
        row.name,
        row.description,
        row.categoryName,
        row.externalCode,
        row.productId,
        row.itemId,
        row.linkedProductName,
      ].some((value) => String(value || '').toLowerCase().includes(search));
    });
  }, [catalogRowsAll, catalogSearch]);
  const suggestInternalProductForCatalog = useCallback((catalogProduct = {}) => {
    const linkedProduct = catalogProduct.linked?.productId
      ? products.find((product) => product.id === catalogProduct.linked.productId)
      : null;
    const linkedProductIsImported = linkedProduct?.food99Imported || linkedProduct?.origem === '99Food';
    if (linkedProduct && !linkedProductIsImported) return linkedProduct.id;

    const catalogNameKey = normalizeLookupText(catalogProduct.name);
    const catalogCategoryKey = normalizeLookupText(catalogProduct.categoryName);
    const nameMatches = products.filter((product) => normalizeLookupText(product.nome) === catalogNameKey);
    const categoryMatches = catalogCategoryKey
      ? nameMatches.filter((product) => productCategoryKeys(product).includes(catalogCategoryKey))
      : [];
    const candidates = categoryMatches.length ? categoryMatches : nameMatches;
    if (!candidates.length) return linkedProduct?.id || '';

    const [bestMatch] = [...candidates].sort((a, b) => {
      const importedA = a.food99Imported || a.origem === '99Food' ? 1 : 0;
      const importedB = b.food99Imported || b.origem === '99Food' ? 1 : 0;
      if (importedA !== importedB) return importedA - importedB;
      const inactiveA = String(a.status || '').toLowerCase() === 'inativo' ? 1 : 0;
      const inactiveB = String(b.status || '').toLowerCase() === 'inativo' ? 1 : 0;
      if (inactiveA !== inactiveB) return inactiveA - inactiveB;
      return (Number(b.estoque) || 0) - (Number(a.estoque) || 0);
    });
    return bestMatch?.id || linkedProduct?.id || '';
  }, [products]);
  const selectedMappingCatalogProduct = useMemo(() => catalogProducts.find((product) => (
    product.itemId === mapping.catalogItemId
    || product.productId === mapping.food99ProductId
    || (mapping.externalCode && product.externalCode === mapping.externalCode)
  )), [catalogProducts, mapping.catalogItemId, mapping.externalCode, mapping.food99ProductId]);
  const selectedCatalogKeySet = useMemo(() => new Set(selectedCatalogKeys), [selectedCatalogKeys]);
  const catalogPageRows = catalogRows;
  const catalogPageKeys = useMemo(() => catalogPageRows.map((item) => item.selectionKey).filter(Boolean), [catalogPageRows]);
  const catalogFilteredKeys = useMemo(() => catalogRows.map((item) => item.selectionKey).filter(Boolean), [catalogRows]);
  const selectedCatalogRows = useMemo(() => catalogRowsAll.filter((item) => selectedCatalogKeySet.has(item.selectionKey)), [catalogRowsAll, selectedCatalogKeySet]);
  const selectedVisibleCatalogCount = useMemo(() => catalogRows.filter((item) => selectedCatalogKeySet.has(item.selectionKey)).length, [catalogRows, selectedCatalogKeySet]);
  const allPageSelected = catalogPageKeys.length > 0 && catalogPageKeys.every((key) => selectedCatalogKeySet.has(key));
  const allFilteredSelected = catalogFilteredKeys.length > 0 && catalogFilteredKeys.every((key) => selectedCatalogKeySet.has(key));
  const selectionLabel = `${selectedCatalogKeys.length} ${selectedCatalogKeys.length === 1 ? 'produto selecionado' : 'produtos selecionados'}`;
  const syncedProducts = useMemo(() => mappedProducts.filter((item) => (
    item.catalogManaged || item.syncStatus === 'synced' || item.lastSyncAt || item.importedFrom99Food
  )), [mappedProducts]);
  const productsReadyFor99Food = products.filter((product) => Number(product.preco99Food) > 0);
  const critical = mappedProducts.filter((item) => item.quantity <= 3).length;
  const bestSellers = useMemo(() => {
    const totals = new Map();
    orders.filter((order) => order.status !== 'Cancelado').forEach((order) => {
      (order.items || []).forEach((item) => {
        const name = item.nome || item.name || 'Produto 99Food';
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
    () => invoke('food99OrderAction', {orderId: order.food99OrderId || order.id, action, ...extra}),
    'Comando enviado ao 99Food. O novo status sera refletido pelo proximo evento.'
  );

  const openCancellation = async (order) => {
    setBusy(`reasons-${order.id}`);
    try {
      const result = await invoke('food99GetCancellationReasons', {orderId: order.food99OrderId || order.id});
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
      await invoke('food99OrderAction', {
        orderId: order.food99OrderId || order.id,
        action: 'requestCancellation',
        reason: cancellation.reason,
      });
      setCancellation({order: null, reasons: [], reason: ''});
    }, 'Solicitacao de cancelamento enviada. O resultado chegara em evento do 99Food.');
  };

  const submitValidation = (event) => {
    event.preventDefault();
    const order = validation.order;
    perform('validation', async () => {
      await invoke('food99OrderAction', {
        orderId: order.food99OrderId || order.id,
        action: validation.action,
        code: validation.code,
      });
      setValidation({order: null, action: '', code: ''});
    }, validation.action === 'validatePickupCode' ? 'Codigo de coleta validado.' : 'Codigo de entrega validado; acompanhe a conclusao pelo evento 99Food.');
  };

  const saveConfiguration = (event) => {
    event.preventDefault();
    perform('config-save', async () => {
      const saved = await invoke('food99SaveConfiguration', {
        merchantId: config.merchantId,
        merchantName: config.merchantName,
        enabled: config.enabled,
        pollingEnabled: config.pollingEnabled,
        ordersSyncEnabled: config.ordersSyncEnabled,
        stockSyncEnabled: config.stockSyncEnabled,
        catalogSyncEnabled: config.catalogSyncEnabled,
        autoConfirm: config.autoConfirm,
        autoStartPreparation: config.autoStartPreparation,
      });
      setConfig({...initialConfig, ...saved});
    }, 'Configuracao da loja salva. O app_shop_id e as sincronizacoes desta unidade foram atualizados.');
  };

  const savePlatformConfiguration = (event) => {
    event.preventDefault();
    perform('platform-save', async () => {
      const saved = await invokePlatform('food99SavePlatformConfiguration', {
        environment: platformConfig.environment,
        apiBaseUrl: platformConfig.apiBaseUrl,
        authUrl: platformConfig.authUrl,
        webhookUrl: platformConfig.webhookUrl,
        webhookEnabled: platformConfig.webhookEnabled,
        inventoryEndpointTemplate: platformConfig.inventoryEndpointTemplate,
        inventoryMethod: platformConfig.inventoryMethod,
        ...platformSecrets,
      });
      setPlatformConfig({...initialPlatformConfig, ...(saved.platform || {})});
      setPlatformSecrets({clientId: '', clientSecret: '', webhookSecret: ''});
      setEditingPlatformSecrets({clientId: false, clientSecret: false, webhookSecret: false});
      await loadConfiguration();
    }, 'Configuracao global 99Food salva. Segredos seguem protegidos no Google Secret Manager.');
  };

  const editSecret = (field) => {
    setPlatformSecrets((current) => ({...current, [field]: ''}));
    setEditingPlatformSecrets((current) => ({...current, [field]: true}));
  };

  const cancelSecretEdit = (field) => {
    setPlatformSecrets((current) => ({...current, [field]: ''}));
    setEditingPlatformSecrets((current) => ({...current, [field]: false}));
  };

  const editCredentials = () => {
    setPlatformSecrets((current) => ({...current, clientId: '', clientSecret: ''}));
    setEditingPlatformSecrets((current) => ({...current, clientId: true, clientSecret: true}));
  };

  const cancelCredentialsEdit = () => {
    setPlatformSecrets((current) => ({...current, clientId: '', clientSecret: ''}));
    setEditingPlatformSecrets((current) => ({...current, clientId: false, clientSecret: false}));
  };

  const loadMerchants = () => perform('merchant-load', async () => {
    const result = await invoke('food99LoadMerchants');
    const availableMerchants = result.merchants || [];
    setMerchants(availableMerchants);
    if (availableMerchants.length === 1) {
      setConfig((current) => ({...current, merchantId: availableMerchants[0].id, merchantName: availableMerchants[0].name || availableMerchants[0].corporateName || ''}));
    }
  }, 'Dados da loja 99Food carregados. Confirme o app_shop_id e salve a configuracao.');

  const promoteStoredCredentials = () => perform('credential-promote', async () => {
    const promoted = await invoke('food99PromoteStoredCredentials');
    setConfig({...initialConfig, ...promoted});
  }, 'Credencial central ativada. Novas lojas precisarao apenas informar seu app_shop_id.');

  const handleMerchantSelect = (merchantId) => {
    const selected = merchants.find((merchant) => merchant.id === merchantId);
    setConfig({
      ...config,
      merchantId,
      merchantName: selected?.name || selected?.corporateName || config.merchantName || '',
    });
  };

  const toggleProductSelection = (productId) => {
    setSelectedProductIds((current) => (
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    ));
  };

  const setCatalogSelection = (keys, selected) => {
    const cleanKeys = keys.map(String).map((key) => key.trim()).filter(Boolean);
    setSelectedCatalogKeys((current) => {
      const next = new Set(current);
      cleanKeys.forEach((key) => {
        if (selected) next.add(key);
        else next.delete(key);
      });
      return [...next];
    });
  };

  const toggleCatalogSelection = (key) => {
    if (!key) return;
    setSelectedCatalogKeys((current) => (
      current.includes(key)
        ? current.filter((itemKey) => itemKey !== key)
        : [...current, key]
    ));
  };

  const clearCatalogSelection = () => {
    setSelectedCatalogKeys([]);
  };

  const publishProducts = async (productIds) => {
    setBusy('catalog-publish');
    setMessage(null);
    try {
      const result = await invoke('food99PublishProducts', {productIds});
      if (result.failed) {
        const firstError = result.results?.find((item) => !item.ok)?.error || 'Consulte a auditoria.';
        setMessage({type: 'error', text: `${result.published} publicado(s), ${result.failed} com falha. ${firstError}`});
      } else {
        setMessage({type: 'success', text: `${result.published} produto(s) publicado(s) no 99Food com estoque sincronizado.`});
        setSelectedProductIds([]);
      }
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy('');
    }
  };

  const saveMapping = (event) => {
    event.preventDefault();
    if (!mapping.productId || !mapping.food99ProductId) return;
    perform('mapping-save', async () => {
      const selectedCatalogProduct = catalogProducts.find((product) => (
        product.itemId === mapping.catalogItemId
        || product.productId === mapping.food99ProductId
        || (mapping.externalCode && product.externalCode === mapping.externalCode)
      ));
      await invoke('food99SaveProductMapping', {
        ...mapping,
        ...(selectedCatalogProduct ? {catalogProduct: catalogProductPayload(selectedCatalogProduct)} : {}),
        stockSyncEnabled: true,
      });
      setMapping({productId: '', food99ProductId: '', externalCode: '', catalogItemId: ''});
    }, 'Produto mapeado e sincronizacao de estoque iniciada.');
  };

  const loadCatalogProducts = async () => {
    setBusy('catalog-load');
    setMessage(null);
    try {
      const result = await invoke('food99LoadCatalogProducts');
      setCatalogProducts(result.products || []);
      if (result.stale) {
        setMessage({
          type: 'warning',
          text: result.warning || 'A 99Food limitou novas consultas. Exibindo o ultimo catalogo carregado.',
        });
      } else if (result.fromCache) {
        setMessage({type: 'success', text: 'Catalogo 99Food carregado do cache recente.'});
      } else {
        setMessage({type: 'success', text: 'Catalogo 99Food carregado. Selecione o produto para vincular ao estoque.'});
      }
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy('');
    }
  };

  const selectCatalogForMapping = (catalogProduct) => {
    const suggestedProductId = suggestInternalProductForCatalog(catalogProduct);
    setMapping((current) => ({
      ...current,
      productId: suggestedProductId || current.productId || '',
      catalogItemId: catalogProduct.itemId || '',
      food99ProductId: catalogProduct.productId || '',
      externalCode: catalogProduct.externalCode || '',
    }));
    setMappingPanelOpen(true);
    window.setTimeout(() => {
      mappingPanelRef.current?.scrollIntoView({behavior: 'smooth', block: 'center'});
    }, 0);
    setMessage({
      type: 'success',
      text: suggestedProductId
        ? 'Item 99Food selecionado e produto interno sugerido. Confira os dados e clique em Vincular.'
        : 'Item 99Food selecionado. Escolha o produto interno e clique em Vincular.',
    });
  };

  const importCatalogProduct = (catalogProduct) => perform(`catalog-import-${catalogProduct.itemId || catalogProduct.productId}`, async () => {
    await invoke('food99ImportCatalogProduct', {
      ...catalogProductPayload(catalogProduct),
    });
  }, 'Item 99Food trazido para a aplicacao. Revise estoque/preco antes de ativar a sincronizacao.');

  const importSelectedCatalogProducts = async () => {
    if (!selectedCatalogRows.length) return;
    setBusy('catalog-import-bulk');
    setMessage(null);
    setBulkImportResult(null);
    try {
      const result = await invoke('food99ImportCatalogProducts', {
        items: selectedCatalogRows.map(catalogProductPayload),
      });
      setBulkImportResult(result);
      if (!result.failed) clearCatalogSelection();
      const summaryText = `${result.imported || 0} importado(s), ${result.ignored || 0} ignorado(s), ${result.failed || 0} falhou(ram).`;
      setMessage({
        type: result.failed ? 'error' : 'success',
        text: summaryText,
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy('');
    }
  };

  if (!effectiveStoreId) {
    return (
      <div className="min-h-full bg-gray-50 p-4 sm:p-6">
        <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">99Food Hub</h1>
          <p className="mt-2 text-sm text-gray-600">Escolha uma loja para configurar credenciais, estoque e pedidos do 99Food.</p>
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
            <h1 className="text-2xl font-semibold">99Food Hub</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${isOnline ? (dark ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700') : (dark ? 'bg-rose-400/15 text-rose-300' : 'bg-rose-50 text-rose-700')}`}>
              {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              API {isOnline ? 'online' : health.status || 'nao configurada'}
            </span>
          </div>
          <p className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Operacao, estoque e pedidos em tempo real para {storeLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button dark={dark} onClick={() => setDark(!dark)}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{dark ? 'Claro' : 'Escuro'}</Button>
          <Button dark={dark} disabled={busy === 'poll'} onClick={() => perform('poll', () => invoke('food99PollNow'), 'Eventos consultados e processados.')}>
            <RefreshCw className={`h-4 w-4 ${busy === 'poll' ? 'animate-spin' : ''}`} />Consultar agora
          </Button>
        </div>
      </header>

      {message && (
        <div className={`mb-5 flex items-center gap-2 rounded-lg border p-3 text-sm ${
          message.type === 'success'
            ? (dark ? 'border-emerald-700 bg-emerald-950 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800')
            : message.type === 'warning'
              ? (dark ? 'border-amber-700 bg-amber-950 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800')
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
                      <td className="px-4 py-3"><p className="font-medium">#{order.displayId || order.food99OrderId || order.id}</p><p className={`text-xs ${dark ? 'text-slate-500' : 'text-gray-400'}`}>{dateTime(order.createdAt)}</p></td>
                      <td className="px-4 py-3">{order.customerName || 'Cliente 99Food'}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(order.status, dark)}`}>{order.status}</span></td>
                      <td className="px-4 py-3 font-medium">{money(order.total)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {order.externalStatus === 'PLACED' && <Button dark={dark} disabled={busy !== ''} onClick={() => actionForOrder(order, 'confirm')}>Confirmar</Button>}
                          {order.externalStatus === 'CONFIRMED' && <Button dark={dark} disabled={busy !== ''} onClick={() => actionForOrder(order, 'readyToPickup')}>Pronto</Button>}
                          {['READY_TO_PICKUP', 'DISPATCHED'].includes(order.externalStatus) && <Button dark={dark} disabled={busy !== ''} onClick={() => actionForOrder(order, 'delivered')}><Truck className="h-4 w-4" />Entregue</Button>}
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
        <div className="space-y-4">
          <section className={`overflow-hidden rounded-lg border ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
            <div className={`flex flex-col justify-between gap-3 border-b p-4 lg:flex-row lg:items-center ${dark ? 'border-slate-800' : 'border-gray-100'}`}>
              <div>
                <h2 className="font-semibold">Produtos para o 99Food</h2>
                <p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{productsReadyFor99Food.length} com preco 99Food definido, {mappedProducts.length} publicados</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button dark={dark} disabled={!selectedProductIds.length || busy === 'catalog-publish'} onClick={() => publishProducts(selectedProductIds)}>
                  <Package className="h-4 w-4" />Publicar selecionados
                </Button>
                <Button primary disabled={!productsReadyFor99Food.length || busy === 'catalog-publish'} onClick={() => publishProducts(productsReadyFor99Food.map((product) => product.id))}>
                  <RefreshCw className={`h-4 w-4 ${busy === 'catalog-publish' ? 'animate-spin' : ''}`} />Publicar todos prontos
                </Button>
                <Button dark={dark} disabled={!mappedProducts.length || busy === 'sync'} onClick={() => perform('sync', () => invoke('food99SyncStockNow'), 'Sincronizacao de estoque solicitada.')}>
                  <RefreshCw className={`h-4 w-4 ${busy === 'sync' ? 'animate-spin' : ''}`} />Reconciliar estoque
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className={dark ? 'bg-slate-950 text-slate-400' : 'bg-gray-50 text-gray-500'}>
                  <tr>
                    <th className="w-10 px-4 py-3 text-left"></th>
                    <th className="px-4 py-3 text-left font-medium">Produto</th>
                    <th className="px-4 py-3 text-left font-medium">Preco cardapio</th>
                    <th className="px-4 py-3 text-left font-medium">Preco 99Food</th>
                    <th className="px-4 py-3 text-left font-medium">Estoque</th>
                    <th className="px-4 py-3 text-left font-medium">Codigo PDV</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const linked = mappingByProductId.get(product.id);
                    const ready = Number(product.preco99Food) > 0;
                    const published = linked?.catalogManaged;
                    return (
                      <tr key={product.id} className={`border-t ${dark ? 'border-slate-800' : 'border-gray-100'}`}>
                        <td className="px-4 py-3">
                          <input type="checkbox" disabled={!ready} checked={selectedProductIds.includes(product.id)} onChange={() => toggleProductSelection(product.id)} className="h-4 w-4 accent-pink-600" />
                        </td>
                        <td className="px-4 py-3"><p className="font-medium">{product.nome}</p><p className={dark ? 'text-slate-400' : 'text-gray-500'}>{product.subcategoria || product.categoria}</p></td>
                        <td className="px-4 py-3">{money(product.preco)}</td>
                        <td className={`px-4 py-3 font-medium ${ready ? 'text-pink-600' : 'text-amber-600'}`}>{ready ? money(product.preco99Food) : 'Pendente'}</td>
                        <td className={`px-4 py-3 font-medium ${(Number(product.estoque) || 0) <= 3 ? 'text-rose-500' : 'text-emerald-600'}`}>{Number(product.estoque) || 0} un.</td>
                        <td className={`px-4 py-3 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{linked?.externalCode || 'Gerado ao publicar'}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs ${
                            linked?.publishStatus === 'error'
                              ? 'bg-rose-50 text-rose-700'
                              : published ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                          }`}>{linked?.publishStatus === 'error' ? 'Erro' : published ? 'Publicado' : 'Nao publicado'}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button dark={dark} disabled={!ready || busy === 'catalog-publish'} onClick={() => publishProducts([product.id])}>
                            <Package className="h-4 w-4" />{published ? 'Atualizar' : 'Publicar'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!products.length && <p className={`p-10 text-center text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Nenhum produto cadastrado nesta loja.</p>}
            </div>
          </section>

          <section className={`overflow-hidden rounded-lg border ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
            <div className={`flex flex-col justify-between gap-3 border-b p-4 lg:flex-row lg:items-center ${dark ? 'border-slate-800' : 'border-gray-100'}`}>
              <div>
                <h2 className="font-semibold">Produtos ja sincronizados</h2>
                <p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{syncedProducts.length} produto(s) com vinculo, importacao ou estoque publicado no 99Food.</p>
              </div>
              <Button dark={dark} disabled={!mappedProducts.length || busy === 'sync'} onClick={() => perform('sync', () => invoke('food99SyncStockNow'), 'Sincronizacao de estoque solicitada.')}>
                <RefreshCw className={`h-4 w-4 ${busy === 'sync' ? 'animate-spin' : ''}`} />Reconciliar todos
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className={dark ? 'bg-slate-950 text-slate-400' : 'bg-gray-50 text-gray-500'}>
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Produto interno</th>
                    <th className="px-4 py-3 text-left font-medium">Produto 99Food</th>
                    <th className="px-4 py-3 text-left font-medium">Codigo PDV</th>
                    <th className="px-4 py-3 text-left font-medium">Estoque app</th>
                    <th className="px-4 py-3 text-left font-medium">Ultimo saldo 99Food</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {syncedProducts.map((item) => (
                    <tr key={item.productId} className={`border-t ${dark ? 'border-slate-800' : 'border-gray-100'}`}>
                      <td className="px-4 py-3"><p className="font-medium">{item.productName}</p><p className={dark ? 'text-slate-400' : 'text-gray-500'}>{item.product?.subcategoria || item.categoryName || '-'}</p></td>
                      <td className={`px-4 py-3 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{item.food99ProductId || item.catalogItemId || '-'}</td>
                      <td className={`px-4 py-3 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{item.externalCode || '-'}</td>
                      <td className="px-4 py-3 font-medium">{item.quantity} un.</td>
                      <td className="px-4 py-3">{item.lastSyncedQuantity ?? item.pendingQuantity ?? '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs ${
                          item.syncStatus === 'error'
                            ? 'bg-rose-50 text-rose-700'
                            : item.syncStatus === 'synced' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>{item.syncStatus === 'synced' ? 'Sincronizado' : item.importedFrom99Food ? 'Importado' : item.syncStatus || 'Vinculado'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button dark={dark} disabled={busy !== '' || !item.stockSyncEnabled} onClick={() => perform(`sync-${item.productId}`, () => invoke('food99SyncStockNow', {productId: item.productId}), 'Saldo enviado ao 99Food.')}>
                          <RefreshCw className="h-4 w-4" />Sincronizar
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!syncedProducts.length && <tr><td colSpan="7" className={`px-4 py-8 text-center ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Nenhum produto vinculado ou sincronizado ainda.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className={`overflow-hidden rounded-lg border ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
            <div className={`flex flex-col justify-between gap-3 border-b p-4 lg:flex-row lg:items-center ${dark ? 'border-slate-800' : 'border-gray-100'}`}>
              <div>
                <h2 className="font-semibold">Catalogo cadastrado no 99Food</h2>
                <p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{catalogProducts.length ? `${catalogRows.length} de ${catalogProducts.length} item(ns) carregados` : 'Carregue o catalogo para visualizar itens que ja existem no 99Food.'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${dark ? 'text-slate-500' : 'text-gray-400'}`} />
                  <input className={`${inputClass(dark)} w-72 pl-9`} placeholder="Buscar item, categoria, codigo..." value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} />
                </div>
                <Button dark={dark} disabled={!catalogPageKeys.length} onClick={() => setCatalogSelection(catalogPageKeys, !allPageSelected)}>
                  {allPageSelected ? 'Desmarcar pagina' : 'Selecionar pagina'}
                </Button>
                <Button dark={dark} disabled={!catalogFilteredKeys.length} onClick={() => setCatalogSelection(catalogFilteredKeys, !allFilteredSelected)}>
                  {allFilteredSelected ? 'Desmarcar filtrados' : 'Selecionar filtrados'}
                </Button>
                <Button dark={dark} disabled={busy === 'catalog-load'} onClick={loadCatalogProducts}>
                  <RefreshCw className={`h-4 w-4 ${busy === 'catalog-load' ? 'animate-spin' : ''}`} />Atualizar catalogo 99Food
                </Button>
              </div>
            </div>
            {selectedCatalogKeys.length > 0 && (
              <div className={`flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between ${dark ? 'border-slate-800 bg-slate-950/60' : 'border-gray-100 bg-pink-50/50'}`}>
                <div>
                  <p className={`text-sm font-semibold ${dark ? 'text-slate-100' : 'text-gray-900'}`}>{selectionLabel}</p>
                  <p className={`mt-1 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{selectedVisibleCatalogCount} item(ns) visiveis nesta busca.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button primary disabled={busy !== ''} onClick={importSelectedCatalogProducts}>
                    <Package className="h-4 w-4" />Trazer selecionados para aplicacao
                  </Button>
                  <Button dark={dark} disabled={busy !== ''} onClick={clearCatalogSelection}>
                    <X className="h-4 w-4" />Limpar selecao
                  </Button>
                </div>
              </div>
            )}
            {bulkImportResult && (
              <div className={`border-b px-4 py-3 ${dark ? 'border-slate-800 bg-slate-950/40' : 'border-gray-100 bg-white'}`}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${dark ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700'}`}>{bulkImportResult.imported || 0} importado(s)</span>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${dark ? 'bg-amber-400/15 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>{bulkImportResult.ignored || 0} ignorado(s)</span>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${dark ? 'bg-rose-400/15 text-rose-300' : 'bg-rose-50 text-rose-700'}`}>{bulkImportResult.failed || 0} falhou(ram)</span>
                </div>
                <div className={`mt-3 max-h-56 overflow-auto rounded-lg border ${dark ? 'border-slate-800' : 'border-gray-100'}`}>
                  <table className="min-w-full text-xs">
                    <tbody>
                      {(bulkImportResult.results || []).map((result, index) => (
                        <tr key={`${result.itemKey || result.itemId || result.name}-${result.status}-${index}`} className={`border-t first:border-t-0 ${dark ? 'border-slate-800' : 'border-gray-100'}`}>
                          <td className="px-3 py-2 font-medium">{result.name || result.itemId || result.productId99Food}</td>
                          <td className={`px-3 py-2 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{result.externalCode || result.itemId || '-'}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-1 ${result.status === 'imported' ? (dark ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700') : result.status === 'failed' ? (dark ? 'bg-rose-400/15 text-rose-300' : 'bg-rose-50 text-rose-700') : (dark ? 'bg-amber-400/15 text-amber-300' : 'bg-amber-50 text-amber-700')}`}>
                              {result.status === 'imported' ? 'Importado' : result.status === 'failed' ? 'Falhou' : 'Ignorado'}
                            </span>
                          </td>
                          <td className={`px-3 py-2 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{result.error || result.message || result.productId || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className={dark ? 'bg-slate-950 text-slate-400' : 'bg-gray-50 text-gray-500'}>
                  <tr>
                    <th className="w-12 px-4 py-3 text-left font-medium">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        disabled={!catalogPageKeys.length}
                        onChange={() => setCatalogSelection(catalogPageKeys, !allPageSelected)}
                        className="h-4 w-4 accent-pink-600"
                        aria-label="Selecionar itens da pagina"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Item 99Food</th>
                    <th className="px-4 py-3 text-left font-medium">Categoria</th>
                    <th className="px-4 py-3 text-left font-medium">Preco</th>
                    <th className="px-4 py-3 text-left font-medium">Codigo PDV</th>
                    <th className="px-4 py-3 text-left font-medium">Vinculo</th>
                    <th className="px-4 py-3 text-right font-medium">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogPageRows.map((item) => {
                    const status = catalogStatus(item);
                    return (
                    <tr key={`${item.itemId}-${item.productId}`} className={`border-t ${dark ? 'border-slate-800' : 'border-gray-100'}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedCatalogKeySet.has(item.selectionKey)}
                          onChange={() => toggleCatalogSelection(item.selectionKey)}
                          className="h-4 w-4 accent-pink-600"
                          aria-label={`Selecionar ${item.name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.name}</p>
                        <p className={`text-xs ${dark ? 'text-slate-500' : 'text-gray-400'}`}>{item.productId || item.itemId}</p>
                      </td>
                      <td className="px-4 py-3">{item.categoryName || '-'}</td>
                      <td className="px-4 py-3 font-medium">{money(item.price)}</td>
                      <td className={`px-4 py-3 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{item.externalCode || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs ${catalogStatusClass(status.id, dark)}`}>{status.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {!item.linked && (
                            <Button dark={dark} disabled={busy !== ''} onClick={() => importCatalogProduct(item)}>
                              <Package className="h-4 w-4" />Trazer para aplicacao
                            </Button>
                          )}
                          <Button dark={dark} disabled={busy !== ''} onClick={() => selectCatalogForMapping(item)}>
                            <Save className="h-4 w-4" />Usar no vinculo
                          </Button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {!catalogRows.length && <tr><td colSpan="7" className={`px-4 py-8 text-center ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Nenhum item 99Food carregado ou encontrado na busca.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <details
            ref={mappingPanelRef}
            open={mappingPanelOpen}
            onToggle={(event) => setMappingPanelOpen(event.currentTarget.open)}
            className={`rounded-lg border p-5 ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}
          >
            <summary className="cursor-pointer text-sm font-medium">Vincular item ja cadastrado no 99Food manualmente</summary>
            {mapping.food99ProductId && (
              <div className={`mt-4 rounded-lg border p-3 text-sm ${dark ? 'border-sky-800 bg-sky-400/10 text-sky-200' : 'border-sky-100 bg-sky-50 text-sky-800'}`}>
                <span className="font-medium">Item selecionado:</span> {selectedMappingCatalogProduct?.name || mapping.food99ProductId}
                {mapping.externalCode ? <span className="ml-2 text-xs opacity-80">({mapping.externalCode})</span> : null}
              </div>
            )}
            <form onSubmit={saveMapping} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Field dark={dark} label="Produto interno">
                <select className={inputClass(dark)} value={mapping.productId} onChange={(event) => setMapping({...mapping, productId: event.target.value})} required>
                  <option value="">Selecione</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.nome}</option>)}
                </select>
              </Field>
              {catalogProducts.length > 0 ? (
                <Field dark={dark} label="Produto no catalogo 99Food">
                  <select className={inputClass(dark)} value={mapping.catalogItemId} onChange={(event) => {
                    const selected = catalogProducts.find((product) => product.itemId === event.target.value);
                    setMapping({...mapping, catalogItemId: selected?.itemId || '', food99ProductId: selected?.productId || '', externalCode: selected?.externalCode || ''});
                  }} required>
                    <option value="">Selecione</option>
                    {catalogProducts.map((product) => <option key={product.itemId} value={product.itemId}>{product.name} - {product.categoryName}</option>)}
                  </select>
                </Field>
              ) : (
                <Field dark={dark} label="ID do produto no 99Food"><input className={inputClass(dark)} value={mapping.food99ProductId} onChange={(event) => setMapping({...mapping, food99ProductId: event.target.value})} required /></Field>
              )}
              <Field dark={dark} label="Codigo PDV existente"><input className={inputClass(dark)} value={mapping.externalCode} onChange={(event) => setMapping({...mapping, externalCode: event.target.value})} /></Field>
              <div className="flex items-end">
                <Button type="submit" primary disabled={busy === 'mapping-save'}><Save className="h-4 w-4" />Vincular</Button>
              </div>
            </form>
          </details>
        </div>
      )}

      {tab === 'configuracao' && (
        <div className="space-y-5">
          {isPlatformAdmin ? (
            <form onSubmit={savePlatformConfiguration} className={`space-y-6 rounded-lg border p-5 ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Configuracoes globais > Integracoes > 99Food OpenAPI</h2>
                  <p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>App ID, App Secret, API e webhook sao unicos para toda a plataforma.</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${platformConfig.credentialsReady ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {platformConfig.credentialsReady ? 'Credenciais globais protegidas' : 'Credenciais globais pendentes'}
                </span>
              </div>

              {config.credentialScope === 'legacy_store' && !config.platformCredentialsReady && (
                <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm ${dark ? 'border-amber-700/50 bg-amber-400/10 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  <span>As credenciais antigas desta loja podem ser promovidas para a configuracao central da plataforma.</span>
                  <Button dark={dark} disabled={busy === 'credential-promote'} onClick={promoteStoredCredentials}>
                    <ArrowRight className="h-4 w-4" />Usar para todas as lojas
                  </Button>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field dark={dark} label="Ambiente">
                  <select className={inputClass(dark)} value={platformConfig.environment} onChange={(event) => setPlatformConfig({...platformConfig, environment: event.target.value})}>
                    <option value="production">Producao</option>
                    <option value="sandbox">Sandbox</option>
                  </select>
                </Field>
                <Field dark={dark} label="API base URL">
                  <input className={inputClass(dark)} value={platformConfig.apiBaseUrl} onChange={(event) => setPlatformConfig({...platformConfig, apiBaseUrl: event.target.value})} />
                </Field>
                <Field dark={dark} label="URL base de autenticacao">
                  <input className={inputClass(dark)} value={platformConfig.authUrl} onChange={(event) => setPlatformConfig({...platformConfig, authUrl: event.target.value})} />
                </Field>
                <ProtectedSecretField dark={dark} label="App ID da plataforma" stored={platformConfig.clientIdReady} editing={editingPlatformSecrets.clientId} value={platformSecrets.clientId} onChange={(value) => setPlatformSecrets({...platformSecrets, clientId: value})} onEdit={editCredentials} onCancel={cancelCredentialsEdit} />
                <ProtectedSecretField dark={dark} label="App Secret da plataforma" stored={platformConfig.clientSecretReady} editing={editingPlatformSecrets.clientSecret} value={platformSecrets.clientSecret} onChange={(value) => setPlatformSecrets({...platformSecrets, clientSecret: value})} onEdit={editCredentials} onCancel={cancelCredentialsEdit} />
                <ProtectedSecretField dark={dark} label="Segredo global de webhook" stored={platformConfig.webhookSecretReady} editing={editingPlatformSecrets.webhookSecret} value={platformSecrets.webhookSecret} onChange={(value) => setPlatformSecrets({...platformSecrets, webhookSecret: value})} onEdit={() => editSecret('webhookSecret')} onCancel={() => cancelSecretEdit('webhookSecret')} emptyHint="Deixe vazio enquanto a operacao usar somente polling." />
                <Field dark={dark} label="URL publica do webhook">
                  <input className={inputClass(dark)} placeholder="https://.../food99Webhook" value={platformConfig.webhookUrl} onChange={(event) => setPlatformConfig({...platformConfig, webhookUrl: event.target.value})} />
                </Field>
                <Field dark={dark} label="Metodo de disponibilidade">
                  <select className={inputClass(dark)} value={platformConfig.inventoryMethod} onChange={(event) => setPlatformConfig({...platformConfig, inventoryMethod: event.target.value})}>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </Field>
                <Field dark={dark} label="Endpoint alternativo de disponibilidade" hint="Opcional para homologacao futura. Hoje a integracao usa /v3/item/item/updateItemStatus.">
                  <input className={inputClass(dark)} value={platformConfig.inventoryEndpointTemplate} onChange={(event) => setPlatformConfig({...platformConfig, inventoryEndpointTemplate: event.target.value})} />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Toggle dark={dark} label="Webhooks globais habilitados" checked={platformConfig.webhookEnabled} onChange={(value) => setPlatformConfig({...platformConfig, webhookEnabled: value})} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" primary disabled={busy === 'platform-save'}><Save className="h-4 w-4" />Salvar configuracao global</Button>
              </div>
            </form>
          ) : (
            <section className={`rounded-lg border p-5 ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Credencial central protegida</h2>
                  <p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>App ID, App Secret, API e webhook sao administrados somente por Dono ou Administrador Master.</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${platformConfig.credentialsReady ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {platformConfig.credentialsReady ? 'Plataforma conectada' : 'Aguardando configuracao global'}
                </span>
              </div>
            </section>
          )}

          <form onSubmit={saveConfiguration} className={`space-y-6 rounded-lg border p-5 ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Configuracoes da loja > Integracoes > 99Food</h2>
                <p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Cada loja usa seu proprio app_shop_id e suas regras operacionais de sincronizacao.</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${config.merchantId ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {config.merchantId ? 'app_shop_id configurado' : 'app_shop_id pendente'}
              </span>
            </div>

            {config.credentialsReady && !config.merchantId && (
              <div className={`rounded-lg border p-4 text-sm ${dark ? 'border-amber-700/50 bg-amber-400/10 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                Informe o app_shop_id autorizado para esta loja. Gerentes visualizam e editam somente os dados da propria unidade.
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field dark={dark} label="app_shop_id" hint="Identificador da loja na 99Food/OpenAPI; nao e CNPJ nem App ID.">
                <input className={inputClass(dark)} placeholder="Informe o app_shop_id desta loja" value={config.merchantId} onChange={(event) => setConfig({...config, merchantId: event.target.value})} />
                {isPlatformAdmin && (
                  <Button dark={dark} disabled={!config.credentialsReady || busy === 'merchant-load'} onClick={loadMerchants}>
                    <Search className={`h-4 w-4 ${busy === 'merchant-load' ? 'animate-pulse' : ''}`} />Carregar dados da loja
                  </Button>
                )}
                {isPlatformAdmin && merchants.length > 0 && (
                  <select className={inputClass(dark)} value={config.merchantId} onChange={(event) => handleMerchantSelect(event.target.value)}>
                    <option value="">Selecione a loja autorizada</option>
                    {merchants.map((merchant) => (
                      <option key={merchant.id} value={merchant.id}>{merchant.name || merchant.corporateName || merchant.id}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field dark={dark} label="Nome da loja no 99Food">
                <input className={inputClass(dark)} placeholder="Nome exibido/retornado pelo 99Food" value={config.merchantName} onChange={(event) => setConfig({...config, merchantName: event.target.value})} />
              </Field>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium">Automacao operacional da loja</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <Toggle dark={dark} label="Integracao ativa" checked={config.enabled} onChange={(value) => setConfig({...config, enabled: value})} />
                <Toggle dark={dark} label="Sincronizar pedidos" checked={config.ordersSyncEnabled} onChange={(value) => setConfig({...config, ordersSyncEnabled: value})} />
                <Toggle dark={dark} label="Polling automatico" checked={config.pollingEnabled} onChange={(value) => setConfig({...config, pollingEnabled: value})} />
                <Toggle dark={dark} label="Sincronizar estoque" checked={config.stockSyncEnabled} onChange={(value) => setConfig({...config, stockSyncEnabled: value})} />
                <Toggle dark={dark} label="Sincronizar catalogo" checked={config.catalogSyncEnabled} onChange={(value) => setConfig({...config, catalogSyncEnabled: value})} />
                <Toggle dark={dark} label="Confirmar pedidos" checked={config.autoConfirm} onChange={(value) => setConfig({...config, autoConfirm: value})} />
                <Toggle dark={dark} label="Iniciar preparo" checked={config.autoStartPreparation} onChange={(value) => setConfig({...config, autoStartPreparation: value})} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" primary disabled={busy === 'config-save'}><Save className="h-4 w-4" />Salvar configuracao da loja</Button>
              <Button dark={dark} disabled={!config.credentialsReady || busy === 'test'} onClick={() => perform('test', () => invoke('food99TestConnection'), 'Autenticacao 99Food validada com sucesso.')}>
                <ArrowRight className="h-4 w-4" />Testar conexao
              </Button>
            </div>
          </form>
        </div>
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
                <p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Pedido #{cancellation.order.displayId || cancellation.order.food99OrderId}</p>
              </div>
              <button type="button" onClick={() => setCancellation({order: null, reasons: [], reason: ''})} className={`rounded-md p-2 ${dark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`} aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>
            <Field dark={dark} label="Motivo autorizado pelo 99Food">
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
                <p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Pedido #{validation.order.displayId || validation.order.food99OrderId}</p>
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




