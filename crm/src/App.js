import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  LayoutDashboard, Users, ShoppingCart, Package, Calendar, Truck, DollarSign, BarChart3,
  Search, Bell, Menu, User as UserIcon, Settings, LogOut, Plus, Heart,
  Clock, Edit, Trash2, Eye, X, Save, MessageCircle, Cake, Gift, ChevronLeft, ChevronRight, Printer, Home, Store, BookOpen, Instagram, MapPin, Image as ImageIcon, MessageSquare, VolumeX, ArrowUpCircle, ArrowDownCircle, Banknote, PackagePlus, Ticket,
  Key, ArrowLeftRight, FileText, AlertTriangle, RefreshCw, CheckCircle, Download // Ícone adicionado
} from 'lucide-react';

// --- CORREÇÃO ---
// Importando 'functions' do seu arquivo de configuração do Firebase.
import {
  auth,
  db,
  storage,
  functions,
  onSnapshot,
  getDoc,
  getDocs,
  deleteDoc,
  runWithRetry,
  setFirestoreTelemetryContext
} from './firebaseConfig.js';
//import { firebaseConfig } from './firebaseConfig.js';

// --- CORREÇÃO ---
// Importando 'httpsCallable' para poder chamar suas Cloud Functions.
import { httpsCallable } from "firebase/functions";

// Importações do Firebase SDK
// ATUALIZADO: Adicionado fluxo com redirect para login Google e reset de senha
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithRedirect, signInWithPopup, getRedirectResult, sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence, getIdToken } from "firebase/auth";
// CORRIGIDO: Adicionado 'getDocs' à importação
import { collection, query, doc, setDoc, addDoc, updateDoc, where, limit, orderBy, Timestamp, serverTimestamp, arrayUnion, writeBatch, waitForPendingWrites, runTransaction } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// --- CORREÇÃO: Importa o novo AudioManager ---
import { audioManager } from './utils/AudioManager.js';
import { registerDeviceForPush, listenForForegroundMessages, subscribeToServiceWorkerMessages } from './utils/notifications.js';
import { updateStock as updateStockService } from './services/stockService.js';
import ReceitasList from './components/fornecedores/ReceitasList';
import ReceitasModal from './components/fornecedores/ReceitasModal';
import IfoodHub from './components/ifood/IfoodHub';

// --- importação para Android
import { NativeAudio } from '@capacitor-community/native-audio';
import { Capacitor } from '@capacitor/core';

// ✅ CORREÇÃO: URL local para evitar erro de pré-condição no Firebase Storage
const ALARM_SOUND_URL = '/audio/alarm.mp3';
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'https://us-central1-crmdoceria-9959e.cloudfunctions.net/api';

const ROLE_OWNER = 'dono';
const ROLE_MANAGER = 'gerente';
const ROLE_ATTENDANT = 'atendente';
const ROLE_ACCOUNTANT = 'contador';
const ROLE_CLIENT = 'cliente';
const ROLE_DEFAULT = ROLE_ATTENDANT;
const STORE_ALL_KEY = '__all__';
const DEFAULT_NCM_PRODUCT = '19059090';
const NCM_PRODUCT_OPTIONS = [
  { value: '19059090', label: '1905.90.90 - bolo, bolo de pote, torta, brownie, cupcake etc.' },
  { value: '17049090', label: '1704.90.90 - doces e confeitos sem cacau' },
  { value: '18069000', label: '1806.90.00 - produtos predominantemente de chocolate/cacau' },
];
const DEFAULT_CFOP_OPERATION = '5101';
const CFOP_OPERATION_OPTIONS = [
  { value: '5101', label: '5101 - Produção própria dentro de GO' },
  { value: '5102', label: '5102 - Revenda dentro de GO' },
  { value: '6101', label: '6101 - Produção própria interestadual' },
  { value: '6107', label: '6107 - Produção própria interestadual para não contribuinte' },
  { value: '6102', label: '6102 - Revenda interestadual' },
  { value: '6108', label: '6108 - Revenda interestadual para não contribuinte' },
];
const DEFAULT_FORNECEDOR_CATEGORIES = ['Insumos', 'Embalagens', 'Bebidas', 'Decoração', 'Serviços'];
const CONFIG_DOC_ID = 'config';
const DEFAULT_ALARM_PAUSE_MINUTES = 5;
const MIN_ALARM_PAUSE_MINUTES = 1;
const MAX_ALARM_PAUSE_MINUTES = 120;
const GOOGLE_AUTH_FLOW_KEY = 'google-auth-flow-in-progress';
const GOOGLE_AUTH_FLOW_REDIRECT = 'redirect';
const GOOGLE_AUTH_FLOW_POPUP = 'popup';

const normalizeFiscalCode = (value) => String(value || '').replace(/\D/g, '');
const formatNcmCode = (value) => {
  const digits = normalizeFiscalCode(value);
  return digits.length === 8 ? `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}` : String(value || '');
};
const downloadBase64File = (base64, filename, contentType = 'application/octet-stream') => {
  const binary = atob(base64 || '');
  const chunks = [];
  for (let offset = 0; offset < binary.length; offset += 1024) {
    const slice = binary.slice(offset, offset + 1024);
    const bytes = new Uint8Array(slice.length);
    for (let i = 0; i < slice.length; i += 1) bytes[i] = slice.charCodeAt(i);
    chunks.push(bytes);
  }
  const url = URL.createObjectURL(new Blob(chunks, { type: contentType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'arquivo';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const isSafariBrowser = () => {
  if (typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent || '';
  const vendor = navigator.vendor || '';

  const hasSafariToken = /safari/i.test(userAgent);
  const isAppleVendor = /apple/i.test(vendor);
  const excludedBrowsersRegex = /(chrome|crios|android|edg|edge|edgios|opr|opera|fxios|firefox|samsungbrowser)/i;

  return hasSafariToken && isAppleVendor && !excludedBrowsersRegex.test(userAgent);
};
const CONFIG_COLLECTIONS = new Set(['cupons', 'logs']);
const MENU_PERMISSION_KEYS = [
  'pagina-inicial',
  'dashboard',
  'clientes',
  'pedidos',
  'produtos',
  'entre-lojas',
  'agenda',
  'fornecedores',
  'relatorios',
  'meu-espaco',
  'financeiro',
  'nota-fiscal',
  'ifood',
  'configuracoes'
];
const ACCOUNTANT_RESTRICTED_MODULES = new Set(['ifood', 'configuracoes']);

const buildStoreCollectionPath = (storeId, collectionName, useLegacyPath = false) => {
  const shouldUseConfigPath = CONFIG_COLLECTIONS.has(collectionName) && !useLegacyPath;
  return shouldUseConfigPath
    ? ['lojas', storeId, 'configuracoes', CONFIG_DOC_ID, collectionName]
    : ['lojas', storeId, collectionName];
};

const getStoreCollectionRef = (storeId, collectionName, useLegacyPath = false) => {
  if (collectionName === 'clientes') {
    return collection(db, 'clientes');
  }

  return collection(db, ...buildStoreCollectionPath(storeId, collectionName, useLegacyPath));
};

const getStoreDocRef = (storeId, collectionName, docId, useLegacyPath = false) => {
  if (collectionName === 'clientes') {
    return doc(db, 'clientes', docId);
  }

  return doc(db, ...buildStoreCollectionPath(storeId, collectionName, useLegacyPath), docId);
};

const getStoreConfigDocRef = (storeId) => doc(db, 'lojas', storeId, 'configuracoes', CONFIG_DOC_ID);

const sanitizeAlarmPauseMinutes = (value) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return DEFAULT_ALARM_PAUSE_MINUTES;
  const roundedValue = Math.round(parsedValue);
  if (roundedValue < MIN_ALARM_PAUSE_MINUTES || roundedValue > MAX_ALARM_PAUSE_MINUTES) {
    return DEFAULT_ALARM_PAUSE_MINUTES;
  }
  return roundedValue;
};


const DEFAULT_STORE_TIMEZONE = 'America/Sao_Paulo';
const WEEKDAYS = [
  { key: 'mon', label: 'Segunda-feira' },
  { key: 'tue', label: 'Terça-feira' },
  { key: 'wed', label: 'Quarta-feira' },
  { key: 'thu', label: 'Quinta-feira' },
  { key: 'fri', label: 'Sexta-feira' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' }
];

const buildDefaultStoreSchedule = () => WEEKDAYS.reduce((acc, day) => ({
  ...acc,
  [day.key]: { enabled: false, open: '08:00', close: '18:00' }
}), {});

const getDefaultStoreHoursConfig = () => ({
  timezone: DEFAULT_STORE_TIMEZONE,
  schedule: buildDefaultStoreSchedule(),
  alarmPauseMinutes: DEFAULT_ALARM_PAUSE_MINUTES,
  manualOverride: {
    mode: 'auto',
    updatedAt: null,
    updatedBy: ''
  }
});

const COLLECTIONS_TO_SYNC = [
  'produtos',
  'subcategorias',
  'categoriasFornecedores',
  'contas_a_pagar',
  'contas_a_receber',
  'fornecedores',
  'pedidosCompra',
  'estoque',
  'kardex',
  'perdasDescarte',
  'receitas',
  'fiscalProducts',
  'invoices',
  'ifoodOrders',
  'ifoodAlerts',
  'ifoodProductMappings',
  'ifoodAudit',
  'ifoodHealth',
  'logs',
  'cupons',
  'pedidos'
];

const getInitialDataState = () => ({
  clientes: [],
  ...COLLECTIONS_TO_SYNC.reduce((acc, collection) => ({
    ...acc,
    [collection]: []
  }), {}),
  users: []
});

const normalizeRole = (role) => {
  if (!role || typeof role !== 'string') return ROLE_DEFAULT;

  const value = role.trim().toLowerCase();
  if (!value) return ROLE_DEFAULT;

  const normalizedValue = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const ownerAliases = new Set([
    ROLE_OWNER,
    'owner',
    'proprietario',
    'proprietaria',
    'admin',
    'adm',
    'administrador',
    'administradora',
    'adminstrador',
    'adminstradora',
    'superadmin',
    'superadministrador',
    'superadministradora'
  ]);

  const managerAliases = new Set([
    ROLE_MANAGER,
    'manager',
    'gerencia',
    'gerente',
    'gestor',
    'gestora'
  ]);

  const attendantAliases = new Set([
    ROLE_ATTENDANT,
    'atendente',
    'colaborador',
    'colaboradora',
    'funcionario',
    'funcionaria',
    'vendedor',
    'vendedora'
  ]);

  const clientAliases = new Set([
    ROLE_CLIENT,
    'client',
    'cliente'
  ]);

  const accountantAliases = new Set([
    ROLE_ACCOUNTANT,
    'accountant',
    'contabilidade'
  ]);

  if (ownerAliases.has(normalizedValue)) {
    return ROLE_OWNER;
  }

  if (managerAliases.has(normalizedValue)) {
    return ROLE_MANAGER;
  }

  if (attendantAliases.has(normalizedValue)) {
    return ROLE_ATTENDANT;
  }

  if (accountantAliases.has(normalizedValue)) {
    return ROLE_ACCOUNTANT;
  }

  if (clientAliases.has(normalizedValue)) {
    return ROLE_CLIENT;
  }

  if ([ROLE_OWNER, ROLE_MANAGER, ROLE_ATTENDANT, ROLE_ACCOUNTANT, ROLE_CLIENT].includes(value)) {
    return value;
  }

  return ROLE_DEFAULT;
};

const getDefaultPermissionsForRole = (role) => {
  const base = MENU_PERMISSION_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {});
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === ROLE_OWNER) {
    return MENU_PERMISSION_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {});
  }

  if (normalizedRole === ROLE_MANAGER) {
    return {
      ...base,
      'pagina-inicial': true,
      dashboard: true,
      clientes: true,
      pedidos: true,
      produtos: true,
      'entre-lojas': true,
      agenda: true,
      fornecedores: true,
      relatorios: true,
      'meu-espaco': true,
      financeiro: true,
      'nota-fiscal': true,
      ifood: true,
      configuracoes: true,
    };
  }

  if (normalizedRole === ROLE_CLIENT) {
    return {
      ...base,
      'pagina-inicial': true,
      'meu-espaco': true,
    };
  }

  if (normalizedRole === ROLE_ACCOUNTANT) {
    return {
      ...base,
      'pagina-inicial': true,
      dashboard: true,
      relatorios: true,
      financeiro: true,
      'nota-fiscal': true,
    };
  }

  return {
    ...base,
    'pagina-inicial': true,
    clientes: true,
    pedidos: true,
    'entre-lojas': true,
    agenda: true,
    'meu-espaco': true,
  };
};

const sanitizePermissions = (permissions, role) => {
  const defaults = getDefaultPermissionsForRole(role);
  if (!permissions || typeof permissions !== 'object') return defaults;

  return MENU_PERMISSION_KEYS.reduce((acc, key) => {
    if (normalizeRole(role) === ROLE_ACCOUNTANT && ACCOUNTANT_RESTRICTED_MODULES.has(key)) {
      acc[key] = false;
      return acc;
    }
    if (Object.prototype.hasOwnProperty.call(permissions, key)) {
      acc[key] = Boolean(permissions[key]);
    } else {
      acc[key] = defaults[key];
    }
    return acc;
  }, {});
};

const ACCOUNTANT_COLLECTION_PERMISSIONS = {
  produtos: ['produtos', 'relatorios'],
  subcategorias: ['produtos'],
  categoriasFornecedores: ['fornecedores'],
  contas_a_pagar: ['financeiro', 'relatorios'],
  contas_a_receber: ['financeiro', 'relatorios'],
  fornecedores: ['fornecedores'],
  pedidosCompra: ['fornecedores'],
  estoque: ['fornecedores', 'relatorios'],
  kardex: ['fornecedores', 'relatorios'],
  perdasDescarte: ['fornecedores', 'relatorios'],
  receitas: ['fornecedores'],
  fiscalProducts: ['nota-fiscal'],
  invoices: ['nota-fiscal', 'financeiro', 'relatorios'],
  ifoodOrders: ['ifood'],
  ifoodAlerts: ['ifood'],
  ifoodProductMappings: ['ifood'],
  ifoodAudit: ['ifood'],
  ifoodHealth: ['ifood'],
  logs: ['configuracoes'],
  cupons: ['configuracoes'],
  pedidos: ['dashboard', 'pedidos', 'financeiro', 'relatorios', 'nota-fiscal'],
};

const getCollectionsToSyncForUser = (userProfile) => {
  if (userProfile?.role !== ROLE_ACCOUNTANT) return COLLECTIONS_TO_SYNC;
  const permissions = sanitizePermissions(userProfile.customPermissions || userProfile.permissions, userProfile.role);
  return COLLECTIONS_TO_SYNC.filter((collectionName) => (
    ACCOUNTANT_COLLECTION_PERMISSIONS[collectionName] || []
  ).some((permission) => permissions[permission]));
};

const extractStoreIdsFromProfile = (profile) => {
  if (!profile) return [];
  const { lojaId, lojaIds, lojas } = profile;
  if (Array.isArray(lojaIds) && lojaIds.length) return lojaIds;
  if (Array.isArray(lojas) && lojas.length) return lojas;
  if (Array.isArray(lojaId) && lojaId.length) return lojaId;
  if (typeof lojaId === 'string' && lojaId.trim().length) return [lojaId.trim()];
  return [];
};

const formatPhoneForWhatsApp = (phone) => {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) {
    return digits.length >= 12 ? digits : digits;
  }
  if (digits.length >= 11) {
    return `55${digits}`;
  }
  if (digits.length === 10) {
    return `55${digits}`;
  }
  return '';
};

const getOrderAddressDetails = (order, clientes = []) => {
  if (!order) return { cliente: null, enderecoTexto: '', locationLink: '' };

  const cliente = clientes.find((c) => c.id === order.clienteId) || null;
  const normalizeEnderecoObj = (value) => {
    if (!value) return null;
    if (typeof value === 'string') return { enderecoCompleto: value };
    if (typeof value === 'object') return value;
    return null;
  };

  let enderecoTexto = '';
  if (typeof order.clienteEndereco === 'string') {
    enderecoTexto = order.clienteEndereco;
  } else if (typeof order.clienteEndereco === 'object' && order.clienteEndereco !== null) {
    enderecoTexto = order.clienteEndereco.enderecoCompleto || order.clienteEndereco.texto || '';
  }

  if (!enderecoTexto && cliente) {
    if (Array.isArray(cliente.enderecos) && cliente.enderecos.length > 0) {
      const primeiroEndereco = normalizeEnderecoObj(cliente.enderecos[0]);
      enderecoTexto = primeiroEndereco?.enderecoCompleto || '';
    } else if (cliente.endereco) {
      enderecoTexto = cliente.endereco;
    }
  }

  if (!enderecoTexto) {
    enderecoTexto = 'Não informado';
  }

  let enderecoSelecionado = null;
  if (cliente && Array.isArray(cliente.enderecos)) {
    enderecoSelecionado = cliente.enderecos.find((item) => {
      const normalizado = normalizeEnderecoObj(item);
      if (!normalizado) return false;
      if (!enderecoTexto || enderecoTexto === 'Não informado') return false;
      return normalizado.enderecoCompleto === enderecoTexto;
    }) || null;
  }

  let lat = null;
  let lng = null;
  if (enderecoSelecionado && typeof enderecoSelecionado === 'object') {
    const latNumber = parseFloat(enderecoSelecionado.lat);
    const lngNumber = parseFloat(enderecoSelecionado.lng);
    lat = Number.isNaN(latNumber) ? null : latNumber;
    lng = Number.isNaN(lngNumber) ? null : lngNumber;
  }

  const locationLink = lat !== null && lng !== null
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : enderecoTexto && enderecoTexto !== 'Não informado'
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoTexto)}`
      : '';

  return { cliente, enderecoTexto, locationLink };
};

const roundCurrency = (value) => Number((Number(value || 0)).toFixed(2));

const getOrderItemProductId = (item) => item?.produtoId || item?.productId || item?.id || null;

const getClientPrimaryAddressText = (cliente = {}) => {
  if (typeof cliente.endereco === 'string' && cliente.endereco.trim()) {
    return cliente.endereco.trim();
  }

  const firstAddress = Array.isArray(cliente.enderecos) ? cliente.enderecos[0] : null;
  if (!firstAddress) return '';
  if (typeof firstAddress === 'string') return firstAddress;
  if (firstAddress.enderecoCompleto) return firstAddress.enderecoCompleto;

  return [
    firstAddress.rua,
    firstAddress.numero,
    firstAddress.complemento,
    firstAddress.bairro,
    firstAddress.cidade,
    firstAddress.cep,
  ].filter(Boolean).join(', ');
};

const ORDER_PAYMENT_OPTIONS = [
  'Pix dinâmico / link gerado',
  'Pix fixo / QR Code fixo',
  'Link de cartão de crédito',
  'Link de cartão de débito',
  'Cartão de Crédito',
  'Cartão de Débito',
  'Dinheiro',
  'Link de Pagamento',
  'Pix',
];
const DEFAULT_ORDER_PAYMENT_METHOD = ORDER_PAYMENT_OPTIONS[0];

// Hook customizado para estado persistente na sessão
const usePersistentState = (key, defaultValue) => {
  // Inicializa o estado apenas uma vez com o valor do sessionStorage
  const [state, setState] = useState(() => {
    try {
      const storedValue = sessionStorage.getItem(key);
      return storedValue ? JSON.parse(storedValue) : defaultValue;
    } catch (error) {
      console.error('Erro ao ler do sessionStorage', error);
      return defaultValue;
    }
  });

  // Referência para evitar salvar no primeiro render
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Pula o primeiro render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error('Erro ao salvar no sessionStorage', error);
    }
  }, [key, state]);

  return [state, setState];
};


// Componentes de UI
const Modal = ({ isOpen, onClose, title, children, size = "md" }) => {
  if (!isOpen) return null;
  const sizeClasses = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return ( <div className="fixed inset-0 z-50 flex items-center justify-center p-4"> <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} /> <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizeClasses[size]} max-h-[90vh] flex flex-col`}> <div className="flex items-center justify-between p-6 border-b border-gray-100"> <h2 className="text-xl font-semibold text-gray-800">{title}</h2> <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"> <X className="w-5 h-5" /> </button> </div> <div className="p-6 overflow-y-auto"> {children} </div> </div> </div> );
};
const Button = ({ children, variant = "primary", size = "md", onClick, className = "", disabled = false, type = "button", title = "" }) => {
  const baseClasses = "font-medium rounded-xl transition-all flex items-center gap-2 justify-center";
  const variants = {
    primary: "bg-gradient-to-r from-pink-500 to-rose-600 text-white hover:from-pink-600 hover:to-rose-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5",
    secondary: "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 shadow-md hover:shadow-lg",
    outline: "bg-white text-pink-600 border border-pink-200 hover:bg-pink-50 shadow-sm",
    danger: "bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 shadow-lg hover:shadow-xl"
  };
  const sizes = { sm: "px-4 py-2 text-sm", md: "px-6 py-3", lg: "px-8 py-4 text-lg" };
  return (<button type={type} title={title} onClick={onClick} disabled={disabled} className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>{children}</button>);
};
const Input = ({ label, error, className = "", ...props }) => (<div className="space-y-1 w-full">{label && <label className="block text-sm font-medium text-gray-700">{label}</label>}<input {...props} className={`w-full px-4 py-3 border rounded-xl transition-all focus:ring-2 focus:ring-pink-500 focus:border-transparent ${error ? 'border-red-300' : 'border-gray-300'} ${className}`} />{error && <p className="text-sm text-red-600">{error}</p>}</div>);
const Textarea = ({ label, error, className = "", ...props }) => (<div className="space-y-1">{label && <label className="block text-sm font-medium text-gray-700">{label}</label>}<textarea {...props} className={`w-full px-4 py-3 border rounded-xl transition-all focus:ring-2 focus:ring-pink-500 focus:border-transparent ${error ? 'border-red-300' : 'border-gray-300'} ${className}`} />{error && <p className="text-sm text-red-600">{error}</p>}</div>);
const Select = ({ label, error, className = "", children, ...props }) => (<div className="space-y-1 w-full">{label && <label className="block text-sm font-medium text-gray-700">{label}</label>}<select {...props} className={`w-full px-4 py-3 border rounded-xl transition-all focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-white ${error ? 'border-red-300' : 'border-gray-300'} ${className}`}>{children}</select>{error && <p className="text-sm text-red-600">{error}</p>}</div>);

// Componente de Tabela Responsiva
const Table = ({ columns, data, actions = [] }) => (
    <>
        {/* Visualização de Tabela para Desktop */}
        <div className="hidden md:block bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                        <tr>
                            {columns.map((col, index) => (<th key={index} className="px-6 py-4 text-left text-sm font-semibold text-gray-700">{col.header}</th>))}
                            {actions.length > 0 && <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">Ações</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {(data || []).map((row, rowIndex) => {
                            const visibleActions = actions.filter((action) => (typeof action.isVisible === 'function' ? action.isVisible(row) : true));
                            return (
                            <tr key={row.id || row.uid || rowIndex} className="hover:bg-gradient-to-r hover:from-pink-50/50 hover:to-rose-50/50 transition-all">
                                {columns.map((col, colIndex) => (
                                    <td key={colIndex} className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">{col.render ? col.render(row) : row[col.key]}</td>
                                ))}
                                {actions.length > 0 && (
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {visibleActions.map((action, actionIndex) => {
                                                const actionLabel = typeof action.label === 'function' ? action.label(row) : action.label;
                                                return (
                                                <button key={actionIndex} onClick={() => action.onClick(row)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title={actionLabel}>
                                                    <action.icon className="w-4 h-4 text-gray-600" />
                                                </button>
                                            )})}
                                        </div>
                                    </td>
                                )}
                            </tr>
                        )})}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Visualização de Cards para Celular */}
        <div className="block md:hidden space-y-4">
            {(data || []).map((row, rowIndex) => {
                const visibleActions = actions.filter((action) => (typeof action.isVisible === 'function' ? action.isVisible(row) : true));
                return (
                <div key={row.id || row.uid || rowIndex} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 space-y-2">
                    {columns.map((col, colIndex) => {
                        const content = col.render ? col.render(row) : row[col.key];
                        if (content === '-' || content === null || content === undefined) return null;

                        return (
                             <div key={colIndex} className={`text-sm ${colIndex === 0 ? 'font-bold text-lg text-pink-600' : ''}`}>
                                {colIndex > 0 && <p className="text-xs text-gray-500">{col.header}</p>}
                                <div className={colIndex === 0 ? 'mt-0' : 'mt-1'}>{content}</div>
                             </div>
                        )
                    })}
                    {actions.length > 0 && (
                        <div className="flex justify-end gap-2 pt-3 mt-2 border-t border-gray-100">
                            {visibleActions.map((action, actionIndex) => {
                                const actionLabel = typeof action.label === 'function' ? action.label(row) : action.label;
                                return (
                                <button key={actionIndex} onClick={() => action.onClick(row)} className="flex items-center gap-2 p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm text-gray-700" title={actionLabel}>
                                    <action.icon className="w-4 h-4" />
                                    <span>{actionLabel}</span>
                                </button>
                            )})}
                        </div>
                    )}
                </div>
            )})}
        </div>
    </>
);

const DeliveryModal = ({ isOpen, onClose, order, clientes = [], fornecedores = [] }) => {
  const [selectedDeliverer, setSelectedDeliverer] = useState('');
  const [error, setError] = useState('');
  const availableDeliverers = useMemo(
    () => (fornecedores || []).filter((f) => (f.status || 'Ativo') !== 'Inativo'),
    [fornecedores]
  );

  useEffect(() => {
    if (isOpen) {
      setSelectedDeliverer('');
      setError('');
    }
  }, [isOpen, order?.id]);

  if (!isOpen || !order) return null;

  const { enderecoTexto, locationLink } = getOrderAddressDetails(order, clientes);
  const canSend =
    availableDeliverers.length > 0 &&
    enderecoTexto &&
    enderecoTexto !== 'Não informado' &&
    enderecoTexto !== 'Retirar na Loja';

  const handleSend = () => {
    if (!selectedDeliverer) {
      setError('Selecione um entregador.');
      return;
    }
    const deliverer = availableDeliverers.find((f) => f.id === selectedDeliverer);
    const whatsappNumber = formatPhoneForWhatsApp(deliverer?.contato_whatsapp || deliverer?.contato_telefone);
    if (!deliverer || !whatsappNumber) {
      setError('O entregador selecionado não possui um telefone/WhatsApp válido.');
      return;
    }
    if (!canSend) {
      setError('Este pedido não possui um endereço válido para entrega.');
      return;
    }

    let message = `Olá ${deliverer.nome?.split(' ')[0] || 'entregador'}, segue o endereço para entrega.\n\n`;
    message += `Pedido: ${order.id?.substring(0, 8) || '-'}\n`;
    message += `Cliente: ${order.clienteNome || 'Cliente'}\n`;
    message += `Endereço: ${enderecoTexto}\n`;
    if (locationLink) {
      message += `Localização: ${locationLink}\n`;
    }
    if (order.telefone) {
      message += `Telefone do cliente: ${order.telefone}\n`;
    }
    if (order.observacao) {
      message += `Observações: ${order.observacao}\n`;
    }
    if (order.formaPagamento) {
      message += `Pagamento: ${order.formaPagamento}\n`;
    }
    if (order.total) {
      message += `Total: R$ ${(order.total || 0).toFixed(2)}\n`;
    }

    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Enviar endereço para entregador" size="md">
      <div className="space-y-4 text-sm text-gray-700">
        <div className="p-3 bg-gray-50 rounded-xl space-y-1">
          <p><strong>Cliente:</strong> {order.clienteNome || 'Cliente'}</p>
          <p><strong>Endereço:</strong> {enderecoTexto}</p>
          {locationLink && (
            <p className="truncate">
              <strong>Localização:</strong>{' '}
              <a href={locationLink} target="_blank" rel="noreferrer" className="text-pink-600 underline">
                Abrir no mapa
              </a>
            </p>
          )}
        </div>

        {availableDeliverers.length === 0 ? (
          <p className="text-sm text-red-500">Nenhum entregador cadastrado nos fornecedores.</p>
        ) : (
          <Select
            label="Selecione o entregador"
            value={selectedDeliverer}
            onChange={(e) => {
              setSelectedDeliverer(e.target.value);
              setError('');
            }}
          >
            <option value="">Escolha um entregador</option>
            {availableDeliverers.map((deliverer) => (
              <option key={deliverer.id} value={deliverer.id}>
                {deliverer.nome} {deliverer.categoria ? `(${deliverer.categoria})` : ''}
              </option>
            ))}
          </Select>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleSend}
            disabled={!canSend || availableDeliverers.length === 0}
            className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700"
          >
            <Truck className="w-4 h-4" /> Enviar via WhatsApp
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const generateStoreId = (value) => {
  if (!value) return '';
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return cleaned || `loja-${Date.now()}`;
};

const StoreManagerModal = ({
  isOpen,
  onClose,
  availableStores,
  storeInfoMap,
  onCreateStore,
  onSelectStore,
  canCreate,
  allowAllOption,
  currentStoreId,
  isCreatingStore
}) => {
  const [storeName, setStoreName] = useState('');
  const [storeIdInput, setStoreIdInput] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStoreName('');
      setStoreIdInput('');
      setError('');
      setSuccessMessage('');
	  setShowForm(false);

    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && canCreate && availableStores.length === 0) {
      setShowForm(true);
    }
  }, [isOpen, canCreate, availableStores.length]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canCreate) return;

    setError('');
    setSuccessMessage('');

    const name = storeName.trim();
    if (!name) {
      setError('Informe o nome da loja.');
      return;
    }

    let finalId = storeIdInput.trim();
    if (finalId) {
      finalId = generateStoreId(finalId);
    } else {
      finalId = generateStoreId(name);
    }

    if (finalId === STORE_ALL_KEY) {
      setError('Identificador inválido.');
      return;
    }

    if (!finalId) {
      setError('Não foi possível gerar um identificador para a loja.');
      return;
    }

    if (availableStores.includes(finalId)) {
      setError('Já existe uma loja com esse identificador.');
      return;
    }

    try {
      await onCreateStore({ storeId: finalId, nome: name });
      setSuccessMessage(`Loja "${name}" criada com sucesso!`);
      setStoreName('');
      setStoreIdInput('');
	  setShowForm(false);

    } catch (createError) {
      setError(createError.message || 'Não foi possível criar a loja.');
    }
  };

  const handleSelect = (value) => {
    onSelectStore(value);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gerenciar lojas" size="lg">
      <div className="space-y-6">
        {canCreate && (
          <div className="space-y-4">
            {showForm ? (
              <form onSubmit={handleSubmit} className="space-y-4 p-4 border border-gray-200 rounded-xl bg-white shadow-sm">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Adicionar nova loja</h3>
                  <p className="text-sm text-gray-500">Informe um nome para identificar a loja. Você pode ajustar o identificador se necessário.</p>
                </div>
                <Input
                  label="Nome da loja"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Ex: Loja Centro"
                  required
                />
                <Input
                  label="Identificador (opcional)"
                  value={storeIdInput}
                  onChange={(e) => setStoreIdInput(e.target.value)}
                  placeholder="Ex: loja-centro"
                />
                {error && <p className="text-sm text-red-500">{error}</p>}
                <div className="flex justify-end gap-3">
                  {availableStores.length > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setShowForm(false);
                        setStoreName('');
                        setStoreIdInput('');
                        setError('');
                      }}
                    >
                      Cancelar
                    </Button>
                  )}
                  <Button type="submit" disabled={isCreatingStore}>
                    <Plus className="w-4 h-4" />
                    {isCreatingStore ? 'Salvando...' : 'Criar loja'}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="p-4 border border-gray-200 rounded-xl flex items-center justify-between bg-white shadow-sm">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Adicionar nova loja</h3>
                  <p className="text-sm text-gray-500">Crie lojas para organizar suas unidades. Você pode adicionar quantas quiser.</p>
                </div>
                <Button
                  onClick={() => {
                    setShowForm(true);
                    setError('');
                    setSuccessMessage('');
                  }}
                >
                  <Plus className="w-4 h-4" /> Nova loja
                </Button>
              </div>
            )}
            {successMessage && !showForm && (
              <p className="text-sm text-green-600">{successMessage}</p>
            )}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-800">Lojas disponíveis</h3>

          {allowAllOption && availableStores.length > 0 && (
            <div className="p-4 border border-gray-200 rounded-xl flex items-center justify-between bg-gray-50">
              <div>
                <p className="font-semibold text-gray-800">Visão Geral</p>
                <p className="text-xs text-gray-500">Exibe dados combinados de todas as lojas.</p>
              </div>
              <Button
                size="sm"
                variant={currentStoreId === STORE_ALL_KEY ? 'secondary' : 'primary'}
                onClick={() => handleSelect(STORE_ALL_KEY)}
                disabled={currentStoreId === STORE_ALL_KEY}
              >
                {currentStoreId === STORE_ALL_KEY ? 'Selecionada' : 'Selecionar'}
              </Button>
            </div>
          )}

          {availableStores.length === 0 ? (
            <div className="p-6 border border-dashed border-gray-300 rounded-xl text-center space-y-3 bg-gray-50">
              <Store className="w-10 h-10 mx-auto text-gray-400" />
              <p className="text-base font-semibold text-gray-700">Nenhuma loja cadastrada</p>
              <p className="text-sm text-gray-500">Crie sua primeira loja para começar a organizar sua operação.</p>
              {canCreate && (
                <Button
                  onClick={() => {
                    setShowForm(true);
                    setError('');
                    setSuccessMessage('');
                  }}
                >
                  <Plus className="w-4 h-4" /> Criar primeira loja
                </Button>
              )}
            </div>
          ) : (
            availableStores.map((storeId) => {
              const info = storeInfoMap[storeId] || {};
              return (
                <div key={storeId} className="p-4 border border-gray-200 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800">{info.nome || storeId}</p>
                    <p className="text-xs text-gray-500">ID: {storeId}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={currentStoreId === storeId ? 'secondary' : 'primary'}
                    onClick={() => handleSelect(storeId)}
                    disabled={currentStoreId === storeId}
                  >
                    {currentStoreId === storeId ? 'Selecionada' : 'Selecionar'}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};


// Helper function
const getJSDate = (firestoreTimestamp) => {
  if (!firestoreTimestamp) return null;
  if (typeof firestoreTimestamp.toDate === 'function') {
    return firestoreTimestamp.toDate();
  }
  const date = new Date(firestoreTimestamp);
  return isNaN(date.getTime()) ? null : date;
};

const toDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCurrentMonthDateRange = () => {
  const today = new Date();
  return {
    start: toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
    end: toDateInputValue(new Date(today.getFullYear(), today.getMonth() + 1, 0))
  };
};

const parseDateInput = (value, endOfDay = false) => {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
};

const isDateInRange = (value, startValue, endValue) => {
  const date = getJSDate(value);
  if (!date) return false;

  const startDate = parseDateInput(startValue);
  const endDate = parseDateInput(endValue, true);

  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
};

const onlyDigitsText = (value) => String(value || '').replace(/\D/g, '');

const normalizeSearchText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const formatFiscalNumber = (value, size = 9) => {
  const digits = onlyDigitsText(value);
  return digits ? digits.padStart(size, '0') : '-';
};

const formatFiscalSeries = (value) => {
  const digits = onlyDigitsText(value);
  return digits ? digits.padStart(3, '0') : '-';
};

const formatCurrencyBR = (value) =>
  (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const maskCpfCnpj = (value) => {
  const digits = onlyDigitsText(value);
  if (digits.length === 11) return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
  if (digits.length === 14) return `${digits.slice(0, 2)}.***.***/****-${digits.slice(12)}`;
  return digits || '-';
};

// --- NOVOS COMPONENTES ---

const Fornecedores = ({ data, addItem, updateItem, deleteItem, setConfirmDelete, effectiveStoreId, updateStock, currentUser }) => {
    const [activeTab, setActiveTab] = usePersistentState('fornecedores_activeTab', 'fornecedores');
    
    // States
    const [searchTerm, setSearchTerm] = usePersistentState('fornecedores_searchTerm', '');
    
    const [showFornecedorModal, setShowFornecedorModal] = useState(false);
    const [editingFornecedor, setEditingFornecedor] = useState(null);
    const [fornecedorFormData, setFornecedorFormData] = useState({});
    
    const [showPedidoModal, setShowPedidoModal] = useState(false);
    const [editingPedido, setEditingPedido] = useState(null);
    const [pedidoFormData, setPedidoFormData] = useState({ fornecedorId: '', itens: [], valorTotal: 0, dataPedido: new Date().toISOString().split('T')[0], dataPrevistaEntrega: '', status: 'Pendente' });

    const [showEstoqueModal, setShowEstoqueModal] = useState(false);
    const [editingEstoque, setEditingEstoque] = useState(null);
    const [estoqueFormData, setEstoqueFormData] = useState({});
    const [estoqueSearchTerm, setEstoqueSearchTerm] = useState('');
    const [selectedEstoqueFornecedor, setSelectedEstoqueFornecedor] = useState('');

    const [showPerdaModal, setShowPerdaModal] = useState(false);
    const [showReceitaModal, setShowReceitaModal] = useState(false);
    const [editingReceita, setEditingReceita] = useState(null);
    const [receitaFormData, setReceitaFormData] = useState({});
    const [editingPerda, setEditingPerda] = useState(null);
    const [perdaFormData, setPerdaFormData] = useState({ produtoId: '', produtoNome: '', custoUnitario: '', quantidade: '', dataDescarte: '', motivo: 'Vencimento', outroMotivo: '' });

    const [stockMovementModal, setStockMovementModal] = useState({ isOpen: false, type: 'entrada', item: null });
    const [stockMovementQuantity, setStockMovementQuantity] = useState('');
    
    const [isAddingFornecedorCategoria, setIsAddingFornecedorCategoria] = useState(false);
    const [newFornecedorCategoria, setNewFornecedorCategoria] = useState('');
    const [isSavingFornecedorCategoria, setIsSavingFornecedorCategoria] = useState(false);
    const [previousFornecedorCategoria, setPreviousFornecedorCategoria] = useState('');

    const resetFornecedorForm = () => {
        setFornecedorFormData({ nome: '', cnpj_cpf: '', contato_telefone: '', contato_email: '', contato_whatsapp: '', endereco_completo: '', endereco_cep: '', categoria: DEFAULT_FORNECEDOR_CATEGORIES[0], dados_bancarios: '', observacoes: '', status: 'Ativo' });
        setIsAddingFornecedorCategoria(false);
        setNewFornecedorCategoria('');
        setIsSavingFornecedorCategoria(false);
        setPreviousFornecedorCategoria('');
    };
    const resetPedidoForm = () => setPedidoFormData({ fornecedorId: '', itens: [], valorTotal: 0, dataPedido: new Date().toISOString().split('T')[0], dataPrevistaEntrega: '', status: 'Pendente' });
    const resetEstoqueForm = () => setEstoqueFormData({ nome: '', categoria: DEFAULT_FORNECEDOR_CATEGORIES[0], fornecedorId: '', quantidade: '', unidade: 'un', custoUnitario: '', nivelMinimo: '' });
    const resetPerdaForm = () => setPerdaFormData({ produtoId: '', produtoNome: '', custoUnitario: '', quantidade: '', dataDescarte: new Date().toISOString().split('T')[0], motivo: 'Vencimento', outroMotivo: '' });
    const resetReceitaForm = () => setReceitaFormData({ nome: '', categoria: '', ingredientes: '', modoPreparo: '', tempoPreparo: '', rendimento: '', custoEstimado: '', observacoes: '' });

    const openStockMovementModal = (item, type) => {
        setStockMovementModal({ isOpen: true, type, item });
        setStockMovementQuantity('');
    };

    const closeStockMovementModal = () => {
        setStockMovementModal({ isOpen: false, type: 'entrada', item: null });
        setStockMovementQuantity('');
    };

    const handleStockMovementSubmit = async (event) => {
        event.preventDefault();
        const quantity = parseFloat(stockMovementQuantity);

        if (!quantity || quantity <= 0) {
            alert('Informe uma quantidade válida para a movimentação.');
            return;
        }

        try {
            await updateStock(
                stockMovementModal.item.id,
                stockMovementModal.type,
                quantity,
                `Movimentação rápida - ${stockMovementModal.type}`,
                currentUser
            );
            closeStockMovementModal();
        } catch (error) {
            console.error('Erro ao movimentar estoque', error);
            alert(error.message || 'Erro ao atualizar estoque.');
        }
    };

    const fornecedorCategories = useMemo(() => {
        const customCategories = (data.categoriasFornecedores || [])
            .map(item => {
                if (!item) return null;
                if (typeof item === 'string') return item;
                return item.nome;
            })
            .filter(Boolean);

        const combined = [...DEFAULT_FORNECEDOR_CATEGORIES, ...customCategories];
        if (fornecedorFormData.categoria && fornecedorFormData.categoria.trim()) {
            combined.push(fornecedorFormData.categoria.trim());
        }
        if (estoqueFormData.categoria && estoqueFormData.categoria.trim()) {
            combined.push(estoqueFormData.categoria.trim());
        }

        const seen = new Set();
        const unique = [];
        combined.forEach(cat => {
            const normalized = typeof cat === 'string' ? cat.trim() : '';
            if (!normalized) return;
            const key = normalized.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(normalized);
            }
        });

        return unique;
    }, [data.categoriasFornecedores, fornecedorFormData.categoria, estoqueFormData.categoria]);
    
	useEffect(() => {
		const total = (pedidoFormData.itens || []).reduce((sum, item) => 
			sum + ((item.quantidade || 0) * (item.custoUnitario || 0)), 0
		);
		
		// Só atualiza se mudou para evitar loop
		if (total !== pedidoFormData.valorTotal) {
			setPedidoFormData(prev => ({ ...prev, valorTotal: total }));
        }
    }, [pedidoFormData.itens, pedidoFormData.valorTotal]);

    const handlePerdaProdutoChange = async (e) => {
        const produtoId = e.target.value;
        setPerdaFormData(prev => ({ ...prev, produtoId, produtoNome: '', custoUnitario: '' }));

        if (!produtoId || !effectiveStoreId) return;

        try {
            const produtoDoc = await getDoc(doc(db, 'lojas', effectiveStoreId, 'produtos', produtoId));
            if (!produtoDoc.exists()) return;

            const produtoData = produtoDoc.data() || {};
            const custo = produtoData.custo ?? produtoData.custoUnitario ?? '';
            setPerdaFormData(prev => ({
                ...prev,
                produtoId,
                produtoNome: produtoData.nome || '',
                custoUnitario: custo
            }));
        } catch (error) {
            console.error('Erro ao buscar produto para perda', error);
        }
    };

    // Memoized Filters
    const filteredFornecedores = useMemo(() => (data.fornecedores || []).filter(f => (f.nome && f.nome.toLowerCase().includes(searchTerm.toLowerCase())) || (f.categoria && f.categoria.toLowerCase().includes(searchTerm.toLowerCase()))), [data.fornecedores, searchTerm]);
    const pedidosComNomes = useMemo(() => (data.pedidosCompra || []).map(pedido => ({ ...pedido, fornecedorNome: data.fornecedores.find(f => f.id === pedido.fornecedorId)?.nome || 'N/A' })), [data.pedidosCompra, data.fornecedores]);
    const estoqueComNomes = useMemo(() => (data.estoque || []).map(item => ({ ...item, fornecedorNome: data.fornecedores.find(f => f.id === item.fornecedorId)?.nome || 'N/A' })), [data.estoque, data.fornecedores]);
    const estoqueFornecedores = useMemo(() => {
        const fornecedores = new Set();
        (estoqueComNomes || []).forEach(item => {
            if (item.fornecedorNome) {
                fornecedores.add(item.fornecedorNome);
            }
        });
        return Array.from(fornecedores).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, [estoqueComNomes]);
    const filteredEstoque = useMemo(() => {
        const normalizedSearch = estoqueSearchTerm.trim().toLowerCase();
        const normalizedFornecedor = selectedEstoqueFornecedor.trim().toLowerCase();
        return (estoqueComNomes || []).filter((item) => {
            const itemNome = (item.nome || '').toLowerCase();
            const itemFornecedor = (item.fornecedorNome || '').toLowerCase();
            const matchesName = itemNome.includes(normalizedSearch);
            const matchesFornecedor = normalizedFornecedor ? itemFornecedor === normalizedFornecedor : true;
            return matchesName && matchesFornecedor;
        });
    }, [estoqueComNomes, estoqueSearchTerm, selectedEstoqueFornecedor]);
    const perdasOrdenadas = useMemo(() => {
        const perdas = data.perdasDescarte || [];
        const mapped = perdas.map(perda => {
            const produto = (data.produtos || []).find(p => p.id === perda.produtoId);
            const custo = perda.custoUnitario ?? produto?.custo ?? produto?.custoUnitario ?? 0;
            return {
                ...perda,
                produtoNome: produto?.nome || perda.produtoNome || 'Produto',
                custoUnitario: custo,
                valorTotal: perda.valorTotal ?? ((perda.quantidade || 0) * custo)
            };
        });

        return mapped.sort((a, b) => {
            const dateA = getJSDate(a.dataDescarte) || new Date(0);
            const dateB = getJSDate(b.dataDescarte) || new Date(0);
            return dateB - dateA;
        });
    }, [data.perdasDescarte, data.produtos]);

    const perdaValorTotal = useMemo(() => {
        const quantidade = parseFloat(perdaFormData.quantidade || 0) || 0;
        const custo = parseFloat(perdaFormData.custoUnitario || 0) || 0;
        return quantidade * custo;
    }, [perdaFormData.quantidade, perdaFormData.custoUnitario]);


    // Handlers Fornecedores
    const handleNewFornecedor = () => { setEditingFornecedor(null); resetFornecedorForm(); setShowFornecedorModal(true); };
    const handleEditFornecedor = (fornecedor) => { setEditingFornecedor(fornecedor); setFornecedorFormData(fornecedor); setIsAddingFornecedorCategoria(false); setNewFornecedorCategoria(''); setIsSavingFornecedorCategoria(false); setPreviousFornecedorCategoria(''); setShowFornecedorModal(true); };
    const handleFornecedorSubmit = async (e) => { e.preventDefault(); if (editingFornecedor) { await updateItem('fornecedores', editingFornecedor.id, fornecedorFormData); } else { await addItem('fornecedores', fornecedorFormData); } setShowFornecedorModal(false); };

    const handleFornecedorCategoriaChange = (e) => {
        const value = e.target.value;
        if (value === '__add_new__') {
            setIsAddingFornecedorCategoria(true);
            setNewFornecedorCategoria('');
            setPreviousFornecedorCategoria(fornecedorFormData.categoria || DEFAULT_FORNECEDOR_CATEGORIES[0]);
            setFornecedorFormData(prev => ({ ...prev, categoria: '' }));
            return;
        }
        setIsAddingFornecedorCategoria(false);
        setNewFornecedorCategoria('');
        setPreviousFornecedorCategoria('');
        setFornecedorFormData(prev => ({ ...prev, categoria: value || DEFAULT_FORNECEDOR_CATEGORIES[0] }));
    };

    const handleCancelFornecedorCategoria = () => {
        setIsAddingFornecedorCategoria(false);
        setNewFornecedorCategoria('');
        setIsSavingFornecedorCategoria(false);
        setFornecedorFormData(prev => ({ ...prev, categoria: previousFornecedorCategoria || DEFAULT_FORNECEDOR_CATEGORIES[0] }));
        setPreviousFornecedorCategoria('');
    };

    const handleCreateFornecedorCategoria = async () => {
        const trimmed = newFornecedorCategoria.trim();
        if (!trimmed) {
            alert('Informe o nome da nova categoria.');
            return;
        }

        const existing = fornecedorCategories.find(cat => cat.toLowerCase() === trimmed.toLowerCase());
        if (existing) {
            alert('Esta categoria já existe.');
            setFornecedorFormData(prev => ({ ...prev, categoria: existing }));
            setIsAddingFornecedorCategoria(false);
            setNewFornecedorCategoria('');
            return;
        }

        try {
            setIsSavingFornecedorCategoria(true);
            await addItem('categoriasFornecedores', { nome: trimmed });
            setFornecedorFormData(prev => ({ ...prev, categoria: trimmed }));
            setIsAddingFornecedorCategoria(false);
            setNewFornecedorCategoria('');
            setPreviousFornecedorCategoria('');
        } catch (error) {
            console.error('Erro ao criar categoria de fornecedor:', error);
            alert('Não foi possível salvar a nova categoria. Tente novamente.');
        } finally {
            setIsSavingFornecedorCategoria(false);
        }
    };

    // Handlers Pedidos de Compra
    const handleNewPedido = () => { setEditingPedido(null); resetPedidoForm(); setShowPedidoModal(true); };
    const handleEditPedido = (pedido) => { setEditingPedido(pedido); setPedidoFormData({ ...pedido, dataPedido: pedido.dataPedido?.split('T')[0] || '', dataPrevistaEntrega: pedido.dataPrevistaEntrega?.split('T')[0] || '' }); setShowPedidoModal(true); };
    const handlePedidoSubmit = async (e) => { e.preventDefault(); if (editingPedido) { await updateItem('pedidosCompra', editingPedido.id, pedidoFormData); } else { await addItem('pedidosCompra', pedidoFormData); } setShowPedidoModal(false); };
    const handleUpdatePedidoStatus = async (pedido, status) => { await updateItem('pedidosCompra', pedido.id, { ...pedido, status }); if (status === 'Recebido') { const conta = { descricao: `Compra de ${pedido.fornecedorNome}`, valor: pedido.valorTotal, dataVencimento: new Date().toISOString().split('T')[0], status: 'Pendente', categoria: 'Fornecedores', pedidoCompraId: pedido.id }; await addItem('contas_a_pagar', conta); alert('Conta a pagar gerada no financeiro!'); } };
    const handleAddItemToPedido = (item) => { setPedidoFormData(prev => ({...prev, itens: [...(prev.itens || []), {...item, quantidade: 1, custoUnitario: item.custoUnitario || 0}]}))};
    const handleUpdateItemInPedido = (index, field, value) => { const newItens = [...pedidoFormData.itens]; newItens[index][field] = value; setPedidoFormData(prev => ({...prev, itens: newItens})) };
    const handleRemoveItemFromPedido = (index) => { const newItens = pedidoFormData.itens.filter((_, i) => i !== index); setPedidoFormData(prev => ({...prev, itens: newItens}));};

    // Handlers Estoque
    const handleNewEstoque = () => { setEditingEstoque(null); resetEstoqueForm(); setShowEstoqueModal(true); };
    const handleEditEstoque = (item) => { setEditingEstoque(item); setEstoqueFormData(item); setShowEstoqueModal(true); };
    const handleEstoqueSubmit = async (e) => { e.preventDefault(); const dataToSave = { ...estoqueFormData, quantidade: parseFloat(estoqueFormData.quantidade || 0), custoUnitario: parseFloat(estoqueFormData.custoUnitario || 0), nivelMinimo: parseFloat(estoqueFormData.nivelMinimo || 0) }; if (editingEstoque) { await updateItem('estoque', editingEstoque.id, dataToSave); } else { await addItem('estoque', dataToSave); } setShowEstoqueModal(false); };

    const handleNewPerda = () => { setEditingPerda(null); resetPerdaForm(); setShowPerdaModal(true); };
    const handleEditPerda = (perda) => { setEditingPerda(perda); setPerdaFormData({ produtoId: perda.produtoId || '', produtoNome: perda.produtoNome || '', custoUnitario: perda.custoUnitario ?? '', quantidade: perda.quantidade ?? '', dataDescarte: perda.dataDescarte?.split('T')[0] || perda.dataDescarte || '', motivo: perda.motivo || 'Vencimento', outroMotivo: perda.outroMotivo || '' }); setShowPerdaModal(true); };
    const handlePerdaSubmit = async (e) => {
        e.preventDefault();
        if (!perdaFormData.produtoId) { alert('Selecione um produto.'); return; }
        const quantidade = parseFloat(perdaFormData.quantidade || 0);
        if (!quantidade || quantidade <= 0) { alert('A quantidade deve ser maior que zero.'); return; }
        const custoUnitario = parseFloat(perdaFormData.custoUnitario || 0);
        const valorTotal = quantidade * custoUnitario;
        const dataToSave = {
            ...perdaFormData,
            quantidade,
            custoUnitario,
            valorTotal,
            motivo: perdaFormData.motivo === 'Outro' ? (perdaFormData.outroMotivo || 'Outro') : perdaFormData.motivo
        };
        if (editingPerda) { await updateItem('perdasDescarte', editingPerda.id, dataToSave); } else { await addItem('perdasDescarte', dataToSave); }
        setShowPerdaModal(false);
    };
    const handleDeletePerda = (perda) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('perdasDescarte', perda.id) });

    const handleNewReceita = () => { setEditingReceita(null); resetReceitaForm(); setShowReceitaModal(true); };
    const handleEditReceita = (receita) => { setEditingReceita(receita); setReceitaFormData({ ...receita }); setShowReceitaModal(true); };
    const handleDeleteReceita = (receita) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('receitas', receita.id) });
    const handleReceitaSubmit = async (e) => {
        e.preventDefault();
        const requiredFields = ['nome', 'categoria', 'ingredientes', 'modoPreparo', 'tempoPreparo', 'rendimento', 'custoEstimado'];
        const hasEmpty = requiredFields.some((field) => !String(receitaFormData[field] ?? '').trim());
        if (hasEmpty) { alert('Preencha todos os campos obrigatórios da receita.'); return; }

        const dataToSave = {
            ...receitaFormData,
            tempoPreparo: parseInt(receitaFormData.tempoPreparo || 0, 10),
            rendimento: parseInt(receitaFormData.rendimento || 0, 10),
            custoEstimado: parseFloat(receitaFormData.custoEstimado || 0)
        };

        if (editingReceita) { await updateItem('receitas', editingReceita.id, dataToSave); }
        else { await addItem('receitas', dataToSave); }
        setShowReceitaModal(false);
    };

    // UI Rendering
    return (
        <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
            <div><h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Gestão de Fornecedores/Estoque</h1><p className="text-gray-600 mt-1">Organize seus parceiros, compras e insumos</p></div>
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-2"><div className="flex space-x-2">
                {['fornecedores', 'pedidos', 'estoque', 'receitas', 'perdas'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === tab ? 'bg-pink-600 text-white' : 'hover:bg-pink-100'}`}>
                        {tab === 'fornecedores' && 'Fornecedores'}{tab === 'pedidos' && 'Pedidos de Compra'}{tab === 'estoque' && 'Estoque'}{tab === 'receitas' && 'Receitas'}{tab === 'perdas' && 'Perdas/Descarte'}
                    </button>
                ))}
            </div></div>
            
            {activeTab === 'fornecedores' && (
                <div>
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                        <div className="relative max-w-md w-full"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" /><input type="text" placeholder="Buscar por nome ou categoria..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-pink-500" /></div>
                        <Button onClick={handleNewFornecedor} className="w-full md:w-auto"><Plus className="w-4 h-4" /> Novo Fornecedor</Button>
                    </div>
                    <Table columns={[{ header: 'Fornecedor', key: 'nome' }, { header: 'Telefone', key: 'contato_telefone' }, { header: 'Categoria', key: 'categoria' }, { header: "Status", render: (row) => (<span className={`px-3 py-1 rounded-full text-xs font-medium ${row.status === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{row.status}</span>) }]} data={filteredFornecedores} actions={[{ icon: Edit, label: "Editar", onClick: handleEditFornecedor }, { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('fornecedores', row.id) }) }]} />
                </div>
            )}
            {activeTab === 'pedidos' && (
                 <div>
                    <div className="flex justify-end mb-6"><Button onClick={handleNewPedido}><Plus className="w-4 h-4" /> Novo Pedido de Compra</Button></div>
                    <Table columns={[{ header: 'Fornecedor', key: 'fornecedorNome' }, { header: 'Data do Pedido', render: (row) => getJSDate(row.dataPedido)?.toLocaleDateString('pt-BR') || '-' }, { header: 'Previsão de Entrega', render: (row) => getJSDate(row.dataPrevistaEntrega)?.toLocaleDateString('pt-BR') || '-' }, { header: 'Valor Total', render: (row) => `R$ ${(row.valorTotal || 0).toFixed(2)}`}, { header: 'Status', render: (row) => <span className={`px-3 py-1 rounded-full text-xs font-medium ${row.status === 'Recebido' ? 'bg-green-100 text-green-800' : row.status === 'Pendente' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>{row.status}</span> }]} data={pedidosComNomes} actions={[{ icon: Edit, label: "Editar", onClick: handleEditPedido }, { icon: Truck, label: "Receber", onClick: (row) => handleUpdatePedidoStatus(row, 'Recebido') }, { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('pedidosCompra', row.id) }) }]} />
                </div>
            )}
             {activeTab === 'estoque' && (
                 <div>
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                        <div className="flex flex-col sm:flex-row gap-3 w-full md:max-w-2xl">
                            <div className="relative w-full">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar item..."
                                    value={estoqueSearchTerm}
                                    onChange={(e) => setEstoqueSearchTerm(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-pink-500"
                                />
                            </div>
                            <select
                                value={selectedEstoqueFornecedor}
                                onChange={(e) => setSelectedEstoqueFornecedor(e.target.value)}
                                className="w-full sm:w-64 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-pink-500 bg-white"
                            >
                                <option value="">Todos os fornecedores</option>
                                {estoqueFornecedores.map((fornecedorNome) => (
                                    <option key={fornecedorNome} value={fornecedorNome}>{fornecedorNome}</option>
                                ))}
                            </select>
                        </div>
                        <Button onClick={handleNewEstoque} className="w-full md:w-auto"><PackagePlus className="w-4 h-4" /> Novo Item de Estoque</Button>
                    </div>
                    <Table
                        columns={[
                            { header: 'Item', key: 'nome' },
                            { header: 'Fornecedor', key: 'fornecedorNome' },
                            { header: 'Estoque Atual', render: (row) => `${row.quantidade || 0} ${row.unidade}` },
                            {
                                header: 'Movimentação Rápida',
                                render: (row) => (
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="!px-3 !py-2 text-xs"
                                            onClick={() => openStockMovementModal(row, 'entrada')}
                                        >
                                            + Entrada
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="!px-3 !py-2 text-xs text-red-600 border-red-200 hover:border-red-300 hover:text-red-700"
                                            onClick={() => openStockMovementModal(row, 'saida')}
                                        >
                                            - Saída
                                        </Button>
                                    </div>
                                )
                            },
                            { header: 'Custo Unitário', render: (row) => `R$ ${(row.custoUnitario || 0).toFixed(2)}` }
                        ]}
                        data={filteredEstoque}
                        actions={[ { icon: Edit, label: "Editar", onClick: handleEditEstoque }, { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('estoque', row.id) }) } ]}
                    />
                    {filteredEstoque.length === 0 && (
                        <div className="px-4 py-6 text-center text-gray-500">Nenhum item encontrado</div>
                    )}
                </div>
            )}

            {activeTab === 'receitas' && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <Button onClick={handleNewReceita} className="w-full md:w-auto"><Plus className="w-4 h-4" /> Nova Receita</Button>
                    </div>
                    <ReceitasList receitas={data.receitas || []} onEdit={handleEditReceita} onDelete={handleDeleteReceita} />
                </div>
            )}

            {activeTab === 'perdas' && (
                <div>
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-800">Perdas e Descarte</h2>
                            <p className="text-sm text-gray-600">Registre perdas de estoque e motivos de descarte</p>
                        </div>
                        <Button onClick={handleNewPerda} className="w-full md:w-auto"><PackagePlus className="w-4 h-4" /> ➕ Nova Perda/Descarte</Button>
                    </div>
                    <Table
                        columns={[
                            { header: 'Produto', key: 'produtoNome' },
                            { header: 'Valor de Custo (R$)', render: (row) => `R$ ${(row.custoUnitario || 0).toFixed(2)}` },
                            { header: 'Quantidade', key: 'quantidade' },
                            { header: 'Valor Total da Perda', render: (row) => `R$ ${((row.valorTotal ?? ((row.quantidade || 0) * (row.custoUnitario || 0))).toFixed(2))}` },
                            { header: 'Data do Descarte', render: (row) => getJSDate(row.dataDescarte)?.toLocaleDateString('pt-BR') || '-' },
                            { header: 'Motivo da Perda', render: (row) => row.motivo || '-' }
                        ]}
                        data={perdasOrdenadas}
                        actions={[
                            { icon: Edit, label: "Editar", onClick: handleEditPerda },
                            { icon: Trash2, label: "Excluir", onClick: handleDeletePerda }
                        ]}
                    />
                </div>
            )}

            <Modal isOpen={showFornecedorModal} onClose={() => setShowFornecedorModal(false)} title={editingFornecedor ? 'Editar Fornecedor' : 'Novo Fornecedor'} size="lg">
                <form onSubmit={handleFornecedorSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Nome/Razão Social" value={fornecedorFormData.nome || ''} onChange={e => setFornecedorFormData({...fornecedorFormData, nome: e.target.value})} required/>
                        <Input label="CNPJ/CPF" value={fornecedorFormData.cnpj_cpf || ''} onChange={e => setFornecedorFormData({...fornecedorFormData, cnpj_cpf: e.target.value})}/>
                        <Input label="Telefone" value={fornecedorFormData.contato_telefone || ''} onChange={e => setFornecedorFormData({...fornecedorFormData, contato_telefone: e.target.value})}/>
                        <Input label="Email" type="email" value={fornecedorFormData.contato_email || ''} onChange={e => setFornecedorFormData({...fornecedorFormData, contato_email: e.target.value})}/>
                        <Input label="Endereço Completo" value={fornecedorFormData.endereco_completo || ''} onChange={e => setFornecedorFormData({...fornecedorFormData, endereco_completo: e.target.value})}/>
                        <Select label="Categoria" value={fornecedorFormData.categoria || ''} onChange={handleFornecedorCategoriaChange}>
                            <option value="">Selecione...</option>
                            {fornecedorCategories.map(categoria => (
                                <option key={categoria} value={categoria}>{categoria}</option>
                            ))}
                            <option value="__add_new__">+ Adicionar nova categoria</option>
                        </Select>
                        {isAddingFornecedorCategoria && (
                            <div className="md:col-span-2 bg-pink-50 border border-pink-100 rounded-2xl p-4 space-y-3">
                                <div className="flex flex-col md:flex-row gap-3">
                                    <div className="flex-1">
                                        <Input label="Nova Categoria" placeholder="Digite o nome da categoria" value={newFornecedorCategoria} onChange={(e) => setNewFornecedorCategoria(e.target.value)} />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button type="button" variant="secondary" onClick={handleCancelFornecedorCategoria} className="whitespace-nowrap">Cancelar</Button>
                                        <Button type="button" onClick={handleCreateFornecedorCategoria} disabled={isSavingFornecedorCategoria} className="whitespace-nowrap">
                                            {isSavingFornecedorCategoria ? 'Salvando...' : 'Salvar Categoria'}
                                        </Button>
                                    </div>
                                </div>
                                <p className="text-sm text-pink-700">A nova categoria ficará disponível automaticamente para todos os cadastros desta loja.</p>
                            </div>
                        )}
                    </div>
                    <Textarea label="Dados Bancários" rows="2" value={fornecedorFormData.dados_bancarios || ''} onChange={e => setFornecedorFormData({...fornecedorFormData, dados_bancarios: e.target.value})}/>
                    <Textarea label="Observações" rows="2" value={fornecedorFormData.observacoes || ''} onChange={e => setFornecedorFormData({...fornecedorFormData, observacoes: e.target.value})}/>
                    <div className="flex justify-end gap-3 pt-4"><Button variant="secondary" type="button" onClick={() => setShowFornecedorModal(false)}>Cancelar</Button><Button type="submit"><Save className="w-4 h-4"/> Salvar</Button></div>
                </form>
            </Modal>
            <Modal isOpen={showPedidoModal} onClose={() => setShowPedidoModal(false)} title={editingPedido ? 'Editar Pedido de Compra' : 'Novo Pedido de Compra'} size="xl">
                <form onSubmit={handlePedidoSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select label="Fornecedor" value={pedidoFormData.fornecedorId || ''} onChange={e => setPedidoFormData({...pedidoFormData, fornecedorId: e.target.value, fornecedorNome: e.target.selectedOptions[0].text })} required><option value="">Selecione...</option>{data.fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</Select>
                        <Input label="Data do Pedido" type="date" value={pedidoFormData.dataPedido || ''} onChange={e => setPedidoFormData({...pedidoFormData, dataPedido: e.target.value})} required/>
                        <Input label="Previsão de Entrega" type="date" value={pedidoFormData.dataPrevistaEntrega || ''} onChange={e => setPedidoFormData({...pedidoFormData, dataPrevistaEntrega: e.target.value})} />
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <h3 className="font-semibold">Adicionar Itens do Estoque</h3>
                            <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                                {data.estoque.map(item => (<div key={item.id} className="flex justify-between items-center p-2 rounded hover:bg-gray-50"><span>{item.nome}</span><Button size="sm" variant="secondary" onClick={() => handleAddItemToPedido(item)}>+</Button></div>))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <h3 className="font-semibold">Itens no Pedido</h3>
                            <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                                {(pedidoFormData.itens || []).length === 0 ? <p className="text-sm text-gray-500 text-center p-4">Nenhum item</p> : 
                                (pedidoFormData.itens || []).map((item, index) => (
                                    <div key={index} className="grid grid-cols-4 gap-2 items-center p-1">
                                        <span className="col-span-2 text-sm">{item.nome}</span>
                                        <Input type="number" placeholder="Qtd" value={item.quantidade} onChange={e => handleUpdateItemInPedido(index, 'quantidade', parseFloat(e.target.value || 0))} className="py-1"/>
                                        <div className="flex items-center gap-1">
                                        <Input type="number" step="0.01" placeholder="Custo" value={item.custoUnitario} onChange={e => handleUpdateItemInPedido(index, 'custoUnitario', parseFloat(e.target.value || 0))} className="py-1"/>
                                        <button type="button" onClick={() => handleRemoveItemFromPedido(index)} className="text-red-500"><Trash2 size={14}/></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="text-right font-bold text-lg mt-2">Total: R$ {(pedidoFormData.valorTotal || 0).toFixed(2)}</div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4"><Button variant="secondary" type="button" onClick={() => setShowPedidoModal(false)}>Cancelar</Button><Button type="submit"><Save className="w-4 h-4"/> Salvar Pedido</Button></div>
                </form>
            </Modal>
            <Modal isOpen={showEstoqueModal} onClose={() => setShowEstoqueModal(false)} title={editingEstoque ? 'Editar Item de Estoque' : 'Novo Item de Estoque'} size="lg">
                <form onSubmit={handleEstoqueSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Nome do Item" value={estoqueFormData.nome || ''} onChange={e => setEstoqueFormData({...estoqueFormData, nome: e.target.value})} required/>
                        <Select label="Categoria" value={estoqueFormData.categoria || ''} onChange={e => setEstoqueFormData({...estoqueFormData, categoria: e.target.value})}>
                            {fornecedorCategories.map(categoria => (
                                <option key={categoria} value={categoria}>{categoria}</option>
                            ))}
                        </Select>
                        <Select label="Fornecedor Principal" value={estoqueFormData.fornecedorId || ''} onChange={e => setEstoqueFormData({...estoqueFormData, fornecedorId: e.target.value})}><option value="">Nenhum</option>{data.fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</Select>
                        <Input label="Custo por Unidade (R$)" type="number" step="0.01" value={estoqueFormData.custoUnitario || ''} onChange={e => setEstoqueFormData({...estoqueFormData, custoUnitario: e.target.value})} />
                        <Input label="Quantidade Atual" type="number" value={estoqueFormData.quantidade || ''} onChange={e => setEstoqueFormData({...estoqueFormData, quantidade: e.target.value})} required/>
                        <Select label="Unidade de Medida" value={estoqueFormData.unidade || ''} onChange={e => setEstoqueFormData({...estoqueFormData, unidade: e.target.value})}><option>un</option><option>kg</option><option>g</option><option>L</option><option>ml</option></Select>
                        <Input label="Nível Mínimo de Estoque" type="number" value={estoqueFormData.nivelMinimo || ''} onChange={e => setEstoqueFormData({...estoqueFormData, nivelMinimo: e.target.value})} />
                    </div>
                    <div className="flex justify-end gap-3 pt-4"><Button variant="secondary" type="button" onClick={() => setShowEstoqueModal(false)}>Cancelar</Button><Button type="submit"><Save className="w-4 h-4"/> Salvar Item</Button></div>
                </form>
            </Modal>
            <ReceitasModal
                isOpen={showReceitaModal}
                onClose={() => setShowReceitaModal(false)}
                onSubmit={handleReceitaSubmit}
                formData={receitaFormData}
                setFormData={setReceitaFormData}
                editingReceita={editingReceita}
                Modal={Modal}
                Input={Input}
                Select={Select}
                Textarea={Textarea}
                Button={Button}
                Save={Save}
            />

            <Modal
                isOpen={stockMovementModal.isOpen}
                onClose={closeStockMovementModal}
                title={`Registrar ${stockMovementModal.type === 'entrada' ? 'Entrada' : 'Saída'} de Estoque`}
                size="sm"
            >
                <form onSubmit={handleStockMovementSubmit} className="space-y-4">
                    <div className="text-sm text-gray-700">
                        <p className="font-semibold">Item</p>
                        <p>{stockMovementModal.item?.nome || '-'}</p>
                    </div>
                    <Input
                        label="Quantidade"
                        type="number"
                        min="0"
                        step="0.01"
                        value={stockMovementQuantity}
                        onChange={(e) => setStockMovementQuantity(e.target.value)}
                        required
                    />
                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="secondary" type="button" onClick={closeStockMovementModal}>Cancelar</Button>
                        <Button type="submit">Confirmar</Button>
                    </div>
                </form>
            </Modal>
            <Modal isOpen={showPerdaModal} onClose={() => setShowPerdaModal(false)} title={editingPerda ? 'Editar Perda/Descarte' : 'Nova Perda/Descarte'} size="lg">
                <form onSubmit={handlePerdaSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select label="Produto" value={perdaFormData.produtoId} onChange={handlePerdaProdutoChange} required>
                            <option value="">Selecione um produto</option>
                            {(data.produtos || []).map(produto => (
                                <option key={produto.id} value={produto.id}>{produto.nome}</option>
                            ))}
                        </Select>
                        <Input label="Valor de Custo (R$)" type="number" step="0.01" value={perdaFormData.custoUnitario || ''} onChange={e => setPerdaFormData({...perdaFormData, custoUnitario: e.target.value})} />
                        <Input label="Quantidade" type="number" min="0" value={perdaFormData.quantidade || ''} onChange={e => setPerdaFormData({...perdaFormData, quantidade: e.target.value})} required/>
                        <Input label="Data do Descarte" type="date" value={perdaFormData.dataDescarte || ''} onChange={e => setPerdaFormData({...perdaFormData, dataDescarte: e.target.value})} required/>
                        <Select label="Motivo da Perda" value={perdaFormData.motivo} onChange={e => setPerdaFormData({...perdaFormData, motivo: e.target.value})}>
                            <option value="Vencimento">Vencimento</option>
                            <option value="Dano no transporte">Dano no transporte</option>
                            <option value="Erro de produção">Erro de produção</option>
                            <option value="Produto danificado">Produto danificado</option>
                            <option value="Outro">Outro</option>
                        </Select>
                        {perdaFormData.motivo === 'Outro' && (
                            <Input label="Detalhe o motivo" value={perdaFormData.outroMotivo || ''} onChange={e => setPerdaFormData({...perdaFormData, outroMotivo: e.target.value})} />
                        )}
                    </div>
                    <div className="p-4 bg-pink-50 border border-pink-100 rounded-xl flex items-center justify-between text-sm text-pink-900">
                        <span>Valor total da perda</span>
                        <span className="text-lg font-bold text-rose-600">R$ {perdaValorTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-end gap-3 pt-4"><Button variant="secondary" type="button" onClick={() => setShowPerdaModal(false)}>Cancelar</Button><Button type="submit"><Save className="w-4 h-4"/> Salvar Perda</Button></div>
                </form>
            </Modal>
        </div>
    );
};


const Financeiro = ({ data, addItem, updateItem, deleteItem, setConfirmDelete }) => {
    const [activeTab, setActiveTab] = usePersistentState('financeiro_activeTab', 'dashboard');
    const [modalConfig, setModalConfig] = useState({ isOpen: false, type: null, item: null });
    const [formData, setFormData] = useState({});
    const chartsRef = useRef({});
    const [startDate, setStartDate] = usePersistentState('financeiro_startDate', '');
    const [endDate, setEndDate] = usePersistentState('financeiro_endDate', '');
    const [despesaFilter, setDespesaFilter] = usePersistentState('financeiro_despesaFilter', 'Todas');

    const monthlyChartRef = useRef(null);
    const categoryChartRef = useRef(null);
    
	useEffect(() => {
		if (activeTab !== 'dashboard' || !monthlyChartRef.current || !categoryChartRef.current || typeof window.Chart === 'undefined') {
			return;
		}

		// Destrói gráficos existentes
        const existingCharts = Object.values(chartsRef.current);
		existingCharts.forEach(chart => {
			if (chart && typeof chart.destroy === 'function') {
				chart.destroy();
			}
		});

		const monthlyCtx = monthlyChartRef.current.getContext('2d');
		const monthlyData = {
			labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
			datasets: [
				{ label: 'Receitas', data: Array(12).fill(0), backgroundColor: 'rgba(34, 197, 94, 0.6)' },
				{ label: 'Despesas', data: Array(12).fill(0), backgroundColor: 'rgba(239, 68, 68, 0.6)' }
			]
		};
		
		const allReceitas = [
			...(data.pedidos || []).filter(p => p.status === 'Finalizado'),
			...(data.contas_a_receber || []).filter(r => r.status === 'Recebido')
		];

		allReceitas.forEach(item => {
			const date = getJSDate(item.createdAt || item.dataRecebimento);
			if (date) monthlyData.datasets[0].data[date.getMonth()] += (item.total || item.valor || 0);
		});

		(data.contas_a_pagar || []).forEach(item => {
			if (item.status === 'Pago') {
				const date = getJSDate(item.dataVencimento);
				if (date) monthlyData.datasets[1].data[date.getMonth()] += item.valor;
			}
		});
		
		const monthlyChart = new window.Chart(monthlyCtx, { 
			type: 'bar', 
			data: monthlyData, 
			options: { 
				responsive: true, 
				plugins: { 
					title: { display: true, text: 'Fluxo de Caixa Mensal' } 
				} 
			} 
		});

		const categoryCtx = categoryChartRef.current.getContext('2d');
		const categoryData = (data.contas_a_pagar || [])
			.filter(i => i.status === 'Pago')
			.reduce((acc, item) => {
				acc[item.categoria] = (acc[item.categoria] || 0) + item.valor;
				return acc;
			}, {});
			
		const pieChart = new window.Chart(categoryCtx, { 
			type: 'pie', 
			data: { 
				labels: Object.keys(categoryData), 
				datasets: [{ 
					data: Object.values(categoryData), 
					backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'] 
				}] 
			}, 
			options: { 
				responsive: true, 
				plugins: { 
					title: { display: true, text: 'Despesas por Categoria' } 
				} 
			} 
		});

        chartsRef.current = { monthlyChart, pieChart };

		return () => {
			if (monthlyChart) monthlyChart.destroy();
			if (pieChart) pieChart.destroy();
		};
	}, [activeTab, data.pedidos, data.contas_a_receber, data.contas_a_pagar]);

    const financialSummary = useMemo(() => {
        const receitas = (data.contas_a_receber || []).filter(r => r.status === 'Recebido');
        const despesas = (data.contas_a_pagar || []).filter(p => p.status === 'Pago');

        const totalReceitas = receitas.reduce((sum, item) => sum + (item.valor || 0), 0);
        const totalDespesas = despesas.reduce((sum, item) => sum + (item.valor || 0), 0);
        const lucroLiquido = totalReceitas - totalDespesas;
        
        const aReceber = (data.contas_a_receber || []).filter(r => r.status === 'Pendente').reduce((sum, item) => sum + (item.valor || 0), 0);
        const aPagar = (data.contas_a_pagar || []).filter(p => p.status === 'Pendente').reduce((sum, item) => sum + (item.valor || 0), 0);

        return { totalReceitas, totalDespesas, lucroLiquido, aReceber, aPagar };
    }, [data.contas_a_receber, data.contas_a_pagar]);

    const handleNew = (type) => {
        const baseData = type === 'pagar' ? 
            { descricao: '', valor: '', dataVencimento: '', status: 'Pendente', categoria: 'Fornecedores' } :
            { descricao: '', valor: '', dataRecebimento: '', status: 'Pendente', metodo: 'Pix' };

        if (type === 'pagar' && despesaFilter !== 'Todas') {
            baseData.categoria = despesaFilter;
        }

        setFormData(baseData);
        setModalConfig({ isOpen: true, type, item: null });
    };

    const handleEdit = (type, item) => {
        const itemData = { ...item, valor: String(item.valor) };
        if(type === 'pagar' && item.dataVencimento) itemData.dataVencimento = getJSDate(item.dataVencimento)?.toISOString().split('T')[0];
        if(type === 'receber' && item.dataRecebimento) itemData.dataRecebimento = getJSDate(item.dataRecebimento)?.toISOString().split('T')[0];
        setFormData(itemData);
        setModalConfig({ isOpen: true, type, item });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const collection = modalConfig.type === 'pagar' ? 'contas_a_pagar' : 'contas_a_receber';
        const dataToSave = { ...formData, valor: parseFloat(formData.valor || 0) };
        
        if (modalConfig.item) {
            await updateItem(collection, modalConfig.item.id, dataToSave);
        } else {
            await addItem(collection, dataToSave);
        }
        setModalConfig({ isOpen: false, type: null, item: null });
    };

    const handleStatusChange = async (type, item, newStatus) => {
        const collection = type === 'pagar' ? 'contas_a_pagar' : 'contas_a_receber';
        await updateItem(collection, item.id, { status: newStatus });
    };

    const renderDashboard = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg"><ArrowUpCircle className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Receita Total (Pago)</p><h2 className="text-2xl font-bold text-gray-800">R$ {financialSummary.totalReceitas.toFixed(2)}</h2></div></div></div>
                <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg"><ArrowDownCircle className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Despesa Total (Pago)</p><h2 className="text-2xl font-bold text-gray-800">R$ {financialSummary.totalDespesas.toFixed(2)}</h2></div></div></div>
                <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg"><DollarSign className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Lucro Líquido</p><h2 className="text-2xl font-bold text-gray-800">R$ {financialSummary.lucroLiquido.toFixed(2)}</h2></div></div></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 bg-white p-6 rounded-2xl shadow-lg">
                    <canvas ref={monthlyChartRef}></canvas>
                </div>
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-lg">
                     <canvas ref={categoryChartRef}></canvas>
                </div>
            </div>
        </div>
    );
    
    const getStatusClass = (status) => {
        switch (status) {
            case 'Pendente': return 'bg-yellow-100 text-yellow-800';
            case 'Pago':
            case 'Recebido': return 'bg-green-100 text-green-800';
            case 'Atrasado': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const renderContas = (type) => {
        const collection = type === 'pagar' ? 'contas_a_pagar' : 'contas_a_receber';
        let title = type === 'pagar' ? 'Despesas' : 'Contas a Receber';
        let items = data[collection] || [];

        if (type === 'pagar' && despesaFilter !== 'Todas') {
            items = items.filter(item => item.categoria === despesaFilter);
        }

        const columns = [
            { header: 'Descrição', key: 'descricao' },
            { header: 'Valor', render: (row) => <span className="font-semibold text-gray-800">R$ {(row.valor || 0).toFixed(2)}</span> },
            { header: type === 'pagar' ? 'Vencimento' : 'Data', render: (row) => { const date = getJSDate(type === 'pagar' ? row.dataVencimento : row.dataRecebimento); return date ? date.toLocaleDateString('pt-BR') : '-'; } },
            { header: 'Categoria', key: 'categoria', visible: type === 'pagar' },
            { header: 'Método', key: 'metodo', visible: type === 'receber' },
            { header: 'Status', render: (row) => <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusClass(row.status)}`}>{row.status}</span> }
        ].filter(c => c.visible !== false);
        
        const actions = [
            { icon: Edit, label: "Editar", onClick: (row) => handleEdit(type, row) },
            { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem(collection, row.id) }) }
        ];

        if (type === 'pagar') {
            actions.unshift({ icon: Banknote, label: "Marcar como Pago", onClick: (row) => handleStatusChange(type, row, 'Pago') });
        } else {
            actions.unshift({ icon: Banknote, label: "Marcar como Recebido", onClick: (row) => handleStatusChange(type, row, 'Recebido') });
        }

        return (
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-gray-700">{title}</h2>
                    <Button onClick={() => handleNew(type)}><Plus className="w-4 h-4"/> Novo Lançamento</Button>
                </div>
                {type === 'pagar' && (
                    <div className="mb-4 flex space-x-2 border-b">
                        {['Todas', 'Despesa Fixa', 'Despesa Variável', 'Fornecedores'].map(filter => (
                            <button
                                key={filter}
                                onClick={() => setDespesaFilter(filter)}
                                className={`px-3 py-2 text-sm font-medium ${despesaFilter === filter ? 'border-b-2 border-pink-600 text-pink-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {filter.replace('Despesa ', '')}
                            </button>
                        ))}
                    </div>
                )}
                <Table columns={columns} data={items} actions={actions} />
            </div>
        );
    };
    
    const renderFluxoCaixa = () => {
        const filteredPedidos = (data.pedidos || [])
            .filter(p => p.status === 'Finalizado')
            .filter(p => {
                if(!p.createdAt) return false;
                const itemDate = getJSDate(p.createdAt);
                if (!itemDate) return false;
                const start = startDate ? new Date(startDate) : null;
                const end = endDate ? new Date(endDate) : null;
                if(start) start.setHours(0,0,0,0);
                if(end) end.setHours(23,59,59,999);
                if (start && itemDate < start) return false;
                if (end && itemDate > end) return false;
                return true;
            });

        const outrasEntradasFiltradas = (data.contas_a_receber || [])
            .filter(i => i.status === 'Recebido')
            .filter(item => {
                if(!item.dataRecebimento) return false;
                const itemDate = getJSDate(item.dataRecebimento);
                if (!itemDate) return false;
                const start = startDate ? new Date(startDate) : null;
                const end = endDate ? new Date(endDate) : null;
                if(start) start.setHours(0,0,0,0);
                if(end) end.setHours(23,59,59,999);
                if (start && itemDate < start) return false;
                if (end && itemDate > end) return false;
                return true;
            });
        
        const saidasFiltradas = (data.contas_a_pagar || [])
            .filter(i => i.status === 'Pago')
            .filter(item => {
                if(!item.dataVencimento) return false;
                const itemDate = getJSDate(item.dataVencimento);
                if (!itemDate) return false;
                const start = startDate ? new Date(startDate) : null;
                const end = endDate ? new Date(endDate) : null;
                if(start) start.setHours(0,0,0,0);
                if(end) end.setHours(23,59,59,999);
                if (start && itemDate < start) return false;
                if (end && itemDate > end) return false;
                return true;
            });
            
        // Breakdown by sales channel from Pedidos
        const totalVendasPresencial = filteredPedidos.filter(p => p.origem === 'Manual' && p.categoria !== 'Festa').reduce((sum, p) => sum + p.total, 0);
        const totalVendasOnline = filteredPedidos.filter(p => ['Cardapio Online', 'Plataforma'].includes(p.origem)).reduce((sum, p) => sum + p.total, 0);
        const totalVendasFesta = filteredPedidos.filter(p => p.categoria === 'Festa').reduce((sum, p) => sum + p.total, 0);
            
        // Breakdown by payment method from Pedidos
        const totaisPorPagamento = filteredPedidos.reduce((acc, pedido) => {
            const metodo = pedido.formaPagamento || 'Não informado';
            acc[metodo] = (acc[metodo] || 0) + pedido.total;
            return acc;
        }, {});
        
        const totalOutrasEntradas = outrasEntradasFiltradas.reduce((sum, t) => sum + t.valor, 0);
        const totalSaidas = saidasFiltradas.reduce((sum, t) => sum + t.valor, 0);
        
        const totalEntradas = totalVendasPresencial + totalVendasOnline + totalVendasFesta + totalOutrasEntradas;
        const saldo = totalEntradas - totalSaidas;
        
        return (
            <div>
                 <div className="p-4 bg-white rounded-2xl shadow-lg border border-gray-100 space-y-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Data Inicial" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <Input label="Data Final" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                     <div className="bg-green-100 p-4 rounded-xl"><p className="text-sm text-green-800">Total de Entradas</p><p className="text-xl font-bold text-green-900">R$ {totalEntradas.toFixed(2)}</p></div>
                     <div className="bg-red-100 p-4 rounded-xl"><p className="text-sm text-red-800">Total de Saídas</p><p className="text-xl font-bold text-red-900">R$ {totalSaidas.toFixed(2)}</p></div>
                     <div className="bg-blue-100 p-4 rounded-xl"><p className="text-sm text-blue-800">Saldo do Período</p><p className="text-xl font-bold text-blue-900">R$ {saldo.toFixed(2)}</p></div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="bg-white p-6 rounded-2xl shadow-lg">
                        <h3 className="font-bold text-lg mb-4">Entradas por Canal de Venda</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between border-b pb-1"><span className="text-gray-600">Vendas Presenciais:</span> <span className="font-semibold">R$ {totalVendasPresencial.toFixed(2)}</span></div>
                            <div className="flex justify-between border-b pb-1"><span className="text-gray-600">Delivery (Online):</span> <span className="font-semibold">R$ {totalVendasOnline.toFixed(2)}</span></div>
                            <div className="flex justify-between border-b pb-1"><span className="text-gray-600">Festas:</span> <span className="font-semibold">R$ {totalVendasFesta.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Outras Entradas:</span> <span className="font-semibold">R$ {totalOutrasEntradas.toFixed(2)}</span></div>
                        </div>
                    </div>
                     <div className="bg-white p-6 rounded-2xl shadow-lg">
                        <h3 className="font-bold text-lg mb-4">Entradas por Forma de Pagamento</h3>
                        <div className="space-y-2 text-sm">
                            {Object.entries(totaisPorPagamento).map(([metodo, total]) => (
                                <div key={metodo} className="flex justify-between border-b pb-1"><span className="text-gray-600">{metodo}:</span> <span className="font-semibold">R$ {total.toFixed(2)}</span></div>
                            ))}
                        </div>
                    </div>
                 </div>
            </div>
        )
    };

    return (
        <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
            <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Financeiro</h1>
                <p className="text-gray-600 mt-1">Gerencie as finanças da sua doceria</p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-2">
                <div className="flex space-x-2">
                    {['dashboard', 'pagar', 'receber', 'fluxo'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === tab ? 'bg-pink-600 text-white' : 'hover:bg-pink-100'}`}>
                            {tab === 'dashboard' && 'Dashboard'}
                            {tab === 'pagar' && 'Despesas'}
                            {tab === 'receber' && 'Contas a Receber'}
                            {tab === 'fluxo' && 'Fluxo de Caixa'}
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="mt-6">
                {activeTab === 'dashboard' && renderDashboard()}
                {activeTab === 'pagar' && renderContas('pagar')}
                {activeTab === 'receber' && renderContas('receber')}
                {activeTab === 'fluxo' && renderFluxoCaixa()}
            </div>
            
            <Modal isOpen={modalConfig.isOpen} onClose={() => setModalConfig({isOpen: false, type: null, item: null})} title={modalConfig.item ? 'Editar Lançamento' : 'Novo Lançamento'}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input label="Descrição" value={formData.descricao || ''} onChange={(e) => setFormData({...formData, descricao: e.target.value})} required/>
                    <Input label="Valor (R$)" type="number" step="0.01" value={formData.valor || ''} onChange={(e) => setFormData({...formData, valor: e.target.value})} required/>
                    {modalConfig.type === 'pagar' && (
                        <>
                            <Input label="Data de Vencimento" type="date" value={formData.dataVencimento || ''} onChange={(e) => setFormData({...formData, dataVencimento: e.target.value})} required/>
                            <Select label="Categoria" value={formData.categoria || ''} onChange={(e) => setFormData({...formData, categoria: e.target.value})} required>
                                <option>Fornecedores</option>
                                <option>Despesa Fixa</option>
                                <option>Despesa Variável</option>
                            </Select>
                        </>
                    )}
                     {modalConfig.type === 'receber' && (
                        <>
                            <Input label="Data de Recebimento" type="date" value={formData.dataRecebimento || ''} onChange={(e) => setFormData({...formData, dataRecebimento: e.target.value})} required/>
                             <Select label="Método de Pagamento" value={formData.metodo || ''} onChange={(e) => setFormData({...formData, metodo: e.target.value})} required>
                                <option>Pix</option>
                                <option>Cartão</option>
                                <option>Dinheiro</option>
                                <option>Outro</option>
                            </Select>
                        </>
                    )}
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setModalConfig({isOpen: false, type: null, item: null})}>Cancelar</Button>
                        <Button type="submit"><Save className="w-4 h-4"/> Salvar</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};


// --- FIM DOS NOVOS COMPONENTES ---

// Componente Relatorios adicionado no mesmo arquivo App.js para correção do erro
const Relatorios = ({ data }) => {
  const getInitialDateRange = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    return {
        start: formatDate(firstDay),
        end: formatDate(today)
    };
  };

  const [reportType, setReportType] = usePersistentState('relatorios_reportType', 'vendasPorPeriodo');
  const [startDate, setStartDate] = usePersistentState('relatorios_startDate', getInitialDateRange().start);
  const [endDate, setEndDate] = usePersistentState('relatorios_endDate', getInitialDateRange().end);
  const [reportData, setReportData] = useState([]);
  const [reportColumns, setReportColumns] = useState([]);
  const [reportTotals, setReportTotals] = useState(null);
  const [perdasColumns, setPerdasColumns] = useState([]);
  const [perdasData, setPerdasData] = useState([]);

  const formatCurrency = (value) =>
    (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDate = (value) => {
    const date = getJSDate(value);
    return date ? date.toLocaleDateString('pt-BR') : '-';
  };

  const isCustoProducao = reportType === 'custoProducao';

  const handleGenerateReport = () => {
    let columns = [];
    let processedData = [];
    let totals = null;
    let perdasColumnsLocal = [];
    let perdasDataLocal = [];
    
    const filterByDate = (items, dateField) => {
        let filtered = items;
        if (startDate) filtered = filtered.filter(p => {
            const itemDate = getJSDate(p[dateField]);
            return itemDate && itemDate >= new Date(startDate + 'T00:00:00');
        });
        if (endDate) filtered = filtered.filter(p => {
            const itemDate = getJSDate(p[dateField]);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            return itemDate && itemDate <= end;
        });
        return filtered;
    }


    switch (reportType) {
        case 'vendasPorPeriodo': {
            const filtered = filterByDate(data.pedidos.filter(p => p.status === 'Finalizado'), 'createdAt');
            columns = [{ header: 'Data', key: 'date' }, { header: 'Nº de Vendas', key: 'count' }, { header: 'Total (R$)', key: 'total' }];
            const salesByDay = filtered.reduce((acc, pedido) => {
                const date = getJSDate(pedido.createdAt).toLocaleDateString('pt-BR');
                if (!acc[date]) acc[date] = { date, count: 0, total: 0 };
                acc[date].count++;
                acc[date].total += pedido.total;
                return acc;
            }, {});
            processedData = Object.values(salesByDay).map(d => ({...d, total: `R$ ${d.total.toFixed(2)}`}));
            break;
        }
        case 'produtosMaisVendidos': {
            const filtered = filterByDate(data.pedidos.filter(p => p.status === 'Finalizado'), 'createdAt');
            columns = [
                { header: 'Produto', key: 'nome' },
                { header: 'Quantidade Vendida', key: 'quantidade' },
                { header: 'Valor de Venda (R$)', key: 'valor' },
                { header: 'Custo Total (R$)', key: 'custoTotal' },
                { header: 'Lucro (R$)', key: 'lucro' }
            ];

            const productCostMap = (data.produtos || []).reduce((acc, produto) => {
                const custo = parseFloat(produto.custo || 0);
                if (produto.id) acc[produto.id] = custo;
                if (produto.nome) acc[produto.nome] = custo;
                return acc;
            }, {});

            const productSales = filtered.reduce((acc, pedido) => {
                (pedido.itens || []).forEach((item) => {
                    const id = item?.id || item?.nome;
                    if (!id) return;

                    const quantidade = Number(item.quantity) || 0;
                    const preco = Number(item.preco) || 0;
                    const custoUnitario = Number(
                        item.custo ?? productCostMap[item.id] ?? productCostMap[item.nome] ?? 0
                    );

                    if (!acc[id]) {
                        acc[id] = { nome: item.nome || 'Produto sem nome', quantidade: 0, valor: 0, custoTotal: 0 };
                    }

                    acc[id].quantidade += quantidade;
                    acc[id].valor += preco * quantidade;
                    acc[id].custoTotal += custoUnitario * quantidade;
                });

                return acc;
            }, {});

            totals = Object.values(productSales).reduce(
                (acc, item) => {
                    const custo = item.custoTotal || 0;
                    const valor = item.valor || 0;
                    return {
                        totalCost: acc.totalCost + custo,
                        totalSales: acc.totalSales + valor,
                        totalProfit: acc.totalProfit + (valor - custo)
                    };
                },
                { totalCost: 0, totalSales: 0, totalProfit: 0 }
            );

            processedData = Object.values(productSales)
                .filter(item => item.quantidade > 0)
                .map(item => ({
                    ...item,
                    valor: formatCurrency(item.valor),
                    custoTotal: formatCurrency(item.custoTotal),
                    lucro: formatCurrency(item.valor - item.custoTotal)
                }))
                .sort((a, b) => b.quantidade - a.quantidade);
            break;
        }
        case 'clientesMaisCompram': {
             const filtered = filterByDate(data.pedidos.filter(p => p.status === 'Finalizado'), 'createdAt');
             columns = [{ header: 'Cliente', key: 'nome' }, {header: 'Total Gasto (R$)', key: 'total'}, {header: 'Nº de Pedidos', key: 'pedidos'}];
             const customerSales = filtered.reduce((acc, pedido) => {
                if(!acc[pedido.clienteId]) acc[pedido.clienteId] = { nome: pedido.clienteNome, total: 0, pedidos: 0};
                acc[pedido.clienteId].total += pedido.total;
                acc[pedido.clienteId].pedidos += 1;
                return acc;
             }, {});
             processedData = Object.values(customerSales).sort((a,b) => b.total - a.total).map(c => ({...c, total: `R$ ${c.total.toFixed(2)}`}));
             break;
        }
        case 'usoCupons': {
            const filtered = filterByDate(data.pedidos.filter(p => p.cupom), 'createdAt');
            columns = [{ header: 'Cupom', key: 'codigo' }, { header: 'Usos', key: 'usos' }, { header: 'Total Descontado (R$)', key: 'totalDesconto' }];
            const couponUsage = filtered.reduce((acc, pedido) => {
                const codigo = pedido.cupom.codigo;
                if (!acc[codigo]) acc[codigo] = { codigo, usos: 0, totalDesconto: 0 };
                acc[codigo].usos++;
                acc[codigo].totalDesconto += pedido.cupom.valorDesconto || 0;
                return acc;
            }, {});
            processedData = Object.values(couponUsage).map(c => ({ ...c, totalDesconto: `R$ ${c.totalDesconto.toFixed(2)}` })).sort((a,b) => b.usos - a.usos);
            break;
        }
        case 'estoqueBaixo': {
             columns = [{ header: 'Produto', key: 'nome' }, { header: 'Estoque Atual', key: 'estoque' }];
             processedData = data.produtos.filter(p => p.estoque < 10).sort((a,b) => a.estoque - b.estoque);
             break;
        }
        case 'comprasInsumos': {
            const filtered = filterByDate(data.pedidosCompra.filter(p => p.status === 'Recebido'), 'dataPedido');
            columns = [{ header: 'Insumo', key: 'nome' }, { header: 'Quantidade Comprada', key: 'quantidade' }];
            const insumoSales = filtered.flatMap(p => p.itens || []).reduce((acc, item) => {
                if (!acc[item.id]) acc[item.id] = { nome: item.nome, quantidade: 0 };
                acc[item.id].quantidade += item.quantidade;
                return acc;
            }, {});
            processedData = Object.values(insumoSales).sort((a, b) => b.quantidade - a.quantidade);
            break;
        }
                case 'receitaPorPagamento': {
            const filtered = filterByDate(data.pedidos.filter(p => p.status === 'Finalizado'), 'createdAt');
            columns = [{ header: 'Forma de Pagamento', key: 'metodo' }, { header: 'Total Recebido (R$)', key: 'total' }];
            const paymentMethodSales = filtered.reduce((acc, pedido) => {
                const metodo = pedido.formaPagamento || 'Não informado';
                if (!acc[metodo]) acc[metodo] = { metodo, total: 0 };
                acc[metodo].total += pedido.total;
                return acc;
            }, {});
            processedData = Object.values(paymentMethodSales).map(d => ({...d, total: `R$ ${d.total.toFixed(2)}`})).sort((a,b) => b.total - a.total);
            break;
        }
        case 'custoProducao': {
            const filtered = filterByDate(
                data.pedidos.filter((p) => p.status === 'Finalizado'),
                'createdAt'
            );

            const perdasProcessadas = (data.perdasDescarte || [])
                .map((perda) => {
                    const produto = (data.produtos || []).find((p) => p.id === perda.produtoId);
                    const custoUnitario = Number(
                        perda.custoUnitario ?? produto?.custo ?? produto?.custoUnitario ?? 0
                    );
                    const quantidade = Number(perda.quantidade) || 0;
                    const dataPerda = perda.dataDescarte || perda.data;
                    const nomeProduto =
                        perda.nome || perda.produto || produto?.nome || 'Produto não informado';

                    return {
                        ...perda,
                        custoUnitario,
                        quantidade,
                        dataPerda,
                        nomeProduto,
                        valorTotal: quantidade * custoUnitario,
                    };
                })
                .filter((perda) => perda.quantidade > 0);

            const perdasFiltradas = filterByDate(perdasProcessadas, 'dataPerda').sort((a, b) => {
                const dataA = getJSDate(a.dataPerda) || new Date(0);
                const dataB = getJSDate(b.dataPerda) || new Date(0);
                return dataB - dataA;
            });

            const totalPerdas = perdasFiltradas.reduce(
                (total, perda) => total + (Number(perda.valorTotal) || 0),
                0
            );

            perdasColumnsLocal = [
                { header: 'Produto', key: 'produto' },
                { header: 'Quantidade', key: 'quantidade' },
                { header: 'Custo Unitário', key: 'custoUnitario' },
                { header: 'Valor Total', key: 'valorTotal' },
                { header: 'Data', key: 'data' },
                { header: 'Motivo', key: 'motivo' },
            ];

            perdasDataLocal = perdasFiltradas.map((perda) => ({
                produto: perda.nomeProduto,
                quantidade: perda.quantidade,
                custoUnitario: formatCurrency(perda.custoUnitario),
                valorTotal: formatCurrency(perda.valorTotal),
                data: formatDate(perda.dataPerda),
                motivo: perda.motivo || 'Não informado',
            }));

            columns = [
                { header: 'Produto', key: 'nome' },
                { header: 'Categoria', key: 'categoria' },
                { header: 'Custo Unitário (R$)', key: 'custo' },
                { header: 'Preço de Venda (R$)', key: 'preco' },
                { header: 'Lucro Unitário (R$)', key: 'lucroUnitario' },
                { header: 'Margem (%)', key: 'margemPercentual' }
            ];

            const productMap = (data.produtos || []).reduce((acc, produto) => {
                const produtoInfo = {
                    nome: produto.nome || 'Produto sem nome',
                    categoria: produto.subcategoria || produto.categoria || 'Não informado',
                    custo: Number(produto.custo) || 0,
                    preco: Number(produto.preco) || 0,
                };

                if (produto.id) acc[produto.id] = produtoInfo;
                if (produto.nome) acc[produto.nome] = produtoInfo;

                return acc;
            }, {});

            const productAggregates = filtered.reduce((acc, pedido) => {
                (pedido.itens || []).forEach((item) => {
                    const id = item?.id || item?.nome;
                    if (!id) return;

                    const quantidade = Number(item.quantity) || 0;
                    if (quantidade <= 0) return;

                    const produtoInfo = productMap[id] || {};
                    const custoUnitario = Number(item.custo ?? produtoInfo.custo ?? 0);
                    const precoUnitario = Number(item.preco ?? produtoInfo.preco ?? 0);
                    const nome = item.nome || produtoInfo.nome || 'Produto sem nome';
                    const categoria =
                        item.categoria || produtoInfo.categoria || 'Não informado';

                    if (!acc[id]) {
                        acc[id] = {
                            nome,
                            categoria,
                            quantidade: 0,
                            valorVenda: 0,
                            custoTotal: 0,
                        };
                    }

                    acc[id].quantidade += quantidade;
                    acc[id].valorVenda += precoUnitario * quantidade;
                    acc[id].custoTotal += custoUnitario * quantidade;
                });

                return acc;
            }, {});

            const { custoTotalGeral, valorTotalDeVendas, lucroTotalGeral } = Object.values(productAggregates).reduce(
                (acc, item) => {
                    const custoTotal = item.custoTotal || 0;
                    const valorTotal = item.valorVenda || 0;
                    return {
                        custoTotalGeral: acc.custoTotalGeral + custoTotal,
                        valorTotalDeVendas: acc.valorTotalDeVendas + valorTotal,
                        lucroTotalGeral: acc.lucroTotalGeral + (valorTotal - custoTotal),
                    };
                },
                { custoTotalGeral: 0, valorTotalDeVendas: 0, lucroTotalGeral: 0 }
            );

            processedData = Object.values(productAggregates)
                .filter((item) => item.quantidade > 0)
                .map((item) => {
                    const custoUnitario = item.quantidade
                        ? item.custoTotal / item.quantidade
                        : 0;
                    const precoUnitario = item.quantidade
                        ? item.valorVenda / item.quantidade
                        : 0;
                    const lucro = precoUnitario - custoUnitario;
                    const margem = precoUnitario ? (lucro / precoUnitario) * 100 : 0;

                    return {
                        nome: item.nome,
                        categoria: item.categoria,
                        custo: formatCurrency(custoUnitario),
                        preco: formatCurrency(precoUnitario),
                        lucroUnitario: formatCurrency(lucro),
                        margemPercentual: `${margem.toFixed(1)}%`,
                        custoValor: item.custoTotal,
                    };
                })
                .sort((a, b) => (b.custoValor || 0) - (a.custoValor || 0));

            totals = {
                totalCost: custoTotalGeral,
                totalSales: valorTotalDeVendas,
                totalProfit: lucroTotalGeral,
                totalPerdas,
                custoTotalProducao: custoTotalGeral + totalPerdas,
            };
            break;
        }
        default:
            break;
    }

    setReportColumns(columns);
    setReportData(processedData);
    setReportTotals(totals);
    setPerdasColumns(perdasColumnsLocal);
    setPerdasData(perdasDataLocal);
  };

  const exportPDF = () => {
    if (typeof window.jspdf === 'undefined') return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text(document.getElementById('report-select').selectedOptions[0].text, 14, 15);
    doc.autoTable({
        head: [reportColumns.map(c => c.header)],
        body: reportData.map(row => reportColumns.map(col => row[col.key])),
    });
    doc.save('relatorio.pdf');
  };

  const exportExcel = () => {
    if (typeof window.XLSX === 'undefined') return;
    const ws = window.XLSX.utils.json_to_sheet(reportData);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
    window.XLSX.writeFile(wb, "relatorio.xlsx");
  };

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
        <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Relatórios</h1>
            <p className="text-gray-600 mt-1">Analise o desempenho da sua doceria</p>
        </div>

        <div className="p-4 bg-white rounded-2xl shadow-lg border border-gray-100 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Input label="Data Inicial" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                <Input label="Data Final" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                <Select id="report-select" label="Tipo de Relatório" value={reportType} onChange={e => setReportType(e.target.value)}>
                    <option value="vendasPorPeriodo">Vendas por Período</option>
                    <option value="produtosMaisVendidos">Produtos Mais Vendidos</option>
                    <option value="clientesMaisCompram">Clientes que Mais Compram</option>
                    <option value="usoCupons">Uso de Cupons</option>
                    <option value="estoqueBaixo">Estoque Baixo (Produtos Finais)</option>
                    <option value="comprasInsumos">Compras de Insumos</option>
                    <option value="receitaPorPagamento">Receita por Forma de Pagamento</option>
                    <option value="custoProducao">Custo de Produção</option>
                </Select>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={handleGenerateReport} className="w-full sm:w-auto">Gerar Relatório</Button>
                <Button variant="secondary" onClick={() => { setStartDate(getInitialDateRange().start); setEndDate(getInitialDateRange().end); }} className="w-full sm:w-auto">Limpar Datas</Button>
                <Button onClick={exportPDF} variant="secondary" className="w-full sm:w-auto" disabled={reportData.length === 0}>Exportar PDF</Button>
                <Button onClick={exportExcel} variant="secondary" className="w-full sm:w-auto" disabled={reportData.length === 0}>Exportar Excel</Button>
            </div>
        </div>
        
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <Table columns={reportColumns} data={reportData} />
            {reportTotals && (
                <div className="p-6 border-t border-gray-100 bg-gray-50">
                    {isCustoProducao ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100">
                                <p className="text-sm text-gray-500">Valor Total de Vendas</p>
                                <p className="text-xl font-semibold text-gray-800">{formatCurrency(reportTotals.totalSales)}</p>
                            </div>
                            <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100">
                                <p className="text-sm text-gray-500">Custos Vendidos</p>
                                <p className="text-xl font-semibold text-gray-800">{formatCurrency(reportTotals.totalCost)}</p>
                            </div>
                            <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100">
                                <p className="text-sm text-gray-500">Total de Perdas</p>
                                <p className="text-xl font-semibold text-gray-800">{formatCurrency(reportTotals.totalPerdas)}</p>
                            </div>
                            <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
                                <p className="text-sm text-gray-500">Custo Total de Produção = Custos Vendidos + Custos Descartados</p>
                                <p className="text-xl font-semibold text-gray-800">{formatCurrency(reportTotals.custoTotalProducao)}</p>
                            </div>
                            <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
                                <p className="text-sm text-gray-500">Lucro Total</p>
                                <p className="text-xl font-semibold text-gray-800">{formatCurrency(reportTotals.totalProfit)}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100">
                                <p className="text-sm text-gray-500">Custo Total</p>
                                <p className="text-xl font-semibold text-gray-800">{formatCurrency(reportTotals.totalCost)}</p>
                            </div>
                            <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100">
                                <p className="text-sm text-gray-500">Valor Total de Vendas</p>
                                <p className="text-xl font-semibold text-gray-800">{formatCurrency(reportTotals.totalSales)}</p>
                            </div>
                            {reportTotals.totalPerdas !== undefined && (
                                <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100">
                                    <p className="text-sm text-gray-500">Total de Perdas</p>
                                    <p className="text-xl font-semibold text-gray-800">{formatCurrency(reportTotals.totalPerdas)}</p>
                                </div>
                            )}
                            {reportTotals.custoTotalProducao !== undefined && (
                                <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100">
                                    <p className="text-sm text-gray-500">Custo Total de Produção</p>
                                    <p className="text-xl font-semibold text-gray-800">{formatCurrency(reportTotals.custoTotalProducao)}</p>
                                </div>
                            )}
                            <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
                                <p className="text-sm text-gray-500">Lucro Total</p>
                                <p className="text-xl font-semibold text-gray-800">{formatCurrency(reportTotals.totalProfit)}</p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        {isCustoProducao && perdasData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="px-6 pt-6 pb-2">
                    <h3 className="text-lg font-semibold text-gray-800">Custos de Descarte (Perdas)</h3>
                    <p className="text-sm text-gray-500">Itens descartados, do mais recente para o mais antigo.</p>
                </div>
                <Table columns={perdasColumns} data={perdasData} />
            </div>
        )}
    </div>
  );
};


// Componente principal
function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

  const [currentPage, setCurrentPage] = usePersistentState('currentPage', 'pagina-inicial');
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [passwordResetEmail, setPasswordResetEmail] = useState("");
  const [passwordResetMessage, setPasswordResetMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [stopAlarmFn, setStopAlarmFn] = useState(null);
  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);
  const [hasNewPendingOrders, setHasNewPendingOrders] = useState(false);
  const [pedidosConnectivityStatus, setPedidosConnectivityStatus] = useState('online');
  const [pendingOrders, setPendingOrders] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isiOS = useMemo(() => {
    const platform = Capacitor.getPlatform();
    if (platform === 'ios') return true;

    if (platform === 'web' && typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    }

    return false;
  }, []);

  const [soundUnlocked, setSoundUnlocked] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('iosSoundUnlocked') === 'true';
  });

  const [isAlarmSnoozed, setIsAlarmSnoozed] = useState(false);
  const [snoozeEndTime, setSnoozeEndTime] = useState(null);
  const [audioAllowed, setAudioAllowed] = useState(audioManager.unlocked);
  // --- Estado audioUnlocked agora é derivado do AudioManager ---
  // const [audioUnlocked, setAudioUnlocked] = useState(...);


  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, onConfirm: () => {} });
  // ... (outros estados: showLogin, email, password, etc.) ...
    const [lightboxImage, setLightboxImage] = useState(null);
  
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  // ... (outros estados: passwordResetEmail, passwordResetMessage) ...
  
  const [availableStores, setAvailableStores] = useState([]);
  const [storeInfoMap, setStoreInfoMap] = useState({});
  const [selectedStoreId, setSelectedStoreId] = usePersistentState('selectedStoreId', null);
  const [showStoreManager, setShowStoreManager] = useState(false);
  const [isCreatingStore, setIsCreatingStore] = useState(false);

  useEffect(() => {
    if (!isiOS || soundUnlocked) return undefined;

    const unlockWithGesture = async () => {
      try {
        await audioManager.userUnlock({ userGesture: true });
        setAudioAllowed(audioManager.unlocked);

        const htmlAudio = new Audio(ALARM_SOUND_URL);
        const playPromise = htmlAudio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
        htmlAudio.pause();
        htmlAudio.currentTime = 0;
      } catch (error) {
        console.warn('[App.js] Não foi possível iniciar o áudio no gesto de desbloqueio:', error);
      }

      localStorage.setItem('iosSoundUnlocked', 'true');
      setSoundUnlocked(true);
      setAudioAllowed(audioManager.unlocked);
      window.removeEventListener('touchstart', unlockWithGesture);
      window.removeEventListener('click', unlockWithGesture);
    };

    window.addEventListener('touchstart', unlockWithGesture, { passive: true });
    window.addEventListener('click', unlockWithGesture, { passive: true });

    return () => {
      window.removeEventListener('touchstart', unlockWithGesture);
      window.removeEventListener('click', unlockWithGesture);
    };
  }, [isiOS, soundUnlocked]);


  // --- REVISADO: Refs de Áudio ---
  const stopAlarmRef = useRef(null); // Guarda a função de parar o som
  const stopAlarmFnRef = useRef(null);
  const snoozeTimerRef = useRef(null);
  const isSnoozedRef = useRef(false);
  const initialDataLoaded = useRef(false);
  const storeCollectionsDataRef = useRef({});
  const clientesDataRef = useRef([]);
  const pushTokenRef = useRef(null);
  const configMigrationStatusRef = useRef(new Set());
  // --- REMOVIDO: audioRef e alarmIntervalRef ---

  
  const [data, setData] = useState(getInitialDataState());
  const [loading, setLoading] = useState(true);
  const userId = user?.auth?.uid || null;
  const isGeneralViewSelected = user?.role === ROLE_OWNER && selectedStoreId === STORE_ALL_KEY;
  const selectedStoreIdForAlarm = useMemo(() => {
    if (!user || isGeneralViewSelected) return null;
    if (selectedStoreId) return selectedStoreId;
    if (availableStores.length) return availableStores[0];
    if (user.lojaIds && user.lojaIds.length) return user.lojaIds[0];
    return user.lojaId || null;
  }, [user, isGeneralViewSelected, selectedStoreId, availableStores]);
  const [resolvedAlarmPauseMinutes, setResolvedAlarmPauseMinutes] = useState(DEFAULT_ALARM_PAUSE_MINUTES);

  useEffect(() => {
    setFirestoreTelemetryContext({
      route: currentPage,
      uid: userId
    });
  }, [currentPage, userId]);

  useEffect(() => {
    const handleListenerStatus = (event) => {
      const detail = event?.detail || {};
      if (detail.collection !== 'pedidos') return;

      if (detail.status === 'reconnecting') {
        setPedidosConnectivityStatus('reconnecting');
      } else if (detail.status === 'offline') {
        setPedidosConnectivityStatus('offline');
      }
    };

    window.addEventListener('firestore:listener-status', handleListenerStatus);
    return () => window.removeEventListener('firestore:listener-status', handleListenerStatus);
  }, []);

  useEffect(() => {
    if (isGeneralViewSelected || !selectedStoreIdForAlarm) {
      setResolvedAlarmPauseMinutes(DEFAULT_ALARM_PAUSE_MINUTES);
      return;
    }

    let isMounted = true;

    const fetchAlarmPauseMinutes = async () => {
      try {
        const configSnap = await getDoc(getStoreConfigDocRef(selectedStoreIdForAlarm));
        if (!isMounted) return;

        const configData = configSnap.exists() ? (configSnap.data() || {}) : {};
        setResolvedAlarmPauseMinutes(sanitizeAlarmPauseMinutes(configData.alarmPauseMinutes));
      } catch (error) {
        console.error('[App.js] Erro ao buscar tempo de pausa do alarme:', error);
        if (isMounted) {
          setResolvedAlarmPauseMinutes(DEFAULT_ALARM_PAUSE_MINUTES);
        }
      }
    };

    fetchAlarmPauseMinutes();

    return () => {
      isMounted = false;
    };
  }, [isGeneralViewSelected, selectedStoreIdForAlarm]);

  const hasPendingOrdersForSelectedStore = useMemo(() => {
    if (!selectedStoreIdForAlarm) return false;
    return (data.pedidos || []).some((order) => order.status === 'Pendente' && order.lojaId === selectedStoreIdForAlarm);
  }, [data.pedidos, selectedStoreIdForAlarm]);

  
   const resolveStoreIdsForView = useCallback(() => {
    if (!user) return [];

    if (user.role === ROLE_OWNER) {
        if (selectedStoreId === STORE_ALL_KEY) {
            return availableStores;
        }
        return selectedStoreId ? [selectedStoreId] : (availableStores.length ? [availableStores[0]] : []);
    }

    if (selectedStoreId) return [selectedStoreId];
    if (availableStores.length) return [availableStores[0]];
    if (user.lojaIds && user.lojaIds.length) return [user.lojaIds[0]];
    if (user.lojaId) return [user.lojaId];
    return [];
  }, [user, selectedStoreId, availableStores]);

  const recomputeDataForView = useCallback(() => {
    const base = getInitialDataState();

    if (!user) {
      return base;
    }

    const storeIds = resolveStoreIdsForView();
    if (!storeIds.length) {
      return base;
    }

    storeIds.forEach((storeId) => {
      const storeData = storeCollectionsDataRef.current[storeId];
      if (!storeData) return;

      COLLECTIONS_TO_SYNC.forEach((collectionName) => {
        const items = storeData[collectionName] || [];
        if (user.role === ROLE_OWNER && selectedStoreId === STORE_ALL_KEY) {
          base[collectionName] = [
            ...(base[collectionName] || []),
            ...items.map((item) => ({ ...item, lojaId: storeId }))
          ];
        } else {
          base[collectionName] = items.map((item) => ({ ...item, lojaId: storeId }));
        }
      });
    });

    const allClientes = clientesDataRef.current || [];
    const storeIdSet = new Set(storeIds);

    const matchesStore = (cliente) => {
      const visitedStores = Array.isArray(cliente.lojasVisitadas) ? cliente.lojasVisitadas : [];
      if (visitedStores.some((id) => storeIdSet.has(id))) return true;
      if (cliente.lojaId && storeIdSet.has(cliente.lojaId)) return true;
      if (cliente.lojaAtual && storeIdSet.has(cliente.lojaAtual)) return true;
      return false;
    };

    const addResolvedStoreToClient = (cliente) => {
      const visitedStores = Array.isArray(cliente.lojasVisitadas) ? cliente.lojasVisitadas : [];
      const resolvedLojaId = visitedStores.length === 1
        ? visitedStores[0]
        : (cliente.lojaAtual || cliente.lojaId || null);

      if (!resolvedLojaId) return cliente;
      return { ...cliente, lojaId: resolvedLojaId };
    };

    if (user.role === ROLE_OWNER && selectedStoreId === STORE_ALL_KEY) {
      base.clientes = allClientes.map(addResolvedStoreToClient);
    } else {
      base.clientes = allClientes.filter(matchesStore).map(addResolvedStoreToClient);
    }

    return base;
  }, [user, resolveStoreIdsForView, selectedStoreId]);

  const migrateLegacyConfigCollection = useCallback(async (storeId, collectionName, legacyDocs) => {
    const migrationKey = `${storeId}:${collectionName}`;
    if (configMigrationStatusRef.current.has(migrationKey)) return;

    configMigrationStatusRef.current.add(migrationKey);

    try {
      const batch = writeBatch(db);
      legacyDocs.forEach((docSnap) => {
        batch.set(
          doc(db, ...buildStoreCollectionPath(storeId, collectionName), docSnap.id),
          docSnap.data()
        );
      });
      await batch.commit();
      console.log(`[App.js] Migração de ${collectionName} concluída para a loja ${storeId}.`);
    } catch (error) {
      console.error(`[App.js] Falha ao migrar ${collectionName} da loja ${storeId}:`, error);
    }
  }, []);

  const resolveActiveStoreForWrite = useCallback(() => {
        if (!user) {
          throw new Error('Usuário não autenticado.');
        }

	if (user.role === ROLE_OWNER && selectedStoreId === STORE_ALL_KEY) {
	  throw new Error('Selecione uma loja específica para executar esta ação.');
	}

	const storeId = selectedStoreId || (availableStores.length ? availableStores[0] : (user.lojaIds && user.lojaIds.length ? user.lojaIds[0] : user.lojaId));

	if (!storeId) {
	  throw new Error('Nenhuma loja associada ao usuário.');
	}

        return storeId;
  }, [user, selectedStoreId, availableStores]);

  const callClientApi = useCallback(async (path, { method = 'GET', body = null } = {}) => {
    const storeId = resolveActiveStoreForWrite();
    const url = `${API_BASE_URL}${path}${path.includes('?') ? '&' : '?'}lojaId=${encodeURIComponent(storeId)}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Erro ao comunicar com a API de clientes.');
    }

    if (response.status === 204) return null;
    return response.json();
  }, [resolveActiveStoreForWrite]);
  
  const selectStoreById = useCallback((value) => {
        if (value === STORE_ALL_KEY) {
          setSelectedStoreId(STORE_ALL_KEY);
        } else if (value) {
          setSelectedStoreId(value);
        } else {
          setSelectedStoreId(null);
        }
  }, [setSelectedStoreId]);

  const handleStoreChange = useCallback((event) => {
        selectStoreById(event.target.value);
  }, [selectStoreById]);

  const handleCreateStore = useCallback(async ({ storeId, nome }) => {
        const trimmedId = typeof storeId === 'string' ? storeId.trim() : '';
        const trimmedName = typeof nome === 'string' ? nome.trim() : '';

        if (!trimmedName) {
          throw new Error('Nome e identificador são obrigatórios.');
        }

        setIsCreatingStore(true);

        try {
          const createStoreFn = httpsCallable(functions, 'createStore');
          const result = await createStoreFn({ storeId: trimmedId, nome: trimmedName });
          const response = (result && result.data) || {};
          const createdStoreId = response.storeId || generateStoreId(trimmedId || trimmedName);

          if (!createdStoreId || createdStoreId === STORE_ALL_KEY) {
            throw new Error('Identificador inválido para a loja.');
          }

          const storeData = response.storeData || { nome: trimmedName };

          setAvailableStores((prev) => (prev.includes(createdStoreId) ? prev : [...prev, createdStoreId]));
          setStoreInfoMap((prev) => ({
            ...prev,
            [createdStoreId]: { ...(prev[createdStoreId] || {}), ...storeData }
          }));

          selectStoreById(createdStoreId);

          if (Array.isArray(response.assignedStoreIds)) {
            setUser((prev) => {
              if (!prev) return prev;
              const uniqueIds = Array.from(new Set(response.assignedStoreIds));
              const nextPrimary = response.primaryStoreId || prev.lojaId || uniqueIds[0] || null;

              return {
                ...prev,
                lojaIds: uniqueIds,
                lojaId: nextPrimary,
                canAccessAllStores: typeof response.canAccessAllStores === 'boolean'
                  ? response.canAccessAllStores
                  : prev.canAccessAllStores
              };
            });
          }
        } catch (error) {
          console.error('Erro ao criar loja:', error);
          if (error && typeof error.message === 'string') {
            const cleanedMessage = error.message.replace(/^FirebaseError:\s*/i, '').trim();
            throw new Error(cleanedMessage || 'Não foi possível criar a loja.');
          }
          throw new Error('Não foi possível criar a loja.');
		  } finally {
          setIsCreatingStore(false);
        }
  }, [selectStoreById, setUser]);

  // --- SUBSTITUÍDO: Nova função stopAlarm ---
        const stopAlarm = useCallback(() => {
                console.log("[App.js] Parando alarme...");
                if (stopAlarmRef.current) {
		  stopAlarmRef.current(); // Chama a função de parada
		  stopAlarmRef.current = null; // Limpa a referência
		}
		if (stopAlarmFn) {
		  stopAlarmFn(); // Também chama a função do estado se existir
		  setStopAlarmFn(null); // Limpa o estado
		}
		setIsAlarmPlaying(false); // Atualiza o estado da UI
	}, [stopAlarmFn]);

  // --- REMOVIDO: Antiga função unlockAudio ---

  // --- SUBSTITUÍDO: Nova função playAlarm ---
  const playAlarm = useCallback(async () => {
                if (isiOS && !soundUnlocked) {
                        console.warn("[App.js] Áudio bloqueado no iOS aguardando interação do usuário.");
                        return;
                }
                // Só toca se não estiver em modo soneca
                if (isSnoozedRef.current) {
                        console.log("[App.js] Alarme em soneca, não tocando.");
                        return;
                }
		
		// Se já está tocando, não faz nada
		if (isAlarmPlaying) {
			console.log("[App.js] Alarme já está tocando, ignorando nova chamada.");
			return;
		}

		console.log("[App.js] Tentando tocar alarme...");

		// Chama o AudioManager para tocar o som
		// Verifica se o áudio está desbloqueado antes de tentar tocar
		if (!audioManager.unlocked) {
		  console.warn("[App.js] Áudio bloqueado — aguardando interação do usuário.");
		  try {
			await audioManager.userUnlock();
		  } catch (e) {
			console.warn("[App.js] Não foi possível desbloquear o áudio automaticamente:", e);
		  }
		}

		let started = false;
		try {
			started = await audioManager.playAlarmSound();
		} catch (error) {
			console.error("[App.js] Erro ao iniciar o alarme:", error);
		}

		if (started) {
			const stopFn = () => audioManager.stopAlarmSound();
			setIsAlarmPlaying(true);
			setStopAlarmFn(() => stopFn);
			stopAlarmRef.current = stopFn;
			console.log("[App.js] Alarme iniciado.");
		} else {
			console.log("[App.js] Alarme pendente aguardando desbloqueio do áudio.");
			setIsAlarmPlaying(false);
			setShowActivateSoundButton(true);
		}
        }, [isiOS, isAlarmPlaying, soundUnlocked]); // Adicione isAlarmPlaying como dependência
	
	  // --- PRÉ-CARREGAMENTO DO ÁUDIO NATIVO (Capacitor Android/iOS) ---
          useEffect(() => {
                const loadAudio = async () => {
                  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
                        try {
                          await NativeAudio.preload({
                                        assetId: 'pedido',
                                        assetPath: 'mixkit_vintage_warning_alarm_990.mp3',
                                        audioChannelNum: 1,
                                        isUrl: false,
                          });
                          console.log('🔊 Áudio pré-carregado com sucesso!');
                        } catch (err) {
                          console.error('Erro ao carregar áudio:', err);
                        }
                  }
                };

                loadAudio();
          }, []);

  // --- SUBSTITUÍDO: Novo useEffect de inicialização do AudioManager ---
  useEffect(() => {
    const tryAutoUnlock = async () => {
      // tenta inicializar automaticamente se já foi aceito antes
      try {
        if (localStorage.getItem("audioUnlocked") === "true") {
          await audioManager.init();
        } else {
          // tenta init para recuperar estado, mas pode ficar suspenso
          await audioManager.init().catch(()=>{});
        }

        await audioManager.userUnlock({ userGesture: false });
      } catch (e) {
        console.error("Erro ao inicializar audioManager:", e);
      }
      setAudioAllowed(audioManager.unlocked);
  
      // --- CORREÇÃO: Lógica do botão movida para um state para ser renderizado pelo React ---
      // O botão será renderizado condicionalmente no JSX principal
    };
  
    // Só tenta desbloquear/mostrar botão se o usuário estiver logado
    if(user) {
        tryAutoUnlock();
    }
  
  }, [user]); // Depende do 'user' para saber se deve mostrar o botão

  // --- NOVO: Estado para controlar a exibição do botão de ativar som ---
  const [showActivateSoundButton, setShowActivateSoundButton] = useState(false);
  
    useEffect(() => {
    if (!user) {
      return;
    }

    const requestCapabilities = async () => {
      if (typeof navigator === 'undefined') {
        return;
      }

      const requestGeolocation = async () => {
        if (!navigator.geolocation) {
          return;
        }

        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => resolve(position),
            (error) => {
              console.warn('[App.js] Permissão de geolocalização negada ou indisponível:', error);
              resolve(null);
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
          );
        });
      };

      try {
        if (navigator.permissions?.query) {
          try {
            const geoStatus = await navigator.permissions.query({ name: 'geolocation' });
            if (geoStatus.state === 'granted') {
              await requestGeolocation();
            } else if (geoStatus.state === 'prompt') {
              await requestGeolocation();
            }
          } catch (error) {
            await requestGeolocation();
          }
        } else {
          await requestGeolocation();
        }
      } catch (error) {
        console.warn('[App.js] Erro ao solicitar geolocalização:', error);
      }
	};

    requestCapabilities();
  }, [user]);

  // --- NOVO: Effect para verificar e mostrar o botão de ativar som ---
  useEffect(() => {
      // Define um pequeno delay para dar tempo ao audioManager.init() tentar o resume automático
      const timer = setTimeout(() => {
          if (user && !audioManager.unlocked) {
              setShowActivateSoundButton(true);
              console.log("[App.js] Áudio não desbloqueado, mostrando botão.");
          } else {
              setShowActivateSoundButton(false);
          }
      }, 500); // Meio segundo de espera

      return () => clearTimeout(timer);

  }, [user]);


  // EFFECT para sincronizar ref com estado isAlarmSnoozed
  useEffect(() => {
    isSnoozedRef.current = isAlarmSnoozed;
  }, [isAlarmSnoozed]);

  // --- Refs para estabilizar callbacks ---
  const playAlarmRef = useRef(playAlarm);
  useEffect(() => {
      playAlarmRef.current = playAlarm;
  }, [playAlarm]);
  
    useEffect(() => {
    stopAlarmFnRef.current = stopAlarmFn;
  }, [stopAlarmFn]);
  
   const handleIncomingPushNotification = useCallback((payload) => {
    console.log('[App.js] Notificação push recebida:', payload);

    if (isGeneralViewSelected || !selectedStoreIdForAlarm) {
      stopAlarm();
      return;
    }

    const hasPendingForStore = (dataRef.current.pedidos || []).some(
      (order) => order.status === 'Pendente' && order.lojaId === selectedStoreIdForAlarm
    );
    if (!hasPendingForStore) {
      return;
    }

    setHasNewPendingOrders(true);

    if (isSnoozedRef.current) {
      console.log('[App.js] Push recebido durante soneca. Alarme permanecerá silenciado até o fim da soneca.');
      return;
    }

    if (typeof playAlarmRef.current === 'function') {
      playAlarmRef.current();
    }
  }, [isGeneralViewSelected, selectedStoreIdForAlarm, stopAlarm]);

  useEffect(() => {
    if (!userId) {
      pushTokenRef.current = null;
      return;
    }

    let unsubscribeForeground = null;
    let unsubscribeServiceWorker = null;
    let cancelled = false;

    const setupPushNotifications = async () => {
      try {
        const token = await registerDeviceForPush(userId);
        if (token) {
          pushTokenRef.current = token;
          console.log('[App.js] Token de push registrado para o usuário:', userId, token);
        }
      } catch (error) {
        console.error('[App.js] Erro ao configurar notificações push:', error);
      }

      if (cancelled) {
        return;
      }

      try {
        unsubscribeForeground = await listenForForegroundMessages((payload) => {
          console.log('[App.js] Mensagem de push recebida em primeiro plano:', payload);
          handleIncomingPushNotification(payload);
        });
      } catch (error) {
        console.error('[App.js] Não foi possível escutar mensagens em primeiro plano:', error);
      }

      unsubscribeServiceWorker = subscribeToServiceWorkerMessages((event) => {
        const message = event.data;
        if (!message) {
          return;
        }

        if (message.type === 'NEW_ORDER_PUSH') {
          handleIncomingPushNotification(message.payload);
        }
		
        if (message.type === 'PLAY_ORDER_SOUND' && typeof playAlarmRef.current === 'function') {
          playAlarmRef.current();
        }		
		
      });
    };

    setupPushNotifications();

    return () => {
      cancelled = true;
      if (typeof unsubscribeForeground === 'function') {
        unsubscribeForeground();
      }
      if (typeof unsubscribeServiceWorker === 'function') {
        unsubscribeServiceWorker();
      }
    };
  }, [userId, handleIncomingPushNotification]);

  const dataRef = useRef(data);
  useEffect(() => {
      dataRef.current = data;
  }, [data]);
  
  // FUNÇÃO PARA PARAR E ATIVAR SONEÇA - Refatorada
  const handleStopAndSnoozeAlarm = useCallback(() => {
    console.log('[App.js] Ativando soneca...');
    stopAlarm(); // Para o alarme atual
	setStopAlarmFn(null); // Limpa o estado da função de parada
    setIsAlarmSnoozed(true); // Ativa o estado de soneca
    
    const endTime = new Date().getTime() + (resolvedAlarmPauseMinutes * 60 * 1000);
    setSnoozeEndTime(endTime); // Define o tempo final da soneca
    
    // Limpa timer anterior se existir
    if (snoozeTimerRef.current) clearInterval(snoozeTimerRef.current);
    
    // Inicia timer para reativar alarme
    snoozeTimerRef.current = setInterval(() => {
      const now = new Date().getTime();
      const remaining = endTime - now;
      
      if (remaining <= 0) {
        // Fim da soneca
        clearInterval(snoozeTimerRef.current);
        snoozeTimerRef.current = null;
        setIsAlarmSnoozed(false); // Desativa o estado de soneca
        setSnoozeEndTime(null);
        console.log('[App.js] Soneca terminada');
        
        // Verifica se ainda existem pedidos pendentes para tocar o alarme novamente
        const hasPending = !isGeneralViewSelected && selectedStoreIdForAlarm && dataRef.current.pedidos && dataRef.current.pedidos.some(
          (p) => p.status === 'Pendente' && p.lojaId === selectedStoreIdForAlarm
        );
        if (hasPending) {
          console.log('[App.js] Pedidos pendentes encontrados após soneca, reativando alarme.');
          setHasNewPendingOrders(true); // Garante que o banner apareça (se necessário)
          playAlarmRef.current(); // Tenta tocar o alarme usando a ref
        } else {
           setHasNewPendingOrders(false); // Esconde o banner se não há mais pendentes
        }
      } 
      // O display do timer é gerenciado localmente pelo Dashboard
    }, 1000); // Atualiza a cada segundo
  }, [stopAlarm, isGeneralViewSelected, selectedStoreIdForAlarm, resolvedAlarmPauseMinutes]); // Removidas dependências instáveis (data, playAlarm, unlockAudio)

  // EFFECT PARA SINCRONIZAR DADOS DO FIREBASE
        useEffect(() => {
          const storeIds = resolveStoreIdsForView();

          if (!user || !storeIds.length) {
                setData(getInitialDataState());
                setPendingOrders([]);
                clientesDataRef.current = [];
                storeCollectionsDataRef.current = {};
                setLoading(false);
                initialDataLoaded.current = false;
                return;
          }

          const collectionsToSync = getCollectionsToSyncForUser(user);
          const canSyncClientes = user.role !== ROLE_ACCOUNTANT
            || sanitizePermissions(user.customPermissions || user.permissions, user.role).clientes;
          let isMounted = true;
          let pendingInitial = (storeIds.length * collectionsToSync.length) + (canSyncClientes ? 1 : 0);
          const unsubscribes = [];

          const markInitialLoaded = () => {
                if (pendingInitial > 0) {
                      pendingInitial -= 1;
                      if (pendingInitial === 0) {
                            initialDataLoaded.current = true;
                            setLoading(false);
                      }
                }
          };

          if (pendingInitial === 0) {
                setLoading(false);
                initialDataLoaded.current = true;
          } else {
                setLoading(true);
                initialDataLoaded.current = false;
          }

          const setupClientesListener = () => {
                const uniqueStoreIds = Array.from(new Set(storeIds)).filter(Boolean);
                const clientesRef = collection(db, 'clientes');

                let clientesQuery;
                if (user.role === ROLE_OWNER && selectedStoreId === STORE_ALL_KEY) {
                      clientesQuery = query(clientesRef);
                } else if (uniqueStoreIds.length === 1) {
                      clientesQuery = query(clientesRef, where('lojasVisitadas', 'array-contains', uniqueStoreIds[0]));
                } else if (uniqueStoreIds.length > 1) {
                      clientesQuery = query(clientesRef, where('lojasVisitadas', 'array-contains-any', uniqueStoreIds.slice(0, 10)));
                } else {
                      clientesQuery = query(clientesRef);
                }

                let initialResolved = false;
                const unsubscribe = onSnapshot(
                      clientesQuery,
                      (snapshot) => {
                            if (!isMounted) return;

                            clientesDataRef.current = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
                            const computedData = recomputeDataForView();
                            setData(computedData);

                            if (!initialResolved) {
                                  markInitialLoaded();
                                  initialResolved = true;
                            }
                      },
                      (error) => {
                            console.error('[App.js] Erro ao sincronizar clientes:', { code: error?.code || null, message: error?.originalMessage || error?.message || null });
                            setLoginError(error?.message || 'Não foi possível sincronizar os dados de clientes.');
                            if (!initialResolved) {
                                  markInitialLoaded();
                                  initialResolved = true;
                            }
                      },
                      {
                            __listenerOptions: true,
                            operation: 'sync-clientes',
                            route: currentPage,
                            uid: userId
                      }
                );

                unsubscribes.push(() => unsubscribe());
          };

          if (canSyncClientes) {
                setupClientesListener();
          } else {
                clientesDataRef.current = [];
          }

          storeIds.forEach((storeId) => {
                collectionsToSync.forEach((collectionName) => {
                        const isConfigCollection = CONFIG_COLLECTIONS.has(collectionName);
                        const primaryQuery = query(getStoreCollectionRef(storeId, collectionName));
                        const legacyQuery = isConfigCollection ? query(getStoreCollectionRef(storeId, collectionName, true)) : null;

                        let primaryItems = [];
                        let legacyItems = [];
                        let legacyUnsubscribe = null;
                        let initialResolved = false;

                        const applyItems = (changes = []) => {
                              if (!isMounted) return;
                              const itemsToUse = primaryItems.length ? primaryItems : legacyItems;

                              storeCollectionsDataRef.current = {
                                    ...storeCollectionsDataRef.current,
                                    [storeId]: {
                                          ...(storeCollectionsDataRef.current[storeId] || {}),
                                          [collectionName]: itemsToUse
                                    }
                              };

                              const computedData = recomputeDataForView();
                              setData(computedData);

                              if (collectionName === 'pedidos') {
                                    const activeOrders = (computedData.pedidos || []).filter(
                                          (p) => p.status !== 'Finalizado' && p.status !== 'Cancelado' && !p._isPendingSync
                                    );
                                    setPendingOrders(activeOrders);

                                    if (initialDataLoaded.current) {
                                          const newPendingOrdersDetected = changes.some(
                                                (change) => change.type === 'added'
                                                      && change.doc.data().status === 'Pendente'
                                                      && !change.doc.metadata?.hasPendingWrites
                                          );

                                          if (newPendingOrdersDetected && !isGeneralViewSelected && selectedStoreIdForAlarm && !isAlarmPlaying && !isSnoozedRef.current) {
                                                console.log('[App.js] Novo pedido pendente detectado pelo listener!');
                                                setHasNewPendingOrders(true);

                                                console.log('[App.js] Tentando tocar alarme...');
                                                (async () => {
                                                  try {
                                                        if (!audioManager.unlocked) {
                                                          console.warn("[App.js] Áudio bloqueado — aguardando interação do usuário.");
                                                          try {
                                                                await audioManager.userUnlock();
                                                          } catch (e) {
                                                                console.warn("[App.js] Não foi possível desbloquear o áudio automaticamente:", e);
                                                          }
                                                        }

                                                        if (audioManager.unlocked) {
                                                          playAlarmRef.current();
                                                        } else {
                                                          console.log("[App.js] Áudio ainda bloqueado, não tocando alarme.");
                                                        }

                                                  } catch (error) {
                                                        console.error("[App.js] Erro ao tentar tocar alarme:", error);
                                                  }
                                                })();
                                          } else if (newPendingOrdersDetected && isSnoozedRef.current) {
                                                console.log('[App.js] Alarme em modo soneca, não tocando agora.');
                                          } else if (newPendingOrdersDetected && isAlarmPlaying) {
                                                console.log('[App.js] Alarme já está tocando, não iniciando novo.');
                                          }
                                    }
                              }

                              if (!initialResolved) {
                                    markInitialLoaded();
                                    initialResolved = true;
                              }
                        };

                        const handleSnapshotError = (error) => {
                              console.error(`[App.js] Erro ao sincronizar ${collectionName} da loja ${storeId}:`, {
                                    code: error?.code || null,
                                    message: error?.originalMessage || error?.message || null
                              });
                              setLoginError(error?.message || 'Não foi possível sincronizar dados em tempo real.');
                              if (collectionName === 'pedidos') {
                                    setPedidosConnectivityStatus('offline');
                              }
                              if (!initialResolved) {
                                    markInitialLoaded();
                                    initialResolved = true;
                              }
                        };

                        const mapSnapshotDocs = (snapshotDocs) => snapshotDocs.map((docSnap) => {
                              const mappedDoc = { id: docSnap.id, ...docSnap.data() };

                              if (collectionName !== 'pedidos') {
                                    return mappedDoc;
                              }

                              return {
                                    ...mappedDoc,
                                    _isPendingSync: docSnap.metadata?.hasPendingWrites === true
                              };
                        });

                        const primaryUnsubscribe = onSnapshot(
                              primaryQuery,
                              (snapshot) => {
                                    if (collectionName === 'pedidos') {
                                          const isFromCache = snapshot.metadata?.fromCache === true;
                                          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                                                setPedidosConnectivityStatus('offline');
                                          } else if (isFromCache) {
                                                setPedidosConnectivityStatus('reconnecting');
                                          } else {
                                                setPedidosConnectivityStatus('online');
                                          }
                                    }
                                    primaryItems = mapSnapshotDocs(snapshot.docs);
                                    applyItems(snapshot.docChanges());

                                    if (!primaryItems.length && isConfigCollection && legacyQuery && !legacyUnsubscribe) {
                                          legacyUnsubscribe = onSnapshot(
                                                legacyQuery,
                                                (legacySnap) => {
                                                      if (primaryItems.length) return;
                                                      legacyItems = mapSnapshotDocs(legacySnap.docs);
                                                      if (!primaryItems.length && isConfigCollection && legacySnap.docs.length) {
                                                            migrateLegacyConfigCollection(storeId, collectionName, legacySnap.docs);
                                                      }
                                                      applyItems(legacySnap.docChanges());
                                                },
                                                handleSnapshotError,
                                                {
                                                      __listenerOptions: true,
                                                      operation: `sync-${collectionName}-legacy`,
                                                      route: currentPage,
                                                      uid: userId
                                                }
                                          );
                                    } else if (primaryItems.length && legacyUnsubscribe) {
                                          legacyUnsubscribe();
                                          legacyUnsubscribe = null;
                                          legacyItems = [];
                                    }
                              },
                              handleSnapshotError,
                              {
                                    __listenerOptions: true,
                                    operation: `sync-${collectionName}`,
                                    route: currentPage,
                                    uid: userId
                              }
                        );

                        unsubscribes.push(() => {
                              primaryUnsubscribe();
                              if (legacyUnsubscribe) legacyUnsubscribe();
                        });
                });
          });

          return () => {
                isMounted = false;
                unsubscribes.forEach(unsubscribe => unsubscribe());
                initialDataLoaded.current = false;
          };
        }, [user, isAlarmPlaying, resolveStoreIdsForView, recomputeDataForView, selectedStoreId, availableStores, migrateLegacyConfigCollection, isGeneralViewSelected, selectedStoreIdForAlarm, currentPage, userId]);
    // EFFECT PARA PARAR ALARME QUANDO NÃO HÁ MAIS PEDIDOS PENDENTES
    useEffect(() => {
        if (isGeneralViewSelected) {
          setHasNewPendingOrders(false);
          stopAlarm();
          return;
        }

        const hasAnyPending = data.pedidos && data.pedidos.some(p => p.status === 'Pendente');

        if (!hasAnyPending && !isAlarmSnoozed) {
          console.log('[App.js] Nenhum pedido pendente e não está em soneca. Parando alarme e escondendo banner.');
          setHasNewPendingOrders(false);
          stopAlarm();
        }
    }, [data.pedidos, isAlarmSnoozed, stopAlarm, isGeneralViewSelected]);

    // Garante que o alarme continue tocando enquanto houver pedidos pendentes
    useEffect(() => {
        const shouldPlayAlarm = !isGeneralViewSelected && !!selectedStoreIdForAlarm && hasPendingOrdersForSelectedStore && !isAlarmSnoozed;

        if (audioAllowed && shouldPlayAlarm && !isAlarmPlaying) {
          console.log('[App.js] Pedidos pendentes encontrados enquanto o alarme estava parado. Reativando alarme.');
          setHasNewPendingOrders(true);
          playAlarmRef.current();
        }
    }, [audioAllowed, isGeneralViewSelected, selectedStoreIdForAlarm, hasPendingOrdersForSelectedStore, isAlarmSnoozed, isAlarmPlaying]);

  // --- REMOVIDO: Antigo useEffect de desbloqueio ---
  // useEffect(() => { if (audioUnlocked && ...) ... });


  const updateStock = useCallback(async (productId, type, quantity, reason = 'Movimentação de estoque', userInfo = null, targetStoreId = null, options = {}) => {
    const storeId = targetStoreId || resolveActiveStoreForWrite();
    await updateStockService(productId, type, quantity, reason, userInfo, storeId, options);
  }, [resolveActiveStoreForWrite]);


  const ensureAuthenticatedUserForWrite = useCallback(async () => {
    const currentAuthUser = auth.currentUser;
    const fallbackAuthUser = user?.auth || null;
    const resolvedAuthUser = currentAuthUser || fallbackAuthUser;

    console.log('[Sales][Auth] Validando sessão antes da gravação.', {
      hasCurrentUser: Boolean(currentAuthUser),
      hasFallbackUser: Boolean(fallbackAuthUser),
      currentUserUid: currentAuthUser?.uid || null,
      fallbackUserUid: fallbackAuthUser?.uid || null
    });

    if (!resolvedAuthUser) {
      console.error('[Sales][Auth] Nenhum usuário autenticado encontrado para concluir a gravação.');
      throw new Error('Sua sessão expirou. Faça login novamente para salvar a venda.');
    }

    try {
      await getIdToken(resolvedAuthUser);
    } catch (tokenError) {
      console.error('[Sales][Auth] Falha ao validar autenticação antes da gravação:', tokenError);
      throw new Error('Não foi possível validar sua sessão. Faça login novamente para concluir a venda.');
    }

    return resolvedAuthUser;
  }, [user]);

  const mapCriticalWriteErrorMessage = useCallback((error) => {
    const rawCode = String(error?.code || '').toLowerCase();
    const rawMessage = String(error?.message || '').toLowerCase();

    if (rawCode.includes('permission-denied') || rawMessage.includes('permission-denied') || rawMessage.includes('missing or insufficient permissions')) {
      return 'Você não tem permissão para realizar esta ação nesta loja.';
    }

    if (rawCode.includes('unauthenticated') || rawCode.includes('auth/') || rawCode.includes('invalid-user-token') || rawCode.includes('user-token-expired')) {
      return 'Sua sessão expirou. Faça login novamente para continuar.';
    }

    if (rawCode.includes('failed-precondition') || rawMessage.includes('failed-precondition')) {
      return 'Não foi possível concluir esta operação agora. Atualize a página e tente novamente.';
    }

    return error?.message || 'Não foi possível concluir a operação agora. Tente novamente.';
  }, []);

  const assertWritableRole = () => {
    if (user?.role === ROLE_ACCOUNTANT) {
      throw new Error('O perfil Contador possui acesso somente leitura.');
    }
  };

  const addItem = async (section, item, targetStoreId = null) => {
    try {
        assertWritableRole();
        const storeId = targetStoreId || resolveActiveStoreForWrite();

        if (section === 'clientes') {
            await callClientApi('/clientes', { method: 'POST', body: item });
            return null;
        }

        const currentAuthUser = await ensureAuthenticatedUserForWrite();
        const isSalesOrder = section === 'pedidos';

        if (isSalesOrder) {
            console.log('[Sales][Create] Iniciando tentativa de salvar venda.', {
                storeId,
                authUid: currentAuthUser.uid,
                authEmail: currentAuthUser.email || null
            });
        }

        const payload = {
            ...item,
            ...(item?.lojaId ? {} : { lojaId: storeId }),
            createdAt: new Date()
         };

        const docRef = await runWithRetry(
            `addItem:${section}`,
            () => addDoc(getStoreCollectionRef(storeId, section), payload),
            { route: currentPage, uid: currentAuthUser?.uid || userId, collection: section }
        );
        await waitForPendingWrites(db);

        if (isSalesOrder) {
            console.log('[Sales][Create] Venda persistida com sucesso no Firestore.', {
                storeId,
                docId: docRef.id
            });
        }

        if (user && section !== 'logs') {
            await runWithRetry(
                'addItem:logs',
                () => addDoc(getStoreCollectionRef(storeId, 'logs'), {
                action: `Novo item adicionado em ${section}`,
                details: `ID: ${docRef.id}`,
                userEmail: user?.auth?.email || 'N/A',
                timestamp: new Date()
                }),
                { route: currentPage, uid: userId, collection: 'logs' }
            );
        }

        return docRef;
    } catch (e) {
        if (section === 'pedidos') {
            console.error('[Sales][Create] Erro real ao persistir venda:', e);
        }
        console.error("Erro ao adicionar documento: ", e);
        alert(mapCriticalWriteErrorMessage(e));
        throw e;
    }
  };

  const updateItem = async (section, id, updatedItem, targetStoreId = null) => {
    try {
        assertWritableRole();
        const storeId = targetStoreId || resolveActiveStoreForWrite();

        if (section === 'clientes') {
            await callClientApi(`/clientes/${id}`, { method: 'PUT', body: updatedItem });
            return;
        }

        const itemDoc = getStoreDocRef(storeId, section, id);
        if (user && section !== 'logs') {
             const docSnap = await getDoc(itemDoc);
             if (docSnap.exists()) {
                const oldData = docSnap.data();
                const changes = {};
                for (const key in updatedItem) {

                    if (Object.prototype.hasOwnProperty.call(updatedItem, key) &&
                        JSON.stringify(oldData[key]) !== JSON.stringify(updatedItem[key])) {
                        changes[key] = { old: oldData[key], new: updatedItem[key] };
                    }
                }
                if (Object.keys(changes).length > 0) {
                     await runWithRetry(
                        'updateItem:logs',
                        () => addDoc(getStoreCollectionRef(storeId, 'logs'), {
                        action: `Item atualizado em ${section}`,
                        details: `ID ${id} com alterações: ${JSON.stringify(changes)}`,
                        userEmail: user?.auth?.email || 'N/A',
                        timestamp: new Date()
                        }),
                        { route: currentPage, uid: userId, collection: 'logs' }
                    );
                }
             }
        }
        await runWithRetry(
            `updateItem:${section}`,
            () => updateDoc(itemDoc, updatedItem),
            { route: currentPage, uid: userId, collection: section }
        );
    } catch (e) {
        console.error("Erro ao atualizar documento: ", e);
        alert(mapCriticalWriteErrorMessage(e));
        throw e;
    }
  };

  const deleteItem = async (section, id, targetStoreId = null) => {
    try {
        assertWritableRole();
        const storeId = targetStoreId || resolveActiveStoreForWrite();
        await runWithRetry(
            `deleteItem:${section}`,
            () => deleteDoc(getStoreDocRef(storeId, section, id)),
            { route: currentPage, uid: userId, collection: section }
        );
        if (user && section !== 'logs') {
            await runWithRetry(
                'deleteItem:logs',
                () => addDoc(getStoreCollectionRef(storeId, 'logs'), {
                action: `Item deletado de ${section}`,
                details: `ID: ${id}`,
                userEmail: user?.auth?.email || 'N/A',
                timestamp: new Date()
                }),
                { route: currentPage, uid: userId, collection: 'logs' }
            );
        }
    } catch (e) {
        console.error("Erro ao deletar documento: ", e);
        alert(mapCriticalWriteErrorMessage(e));
        throw e;
    }
  };

  useEffect(() => {
    const handleOffline = () => setPedidosConnectivityStatus('offline');
    const handleOnline = () => setPedidosConnectivityStatus((prev) => (prev === 'offline' ? 'reconnecting' : prev));

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);
  
  useEffect(() => {
    const scripts = [
        { id: 'jspdf', src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' },
        { id: 'jspdf-autotable', src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js' },
        { id: 'xlsx', src: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js' },
        { id: 'chartjs', src: 'https://cdn.jsdelivr.net/npm/chart.js' }
    ];

    scripts.forEach(scriptInfo => {
        if (!document.getElementById(scriptInfo.id)) {
            const script = document.createElement('script');
            script.id = scriptInfo.id;
            script.src = scriptInfo.src;
            script.async = true;
            document.body.appendChild(script);
        }
    });
  }, []);

  useEffect(() => {
    const handleResize = () => {
        const desktop = window.innerWidth >= 768;
        setIsDesktop(desktop);
        setSidebarOpen(desktop);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
	useEffect(() => {
	  const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
                        if (authUser) {
                          try {
                                        const userDocRef = doc(db, "users", authUser.uid);
                                        const userDoc = await getDoc(userDocRef);

                                        let profile;

                                        if (userDoc.exists()) {
                                          profile = userDoc.data() || {};
                                        } else {
                                          let initialRole = ROLE_CLIENT;

                                          try {
                                            const anyUserSnap = await getDocs(query(collection(db, "users"), limit(1)));
                                            if (anyUserSnap.empty) {
                                              initialRole = ROLE_OWNER;
                                            }
                                          } catch (roleCheckError) {
                                            console.error("Erro ao verificar usuários existentes:", roleCheckError);
                                            initialRole = ROLE_OWNER;
                                          }

                                          profile = {
                                            email: authUser.email || "",
                                            nome: authUser.displayName || authUser.email || "Usuário",
                                            role: initialRole,
                                            lojaId: null,
                                            lojaIds: [],
                                          };

                                          await setDoc(userDocRef, profile, { merge: true });
                                        }

                                        const role = normalizeRole(profile.role);
                                        const lojaIds = extractStoreIdsFromProfile(profile);
                                        const permissionsDefaults = getDefaultPermissionsForRole(role);
                                        const customProfileRef = doc(db, "customProfiles", authUser.uid);
                                        const customProfileSnap = await getDoc(customProfileRef);
                                        const customProfileData = customProfileSnap.exists() ? customProfileSnap.data() : null;
                                        const customPermissions = customProfileData?.permissions
                                          ? sanitizePermissions(customProfileData.permissions, role)
                                          : null;
                                        const permissions = customPermissions || permissionsDefaults;

                                        if (!customProfileSnap.exists() && role !== ROLE_ACCOUNTANT) {
                                          await setDoc(customProfileRef, {
                                            uid: authUser.uid,
                                            role,
                                            permissions: permissionsDefaults,
                                          }, { merge: true });
                                        }
                                        const userData = {
                                          auth: authUser,
                                          role,
                                          lojaIds,
                                          lojaId: lojaIds[0] || null,
                                          canAccessAllStores: role === ROLE_OWNER && lojaIds.length === 0,
                                          permissions,
                                          customPermissions,
                                          hasCustomProfile: Boolean(customProfileData),
                                        };
                                        setUser(userData);
			if (sessionStorage.getItem(GOOGLE_AUTH_FLOW_KEY) === GOOGLE_AUTH_FLOW_REDIRECT) {
			  setShowLogin(false);
			  setCurrentPage('dashboard');
			  sessionStorage.removeItem(GOOGLE_AUTH_FLOW_KEY);
			}
			// Tenta inicializar/resumir o AudioManager APÓS o login
			if (localStorage.getItem("audioUnlocked") === "true") {
			  audioManager.init().catch((e) => {
					console.error("Erro no init pós-login:", e);
			  });
			}

		  } catch (error) {
			console.error("Erro ao carregar dados do usuário:", error);
      setLoginError('Não foi possível carregar seus dados de acesso. Tente sair e entrar novamente.');
      setShowLogin(true);
      setCurrentPage('pagina-inicial');
		  }
                } else {
                  setUser(null);
                  storeCollectionsDataRef.current = {};
                  clientesDataRef.current = [];
                  setAvailableStores([]);
                  setStoreInfoMap({});
                  setSelectedStoreId(null);
				  setShowStoreManager(false);
                  setIsCreatingStore(false);
                  setCurrentPage('pagina-inicial');
           // Não remove mais 'audioUnlocked' do localStorage no logout
           stopAlarm(); // Garante que o alarme pare no logout
                }
                setAuthLoading(false);
          });

	  return () => unsubscribe();
        }, [stopAlarm, setCurrentPage]);

    useEffect(() => {
        let isMounted = true;

        const loadStoresForUser = async () => {
            if (!user) {
                if (isMounted) {
                    setAvailableStores([]);
                    setStoreInfoMap({});
                    storeCollectionsDataRef.current = {};
                    setSelectedStoreId(null);
                }
                return;
            }

            try {
                let storeIds = [];

                if (user.role === ROLE_OWNER && user.canAccessAllStores) {
                    const snapshot = await getDocs(collection(db, 'lojas'));
                    storeIds = snapshot.docs.map((docSnap) => docSnap.id);
                } else {
                    storeIds = user.lojaIds && user.lojaIds.length ? user.lojaIds : (user.lojaId ? [user.lojaId] : []);
                }

                if (!isMounted) return;

                setAvailableStores(storeIds);

                setSelectedStoreId((prevSelected) => {
                    if (user.role === ROLE_OWNER) {
                        if (prevSelected === STORE_ALL_KEY) return STORE_ALL_KEY;
                        if (prevSelected && storeIds.includes(prevSelected)) return prevSelected;
                        return STORE_ALL_KEY;
                    }

                    const preferredStoreId = user.lojaId && storeIds.includes(user.lojaId)
                        ? user.lojaId
                        : (storeIds.length ? storeIds[0] : null);

                    if (prevSelected && storeIds.includes(prevSelected)) return prevSelected;
                    return preferredStoreId;
                });
            } catch (error) {
                console.error('Erro ao carregar lojas do usuário:', error);
                if (isMounted) {
                    setAvailableStores([]);
                }
            }
        };

        loadStoresForUser();

        return () => {
            isMounted = false;
        };
    }, [user, setSelectedStoreId]);

    useEffect(() => {
        let active = true;

        const loadStoreInfos = async () => {
            if (!availableStores.length) {
                if (active) {
                    setStoreInfoMap({});
                }
                return;
            }

            try {
                const entries = await Promise.all(availableStores.map(async (storeId) => {
                    try {
                        const empresaDocRef = doc(db, 'lojas', storeId, 'meuEspaco', 'empresa');
                        const empresaDocSnap = await getDoc(empresaDocRef);
                        if (empresaDocSnap.exists()) {
                            return [storeId, empresaDocSnap.data()];
                        }

                        const pontoDocSnap = await getDoc(doc(db, 'lojas', storeId, 'meuEspaco', 'ponto'));
                        if (pontoDocSnap.exists()) {
                            return [storeId, pontoDocSnap.data()];
                        }

                        const fallbackDocSnap = await getDoc(doc(db, 'lojas', storeId));
                        if (fallbackDocSnap.exists()) {
                            return [storeId, fallbackDocSnap.data()];
                        }
                    } catch (error) {
                        console.error(`Erro ao buscar info da loja ${storeId}:`, error);
                    }
                    return [storeId, {}];
                }));

                if (active) {
                    setStoreInfoMap(Object.fromEntries(entries));
                }
            } catch (error) {
                console.error('Erro geral ao buscar informações das lojas:', error);
                if (active) {
                    setStoreInfoMap({});
                }
            }
        };

        loadStoreInfos();

        return () => {
            active = false;
        };
    }, [availableStores]);

    const handleLogin = async () => {
        setLoginError('');
        try {
            try {
                await setPersistence(auth, browserLocalPersistence);
            } catch (persistError) {
                console.warn('[Auth][Email] local persistence failed, falling back to session:', persistError?.code || persistError);
                await setPersistence(auth, browserSessionPersistence);
            }
            await signInWithEmailAndPassword(auth, email, password);
            setShowLogin(false);
            setEmail('');
            setPassword('');
            setCurrentPage('dashboard');
             // O onAuthStateChanged cuidará de inicializar o AudioManager se necessário
        } catch (error) {
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                setLoginError('Email ou senha inválidos.');
            } else {
                 console.error("Erro no login:", error);
                setLoginError('Ocorreu um erro. Tente novamente.');
            }
        }
    };

    const handleGoogleSignIn = async () => {
        setLoginError('');
        const provider = new GoogleAuthProvider();
        const isSafari = isSafariBrowser();

        console.log('[Auth][Google] Browser detect:', isSafari ? 'Safari' : 'Non-Safari');

        try {
            try {
                await setPersistence(auth, browserLocalPersistence);
            } catch (persistError) {
                console.warn('[Auth][Google] local persistence failed, falling back to session:', persistError?.code || persistError);
                await setPersistence(auth, browserSessionPersistence);
            }

            if (isSafari) {
                console.log('[Auth][Google] Method: redirect');
                sessionStorage.setItem(GOOGLE_AUTH_FLOW_KEY, GOOGLE_AUTH_FLOW_REDIRECT);
                await signInWithRedirect(auth, provider);
                return;
            }

            console.log('[Auth][Google] Method: popup');
            sessionStorage.setItem(GOOGLE_AUTH_FLOW_KEY, GOOGLE_AUTH_FLOW_POPUP);
            await signInWithPopup(auth, provider);
            sessionStorage.removeItem(GOOGLE_AUTH_FLOW_KEY);
            setShowLogin(false);
            setCurrentPage('dashboard');
        } catch (error) {
            const fallbackToRedirect = error?.code === 'auth/popup-blocked' || error?.code === 'auth/cancelled-popup-request';

            if (fallbackToRedirect) {
                try {
                    console.log('[Auth][Google] Method fallback: redirect');
                    sessionStorage.setItem(GOOGLE_AUTH_FLOW_KEY, GOOGLE_AUTH_FLOW_REDIRECT);
                    await signInWithRedirect(auth, provider);
                    return;
                } catch (redirectError) {
                    console.error('Erro no fallback de redirect do Google:', redirectError?.code || redirectError);
                }
            }
            console.error("Erro no login com Google:", error?.code || error);
            setLoginError('Ocorreu um erro ao entrar com Google.');
        }
    };

    useEffect(() => {
        let active = true;

        const validateGoogleRedirectResult = async () => {
            try {
                const result = await getRedirectResult(auth);
                const googleUser = result?.user;

                if (result) {
                    console.log('[Auth][Google] getRedirectResult: success');
                } else {
                    console.log('[Auth][Google] getRedirectResult: no pending redirect result');
                }

                if (!googleUser?.email) {
                    return;
                }
                sessionStorage.removeItem(GOOGLE_AUTH_FLOW_KEY);

                if (active) {
                    setShowLogin(false);
                    setCurrentPage('dashboard');
                }
            } catch (error) {
                console.error("Erro ao processar retorno do login com Google:", error?.code || error);
                if (active) {
                    setLoginError('Ocorreu um erro ao entrar com Google.');
                }
            }
        };

        validateGoogleRedirectResult();

        return () => {
            active = false;
        };
    }, []);
    
    const handlePasswordReset = async () => {
        if (!passwordResetEmail) {
            setPasswordResetMessage({ text: 'Por favor, insira seu email.', type: 'error' });
            return;
        }
        setPasswordResetMessage({ text: 'Enviando email...', type: 'loading' });
        try {
            await sendPasswordResetEmail(auth, passwordResetEmail);
            setPasswordResetMessage({ text: 'Email de recuperação enviado! Verifique sua caixa de entrada e spam.', type: 'success' });
        } catch (error) {
            if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
                setPasswordResetMessage({ text: 'Email não encontrado. Verifique o email digitado.', type: 'error' });
            } else {
                 console.error("Erro ao resetar senha:", error);
                setPasswordResetMessage({ text: 'Ocorreu um erro. Tente novamente.', type: 'error' });
            }
        }
    };


  const handleLogout = async () => { 
      stopAlarm(); // Garante que o alarme pare
      await signOut(auth); 
      // O useEffect do onAuthStateChanged agora cuida de resetar a página
  };

  const allMenuItems = [
    { id: 'pagina-inicial', permission: 'pagina-inicial', label: 'Página Inicial', icon: Home, roles: [ROLE_OWNER, ROLE_MANAGER, ROLE_ATTENDANT, ROLE_CLIENT, null] },
    { id: 'dashboard', permission: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: [ROLE_OWNER, ROLE_MANAGER] },
    { id: 'clientes', permission: 'clientes', label: 'Clientes', icon: Users, roles: [ROLE_OWNER, ROLE_MANAGER, ROLE_ATTENDANT] },
    { id: 'pedidos', permission: 'pedidos', label: 'Pedidos', icon: ShoppingCart, roles: [ROLE_OWNER, ROLE_MANAGER, ROLE_ATTENDANT] },
    { id: 'produtos', permission: 'produtos', label: 'Produtos', icon: Package, roles: [ROLE_OWNER, ROLE_MANAGER] },
    { id: 'entre-lojas', permission: 'entre-lojas', label: 'Entre Lojas', icon: ArrowLeftRight, roles: [ROLE_OWNER, ROLE_MANAGER, ROLE_ATTENDANT] },
    { id: 'agenda', permission: 'agenda', label: 'Agenda', icon: Calendar, roles: [ROLE_OWNER, ROLE_MANAGER, ROLE_ATTENDANT] },
    { id: 'fornecedores', permission: 'fornecedores', label: 'Fornecedores/Estoque', icon: Truck, roles: [ROLE_OWNER, ROLE_MANAGER] },
    { id: 'relatorios', permission: 'relatorios', label: 'Relatórios', icon: BarChart3, roles: [ROLE_OWNER, ROLE_MANAGER] },
    { id: 'meu-espaco', permission: 'meu-espaco', label: 'Meu Espaço', icon: Clock, roles: [ROLE_OWNER, ROLE_MANAGER, ROLE_ATTENDANT, ROLE_CLIENT] },
    { id: 'financeiro', permission: 'financeiro', label: 'Financeiro', icon: DollarSign, roles: [ROLE_OWNER, ROLE_MANAGER] },
    { id: 'nota-fiscal', permission: 'nota-fiscal', label: 'Nota Fiscal', icon: FileText, roles: [ROLE_OWNER, ROLE_MANAGER] },
    { id: 'ifood', permission: 'ifood', label: 'iFood Hub', icon: Store, roles: [ROLE_OWNER, ROLE_MANAGER] },
    { id: 'configuracoes', permission: 'configuracoes', label: 'Configurações', icon: Settings, roles: [ROLE_OWNER, ROLE_MANAGER] },
  ];
  const currentUserRole = user ? user.role : null;
  const menuItems = useMemo(() => {
    if (!user) {
      return allMenuItems.filter(item => item.roles.includes(null));
    }
    if (currentUserRole === ROLE_OWNER && !user?.hasCustomProfile) {
      return allMenuItems;
    }

    const permissionKeyFor = (item) => item.permission || item.id;
    const customPermissions = user.customPermissions;
    const normalizedPermissions = sanitizePermissions(user.permissions, currentUserRole);

    return allMenuItems.filter(item => {
      const permissionKey = permissionKeyFor(item);

      if (customPermissions) {
        return Boolean(customPermissions[permissionKey]);
      }

      if (item.roles?.includes(currentUserRole)) {
        return true;
      }

      return Boolean(normalizedPermissions[permissionKey]);
    });
  }, [allMenuItems, currentUserRole, user]);
  
  const ImageSlider = ({ images, onImageClick }) => { 
    const [currentIndex, setCurrentIndex] = useState(0); 
    const nextSlide = useCallback(() => { 
        setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length); 
    }, [images.length]); 
    useEffect(() => { 
        const timer = setInterval(nextSlide, 5000); 
        return () => clearInterval(timer); 
    }, [nextSlide]); 
    return ( 
        <div className="h-64 md:h-96 w-full m-auto relative group rounded-2xl overflow-hidden shadow-lg bg-pink-50/30"> 
            <div 
                style={{ backgroundImage: `url(${images[currentIndex]})` }} 
                className="w-full h-full bg-center bg-contain bg-no-repeat duration-500 cursor-pointer" 
                onClick={() => onImageClick(images[currentIndex])}
            ></div> 
        </div> 
    ); 
  };
  
  // Componentes de Páginas
  const PaginaInicial = () => {
    const slideImages = [ '/slide/slide1.png', '/slide/slide2.png', '/slide/slide3.png' ];
    return (
      <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Página Inicial</h1>
            <p className="text-gray-600 mt-1">Seja bem-vindo à Ana Guimarães Doceria!</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                <a
                    href={`${process.env.PUBLIC_URL}/cardapio-matriz`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium rounded-xl transition-all flex items-center gap-2 justify-center bg-gradient-to-r from-pink-500 to-rose-600 text-white hover:from-pink-600 hover:to-rose-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 px-6 py-3 w-full"
              >
                  <BookOpen className="w-4 h-4" /> Cardápio Delivery Loja Matriz
              </a>
                <a
                    href={`${process.env.PUBLIC_URL}/cardapio-garavelo`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium rounded-xl transition-all flex items-center gap-2 justify-center bg-gradient-to-r from-pink-500 to-rose-600 text-white hover:from-pink-600 hover:to-rose-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 px-6 py-3 w-full"
              >
                  <Store className="w-4 h-4" /> Cardápio Delivery Loja Garavelo
              </a>
                <a
                    href={`${process.env.PUBLIC_URL}/cardapio-festa`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium rounded-xl transition-all flex items-center gap-2 justify-center bg-gradient-to-r from-pink-500 to-rose-600 text-white hover:from-pink-600 hover:to-rose-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 px-6 py-3 w-full"
              >
                  <Gift className="w-4 h-4" /> Cardápio de Festas
              </a>
          </div>
        </div>
        <ImageSlider images={slideImages} onImageClick={setLightboxImage} />
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Sobre Nós</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <p className="text-gray-600 leading-relaxed mb-4">
                        Somos uma doceria apaixonada por criar momentos doces e inesquecíveis. Cada bolo, torta e doce é feito com ingredientes de alta qualidade e muito carinho, pensando em levar mais sabor para o seu dia.
                    </p>
                    <div className="space-y-3">
                        <a href="https://www.instagram.com/anaguimaraes.doceria/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-pink-600 font-semibold hover:underline">
                            <Instagram size={20} /> @anaguimaraes.doceria
                        </a>
                        <a href="https://wa.me/5562991056075" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-green-600 font-semibold hover:underline">
                            <MessageCircle size={20} /> (62) 99105-6075
                        </a>
                        <p className="flex items-center gap-2 text-gray-700">
                            <MapPin size={20} /> Av. Comercial, 433 - Jardim Nova Esperanca, Goiânia - GO
                        </p>
                    </div>
                    <div className="mt-4">
                        <h3 className="font-bold text-lg mb-2">Horário de Funcionamento:</h3>
                        <ul className="text-gray-600">
                            <li>Segunda a Sexta: 09:30 – 18:30</li>
                            <li>Sábado: 09:00 – 14:00</li>
                            <li>Domingo: Fechado</li>
                        </ul>
                    </div>
                </div>
                <div>
                    <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3821.890300951331!2d-49.3274707!3d-16.6725019!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x935ef50062f12789%3A0x5711296a03567da3!2sAna%20Guimar%C3%Aes%2d doceria!5e0!3m2!1spt-BR!2sbr!4v1661282662551!5m2!1spt-BR!2sbr" width="100%" height="300" style={{border:0}} allowFullScreen="" loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="rounded-lg shadow-md" title="Localização da Doceria"></iframe>
                </div>
            </div>
        </div>
      </div>
    );
  };

  const MeuEspaco = ({ user, resolveActiveStoreForWrite, currentStoreIdForDisplay }) => {
    const now = new Date();
    const initialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [selectedMonth, setSelectedMonth] = useState(initialMonth);
    const [companyInfo, setCompanyInfo] = useState({
      nome: '',
      endereco: '',
      cnpj: '',
      atividade: '',
      horarioTrabalho: '',
      competencia: `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`,
      gestorResponsavel: ''
    });
    const [companyLoading, setCompanyLoading] = useState(false);
    const [companySaving, setCompanySaving] = useState(false);
    const [records, setRecords] = useState([]);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [registerLoading, setRegisterLoading] = useState(false);
    const [registerMessage, setRegisterMessage] = useState(null);
    const [selectedEmployee, setSelectedEmployee] = useState('self');
    const [employees, setEmployees] = useState([]);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [editForm, setEditForm] = useState({ horaEntrada: '', horaSaida: '', horaAlmocoSaida: '', horaAlmocoRetorno: '', irregularidade: '', qtde: '', justificativa: '' });
    const [savingEdit, setSavingEdit] = useState(false);
    const [todayRecordData, setTodayRecordData] = useState(null);

    const isManager = user ? [ROLE_OWNER, ROLE_MANAGER].includes(user.role) : false;
    const userId = user?.auth?.uid || '';
    const userName = user?.auth?.displayName || user?.auth?.email || 'Gestor';

    const competenciaLabel = useMemo(() => {
      const [year, month] = selectedMonth.split('-');
      return `${month}/${year}`;
    }, [selectedMonth]);

    useEffect(() => {
      if (isManager) {
        setSelectedEmployee('all');
      } else if (userId) {
        setSelectedEmployee(userId);
      }
    }, [isManager, userId]);

    useEffect(() => {
      setCompanyInfo((prev) => ({ ...prev, competencia: competenciaLabel }));
    }, [competenciaLabel]);

    useEffect(() => {
      if (!currentStoreIdForDisplay || currentStoreIdForDisplay === STORE_ALL_KEY) {
        setCompanyInfo((prev) => ({ ...prev, nome: '', endereco: '', cnpj: '', atividade: '', horarioTrabalho: '', gestorResponsavel: '' }));
        return;
      }

      setCompanyLoading(true);
      const companyDoc = doc(db, 'lojas', currentStoreIdForDisplay, 'meuEspaco', 'empresa');
      const unsubscribe = onSnapshot(companyDoc, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setCompanyInfo((prev) => ({
            ...prev,
            ...data,
            competencia: competenciaLabel,
          }));
        } else {
          setCompanyInfo((prev) => ({ ...prev, nome: '', endereco: '', cnpj: '', atividade: '', horarioTrabalho: '', gestorResponsavel: '' }));
        }
        setCompanyLoading(false);
      }, (error) => {
        console.error('Erro ao carregar dados da empresa', error);
        setCompanyLoading(false);
      }, {
        __listenerOptions: true,
        operation: 'meu-espaco-company',
        route: 'meu-espaco',
        uid: userId
      });

      return () => unsubscribe();
    }, [currentStoreIdForDisplay, competenciaLabel]);

    useEffect(() => {
      if (!isManager || !currentStoreIdForDisplay || currentStoreIdForDisplay === STORE_ALL_KEY) {
        setEmployees([]);
        setEmployeesLoading(false);
        return;
      }

      setEmployeesLoading(true);
      const fetchEmployees = async () => {
        try {
          const snap = await getDocs(collection(db, 'users'));
          const list = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
          const filtered = list.filter(item => {
            const lojas = Array.isArray(item.lojaIds) ? item.lojaIds : (item.lojaId ? [item.lojaId] : []);
            return lojas.includes(currentStoreIdForDisplay);
          });
          setEmployees(filtered);
        } catch (error) {
          console.error('Erro ao buscar colaboradores', error);
        } finally {
          setEmployeesLoading(false);
        }
      };

      fetchEmployees();
    }, [isManager, currentStoreIdForDisplay]);

    useEffect(() => {
      if (!currentStoreIdForDisplay || currentStoreIdForDisplay === STORE_ALL_KEY) {
        setRecords([]);
        return;
      }

      setRecordsLoading(true);
      const pontosRef = collection(db, 'lojas', currentStoreIdForDisplay, 'pontos');
      const pontosQuery = query(pontosRef, where('competencia', '==', selectedMonth));
      const unsubscribe = onSnapshot(pontosQuery, (snapshot) => {
        const data = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        setRecords(data);
        setRecordsLoading(false);
      }, (error) => {
        console.error('Erro ao carregar registros de ponto', error);
        setRecords([]);
        setRecordsLoading(false);
      }, {
        __listenerOptions: true,
        operation: 'meu-espaco-pontos',
        route: 'meu-espaco',
        uid: userId
      });

      return () => unsubscribe();
    }, [currentStoreIdForDisplay, selectedMonth]);

    useEffect(() => {
      if (!currentStoreIdForDisplay || currentStoreIdForDisplay === STORE_ALL_KEY || !userId) {
        setTodayRecordData(null);
        return;
      }
      const today = new Date();
      const dayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const competenciaKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const pontosRef = collection(db, 'lojas', currentStoreIdForDisplay, 'pontos');
      const todayQuery = query(
        pontosRef,
        where('funcionarioId', '==', userId),
        where('dia', '==', dayKey),
        where('competencia', '==', competenciaKey),
        limit(1)
      );
      const unsubscribe = onSnapshot(todayQuery, (snapshot) => {
        if (!snapshot.empty) {
          setTodayRecordData({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
        } else {
          setTodayRecordData(null);
        }
      }, () => setTodayRecordData(null), {
        __listenerOptions: true,
        operation: 'meu-espaco-today',
        route: 'meu-espaco',
        uid: userId
      });
      return () => unsubscribe();
    }, [currentStoreIdForDisplay, userId]);

    const getDayInfo = (record) => {
      if (record.dia) {
        const [year, month, day] = record.dia.split('-').map(Number);
        if (year && month && day) {
          return new Date(year, month - 1, day);
        }
      }
      if (record.data && typeof record.data.toDate === 'function') {
        return record.data.toDate();
      }
      return null;
    };

    const formatTime = (value) => value || '--:--';

    const formatMinutesToLabel = (minutes) => {
      const hrs = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hrs}:${String(mins).padStart(2, '0')}`;
    };

    const calculateWorkSummary = (registro) => {
      if (!registro?.horaEntrada || !registro?.horaSaida) {
        return { workedLabel: '-', irregularidade: '-', workedMinutes: null };
      }

      const parseTime = (time) => {
        const [hours, minutes] = (time || '').split(':').map(Number);
        if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
        return hours * 60 + minutes;
      };

      const entrada = parseTime(registro.horaEntrada);
      const saida = parseTime(registro.horaSaida);

      if (entrada === null || saida === null) {
        return { workedLabel: '-', irregularidade: '-', workedMinutes: null };
      }

      let workedMinutes = saida - entrada;

      const almocoSaida = parseTime(registro.horaAlmocoSaida);
      const almocoRetorno = parseTime(registro.horaAlmocoRetorno);
      if (almocoSaida !== null && almocoRetorno !== null) {
        workedMinutes -= almocoRetorno - almocoSaida;
      }

      if (Number.isNaN(workedMinutes) || workedMinutes <= 0) {
        return { workedLabel: '-', irregularidade: '-', workedMinutes: null };
      }

      const workedLabel = formatMinutesToLabel(workedMinutes);

      const date = getDayInfo(registro);
      const dayOfWeek = date ? date.getDay() : null; // 0 = domingo
      const expectedMinutes = dayOfWeek !== null && dayOfWeek >= 1 && dayOfWeek <= 5 ? 8 * 60 : 0;

      const diff = workedMinutes - expectedMinutes;
      const irregularidade = dayOfWeek === null
        ? '-'
        : diff === 0
          ? '0:00'
          : `${diff > 0 ? '+' : '-'}${formatMinutesToLabel(Math.abs(diff))}`;

      return { workedLabel, irregularidade, workedMinutes };
    };

    const getWorkedTime = (registro) => calculateWorkSummary(registro).workedLabel;

    const getRecordDateTime = (record) => {
      if (record?.data && typeof record.data.toDate === 'function') {
        return record.data.toDate();
      }
      const baseDate = getDayInfo(record);
      if (!baseDate) return null;
      const timeString = record.horaEntrada || record.horaSaida || record.horaAlmocoRetorno || record.horaAlmocoSaida;
      if (timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
          return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hours, minutes);
        }
      }
      return baseDate;
    };

    const filteredRecords = useMemo(() => {
      const sorted = [...records].sort((a, b) => {
        const dateA = getRecordDateTime(a);
        const dateB = getRecordDateTime(b);
        if (dateA && dateB) {
          const diff = dateA - dateB;
          if (diff !== 0) return diff;
        }
        if (!dateA && dateB) return -1;
        if (dateA && !dateB) return 1;
        const createdA = a?.createdAt && typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate() : null;
        const createdB = b?.createdAt && typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate() : null;
        if (createdA && createdB) return createdA - createdB;
        if (!createdA && createdB) return -1;
        if (createdA && !createdB) return 1;
        return 0;
      });
      if (isManager) {
        if (selectedEmployee === 'all') return sorted;
        return sorted.filter(item => item.funcionarioId === selectedEmployee);
      }
      return sorted.filter(item => item.funcionarioId === userId);
    }, [records, isManager, selectedEmployee, userId]);

    const todayRecord = todayRecordData;

    const requestLocation = () => new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Seu navegador não suporta geolocalização.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });

    const getAddressFromCoordinates = async ({ latitude, longitude }) => {
      if (typeof latitude !== 'number' || typeof longitude !== 'number') return '';
      const params = new URLSearchParams({
        format: 'jsonv2',
        lat: String(latitude),
        lon: String(longitude),
        'accept-language': 'pt-BR'
      });

      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
          headers: {
            'Accept-Language': 'pt-BR'
          }
        });
        if (!response.ok) {
          throw new Error('Falha ao buscar endereço.');
        }
        const data = await response.json();
        if (data?.display_name) return data.display_name;
        if (data?.address) {
          const { road, neighbourhood, suburb, city, town, state, postcode } = data.address;
          const parts = [road, neighbourhood || suburb, city || town, state, postcode];
          const filtered = parts.filter(Boolean);
          if (filtered.length) {
            return filtered.join(', ');
          }
        }
        return '';
      } catch (error) {
        console.error('Erro ao obter endereço da localização', error);
        return '';
      }
    };

    const formatTimeString = (dateObj) => dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const handleRegisterPoint = async (type) => {
      try {
        setRegisterLoading(true);
        setRegisterMessage(null);
        const position = await requestLocation();
        const coords = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          capturedAt: new Date().toISOString()
        };
        const capturedAddress = await getAddressFromCoordinates(coords);
        const storeId = resolveActiveStoreForWrite();
        const pontosRef = collection(db, 'lojas', storeId, 'pontos');
        const currentDate = new Date();
        const dayKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
        const competenciaKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        if (selectedMonth !== competenciaKey) {
          setSelectedMonth(competenciaKey);
        }
        const existingQuery = query(
          pontosRef,
          where('funcionarioId', '==', userId),
          where('dia', '==', dayKey),
          where('competencia', '==', competenciaKey),
          limit(1)
        );
        const snapshot = await getDocs(existingQuery);
        const nowTime = formatTimeString(new Date());
        const payload = {
          entrada: {
            horaEntrada: nowTime,
            localizacaoEntrada: coords,
            localizacaoEntradaEndereco: capturedAddress || ''
          },
          almoco_inicio: {
            horaAlmocoSaida: nowTime
          },
          almoco_fim: {
            horaAlmocoRetorno: nowTime
          },
          saida: {
            horaSaida: nowTime,
            localizacaoSaida: coords,
            localizacaoSaidaEndereco: capturedAddress || ''
          }
        }[type];

        if (!payload) {
          throw new Error('Tipo de registro inválido.');
        }

        const baseData = {
          funcionarioId: userId,
          funcionarioNome: userName,
          dia: dayKey,
          data: Timestamp.now(),
          horaEntrada: '',
          horaSaida: '',
          horaAlmocoSaida: '',
          horaAlmocoRetorno: '',
          localizacaoEntrada: null,
          localizacaoEntradaEndereco: '',
          localizacaoSaida: null,
          localizacaoSaidaEndereco: '',
          irregularidade: '',
          qtde: '',
          justificativa: '',
          competencia: competenciaKey,
          empresaId: currentStoreIdForDisplay,
          historicoAlteracoes: [],
          createdAt: serverTimestamp()
        };

        if (snapshot.empty) {
          const recordToSave = { ...baseData, ...payload };
          const summary = calculateWorkSummary(recordToSave);
          await addDoc(pontosRef, {
            ...recordToSave,
            irregularidade: summary.irregularidade !== '-' ? summary.irregularidade : '',
            qtde: summary.workedLabel !== '-' ? summary.workedLabel : ''
          });
        } else {
          const existingData = snapshot.docs[0].data();
          const docRef = snapshot.docs[0].ref;
          const updatedRecord = { ...existingData, ...payload };
          const summary = calculateWorkSummary(updatedRecord);
          await updateDoc(docRef, {
            ...payload,
            irregularidade: summary.irregularidade !== '-' ? summary.irregularidade : '',
            qtde: summary.workedLabel !== '-' ? summary.workedLabel : '',
            updatedAt: serverTimestamp()
          });
        }
        const actionMap = {
          entrada: 'entrada',
          almoco_inicio: 'início do almoço',
          almoco_fim: 'retorno do almoço',
          saida: 'saída'
        };
        setRegisterMessage({ type: 'success', text: `Ponto de ${actionMap[type]} registrado com sucesso!` });
      } catch (error) {
        console.error('Erro ao registrar ponto', error);
        setRegisterMessage({ type: 'error', text: error.message || 'Não foi possível registrar o ponto.' });
      } finally {
        setRegisterLoading(false);
      }
    };

    const handleSaveCompanyInfo = async (event) => {
      event.preventDefault();
      if (!isManager) return;
      if (!currentStoreIdForDisplay || currentStoreIdForDisplay === STORE_ALL_KEY) {
        alert('Selecione uma loja para salvar as informações.');
        return;
      }

      try {
        setCompanySaving(true);
        const storeId = resolveActiveStoreForWrite();
        const companyDoc = doc(db, 'lojas', storeId, 'meuEspaco', 'empresa');
        await setDoc(companyDoc, {
          nome: companyInfo.nome || '',
          endereco: companyInfo.endereco || '',
          cnpj: companyInfo.cnpj || '',
          atividade: companyInfo.atividade || '',
          horarioTrabalho: companyInfo.horarioTrabalho || '',
          competencia: competenciaLabel,
          gestorResponsavel: companyInfo.gestorResponsavel || userName,
          gestorId: userId,
          atualizadoEm: serverTimestamp()
        }, { merge: true });
        setRegisterMessage({ type: 'success', text: 'Informações da empresa salvas com sucesso!' });
      } catch (error) {
        console.error('Erro ao salvar dados da empresa', error);
        setRegisterMessage({ type: 'error', text: 'Não foi possível salvar as informações da empresa.' });
      } finally {
        setCompanySaving(false);
      }
    };

    const openEditModal = (record) => {
      const summary = calculateWorkSummary(record);
      setEditingRecord(record);
      setEditForm({
        horaEntrada: record.horaEntrada || '',
        horaSaida: record.horaSaida || '',
        horaAlmocoSaida: record.horaAlmocoSaida || '',
        horaAlmocoRetorno: record.horaAlmocoRetorno || '',
        irregularidade: summary.irregularidade !== '-' ? summary.irregularidade : '',
        qtde: summary.workedLabel !== '-' ? summary.workedLabel : '',
        justificativa: record.justificativa || ''
      });
    };

    const handleSaveEdit = async () => {
      if (!editingRecord) return;
      try {
        setSavingEdit(true);
        const storeId = resolveActiveStoreForWrite();
        const recordRef = doc(db, 'lojas', storeId, 'pontos', editingRecord.id);
        const nowDate = new Date();
        const summary = calculateWorkSummary({ ...editingRecord, ...editForm });
        await updateDoc(recordRef, {
          horaEntrada: editForm.horaEntrada || '',
          horaSaida: editForm.horaSaida || '',
          horaAlmocoSaida: editForm.horaAlmocoSaida || '',
          horaAlmocoRetorno: editForm.horaAlmocoRetorno || '',
          irregularidade: summary.irregularidade !== '-' ? summary.irregularidade : '',
          qtde: summary.workedLabel !== '-' ? summary.workedLabel : '',
          justificativa: editForm.justificativa || '',
          gestorId: userId,
          dataAjuste: serverTimestamp(),
          historicoAlteracoes: arrayUnion({
            data: nowDate.toISOString(),
            gestor: userName,
            alteracoes: { ...editForm, irregularidade: summary.irregularidade, qtde: summary.workedLabel }
          })
        });
        setRegisterMessage({ type: 'success', text: 'Registro de ponto atualizado.' });
        setEditingRecord(null);
      } catch (error) {
        console.error('Erro ao atualizar registro', error);
        setRegisterMessage({ type: 'error', text: 'Não foi possível atualizar o registro.' });
      } finally {
        setSavingEdit(false);
      }
    };

    if (!currentStoreIdForDisplay || currentStoreIdForDisplay === STORE_ALL_KEY) {
      return (
        <div className="p-4 md:p-6">
          <div className="bg-white rounded-2xl shadow p-6 text-center">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Selecione uma loja</h2>
            <p className="text-gray-600">Para acessar o Meu Espaço, escolha uma loja específica no topo do sistema.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/20 to-rose-50/20 min-h-screen">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-gray-800">Meu Espaço</h1>
          <p className="text-gray-600">Registre seu ponto e acompanhe os horários do mês atual.</p>
        </div>

        {registerMessage && (
          <div className={`p-4 rounded-2xl ${registerMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            {registerMessage.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-800">Registro de ponto</h2>
                <p className="text-gray-500 text-sm">A localização é capturada automaticamente.</p>
              </div>
              <Clock className="w-10 h-10 text-pink-500" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                onClick={() => handleRegisterPoint('entrada')}
                disabled={registerLoading}
              >
                Registrar entrada
              </Button>
              <Button
                variant="outline"
                onClick={() => handleRegisterPoint('almoco_inicio')}
                disabled={registerLoading || !todayRecord?.horaEntrada}
              >
                Registrar início do almoço
              </Button>
              <Button
                variant="outline"
                onClick={() => handleRegisterPoint('almoco_fim')}
                disabled={registerLoading || !todayRecord?.horaAlmocoSaida}
              >
                Registrar retorno do almoço
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleRegisterPoint('saida')}
                disabled={registerLoading}
              >
                Registrar saída
              </Button>
            </div>
            {todayRecord && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-gray-50 rounded-xl p-4">
                <div>
                  <p className="text-gray-500">Entrada</p>
                  <p className="font-semibold text-gray-800">{formatTime(todayRecord.horaEntrada)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Saída</p>
                  <p className="font-semibold text-gray-800">{formatTime(todayRecord.horaSaida)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Início do almoço</p>
                  <p className="font-semibold text-gray-800">{formatTime(todayRecord.horaAlmocoSaida)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Retorno do almoço</p>
                  <p className="font-semibold text-gray-800">{formatTime(todayRecord.horaAlmocoRetorno)}</p>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSaveCompanyInfo} className="bg-white rounded-2xl shadow p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-800">Informações da empresa</h2>
                <p className="text-gray-500 text-sm">Dados exibidos no cabeçalho do relatório.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Nome da empresa" value={companyInfo.nome} onChange={(e) => setCompanyInfo({ ...companyInfo, nome: e.target.value })} disabled={!isManager} required={isManager} />
              <Input label="CNPJ" value={companyInfo.cnpj} onChange={(e) => setCompanyInfo({ ...companyInfo, cnpj: e.target.value })} disabled={!isManager} />
              <Input label="Endereço" value={companyInfo.endereco} onChange={(e) => setCompanyInfo({ ...companyInfo, endereco: e.target.value })} disabled={!isManager} />
              <Input label="Atividade econômica" value={companyInfo.atividade} onChange={(e) => setCompanyInfo({ ...companyInfo, atividade: e.target.value })} disabled={!isManager} />
              <Input label="Horário de trabalho" value={companyInfo.horarioTrabalho} onChange={(e) => setCompanyInfo({ ...companyInfo, horarioTrabalho: e.target.value })} disabled={!isManager} />
              <Input label="Competência" value={competenciaLabel} disabled readOnly />
              <Input label="Gestor responsável" value={companyInfo.gestorResponsavel || userName} onChange={(e) => setCompanyInfo({ ...companyInfo, gestorResponsavel: e.target.value })} disabled={!isManager} />
            </div>
            {isManager && (
              <div className="flex justify-end">
                <Button type="submit" disabled={companyLoading || companySaving}>{companySaving ? 'Salvando...' : 'Salvar informações'}</Button>
              </div>
            )}
          </form>
        </div>

        <div className="bg-white rounded-2xl shadow p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-800">Registros do mês</h2>
                <p className="text-gray-500 text-sm">Visualização automática do mês selecionado.</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-pink-100 text-pink-700 px-3 py-1 text-sm font-semibold">
                Registros ({filteredRecords.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              <Input
                type="month"
                label="Mês"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="min-w-[160px]"
              />
              {isManager && (
                <Select label="Colaborador" value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} disabled={employeesLoading} className="min-w-[200px]">
                  {employeesLoading ? (
                    <option>Carregando...</option>
                  ) : (
                    <>
                      <option value="all">Todos</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>{employee.nome || employee.email || employee.id}</option>
                      ))}
                    </>
                  )}
                </Select>
              )}
            </div>
          </div>

          {recordsLoading ? (
            <div className="py-10 text-center text-gray-500">Carregando registros...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="py-10 text-center text-gray-500">Nenhum registro encontrado para o período selecionado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-3 px-4">Funcionário</th>
                    <th className="py-3 px-4">Dia da semana</th>
                    <th className="py-3 px-4">Dia do Mês</th>
                    <th className="py-3 px-4">Entrada</th>
                    <th className="py-3 px-4">Saída almoço</th>
                    <th className="py-3 px-4">Retorno almoço</th>
                    <th className="py-3 px-4">Saída</th>
                    <th className="py-3 px-4">Irregularidade</th>
                    <th className="py-3 px-4">Qtde</th>
                    <th className="py-3 px-4">Justificativa</th>
                    {isManager && <th className="py-3 px-4">Localização</th>}
                    {isManager && <th className="py-3 px-4">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredRecords.map((registro) => {
                    const date = getDayInfo(registro);
                    const diaSemana = date ? date.toLocaleDateString('pt-BR', { weekday: 'long' }) : '-';
                    const diaMes = date ? String(date.getDate()).padStart(2, '0') : '-';
                    const workSummary = calculateWorkSummary(registro);
                    return (
                      <tr key={registro.id} className="hover:bg-gray-50">
                        <td className="py-3 px-4">{registro.funcionarioNome || '-'}</td>
                        <td className="py-3 px-4 capitalize">{diaSemana}</td>
                        <td className="py-3 px-4">{diaMes}</td>
                        <td className="py-3 px-4 font-semibold">{formatTime(registro.horaEntrada)}</td>
                        <td className="py-3 px-4 font-semibold">{formatTime(registro.horaAlmocoSaida)}</td>
                        <td className="py-3 px-4 font-semibold">{formatTime(registro.horaAlmocoRetorno)}</td>
                        <td className="py-3 px-4 font-semibold">{formatTime(registro.horaSaida)}</td>
                        <td className="py-3 px-4">{workSummary.irregularidade}</td>
                        <td className="py-3 px-4">{workSummary.workedLabel}</td>
                        <td className="py-3 px-4 max-w-xs">{registro.justificativa || '-'}</td>
                        {isManager && (
                          <td className="py-3 px-4">
                            <div className="space-y-3 text-xs">
                              {registro.localizacaoEntrada && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1 font-semibold text-pink-600">
                                    <MapPin className="w-4 h-4" /> Entrada
                                  </div>
                                  <p className="text-gray-600">
                                    {registro.localizacaoEntradaEndereco || 'Endereço não disponível'}
                                  </p>
                                  <a
                                    href={`https://maps.google.com/?q=${registro.localizacaoEntrada.latitude},${registro.localizacaoEntrada.longitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-pink-600 hover:underline"
                                  >
                                    Ver no mapa
                                  </a>
                                </div>
                              )}
                              {registro.localizacaoSaida && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1 font-semibold text-emerald-600">
                                    <MapPin className="w-4 h-4" /> Saída
                                  </div>
                                  <p className="text-gray-600">
                                    {registro.localizacaoSaidaEndereco || 'Endereço não disponível'}
                                  </p>
                                  <a
                                    href={`https://maps.google.com/?q=${registro.localizacaoSaida.latitude},${registro.localizacaoSaida.longitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
                                  >
                                    Ver no mapa
                                  </a>
                                </div>
                              )}
                            </div>
                          </td>
                        )}
                        {isManager && (
                          <td className="py-3 px-4">
                            <Button size="sm" variant="secondary" onClick={() => openEditModal(registro)}>Editar</Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Modal isOpen={Boolean(editingRecord)} onClose={() => setEditingRecord(null)} title="Editar registro" size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Hora de entrada" type="time" value={editForm.horaEntrada} onChange={(e) => setEditForm({ ...editForm, horaEntrada: e.target.value })} />
              <Input label="Hora de saída" type="time" value={editForm.horaSaida} onChange={(e) => setEditForm({ ...editForm, horaSaida: e.target.value })} />
              <Input label="Saída para almoço" type="time" value={editForm.horaAlmocoSaida} onChange={(e) => setEditForm({ ...editForm, horaAlmocoSaida: e.target.value })} />
              <Input label="Retorno do almoço" type="time" value={editForm.horaAlmocoRetorno} onChange={(e) => setEditForm({ ...editForm, horaAlmocoRetorno: e.target.value })} />
              <Input label="Irregularidade" value={editForm.irregularidade} onChange={(e) => setEditForm({ ...editForm, irregularidade: e.target.value })} />
              <Input label="Quantidade (horas)" value={editForm.qtde} onChange={(e) => setEditForm({ ...editForm, qtde: e.target.value })} />
            </div>
            <Textarea label="Justificativa" value={editForm.justificativa} onChange={(e) => setEditForm({ ...editForm, justificativa: e.target.value })} />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setEditingRecord(null)}>Cancelar</Button>
              <Button onClick={handleSaveEdit} disabled={savingEdit}>{savingEdit ? 'Salvando...' : 'Salvar ajustes'}</Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  };

  // --- CORREÇÃO: Props do Dashboard atualizadas ---
  const Dashboard = ({handleStopAndSnoozeAlarm, isAlarmPlaying, isAlarmSnoozed, hasNewPendingOrders, snoozeEndTime, alarmPauseMinutes}) => {
    const { pedidos, clientes } = data;
    
    // --- CORREÇÃO: Lógica de display da soneca movida para dentro do Dashboard ---
    const [snoozeDisplay, setSnoozeDisplay] = useState('');
    const snoozeDisplayTimerRef = useRef(null);
    // --- CORREÇÃO: State local para audioUnlocked (lido do manager) ---
    const [audioAllowed, setAudioAllowed] = useState(audioManager.unlocked);

    // Efeito para observar mudanças no estado 'unlocked' do AudioManager
    useEffect(() => {
        const checkAudioState = () => {
             // Força a atualização do estado local lendo a propriedade do manager
            setAudioAllowed(audioManager.unlocked);
        };
        // Checa o estado a cada segundo
        const interval = setInterval(checkAudioState, 1000);
        checkAudioState(); // Checa imediatamente na montagem
        return () => clearInterval(interval); // Limpa o intervalo ao desmontar
    }, []); // Roda apenas uma vez no mount


    useEffect(() => {
        if (isAlarmSnoozed && snoozeEndTime) {
            // Limpa timer anterior, se houver
            if (snoozeDisplayTimerRef.current) clearInterval(snoozeDisplayTimerRef.current);
            
            // Função para atualizar o display
            const updateDisplay = () => {
                const now = new Date().getTime();
                const remaining = snoozeEndTime - now;

                if (remaining > 0) {
                    const minutes = Math.floor(remaining / 60000);
                    const seconds = Math.floor((remaining % 60000) / 1000);
                    setSnoozeDisplay(`${minutes}:${seconds.toString().padStart(2, '0')}`);
                } else {
                    // Timer expirou, limpa o display e o timer
                    setSnoozeDisplay('');
                    if (snoozeDisplayTimerRef.current) clearInterval(snoozeDisplayTimerRef.current);
                }
            };
            
            updateDisplay(); // Atualiza imediatamente
            snoozeDisplayTimerRef.current = setInterval(updateDisplay, 1000); // Atualiza a cada segundo
        } else {
            // Garante que, se não estiver em soneca, o timer e o display sejam limpos
            if (snoozeDisplayTimerRef.current) clearInterval(snoozeDisplayTimerRef.current);
            setSnoozeDisplay('');
        }

        // Função de limpeza para o timer do display
        return () => {
            if (snoozeDisplayTimerRef.current) clearInterval(snoozeDisplayTimerRef.current);
        };
    }, [isAlarmSnoozed, snoozeEndTime]); // Roda sempre que o estado de soneca ou o tempo final mudarem


    const today = new Date(); 
    today.setHours(0, 0, 0, 0);
    const lastSunday = new Date(); 
    lastSunday.setDate(lastSunday.getDate() - lastSunday.getDay()); 
    lastSunday.setHours(0, 0, 0, 0);
    const vendasHoje = (pedidos || []).filter(pedido => { const pedidoDate = getJSDate(pedido.createdAt); if (!pedidoDate) return false; pedidoDate.setHours(0,0,0,0); return pedidoDate.getTime() === today.getTime() && pedido.status === 'Finalizado'; }).reduce((acc, pedido) => acc + (pedido.total || 0), 0);
    const numVendasHoje = (pedidos || []).filter(pedido => { const pedidoDate = getJSDate(pedido.createdAt); if (!pedidoDate) return false; pedidoDate.setHours(0,0,0,0); return pedidoDate.getTime() === today.getTime() && pedido.status === 'Finalizado'; }).length;
    const vendasSemana = (pedidos || []).filter(pedido => { const pedidoDate = getJSDate(pedido.createdAt); if (!pedidoDate) return false; return pedidoDate >= lastSunday && pedidoDate <= new Date() && pedido.status === 'Finalizado'; }).reduce((acc, pedido) => acc + (pedido.total || 0), 0);
    const numVendasSemana = (pedidos || []).filter(pedido => { const pedidoDate = getJSDate(pedido.createdAt); if (!pedidoDate) return false; return pedidoDate >= lastSunday && pedidoDate <= new Date() && pedido.status === 'Finalizado'; }).length;
    
    const activeStatuses = ['Pendente', 'Em Produção', 'Pronto para Entrega'];
    const pedidosPendentesCRM = (pedidos || []).filter(p => activeStatuses.includes(p.status) && p.origem !== 'Cardapio Online').length;
    const pedidosPendentesWhatsApp = (pedidos || []).filter(p => activeStatuses.includes(p.status) && p.origem === 'Cardapio Online').length;
    
    const clientesAtivos = (clientes || []).length;
    
    const upcomingBirthdays = useMemo(() => {
        if (!clientes) return [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const limitDate = new Date();
        limitDate.setDate(today.getDate() + 30);

        return clientes.filter(cliente => {
            if (!cliente.aniversario || !/^\d{4}-\d{2}-\d{2}$/.test(cliente.aniversario)) return false;

            const [, month, day] = cliente.aniversario.split('-');
            const birthMonth = parseInt(month, 10) - 1;
            const birthDay = parseInt(day, 10);

            const currentYearBirthday = new Date(today.getFullYear(), birthMonth, birthDay);
            currentYearBirthday.setHours(0, 0, 0, 0);

            const nextYearBirthday = new Date(today.getFullYear() + 1, birthMonth, birthDay);
            nextYearBirthday.setHours(0, 0, 0, 0);

            const upcomingBirthday = currentYearBirthday < today ? nextYearBirthday : currentYearBirthday;
            
            return upcomingBirthday >= today && upcomingBirthday <= limitDate;
        }).sort((a, b) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const getUpcomingBirthday = (aniversario) => {
                 const [, month, day] = aniversario.split('-');
                 const birthMonth = parseInt(month, 10) - 1;
                 const birthDay = parseInt(day, 10);
                 const currentYearBirthday = new Date(today.getFullYear(), birthMonth, birthDay);
                 currentYearBirthday.setHours(0, 0, 0, 0);
                 const nextYearBirthday = new Date(today.getFullYear() + 1, birthMonth, birthDay);
                 nextYearBirthday.setHours(0, 0, 0, 0);
                 return currentYearBirthday < today ? nextYearBirthday : currentYearBirthday;
            };

            const dateA = getUpcomingBirthday(a.aniversario);
            const dateB = getUpcomingBirthday(b.aniversario);
            
            return dateA - dateB;
        });
    }, [clientes]);

    const upcomingFestaOrders = useMemo(() => {
        if (!pedidos) return [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const limitDate = new Date();
        limitDate.setDate(today.getDate() + 7);
        limitDate.setHours(23, 59, 59, 999);
  
        return pedidos
            .filter(pedido => {
                if (pedido.categoria !== 'Festa' || !pedido.dataEntrega || ['Finalizado', 'Cancelado'].includes(pedido.status)) {
                    return false;
                }
                const entregaDate = new Date(pedido.dataEntrega + 'T00:00:00'); // Considera a data no início do dia
                // entregaDate.setHours(0, 0, 0, 0); // Ajuste já feito na criação
  
                return entregaDate >= today && entregaDate <= limitDate;
            })
            .sort((a, b) => new Date(a.dataEntrega) - new Date(b.dataEntrega));
    }, [pedidos]);

    return (
      <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
        
        <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
            <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Dashboard</h1>
                <p className="text-gray-600 mt-1">Visão geral da sua doceria</p>
            </div>
            
            {/* Container para os banners de alarme e soneca */}
            <div className="w-full md:w-auto md:min-w-[300px] space-y-2"> 
                {hasNewPendingOrders && !isAlarmSnoozed && (
                  <div className={`p-3 rounded-lg transition-colors ${
                    isAlarmPlaying ? 'bg-red-100 border border-red-300 text-red-700' : 'bg-yellow-100 border border-yellow-300 text-yellow-700'
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center">
                        <Bell className={`w-6 h-6 mr-3 ${isAlarmPlaying ? 'animate-bounce' : ''}`} />
                        <div>
                          <p className="font-bold">
                            {isAlarmPlaying ? "🔊 NOVO PEDIDO!" : "📱 Pedido Pendente!"}
                          </p>
                          {/* Mostra aviso apenas se o som estiver bloqueado E o alarme não estiver tocando */}
                          {!audioAllowed && !isAlarmPlaying && (
                            <p className="text-sm text-yellow-600">
                              🔒 Áudio bloqueado
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex gap-2 flex-shrink-0">
                         {/* Botão de Ativar Som removido daqui, é global agora */}
                        
                        <Button 
                          variant={isAlarmPlaying ? "danger" : "secondary"} 
                          size="sm" 
                          onClick={handleStopAndSnoozeAlarm}
                          className="text-xs" // Deixa o botão um pouco menor
                        >
                          <VolumeX className="w-4 h-4 mr-1" />
                          {isAlarmPlaying ? "Parar" : `Pausar (${alarmPauseMinutes}min)`}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {isAlarmSnoozed && (
                  <div className="bg-blue-100 border border-blue-300 text-blue-700 p-3 rounded-lg flex items-center">
                    <Clock className="w-5 h-5 mr-3 flex-shrink-0" />
                    <div>
                        <p className="font-bold">Alarme Pausado</p>
                        {/* Usa o snoozeDisplay local do Dashboard */}
                        <p className="text-sm">Reativando em <strong>{snoozeDisplay}</strong></p> 
                    </div>
                  </div>
                )}
            </div>
        </div>


        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg"><DollarSign className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Vendas Hoje</p><h2 className="text-2xl font-bold text-gray-800">R$ {vendasHoje.toFixed(2)}</h2></div></div></div>
            <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg"><ShoppingCart className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Nº Vendas Hoje</p><h2 className="text-2xl font-bold text-gray-800">{numVendasHoje}</h2></div></div></div>
            <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg"><BarChart3 className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Vendas Semana</p><h2 className="text-2xl font-bold text-gray-800">R$ {vendasSemana.toFixed(2)}</h2></div></div></div>
            <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg"><ShoppingCart className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Nº Vendas Semana</p><h2 className="text-2xl font-bold text-gray-800">{numVendasSemana}</h2></div></div></div>
            <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl flex items-center justify-center shadow-lg"><Heart className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Clientes ativos</p><h2 className="text-2xl font-bold text-gray-800">{clientesAtivos}</h2></div></div></div>
            <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg"><Clock className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Pendentes (CRM)</p><h2 className="text-2xl font-bold text-gray-800">{pedidosPendentesCRM}</h2></div></div></div>
            <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg"><MessageSquare className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Pendentes (WhatsApp)</p><h2 className="text-2xl font-bold text-gray-800">{pedidosPendentesWhatsApp}</h2></div></div></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {upcomingBirthdays.length > 0 && (
                <div className="bg-white p-6 rounded-2xl shadow-lg">
                    <div className="flex items-center gap-3 mb-4">
                        <Cake className="w-6 h-6 text-pink-500" />
                        <h3 className="text-xl font-bold text-gray-800">Aniversariantes Próximos</h3>
                    </div>
                    <div className="space-y-3 max-h-48 overflow-y-auto">
                        {upcomingBirthdays.map(cliente => (
                            <div key={cliente.id} className="flex items-center justify-between p-3 bg-pink-50 rounded-lg">
                                <p className="font-semibold text-gray-700">{cliente.nome}</p>
                                <p className="text-sm text-pink-600 font-medium">
                                    {new Date(cliente.aniversario + 'T03:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {upcomingFestaOrders.length > 0 && (
                <div className="bg-white p-6 rounded-2xl shadow-lg">
                    <div className="flex items-center gap-3 mb-4">
                        <Gift className="w-6 h-6 text-purple-500" />
                        <h3 className="text-xl font-bold text-gray-800">Próximas Entregas (Festa)</h3>
                    </div>
                    <div className="space-y-3 max-h-48 overflow-y-auto">
                        {upcomingFestaOrders.map(pedido => (
                            <div key={pedido.id} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                                <div>
                                    <p className="font-semibold text-gray-700">{pedido.clienteNome}</p>
                                    <p className="text-sm text-gray-500">Pedido para festa</p>
                                </div>
                                <p className="text-sm text-purple-600 font-medium">
                                    {new Date(pedido.dataEntrega + 'T03:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </div>
    );
  };

  const Clientes = () => {
    const { clientes } = data;
    const [searchTerm, setSearchTerm] = usePersistentState("clientes_searchTerm", "");
    const [showModal, setShowModal] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const defaultClientFormData = { nome: "", email: "", telefone: "", cpf: "", documento: "", endereco: "", cep: "", bairro: "", cidade: "Goiania", uf: "GO", codigoIbge: "5208707", aniversario: "", status: "Ativo" };
    const [formData, setFormData] = useState(defaultClientFormData);

    const filteredClients = useMemo(() => {
      const term = searchTerm.toLowerCase();
      const digitsTerm = searchTerm.replace(/\D/g, '');
      return (clientes || []).filter(c => (c.nome && c.nome.toLowerCase().includes(term)) || (c.email && c.email.toLowerCase().includes(term)) || (digitsTerm && (c.cpf || c.documento) && String(c.cpf || c.documento).includes(digitsTerm)));
    }, [clientes, searchTerm]);
    
    const resetForm = () => {
      setEditingClient(null);
      setFormData(defaultClientFormData);
    };

    const handleNewClient = () => {
      resetForm();
      setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const fiscalDocument = String(formData.cpf || formData.documento || '').replace(/\D/g, '');
        const fiscalZip = String(formData.cep || '').replace(/\D/g, '');
        const fiscalCity = String(formData.cidade || 'Goiania').trim();
        const fiscalState = String(formData.uf || 'GO').trim().toUpperCase().slice(0, 2);
        const fiscalCityCode = String(formData.codigoIbge || '5208707').replace(/\D/g, '');
        const fiscalAddress = {
            street: String(formData.endereco || '').trim(),
            zip: fiscalZip,
            district: String(formData.bairro || '').trim(),
            city: fiscalCity,
            state: fiscalState,
            cityCode: fiscalCityCode,
        };
        const updateData = {
            ...formData,
            cpf: fiscalDocument,
            documento: fiscalDocument,
            cep: fiscalZip,
            bairro: fiscalAddress.district,
            cidade: fiscalCity,
            uf: fiscalState,
            codigoIbge: fiscalCityCode,
            address: fiscalAddress,
        };
        if (editingClient) {
            const { id, ...clientData } = updateData;
            await updateItem('clientes', editingClient.id, clientData);
        } else {
            await addItem('clientes', { ...updateData, numeroDeCompras: 0, valorEmCompras: 0 });
        }
        setShowModal(false);
        resetForm();
    };
    const handleEdit = (client) => {
      const firstAddress = Array.isArray(client.enderecos) ? client.enderecos[0] : null;
      const address = client.address || firstAddress || {};
      setEditingClient(client);
      setFormData({
        ...defaultClientFormData,
        ...client,
        cpf: client.cpf || client.documento || '',
        documento: client.documento || client.cpf || '',
        endereco: client.endereco || address.street || address.logradouro || address.enderecoCompleto || '',
        cep: client.cep || address.zip || address.cep || '',
        bairro: client.bairro || address.district || address.bairro || '',
        cidade: client.cidade || address.city || address.cidade || 'Goiania',
        uf: client.uf || address.state || address.uf || 'GO',
        codigoIbge: client.codigoIbge || address.cityCode || address.codigoIbge || address.codigoMunicipio || '5208707',
      });
      setShowModal(true);
    };
    const columns = [
        { header: "Cliente", render: (row) => (<div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white font-bold shadow-md">{row.nome.charAt(0).toUpperCase()}</div><div><p className="font-semibold text-gray-800">{row.nome}</p><p className="text-sm text-gray-500">{row.email}</p></div></div>) },
        { header: "Telefone", key: 'telefone' },
        {
          header: "Aniversário",
          render: (row) => {
            if (!row.aniversario) return '-';
            const parts = row.aniversario.split('-');
            if (parts.length !== 3) return '-';
            const [, month, day] = parts;
            return `${day}/${month}`;
          }
        },
        { header: "Valor em Compras", render: (row) => (<span className="font-semibold text-green-600">R$ {(row.valorEmCompras || 0).toFixed(2)}</span>) },
        { header: "Última Compra", render: (row) => row.ultimaCompra ? getJSDate(row.ultimaCompra)?.toLocaleDateString('pt-BR') : '-' },
        { header: "Status", render: (row) => (<span className={`px-3 py-1 rounded-full text-xs font-medium ${row.status === 'VIP' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>{row.status}</span>) }
    ];
    const actions = [ { icon: Edit, label: "Editar", onClick: handleEdit }, { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('clientes', row.id) }) } ];
    return (
      <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4"><div><h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Gestão de Clientes</h1><p className="text-gray-600 mt-1">Gerencie seus clientes</p></div><Button onClick={handleNewClient} className="w-full md:w-auto"><Plus className="w-4 h-4" /> Novo Cliente</Button></div>
        <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" /><input type="text" placeholder="Buscar clientes..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-pink-500" /></div>
        <Table columns={columns} data={filteredClients} actions={actions} />
        <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingClient ? "Editar Cliente" : "Novo Cliente"} size="lg">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input label="Nome Completo" type="text" value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} required />
              <Input label="Email" type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
              <Input label="Telefone" type="tel" value={formData.telefone} onChange={(e) => setFormData({...formData, telefone: e.target.value})} />
              <Input label="CPF" type="text" value={formData.cpf || formData.documento || ''} onChange={(e) => setFormData({...formData, cpf: e.target.value, documento: e.target.value})} />
              <Input label="Data de Aniversário" type="date" value={formData.aniversario} onChange={(e) => setFormData({...formData, aniversario: e.target.value})} />
              <Input label="CEP" type="text" value={formData.cep || ''} onChange={(e) => setFormData({...formData, cep: e.target.value})} />
              <Input label="Endereço" type="text" value={formData.endereco} onChange={(e) => setFormData({...formData, endereco: e.target.value})} />
              <Input label="Bairro" type="text" value={formData.bairro || ''} onChange={(e) => setFormData({...formData, bairro: e.target.value})} />
              <Input label="Cidade" type="text" value={formData.cidade || ''} onChange={(e) => setFormData({...formData, cidade: e.target.value})} />
              <Input label="UF" type="text" value={formData.uf || ''} onChange={(e) => setFormData({...formData, uf: e.target.value.toUpperCase().slice(0, 2)})} />
              <Input label="Código IBGE" type="text" value={formData.codigoIbge || ''} onChange={(e) => setFormData({...formData, codigoIbge: e.target.value})} />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="secondary" type="button" onClick={() => { setShowModal(false); resetForm(); }}>Cancelar</Button>
              <Button type="submit"><Save className="w-4 h-4" />{editingClient ? "Salvar Alterações" : "Criar Cliente"}</Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  };
  
  const Produtos = () => {
    const [searchTerm, setSearchTerm] = usePersistentState("produtos_searchTerm", ""); 
    const [selectedSubcategory, setSelectedSubcategory] = useState('');
    const [filterActiveOnly, setFilterActiveOnly] = useState(false);
    const [showModal, setShowModal] = useState(false); 
    const [editingProduct, setEditingProduct] = useState(null); 
    const [formData, setFormData] = useState({ nome: "", categoria: "Delivery", subcategoria: "", preco: "", precoIfood: "", custo: "", estoque: "", status: "Ativo", descricao: "", tempoPreparo: "", imageUrl: "" });
    const [imageFile, setImageFile] = useState(null); 
    const [imagePreview, setImagePreview] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isAddingSubcategory, setIsAddingSubcategory] = useState(false);
    const [newSubcategory, setNewSubcategory] = useState("");
    const [isSavingSubcategory, setIsSavingSubcategory] = useState(false);
    const [stockMovementModal, setStockMovementModal] = useState({ isOpen: false, type: 'entrada', product: null });
    const [stockMovementQuantity, setStockMovementQuantity] = useState('');
    const [stockMovementReason, setStockMovementReason] = useState('venda');
    const [statusLoading, setStatusLoading] = useState({});
    const [statusOverrides, setStatusOverrides] = useState({});

    const defaultSubcategorias = useMemo(() => ({
      Delivery: [ 'Queridinhos', 'Mousse', 'Palha Italiana', 'Bolo no pote', 'Copo da felicidade', 'Bombom aberto', 'Pipoca', 'Cone recheado', 'Bolo gelado', 'Bombom recheado' ],
      Festa: [ 'Bolo', 'Docinhos', 'Bombom', 'Doces finos', 'Bem casados', 'Cupcakes' ]
    }), []);
	
	  const subcategoriasPorCategoria = useMemo(() => {
      const map = Object.keys(defaultSubcategorias).reduce((acc, categoria) => {
        acc[categoria] = [...defaultSubcategorias[categoria]];
        return acc;
      }, {});

      (data.subcategorias || []).forEach((item) => {
        if (!item || !item.categoria || !item.nome) return;
        const categoria = item.categoria;
        if (!map[categoria]) {
          map[categoria] = [];
        }
        map[categoria].push(item.nome);
      });

      Object.keys(map).forEach((categoria) => {
        const uniqueValues = Array.from(new Set(map[categoria].filter(Boolean)));
        map[categoria] = uniqueValues.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
      });

      return map;
    }, [data.subcategorias, defaultSubcategorias]);

    const availableSubcategories = useMemo(() => {
      const list = subcategoriasPorCategoria[formData.categoria] || [];
      if (formData.subcategoria && !list.includes(formData.subcategoria)) {
        return [...list, formData.subcategoria];
      }
      return list;
    }, [formData.categoria, formData.subcategoria, subcategoriasPorCategoria]);


    useEffect(() => {
      if (formData.categoria && formData.subcategoria && !availableSubcategories.includes(formData.subcategoria)) {
        setFormData(prev => ({ ...prev, subcategoria: '' }));
      }
    }, [formData.categoria, formData.subcategoria, availableSubcategories]);

    useEffect(() => {
      setIsAddingSubcategory(false);
      setNewSubcategory("");
    }, [formData.categoria]);

    const handleSubcategoriaChange = (e) => {
      const value = e.target.value;
      setIsAddingSubcategory(false);
      setNewSubcategory("");
      setFormData(prev => ({ ...prev, subcategoria: value }));
    };

    const handleCreateSubcategory = async () => {
      const trimmed = newSubcategory.trim();
      if (!trimmed) {
        alert('Informe o nome da nova subcategoria.');
        return;
      }

      const existing = availableSubcategories.find(sub => sub.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        alert('Esta subcategoria já existe para a categoria selecionada.');
        setFormData(prev => ({ ...prev, subcategoria: existing }));
        setIsAddingSubcategory(false);
        setNewSubcategory("");
        return;
      }

      try {
        setIsSavingSubcategory(true);
        await addItem('subcategorias', { nome: trimmed, categoria: formData.categoria });
        setFormData(prev => ({ ...prev, subcategoria: trimmed }));
        setIsAddingSubcategory(false);
        setNewSubcategory("");
      } catch (error) {
        console.error('Erro ao criar subcategoria:', error);
      } finally {
        setIsSavingSubcategory(false);
      }
    };

    const openStockMovementModal = (product, type) => {
      setStockMovementModal({ isOpen: true, type, product });
      setStockMovementQuantity('');
      setStockMovementReason('venda');
    };

    const closeStockMovementModal = () => {
      setStockMovementModal({ isOpen: false, type: 'entrada', product: null });
      setStockMovementQuantity('');
      setStockMovementReason('venda');
    };

    const buildReasonLabel = () => {
      if (stockMovementModal.type === 'saida') {
        const reasonLabels = {
          venda: 'Venda',
          doacao: 'Doação',
          perca: 'Perda',
        };
        return `Saída - ${reasonLabels[stockMovementReason] || 'Movimentação'}`;
      }
      return 'Entrada rápida de estoque';
    };

    const handleStockMovementSubmit = async (event) => {
      event.preventDefault();

      const quantity = parseFloat(stockMovementQuantity);

      if (!quantity || quantity <= 0) {
        alert('Informe uma quantidade válida para a movimentação.');
        return;
      }

      try {
        const product = stockMovementModal.product || {};
        const unitPrice = Number(product.preco || 0) || 0;
        const subtotal = unitPrice * quantity;
        const shouldCreateQuickSaleOrder = stockMovementModal.type === 'saida' && stockMovementReason === 'venda';
        const quickSaleOrder = shouldCreateQuickSaleOrder ? {
          clienteId: 'loja',
          clienteNome: 'Loja',
          itens: [{
            id: product.id,
            produtoId: product.id,
            nome: product.nome || 'Produto',
            preco: unitPrice,
            quantity,
            categoria: product.categoria || 'Delivery',
            subcategoria: product.subcategoria || '',
            imageUrl: product.imageUrl || '',
          }],
          subtotal,
          desconto: 0,
          total: subtotal,
          status: 'Finalizado',
          origem: 'Manual',
          categoria: product.categoria || 'Delivery',
          dataEntrega: '',
          observacao: 'Venda registrada automaticamente pela movimentação rápida de estoque.',
          formaPagamento: 'Não informado',
          cupom: null,
        } : null;

        await updateStock(
          product.id,
          stockMovementModal.type,
          quantity,
          buildReasonLabel(),
          user,
          null,
          quickSaleOrder ? { quickSaleOrder } : {},
        );
        closeStockMovementModal();
      } catch (error) {
        console.error('Erro ao movimentar estoque', error);
        alert(error.message || 'Erro ao atualizar estoque.');
      }
    };

    const handleToggleStatus = async (product) => {
      const currentStatus = statusOverrides[product.id] ?? product.status;
      const newStatus = currentStatus === 'Ativo' ? 'Inativo' : 'Ativo';

      setStatusOverrides(prev => ({ ...prev, [product.id]: newStatus }));
      setStatusLoading(prev => ({ ...prev, [product.id]: true }));

      try {
        await updateItem('produtos', product.id, { status: newStatus });
      } catch (error) {
        console.error('Erro ao atualizar status do produto', error);
        alert(error.message || 'Não foi possível atualizar o status.');
        setStatusOverrides(prev => ({ ...prev, [product.id]: currentStatus }));
      } finally {
        setStatusLoading(prev => ({ ...prev, [product.id]: false }));
      }
    };

    const subcategoriasCadastradas = useMemo(() => {
      const subcategorias = (data.produtos || [])
        .map((product) => (product.subcategoria || '').trim())
        .filter(Boolean);

      return Array.from(new Set(subcategorias)).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    }, [data.produtos]);

    const filteredProducts = (data.produtos || [])
      .filter((p) => (p.nome || '').toLowerCase().includes(searchTerm.toLowerCase()))
      .filter((p) => selectedSubcategory === '' || p.subcategoria === selectedSubcategory)
      .filter((p) => {
        if (!filterActiveOnly) return true;
        const effectiveStatus = statusOverrides[p.id] ?? p.status;
        return effectiveStatus === 'Ativo';
      })
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' }));

    const handleClearFilters = () => {
      setSelectedSubcategory('');
      setFilterActiveOnly(false);
      setSearchTerm('');
    };

    useEffect(() => {
      setStatusOverrides(prev => {
        const updatedOverrides = { ...prev };

        (data.produtos || []).forEach((product) => {
          if (updatedOverrides[product.id] && updatedOverrides[product.id] === product.status) {
            delete updatedOverrides[product.id];
          }
        });

        return updatedOverrides;
      });
    }, [data.produtos]);

    const resetForm = () => {
      setShowModal(false);
      setEditingProduct(null);
      setFormData({ nome: "", categoria: "Delivery", subcategoria: "", preco: "", precoIfood: "", custo: "", estoque: "", status: "Ativo", descricao: "", tempoPreparo: "", imageUrl: "" });
      setImageFile(null);
      setImagePreview(null);
      setIsAddingSubcategory(false);
      setNewSubcategory("");
      setIsSavingSubcategory(false);
    };
    const handleImageChange = (e) => { if (e.target.files[0]) { const file = e.target.files[0]; setImageFile(file); setImagePreview(URL.createObjectURL(file)); } };
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isUploading) return;

        setIsUploading(true);

        try {
            let imageUrl = formData.imageUrl || "";
            if (imageFile) {
                const imageRef = ref(storage, `products/${Date.now()}_${imageFile.name}`);
                await uploadBytes(imageRef, imageFile);
                imageUrl = await getDownloadURL(imageRef);
            }

            const productData = {
                ...formData,
                preco: parseFloat(formData.preco || 0),
                precoIfood: formData.precoIfood === '' ? null : parseFloat(formData.precoIfood || 0),
                custo: parseFloat(formData.custo || 0),
                estoque: parseInt(formData.estoque || 0),
                imageUrl: imageUrl,
            };
            if (editingProduct) {
                const { id, ...updateData } = productData;
                await updateItem('produtos', editingProduct.id, updateData);
            } else {
                await addItem('produtos', productData);
            }

            resetForm();
        } catch (error) {
            console.error('Erro ao salvar produto:', error);
            const errorMessage = String(error?.message || '').toLowerCase();
            const isStorageUploadError =
                String(error?.code || '').toLowerCase().startsWith('storage/') ||
                errorMessage.includes('storage') ||
                errorMessage.includes('cors') ||
                errorMessage.includes('network') ||
                errorMessage.includes('failed');

            alert(
                isStorageUploadError
                    ? 'Não foi possível enviar a foto do produto. Verifique a conexão e tente salvar novamente.'
                    : (error?.message || 'Não foi possível salvar o produto. Tente novamente.')
            );
        } finally {
            setIsUploading(false);
        }
    };
    const handleEdit = (product) => {
      setEditingProduct(product);
      setFormData({
        ...product,
        preco: String(product.preco),
        precoIfood: product.precoIfood == null ? '' : String(product.precoIfood),
        custo: String(product.custo),
        estoque: String(product.estoque),
      });
      setImagePreview(product.imageUrl || null);
      setIsAddingSubcategory(false);
      setNewSubcategory("");
      setIsSavingSubcategory(false);
      setShowModal(true);
    };
    const columns = [
      {
        header: "Produto",
        render: (row) => (
          <div className="flex items-center gap-3">
            <img
              src={row.imageUrl || 'https://placehold.co/40x40/FFC0CB/FFFFFF?text=Doce'}
              alt={row.nome}
              className="w-10 h-10 rounded-xl object-cover shadow-md"
              onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/40x40/FFC0CB/FFFFFF?text=Erro'; }}
            />
            <div>
              <p className="font-semibold text-gray-800">{row.nome}</p>
              <p className="text-sm text-gray-500">{row.categoria} / {row.subcategoria}</p>
            </div>
          </div>
        )
      },
      { header: "Preço", render: (row) => <span className="font-semibold text-green-600">R$ {(row.preco || 0).toFixed(2)}</span> },
      { header: "Preço iFood", render: (row) => row.precoIfood == null ? <span className="text-gray-400">-</span> : <span className="font-semibold text-pink-600">R$ {(Number(row.precoIfood) || 0).toFixed(2)}</span> },
      { header: "Estoque", render: (row) => <span className={`font-medium ${row.estoque < 10 ? 'text-red-600' : 'text-gray-800'}`}>{row.estoque} un</span> },
      {
        header: 'Movimentação Rápida',
        render: (row) => (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="!px-3 !py-2 text-xs"
              onClick={() => openStockMovementModal(row, 'entrada')}
            >
              + Entrada
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="!px-3 !py-2 text-xs text-red-600 border-red-200 hover:border-red-300 hover:text-red-700"
              onClick={() => openStockMovementModal(row, 'saida')}
            >
              - Saída
            </Button>
          </div>
        )
      },
      {
        header: "Status",
        render: (row) => {
          const effectiveStatus = statusOverrides[row.id] ?? row.status;
          const isActive = effectiveStatus === 'Ativo';

          return (
            <label className="inline-flex items-center gap-3 select-none">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={isActive}
                onChange={() => handleToggleStatus(row)}
                disabled={!!statusLoading[row.id]}
              />
              <div
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                  isActive ? 'bg-green-500' : 'bg-gray-200'
                } ${statusLoading[row.id] ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} peer-focus:outline-none`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
                    isActive ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </div>
              <span className={`text-sm font-medium ${isActive ? 'text-green-700' : 'text-gray-600'}`}>
                {isActive ? 'Ativo' : 'Inativo'}
              </span>
            </label>
          );
        }
      }
    ];
    const actions = [ { icon: Edit, label: "Editar", onClick: handleEdit }, { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('produtos', row.id) }) } ];
    
    return (
      <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4"><div><h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Gestão de Produtos</h1><p className="text-gray-600 mt-1">Gerencie seu cardápio e estoque</p></div><Button onClick={() => setShowModal(true)} className="w-full md:w-auto"><Plus className="w-4 h-4" /> Novo Produto</Button></div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative w-full sm:w-auto sm:min-w-[28rem] max-w-md"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" /><input type="text" placeholder="Buscar produtos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-pink-500" /></div>
          {subcategoriasCadastradas.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-5 py-2.5 rounded-lg text-base font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Limpar filtro
              </button>
              <button
                type="button"
                onClick={() => setFilterActiveOnly((prev) => !prev)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  filterActiveOnly
                    ? 'bg-pink-100 text-pink-700 border-pink-200'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Ativo
              </button>
            </>
          )}
        </div>
        {subcategoriasCadastradas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {subcategoriasCadastradas.map((subcategoria) => {
              const isSelected = selectedSubcategory === subcategoria;

              return (
                <button
                  key={subcategoria}
                  type="button"
                  onClick={() => setSelectedSubcategory(subcategoria)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    isSelected
                      ? 'bg-pink-100 text-pink-700 border-pink-200'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {subcategoria}
                </button>
              );
            })}
          </div>
        )}
        <Table columns={columns} data={filteredProducts} actions={actions} />
        <Modal
          isOpen={stockMovementModal.isOpen}
          onClose={closeStockMovementModal}
          title={`Registrar ${stockMovementModal.type === 'entrada' ? 'Entrada' : 'Saída'} de Estoque`}
          size="md"
        >
          <form onSubmit={handleStockMovementSubmit} className="space-y-5">
            <div className="bg-pink-50/80 border border-pink-100 rounded-2xl p-4">
              <p className="text-sm text-gray-500">Produto selecionado</p>
              <p className="font-semibold text-gray-900">{stockMovementModal.product?.nome || '-'}</p>
            </div>

            <Input
              label="Quantidade"
              type="number"
              min="0"
              step="1"
              value={stockMovementQuantity}
              onChange={(e) => setStockMovementQuantity(e.target.value)}
              required
            />

            {stockMovementModal.type === 'saida' && (
              <Select
                label="Motivo da Saída"
                value={stockMovementReason}
                onChange={(e) => setStockMovementReason(e.target.value)}
                required
              >
                <option value="venda">Venda</option>
                <option value="doacao">Doação</option>
                <option value="perca">Perda</option>
              </Select>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="secondary" type="button" onClick={closeStockMovementModal}>
                Cancelar
              </Button>
              <Button type="submit">
                <Save className="w-4 h-4" /> Confirmar
              </Button>
            </div>
          </form>
        </Modal>
        <Modal isOpen={showModal} onClose={resetForm} title={editingProduct ? "Editar Produto" : "Novo Produto"} size="xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Input label="Nome do Produto" value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} required />
                  <Select label="Categoria" value={formData.categoria} onChange={(e) => setFormData({...formData, categoria: e.target.value})} required><option value="Delivery">Delivery</option><option value="Festa">Festa</option></Select>
                  <div className="space-y-1 w-full">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-gray-700">Subcategoria</label>
                      <button
                        type="button"
                        className="text-xs font-semibold text-pink-600 hover:text-pink-700"
                        onClick={() => {
                          setIsAddingSubcategory(true);
                          setNewSubcategory("");
                          setFormData(prev => ({ ...prev, subcategoria: '' }));
                        }}
                      >
                        + Nova subcategoria
                      </button>
                    </div>
                    <select
                      value={formData.subcategoria}
                      onChange={handleSubcategoriaChange}
                      required
                      className="w-full px-4 py-3 border rounded-xl transition-all focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-white border-gray-300"
                    >
                      <option value="">Selecione...</option>
                      {availableSubcategories.map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
					  {isAddingSubcategory && (
						<div className="md:col-span-2 bg-pink-50/80 border border-pink-100 rounded-2xl p-4 space-y-4">
						  <div className="flex items-center justify-between flex-wrap gap-2">
							<p className="text-sm font-semibold text-pink-700">Cadastrar nova subcategoria para "{formData.categoria}"</p>
							<button type="button" className="text-xs text-pink-600 hover:underline" onClick={() => { setIsAddingSubcategory(false); setNewSubcategory(""); }}>Cancelar</button>
						  </div>
						  <div className="md:grid md:grid-cols-3 md:gap-4 space-y-4 md:space-y-0">
							<div className="md:col-span-2">
							  <Input label="Nova Subcategoria" placeholder="Digite o nome da subcategoria" value={newSubcategory} onChange={(e) => setNewSubcategory(e.target.value)} />
							</div>
							<div className="flex gap-2 items-end justify-end">
							  <Button type="button" onClick={handleCreateSubcategory} disabled={isSavingSubcategory} className="w-full md:w-auto">
								<PackagePlus className="w-4 h-4" />
								{isSavingSubcategory ? 'Salvando...' : 'Salvar'}
							  </Button>
							</div>
						  </div>
						</div>
                  )}
                  <Input label="Preço (R$)" type="number" step="0.01" value={formData.preco} onChange={(e) => setFormData({...formData, preco: e.target.value})} />
                  <Input label="Preço iFood (R$)" type="number" min="0" step="0.01" value={formData.precoIfood} onChange={(e) => setFormData({...formData, precoIfood: e.target.value})} />
                  <Input label="Custo (R$)" type="number" step="0.01" value={formData.custo} onChange={(e) => setFormData({...formData, custo: e.target.value})} />
                  <Input label="Estoque" type="number" value={formData.estoque} onChange={(e) => setFormData({...formData, estoque: e.target.value})} />
                  <Input label="Tempo de Preparo" value={formData.tempoPreparo} onChange={(e) => setFormData({...formData, tempoPreparo: e.target.value})} />
                  <Select label="Status" value={formData.status || 'Ativo'} onChange={(e) => setFormData({...formData, status: e.target.value})} required>
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </Select>
                </div>
                <div className="relative">
                  <Textarea label="Descrição" rows="3" value={formData.descricao} onChange={(e) => setFormData({...formData, descricao: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Foto do Produto</label>
                <div className="w-full h-48 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center text-center p-4">{imagePreview ? (<img src={imagePreview} alt="Pré-visualização" className="max-h-full max-w-full object-contain rounded-lg"/>) : (<div className="text-gray-500"><ImageIcon className="mx-auto h-12 w-12" /><p className="mt-2 text-sm">Clique para selecionar</p></div>)}</div>
                <Input type="file" accept="image/*" onChange={handleImageChange} className="mt-2" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="secondary" type="button" onClick={resetForm}>Cancelar</Button>
              <Button type="submit" disabled={isUploading}><Save className="w-4 h-4" />{isUploading ? 'Salvando...' : (editingProduct ? "Salvar Alterações" : "Criar Produto")}</Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  };
  
	const Configuracoes = ({ user, setConfirmDelete, data, addItem, updateItem, deleteItem, availableStores, storeInfoMap, resolveActiveStoreForWrite, selectedStoreId }) => {
    const [activeTab, setActiveTab] = usePersistentState('configuracoes_activeTab', 'users');

    // States para Usuários
    const [usuarios, setUsuarios] = useState([]);
    const [selectedUserIds, setSelectedUserIds] = useState([]);
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const [userExcludeTerm, setUserExcludeTerm] = useState('');
    const [userEmailFilter, setUserEmailFilter] = useState('any');
    const [userRoleFilter, setUserRoleFilter] = useState('all');
    const [showUserModal, setShowUserModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [selectedExistingUserId, setSelectedExistingUserId] = useState('');
    const [userFormData, setUserFormData] = useState({
        email: "",
        senha: "",
        nome: "",
        role: ROLE_ATTENDANT,
        lojaId: "",
        lojaIds: [],
        permissions: getDefaultPermissionsForRole(ROLE_ATTENDANT),
        applyCustomProfile: true,
        uid: ''
    });
    const [newPassword, setNewPassword] = useState("");

    const getUsuarioId = useCallback((usuario) => usuario?.uid || usuario?.id || '', []);
	
	const effectiveStoreId = useMemo(() => {
	if (!user) return null;
	if (user.role === ROLE_OWNER && selectedStoreId === STORE_ALL_KEY) {
		return null;
	}
	try {
		return resolveActiveStoreForWrite();
	} catch (error) {
		return null;
	}
}, [resolveActiveStoreForWrite, selectedStoreId, user]);

const effectiveStoreName = useMemo(() => {
	if (effectiveStoreId) {
		return storeInfoMap[effectiveStoreId]?.nome || effectiveStoreId;
	}
	if (user?.role === ROLE_OWNER && selectedStoreId === STORE_ALL_KEY) {
		return 'Visão Geral';
	}
	return 'Selecione uma loja para gerenciar';
}, [effectiveStoreId, storeInfoMap, user, selectedStoreId]);

    // States para Cupons
    const [cupons, setCupons] = useState([]);
    const [showCupomModal, setShowCupomModal] = useState(false);
    const [editingCupom, setEditingCupom] = useState(null);
    const [cupomFormData, setCupomFormData] = useState({});
	
	    const userRoles = useMemo(() => {
        const roles = new Set((usuarios || []).map((userItem) => userItem.role).filter(Boolean));
        return Array.from(roles);
    }, [usuarios]);

    const filteredUsuarios = useMemo(() => {
        const search = userSearchTerm.trim().toLowerCase();
        const exclude = userExcludeTerm.trim().toLowerCase();

        return (usuarios || []).filter((usuario) => {
            const name = (usuario.nome || '').toLowerCase();
            const email = (usuario.email || '').trim();
            const role = (usuario.role || '').toLowerCase();

            if (search && !name.includes(search)) return false;
            if (exclude && name.includes(exclude)) return false;

            if (userEmailFilter === 'empty' && email) return false;
            if (userEmailFilter === 'filled' && !email) return false;

            if (userRoleFilter !== 'all' && role !== userRoleFilter.toLowerCase()) return false;

            return true;
        });
    }, [usuarios, userSearchTerm, userExcludeTerm, userEmailFilter, userRoleFilter]);

    const visibleUserIds = useMemo(() => {
        return (filteredUsuarios || []).map(getUsuarioId).filter(Boolean);
    }, [filteredUsuarios, getUsuarioId]);

    const selectedVisibleUsers = useMemo(() => {
        const selectedSet = new Set(selectedUserIds);
        return (filteredUsuarios || []).filter((usuario) => selectedSet.has(getUsuarioId(usuario)));
    }, [filteredUsuarios, selectedUserIds, getUsuarioId]);

    const allVisibleUsersSelected = useMemo(() => {
        return visibleUserIds.length > 0 && visibleUserIds.every((userId) => selectedUserIds.includes(userId));
    }, [visibleUserIds, selectedUserIds]);

    useEffect(() => {
        const visibleSet = new Set(visibleUserIds);
        setSelectedUserIds((currentIds) => {
            const nextIds = currentIds.filter((userId) => visibleSet.has(userId));
            return nextIds.length === currentIds.length ? currentIds : nextIds;
        });
    }, [visibleUserIds]);

    const hasUserFilters = useMemo(() => {
        return Boolean(
            userSearchTerm.trim() ||
            userExcludeTerm.trim() ||
            userEmailFilter !== 'any' ||
            userRoleFilter !== 'all'
        );
    }, [userSearchTerm, userExcludeTerm, userEmailFilter, userRoleFilter]);

    const handleClearUserFilters = useCallback(() => {
        setUserSearchTerm('');
        setUserExcludeTerm('');
        setUserEmailFilter('any');
        setUserRoleFilter('all');
    }, []);

    const handleToggleUserSelection = useCallback((usuario, checked) => {
        const userId = getUsuarioId(usuario);
        if (!userId) return;

        setSelectedUserIds((currentIds) => {
            if (checked) {
                return Array.from(new Set([...currentIds, userId]));
            }
            return currentIds.filter((id) => id !== userId);
        });
    }, [getUsuarioId]);

    const handleToggleVisibleUsers = useCallback((checked) => {
        setSelectedUserIds((currentIds) => {
            if (!checked) {
                const visibleSet = new Set(visibleUserIds);
                return currentIds.filter((id) => !visibleSet.has(id));
            }
            return Array.from(new Set([...currentIds, ...visibleUserIds]));
        });
    }, [visibleUserIds]);

    // 🔄 Carregar dados da aba ativa
    useEffect(() => {
        let unsubscribe = () => {}; // Função de cleanup vazia

        if (activeTab === 'users') {
            setUsuarios([]); // Limpa a lista atual para mostrar o carregamento
            // Chama a Cloud Function para buscar a lista de usuários do Authentication
            const listAllUsersFn = httpsCallable(functions, 'listAllUsers');
            listAllUsersFn()
                .then((result) => {
                    if (result.data.users) {
                        const normalizedUsers = result.data.users.map((u) => {
                            const lojas = Array.isArray(u.lojaIds)
                                ? u.lojaIds
                                : (u.lojaId ? [u.lojaId] : []);
                            const normalizedRole = normalizeRole(u.role);
                            return {
                                ...u,
                                role: normalizedRole,
                                lojaIds: lojas,
                                lojaId: lojas[0] || null,
                                permissions: sanitizePermissions(u.permissions, normalizedRole)
                            };
                        });

                        const filteredUsers = (!effectiveStoreId || user.role === ROLE_OWNER)
                            ? normalizedUsers
                            : normalizedUsers.filter(u => (u.lojaIds || []).includes(effectiveStoreId));

                        setUsuarios(filteredUsers)
                    }
                })
                .catch((error) => {
                    console.error("Erro ao buscar a lista de usuários:", error);
                    alert("Ocorreu um erro ao buscar usuários: " + error.message);
                });

        } else if (activeTab === 'cupons') {
            if (!effectiveStoreId) {
                setCupons([]);
            } else {
                const primaryRef = getStoreCollectionRef(effectiveStoreId, 'cupons');
                const legacyRef = getStoreCollectionRef(effectiveStoreId, 'cupons', true);
                let legacyUnsub = null;

                const unsubscribePrimary = onSnapshot(primaryRef, (snap) => {
                    const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setCupons(items);

                    if (!items.length && !legacyUnsub) {
                        legacyUnsub = onSnapshot(legacyRef, (legacySnap) => {
                            if (items.length) return;
                            setCupons(legacySnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                        }, undefined, {
                            __listenerOptions: true,
                            operation: 'config-cupons-legacy',
                            route: 'configuracoes',
                            uid: user?.auth?.uid || null
                        });
                    } else if (items.length && legacyUnsub) {
                        legacyUnsub();
                        legacyUnsub = null;
                    }
                }, undefined, {
                    __listenerOptions: true,
                    operation: 'config-cupons',
                    route: 'configuracoes',
                    uid: user?.auth?.uid || null
                });

                unsubscribe = () => {
                    unsubscribePrimary();
                    if (legacyUnsub) legacyUnsub();
                };
            }
        }
        
        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [activeTab, effectiveStoreId, user]);
    
    // States para Configuração de Frete
    const [freteConfig, setFreteConfig] = useState({ enderecoLoja: '', lat: '', lng: '', valorPorKm: '' });
    const [isSavingFrete, setIsSavingFrete] = useState(false);

    const [storeHoursConfig, setStoreHoursConfig] = useState(getDefaultStoreHoursConfig());
    const [isSavingStoreHours, setIsSavingStoreHours] = useState(false);
    const [entreLojasConfig, setEntreLojasConfig] = useState({ percentualRepasse: 0 });
    const [isSavingEntreLojasConfig, setIsSavingEntreLojasConfig] = useState(false);
    const canEditEntreLojasConfig = user?.role === ROLE_OWNER;

    useEffect(() => {
        if (activeTab !== 'frete') return;

        if (!effectiveStoreId) {
            setFreteConfig({ enderecoLoja: '', lat: '', lng: '', valorPorKm: '' });
            return;
        }

        const fetchFreteConfig = async () => {
            try {
                const configRef = getStoreConfigDocRef(effectiveStoreId);
                const configSnap = await getDoc(configRef);

                if (configSnap.exists()) {
                    const configData = configSnap.data() || {};
                    const freteData = configData.frete || configData;

                    if (freteData && Object.keys(freteData).length) {
                        setFreteConfig(freteData);
                        return;
                    }
                }

                const legacyFreteRef = doc(db, 'lojas', effectiveStoreId, 'configuracoes', 'frete');
                const legacyFreteSnap = await getDoc(legacyFreteRef);
                if (legacyFreteSnap.exists()) {
                    const freteData = legacyFreteSnap.data();
                    setFreteConfig(freteData || { enderecoLoja: '', lat: '', lng: '', valorPorKm: '' });
                    await setDoc(configRef, { frete: freteData || {} }, { merge: true });
                    return;
                }

                const legacyInfoSnap = await getDoc(doc(db, 'lojas', effectiveStoreId, 'info', 'dados'));
                if (legacyInfoSnap.exists()) {
                    const infoData = legacyInfoSnap.data();
                    const freteData = infoData?.frete || {};
                    if (Object.keys(freteData).length) {
                        setFreteConfig(freteData);
                        await setDoc(configRef, { frete: freteData }, { merge: true });
                        return;
                    }
                }

                setFreteConfig({ enderecoLoja: '', lat: '', lng: '', valorPorKm: '' });
            } catch (error) {
                console.error("Erro ao buscar configurações de frete:", error);
            }
        };
        fetchFreteConfig();

    }, [activeTab, effectiveStoreId]);


    useEffect(() => {
        if (activeTab !== 'funcionamento') return;

        if (!effectiveStoreId) {
            setStoreHoursConfig(getDefaultStoreHoursConfig());
            return;
        }

        const fetchStoreHoursConfig = async () => {
            try {
                const configRef = getStoreConfigDocRef(effectiveStoreId);
                const configSnap = await getDoc(configRef);
                if (!configSnap.exists()) {
                    setStoreHoursConfig(getDefaultStoreHoursConfig());
                    return;
                }

                const configData = configSnap.data() || {};
                const mergedSchedule = {
                    ...buildDefaultStoreSchedule(),
                    ...(configData.schedule || {})
                };

                setStoreHoursConfig({
                    timezone: configData.timezone || DEFAULT_STORE_TIMEZONE,
                    schedule: mergedSchedule,
                    alarmPauseMinutes: sanitizeAlarmPauseMinutes(configData.alarmPauseMinutes),
                    manualOverride: {
                        mode: configData?.manualOverride?.mode || 'auto',
                        updatedAt: configData?.manualOverride?.updatedAt || null,
                        updatedBy: configData?.manualOverride?.updatedBy || ''
                    }
                });
            } catch (error) {
                console.error('Erro ao carregar horário de funcionamento:', error);
            }
        };

        fetchStoreHoursConfig();
    }, [activeTab, effectiveStoreId]);

    useEffect(() => {
        if (activeTab !== 'entre-lojas') return;
        if (!effectiveStoreId) {
            setEntreLojasConfig({ percentualRepasse: 0 });
            return;
        }
        const fetchEntreLojasConfig = async () => {
            try {
                const configSnap = await getDoc(getStoreConfigDocRef(effectiveStoreId));
                const percentual = Number(configSnap.data()?.entreLojas?.percentualRepasse);
                setEntreLojasConfig({
                    percentualRepasse: Number.isFinite(percentual) && percentual >= 0 ? percentual : 0
                });
            } catch (error) {
                console.error('Erro ao carregar configuração de Entre Lojas:', error);
                setEntreLojasConfig({ percentualRepasse: 0 });
            }
        };
        fetchEntreLojasConfig();
    }, [activeTab, effectiveStoreId]);
	
	//Limpeza quando o componente desmontar
        useEffect(() => {
          return () => {
                // Para o alarme quando o componente desmontar
                if (stopAlarmRef.current) {
                  stopAlarmRef.current();
                }
                if (stopAlarmFnRef.current) {
                  stopAlarmFnRef.current();
                }
          };
  }, []);
    
    const getCustomPermissionsForUser = useCallback(async (userProfile) => {
        const normalizedRole = normalizeRole(userProfile?.role || ROLE_ATTENDANT);
        const fallbackPermissions = sanitizePermissions(userProfile?.permissions, normalizedRole);
        const uid = userProfile?.uid || userProfile?.id;

        if (!uid) {
            return { permissions: fallbackPermissions, hasCustomProfile: false, normalizedRole };
        }

        try {
            const customProfileSnap = await getDoc(doc(db, 'customProfiles', uid));
            if (customProfileSnap.exists()) {
                return {
                    permissions: sanitizePermissions(customProfileSnap.data()?.permissions, normalizedRole),
                    hasCustomProfile: true,
                    normalizedRole,
                };
            }
        } catch (err) {
            console.error('Erro ao carregar perfil personalizado:', err);
        }

        return { permissions: fallbackPermissions, hasCustomProfile: false, normalizedRole };
    }, []);

    const buildUserFormState = useCallback(async (userToEdit = null) => {
        if (!userToEdit) {
            setEditingUser(null);
            setSelectedExistingUserId('');
            setUserFormData({
                email: "",
                senha: "",
                nome: "",
                role: ROLE_ATTENDANT,
                lojaId: effectiveStoreId || '',
                lojaIds: effectiveStoreId ? [effectiveStoreId] : [],
                permissions: getDefaultPermissionsForRole(ROLE_ATTENDANT),
                applyCustomProfile: true,
                uid: ''
            });
            return;
        }

        const lojas = Array.isArray(userToEdit.lojaIds)
            ? userToEdit.lojaIds
            : (userToEdit.lojaId ? [userToEdit.lojaId] : []);

        const { permissions, hasCustomProfile, normalizedRole } = await getCustomPermissionsForUser(userToEdit);
        setEditingUser(userToEdit);
        setSelectedExistingUserId(userToEdit.uid || userToEdit.id || '');
        setUserFormData({
            email: userToEdit.email || "",
            senha: "",
            nome: userToEdit.nome || "",
            role: normalizedRole,
            lojaId: lojas[0] || '',
            lojaIds: lojas,
            permissions,
            applyCustomProfile: hasCustomProfile,
            uid: userToEdit.uid || userToEdit.id || ''
        });
    }, [effectiveStoreId, getCustomPermissionsForUser]);

    // Handlers para Usuários
    const handleNewUser = () => {
        buildUserFormState();
        setShowUserModal(true);
    };

    const handleEditUser = (userToEdit) => {
        buildUserFormState(userToEdit);
        setShowUserModal(true);
    };

    const handleExistingUserSelect = async (uid) => {
        setSelectedExistingUserId(uid);
        if (!uid) {
            await buildUserFormState();
            return;
        }

        const selectedUser = (usuarios || []).find((u) => (u.uid || u.id) === uid);
        if (selectedUser) {
            await buildUserFormState(selectedUser);
        }
    };

    const toggleUserStoreSelection = useCallback((storeId, checked) => {
        setUserFormData((prev) => {
            const currentStores = Array.isArray(prev.lojaIds)
                ? prev.lojaIds
                : (prev.lojaId ? [prev.lojaId] : []);

            const nextStores = checked
                ? Array.from(new Set([...currentStores, storeId]))
                : currentStores.filter((id) => id !== storeId);

            return {
                ...prev,
                lojaIds: nextStores,
                lojaId: nextStores[0] || ''
            };
        });
    }, []);

	const handleUserSubmit = async (e) => {
	  e.preventDefault();
	  
	  if (!userFormData.email || !userFormData.nome || !userFormData.role) {
		alert('Por favor, preencha todos os campos obrigatórios');
		return;
	  }

	  if (!editingUser && (!userFormData.senha || userFormData.senha.length < 6)) {
		alert('A senha é obrigatória e deve ter pelo menos 6 caracteres');
		return;
	  }
          try {
                const selectedRole = normalizeRole(userFormData.role);
                const lojasSelecionadas = selectedRole === ROLE_OWNER
                    ? (userFormData.lojaIds && userFormData.lojaIds.length ? userFormData.lojaIds : [])
                    : (userFormData.lojaIds && userFormData.lojaIds.length
                        ? userFormData.lojaIds
                        : (userFormData.lojaId ? [userFormData.lojaId] : (effectiveStoreId ? [effectiveStoreId] : [])));
                const singleStoreId = selectedRole === ROLE_OWNER ? null : (lojasSelecionadas[0] || null);

                if (selectedRole !== ROLE_OWNER && !lojasSelecionadas.length) {
                    alert('Selecione uma loja para este usuário.');
                    return;
                }

                const sanitizedPermissions = sanitizePermissions(userFormData.permissions, selectedRole);
                const applyCustomProfile = Boolean(userFormData.applyCustomProfile);
                const permissionsToPersist = applyCustomProfile
                    ? sanitizedPermissions
                    : getDefaultPermissionsForRole(selectedRole);

                let updatedUserId = editingUser?.uid || editingUser?.id;

                if (editingUser) {
                  const updateUserFn = httpsCallable(functions, 'updateUser');
                  await updateUserFn({
                        uid: editingUser.uid,
                        nome: userFormData.nome,
                        role: selectedRole,
                        email: userFormData.email,
                        lojaId: singleStoreId || null,
                        lojaIds: lojasSelecionadas,
                        permissions: permissionsToPersist
                  });
                  updatedUserId = editingUser.uid;
                  alert('Usuário atualizado com sucesso!');
                } else {
                  const createUserFn = httpsCallable(functions, 'createUser');
                  const result = await createUserFn({
                        email: userFormData.email,
                        senha: userFormData.senha,
                        nome: userFormData.nome,
                        role: selectedRole,
                        lojaId: singleStoreId || null,
                        lojaIds: lojasSelecionadas,
                        permissions: permissionsToPersist
                  });
                  updatedUserId = result?.data?.uid || updatedUserId;
                  alert('Usuário criado com sucesso!');
                }

                if (!applyCustomProfile && updatedUserId) {
                    try {
                        await deleteDoc(doc(db, 'customProfiles', updatedUserId));
                    } catch (deleteError) {
                        console.error('Erro ao remover perfil personalizado:', deleteError);
                    }
                }

                if (updatedUserId && user?.auth?.uid === updatedUserId) {
                    setUser((prev) => prev ? {
                        ...prev,
                        permissions: permissionsToPersist,
                        customPermissions: applyCustomProfile ? permissionsToPersist : null,
                        hasCustomProfile: applyCustomProfile,
                    } : prev);
                }

                setShowUserModal(false);

                // Recarrega a lista de usuários
                const listAllUsersFn = httpsCallable(functions, 'listAllUsers');
                const result = await listAllUsersFn();
                if (result.data.users) {
                    const normalizedUsers = result.data.users.map((u) => {
                        const lojas = Array.isArray(u.lojaIds)
                            ? u.lojaIds
                            : (u.lojaId ? [u.lojaId] : []);
                        const normalizedRole = normalizeRole(u.role);
                        return {
                            ...u,
                            role: normalizedRole,
                            lojaIds: lojas,
                            lojaId: lojas[0] || null,
                            permissions: sanitizePermissions(u.permissions, normalizedRole)
                        };
                    });

                    const filteredUsers = (!effectiveStoreId || user.role === ROLE_OWNER)
                        ? normalizedUsers
                        : normalizedUsers.filter(u => (u.lojaIds || []).includes(effectiveStoreId));

                    setUsuarios(filteredUsers);
                }

          } catch (error) {
                console.error('Erro completo:', error);
                alert("Erro ao salvar usuário: " + error.message);
          }
	};

    const deleteUserAccount = useCallback(async (userToDelete) => {
        const uid = userToDelete?.uid || userToDelete?.id;
        if (!uid) {
            throw new Error('UID do usuário não encontrado.');
        }

        const deleteUserFn = httpsCallable(functions, "deleteUser");
        await deleteUserFn({ uid });

        try {
            await deleteDoc(doc(db, "users", uid));
        } catch (firestoreError) {
            console.warn('Usuário removido no Authentication, mas o fallback local do Firestore falhou:', firestoreError);
        }

        return uid;
    }, []);

    const handleDeleteUser = async (userToDelete) => {
        try {
            const deletedUserId = await deleteUserAccount(userToDelete);
            setUsuarios((currentUsers) => currentUsers.filter((usuario) => getUsuarioId(usuario) !== deletedUserId));
            setSelectedUserIds((currentIds) => currentIds.filter((id) => id !== deletedUserId));
            setConfirmDelete({ isOpen: false, onConfirm: () => {} });
        } catch (err) {
            alert("Erro ao deletar usuário: " + err.message);
        }
    };

    const handleDeleteSelectedUsers = useCallback(async () => {
        const usersToDelete = [...selectedVisibleUsers];
        if (!usersToDelete.length) return;

        const deletedIds = [];
        const failures = [];

        for (const usuario of usersToDelete) {
            try {
                const deletedUserId = await deleteUserAccount(usuario);
                deletedIds.push(deletedUserId);
            } catch (error) {
                failures.push(`${usuario.nome || usuario.email || 'Usuário'}: ${error.message}`);
            }
        }

        if (deletedIds.length) {
            const deletedSet = new Set(deletedIds);
            setUsuarios((currentUsers) => currentUsers.filter((usuario) => !deletedSet.has(getUsuarioId(usuario))));
            setSelectedUserIds((currentIds) => currentIds.filter((id) => !deletedSet.has(id)));
        }

        if (failures.length) {
            alert(`Alguns usuários não puderam ser excluídos:\n${failures.join('\n')}`);
            return;
        }

        alert(`${deletedIds.length} usuário${deletedIds.length === 1 ? '' : 's'} excluído${deletedIds.length === 1 ? '' : 's'} com sucesso!`);
    }, [deleteUserAccount, getUsuarioId, selectedVisibleUsers]);

    const handleConfirmBulkDeleteUsers = useCallback(() => {
        const count = selectedVisibleUsers.length;
        if (!count) return;

        setConfirmDelete({
            isOpen: true,
            title: 'Excluir usuários selecionados',
            message: `Tem certeza que deseja excluir ${count} usuário${count === 1 ? '' : 's'} selecionado${count === 1 ? '' : 's'}? Esta ação remove o acesso à plataforma e não pode ser desfeita.`,
            confirmLabel: count === 1 ? 'Excluir usuário' : `Excluir ${count} usuários`,
            onConfirm: handleDeleteSelectedUsers
        });
    }, [handleDeleteSelectedUsers, selectedVisibleUsers.length, setConfirmDelete]);
    
    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (!editingUser) return;
        const updatePasswordFn = httpsCallable(functions, "updateUserPassword");
        try {
          await updatePasswordFn({ uid: editingUser.uid || editingUser.id, newPassword });
          alert("Senha alterada com sucesso!");
          setShowPasswordModal(false);
          setNewPassword("");
        } catch (err) {
          alert("Erro ao alterar senha: " + err.message);
        }
    };
    
    const resetCupomForm = () => { 
        setEditingCupom(null); 
        setCupomFormData({ codigo: '', tipoDesconto: 'percentual', valor: '', limiteUso: '', valorMinimo: '', status: 'Ativo' }); 
    };
    
    const handleNewCupom = () => { 
        resetCupomForm(); 
        setShowCupomModal(true); 
    };
    
    const handleEditCupom = (cupom) => { 
        setEditingCupom(cupom); 
        setCupomFormData({
            ...cupom, 
            valor: String(cupom.valor || ''), 
            limiteUso: String(cupom.limiteUso || ''), 
            valorMinimo: String(cupom.valorMinimo || '')
        }); 
        setShowCupomModal(true); 
    };
    
    const handleCupomSubmit = async (e) => {
      e.preventDefault();

      try {
        if (!effectiveStoreId) {
            alert('Selecione uma loja para gerenciar cupons.');
            return;
        }

        const dataToSave = {
          codigo: cupomFormData.codigo.toUpperCase().trim(),
          tipoDesconto: cupomFormData.tipoDesconto,
          valor: parseFloat(cupomFormData.valor || 0),
          limiteUso: parseInt(cupomFormData.limiteUso || 0),
          valorMinimo: parseFloat(cupomFormData.valorMinimo || 0),
          status: cupomFormData.status || 'Ativo'
        };

        if (editingCupom) {
          await updateItem('cupons', editingCupom.id, dataToSave);
          alert('Cupom atualizado com sucesso!');
        } else {
          await addItem('cupons', { ...dataToSave, usos: 0 });
          alert('Cupom criado com sucesso!');
        }
        
        setShowCupomModal(false);
        resetCupomForm();
      } catch (error) {
        console.error('Erro ao salvar cupom:', error);
        alert('Erro ao salvar cupom: ' + error.message);
      }
    };

    const handleSaveFreteConfig = async (e) => {
        e.preventDefault();
        setIsSavingFrete(true);
        try {

            if (!effectiveStoreId) {
                alert('Selecione uma loja específica para salvar as configurações.');
                return;
            }

            const freteDoc = getStoreConfigDocRef(effectiveStoreId);
            await setDoc(freteDoc, {
                frete: {
                    ...freteConfig,
                    valorPorKm: parseFloat(freteConfig.valorPorKm || 0),
                    updatedAt: new Date(),
                    updatedBy: user?.auth?.email || 'Sistema'
                }
            }, { merge: true });
            await setDoc(doc(db, 'lojas', effectiveStoreId, 'info', 'dados'), {
                frete: {
                    ...freteConfig,
                    valorPorKm: parseFloat(freteConfig.valorPorKm || 0),
                    updatedAt: new Date(),
                    updatedBy: user?.auth?.email || 'Sistema'
                }
            }, { merge: true });
            await setDoc(doc(db, 'lojas', effectiveStoreId, 'configuracoes', 'frete'), {
                ...freteConfig,
                valorPorKm: parseFloat(freteConfig.valorPorKm || 0),
                updatedAt: new Date(),
                updatedBy: user?.auth?.email || 'Sistema'
            }, { merge: true });
            alert('Configurações de frete salvas com sucesso!');
        } catch (error) {
            console.error("Erro ao salvar frete:", error);
            alert('Ocorreu um erro ao salvar as configurações.');
        } finally {
            setIsSavingFrete(false);
        }
    };


    const updateScheduleDay = (dayKey, field, value) => {
        setStoreHoursConfig((prev) => ({
            ...prev,
            schedule: {
                ...prev.schedule,
                [dayKey]: {
                    ...(prev.schedule?.[dayKey] || { enabled: false, open: '08:00', close: '18:00' }),
                    [field]: value
                }
            }
        }));
    };

    const handleSaveStoreHoursConfig = async (event) => {
        event.preventDefault();

        if (!effectiveStoreId) {
            alert('Selecione uma loja específica para salvar o horário de funcionamento.');
            return;
        }

        for (const day of WEEKDAYS) {
            const dayConfig = storeHoursConfig.schedule?.[day.key];
            if (!dayConfig?.enabled) continue;
            if (!dayConfig.open || !dayConfig.close) {
                alert(`Preencha abre e fecha para ${day.label}.`);
                return;
            }
            if (dayConfig.close <= dayConfig.open) {
                alert(`O horário de fechamento de ${day.label} deve ser maior que o de abertura.`);
                return;
            }
        }

        setIsSavingStoreHours(true);
        try {
            const configRef = getStoreConfigDocRef(effectiveStoreId);
            await setDoc(configRef, {
                timezone: storeHoursConfig.timezone || DEFAULT_STORE_TIMEZONE,
                schedule: storeHoursConfig.schedule || buildDefaultStoreSchedule(),
                alarmPauseMinutes: sanitizeAlarmPauseMinutes(storeHoursConfig.alarmPauseMinutes),
                manualOverride: {
                    ...(storeHoursConfig.manualOverride || { mode: 'auto' }),
                    updatedAt: serverTimestamp(),
                    updatedBy: user?.auth?.email || user?.email || 'Sistema'
                }
            }, { merge: true });
            alert('Horário de funcionamento salvo com sucesso!');
        } catch (error) {
            console.error('Erro ao salvar horário de funcionamento:', error);
            alert('Não foi possível salvar o horário de funcionamento.');
        } finally {
            setIsSavingStoreHours(false);
        }
    };

    const handleManualOverrideChange = async (mode) => {
        if (!effectiveStoreId) {
            alert('Selecione uma loja específica para alterar o status da loja.');
            return;
        }

        try {
            const configRef = getStoreConfigDocRef(effectiveStoreId);
            await setDoc(configRef, {
                manualOverride: {
                    mode,
                    updatedAt: serverTimestamp(),
                    updatedBy: user?.auth?.email || user?.email || 'Sistema'
                }
            }, { merge: true });
            setStoreHoursConfig((prev) => ({
                ...prev,
                manualOverride: {
                    ...prev.manualOverride,
                    mode,
                    updatedBy: user?.auth?.email || user?.email || 'Sistema'
                }
            }));
        } catch (error) {
            console.error('Erro ao atualizar override manual da loja:', error);
            alert('Não foi possível atualizar o status da loja.');
        }
    };

    const handleSaveEntreLojasConfig = async (event) => {
        event.preventDefault();
        if (!effectiveStoreId) {
            alert('Selecione uma loja específica para salvar a configuração de Entre Lojas.');
            return;
        }
        if (!canEditEntreLojasConfig) {
            alert('Você não tem permissão para alterar essa configuração.');
            return;
        }
        const percentual = Number(entreLojasConfig.percentualRepasse || 0);
        if (percentual < 0) {
            alert('Percentual de repasse não pode ser negativo.');
            return;
        }
        setIsSavingEntreLojasConfig(true);
        try {
            await setDoc(getStoreConfigDocRef(effectiveStoreId), {
                entreLojas: {
                    percentualRepasse: Number.isFinite(percentual) ? percentual : 0,
                    updatedAt: serverTimestamp(),
                    updatedBy: user?.auth?.email || user?.email || 'Sistema'
                }
            }, { merge: true });
            alert('Configuração de Entre Lojas salva com sucesso!');
        } catch (error) {
            console.error('Erro ao salvar configuração de Entre Lojas:', error);
            alert('Não foi possível salvar a configuração de Entre Lojas.');
        } finally {
            setIsSavingEntreLojasConfig(false);
        }
    };

    const processedLogs = useMemo(() => {
        if (!data.logs || !Array.isArray(data.logs)) return [];
        return data.logs.map(log => {
            const { action = '', details = '' } = log;
            let formattedDetails = details;
            
            const updateMatch = details.match(/alterações: (\{.*\})/);
            if (action.includes('atualizado') && updateMatch) {
                try {
                    const changes = JSON.parse(updateMatch[1]);
                    const field = Object.keys(changes)[0];
                    const { old: oldVal, new: newVal } = changes[field];
                    const idMatch = details.match(/ID (\w+)/);
                    const id = idMatch ? idMatch[1].substring(0,8) + '...' : 'ID desconhecido';

                    formattedDetails = `Item "ID ${id}" atualizado (${field}: "${oldVal}" para "${newVal}")`;
                } catch (e) { 
                }
            } else {
                const idMatch = details.match(/ID:? (\w+)/);
                if (idMatch) {
                    const id = idMatch[1];
                    let collectionName = null;
                    if (action.includes('produtos')) collectionName = 'produtos';
                    else if (action.includes('clientes')) collectionName = 'clientes';
                    else if (action.includes('pedidos')) collectionName = 'pedidos';
                    else if (action.includes('fornecedores')) collectionName = 'fornecedores';
                    else if (action.includes('estoque')) collectionName = 'estoque';
                    else if (action.includes('cupons')) collectionName = 'cupons';

                    if (collectionName && data[collectionName] && Array.isArray(data[collectionName])) {
                        const item = data[collectionName].find(d => d.id === id);
                        if (item) {
                            const itemName = item.nome || item.clienteNome || item.codigo || `(ID: ${id})`;
                            formattedDetails = details.replace(`ID: ${id}`, `"${itemName}"`).replace(`ID ${id}`, `"${itemName}"`);
                        }
                    }
                }
            }
            
            return {
                ...log,
                user: log.userEmail || 'Não registrado',
                formattedDetails: formattedDetails,

                lojaNome: log.lojaId ? (storeInfoMap[log.lojaId]?.nome || log.lojaId) : effectiveStoreName
            };
        }).sort((a, b) => {
            const dateA = getJSDate(a.timestamp) || new Date(0);
            const dateB = getJSDate(b.timestamp) || new Date(0);
            return dateB - dateA;
        });

    }, [data, storeInfoMap, effectiveStoreName]);

    const renderUserRoleBadge = (row) => {
        const normalizedRole = normalizeRole(row.role);
        const roleClass = normalizedRole === ROLE_OWNER
            ? 'bg-purple-100 text-purple-800'
            : normalizedRole === ROLE_MANAGER
                ? 'bg-blue-100 text-blue-800'
                : normalizedRole === ROLE_ACCOUNTANT
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-gray-100 text-gray-800';

        return <span className={`px-3 py-1 rounded-full text-xs font-medium ${roleClass}`}>{normalizedRole}</span>;
    };

    const getUserStoreLabel = (row) => {
        const lojas = Array.isArray(row.lojaIds) ? row.lojaIds : (row.lojaId ? [row.lojaId] : []);
        if (normalizeRole(row.role) === ROLE_OWNER && lojas.length === 0) {
            return 'Todas as lojas';
        }
        if (!lojas.length) {
            return 'Não definida';
        }
        return lojas.map((id) => storeInfoMap[id]?.nome || id).join(', ');
    };

    const userActions = [ 
        { icon: Edit, label: "Editar", onClick: handleEditUser }, 
        { icon: Key, label: "Alterar Senha", onClick: (u) => { setEditingUser(u); setShowPasswordModal(true); } },
        { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => handleDeleteUser(row) }) } 
    ];
    
    const cupomColumns = [
        { header: 'Código', key: 'codigo' },
        { header: 'Desconto', render: (row) => `${row.valor || 0} ${row.tipoDesconto === 'percentual' ? '%' : 'R$'}` },
        { header: 'Uso', render: (row) => `${row.usos || 0} / ${row.limiteUso || 0}` },
        { header: 'Valor Mínimo', render: (row) => `R$ ${(row.valorMinimo || 0).toFixed(2)}` },
        { header: 'Status', render: (row) => <span className={`px-3 py-1 rounded-full text-xs font-medium ${row.status === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{row.status || 'Ativo'}</span> }
    ];
    const cupomActions = [ 
        { icon: Edit, label: "Editar", onClick: handleEditCupom }, 
        { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('cupons', row.id) }) } 
    ];

    const logColumns = [
        { header: "Data/Hora", render: (row) => {
            const date = getJSDate(row.timestamp);
            return date ? date.toLocaleString('pt-BR') : '-';
        }},
        { header: "Usuário", key: "user" },
		{ header: "Loja", render: (row) => row.lojaNome || '-' },

        { header: "Ação", key: "action" },
        { header: "Detalhes", key: "formattedDetails" },
    ];
    
    return (
        <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Configurações</h1>
              <p className="text-gray-600 mt-1">Gerencie usuários, cupons, frete e visualize os logs do sistema</p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-2">
                <div className="flex space-x-2">
                    <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'users' ? 'bg-pink-600 text-white' : 'hover:bg-pink-100'}`}>
                        Usuários
                    </button>
                    <button onClick={() => setActiveTab('cupons')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'cupons' ? 'bg-pink-600 text-white' : 'hover:bg-pink-100'}`}>
                        Cupons
                    </button>
                    <button onClick={() => setActiveTab('frete')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'frete' ? 'bg-pink-600 text-white' : 'hover:bg-pink-100'}`}>
                        Frete
                    </button>
                    <button onClick={() => setActiveTab('funcionamento')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'funcionamento' ? 'bg-pink-600 text-white' : 'hover:bg-pink-100'}`}>
                        Funcionamento
                    </button>
                    <button onClick={() => setActiveTab('entre-lojas')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'entre-lojas' ? 'bg-pink-600 text-white' : 'hover:bg-pink-100'}`}>
                        Entre Lojas
                    </button>
                    <button onClick={() => setActiveTab('logs')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'logs' ? 'bg-pink-600 text-white' : 'hover:bg-pink-100'}`}>
                        Logs de Atividade
                    </button>
                </div>
            </div>
            
            {activeTab === 'users' && (

            <div>
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 md:p-6 mb-4">
                    <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
                        <h2 className="text-lg font-semibold text-gray-800">Filtros</h2>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleClearUserFilters}
                            disabled={!hasUserFilters}
                        >
                            Limpar filtros
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Input
                            label="Buscar por nome"
                            placeholder="Ex: Ana"
                            value={userSearchTerm}
                            onChange={(e) => setUserSearchTerm(e.target.value)}
                        />
                        <Input
                            label="Excluir nome"
                            placeholder="Ex: João"
                            value={userExcludeTerm}
                            onChange={(e) => setUserExcludeTerm(e.target.value)}
                        />
                        <Select
                            label="E-mail"
                            value={userEmailFilter}
                            onChange={(e) => setUserEmailFilter(e.target.value)}
                        >
                            <option value="any">Todos</option>
                            <option value="empty">Apenas vazios</option>
                            <option value="filled">Apenas preenchidos</option>
                        </Select>
                        <Select
                            label="Permissão"
                            value={userRoleFilter}
                            onChange={(e) => setUserRoleFilter(e.target.value)}
                        >
                            <option value="all">Todas</option>
                            {userRoles.map((roleOption) => (
                                <option key={roleOption} value={roleOption}>
                                    {roleOption.charAt(0).toUpperCase() + roleOption.slice(1)}
                                </option>
                            ))}
                        </Select>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 my-4">
                    {usuarios && usuarios.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                                    checked={allVisibleUsersSelected}
                                    onChange={(event) => handleToggleVisibleUsers(event.target.checked)}
                                    disabled={!visibleUserIds.length}
                                    aria-label="Selecionar todos os usuários visíveis"
                                />
                                Selecionar todos visíveis
                            </label>
                            <span className="text-sm text-gray-500">
                                {selectedVisibleUsers.length > 0
                                    ? `${selectedVisibleUsers.length} selecionado${selectedVisibleUsers.length === 1 ? '' : 's'}`
                                    : `${filteredUsuarios.length} ${filteredUsuarios.length === 1 ? 'usuário visível' : 'usuários visíveis'}`}
                            </span>
                        </div>
                    ) : (
                        <div />
                    )}
                    <div className="flex flex-wrap justify-end gap-3">
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={handleConfirmBulkDeleteUsers}
                            disabled={selectedVisibleUsers.length === 0}
                        >
                            <Trash2 className="w-4 h-4" /> Excluir selecionados
                        </Button>
                        <Button onClick={handleNewUser}><Plus className="w-4 h-4" /> Novo Usuário</Button>
                    </div>
                </div>
				
                {(!usuarios || usuarios.length === 0) ? (
                    <div className="text-center p-8 bg-white rounded-2xl shadow-lg">
                        <p className="text-gray-500">Nenhum usuário encontrado.</p>
                        <p className="text-sm text-gray-400 mt-2">Clique em "Novo Usuário" para criar o primeiro usuário.</p>
                    </div>

				) : (filteredUsuarios.length === 0 ? (
                    <div className="text-center p-8 bg-white rounded-2xl shadow-lg">
                        <p className="text-gray-500">Nenhum usuário corresponde aos filtros selecionados.</p>
                        <p className="text-sm text-gray-400 mt-2">Ajuste os filtros ou limpe-os para visualizar todos os usuários.</p>
                    </div>								
                ) : (
                    <>
                        <div className="hidden md:block bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                                        <tr>
                                            <th className="px-4 py-4 text-left w-12">
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                                                    checked={allVisibleUsersSelected}
                                                    onChange={(event) => handleToggleVisibleUsers(event.target.checked)}
                                                    aria-label="Selecionar todos os usuários visíveis"
                                                />
                                            </th>
                                            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Nome</th>
                                            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Email</th>
                                            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Permissão</th>
                                            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Loja</th>
                                            <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredUsuarios.map((usuario, rowIndex) => {
                                            const usuarioId = getUsuarioId(usuario);
                                            const isSelected = selectedUserIds.includes(usuarioId);

                                            return (
                                                <tr key={usuarioId || rowIndex} className="hover:bg-gradient-to-r hover:from-pink-50/50 hover:to-rose-50/50 transition-all">
                                                    <td className="px-4 py-4">
                                                        <input
                                                            type="checkbox"
                                                            className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                                                            checked={isSelected}
                                                            onChange={(event) => handleToggleUserSelection(usuario, event.target.checked)}
                                                            disabled={!usuarioId}
                                                            aria-label={`Selecionar usuário ${usuario.nome || usuario.email || usuarioId}`}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">{usuario.nome}</td>
                                                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">{usuario.email}</td>
                                                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">{renderUserRoleBadge(usuario)}</td>
                                                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">{getUserStoreLabel(usuario)}</td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex justify-end gap-2">
                                                            {userActions.map((action, actionIndex) => {
                                                                const actionLabel = typeof action.label === 'function' ? action.label(usuario) : action.label;
                                                                return (
                                                                    <button key={actionIndex} onClick={() => action.onClick(usuario)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title={actionLabel}>
                                                                        <action.icon className="w-4 h-4 text-gray-600" />
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="block md:hidden space-y-4">
                            {filteredUsuarios.map((usuario, rowIndex) => {
                                const usuarioId = getUsuarioId(usuario);
                                const isSelected = selectedUserIds.includes(usuarioId);

                                return (
                                    <div key={usuarioId || rowIndex} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                                                    checked={isSelected}
                                                    onChange={(event) => handleToggleUserSelection(usuario, event.target.checked)}
                                                    disabled={!usuarioId}
                                                    aria-label={`Selecionar usuário ${usuario.nome || usuario.email || usuarioId}`}
                                                />
                                                Selecionar
                                            </label>
                                            <div className="flex justify-end gap-2">
                                                {userActions.map((action, actionIndex) => {
                                                    const actionLabel = typeof action.label === 'function' ? action.label(usuario) : action.label;
                                                    return (
                                                        <button key={actionIndex} onClick={() => action.onClick(usuario)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700" title={actionLabel}>
                                                            <action.icon className="w-4 h-4" />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="text-sm">
                                            <p className="font-bold text-lg text-pink-600">{usuario.nome}</p>
                                            <p className="text-gray-700 mt-1">{usuario.email}</p>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 text-sm">
                                            <div>
                                                <p className="text-xs text-gray-500">Permissão</p>
                                                <div className="mt-1">{renderUserRoleBadge(usuario)}</div>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500">Loja</p>
                                                <p className="mt-1 text-gray-900">{getUserStoreLabel(usuario)}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ))}
                  
              </div>
            )}
            
            {activeTab === 'cupons' && (
              <div>

                {!effectiveStoreId ? (
                    <div className="text-center p-8 bg-white rounded-2xl shadow-lg">
                        <p className="text-gray-500">Selecione uma loja no topo da página para gerenciar os cupons.</p>
                    </div>
                ) : (
                    <>
                        <div className="flex justify-between items-center my-4">
                            <p className="text-sm text-gray-500">Gerenciando cupons da loja <strong>{effectiveStoreName}</strong></p>
                            <Button onClick={handleNewCupom}><Ticket className="w-4 h-4" /> Novo Cupom</Button>
                        </div>
                        {(!cupons || cupons.length === 0) ? (
                            <div className="text-center p-8 bg-white rounded-2xl shadow-lg">
                                <p className="text-gray-500">Nenhum cupom cadastrado.</p>
                                <p className="text-sm text-gray-400 mt-2">Clique em "Novo Cupom" para criar o primeiro cupom.</p>
                            </div>
                        ) : (
                            <Table columns={cupomColumns} data={cupons} actions={cupomActions} />
                        )}
                    </>
                )}
              </div>
            )}

            {activeTab === 'logs' && (
                <div className="mt-4">
                    {(!data.logs || data.logs.length === 0) ? (
                        <div className="text-center p-8 bg-white rounded-2xl shadow-lg">
                            <p className="text-gray-500">Nenhum log de atividade encontrado.</p>
                            <p className="text-sm text-gray-400 mt-2">Os logs aparecerão conforme você usar o sistema.</p>
                        </div>
                    ) : (
                        <Table columns={logColumns} data={processedLogs} />
                    )}
                </div>
            )}
            
            {activeTab === 'frete' && (

                !effectiveStoreId ? (
                    <div className="mt-6 bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-center text-gray-500">
                        Selecione uma loja no topo da página para configurar o frete.
                    </div>
                ) : (
                    <div className="mt-6 bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                        <form onSubmit={handleSaveFreteConfig} className="space-y-4 max-w-lg">
                            <h3 className="text-xl font-bold text-gray-800">Configurações de Entrega</h3>
                            <p className="text-sm text-gray-500">
                                Defina o endereço de partida dos seus pedidos e o valor cobrado por quilômetro. As coordenadas podem ser encontradas no Google Maps.
                            </p>
                            <Input
                                label="Endereço da Loja (para referência)"
                                placeholder="Av. Comercial, 433 - Jardim Nova Esperança, Goiânia - GO"
                                value={freteConfig.enderecoLoja || ''}
                                onChange={e => setFreteConfig({ ...freteConfig, enderecoLoja: e.target.value })}
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    label="Latitude da Loja"
                                    placeholder="-16.6725019"
                                    value={freteConfig.lat || ''}
                                    onChange={e => setFreteConfig({ ...freteConfig, lat: e.target.value })}
                                    required
                                />
                                <Input
                                    label="Longitude da Loja"
                                    placeholder="-49.3274707"
                                    value={freteConfig.lng || ''}
                                    onChange={e => setFreteConfig({ ...freteConfig, lng: e.target.value })}
                                    required
                                />
                            </div>
                            <Input
                                label="Valor por KM (R$)"
                                type="number"
                                step="0.01"
                                placeholder="Ex: 1.50"
                                value={freteConfig.valorPorKm || ''}
                                onChange={e => setFreteConfig({ ...freteConfig, valorPorKm: e.target.value })}
                                required
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input 
                                label="Latitude da Loja" 
                                placeholder="-16.6725019"
                                value={freteConfig.lat || ''} 
                                onChange={e => setFreteConfig({ ...freteConfig, lat: e.target.value })} 
                                required 
                            />
                            <Input 
                                label="Longitude da Loja" 
                                placeholder="-49.3274707"
                                value={freteConfig.lng || ''} 
                                onChange={e => setFreteConfig({ ...freteConfig, lng: e.target.value })} 
                                required 
                            />
                        </div>
                            <div className="pt-4">
                                <Button type="submit" disabled={isSavingFrete}>
                                    <Save className="w-4 h-4" /> {isSavingFrete ? 'Salvando...' : 'Salvar Configurações'}
                                </Button>
                            </div>
                        </form>
                    </div>
                )

            )}

            {activeTab === 'funcionamento' && (
                !effectiveStoreId ? (
                    <div className="mt-6 bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-center text-gray-500">
                        Selecione uma loja no topo da página para configurar o funcionamento.
                    </div>
                ) : (
                    <div className="mt-6 bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-6">
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Horário de funcionamento</h3>
                            <p className="text-sm text-gray-500">Defina o fuso e os horários por dia da semana para esta loja.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="Fuso horário"
                                value={storeHoursConfig.timezone || DEFAULT_STORE_TIMEZONE}
                                onChange={(e) => setStoreHoursConfig((prev) => ({ ...prev, timezone: e.target.value }))}
                                placeholder="America/Sao_Paulo"
                            />
                            <Input
                                label="Tempo de pausa do alarme (min)"
                                type="number"
                                min={MIN_ALARM_PAUSE_MINUTES}
                                max={MAX_ALARM_PAUSE_MINUTES}
                                value={storeHoursConfig.alarmPauseMinutes ?? DEFAULT_ALARM_PAUSE_MINUTES}
                                onChange={(e) => setStoreHoursConfig((prev) => ({
                                    ...prev,
                                    alarmPauseMinutes: sanitizeAlarmPauseMinutes(e.target.value)
                                }))}
                            />
                        </div>

                        <div className="space-y-3">
                            {WEEKDAYS.map((day) => {
                                const dayConfig = storeHoursConfig.schedule?.[day.key] || { enabled: false, open: '08:00', close: '18:00' };
                                return (
                                    <div key={day.key} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end border border-gray-100 rounded-xl p-3">
                                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(dayConfig.enabled)}
                                                onChange={(e) => updateScheduleDay(day.key, 'enabled', e.target.checked)}
                                            />
                                            {day.label}
                                        </label>
                                        <Input
                                            label="Abre"
                                            type="time"
                                            value={dayConfig.open || '08:00'}
                                            onChange={(e) => updateScheduleDay(day.key, 'open', e.target.value)}
                                            disabled={!dayConfig.enabled}
                                        />
                                        <Input
                                            label="Fecha"
                                            type="time"
                                            value={dayConfig.close || '18:00'}
                                            onChange={(e) => updateScheduleDay(day.key, 'close', e.target.value)}
                                            disabled={!dayConfig.enabled}
                                        />
                                        <p className="text-xs text-gray-500">{dayConfig.enabled ? 'Dia ativo' : 'Fechado neste dia'}</p>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                            <h4 className="font-semibold text-gray-800">Status da loja (override manual)</h4>
                            <div className="flex flex-wrap gap-2">
                                <Button type="button" variant={storeHoursConfig.manualOverride?.mode === 'force_open' ? 'primary' : 'secondary'} onClick={() => handleManualOverrideChange('force_open')}>
                                    Abrir agora
                                </Button>
                                <Button type="button" variant={storeHoursConfig.manualOverride?.mode === 'force_closed' ? 'primary' : 'secondary'} onClick={() => handleManualOverrideChange('force_closed')}>
                                    Fechar agora
                                </Button>
                                <Button type="button" variant={storeHoursConfig.manualOverride?.mode === 'auto' ? 'primary' : 'secondary'} onClick={() => handleManualOverrideChange('auto')}>
                                    Usar horário automático
                                </Button>
                            </div>
                        </div>

                        <div>
                            <Button type="button" onClick={handleSaveStoreHoursConfig} disabled={isSavingStoreHours}>
                                <Save className="w-4 h-4" /> {isSavingStoreHours ? 'Salvando...' : 'Salvar horário de funcionamento'}
                            </Button>
                        </div>
                    </div>
                )
            )}

            {activeTab === 'entre-lojas' && (
                !effectiveStoreId ? (
                    <div className="mt-6 bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-center text-gray-500">
                        Selecione uma loja no topo da página para configurar o repasse do módulo Entre Lojas.
                    </div>
                ) : (
                    <div className="mt-6 bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                        <form onSubmit={handleSaveEntreLojasConfig} className="space-y-4 max-w-xl">
                            <h3 className="text-xl font-bold text-gray-800">Configuração de Repasse — Entre Lojas</h3>
                            <p className="text-sm text-gray-500">
                                Este percentual será somado ao custo do produto para calcular automaticamente o valor de repasse nas remessas entre lojas.
                            </p>
                            <Input
                                label="Percentual de acréscimo do repasse (%)"
                                type="number"
                                min="0"
                                step="0.01"
                                value={entreLojasConfig.percentualRepasse}
                                onChange={(e) => setEntreLojasConfig((prev) => ({ ...prev, percentualRepasse: Math.max(0, Number(e.target.value || 0)) }))}
                                disabled={!canEditEntreLojasConfig}
                            />
                            <div className="rounded-lg border bg-pink-50 p-3 text-sm text-gray-700">
                                <p><strong>Custo:</strong> R$ 8,00</p>
                                <p><strong>Percentual:</strong> {Number(entreLojasConfig.percentualRepasse || 0).toFixed(2)}%</p>
                                <p><strong>Repasse calculado:</strong> R$ {(8 * (1 + (Number(entreLojasConfig.percentualRepasse || 0) / 100))).toFixed(2)}</p>
                            </div>
                            {!canEditEntreLojasConfig && (
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                    Apenas Admin/Dono pode alterar esse percentual.
                                </p>
                            )}
                            <div className="pt-2">
                                <Button type="submit" disabled={isSavingEntreLojasConfig || !canEditEntreLojasConfig}>
                                    <Save className="w-4 h-4" /> {isSavingEntreLojasConfig ? 'Salvando...' : 'Salvar Configurações'}
                                </Button>
                            </div>
                        </form>
                    </div>
                )
            )}
            
            <Modal isOpen={showUserModal} onClose={() => setShowUserModal(false)} title={editingUser ? "Editar Usuário" : "Novo Usuário"}>
                 <form onSubmit={handleUserSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-700" title="Escolha um usuário já cadastrado para carregar os dados automaticamente">Selecionar usuário existente</label>
                        <select
                            value={selectedExistingUserId}
                            onChange={(e) => handleExistingUserSelect(e.target.value)}
                            className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        >
                            <option value="">Cadastrar novo usuário</option>
                            {(usuarios || []).map((u) => (
                                <option key={u.uid || u.id} value={u.uid || u.id}>
                                    {(u.nome || u.email || 'Usuário').trim()} • {(u.email || 'sem email')} ({normalizeRole(u.role)})
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500">Use esta lista para localizar rapidamente um perfil e editar as permissões personalizadas.</p>
                    </div>
                    <Input label="Nome" value={userFormData.nome || ''} onChange={e => setUserFormData({...userFormData, nome: e.target.value})} required />
                    <Input
                        label="Email"
                        type="email"
                        value={userFormData.email || ''}
                        onChange={(e) => setUserFormData({...userFormData, email: e.target.value})}
                        required
                    />
                    {!editingUser && (
                        <Input
                            label="Senha"
                            type="password"
                            value={userFormData.senha || ''}
                            onChange={(e) => setUserFormData({...userFormData, senha: e.target.value})}
                            required
                            minLength="6"
                            placeholder="Mínimo 6 caracteres"
                        />
                    )}

                    <Select
                        label="Permissão"
                        value={userFormData.role || ROLE_ATTENDANT}
                        onChange={(e) => {
                            const newRole = normalizeRole(e.target.value);
                            if (newRole === ROLE_OWNER) {
                                setUserFormData({
                                    ...userFormData,
                                    role: newRole,
                                    lojaId: '',
                                    lojaIds: userFormData.lojaIds || [],
                                    permissions: getDefaultPermissionsForRole(newRole)
                                });
                            } else {
                                const roleStores = userFormData.lojaIds && userFormData.lojaIds.length
                                    ? userFormData.lojaIds
                                    : (userFormData.lojaId ? [userFormData.lojaId] : (effectiveStoreId ? [effectiveStoreId] : []));
                                setUserFormData({
                                    ...userFormData,
                                    role: newRole,
                                    lojaId: roleStores[0] || '',
                                    lojaIds: roleStores,
                                    permissions: getDefaultPermissionsForRole(newRole)
                                });
                            }
                        }}
                        required
                    >
                        <option value={ROLE_CLIENT}>Cliente</option>
                        <option value={ROLE_ATTENDANT}>Atendente</option>
                        <option value={ROLE_MANAGER}>Gerente</option>
                        <option value={ROLE_ACCOUNTANT}>Contador</option>
                        <option value={ROLE_OWNER}>Dono</option>
                    </Select>

                    {normalizeRole(userFormData.role) === ROLE_OWNER ? (
                        <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-700">Lojas com acesso</label>
                            <select
                                multiple
                                value={userFormData.lojaIds || []}
                                onChange={(e) => {
                                    const values = Array.from(e.target.selectedOptions).map(opt => opt.value);
                                    setUserFormData({ ...userFormData, lojaIds: values });
                                }}
                                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                            >
                                {availableStores.map(storeId => (
                                    <option key={storeId} value={storeId}>{storeInfoMap[storeId]?.nome || storeId}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500">Deixe sem seleção para conceder acesso a todas as lojas.</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-700">Lojas com acesso</label>
                            <div className="w-full px-4 py-3 border rounded-xl bg-white space-y-2 max-h-44 overflow-auto">
                                {availableStores.map((storeId) => {
                                    const selectedStores = userFormData.lojaIds && userFormData.lojaIds.length
                                        ? userFormData.lojaIds
                                        : (userFormData.lojaId ? [userFormData.lojaId] : []);
                                    const isChecked = selectedStores.includes(storeId);

                                    return (
                                        <label key={storeId} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={(e) => toggleUserStoreSelection(storeId, e.target.checked)}
                                            />
                                            <span>{storeInfoMap[storeId]?.nome || storeId}</span>
                                        </label>
                                    );
                                })}
                                {!availableStores.length && (
                                    <p className="text-xs text-red-500">Nenhuma loja disponível. Ajuste a seleção no topo da página antes de criar o usuário.</p>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold text-gray-800">Permissões personalizadas</p>
                                <p className="text-xs text-gray-500">
                                    {normalizeRole(userFormData.role) === ROLE_ACCOUNTANT
                                        ? 'Selecione os módulos que o contador pode consultar. Este papel é sempre somente leitura.'
                                        : 'Selecione quais menus o usuário pode acessar.'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="flex items-center gap-2 text-xs text-gray-600" title="Ative para personalizar o menu deste usuário">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(userFormData.applyCustomProfile)}
                                        onChange={(e) => {
                                            const useCustom = e.target.checked;
                                            setUserFormData((prev) => ({
                                                ...prev,
                                                applyCustomProfile: useCustom,
                                                permissions: useCustom ? prev.permissions : getDefaultPermissionsForRole(prev.role)
                                            }));
                                        }}
                                    />
                                    Ativar perfil personalizado
                                </label>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    title="Voltar para o padrão do papel selecionado"
                                    onClick={() => setUserFormData({
                                        ...userFormData,
                                        permissions: getDefaultPermissionsForRole(userFormData.role),
                                        applyCustomProfile: false,
                                    })}
                                >
                                    Usar padrão do papel
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    title="Recarrega a checklist com o padrão do papel, mantendo o perfil personalizado ativo"
                                    onClick={() => setUserFormData({
                                        ...userFormData,
                                        permissions: getDefaultPermissionsForRole(userFormData.role),
                                        applyCustomProfile: true,
                                    })}
                                >
                                    Restaurar checklist
                                </Button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {allMenuItems.map((item) => (
                                <label
                                    key={item.id}
                                    className={`flex items-center gap-2 text-sm text-gray-700 ${!userFormData.applyCustomProfile ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    title={`Permitir acesso ao menu "${item.label}"`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={Boolean(userFormData.permissions?.[item.id])}
                                        disabled={!userFormData.applyCustomProfile || (normalizeRole(userFormData.role) === ROLE_ACCOUNTANT && ACCOUNTANT_RESTRICTED_MODULES.has(item.id))}
                                        onChange={(e) => {
                                            setUserFormData({
                                                ...userFormData,
                                                permissions: {
                                                    ...sanitizePermissions(userFormData.permissions, userFormData.role),
                                                    [item.id]: e.target.checked
                                                }
                                            });
                                        }}
                                    />
                                    {item.label}
                                    {normalizeRole(userFormData.role) === ROLE_ACCOUNTANT && ACCOUNTANT_RESTRICTED_MODULES.has(item.id) && (
                                        <span className="text-xs text-gray-400">(indisponível para leitura)</span>
                                    )}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" type="button" onClick={() => setShowUserModal(false)}>Cancelar</Button>
                        <Button type="submit">
                            <Save className="w-4 h-4" />
                            Salvar
                        </Button>
                    </div>
                </form>
            </Modal>
            
            <Modal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)} title="Alterar Senha" size="sm">
                <form onSubmit={handlePasswordChange} className="space-y-4">
                    <Input label="Nova Senha" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="Mínimo 6 caracteres" />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" type="button" onClick={() => setShowPasswordModal(false)}>Cancelar</Button>
                        <Button type="submit"><Save className="w-4 h-4"/> Alterar</Button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={showCupomModal} onClose={() => setShowCupomModal(false)} title={editingCupom ? "Editar Cupom" : "Novo Cupom"} size="lg">
                <form onSubmit={handleCupomSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input 
                            label="Nome/Código do Cupom" 
                            value={cupomFormData.codigo || ''} 
                            onChange={e => setCupomFormData({ ...cupomFormData, codigo: e.target.value.toUpperCase() })} 
                            required 
                            disabled={!!editingCupom}
                        />
                        <Select label="Tipo de Desconto" value={cupomFormData.tipoDesconto || 'percentual'} onChange={e => setCupomFormData({ ...cupomFormData, tipoDesconto: e.target.value })}>
                            <option value="percentual">Percentual (%)</option>
                            <option value="fixo">Valor Fixo (R$)</option>
                        </Select>
                        <Input label="Valor do Desconto" type="number" step="0.01" value={cupomFormData.valor || ''} onChange={e => setCupomFormData({ ...cupomFormData, valor: e.target.value })} required />
                        <Input label="Quantidade Máxima de Uso" type="number" value={cupomFormData.limiteUso || ''} onChange={e => setCupomFormData({ ...cupomFormData, limiteUso: e.target.value })} required />
                        <Input label="Valor Mínimo do Pedido (R$)" type="number" step="0.01" value={cupomFormData.valorMinimo || ''} onChange={e => setCupomFormData({ ...cupomFormData, valorMinimo: e.target.value })} required />
                        <Select label="Status" value={cupomFormData.status || 'Ativo'} onChange={e => setCupomFormData({ ...cupomFormData, status: e.target.value })}>
                            <option value="Ativo">Ativo</option>
                            <option value="Inativo">Inativo</option>
                        </Select>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" type="button" onClick={() => setShowCupomModal(false)}>Cancelar</Button>
                        <Button type="submit"><Save className="w-4 h-4" /> Salvar</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
  };
  
  const Pedidos = () => {
    // Helper para obter a data de hoje no formato YYYY-MM-DD
    const getTodayString = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [searchTerm, setSearchTerm] = usePersistentState("pedidos_searchTerm", "");
    // **MELHORIA:** O padrão inicial continua sendo o dia de hoje.
    const [startDateFilter, setStartDateFilter] = usePersistentState("pedidos_startDateFilter", getTodayString());
    const [endDateFilter, setEndDateFilter] = usePersistentState("pedidos_endDateFilter", getTodayString());

    const [statusFilter, setStatusFilter] = usePersistentState("pedidos_statusFilter", 'Todos');
    const [showModal, setShowModal] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [isSavingOrder, setIsSavingOrder] = useState(false);
    const [saveOrderError, setSaveOrderError] = useState('');
    const [formData, setFormData] = useState({ clienteId: '', clienteNome: '', itens: [], subtotal: 0, desconto: 0, total: 0, status: 'Pendente', origem: 'Manual', categoria: 'Delivery', dataEntrega: '', observacao: '', formaPagamento: DEFAULT_ORDER_PAYMENT_METHOD, cupom: null });
    const [viewingOrder, setViewingOrder] = useState(null);
            const [orderToSendToDeliverer, setOrderToSendToDeliverer] = useState(null);
    const [descontoValor, setDescontoValor] = useState('');
    const [descontoPercentual, setDescontoPercentual] = useState('');
    const [productSearchTerm, setProductSearchTerm] = useState('');

    const deliveryProviders = useMemo(
        () => (data.fornecedores || []).filter(f => (f.status || 'Ativo') !== 'Inativo'),
        [data.fornecedores]
    );

    const canSendToDeliverer = (order) => {
        if (!order) return false;
        const { enderecoTexto } = getOrderAddressDetails(order, data.clientes);
        if (!enderecoTexto || enderecoTexto === 'Não informado' || enderecoTexto === 'Retirar na Loja') {
            return false;
        }
        return deliveryProviders.length > 0;
    };

    const pedidosComNomes = (data.pedidos || []).map(pedido => {
        const cliente = data.clientes.find(c => c.id === pedido.clienteId);
        return { ...pedido, clienteNome: cliente ? cliente.nome : (pedido.clienteNome || 'Cliente não encontrado') };
    });

    const filteredProducts = useMemo(() => {
        const term = productSearchTerm.trim().toLowerCase();

        return (data.produtos || [])
            .filter(p => p.categoria === formData.categoria && p.status === 'Ativo')
            .filter(p => {
                if (!term) return true;

                const nome = (p.nome || '').toLowerCase();
                const descricao = (p.descricao || '').toLowerCase();

                return nome.includes(term) || descricao.includes(term);
            })
            .sort((a, b) => a.nome.localeCompare(b.nome, undefined, { sensitivity: 'base' }));
    }, [data.produtos, formData.categoria, productSearchTerm]);

    const filteredOrders = useMemo(() => pedidosComNomes.filter(p => {
        // **MELHORIA:** Lógica de busca por nome do cliente OU ID do pedido
        const term = searchTerm.toLowerCase();
        const searchMatch = !term ||
            (p.clienteNome && p.clienteNome.toLowerCase().includes(term)) ||
            (p.id && p.id.toLowerCase().includes(term));
        
        const dateMatch = (() => {
            if (!startDateFilter && !endDateFilter) return true;
            
            const orderDate = getJSDate(p.createdAt);
            if (!orderDate) return false;
            
            const startDate = startDateFilter ? new Date(startDateFilter) : null;
            if(startDate) startDate.setHours(0, 0, 0, 0);

            const endDate = endDateFilter ? new Date(endDateFilter) : null;
            if(endDate) endDate.setHours(23, 59, 59, 999);

            if (startDate && orderDate < startDate) return false;
            if (endDate && orderDate > endDate) return false;
            
            return true;
        })();

        const statusMatch = statusFilter === 'Todos' || p.status === statusFilter;

        return searchMatch && dateMatch && statusMatch;
    }).sort((a, b) => {
        const dateA = getJSDate(a.createdAt) || 0;
        const dateB = getJSDate(b.createdAt) || 0;
        return dateB - dateA; // Mais recentes primeiro
    }), [pedidosComNomes, searchTerm, startDateFilter, endDateFilter, statusFilter]);

    const resetForm = () => {
        setEditingOrder(null);
        setSaveOrderError('');
        setFormData({ clienteId: '', clienteNome: '', itens: [], subtotal: 0, desconto: 0, total: 0, status: 'Pendente', origem: 'Manual', categoria: 'Delivery', dataEntrega: '', observacao: '', formaPagamento: DEFAULT_ORDER_PAYMENT_METHOD, cupom: null });
        setDescontoValor('');
        setDescontoPercentual('');
        setProductSearchTerm('');
    };
    
    // **MELHORIA:** Função para limpar todos os filtros, incluindo as datas
    const handleClearFilters = () => {
        setSearchTerm('');
        setStatusFilter('Todos');
        setStartDateFilter('');
        setEndDateFilter('');
    };


    const handleNewOrder = () => {
        resetForm();
        setShowModal(true);
    };

    const handleAddItemToOrder = (produto) => {
      setFormData(prev => {
          const existingItem = prev.itens.find(item => item.id === produto.id);
          let newItens;
          if (existingItem) {
              newItens = prev.itens.map(item =>
                  item.id === produto.id ? { ...item, quantity: item.quantity + 1 } : item
              );
          } else {
              newItens = [...prev.itens, { ...produto, quantity: 1 }];
          }
          const newSubtotal = newItens.reduce((sum, item) => sum + ((item.preco || 0) * (item.quantity || 1)), 0);
          const currentDiscount = prev.cupom?.valorDesconto || prev.desconto || 0;
          const newTotal = newSubtotal - currentDiscount;
          return { ...prev, itens: newItens, subtotal: newSubtotal, total: newTotal };
      });
    };

    const handleRemoveItemFromOrder = (produtoId) => {
        setFormData(prev => {
            const newItens = prev.itens.filter(item => item.id !== produtoId);
            const newSubtotal = newItens.reduce((sum, item) => sum + ((item.preco || 0) * (item.quantity || 1)), 0);
             const currentDiscount = prev.cupom?.valorDesconto || prev.desconto || 0;
            const newTotal = newSubtotal - currentDiscount;
            return { ...prev, itens: newItens, subtotal: newSubtotal, total: newTotal };
        });
    };
    
    const handleApplyDiscount = () => {
        const valor = parseFloat(descontoValor) || 0;
        const percent = parseFloat(descontoPercentual) || 0;
        const subtotal = formData.subtotal || 0;

        if (valor > 0 && percent > 0) {
            alert("Por favor, aplique o desconto em valor OU em percentual, não ambos.");
            return;
        }

        let newDiscount = 0;
        if (valor > 0) {
            newDiscount = valor;
        } else if (percent > 0) {
            newDiscount = (subtotal * percent) / 100;
        }

        if (newDiscount > subtotal) {
            alert("O desconto não pode ser maior que o subtotal.");
             setDescontoValor('');
             setDescontoPercentual('');
            return;
        }
        
        if (newDiscount < 0) {
            alert("O desconto não pode ser negativo.");
             setDescontoValor('');
             setDescontoPercentual('');
            return;
        }

        setFormData(prev => ({
            ...prev,
            desconto: newDiscount,
            total: subtotal - newDiscount,
            cupom: null // Remove cupom se aplicar desconto manual
        }));
    };

const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSavingOrder(true);
    setSaveOrderError('');
    console.log('[Sales][Create] Iniciando tentativa de criar pedido pelo modal.', {
        isEditing: Boolean(editingOrder),
        authCurrentUserUid: auth.currentUser?.uid || null,
        authStateUserUid: user?.auth?.uid || null
    });
    // Garante que clienteNome seja definido mesmo se não for encontrado
    const clienteSelecionado = data.clientes.find(c => c.id === formData.clienteId);
    const orderData = { 
        ...formData, 
        clienteNome: clienteSelecionado ? clienteSelecionado.nome : 'Cliente não selecionado' 
    };

    try {
        const resolveOrderStoreId = () => (
            editingOrder?.lojaId ||
            orderData?.lojaId ||
            resolveActiveStoreForWrite()
        );

        const isFinalizedStatus = (status) => status === 'Finalizado';

        const getOrderItemProductId = (item) => item?.produtoId || item?.productId || item?.id || null;

        const getOrderItemQuantity = (item) => {
            const parsed = Number(item?.quantity ?? item?.quantidade ?? 0);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
        };

        const mapOrderItemsByProduct = (items = []) => {
            const grouped = new Map();

            items.forEach((item) => {
                const productId = getOrderItemProductId(item);
                if (!productId) {
                    console.error('[Stock][Pedidos] Item sem identificador de produto. Item ignorado.', item);
                    return;
                }

                const quantity = getOrderItemQuantity(item);
                if (quantity <= 0) return;

                grouped.set(productId, (grouped.get(productId) || 0) + quantity);
            });

            return grouped;
        };

        const calculateOrderStockDelta = (oldItems = [], newItems = []) => {
            const oldMap = mapOrderItemsByProduct(oldItems);
            const newMap = mapOrderItemsByProduct(newItems);
            const productIds = new Set([...oldMap.keys(), ...newMap.keys()]);
            const delta = {};

            productIds.forEach((productId) => {
                const oldQty = oldMap.get(productId) || 0;
                const newQty = newMap.get(productId) || 0;
                const diff = newQty - oldQty;
                if (diff !== 0) {
                    delta[productId] = diff;
                }
            });

            return delta;
        };

        const applyStockDelta = async (deltaByProduct = {}, storeId) => {
            const entries = Object.entries(deltaByProduct).filter(([, delta]) => delta !== 0);
            if (entries.length === 0) return;

            await runTransaction(db, async (transaction) => {
                for (const [productId, delta] of entries) {
                    if (!productId) {
                        console.error('[Stock][Pedidos] Produto sem ID ao aplicar delta. Item ignorado.');
                        continue;
                    }

                    const productRef = getStoreDocRef(storeId, 'produtos', productId);
                    const productSnap = await transaction.get(productRef);

                    if (!productSnap.exists()) {
                        console.error(`[Stock][Pedidos] Produto ${productId} não encontrado em lojas/${storeId}/produtos. Delta ignorado.`);
                        continue;
                    }

                    const currentStockRaw = Number(productSnap.data()?.estoque ?? 0);
                    const currentStock = Number.isFinite(currentStockRaw) ? currentStockRaw : 0;
                    const nextStock = currentStock - delta;

                    if (nextStock < 0) {
                        throw new Error(`Estoque insuficiente para o produto ${productSnap.data()?.nome || productId}.`);
                    }

                    transaction.update(productRef, {
                        estoque: nextStock,
                        updatedAt: serverTimestamp()
                    });
                }
            });
        };

        if (editingOrder) {
            const { id, ...updateData } = orderData;
            await updateItem('pedidos', editingOrder.id, updateData);

            const storeId = resolveOrderStoreId();
            const wasFinalized = isFinalizedStatus(editingOrder.status);
            const isNowFinalized = isFinalizedStatus(orderData.status);
            let stockDelta = {};

            if (!wasFinalized && isNowFinalized) {
                stockDelta = calculateOrderStockDelta([], orderData.itens || []);
            } else if (wasFinalized && !isNowFinalized) {
                stockDelta = calculateOrderStockDelta(editingOrder.itens || [], []);
            } else if (wasFinalized && isNowFinalized) {
                stockDelta = calculateOrderStockDelta(editingOrder.itens || [], orderData.itens || []);
            }

            await applyStockDelta(stockDelta, storeId);
        } else {
            await addItem('pedidos', orderData);

            if (isFinalizedStatus(orderData.status)) {
                const stockDelta = calculateOrderStockDelta([], orderData.itens || []);
                await applyStockDelta(stockDelta, resolveOrderStoreId());
            }
        }

        setShowModal(false);
        resetForm();
    } catch (error) {
        console.error('[Sales][Create] Fluxo de cadastro abortado por falha na persistência.', error);
        setSaveOrderError(error?.message || 'Não foi possível salvar o pedido. Tente novamente.');
    } finally {
        setIsSavingOrder(false);
    }
};
    
    const handleEdit = (order) => {
        setEditingOrder(order);
        const subtotal = (order.itens || []).reduce((sum, item) => sum + ((item.preco || 0) * (item.quantity || 1)), 0);
        const desconto = order.cupom?.valorDesconto || order.desconto || 0;
        const total = subtotal - desconto;
        
        // Garante que todos os campos necessários estejam presentes, mesmo que vazios

        const defaultOrderData = {
            clienteId: '',
            clienteNome: '',
            itens: [],
            subtotal: 0,
            desconto: 0,
            total: 0,
            status: 'Pendente',
            origem: 'Manual',
            categoria: 'Delivery',
            dataEntrega: '',
            observacao: '',
            formaPagamento: DEFAULT_ORDER_PAYMENT_METHOD,
            cupom: null
        };

        setFormData({
            ...defaultOrderData,
            ...order,
            subtotal,
            desconto,
            total,
            dataEntrega: order.dataEntrega ? (getJSDate(order.dataEntrega)?.toISOString().split('T')[0] || '') : ''
        });
        
        setDescontoValor(order.desconto && !order.cupom ? String(order.desconto) : ''); // Preenche desconto manual se houver
        setDescontoPercentual(''); // Limpa percentual ao editar
        setShowModal(true);
    };

    const getStatusClass = (status) => { switch (status) { case 'Pendente': return 'bg-yellow-100 text-yellow-800'; case 'Em Produção': return 'bg-blue-100 text-blue-800'; case 'Finalizado': return 'bg-green-100 text-green-800'; case 'Cancelado': return 'bg-red-100 text-red-800'; default: return 'bg-gray-100 text-gray-800'; } };
    const columns = [ { header: "ID do Pedido", render: (row) => <span className="font-mono text-xs text-gray-500">{row.id?.substring(0, 8) || 'N/A'}</span> }, { header: "Cliente", key: "clienteNome" }, { header: "Total", render: (row) => <span className="font-semibold text-green-600">R$ {(row.total || 0).toFixed(2)}</span> }, { header: "Data", render: (row) => { const date = getJSDate(row.createdAt); return date ? date.toLocaleDateString('pt-BR') : '-'; } }, { header: "Origem", key: "origem"}, { header: "Status", render: (row) => { const isPendingSync = row._isPendingSync; return <span className={`px-3 py-1 rounded-full text-xs font-medium ${isPendingSync ? 'bg-gray-100 text-gray-600' : getStatusClass(row.status)}`}>{isPendingSync ? 'Sincronizando...' : row.status}</span>; } } ];
    const actions = [ { icon: Eye, label: "Ver", onClick: (row) => setViewingOrder(row) }, { icon: Edit, label: "Editar", onClick: handleEdit }, { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('pedidos', row.id) }) } ];
    
    return (
        <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div><h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Gestão de Pedidos</h1><p className="text-gray-600 mt-1">Acompanhe e gerencie todos os pedidos</p></div>
                <Button onClick={handleNewOrder} className="w-full md:w-auto"><Plus className="w-4 h-4" /> Novo Pedido</Button>
            </div>
            
            <div className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-2xl shadow-lg border border-gray-100 flex-wrap">
                <div className="relative flex-grow w-full md:w-auto">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    {/* **MELHORIA:** Placeholder do campo de busca atualizado */}
                    <input type="text" placeholder="Buscar por cliente ou ID do pedido..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-pink-500" />
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto md:flex-grow">
                    <Input label="Data Inicial" type="date" value={startDateFilter} onChange={(e) => setStartDateFilter(e.target.value)} className="py-2.5"/>
                    <Input label="Data Final" type="date" value={endDateFilter} onChange={(e) => setEndDateFilter(e.target.value)} className="py-2.5"/>
                </div>
                <div className="flex-grow w-full md:w-auto">
                    <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full">
                        <option value="Todos">Todos os Status</option>
                        <option value="Pendente">Pendente</option>
                        <option value="Em Produção">Em Produção</option>
                        <option value="Pronto para Entrega">Pronto para Entrega</option>
                        <option value="Finalizado">Finalizado</option>
                        <option value="Cancelado">Cancelado</option>
                    </Select>
                </div>
                <Button variant="secondary" onClick={handleClearFilters} className="w-full md:w-auto">
                    Limpar Filtros
                </Button>
            </div>

            <Table columns={columns} data={filteredOrders} actions={actions} />
            
            <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingOrder ? "Editar Pedido" : "Novo Pedido"} size="xl">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Select label="Cliente" value={formData.clienteId} onChange={(e) => setFormData({...formData, clienteId: e.target.value})} required><option value="">Selecione um cliente</option>{data.clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</Select>
                        <Select label="Status" value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})} required><option>Pendente</option><option>Em Produção</option><option>Pronto para Entrega</option><option>Finalizado</option><option>Cancelado</option></Select>
                        <Select label="Categoria do Pedido" value={formData.categoria} onChange={(e) => setFormData({...formData, categoria: e.target.value, itens: [], total: 0})} required>
                            <option value="Delivery">Delivery</option>
                            <option value="Festa">Festa</option>
                        </Select>
                        <Select label="Forma de Pagamento" value={formData.formaPagamento} onChange={(e) => setFormData({...formData, formaPagamento: e.target.value})} required>
                            {ORDER_PAYMENT_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                        </Select>
                        {formData.categoria === 'Festa' && (
                            <Input 
                                label="Data de Entrega" 
                                type="date" 
                                value={formData.dataEntrega} 
                                onChange={(e) => setFormData({...formData, dataEntrega: e.target.value})}
                                min={getTodayString()}
                                required 
                            />
                        )}
                    </div>
                     <Textarea 
                        label="Observação" 
                        rows="3" 
                        value={formData.observacao || ''} 
                        onChange={(e) => setFormData({...formData, observacao: e.target.value})} 
                        placeholder="Ex: Bolo sem cobertura, entregar para a secretária, etc."
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <h3 className="font-semibold">Adicionar Produtos</h3>
                            <Input
                                label="Buscar produto"
                                placeholder="Buscar por nome ou descrição"
                                value={productSearchTerm}
                                onChange={(e) => setProductSearchTerm(e.target.value)}
                            />
                            <div className="max-h-60 overflow-y-auto border rounded-lg p-2 space-y-1">
                                {filteredProducts
                                    .map(p => (<div key={p.id} className="flex justify-between items-center p-2 rounded hover:bg-gray-50"><span>{p.nome} - R$ {(p.preco || 0).toFixed(2)}</span><Button size="sm" variant="secondary" onClick={() => handleAddItemToOrder(p)}>+</Button></div>))}
                            </div>
                        </div>
                        <div className="space-y-2">
                          <h3 className="font-semibold">Itens no Pedido</h3>
                          <div className="max-h-60 overflow-y-auto border rounded-lg p-2 space-y-1">{formData.itens.length === 0 ? <p className="text-sm text-gray-500 text-center p-4">Nenhum item</p> : formData.itens.map(item => (<div key={item.id} className="flex justify-between items-center p-2 rounded bg-pink-50"><span>{item.quantity}x {item.nome}</span><div className="flex items-center gap-2"><span className="text-sm">R$ {((item.preco || 0) * (item.quantity || 1)).toFixed(2)}</span><button type="button" onClick={() => handleRemoveItemFromOrder(item.id)} className="text-red-500"><Trash2 size={14}/></button></div></div>))}</div>
                           <div className="text-right mt-2 space-y-1">
                                <p className="text-sm text-gray-600">Subtotal: R$ {(formData.subtotal || 0).toFixed(2)}</p>
                                { (formData.cupom || formData.desconto > 0) && <p className="text-sm text-red-600">Desconto: - R$ {(formData.cupom?.valorDesconto || formData.desconto || 0).toFixed(2)}</p>}
                                {formData.cupom && <p className="text-xs text-green-600">Cupom: {formData.cupom.codigo}</p>}
                                <p className="font-bold text-lg text-gray-800">Total: R$ {(formData.total || 0).toFixed(2)}</p>
                           </div>
                        </div>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-lg mt-4">
                        <h4 className="font-semibold mb-2 text-gray-700">Aplicar Desconto (Manual)</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                            <Input label="Valor do desconto (R$)" type="number" step="0.01" value={descontoValor} onChange={e => { setDescontoValor(e.target.value); setDescontoPercentual(''); setFormData(prev => ({...prev, cupom: null})); }} placeholder="Ex: 10.00" />
                            <Input label="Percentual do desconto (%)" type="number" value={descontoPercentual} onChange={e => { setDescontoPercentual(e.target.value); setDescontoValor(''); setFormData(prev => ({...prev, cupom: null})); }} placeholder="Ex: 15" />
                            <Button variant="secondary" onClick={handleApplyDiscount} className="w-full">Aplicar desconto</Button>
                        </div>
                    </div>

                    {saveOrderError && (
                        <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
                            {saveOrderError}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4"><Button variant="secondary" type="button" onClick={() => { setShowModal(false); resetForm(); }}>Cancelar</Button><Button type="submit" disabled={isSavingOrder}><Save className="w-4 h-4" />{isSavingOrder ? "Salvando..." : (editingOrder ? "Salvar Alterações" : "Criar Pedido")}</Button></div>
                </form>
            </Modal>
            <Modal isOpen={!!viewingOrder} onClose={() => setViewingOrder(null)} title="Detalhes do Pedido" size="lg">
                {viewingOrder && (() => {
                    const cliente = data.clientes.find(c => c.id === viewingOrder.clienteId);
                    const endereco = viewingOrder.clienteEndereco || cliente?.enderecos?.[0] || 'Não informado';
                    const telefone = viewingOrder.telefone || cliente?.telefone || '';
                    const cpfCliente = viewingOrder.clienteDocumento || cliente?.cpf || cliente?.documento || '';
                    const subtotal = (viewingOrder.itens || []).reduce((sum, item) => sum + ((item.preco || 0) * (item.quantity || 1)), 0);
					const frete = parseFloat(viewingOrder.valorFrete ?? viewingOrder.frete ?? 0) || 0;

                    
                    const handleSendToWhatsApp = () => {
                        if (!telefone) {
                           alert("Telefone do cliente não encontrado para enviar mensagem.");
                           return;
                        }
            
                        const formattedPhone = telefone.replace(/\D/g, '');
                        // Adiciona 55 se não tiver, e garante que tenha 11 ou 13 dígitos (com 55)
                        const whatsappNumber = formattedPhone.length === 11 ? `55${formattedPhone}` : formattedPhone.length === 13 && formattedPhone.startsWith('55') ? formattedPhone : `55${formattedPhone}`; // Assume DDD + 9 dígitos se não tiver 55

                        let message = `Olá, *${viewingOrder.clienteNome || 'Cliente'}*!\n\n`;
                        message += `Aqui está um resumo do seu pedido na Ana Guimarães Doceria:\n\n`;
                        if (endereco !== 'Não informado') {
                            message += `*Endereço de Entrega:*\n${endereco}\n\n`;
                        }
                        message += `*Itens do Pedido:*\n`;
                        (viewingOrder.itens || []).forEach(item => {
                            message += `  • ${item.quantity || 1}x ${item.nome}\n`;
                        });
                        message += `\n`;

                        if (viewingOrder.cupom?.valorDesconto > 0) {
                            message += `*Subtotal:* R$ ${subtotal.toFixed(2)}\n`;
                            message += `*Desconto (${viewingOrder.cupom.codigo}):* - R$ ${viewingOrder.cupom.valorDesconto.toFixed(2)}\n`;
                        } else if (viewingOrder.desconto > 0) {
                             message += `*Subtotal:* R$ ${subtotal.toFixed(2)}\n`;
                             message += `*Desconto Manual:* - R$ ${viewingOrder.desconto.toFixed(2)}\n`;
                        }

                        message += `*Frete:* R$ ${frete.toFixed(2)}\n`;
                        message += `*Total:* R$ ${(viewingOrder.total || 0).toFixed(2)}\n`;
                        if(viewingOrder.formaPagamento) message += `*Pagamento:* ${viewingOrder.formaPagamento}\n`;
                        message += `*Status:* ${viewingOrder.status}\n\n`;
                        if(viewingOrder.observacao) message += `*Observações:* ${viewingOrder.observacao}\n\n`;
                        
                        message += `Agradecemos a sua preferência! ❤`;

                        const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
                        window.open(whatsappUrl, '_blank');
                    };
                    
                    const handlePrint = () => {
                        const printWindow = window.open('', '_blank');
                        if (!printWindow) {
                            alert("Por favor, habilite pop-ups para imprimir.");
                            return;
                        }
                        printWindow.document.write('<html><head><title>Cupom do Pedido</title>');
                        printWindow.document.write('<style> body { font-family: monospace; margin: 0; padding: 10px; width: 300px; font-size: 10pt; } h2, h3 { text-align: center; margin: 5px 0; } hr { border: none; border-top: 1px dashed black; margin: 5px 0; } table { width: 100%; border-collapse: collapse; margin-bottom: 5px;} td { padding: 1px 0; vertical-align: top;} .right { text-align: right; } p { margin: 2px 0; } .total { font-weight: bold; font-size: 11pt;} </style>');
                        printWindow.document.write('</head><body>');
                        printWindow.document.write('<h2>Ana Guimarães Doceria</h2>');
                        printWindow.document.write(`<p>Cliente: ${viewingOrder.clienteNome || 'N/A'}</p>`);
                        if (endereco !== 'Não informado') printWindow.document.write(`<p>Endereço: ${endereco}</p>`);
                        if (telefone) printWindow.document.write(`<p>Telefone: ${telefone}</p>`);
                        printWindow.document.write(`<p>Data: ${getJSDate(viewingOrder.createdAt)?.toLocaleString('pt-BR') || '-'}</p>`);
                        if (viewingOrder.dataEntrega) printWindow.document.write(`<p>Entrega: ${new Date(viewingOrder.dataEntrega + 'T03:00:00Z').toLocaleDateString('pt-BR')}</p>`);
                        printWindow.document.write('<hr>');
                        printWindow.document.write('<h3>Itens</h3>');
                        printWindow.document.write('<table>');
                        (viewingOrder.itens || []).forEach(item => {
                            printWindow.document.write(`<tr><td>${item.quantity || 1}x ${item.nome}</td><td class="right">R$ ${((item.preco || 0) * (item.quantity || 1)).toFixed(2)}</td></tr>`);
                        });
                        printWindow.document.write('</table>');
                        printWindow.document.write('<hr>');

                         if (viewingOrder.cupom?.valorDesconto > 0 || viewingOrder.desconto > 0) {
                            printWindow.document.write(`<p>Subtotal:<span style="float: right;">R$ ${subtotal.toFixed(2)}</span></p>`);
                             if (viewingOrder.cupom) {
                                printWindow.document.write(`<p>Desconto (${viewingOrder.cupom.codigo}):<span style="float: right;">- R$ ${viewingOrder.cupom.valorDesconto.toFixed(2)}</span></p>`);
                            } else {
                                printWindow.document.write(`<p>Desconto:<span style="float: right;">- R$ ${viewingOrder.desconto.toFixed(2)}</span></p>`);
                            }
                        }
                        
                        printWindow.document.write(`<p class="total">Total:<span style="float: right;">R$ ${(viewingOrder.total || 0).toFixed(2)}</span></p>`);
                        if(viewingOrder.formaPagamento) printWindow.document.write(`<p>Pagamento: ${viewingOrder.formaPagamento}</p>`);

                        if(viewingOrder.observacao) {
                            printWindow.document.write(`<hr><h3>Observações:</h3><p>${viewingOrder.observacao}</p>`);
                        }
                        printWindow.document.write('<hr><p style="text-align: center;">Obrigado!</p>');
                        printWindow.document.write('</body></html>');
                        printWindow.document.close();
                         // Adiciona um pequeno delay para garantir que o conteúdo foi escrito antes de imprimir
                        setTimeout(() => {
                           printWindow.focus(); // Necessário para alguns navegadores
                           printWindow.print();
                           // printWindow.close(); // Comentar se quiser manter a janela aberta para debug
                        }, 250);
                    };

                    return (
                        <div className="space-y-4 text-sm text-gray-700">
                            <div className="p-4 bg-gray-50 rounded-lg">
                                <h3 className="font-bold text-lg text-gray-800 mb-2">Informações do Cliente</h3>
                                <p><strong>Nome:</strong> {viewingOrder.clienteNome || 'N/A'}</p>
                                <p><strong>CPF:</strong> {cpfCliente || 'Não informado'}</p>
                                <p><strong>Endereço:</strong> {endereco}</p>
                                <p><strong>Telefone:</strong> {telefone || 'Não informado'}</p>
                            </div>

                            <div className="p-4 bg-gray-50 rounded-lg">
                                <h3 className="font-bold text-lg text-gray-800 mb-2">Informações do Pedido</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <p><strong>Status:</strong> <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusClass(viewingOrder.status)}`}>{viewingOrder.status}</span></p>
                                    <p><strong>Data do Pedido:</strong> {viewingOrder.createdAt ? getJSDate(viewingOrder.createdAt)?.toLocaleString('pt-BR') : '-'}</p>
                                    <p><strong>Origem:</strong> {viewingOrder.origem}</p>
                                    <p><strong>Pagamento:</strong> {viewingOrder.formaPagamento || 'Não informado'}</p>
                                    {viewingOrder.categoria && (<p><strong>Categoria:</strong> {viewingOrder.categoria}</p>)}
                                    {viewingOrder.dataEntrega && (<p><strong>Data de Entrega:</strong> {new Date(viewingOrder.dataEntrega + 'T03:00:00Z').toLocaleDateString('pt-BR')}</p>)}
                                </div>
                            </div>
                            
                             {viewingOrder.observacao && (
                                <div className="p-4 bg-yellow-50 rounded-lg">
                                    <h3 className="font-bold text-lg text-yellow-800 mb-2">Observações</h3>
                                    <p>{viewingOrder.observacao}</p>
                                </div>
                            )}

                            <div>
                                <h4 className="font-bold text-lg text-gray-800 mt-4 mb-2">Itens do Pedido:</h4>
                                <ul className="space-y-2">
                                    {(viewingOrder.itens || []).map((item, index) => (
                                        <li key={item.id || index} className="flex justify-between items-center p-2 bg-pink-50/50 rounded-md">
                                            <span>{item.quantity || 1}x {item.nome}</span>
                                            <span>R$ {((item.preco || 0) * (item.quantity || 1)).toFixed(2)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="text-right pt-4 border-t mt-4 space-y-1">
                                { (viewingOrder.cupom?.valorDesconto > 0 || viewingOrder.desconto > 0) && (
                                    <>
                                        <p className="text-sm text-gray-600">Subtotal: R$ {subtotal.toFixed(2)}</p>
                                        <p className="text-sm text-red-600">
                                            Desconto {viewingOrder.cupom ? `(${viewingOrder.cupom.codigo})` : ''}: 
                                            - R$ {(viewingOrder.cupom?.valorDesconto || viewingOrder.desconto || 0).toFixed(2)}
                                        </p>
                                    </>
                                )}
                                <p className="text-sm text-gray-600">Frete: R$ {frete.toFixed(2)}</p>
                                <p className="font-bold text-2xl text-pink-600">
                                    Total: R$ ${(viewingOrder.total || 0).toFixed(2)}
                                </p>
                           </div>

                            <div className="flex flex-wrap justify-end pt-4 mt-4 border-t gap-3">
                                 <Button 
                                    onClick={handlePrint}
                                    variant="secondary"
                                    size="sm"
                                >
                                    <Printer className="w-4 h-4" />
                                    Imprimir Cupom
                                </Button>
                                <Button
                                    onClick={handleSendToWhatsApp}
                                    disabled={!telefone}
                                    className="bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 disabled:from-gray-300 disabled:to-gray-400 disabled:shadow-none disabled:transform-none"
                                    size="sm"
                                >
                                    <MessageCircle className="w-4 h-4" />
                                    Enviar Resumo Cliente
                                </Button>
                                <Button
                                    onClick={() => setOrderToSendToDeliverer(viewingOrder)}
                                    disabled={!canSendToDeliverer(viewingOrder)}
                                    className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700"
                                    size="sm"
                                >
                                    <Truck className="w-4 h-4" />
                                    Enviar Endereço para Entregador
                                </Button>
                            </div>
                        </div>
                    );
                })()}
            </Modal>
            <DeliveryModal
                isOpen={!!orderToSendToDeliverer}
                order={orderToSendToDeliverer}
                clientes={data.clientes}
                fornecedores={data.fornecedores}
                onClose={() => setOrderToSendToDeliverer(null)}
            />
        </div>
    );
  }
  
  const EntreLojas = () => {
    const [transferencias, setTransferencias] = useState([]);
    const [activeTab, setActiveTab] = useState('todas');
    const [statusFilter, setStatusFilter] = useState('todos');
    const [origemFilter, setOrigemFilter] = useState('todos');
    const [destinoFilter, setDestinoFilter] = useState('todos');
    const [startDateFilter, setStartDateFilter] = useState('');
    const [endDateFilter, setEndDateFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [viewingTransfer, setViewingTransfer] = useState(null);
    const [editingTransfer, setEditingTransfer] = useState(null);
    const [isSavingTransfer, setIsSavingTransfer] = useState(false);
    const [formError, setFormError] = useState('');
    const [repasseConfigPercentual, setRepasseConfigPercentual] = useState(0);
    const [actionComment, setActionComment] = useState('');
    const [formData, setFormData] = useState({
      lojaOrigemId: '',
      lojaDestinoId: '',
      dataRemessa: new Date().toISOString().slice(0, 10),
      observacaoOrigem: '',
      itens: []
    });

    const userStoreIds = useMemo(() => {
      if (!user) return [];
      const stores = Array.isArray(user.lojaIds) && user.lojaIds.length ? user.lojaIds : (user.lojaId ? [user.lojaId] : []);
      return Array.from(new Set(stores.filter(Boolean)));
    }, [user]);

    const canAccessAllTransfers = user?.role === ROLE_OWNER;
    const allowedOriginStoreIds = useMemo(() => {
      if (!user) return [];
      if (user.role === ROLE_OWNER) return availableStores;
      if (user.role === ROLE_MANAGER) return userStoreIds;
      if (user.role === ROLE_ATTENDANT) return userStoreIds.slice(0, 1);
      return [];
    }, [availableStores, user, userStoreIds]);

    const canMarkAsPaid = user?.role === ROLE_OWNER || user?.role === ROLE_MANAGER;
    const canConfirmPaymentByRole = user?.role === ROLE_OWNER || user?.role === ROLE_MANAGER;
    const isEditingTransfer = !!editingTransfer?.id;
    const canChangeOriginStore = allowedOriginStoreIds.length > 1;

    const DEBUG_ENTRE_LOJAS = false;
    const entreLojasLog = (...args) => {
      if (DEBUG_ENTRE_LOJAS) console.log('[EntreLojas][DEBUG]', ...args);
    };

    const normalizeStoreId = (value) => String(value || '').trim();

    const allowedStoreIds = useMemo(() => Array.from(new Set(userStoreIds.map(normalizeStoreId).filter(Boolean))).slice(0, 10), [userStoreIds]);

    const selectedStoreIdForView = useMemo(() => {
      if (!currentStoreIdForDisplay || currentStoreIdForDisplay === STORE_ALL_KEY) return null;
      return normalizeStoreId(currentStoreIdForDisplay);
    }, [currentStoreIdForDisplay]);

    const getDefaultOriginStoreId = useCallback(() => {
      if (!allowedOriginStoreIds.length) return '';
      if (currentStoreIdForDisplay && currentStoreIdForDisplay !== STORE_ALL_KEY && allowedOriginStoreIds.includes(currentStoreIdForDisplay)) {
        return currentStoreIdForDisplay;
      }
      return allowedOriginStoreIds[0] || '';
    }, [allowedOriginStoreIds, currentStoreIdForDisplay]);

    useEffect(() => {
      if (!user) return undefined;
      const transfersRef = collection(db, 'transferenciasEntreLojas');

      if (canAccessAllTransfers) {
        const baseQuery = query(transfersRef, orderBy('dataCriacao', 'desc'), limit(250));
        return onSnapshot(baseQuery, (snapshot) => {
          const rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          setTransferencias(rows);
        }, (error) => {
          console.error('[EntreLojas] Erro ao carregar transferências:', error);
        });
      }

      if (!allowedStoreIds.length) {
        console.warn('[EntreLojas] Usuário sem lojas permitidas para Entre Lojas', { role: user?.role, userStoreIds });
        setTransferencias([]);
        return undefined;
      }

      entreLojasLog('Contexto de carregamento', {
        userProfileRole: user?.role,
        selectedStoreId,
        currentStoreIdForDisplay,
        selectedStoreIdForView,
        allowedStoreIds,
        allowedOriginStoreIds,
        availableStores: availableStores.map((storeId) => ({ id: storeId, nome: storeInfoMap[storeId]?.nome || storeId }))
      });
      const originQuery = query(transfersRef, where('lojaOrigemId', 'in', allowedStoreIds), limit(250));
      const destinationQuery = query(transfersRef, where('lojaDestinoId', 'in', allowedStoreIds), limit(250));

      const mergeTransfers = (originDocs, destinationDocs) => {
        const merged = new Map();
        [...originDocs, ...destinationDocs].forEach((docSnap) => {
          merged.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        });
        const sortedRows = Array.from(merged.values()).sort((a, b) => {
          const dateA = getJSDate(a.dataCriacao)?.getTime() || 0;
          const dateB = getJSDate(b.dataCriacao)?.getTime() || 0;
          return dateB - dateA;
        });
        const limitedRows = sortedRows.slice(0, 250);
        entreLojasLog('Merge de transferências', {
          origem: originDocs.length,
          destino: destinationDocs.length,
          totalMesclado: limitedRows.length,
          transferencias: limitedRows.map((item) => ({ id: item.id, numero: item.numero, lojaOrigemId: item.lojaOrigemId, lojaDestinoId: item.lojaDestinoId, status: item.status }))
        });
        setTransferencias(limitedRows);
      };

      let originDocs = [];
      let destinationDocs = [];

      const unsubscribeOrigin = onSnapshot(originQuery, (snapshot) => {
        originDocs = snapshot.docs;
        entreLojasLog('Resultado query origem', { quantidade: originDocs.length, ids: originDocs.map((docSnap) => docSnap.id) });
        mergeTransfers(originDocs, destinationDocs);
      }, (error) => {
        console.error('[EntreLojas] Erro ao carregar transferências por origem:', error);
      });

      const unsubscribeDestination = onSnapshot(destinationQuery, (snapshot) => {
        destinationDocs = snapshot.docs;
        entreLojasLog('Resultado query destino', { quantidade: destinationDocs.length, ids: destinationDocs.map((docSnap) => docSnap.id) });
        mergeTransfers(originDocs, destinationDocs);
      }, (error) => {
        console.error('[EntreLojas] Erro ao carregar transferências por destino:', error);
      });

      return () => {
        unsubscribeOrigin();
        unsubscribeDestination();
      };
    }, [allowedOriginStoreIds, allowedStoreIds, canAccessAllTransfers, currentStoreIdForDisplay, selectedStoreId, selectedStoreIdForView, user, userStoreIds]);

    const storesForSelect = useMemo(
      () => availableStores.map((storeId) => ({ id: storeId, nome: storeInfoMap[storeId]?.nome || storeId })),
      [availableStores, storeInfoMap]
    );

    const productOptions = useMemo(() => (data.produtos || []).map((item) => ({
      id: item.id,
      nome: item.nome || item.descricao || 'Produto sem nome',
      preco: Number(item.preco || item.precoVenda || item.valor || 0),
      custo: [item.custo, item.precoCusto, item.valorCusto, item.custoUnitario, item.precoCompra]
        .map((value) => Number(value))
        .find((value) => Number.isFinite(value) && value >= 0)
    })), [data.produtos]);

    useEffect(() => {
      if (!formData.lojaOrigemId) {
        setRepasseConfigPercentual(0);
        return;
      }
      const fetchRepasseConfig = async () => {
        try {
          const configSnap = await getDoc(getStoreConfigDocRef(formData.lojaOrigemId));
          const percentual = Number(configSnap.data()?.entreLojas?.percentualRepasse);
          setRepasseConfigPercentual(Number.isFinite(percentual) && percentual >= 0 ? percentual : 0);
        } catch (error) {
          console.error('[EntreLojas] Erro ao carregar percentual de repasse:', error);
          setRepasseConfigPercentual(0);
        }
      };
      fetchRepasseConfig();
    }, [formData.lojaOrigemId]);

    const computeTotals = useCallback((items = []) => {
      return items.reduce((acc, item) => {
        const quantidade = Number(item.quantidade) || 0;
        const valorUnitarioRepasse = Number(item.valorUnitarioRepasse) || 0;
        const valorUnitarioRevenda = Number(item.valorUnitarioRevenda) || 0;
        acc.quantidadeTotalItens += quantidade;
        acc.totalRepasse += quantidade * valorUnitarioRepasse;
        acc.totalRevenda += quantidade * valorUnitarioRevenda;
        return acc;
      }, { quantidadeTotalItens: 0, totalRepasse: 0, totalRevenda: 0 });
    }, []);

    const resetForm = () => {
      setFormError('');
      setEditingTransfer(null);
      setFormData({
        lojaOrigemId: getDefaultOriginStoreId(),
        lojaDestinoId: '',
        dataRemessa: new Date().toISOString().slice(0, 10),
        observacaoOrigem: '',
        itens: []
      });
    };

    useEffect(() => {
      if (!showModal || isEditingTransfer) return;
      setFormData((prev) => {
        if (prev.lojaOrigemId && allowedOriginStoreIds.includes(prev.lojaOrigemId)) return prev;
        return { ...prev, lojaOrigemId: getDefaultOriginStoreId() };
      });
    }, [allowedOriginStoreIds, getDefaultOriginStoreId, isEditingTransfer, showModal]);

    useEffect(() => {
      setFormData((prev) => {
        if (!prev.lojaOrigemId || !prev.lojaDestinoId) return prev;
        if (prev.lojaOrigemId !== prev.lojaDestinoId) return prev;
        return { ...prev, lojaDestinoId: '' };
      });
    }, [formData.lojaOrigemId]);

    const openNewTransferModal = () => {
      resetForm();
      setShowModal(true);
    };

    const formatMoney = (value) => `R$ ${(Number(value) || 0).toFixed(2)}`;
    const statusLabelMap = {
      rascunho: 'Rascunho',
      aguardando_conferencia: 'Aguardando conferência',
      conferencia_sem_divergencia: 'Conferida sem divergência',
      conferencia_com_divergencia: 'Conferida com divergência',
      pagamento_informado: 'Pagamento informado',
      pagamento_confirmado: 'Pagamento confirmado',
      pagamento_contestado: 'Pagamento contestado',
      cancelado: 'Cancelado'
    };
    const statusClassMap = {
      pagamento_confirmado: 'bg-green-100 text-green-700',
      pagamento_informado: 'bg-orange-100 text-orange-700',
    };

    const getStatusClassName = (status) => statusClassMap[status] || 'bg-pink-100 text-pink-700';

    const addItemToTransfer = () => {
      setFormData((prev) => ({
        ...prev,
        itens: [...prev.itens, { produtoId: '', produtoBusca: '', nome: '', quantidade: 1, valorUnitarioRepasse: '', valorUnitarioRevenda: 0, semCusto: false }]
      }));
    };

    const updateItemField = (index, field, value) => {
      setFormData((prev) => ({
        ...prev,
        itens: prev.itens.map((item, itemIndex) => {
          if (itemIndex !== index) return item;
          if (field === 'produtoId') {
            const selected = productOptions.find((option) => option.id === value);
            const custo = selected?.custo;
            const hasCusto = Number.isFinite(custo);
            const repasseCalculado = hasCusto ? Number((custo * (1 + (repasseConfigPercentual / 100))).toFixed(2)) : '';
            return {
              ...item,
              produtoId: value,
              produtoBusca: selected?.nome || '',
              nome: selected?.nome || '',
              valorUnitarioRepasse: repasseCalculado,
              valorUnitarioRevenda: item.valorUnitarioRevenda || (selected?.preco || 0),
              semCusto: Boolean(value) && !hasCusto
            };
          }
          return { ...item, [field]: value };
        })
      }));
    };

    const updateProductSearch = (index, value) => {
      const search = String(value || '');
      const selected = productOptions.find((option) => option.nome.toLowerCase() === search.toLowerCase());
      if (selected) {
        updateItemField(index, 'produtoId', selected.id);
        return;
      }

      setFormData((prev) => ({
        ...prev,
        itens: prev.itens.map((item, itemIndex) => (
          itemIndex === index
            ? { ...item, produtoBusca: search, produtoId: '', nome: '', valorUnitarioRepasse: '', semCusto: false }
            : item
        ))
      }));
    };

    const removeItem = (index) => {
      setFormData((prev) => ({ ...prev, itens: prev.itens.filter((_, itemIndex) => itemIndex !== index) }));
    };

    const validateTransfer = () => {
      if (!formData.lojaOrigemId || !formData.lojaDestinoId || !formData.itens.length) {
        return 'Informe loja origem, loja destino e pelo menos um item.';
      }
      if (formData.lojaOrigemId === formData.lojaDestinoId) {
        return 'A loja destino deve ser diferente da loja origem.';
      }
      if (!allowedOriginStoreIds.includes(formData.lojaOrigemId)) {
        return isEditingTransfer
          ? 'Você não pode editar remessa para essa loja de origem.'
          : 'Você não pode criar remessa para essa loja de origem.';
      }
      for (const item of formData.itens) {
        if (!item.produtoId) return 'Selecione um produto para todos os itens.';
        if (Number(item.quantidade) <= 0) return 'A quantidade deve ser maior que zero.';
        if (Number(item.valorUnitarioRepasse) < 0) return 'Valor unitário de repasse não pode ser negativo.';
        if (Number(item.valorUnitarioRevenda) < 0) return 'Valor unitário de revenda não pode ser negativo.';
      }
      return '';
    };

    const isTransferLockedForEdit = (transfer) => ['pagamento_informado', 'pagamento_confirmado', 'cancelado', 'cancelada'].includes(transfer?.status);

    const isOriginStoreAllowed = (transfer) => {
      if (!transfer) return false;
      if (user?.role === ROLE_OWNER) return true;
      const originId = normalizeStoreId(transfer.lojaOrigemId);
      return allowedStoreIds.includes(originId);
    };

    const canEditTransfer = (transfer) => {
      if (!user || !transfer) return false;
      if (isTransferLockedForEdit(transfer)) return false;
      if (user.role === ROLE_OWNER) return true;
      if (user.role === ROLE_MANAGER || user.role === ROLE_ATTENDANT) return isOriginStoreAllowed(transfer);
      return false;
    };

    const canDeleteTransfer = (transfer) => {
      if (!user || !transfer) return false;
      return transfer.status === 'aguardando_conferencia' && isOriginStoreAllowed(transfer);
    };

    const startEditingTransfer = (transfer) => {
      if (!canEditTransfer(transfer)) return;
      setFormError('');
      setEditingTransfer(transfer);
      setFormData({
        lojaOrigemId: transfer.lojaOrigemId || '',
        lojaDestinoId: transfer.lojaDestinoId || '',
        dataRemessa: transfer.dataRemessa || new Date().toISOString().slice(0, 10),
        observacaoOrigem: transfer.observacaoOrigem || '',
        itens: (transfer.itens || []).map((item) => ({
          produtoId: item.produtoId || '',
          produtoBusca: item.nome || '',
          nome: item.nome || '',
          quantidade: Number(item.quantidade) || 0,
          valorUnitarioRepasse: Number(item.valorUnitarioRepasse) || 0,
          valorUnitarioRevenda: Number(item.valorUnitarioRevenda) || 0,
          semCusto: false
        }))
      });
      setShowModal(true);
    };

    const saveTransfer = async (mode = 'rascunho') => {
      if (isEditingTransfer && (!editingTransfer || !canEditTransfer(editingTransfer))) {
        const blockedByStatus = isTransferLockedForEdit(editingTransfer);
        setFormError(blockedByStatus ? 'Remessa com pagamento confirmado não pode ser editada.' : 'Você não tem permissão para editar esta remessa.');
        return;
      }
      const validationError = validateTransfer();
      if (validationError) {
        setFormError(validationError);
        return;
      }
      setIsSavingTransfer(true);
      setFormError('');
      try {
        const totals = computeTotals(formData.itens);
        const itemsPayload = formData.itens.map((item) => {
          const quantidade = Number(item.quantidade) || 0;
          const valorUnitarioRepasse = Number(item.valorUnitarioRepasse) || 0;
          const valorUnitarioRevenda = Number(item.valorUnitarioRevenda) || 0;
          return {
            produtoId: item.produtoId,
            nome: item.nome,
            quantidade,
            valorUnitarioRepasse,
            valorUnitarioRevenda,
            totalRepasse: quantidade * valorUnitarioRepasse,
            totalRevenda: quantidade * valorUnitarioRevenda
          };
        });

        const origemNome = storeInfoMap[formData.lojaOrigemId]?.nome || formData.lojaOrigemId;
        const destinoNome = storeInfoMap[formData.lojaDestinoId]?.nome || formData.lojaDestinoId;
        const finalStatus = isEditingTransfer
          ? (mode === 'enviar' && editingTransfer?.status === 'rascunho' ? 'aguardando_conferencia' : (editingTransfer?.status || 'rascunho'))
          : (mode === 'enviar' ? 'aguardando_conferencia' : 'rascunho');
        const now = serverTimestamp();
        if (isEditingTransfer && editingTransfer?.id) {
          const transferRef = doc(db, 'transferenciasEntreLojas', editingTransfer.id);
          await updateDoc(transferRef, {
            lojaOrigemId: formData.lojaOrigemId,
            lojaOrigemNome: origemNome,
            lojaDestinoId: formData.lojaDestinoId,
            lojaDestinoNome: destinoNome,
            status: finalStatus,
            dataRemessa: formData.dataRemessa || null,
            dataEnvio: mode === 'enviar' && editingTransfer?.status === 'rascunho' ? now : (editingTransfer.dataEnvio || null),
            enviadoPorUid: mode === 'enviar' && editingTransfer?.status === 'rascunho' ? (user?.auth?.uid || '') : (editingTransfer.enviadoPorUid || null),
            enviadoPorNome: mode === 'enviar' && editingTransfer?.status === 'rascunho' ? (user?.name || user?.email || '') : (editingTransfer.enviadoPorNome || null),
            observacaoOrigem: formData.observacaoOrigem || '',
            totalRepasse: totals.totalRepasse,
            totalRevenda: totals.totalRevenda,
            quantidadeTotalItens: totals.quantidadeTotalItens,
            itens: itemsPayload,
            storeVisibility: Array.from(new Set([formData.lojaOrigemId, formData.lojaDestinoId])),
            historico: arrayUnion({
              acao: editingTransfer?.status === 'rascunho'
                ? (mode === 'enviar' ? 'enviado_para_conferencia' : 'rascunho_atualizado')
                : 'remessa_atualizada',
              status: finalStatus,
              data: Timestamp.now(),
              usuarioUid: user?.auth?.uid || '',
              usuarioNome: user?.name || user?.email || '',
              comentario: editingTransfer?.status === 'rascunho'
                ? (mode === 'enviar' ? 'Rascunho enviado para conferência' : 'Rascunho atualizado')
                : 'Remessa atualizada sem alteração automática de status'
            })
          });
        } else {
          await addDoc(collection(db, 'transferenciasEntreLojas'), {
            numero: Date.now(),
            lojaOrigemId: formData.lojaOrigemId,
            lojaOrigemNome: origemNome,
            lojaDestinoId: formData.lojaDestinoId,
            lojaDestinoNome: destinoNome,
            status: finalStatus,
            dataCriacao: now,
            dataRemessa: formData.dataRemessa || null,
            dataEnvio: mode === 'enviar' ? now : null,
            dataConferencia: null,
            dataPagamentoInformado: null,
            dataPagamentoConfirmado: null,
            criadoPorUid: user?.auth?.uid || '',
            criadoPorNome: user?.name || user?.email || '',
            enviadoPorUid: mode === 'enviar' ? (user?.auth?.uid || '') : null,
            enviadoPorNome: mode === 'enviar' ? (user?.name || user?.email || '') : null,
            conferidoPorUid: null,
            conferidoPorNome: null,
            pagamentoInformadoPorUid: null,
            pagamentoInformadoPorNome: null,
            pagamentoConfirmadoPorUid: null,
            pagamentoConfirmadoPorNome: null,
            observacaoOrigem: formData.observacaoOrigem || '',
            observacaoDestino: '',
            observacaoPagamento: '',
            formaPagamento: '',
            dataPagamento: null,
            totalRepasse: totals.totalRepasse,
            totalRevenda: totals.totalRevenda,
            quantidadeTotalItens: totals.quantidadeTotalItens,
            itens: itemsPayload,
            stockIntegration: { enabled: false, status: 'pendente' },
            storeVisibility: Array.from(new Set([formData.lojaOrigemId, formData.lojaDestinoId])),
            historico: [{
              acao: mode === 'enviar' ? 'remessa_enviada' : 'remessa_criada',
              status: finalStatus,
              data: Timestamp.now(),
              usuarioUid: user?.auth?.uid || '',
              usuarioNome: user?.name || user?.email || '',
              comentario: mode === 'enviar' ? 'Remessa enviada para conferência' : 'Remessa salva como rascunho'
            }]
          });
        }

        setShowModal(false);
        resetForm();
      } catch (error) {
        console.error('[EntreLojas] Erro ao salvar remessa:', error);
        setFormError(error?.message || 'Não foi possível salvar a remessa.');
      } finally {
        setIsSavingTransfer(false);
      }
    };

    const canActOnTransfer = (transfer, action) => {
      if (!user || !transfer) return false;
      if (action === 'editar_remessa') return canEditTransfer(transfer);
      if (action === 'excluir_remessa') return canDeleteTransfer(transfer);
      if (user.role === ROLE_OWNER) return true;
      const originAllowed = allowedStoreIds.includes(normalizeStoreId(transfer.lojaOrigemId));
      const destinationAllowed = allowedStoreIds.includes(normalizeStoreId(transfer.lojaDestinoId));
      if (action === 'conferir') return destinationAllowed;
      if (action === 'marcar_pago') return canMarkAsPaid && destinationAllowed;
      if (action === 'confirmar_pagamento') return canConfirmPaymentByRole && originAllowed;
      if (action === 'contestar_pagamento') return canConfirmPaymentByRole && originAllowed;
      return originAllowed || destinationAllowed;
    };

    const deleteTransfer = async (transfer) => {
      if (!canDeleteTransfer(transfer)) {
        alert('Você não tem permissão para excluir esta remessa.');
        return;
      }

      try {
        await deleteDoc(doc(db, 'transferenciasEntreLojas', transfer.id));
        if (viewingTransfer?.id === transfer.id) {
          setViewingTransfer(null);
        }
      } catch (error) {
        console.error('[EntreLojas] Erro ao excluir remessa:', error);
        alert(error?.message || 'Não foi possível excluir a remessa.');
      }
    };

    const confirmDeleteTransfer = (transfer) => {
      if (!canDeleteTransfer(transfer)) return;
      setConfirmDelete({
        isOpen: true,
        onConfirm: () => deleteTransfer(transfer)
      });
    };

    const patchTransfer = async (transfer, payload, historyEntry) => {
      const transferRef = doc(db, 'transferenciasEntreLojas', transfer.id);
      await updateDoc(transferRef, {
        ...payload,
        historico: arrayUnion({
          ...historyEntry,
          data: Timestamp.now(),
          usuarioUid: user?.auth?.uid || '',
          usuarioNome: user?.name || user?.email || ''
        })
      });
    };

    const handleTransferAction = async (transfer, action) => {
      try {
        if (action === 'conferir_sem_divergencia' && canActOnTransfer(transfer, 'conferir')) {
          await patchTransfer(transfer, {
            status: 'conferencia_sem_divergencia',
            dataConferencia: serverTimestamp(),
            conferidoPorUid: user?.auth?.uid || '',
            conferidoPorNome: user?.name || user?.email || '',
            observacaoDestino: actionComment || ''
          }, {
            acao: 'conferencia_sem_divergencia',
            status: 'conferencia_sem_divergencia',
            comentario: actionComment || 'Conferência sem divergência'
          });
        }
        if (action === 'conferir_com_divergencia' && canActOnTransfer(transfer, 'conferir')) {
          await patchTransfer(transfer, {
            status: 'conferencia_com_divergencia',
            dataConferencia: serverTimestamp(),
            conferidoPorUid: user?.auth?.uid || '',
            conferidoPorNome: user?.name || user?.email || '',
            observacaoDestino: actionComment || ''
          }, {
            acao: 'conferencia_com_divergencia',
            status: 'conferencia_com_divergencia',
            comentario: actionComment || 'Conferência com divergência'
          });
        }
        if (action === 'marcar_pago' && canActOnTransfer(transfer, 'marcar_pago')) {
          await patchTransfer(transfer, {
            status: 'pagamento_informado',
            dataPagamentoInformado: serverTimestamp(),
            pagamentoInformadoPorUid: user?.auth?.uid || '',
            pagamentoInformadoPorNome: user?.name || user?.email || '',
            observacaoPagamento: actionComment || ''
          }, {
            acao: 'pagamento_informado',
            status: 'pagamento_informado',
            comentario: actionComment || 'Pagamento informado pela loja destino'
          });
        }
        if (action === 'confirmar_pagamento' && canActOnTransfer(transfer, 'confirmar_pagamento')) {
          await patchTransfer(transfer, {
            status: 'pagamento_confirmado',
            dataPagamentoConfirmado: serverTimestamp(),
            pagamentoConfirmadoPorUid: user?.auth?.uid || '',
            pagamentoConfirmadoPorNome: user?.name || user?.email || '',
            observacaoPagamento: actionComment || transfer.observacaoPagamento || ''
          }, {
            acao: 'pagamento_confirmado',
            status: 'pagamento_confirmado',
            comentario: actionComment || 'Pagamento confirmado pela loja origem'
          });
        }
        if (action === 'contestar_pagamento' && canActOnTransfer(transfer, 'contestar_pagamento')) {
          await patchTransfer(transfer, {
            status: 'pagamento_contestado',
            observacaoPagamento: actionComment || transfer.observacaoPagamento || ''
          }, {
            acao: 'pagamento_contestado',
            status: 'pagamento_contestado',
            comentario: actionComment || 'Pagamento contestado pela loja origem'
          });
        }
        setActionComment('');
      } catch (error) {
        console.error('[EntreLojas] Erro ao executar ação:', error);
        alert(error?.message || 'Não foi possível executar a ação.');
      }
    };

    const canViewTransfer = useCallback((transfer) => {
      if (canAccessAllTransfers) return true;
      const originId = normalizeStoreId(transfer?.lojaOrigemId);
      const destinationId = normalizeStoreId(transfer?.lojaDestinoId);
      return allowedStoreIds.includes(originId) || allowedStoreIds.includes(destinationId);
    }, [allowedStoreIds, canAccessAllTransfers]);

    const matchesSelectedStoreView = useCallback((transfer) => {
      if (!selectedStoreIdForView) return true;
      const originId = normalizeStoreId(transfer?.lojaOrigemId);
      const destinationId = normalizeStoreId(transfer?.lojaDestinoId);
      return originId === selectedStoreIdForView || destinationId === selectedStoreIdForView;
    }, [selectedStoreIdForView]);

    const filteredTransfers = useMemo(() => {
      return (transferencias || []).filter((item) => {
        const originId = normalizeStoreId(item.lojaOrigemId);
        const destinationId = normalizeStoreId(item.lojaDestinoId);

        if (!canViewTransfer(item)) {
          entreLojasLog('Remessa removida por canViewTransfer', { id: item.id, originId, destinationId, allowedStoreIds });
          return false;
        }

        if (!matchesSelectedStoreView(item)) {
          entreLojasLog('Remessa removida por matchesSelectedStoreView', { id: item.id, originId, destinationId, selectedStoreIdForView });
          return false;
        }

        if (activeTab === 'enviadas' && !(originId && (canAccessAllTransfers || allowedStoreIds.includes(originId)))) return false;
        if (activeTab === 'recebidas' && !(destinationId && (canAccessAllTransfers || allowedStoreIds.includes(destinationId)))) return false;
        if (activeTab === 'aguardando_conferencia' && item.status !== 'aguardando_conferencia') return false;
        if (activeTab === 'aguardando_pagamento' && !['pagamento_informado', 'conferencia_com_divergencia', 'conferencia_sem_divergencia'].includes(item.status)) return false;
        if (statusFilter !== 'todos' && item.status !== statusFilter) return false;
        if (origemFilter !== 'todos' && item.lojaOrigemId !== origemFilter) return false;
        if (destinoFilter !== 'todos' && item.lojaDestinoId !== destinoFilter) return false;
        const createdAtDate = getJSDate(item.dataCriacao);
        if (startDateFilter && createdAtDate && createdAtDate < new Date(`${startDateFilter}T00:00:00`)) return false;
        if (endDateFilter && createdAtDate && createdAtDate > new Date(`${endDateFilter}T23:59:59`)) return false;
        return true;
      });
    }, [activeTab, allowedStoreIds, canAccessAllTransfers, canViewTransfer, destinoFilter, endDateFilter, matchesSelectedStoreView, origemFilter, selectedStoreIdForView, startDateFilter, statusFilter, transferencias]);

    const summary = useMemo(() => filteredTransfers.reduce((acc, item) => {
      acc.total += 1;
      acc.totalRepasse += Number(item.totalRepasse) || 0;
      acc.totalRevenda += Number(item.totalRevenda) || 0;
      if (item.status === 'aguardando_conferencia') acc.aguardandoConferencia += 1;
      if (item.status === 'pagamento_informado') acc.aguardandoConfirmacao += 1;
      return acc;
    }, { total: 0, totalRepasse: 0, totalRevenda: 0, aguardandoConferencia: 0, aguardandoConfirmacao: 0 }), [filteredTransfers]);

    const columns = [
      { header: 'Nº', render: (row) => <span className="font-semibold text-pink-600">#{row.numero || '-'}</span> },
      { header: 'Origem', render: (row) => row.lojaOrigemNome || row.lojaOrigemId || '-' },
      { header: 'Destino', render: (row) => row.lojaDestinoNome || row.lojaDestinoId || '-' },
      { header: 'Itens', key: 'quantidadeTotalItens' },
      { header: 'Repasse', render: (row) => <span className="font-semibold">{formatMoney(row.totalRepasse)}</span> },
      { header: 'Revenda', render: (row) => <span className="font-semibold">{formatMoney(row.totalRevenda)}</span> },
      { header: 'Status', render: (row) => <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusClassName(row.status)}`}>{statusLabelMap[row.status] || row.status}</span> },
      { header: 'Criada em', render: (row) => getJSDate(row.dataCriacao)?.toLocaleString('pt-BR') || '-' }
    ];

    const actions = [
      { icon: Eye, label: 'Visualizar', onClick: (row) => setViewingTransfer(row) },
      {
        icon: Edit,
        label: (row) => (row.status === 'rascunho' ? 'Editar rascunho' : 'Editar remessa'),
        onClick: (row) => startEditingTransfer(row),
        isVisible: (row) => canActOnTransfer(row, 'editar_remessa')
      },
      {
        icon: Trash2,
        label: 'Excluir remessa',
        onClick: (row) => confirmDeleteTransfer(row),
        isVisible: (row) => canActOnTransfer(row, 'excluir_remessa')
      }
    ];

    const transferTotals = computeTotals(formData.itens);

    return (
      <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Entre Lojas</h1>
            <p className="text-gray-600 mt-1">Controle de remessas e conferências entre unidades.</p>
          </div>
          <Button onClick={openNewTransferModal} className="w-full md:w-auto">
            <Plus className="w-4 h-4" /> Nova Remessa
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl p-4 shadow border border-gray-100"><p className="text-xs text-gray-500">Remessas</p><p className="text-xl font-bold">{summary.total}</p></div>
          <div className="bg-white rounded-xl p-4 shadow border border-gray-100"><p className="text-xs text-gray-500">Aguardando conferência</p><p className="text-xl font-bold">{summary.aguardandoConferencia}</p></div>
          <div className="bg-white rounded-xl p-4 shadow border border-gray-100"><p className="text-xs text-gray-500">Aguardando confirmação</p><p className="text-xl font-bold">{summary.aguardandoConfirmacao}</p></div>
          <div className="bg-white rounded-xl p-4 shadow border border-gray-100"><p className="text-xs text-gray-500">Total repasse</p><p className="text-xl font-bold">{formatMoney(summary.totalRepasse)}</p></div>
          <div className="bg-white rounded-xl p-4 shadow border border-gray-100"><p className="text-xs text-gray-500">Total revenda</p><p className="text-xl font-bold">{formatMoney(summary.totalRevenda)}</p></div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'todas', label: 'Todas' },
              { id: 'enviadas', label: 'Enviadas' },
              { id: 'recebidas', label: 'Recebidas' },
              { id: 'aguardando_conferencia', label: 'Aguardando Conferência' },
              { id: 'aguardando_pagamento', label: 'Aguardando Pagamento' },
              { id: 'historico', label: 'Histórico' }
            ].map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-3 py-2 text-sm rounded-lg ${activeTab === tab.id ? 'bg-pink-100 text-pink-700' : 'bg-gray-50 text-gray-600'}`}>{tab.label}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <Select value={origemFilter} onChange={(e) => setOrigemFilter(e.target.value)}>
              <option value="todos">Todas origens</option>
              {storesForSelect.map((store) => <option key={store.id} value={store.id}>{store.nome}</option>)}
            </Select>
            <Select value={destinoFilter} onChange={(e) => setDestinoFilter(e.target.value)}>
              <option value="todos">Todos destinos</option>
              {storesForSelect.map((store) => <option key={store.id} value={store.id}>{store.nome}</option>)}
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="todos">Todos status</option>
              {Object.keys(statusLabelMap).map((status) => <option key={status} value={status}>{statusLabelMap[status]}</option>)}
            </Select>
            <Input type="date" value={startDateFilter} onChange={(e) => setStartDateFilter(e.target.value)} />
            <Input type="date" value={endDateFilter} onChange={(e) => setEndDateFilter(e.target.value)} />
          </div>
        </div>

        <Table columns={columns} data={filteredTransfers} actions={actions} />

        <Modal
          isOpen={showModal}
          onClose={() => { setShowModal(false); resetForm(); }}
          title={isEditingTransfer ? 'Editar Remessa Entre Lojas' : 'Nova Remessa Entre Lojas'}
          size="xl"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Loja origem"
                value={formData.lojaOrigemId}
                disabled={!canChangeOriginStore}
                onChange={(e) => setFormData((prev) => ({ ...prev, lojaOrigemId: e.target.value }))}
              >
                <option value="">Selecione</option>
                {storesForSelect.filter((store) => allowedOriginStoreIds.includes(store.id)).map((store) => (
                  <option key={store.id} value={store.id}>{store.nome}</option>
                ))}
              </Select>
              <Select label="Loja destino" disabled={isEditingTransfer && editingTransfer?.status !== 'rascunho'} value={formData.lojaDestinoId} onChange={(e) => setFormData((prev) => ({ ...prev, lojaDestinoId: e.target.value }))}>
                <option value="">Selecione</option>
                {storesForSelect.filter((store) => store.id !== formData.lojaOrigemId).map((store) => (
                  <option key={store.id} value={store.id}>{store.nome}</option>
                ))}
              </Select>
              <Input label="Data da remessa" type="date" value={formData.dataRemessa} onChange={(e) => setFormData((prev) => ({ ...prev, dataRemessa: e.target.value }))} />
            </div>
            <Textarea label="Observação da origem" value={formData.observacaoOrigem} onChange={(e) => setFormData((prev) => ({ ...prev, observacaoOrigem: e.target.value }))} rows={3} />

            <div className="border rounded-xl p-4 space-y-3">
              <div className="flex items-center">
                <h3 className="font-semibold text-gray-800">Itens da remessa</h3>
              </div>
              {!formData.itens.length && <p className="text-sm text-gray-500">Nenhum item adicionado.</p>}
              {formData.itens.map((item, index) => {
                const totalRepasse = (Number(item.quantidade) || 0) * (Number(item.valorUnitarioRepasse) || 0);
                const totalRevenda = (Number(item.quantidade) || 0) * (Number(item.valorUnitarioRevenda) || 0);
                return (
                  <div key={`item-${index}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border rounded-lg p-3">
                    <div className="md:col-span-4">
                      <Input
                        label="Produto"
                        list={`produtos-remessa-${index}`}
                        placeholder="Buscar produto"
                        value={item.produtoBusca ?? item.nome ?? ''}
                        onChange={(e) => updateProductSearch(index, e.target.value)}
                      />
                      <datalist id={`produtos-remessa-${index}`}>
                        {productOptions.map((product) => <option key={product.id} value={product.nome} />)}
                      </datalist>
                    </div>
                    <div className="md:col-span-2"><Input label="Qtd." type="number" min="1" value={item.quantidade} onChange={(e) => updateItemField(index, 'quantidade', e.target.value)} /></div>
                    <div className="md:col-span-2"><Input label="Repasse (R$)" type="number" min="0" step="0.01" value={item.valorUnitarioRepasse} onChange={(e) => updateItemField(index, 'valorUnitarioRepasse', e.target.value)} /></div>
                    <div className="md:col-span-2"><Input label="Revenda (R$)" type="number" min="0" step="0.01" value={item.valorUnitarioRevenda} onChange={(e) => updateItemField(index, 'valorUnitarioRevenda', e.target.value)} /></div>
                    <div className="md:col-span-1 text-xs text-gray-700">
                      <p>Repasse</p>
                      <p className="font-semibold">{formatMoney(totalRepasse)}</p>
                      <p>Revenda</p>
                      <p className="font-semibold">{formatMoney(totalRevenda)}</p>
                    </div>
                    <div className="md:col-span-1"><Button size="sm" variant="danger" onClick={() => removeItem(index)}><Trash2 className="w-4 h-4" /></Button></div>
                    {item.semCusto && (
                      <div className="md:col-span-12 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                        Produto sem custo cadastrado.
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-pink-50 rounded-lg p-3 text-sm">
                <p>Quantidade total: <strong>{transferTotals.quantidadeTotalItens}</strong></p>
                <p>Total repasse: <strong>{formatMoney(transferTotals.totalRepasse)}</strong></p>
                <p>Total revenda: <strong>{formatMoney(transferTotals.totalRevenda)}</strong></p>
              </div>
            </div>

            {formError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{formError}</div>}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <Button size="sm" variant="secondary" onClick={addItemToTransfer} className="w-full sm:w-auto">
                <Plus className="w-4 h-4" /> Adicionar item
              </Button>
              <div className="flex flex-col sm:flex-row justify-end gap-2">
                <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancelar</Button>
                {(!isEditingTransfer || editingTransfer?.status === 'rascunho') && (
                  <>
                    <Button variant="outline" disabled={isSavingTransfer} onClick={() => saveTransfer('rascunho')}>Salvar Rascunho</Button>
                    <Button disabled={isSavingTransfer} onClick={() => saveTransfer('enviar')}>{isSavingTransfer ? 'Salvando...' : 'Enviar para Conferência'}</Button>
                  </>
                )}
                {isEditingTransfer && editingTransfer?.status !== 'rascunho' && (
                  <Button disabled={isSavingTransfer} onClick={() => saveTransfer('editar')}>{isSavingTransfer ? 'Salvando...' : 'Salvar Alterações'}</Button>
                )}
              </div>
            </div>
          </div>
        </Modal>

        <Modal isOpen={!!viewingTransfer} onClose={() => { setViewingTransfer(null); setActionComment(''); }} title="Detalhe da Remessa" size="xl">
          {viewingTransfer && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-gray-50 rounded-xl p-4 text-sm">
                <p><strong>Número:</strong> #{viewingTransfer.numero}</p>
                <p><strong>Origem:</strong> {viewingTransfer.lojaOrigemNome}</p>
                <p><strong>Destino:</strong> {viewingTransfer.lojaDestinoNome}</p>
                <p><strong>Status:</strong> {statusLabelMap[viewingTransfer.status] || viewingTransfer.status}</p>
                <p><strong>Total repasse:</strong> {formatMoney(viewingTransfer.totalRepasse)}</p>
                <p><strong>Total revenda:</strong> {formatMoney(viewingTransfer.totalRevenda)}</p>
              </div>
              <div className="bg-white border rounded-xl p-4 text-sm">
                <p className="font-semibold text-gray-800 mb-1">Observação da origem</p>
                <p className="text-gray-700 whitespace-pre-wrap">{viewingTransfer.observacaoOrigem || 'Sem observação registrada.'}</p>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">Itens</h3>
                {(viewingTransfer.itens || []).map((item, idx) => (
                  <div key={`${item.produtoId}-${idx}`} className="grid grid-cols-2 md:grid-cols-6 gap-2 bg-white border rounded-lg p-2 text-sm">
                    <p className="md:col-span-2"><strong>{item.nome}</strong></p>
                    <p>Qtd: {item.quantidade}</p>
                    <p>Repasse: {formatMoney(item.valorUnitarioRepasse)}</p>
                    <p>Revenda: {formatMoney(item.valorUnitarioRevenda)}</p>
                    <p>Total: {formatMoney(item.totalRepasse)}</p>
                  </div>
                ))}
              </div>
              <Textarea
                label="Comentário / observação para ação"
                value={actionComment}
                onChange={(e) => setActionComment(e.target.value)}
                rows={3}
                placeholder="Descreva divergências, detalhes do pagamento ou contestação."
              />
              <div className="flex flex-wrap gap-2">
                {['aguardando_conferencia'].includes(viewingTransfer.status) && canActOnTransfer(viewingTransfer, 'conferir') && (
                  <>
                    <Button variant="outline" onClick={() => handleTransferAction(viewingTransfer, 'conferir_sem_divergencia')}>Conferir sem divergência</Button>
                    <Button variant="secondary" onClick={() => handleTransferAction(viewingTransfer, 'conferir_com_divergencia')}>Conferir com divergência</Button>
                  </>
                )}
                {['conferencia_sem_divergencia', 'conferencia_com_divergencia', 'aguardando_conferencia'].includes(viewingTransfer.status) && canActOnTransfer(viewingTransfer, 'marcar_pago') && (
                  <Button onClick={() => handleTransferAction(viewingTransfer, 'marcar_pago')}>Marcar como pago</Button>
                )}
                {viewingTransfer.status === 'pagamento_informado' && canActOnTransfer(viewingTransfer, 'confirmar_pagamento') && (
                  <Button onClick={() => handleTransferAction(viewingTransfer, 'confirmar_pagamento')}>Confirmar pagamento</Button>
                )}
                {viewingTransfer.status === 'pagamento_informado' && canActOnTransfer(viewingTransfer, 'contestar_pagamento') && (
                  <Button variant="danger" onClick={() => handleTransferAction(viewingTransfer, 'contestar_pagamento')}>Contestar pagamento</Button>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">Histórico</h3>
                <div className="max-h-56 overflow-y-auto border rounded-lg p-2 space-y-2">
                  {(viewingTransfer.historico || []).length === 0 && <p className="text-sm text-gray-500">Sem histórico registrado.</p>}
                  {(viewingTransfer.historico || []).map((evt, idx) => (
                    <div key={`hist-${idx}`} className="text-sm bg-gray-50 rounded p-2">
                      <p className="font-medium">{evt.acao}</p>
                      <p className="text-xs text-gray-500">{getJSDate(evt.data)?.toLocaleString('pt-BR') || '-'}</p>
                      <p className="text-xs text-gray-500">{evt.usuarioNome || '-'}</p>
                      {evt.comentario && <p>{evt.comentario}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Modal>
      </div>
    );
  };

  const Agenda = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState(null);
    const [viewingOrder, setViewingOrder] = useState(null);
    const [orderToSendToDeliverer, setOrderToSendToDeliverer] = useState(null);

    const deliveryProviders = useMemo(
        () => (data.fornecedores || []).filter(f => (f.status || 'Ativo') !== 'Inativo'),
        [data.fornecedores]
    );

    const canSendToDeliverer = (order) => {
        if (!order) return false;
        const { enderecoTexto } = getOrderAddressDetails(order, data.clientes);
        if (!enderecoTexto || enderecoTexto === 'Não informado' || enderecoTexto === 'Retirar na Loja') {
            return false;
        }
        return deliveryProviders.length > 0;
    };
    
    const getStatusClass = (status) => { 
        switch (status) { 
            case 'Pendente': return 'bg-yellow-400'; 
            case 'Em Produção': return 'bg-blue-400'; 
            case 'Finalizado': return 'bg-green-400'; 
            case 'Cancelado': return 'bg-red-400'; 
            default: return 'bg-gray-400'; 
        } 
    };
    
    const getStatusClassText = (status) => { 
        switch (status) { 
            case 'Pendente': return 'bg-yellow-100 text-yellow-800'; 
            case 'Em Produção': return 'bg-blue-100 text-blue-800'; 
            case 'Finalizado': return 'bg-green-100 text-green-800'; 
            case 'Cancelado': return 'bg-red-100 text-red-800'; 
            default: return 'bg-gray-100 text-gray-800'; 
        } 
    };

    const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

    const changeMonth = (offset) => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const pedidosDoMes = (data.pedidos || []).filter(p => {
		const relevantDateStr = p.categoria === 'Festa' && p.dataEntrega ? p.dataEntrega : p.createdAt;
		let pedidoDate = getJSDate(relevantDateStr);
		if (p.categoria === 'Festa' && p.dataEntrega) {
			const [year, month, day] = p.dataEntrega.split('-');
			const y = parseInt(year, 10);
			const m = parseInt(month, 10) - 1;
			const d = parseInt(day, 10);
			pedidoDate = new Date(Date.UTC(y, m, d));
		  }
	  return pedidoDate && pedidoDate.getFullYear() === currentDate.getFullYear() &&
			 pedidoDate.getMonth() === currentDate.getMonth();
	});

    const clientes = data.clientes || [];
    const aniversariantesDoMes = useMemo(() => {
        return clientes.filter(cliente => {
            if (!cliente.aniversario || !/^\d{4}-\d{2}-\d{2}$/.test(cliente.aniversario)) return false;
            // Usa UTC para evitar problemas de fuso
            const [year, month, day] = cliente.aniversario.split('-');
            const birthMonth = parseInt(month, 10) - 1; // Mês é 0-indexado
            return birthMonth === currentDate.getMonth();
        });
    }, [data.clientes, currentDate]);

    return (
        <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
             <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Agenda</h1>
                <p className="text-gray-600 mt-1">Visualize entregas e aniversários</p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 md:p-6">
                <div className="flex justify-between items-center mb-4">
                    <Button variant="secondary" size="sm" onClick={() => changeMonth(-1)}><ChevronLeft/></Button>
                    <h2 className="text-xl font-bold text-gray-800 text-center">{currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
                    <Button variant="secondary" size="sm" onClick={() => changeMonth(1)}><ChevronRight/></Button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-sm font-semibold text-gray-600">
                    {daysOfWeek.map(day => <div key={day} className="py-2">{day}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-1 md:gap-2">
                    {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} className="border rounded-lg aspect-square"></div>)}
                    {Array.from({ length: daysInMonth }).map((_, day) => {
                        const dayNumber = day + 1;
                        
                        const today = new Date();
                        const isToday = today.getDate() === dayNumber && today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();
                        
                        const pedidosDoDia = pedidosDoMes.filter(p => {
                            const relevantDateStr = p.categoria === 'Festa' && p.dataEntrega ? p.dataEntrega : p.createdAt;
                            const pedidoDate = getJSDate(relevantDateStr);
                            if (!pedidoDate) return false;
                            // Se for Festa, compara com UTC
                             if (p.categoria === 'Festa' && p.dataEntrega) {
                                const [year, month, d] = p.dataEntrega.split('-');
                                return parseInt(d, 10) === dayNumber;
                             }
                             // Senão, compara data local
                            return pedidoDate.getDate() === dayNumber;
                        });

                        const aniversariantesDoDia = aniversariantesDoMes.filter(c => {

                             const [, , dayString] = c.aniversario.split('-');
                             return parseInt(dayString, 10) === dayNumber;
                        });

                        const hasEvents = pedidosDoDia.length > 0 || aniversariantesDoDia.length > 0;
                        
                        return (
                            <div key={dayNumber} onClick={() => hasEvents && setSelectedDay({ day: dayNumber, pedidos: pedidosDoDia, aniversariantes: aniversariantesDoDia })} className={`border rounded-lg p-1 md:p-2 aspect-square flex flex-col ${hasEvents ? 'cursor-pointer hover:bg-pink-50' : ''} transition-colors ${isToday ? 'bg-pink-100' : ''}`}>
                                <span className={`font-bold text-xs md:text-base ${isToday ? 'text-pink-600' : 'text-gray-800'}`}>{dayNumber}</span>
                                <div className="mt-1 space-y-1 overflow-y-auto text-[10px] md:text-xs">
                                    {pedidosDoDia.map(p => (
                                        <div key={p.id} className={`w-full text-white rounded px-1 truncate ${getStatusClass(p.status)}`} title={`${p.clienteNome} (${p.status})`}>
                                            {p.categoria === 'Festa' ? <Gift size={10} className="inline mr-1"/> : <ShoppingCart size={10} className="inline mr-1"/>}
                                            {p.clienteNome}
                                        </div>
                                    ))}
                                    {aniversariantesDoDia.map(c => (
                                        <div key={c.id} className="w-full bg-yellow-300 text-yellow-800 rounded px-1 truncate flex items-center gap-1" title={`${c.nome} (Aniversário)`}>
                                            <Cake size={10} />
                                            {c.nome}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            
            <Modal isOpen={!!selectedDay} onClose={() => setSelectedDay(null)} title={`Eventos do dia ${selectedDay?.day}`}>
                {selectedDay && (
                    <div className="space-y-4">
                        {selectedDay.pedidos.length > 0 && (
                            <div>
                                <h3 className="font-bold text-lg mb-2 text-gray-700">Pedidos ({selectedDay.pedidos.length})</h3>
                                <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                                {selectedDay.pedidos.map(p => (
                                    <div key={p.id} onClick={() => { setSelectedDay(null); setViewingOrder(p); }} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer flex justify-between items-center">
                                        <div>
                                            <p className="font-bold flex items-center gap-1">
                                                {p.categoria === 'Festa' ? <Gift size={14} className="text-purple-500"/> : <ShoppingCart size={14} className="text-blue-500"/>}
                                                {p.clienteNome}
                                            </p>
                                            <p className="text-sm text-gray-600">Total: R$ {p.total.toFixed(2)}</p>
                                        </div>
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusClassText(p.status)}`}>{p.status}</span>
                                    </div>
                                ))}
                                </div>
                            </div>
                        )}
                        {selectedDay.aniversariantes.length > 0 && (
                             <div>
                                <h3 className="font-bold text-lg mb-2 text-gray-700">Aniversariantes ({selectedDay.aniversariantes.length})</h3>
                                 <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                                {selectedDay.aniversariantes.map(c => (
                                    <div key={c.id} className="p-3 bg-yellow-50 rounded-lg flex items-center gap-3">
                                        <Cake className="w-5 h-5 text-yellow-600" />
                                        <p className="font-semibold text-yellow-800">{c.nome}</p>
                                    </div>
                                ))}
                                </div>
                            </div>
                        )}
                        {selectedDay.pedidos.length === 0 && selectedDay.aniversariantes.length === 0 && <p>Nenhum evento para este dia.</p>}
                    </div>
                )}
            </Modal>
             {/* Modal de Detalhes do Pedido (igual ao do componente Pedidos) */}
             <Modal isOpen={!!viewingOrder} onClose={() => setViewingOrder(null)} title="Detalhes do Pedido" size="lg">
                 {/* Reutiliza a mesma lógica de exibição do modal de detalhes */}
                 {viewingOrder && (() => {
                    const cliente = data.clientes.find(c => c.id === viewingOrder.clienteId);
                    const endereco = viewingOrder.clienteEndereco || cliente?.enderecos?.[0] || 'Não informado';
                    const telefone = viewingOrder.telefone || cliente?.telefone || '';
                    const handleSendToWhatsApp = () => { /* ... (código igual ao do Pedidos.js) ... */ };
                    const handlePrint = () => { /* ... (código igual ao do Pedidos.js) ... */ };

                    return ( 
                         <div className="space-y-4 text-sm text-gray-700">
                            {/* ... (Conteúdo idêntico ao modal do Pedidos.js) ... */}
                            <div className="p-4 bg-gray-50 rounded-lg">
                                <h3 className="font-bold text-lg text-gray-800 mb-2">Informações do Cliente</h3>
                                <p><strong>Nome:</strong> {viewingOrder.clienteNome || 'N/A'}</p>
                                <p><strong>Endereço:</strong> {endereco}</p>
                                <p><strong>Telefone:</strong> {telefone || 'Não informado'}</p>
                            </div>
                            {/* ... (resto do conteúdo) ... */}
                             <div className="flex flex-wrap justify-end pt-4 mt-4 border-t gap-3">
                                 <Button 
                                    onClick={handlePrint}
                                    variant="secondary"
                                    size="sm"
                                >
                                    <Printer className="w-4 h-4" />
                                    Imprimir Cupom
                                </Button>
                        <Button
                    onClick={handleSendToWhatsApp}
                    disabled={!telefone}
                    className="bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 disabled:from-gray-300 disabled:to-gray-400 disabled:shadow-none disabled:transform-none"
                    size="sm"
                >
                    <MessageCircle className="w-4 h-4" />
                    Enviar Resumo Cliente
                </Button>
                <Button
                    onClick={() => setOrderToSendToDeliverer(viewingOrder)}
                    disabled={!canSendToDeliverer(viewingOrder)}
                    className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700"
                    size="sm"
                >
                    <Truck className="w-4 h-4" />
                    Enviar Endereço para Entregador
                </Button>
              </div>
            </div>
         );
      })()}
    </Modal>
    <DeliveryModal
        isOpen={!!orderToSendToDeliverer}
        order={orderToSendToDeliverer}
        clientes={data.clientes}
        fornecedores={data.fornecedores}
        onClose={() => setOrderToSendToDeliverer(null)}
    />
        </div>
    );
  };


  const NotaFiscal = ({
    data,
    addItem,
    updateItem,
    deleteItem,
    setConfirmDelete,
    effectiveStoreId,
    selectedStoreId,
    storeInfoMap,
    currentUser
  }) => {
    const [activeTab, setActiveTab] = usePersistentState('nota_fiscal_activeTab', 'emitir');
    const [orderSearch, setOrderSearch] = usePersistentState('nota_fiscal_orderSearch', '');
    const [orderFilters, setOrderFilters] = useState(() => ({
      status: 'all',
      ...getCurrentMonthDateRange()
    }));
    const [invoiceFilters, setInvoiceFilters] = useState(() => ({
      search: '',
      status: 'all',
      issuerDocument: '',
      minValue: '',
      maxValue: '',
      key: '',
      number: '',
      series: '',
      orderId: '',
      customerDocument: '',
      customerName: '',
      protocol: '',
      paymentMethod: '',
      reason: '',
      ...getCurrentMonthDateRange()
    }));
    const [showAdvancedInvoiceFilters, setShowAdvancedInvoiceFilters] = useState(false);
    const [modelOverride, setModelOverride] = usePersistentState('nota_fiscal_modelOverride', '');
    const [operationCfop, setOperationCfop] = usePersistentState('nota_fiscal_operationCfop', DEFAULT_CFOP_OPERATION);
    const [busyOrderId, setBusyOrderId] = useState('');
    const [message, setMessage] = useState(null);
    const [validationByOrder, setValidationByOrder] = useState({});
    const [showProductModal, setShowProductModal] = useState(false);
    const [editingFiscalProduct, setEditingFiscalProduct] = useState(null);
    const [productCorrectionOrderId, setProductCorrectionOrderId] = useState('');
    const [orderToIssue, setOrderToIssue] = useState(null);
    const [issueAdditionalInfo, setIssueAdditionalInfo] = useState('');
    const [issueError, setIssueError] = useState('');
    const [invoiceToCancel, setInvoiceToCancel] = useState(null);
    const [invoiceToView, setInvoiceToView] = useState(null);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelError, setCancelError] = useState('');
    const [orderToEditBeforeInvoice, setOrderToEditBeforeInvoice] = useState(null);
    const [orderEditProductSearch, setOrderEditProductSearch] = useState('');
    const [orderEditSaving, setOrderEditSaving] = useState(false);
    const [orderEditError, setOrderEditError] = useState('');
    const [orderEditForm, setOrderEditForm] = useState({
      clienteId: '',
      clienteNome: '',
      telefone: '',
      clienteEndereco: '',
      formaPagamento: DEFAULT_ORDER_PAYMENT_METHOD,
      observacao: '',
      itens: [],
      desconto: 0,
      valorFrete: 0,
      subtotal: 0,
      total: 0
    });
    const [productForm, setProductForm] = useState({
      productId: '',
      code: '',
      description: '',
      ncm: DEFAULT_NCM_PRODUCT,
      cfopNfe: DEFAULT_CFOP_OPERATION,
      cfopNfce: DEFAULT_CFOP_OPERATION,
      unit: 'un',
      origin: 0,
      csosn: '102',
      pisCst: '49',
      cofinsCst: '49',
      cest: '',
      cBenef: ''
    });
    const [selectedFiscalProductIds, setSelectedFiscalProductIds] = useState([]);
    const [fiscalProductSearchTerm, setFiscalProductSearchTerm] = useState('');
    const [fiscalProductConflictMode, setFiscalProductConflictMode] = useState('fill-empty');
    const [savingFiscalProducts, setSavingFiscalProducts] = useState(false);
    const [issuerForm, setIssuerForm] = useState({
      cnpj: '37185245000140',
      legalName: 'ANA GUIMARAES DOCERIA LTDA',
      tradeName: 'ANA GUIMARAES DOCERIA',
      stateRegistration: '108911454',
      taxRegime: 1,
      address: {
        street: 'AV COMERCIAL',
        number: '441',
        district: 'JD NOVA ESPERANCA',
        city: 'Goiania',
        cityCode: '5208707',
        state: 'GO',
        zip: '74465120',
        phone: '62993398602'
      }
    });
    const [settingsForm, setSettingsForm] = useState({
      environment: 'homologation',
      nfeSeries: 1,
      nfceSeries: 1,
      operationNature: 'Venda de producao do estabelecimento',
      defaultPaymentMethodCode: '99',
      defaultPresence: 2,
      serviceUrl: ''
    });
    const [configLoading, setConfigLoading] = useState(false);
    const [configSaving, setConfigSaving] = useState(false);
    const [certificateInfo, setCertificateInfo] = useState(null);
    const [certificateUploading, setCertificateUploading] = useState(false);
    const [platformService, setPlatformService] = useState(null);
    const [certificateForm, setCertificateForm] = useState({
      file: null,
      password: '',
      cscId: '',
      csc: ''
    });
    const isReadOnly = currentUser?.role === ROLE_ACCOUNTANT;
    const isPlatformAdmin = currentUser?.role === ROLE_OWNER && currentUser?.canAccessAllStores;
    const canViewFullFiscalDocument = [ROLE_OWNER, ROLE_MANAGER, ROLE_ACCOUNTANT].includes(currentUser?.role);

    const storeName = effectiveStoreId
      ? (storeInfoMap[effectiveStoreId]?.nome || effectiveStoreId)
      : (selectedStoreId === STORE_ALL_KEY ? 'Todas as lojas' : 'Nenhuma loja selecionada');

    const invoices = data.invoices || [];
    const fiscalProducts = data.fiscalProducts || [];
    const storeProducts = data.produtos || [];
    const orders = data.pedidos || [];
    const fiscalProductsById = useMemo(() => {
      const map = new Map();
      fiscalProducts.forEach((item) => {
        if (item.id) map.set(String(item.id), item);
        if (item.productId) map.set(String(item.productId), item);
      });
      return map;
    }, [fiscalProducts]);
    const selectedFiscalProductIdSet = useMemo(() => new Set(selectedFiscalProductIds), [selectedFiscalProductIds]);
    const filteredFiscalProductOptions = useMemo(() => {
      const term = normalizeSearchText(fiscalProductSearchTerm);
      return storeProducts
        .filter((produto) => {
          if (!produto?.id) return false;
          if (!term) return true;
          return [
            produto.nome,
            produto.codigo,
            produto.categoria,
            produto.categoriaPrincipal,
            produto.id
          ].some((value) => normalizeSearchText(value).includes(term));
        })
        .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
    }, [storeProducts, fiscalProductSearchTerm]);
    const selectedExistingFiscalProductCount = useMemo(() => (
      selectedFiscalProductIds.filter((id) => fiscalProductsById.has(String(id))).length
    ), [selectedFiscalProductIds, fiscalProductsById]);
    const hasMultipleFiscalProductsSelected = selectedFiscalProductIds.length > 1 && !editingFiscalProduct;
    const orderEditFilteredProducts = useMemo(() => {
      const term = normalizeSearchText(orderEditProductSearch);
      return storeProducts
        .filter((produto) => {
          if (!produto?.id) return false;
          if (!term) return true;
          return [
            produto.nome,
            produto.codigo,
            produto.descricao,
            produto.categoria,
            produto.subcategoria,
            produto.id
          ].some((value) => normalizeSearchText(value).includes(term));
        })
        .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
    }, [storeProducts, orderEditProductSearch]);

    const ordersById = useMemo(() => {
      const map = new Map();
      orders.forEach((order) => {
        if (order.id) map.set(order.id, order);
      });
      return map;
    }, [orders]);

    const invoicesByOrderId = useMemo(() => {
      const map = new Map();
      invoices.forEach((invoice) => {
        if (!invoice.orderId) return;
        const current = map.get(invoice.orderId);
        const currentDate = getJSDate(current?.createdAt)?.getTime() || 0;
        const nextDate = getJSDate(invoice.createdAt)?.getTime() || 0;
        if (!current || nextDate >= currentDate) map.set(invoice.orderId, invoice);
      });
      return map;
    }, [invoices]);

    const invoiceStatusFilters = [
      { value: 'all', label: 'Todos os status' },
      { value: 'authorized', label: 'Autorizada' },
      { value: 'rejected', label: 'Rejeitada' },
      { value: 'pending', label: 'Pendente' },
      { value: 'cancelled', label: 'Cancelada' },
      { value: 'inutilized', label: 'Inutilizada' }
    ];

    const statusLabel = {
      validating: 'Validando',
      authorized: 'Autorizada',
      rejected: 'Rejeitada',
      cancelled: 'Cancelada',
      denied: 'Denegada',
      pending: 'Pendente',
      inutilized: 'Inutilizada',
      pending_return: 'Retorno pendente'
    };

    const statusClass = {
      validating: 'bg-blue-100 text-blue-800',
      authorized: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      cancelled: 'bg-red-50 text-red-700',
      denied: 'bg-orange-100 text-orange-800',
      pending: 'bg-yellow-100 text-yellow-800',
      inutilized: 'bg-gray-100 text-gray-700',
      pending_return: 'bg-yellow-100 text-yellow-800'
    };

    const formatDateTime = (value) => {
      const date = getJSDate(value);
      return date ? date.toLocaleString('pt-BR') : '-';
    };

    const setInvoiceFilter = (field, value) => {
      setInvoiceFilters((prev) => ({ ...prev, [field]: value }));
    };

    const setOrderFilter = (field, value) => {
      setOrderFilters((prev) => ({ ...prev, [field]: value }));
    };

    const resetOrderFiltersToCurrentMonth = () => {
      setOrderSearch('');
      setOrderFilters({
        status: 'all',
        ...getCurrentMonthDateRange()
      });
    };

    const resetInvoiceFiltersToCurrentMonth = () => {
      setInvoiceFilters({
        search: '',
        status: 'all',
        issuerDocument: '',
        minValue: '',
        maxValue: '',
        key: '',
        number: '',
        series: '',
        orderId: '',
        customerDocument: '',
        customerName: '',
        protocol: '',
        paymentMethod: '',
        reason: '',
        ...getCurrentMonthDateRange()
      });
    };

    const getInvoiceOrder = useCallback((invoice) => ordersById.get(invoice?.orderId) || null, [ordersById]);

    const getInvoiceCustomerName = useCallback((invoice) => {
      const order = getInvoiceOrder(invoice);
      return invoice?.customerName
        || invoice?.clienteNome
        || invoice?.customer?.name
        || invoice?.customer?.nome
        || order?.clienteNome
        || order?.customer?.name
        || order?.cliente?.nome
        || '-';
    }, [getInvoiceOrder]);

    const getInvoiceCustomerDocument = useCallback((invoice) => {
      const order = getInvoiceOrder(invoice);
      return invoice?.customerDocument
        || invoice?.customer?.document
        || invoice?.customer?.cpf
        || invoice?.customer?.cnpj
        || order?.clienteDocumento
        || order?.cpf
        || order?.documento
        || order?.customer?.document
        || order?.customer?.cpf
        || order?.fiscal?.customerDocument
        || '';
    }, [getInvoiceOrder]);

    const getInvoiceIssuerDocument = useCallback((invoice) => (
      invoice?.issuerDocument
      || invoice?.issuer?.cnpj
      || invoice?.serviceResult?.issuer?.cnpj
      || issuerForm.cnpj
      || ''
    ), [issuerForm.cnpj]);

    const getInvoiceValue = useCallback((invoice) => {
      const order = getInvoiceOrder(invoice);
      return Number(
        invoice?.total
        ?? invoice?.valor
        ?? invoice?.totals?.invoice
        ?? invoice?.serviceResult?.totals?.invoice
        ?? order?.total
        ?? order?.valorTotal
        ?? 0
      ) || 0;
    }, [getInvoiceOrder]);

    const getInvoicePaymentMethod = useCallback((invoice) => {
      const order = getInvoiceOrder(invoice);
      const method = invoice?.paymentMethod
        || invoice?.payment?.method
        || invoice?.serviceResult?.payment?.method
        || order?.formaPagamento
        || order?.paymentMethod
        || '-';
      const code = invoice?.paymentMethodCode || invoice?.payment?.methodCode || invoice?.serviceResult?.payment?.methodCode || '';
      return code ? `${method} (${code})` : method;
    }, [getInvoiceOrder]);

    const getInvoicePaymentCode = useCallback((invoice) => (
      invoice?.paymentMethodCode
      || invoice?.payment?.methodCode
      || invoice?.serviceResult?.payment?.methodCode
      || ''
    ), []);

    const getInvoiceItems = useCallback((invoice) => {
      const order = getInvoiceOrder(invoice);
      const rawItems = invoice?.items || invoice?.serviceResult?.items || order?.itens || order?.items || [];
      return Array.isArray(rawItems) ? rawItems : [];
    }, [getInvoiceOrder]);

    const getInvoiceDiscount = useCallback((invoice) => {
      const order = getInvoiceOrder(invoice);
      return Number(invoice?.discount ?? invoice?.desconto ?? order?.desconto ?? order?.cupom?.valorDesconto ?? 0) || 0;
    }, [getInvoiceOrder]);

    const getInvoiceFreight = useCallback((invoice) => {
      const order = getInvoiceOrder(invoice);
      return Number(invoice?.freight ?? invoice?.frete ?? order?.frete ?? order?.taxaEntrega ?? 0) || 0;
    }, [getInvoiceOrder]);

    const getInvoiceChange = useCallback((invoice) => {
      const order = getInvoiceOrder(invoice);
      return Number(invoice?.change ?? invoice?.troco ?? order?.troco ?? 0) || 0;
    }, [getInvoiceOrder]);

    const getInvoicePaidAmount = useCallback((invoice) => {
      const order = getInvoiceOrder(invoice);
      return Number(invoice?.paidAmount ?? invoice?.payment?.amount ?? order?.valorPago ?? getInvoiceValue(invoice)) || 0;
    }, [getInvoiceOrder, getInvoiceValue]);

    const getOrderCustomerDocument = useCallback((order) => (
      order?.clienteDocumento
      || order?.cpf
      || order?.documento
      || order?.customer?.document
      || order?.customer?.cpf
      || order?.customer?.cnpj
      || order?.fiscal?.customerDocument
      || ''
    ), []);

    const getOrderValue = useCallback((order) => Number(order?.total ?? order?.valorTotal ?? order?.subtotal ?? 0) || 0, []);

    const dateSearchValues = useCallback((value) => {
      const date = getJSDate(value);
      if (!date) return [];
      return [
        date.toLocaleDateString('pt-BR'),
        date.toLocaleString('pt-BR'),
        toDateInputValue(date)
      ];
    }, []);

    const fiscalAddressText = (address = {}) => {
      if (!address || typeof address !== 'object') return '-';
      return [
        [address.street || address.logradouro, address.number || address.numero].filter(Boolean).join(', '),
        address.district || address.bairro,
        address.zip || address.cep
      ].filter(Boolean).join(' - ') || '-';
    };

    const fiscalCityText = (address = {}) => [address.city || address.cidade, address.state || address.uf].filter(Boolean).join('/') || '-';

    const getOrderCustomerAddress = (invoice) => {
      const order = getInvoiceOrder(invoice);
      return invoice?.customer?.address
        || order?.customer?.address
        || order?.fiscal?.customerAddress
        || order?.clienteEndereco
        || order?.enderecoEntrega
        || {};
    };

    const fiscalReturnReason = useCallback((invoice) => {
      if (!invoice) return '';
      const directReason = [
        invoice.xMotivo,
        invoice.serviceResult?.xMotivo,
        invoice.error,
        invoice.artifactError
      ].find((value) => String(value || '').trim());
      if (directReason) return String(directReason).trim();
      if (Array.isArray(invoice.errors) && invoice.errors.length > 0) return invoice.errors.join(' ');
      if (Array.isArray(invoice.serviceResult?.errors) && invoice.serviceResult.errors.length > 0) return invoice.serviceResult.errors.join(' ');
      return '';
    }, []);

    const matchesInvoiceStatusFilter = useCallback((invoice) => {
      const status = invoice?.status || '';
      if (invoiceFilters.status === 'all') return true;
      if (invoiceFilters.status === 'rejected') return ['rejected', 'denied'].includes(status);
      if (invoiceFilters.status === 'pending') return ['validating', 'pending', 'pending_return'].includes(status);
      if (invoiceFilters.status === 'inutilized') return ['inutilized', 'unused', 'voided'].includes(status);
      return status === invoiceFilters.status;
    }, [invoiceFilters.status]);

    const matchesOrderInvoiceStatusFilter = useCallback((order) => {
      if (orderFilters.status === 'all') return true;
      const invoice = invoicesByOrderId.get(order?.id);
      const status = invoice?.status || '';
      if (orderFilters.status === 'pending') return !invoice || ['validating', 'pending', 'pending_return'].includes(status);
      if (orderFilters.status === 'rejected') return ['rejected', 'denied'].includes(status);
      if (orderFilters.status === 'inutilized') return ['inutilized', 'unused', 'voided'].includes(status);
      return status === orderFilters.status;
    }, [invoicesByOrderId, orderFilters.status]);

    const matchesInvoiceFilterValue = (value, filterValue) => {
      const filterText = normalizeSearchText(filterValue);
      if (!filterText) return true;
      const candidateText = normalizeSearchText(value);
      const filterDigits = onlyDigitsText(filterValue);
      const candidateDigits = onlyDigitsText(value);
      return candidateText.includes(filterText) || (filterDigits && candidateDigits.includes(filterDigits));
    };

    const filteredInvoices = useMemo(() => {
      const term = normalizeSearchText(invoiceFilters.search);
      const termDigits = onlyDigitsText(invoiceFilters.search);
      const minValue = invoiceFilters.minValue === '' ? null : Number(invoiceFilters.minValue);
      const maxValue = invoiceFilters.maxValue === '' ? null : Number(invoiceFilters.maxValue);
      return invoices
        .filter((invoice) => isDateInRange(invoice.issuedAt || invoice.createdAt, invoiceFilters.start, invoiceFilters.end))
        .filter(matchesInvoiceStatusFilter)
        .filter((invoice) => {
          const value = getInvoiceValue(invoice);
          if (minValue !== null && Number.isFinite(minValue) && value < minValue) return false;
          if (maxValue !== null && Number.isFinite(maxValue) && value > maxValue) return false;
          return true;
        })
        .filter((invoice) => {
          const reason = fiscalReturnReason(invoice);
          if (!matchesInvoiceFilterValue(getInvoiceIssuerDocument(invoice), invoiceFilters.issuerDocument)) return false;
          if (!matchesInvoiceFilterValue(invoice.key, invoiceFilters.key)) return false;
          if (!matchesInvoiceFilterValue(formatFiscalNumber(invoice.number), invoiceFilters.number) && !matchesInvoiceFilterValue(invoice.number, invoiceFilters.number)) return false;
          if (!matchesInvoiceFilterValue(formatFiscalSeries(invoice.series), invoiceFilters.series) && !matchesInvoiceFilterValue(invoice.series, invoiceFilters.series)) return false;
          if (!matchesInvoiceFilterValue(invoice.orderId, invoiceFilters.orderId)) return false;
          if (!matchesInvoiceFilterValue(getInvoiceCustomerDocument(invoice), invoiceFilters.customerDocument)) return false;
          if (!matchesInvoiceFilterValue(getInvoiceCustomerName(invoice), invoiceFilters.customerName)) return false;
          if (!matchesInvoiceFilterValue(invoice.protocol, invoiceFilters.protocol)) return false;
          if (!matchesInvoiceFilterValue(getInvoicePaymentMethod(invoice), invoiceFilters.paymentMethod)) return false;
          if (!matchesInvoiceFilterValue(reason, invoiceFilters.reason)) return false;
          if (!term && !termDigits) return true;
          const order = getInvoiceOrder(invoice);
          const candidates = [
            invoice.id,
            invoice.orderId,
            invoice.key,
            invoice.number,
            formatFiscalNumber(invoice.number),
            invoice.series,
            formatFiscalSeries(invoice.series),
            invoice.model,
            invoice.protocol,
            getInvoiceIssuerDocument(invoice),
            getInvoiceCustomerDocument(invoice),
            getInvoiceCustomerName(invoice),
            getInvoicePaymentMethod(invoice),
            reason,
            getInvoiceValue(invoice),
            order?.id,
            order?.clienteNome,
            order?.codigo,
            order?.codigoPedido,
            order?.numeroPedido
          ];
          return candidates.some((value) => {
            const text = normalizeSearchText(value);
            const digits = onlyDigitsText(value);
            return (term && text.includes(term)) || (termDigits && digits.includes(termDigits));
          });
        })
        .sort((a, b) => (getJSDate(b.issuedAt || b.createdAt)?.getTime() || 0) - (getJSDate(a.issuedAt || a.createdAt)?.getTime() || 0));
    }, [invoices, invoiceFilters, fiscalReturnReason, getInvoiceCustomerDocument, getInvoiceCustomerName, getInvoiceIssuerDocument, getInvoiceOrder, getInvoicePaymentMethod, getInvoiceValue, matchesInvoiceStatusFilter]);

    const shouldShowFiscalReason = (invoice) => ['rejected', 'denied', 'pending_return'].includes(invoice?.status);

    const fiscalStats = useMemo(() => ({
      authorized: invoices.filter((item) => item.status === 'authorized').length,
      rejected: invoices.filter((item) => item.status === 'rejected' || item.status === 'denied').length,
      pending: invoices.filter((item) => item.status === 'validating' || item.status === 'pending_return').length,
      products: fiscalProducts.length
    }), [invoices, fiscalProducts]);

    const invoiceableOrders = useMemo(() => (
      orders.filter((order) => ['Finalizado', 'Aprovado', 'ready_for_invoice', 'approved'].includes(order.status) || order.approvedForInvoice)
    ), [orders]);

    const eligibleOrders = useMemo(() => {
      const term = normalizeSearchText(orderSearch);
      const termDigits = onlyDigitsText(orderSearch);
      return invoiceableOrders
        .filter((order) => isDateInRange(order.createdAt, orderFilters.start, orderFilters.end))
        .filter(matchesOrderInvoiceStatusFilter)
        .filter((order) => {
          if (!term && !termDigits) return true;
          const invoice = invoicesByOrderId.get(order.id);
          const orderValue = getOrderValue(order);
          const invoiceValue = invoice ? getInvoiceValue(invoice) : 0;
          const candidates = [
            order.id,
            order.codigo,
            order.codigoPedido,
            order.numeroPedido,
            order.clienteNome,
            order.customer?.name,
            order.cliente?.nome,
            getOrderCustomerDocument(order),
            getInvoiceCustomerDocument(invoice),
            getInvoiceCustomerName(invoice),
            getInvoiceIssuerDocument(invoice),
            issuerForm.cnpj,
            orderValue,
            orderValue.toFixed(2),
            formatCurrencyBR(orderValue),
            invoiceValue,
            invoiceValue ? invoiceValue.toFixed(2) : '',
            invoiceValue ? formatCurrencyBR(invoiceValue) : '',
            ...dateSearchValues(order.createdAt),
            ...dateSearchValues(invoice?.createdAt),
            ...dateSearchValues(invoice?.issuedAt),
            order.formaPagamento,
            order.status
          ];
          return candidates.some((value) => {
            const text = normalizeSearchText(value);
            const digits = onlyDigitsText(value);
            return (term && text.includes(term)) || (termDigits && digits.includes(termDigits));
          });
        })
        .sort((a, b) => (getJSDate(b.createdAt)?.getTime() || 0) - (getJSDate(a.createdAt)?.getTime() || 0));
    }, [invoiceableOrders, orderSearch, orderFilters.start, orderFilters.end, matchesOrderInvoiceStatusFilter, dateSearchValues, invoicesByOrderId, getInvoiceCustomerDocument, getInvoiceCustomerName, getInvoiceIssuerDocument, getInvoiceValue, getOrderCustomerDocument, getOrderValue, issuerForm.cnpj]);

    const getPreInvoiceLockedReason = useCallback((order) => {
      const invoice = invoicesByOrderId.get(order?.id);
      if (!invoice) return '';
      if (invoice.status === 'authorized') return 'Este pedido já possui nota autorizada.';
      if (invoice.status === 'cancelled') return 'Este pedido já possui nota cancelada.';
      if (invoice.status === 'validating' || invoice.status === 'pending_return') return 'Este pedido possui nota em processamento.';
      return '';
    }, [invoicesByOrderId]);

    const buildOrderEditItemFromProduct = useCallback((product, previous = {}) => {
      const productId = String(product?.id || previous.produtoId || previous.productId || previous.id || '').trim();
      const quantity = Number(previous.quantity ?? previous.quantidade ?? 1);
      const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
      const unitPrice = roundCurrency(product?.preco ?? previous.preco ?? previous.unitPrice ?? 0);
      return {
        ...previous,
        id: productId,
        produtoId: productId,
        productId,
        codigo: product?.codigo || previous.codigo || productId,
        sku: product?.sku || previous.sku || '',
        nome: product?.nome || previous.nome || previous.description || 'Produto',
        description: product?.nome || previous.description || previous.nome || 'Produto',
        preco: unitPrice,
        unitPrice,
        quantity: safeQuantity,
        quantidade: safeQuantity,
        categoria: product?.categoria || previous.categoria || '',
        subcategoria: product?.subcategoria || previous.subcategoria || '',
        imageUrl: product?.imageUrl || previous.imageUrl || '',
        estoque: product?.estoque ?? previous.estoque ?? null
      };
    }, []);

    const buildOrderEditFormWithTotals = useCallback((draft) => {
      const items = (draft.itens || []).map((item) => {
        const quantity = Number(item.quantity ?? item.quantidade ?? 1);
        const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
        const unitPrice = roundCurrency(item.preco ?? item.unitPrice ?? 0);
        return {
          ...item,
          quantity: safeQuantity,
          quantidade: safeQuantity,
          preco: unitPrice,
          unitPrice
        };
      });
      const subtotal = roundCurrency(items.reduce((sum, item) => sum + (Number(item.preco || 0) * Number(item.quantity || 1)), 0));
      const desconto = roundCurrency(Math.min(Math.max(Number(draft.desconto || 0), 0), subtotal));
      const valorFrete = roundCurrency(Math.max(Number(draft.valorFrete ?? draft.frete ?? 0), 0));
      return {
        ...draft,
        itens: items,
        subtotal,
        desconto,
        valorFrete,
        frete: valorFrete,
        total: roundCurrency(subtotal - desconto + valorFrete)
      };
    }, []);

    const normalizeOrderForPreInvoiceEdit = useCallback((order) => {
      const items = (order?.itens || []).map((item) => {
        const productId = getOrderItemProductId(item);
        const product = storeProducts.find((produto) => String(produto.id) === String(productId));
        return buildOrderEditItemFromProduct(product || { id: productId, nome: item.nome, codigo: item.codigo, preco: item.preco }, item);
      });

      return buildOrderEditFormWithTotals({
        clienteId: order?.clienteId || '',
        clienteNome: order?.clienteNome || '',
        telefone: order?.telefone || '',
        clienteEndereco: order?.clienteEndereco || '',
        formaPagamento: order?.formaPagamento || order?.paymentMethod || DEFAULT_ORDER_PAYMENT_METHOD,
        observacao: order?.observacao || order?.additionalInfo || '',
        itens: items,
        desconto: Number(order?.desconto || order?.cupom?.valorDesconto || 0) || 0,
        valorFrete: Number(order?.valorFrete ?? order?.frete ?? 0) || 0,
        subtotal: Number(order?.subtotal || 0) || 0,
        total: Number(order?.total || 0) || 0,
        cupom: order?.cupom || null,
        categoria: order?.categoria || 'Delivery',
        status: order?.status || 'Finalizado',
        origem: order?.origem || 'Manual',
        dataEntrega: order?.dataEntrega || ''
      });
    }, [buildOrderEditFormWithTotals, buildOrderEditItemFromProduct, storeProducts]);

    const handleOpenPreInvoiceOrderEdit = useCallback((order) => {
      const lockReason = getPreInvoiceLockedReason(order);
      if (lockReason) {
        setMessage({ type: 'error', text: `${lockReason} Não é seguro alterar o pedido nesta etapa.` });
        return;
      }
      setOrderToEditBeforeInvoice(order);
      setOrderEditForm(normalizeOrderForPreInvoiceEdit(order));
      setOrderEditProductSearch('');
      setOrderEditError('');
    }, [getPreInvoiceLockedReason, normalizeOrderForPreInvoiceEdit]);

    const setOrderEditDraft = (updater) => {
      setOrderEditForm((prev) => buildOrderEditFormWithTotals(typeof updater === 'function' ? updater(prev) : updater));
    };

    const handleOrderEditClientChange = (clienteId) => {
      const cliente = (data.clientes || []).find((item) => item.id === clienteId);
      setOrderEditDraft((prev) => ({
        ...prev,
        clienteId,
        clienteNome: cliente?.nome || prev.clienteNome,
        telefone: cliente?.telefone || prev.telefone || '',
        clienteEndereco: getClientPrimaryAddressText(cliente) || prev.clienteEndereco || ''
      }));
    };

    const handleAddProductToPreInvoiceOrder = (product) => {
      setOrderEditDraft((prev) => {
        const productId = String(product?.id || '');
        if (!productId) return prev;
        const existingIndex = (prev.itens || []).findIndex((item) => String(getOrderItemProductId(item)) === productId);
        if (existingIndex >= 0) {
          return {
            ...prev,
            itens: prev.itens.map((item, index) => (
              index === existingIndex
                ? { ...item, quantity: Number(item.quantity || 1) + 1, quantidade: Number(item.quantity || 1) + 1 }
                : item
            ))
          };
        }
        return {
          ...prev,
          itens: [...(prev.itens || []), buildOrderEditItemFromProduct(product)]
        };
      });
    };

    const handleReplacePreInvoiceOrderItem = (index, productId) => {
      const product = storeProducts.find((item) => String(item.id) === String(productId));
      if (!product) return;
      setOrderEditDraft((prev) => ({
        ...prev,
        itens: (prev.itens || []).map((item, itemIndex) => (
          itemIndex === index ? buildOrderEditItemFromProduct(product, { quantity: item.quantity || 1 }) : item
        ))
      }));
    };

    const handleUpdatePreInvoiceOrderItem = (index, field, value) => {
      setOrderEditDraft((prev) => ({
        ...prev,
        itens: (prev.itens || []).map((item, itemIndex) => {
          if (itemIndex !== index) return item;
          if (field === 'quantity') {
            const quantity = Number(value);
            return {
              ...item,
              quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : '',
              quantidade: Number.isFinite(quantity) && quantity > 0 ? quantity : ''
            };
          }
          if (field === 'preco') {
            const unitPrice = value === '' ? '' : Math.max(Number(value), 0);
            return {
              ...item,
              preco: unitPrice,
              unitPrice
            };
          }
          return { ...item, [field]: value };
        })
      }));
    };

    const handleRemovePreInvoiceOrderItem = (index) => {
      setOrderEditDraft((prev) => ({
        ...prev,
        itens: (prev.itens || []).filter((_, itemIndex) => itemIndex !== index)
      }));
    };

    const handleSavePreInvoiceOrderEdit = async (event) => {
      event.preventDefault();
      if (isReadOnly || !orderToEditBeforeInvoice?.id || !effectiveStoreId) return;
      setOrderEditError('');
      const currentLockReason = getPreInvoiceLockedReason(orderToEditBeforeInvoice);
      if (currentLockReason) {
        setOrderEditError(currentLockReason);
        return;
      }

      const normalizedForm = buildOrderEditFormWithTotals(orderEditForm);
      if (!String(normalizedForm.clienteNome || '').trim()) {
        setOrderEditError('Informe o nome do cliente antes de salvar.');
        return;
      }
      if (!Array.isArray(normalizedForm.itens) || normalizedForm.itens.length === 0) {
        setOrderEditError('Adicione ao menos um produto ao pedido.');
        return;
      }
      const invalidItem = normalizedForm.itens.find((item) => (
        !getOrderItemProductId(item)
        || !String(item.nome || item.description || '').trim()
        || Number(item.quantity || 0) <= 0
        || Number(item.preco ?? item.unitPrice ?? -1) < 0
      ));
      if (invalidItem) {
        setOrderEditError('Revise os produtos: todos precisam ter produto, quantidade válida e valor igual ou maior que zero.');
        return;
      }

      setOrderEditSaving(true);
      setMessage(null);
      try {
        const payload = {
          clienteId: normalizedForm.clienteId || '',
          clienteNome: String(normalizedForm.clienteNome || '').trim(),
          telefone: normalizedForm.telefone || '',
          clienteEndereco: normalizedForm.clienteEndereco || '',
          formaPagamento: normalizedForm.formaPagamento || DEFAULT_ORDER_PAYMENT_METHOD,
          observacao: normalizedForm.observacao || '',
          additionalInfo: normalizedForm.observacao || '',
          itens: normalizedForm.itens,
          subtotal: normalizedForm.subtotal,
          desconto: normalizedForm.desconto,
          valorFrete: normalizedForm.valorFrete,
          frete: normalizedForm.valorFrete,
          total: normalizedForm.total,
          cupom: null,
          updatedAt: new Date()
        };
        await updateItem('pedidos', orderToEditBeforeInvoice.id, payload, effectiveStoreId);
        setOrderToEditBeforeInvoice(null);
        setOrderEditProductSearch('');
        setOrderEditError('');
        setMessage({ type: 'success', text: 'Pedido atualizado. Agora valide novamente antes de emitir a nota.' });
      } catch (error) {
        console.error('[NotaFiscal] Erro ao editar pedido antes da nota:', error);
        setOrderEditError(error?.message || 'Não foi possível salvar o pedido antes da emissão.');
      } finally {
        setOrderEditSaving(false);
      }
    };

    useEffect(() => {
      if (!effectiveStoreId) return undefined;
      setConfigLoading(true);
      let cancelled = false;

      const getConfiguration = httpsCallable(functions, 'fiscalGetConfiguration');
      getConfiguration({ lojaId: effectiveStoreId }).then((response) => {
        if (cancelled) return;
        const configuration = response.data || {};
        if (configuration.issuer) {
          setIssuerForm((prev) => ({ ...prev, ...configuration.issuer, address: { ...prev.address, ...(configuration.issuer.address || {}) } }));
        }
        if (configuration.settings) {
          setSettingsForm((prev) => ({
            ...prev,
            ...configuration.settings,
            serviceUrl: configuration.platformService?.serviceUrl || configuration.settings.serviceUrl || ''
          }));
        }
        setCertificateInfo(configuration.certificate || null);
        setPlatformService(configuration.platformService || null);
      }).catch((error) => {
        console.error('[NotaFiscal] Erro ao carregar configuração fiscal:', error);
        setMessage({ type: 'error', text: error?.message || 'Não foi possível carregar a configuração fiscal.' });
      }).finally(() => {
        if (!cancelled) setConfigLoading(false);
      });

      return () => { cancelled = true; };
    }, [effectiveStoreId]);

    const callablePayload = (extra = {}) => ({
      lojaId: effectiveStoreId,
      ...extra
    });

    const downloadInvoiceArtifact = async (invoiceId, type = 'danfePdf') => {
      const fn = httpsCallable(functions, 'fiscalGetInvoiceArtifact');
      const response = await fn(callablePayload({ invoiceId, type }));
      const artifact = response.data || {};
      downloadBase64File(artifact.base64, artifact.filename, artifact.contentType);
      return artifact;
    };

    const setIssuerField = (field, value) => {
      setIssuerForm((prev) => ({ ...prev, [field]: value }));
    };

    const setIssuerAddressField = (field, value) => {
      setIssuerForm((prev) => ({ ...prev, address: { ...(prev.address || {}), [field]: value } }));
    };

    const resetProductForm = () => {
      setEditingFiscalProduct(null);
      setSelectedFiscalProductIds([]);
      setFiscalProductSearchTerm('');
      setFiscalProductConflictMode('fill-empty');
      setProductForm({
        productId: '',
        code: '',
        description: '',
        ncm: DEFAULT_NCM_PRODUCT,
        cfopNfe: DEFAULT_CFOP_OPERATION,
        cfopNfce: DEFAULT_CFOP_OPERATION,
        unit: 'un',
        origin: 0,
        csosn: '102',
        pisCst: '49',
        cofinsCst: '49',
        cest: '',
        cBenef: ''
      });
    };

    const applyFiscalProductSelection = (nextIds) => {
      const normalizedIds = [...new Set(nextIds.filter(Boolean).map(String))];
      setSelectedFiscalProductIds(normalizedIds);
      setProductForm((prev) => {
        if (normalizedIds.length === 1) {
          const product = storeProducts.find((item) => String(item.id) === normalizedIds[0]);
          return {
            ...prev,
            productId: normalizedIds[0],
            code: product?.codigo || normalizedIds[0],
            description: product?.nome || prev.description
          };
        }
        if (normalizedIds.length > 1) {
          return {
            ...prev,
            productId: '',
            code: '',
            description: ''
          };
        }
        return { ...prev, productId: '' };
      });
    };

    const toggleFiscalProductSelection = (productId) => {
      if (editingFiscalProduct) return;
      const normalizedId = String(productId || '');
      if (!normalizedId) return;
      const nextIds = selectedFiscalProductIdSet.has(normalizedId)
        ? selectedFiscalProductIds.filter((id) => id !== normalizedId)
        : [...selectedFiscalProductIds, normalizedId];
      applyFiscalProductSelection(nextIds);
    };

    const toggleAllVisibleFiscalProducts = (checked) => {
      if (editingFiscalProduct) return;
      const visibleIds = filteredFiscalProductOptions.map((produto) => String(produto.id)).filter(Boolean);
      if (checked) {
        applyFiscalProductSelection([...selectedFiscalProductIds, ...visibleIds]);
      } else {
        const visibleIdSet = new Set(visibleIds);
        applyFiscalProductSelection(selectedFiscalProductIds.filter((id) => !visibleIdSet.has(id)));
      }
    };

    const requestOrderValidation = async (order) => {
      const fn = httpsCallable(functions, 'fiscalValidateOrder');
      const response = await fn(callablePayload({
        orderId: order.id,
        modelOverride: modelOverride ? Number(modelOverride) : undefined,
        operationCfop
      }));
      const result = response.data || {};
      setValidationByOrder((prev) => ({ ...prev, [order.id]: result }));
      return result;
    };

    const handleValidateOrder = async (order) => {
      if (isReadOnly) return;
      if (!effectiveStoreId) {
        setMessage({ type: 'error', text: 'Selecione uma loja específica para validar notas.' });
        return;
      }
      setBusyOrderId(`validate:${order.id}`);
      setMessage(null);

      try {
        const result = await requestOrderValidation(order);
        const hasErrors = Array.isArray(result.errors) && result.errors.length > 0;
        setMessage({
          type: hasErrors ? 'error' : 'success',
          text: hasErrors ? result.errors.join(' ') : 'Pedido validado para emissão fiscal.'
        });
      } catch (error) {
        console.error('[NotaFiscal] Validação fiscal falhou:', error);
        setMessage({ type: 'error', text: error?.message || 'Não foi possível validar o pedido.' });
      } finally {
        setBusyOrderId('');
      }
    };

    const handleIssueOrder = async (order) => {
      if (isReadOnly) return;
      if (!effectiveStoreId) {
        setMessage({ type: 'error', text: 'Selecione uma loja específica para emitir notas.' });
        return;
      }
      setBusyOrderId(`issue:${order.id}`);
      setMessage(null);

      try {
        const validation = await requestOrderValidation(order);
        if (Array.isArray(validation.errors) && validation.errors.length > 0) {
          const hasItemIssues = Array.isArray(validation.itemIssues) && validation.itemIssues.length > 0;
          setMessage({
            type: 'error',
            text: hasItemIssues
              ? 'Corrija a classificação fiscal indicada abaixo antes de emitir a nota.'
              : validation.errors.join(' ')
          });
          return;
        }
        setOrderToIssue(order);
        setIssueAdditionalInfo(order.observacao || order.additionalInfo || '');
        setIssueError('');
      } catch (error) {
        console.error('[NotaFiscal] Pré-validação da emissão falhou:', error);
        setMessage({ type: 'error', text: error?.message || 'Não foi possível validar a nota antes da emissão.' });
      } finally {
        setBusyOrderId('');
      }
    };

    const handleConfirmIssue = async (event) => {
      event.preventDefault();
      if (isReadOnly || !orderToIssue) return;
      setBusyOrderId(`issue:${orderToIssue.id}`);
      setMessage(null);
      setIssueError('');

      try {
        const fn = httpsCallable(functions, 'fiscalIssueInvoice');
        const response = await fn(callablePayload({
          orderId: orderToIssue.id,
          modelOverride: modelOverride ? Number(modelOverride) : undefined,
          justification: 'Emissão manual pelo painel Nota Fiscal',
          additionalInfo: issueAdditionalInfo.trim(),
          operationCfop
        }));
        setOrderToIssue(null);
        setIssueAdditionalInfo('');
        const result = response.data || {};
        if (result.status === 'authorized') {
          setActiveTab('notas');
          setMessage({ type: 'success', text: result.xMotivo || 'Nota autorizada. Baixando DANFE em PDF.' });
          if (result.invoiceId && result.danfePdfReady) {
            await downloadInvoiceArtifact(result.invoiceId, 'danfePdf');
          }
        } else {
          setActiveTab('notas');
          setMessage({ type: 'error', text: result.xMotivo || 'Retorno fiscal recebido. Consulte a nota em Notas emitidas.' });
        }
      } catch (error) {
        console.error('[NotaFiscal] Emissão fiscal falhou:', error);
        setIssueError(error?.message || 'Não foi possível emitir a nota.');
        setMessage({ type: 'error', text: error?.message || 'Não foi possível emitir a nota.' });
      } finally {
        setBusyOrderId('');
      }
    };

    const handleRefreshInvoice = async (invoice) => {
      if (isReadOnly || !invoice?.id) return;
      setBusyOrderId(`refresh:${invoice.id}`);
      setMessage(null);
      try {
        const fn = httpsCallable(functions, 'fiscalRefreshInvoice');
        const response = await fn(callablePayload({ invoiceId: invoice.id }));
        const result = response.data || {};
        if (result.status === 'authorized') {
          setMessage({ type: 'success', text: result.xMotivo || 'Nota autorizada. Baixando DANFE em PDF.' });
          if (result.invoiceId && result.danfePdfReady) {
            await downloadInvoiceArtifact(result.invoiceId, 'danfePdf');
          }
        } else {
          setMessage({ type: result.status === 'pending_return' ? 'error' : 'success', text: result.xMotivo || 'Consulta fiscal concluída.' });
        }
      } catch (error) {
        console.error('[NotaFiscal] Consulta de retorno fiscal falhou:', error);
        setMessage({ type: 'error', text: error?.message || 'Não foi possível consultar o retorno da nota.' });
      } finally {
        setBusyOrderId('');
      }
    };

    const handleDownloadInvoicePdf = async (invoice) => {
      if (!invoice?.id) return;
      setBusyOrderId(`pdf:${invoice.id}`);
      setMessage(null);
      try {
        await downloadInvoiceArtifact(invoice.id, 'danfePdf');
        setMessage({ type: 'success', text: 'DANFE em PDF baixado.' });
      } catch (error) {
        console.error('[NotaFiscal] Download do DANFE falhou:', error);
        setMessage({ type: 'error', text: error?.message || 'PDF da nota ainda não está disponível.' });
      } finally {
        setBusyOrderId('');
      }
    };

    const handleDownloadInvoiceXml = async (invoice) => {
      if (!invoice?.id) return;
      setBusyOrderId(`xml:${invoice.id}`);
      setMessage(null);
      try {
        await downloadInvoiceArtifact(invoice.id, 'authorizedXml');
        setMessage({ type: 'success', text: 'XML autorizado baixado.' });
      } catch (error) {
        console.error('[NotaFiscal] Download do XML falhou:', error);
        setMessage({ type: 'error', text: error?.message || 'XML autorizado ainda não está disponível.' });
      } finally {
        setBusyOrderId('');
      }
    };

    const handleCopyInvoiceKey = async (invoice) => {
      const key = String(invoice?.key || '').trim();
      if (!key) {
        setMessage({ type: 'error', text: 'Esta nota ainda não possui chave de acesso.' });
        return;
      }
      try {
        await navigator.clipboard.writeText(key);
        setMessage({ type: 'success', text: 'Chave de acesso copiada.' });
      } catch (error) {
        console.error('[NotaFiscal] Cópia da chave falhou:', error);
        setMessage({ type: 'error', text: 'Não foi possível copiar a chave automaticamente.' });
      }
    };

    const sefazConsultaUrl = (invoice) => {
      const key = onlyDigitsText(invoice?.key);
      return key ? `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=d09fwabTnLk=&nfe=${key}` : '';
    };

    const handleOpenCancelInvoice = (invoice) => {
      if (isReadOnly) return;
      setInvoiceToCancel(invoice);
      setCancelReason('');
      setCancelError('');
    };

    const handleConfirmCancelInvoice = async (event) => {
      event.preventDefault();
      if (isReadOnly || !invoiceToCancel) return;
      const normalizedReason = cancelReason.trim();
      if (normalizedReason.length < 15) {
        setCancelError('A justificativa de cancelamento precisa ter ao menos 15 caracteres.');
        return;
      }
      setBusyOrderId(`cancel:${invoiceToCancel.id}`);
      setMessage(null);
      setCancelError('');

      try {
        const fn = httpsCallable(functions, 'fiscalCancelInvoice');
        const response = await fn(callablePayload({ invoiceId: invoiceToCancel.id, reason: normalizedReason }));
        setInvoiceToCancel(null);
        setCancelReason('');
        setMessage({ type: response.data?.cancellationAccepted ? 'success' : 'error', text: response.data?.xMotivo || 'Cancelamento processado.' });
      } catch (error) {
        console.error('[NotaFiscal] Cancelamento fiscal falhou:', error);
        setCancelError(error?.message || 'Não foi possível cancelar a nota.');
        setMessage({ type: 'error', text: error?.message || 'Não foi possível cancelar a nota.' });
      } finally {
        setBusyOrderId('');
      }
    };

    const handleSaveFiscalConfig = async (event) => {
      event.preventDefault();
      if (isReadOnly) return;
      if (!effectiveStoreId) return;
      setConfigSaving(true);
      setMessage(null);
      try {
        const saveConfiguration = httpsCallable(functions, 'fiscalSaveConfiguration');
        await saveConfiguration(callablePayload({
          issuer: {
            ...issuerForm,
            taxRegime: Number(issuerForm.taxRegime || 1)
          },
          settings: {
            environment: settingsForm.environment,
            nfeSeries: Number(settingsForm.nfeSeries || 1),
            nfceSeries: Number(settingsForm.nfceSeries || 1),
            operationNature: settingsForm.operationNature,
            defaultPaymentMethodCode: settingsForm.defaultPaymentMethodCode,
            defaultPresence: Number(settingsForm.defaultPresence || 2),
            ...(isPlatformAdmin ? { serviceUrl: settingsForm.serviceUrl || '' } : {})
          }
        }));
        if (isPlatformAdmin) {
          const normalizedServiceUrl = String(settingsForm.serviceUrl || '').trim();
          setPlatformService((prev) => ({
            ...(prev || {}),
            serviceUrl: normalizedServiceUrl,
            configured: Boolean(normalizedServiceUrl),
            source: normalizedServiceUrl ? 'integrations/fiscal' : ''
          }));
        }
        setMessage({ type: 'success', text: 'Configuração fiscal salva.' });
      } catch (error) {
        console.error('[NotaFiscal] Erro ao salvar configuração:', error);
        setMessage({ type: 'error', text: error?.message || 'Não foi possível salvar a configuração fiscal.' });
      } finally {
        setConfigSaving(false);
      }
    };

    const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',').pop());
      reader.onerror = () => reject(reader.error || new Error('Não foi possível ler o certificado.'));
      reader.readAsDataURL(file);
    });

    const handleUploadCertificate = async (event) => {
      event?.preventDefault?.();
      if (isReadOnly) return;
      if (!effectiveStoreId) {
        setMessage({ type: 'error', text: 'Selecione uma loja específica para enviar o certificado.' });
        return;
      }
      if (!certificateForm.file) {
        setMessage({ type: 'error', text: 'Selecione o arquivo .pfx do certificado A1.' });
        return;
      }
      if (!certificateForm.password) {
        setMessage({ type: 'error', text: 'Informe a senha do certificado A1.' });
        return;
      }

      setCertificateUploading(true);
      setMessage(null);
      try {
        const certificateBase64 = await readFileAsBase64(certificateForm.file);
        const fn = httpsCallable(functions, 'fiscalUploadCertificate');
        const response = await fn(callablePayload({
          certificateBase64,
          filename: certificateForm.file.name,
          password: certificateForm.password,
          cscId: certificateForm.cscId,
          csc: certificateForm.csc
        }));
        setCertificateInfo(response.data?.certificate || null);
        setCertificateForm({ file: null, password: '', cscId: '', csc: '' });
        setMessage({ type: 'success', text: 'Certificado fiscal salvo com segurança.' });
      } catch (error) {
        console.error('[NotaFiscal] Upload do certificado falhou:', error);
        setMessage({ type: 'error', text: error?.message || 'Não foi possível salvar o certificado.' });
      } finally {
        setCertificateUploading(false);
      }
    };

    const handleEditFiscalProduct = (row) => {
      setEditingFiscalProduct(row);
      setSelectedFiscalProductIds(row.id ? [String(row.id)] : []);
      setFiscalProductSearchTerm('');
      setFiscalProductConflictMode('overwrite');
      setProductForm({
        productId: row.id || '',
        code: row.code || '',
        description: row.description || '',
        ncm: normalizeFiscalCode(row.ncm || DEFAULT_NCM_PRODUCT),
        cfopNfe: row.cfopNfe || row.cfop || DEFAULT_CFOP_OPERATION,
        cfopNfce: row.cfopNfce || row.cfop || DEFAULT_CFOP_OPERATION,
        unit: row.unit || 'un',
        origin: Number(row.origin ?? 0),
        csosn: row.csosn || '102',
        pisCst: row.pisCst || '49',
        cofinsCst: row.cofinsCst || '49',
        cest: row.cest || '',
        cBenef: row.cBenef || ''
      });
      setShowProductModal(true);
    };

    const handleCorrectFiscalProduct = (orderId, issue) => {
      const existing = fiscalProducts.find((item) => item.id === issue.productId || item.code === issue.code);
      if (existing) {
        setProductCorrectionOrderId(orderId);
        handleEditFiscalProduct(existing);
        return;
      }

      const product = (data.produtos || []).find((item) => item.id === issue.productId);
      resetProductForm();
      setProductCorrectionOrderId(orderId);
      applyFiscalProductSelection(issue.productId || product?.id ? [issue.productId || product?.id] : []);
      setProductForm((prev) => ({
        ...prev,
        productId: issue.productId || product?.id || '',
        code: issue.code || product?.codigo || issue.productId || '',
        description: issue.description || product?.nome || '',
        ncm: normalizeFiscalCode(issue.ncm || DEFAULT_NCM_PRODUCT),
        cfopNfe: DEFAULT_CFOP_OPERATION,
        cfopNfce: DEFAULT_CFOP_OPERATION
      }));
      setShowProductModal(true);
    };

    const handleSaveFiscalProduct = async (event) => {
      event.preventDefault();
      if (isReadOnly) return;
      if (!effectiveStoreId) return;
      const normalizedNcm = normalizeFiscalCode(productForm.ncm);
      if (normalizedNcm.length !== 8) {
        setMessage({ type: 'error', text: 'Informe NCM com 8 dígitos. O CFOP é selecionado por operação na tela de emissão.' });
        return;
      }

      const selectedIds = editingFiscalProduct?.id
        ? [String(editingFiscalProduct.id)]
        : selectedFiscalProductIds;
      const selectedProducts = selectedIds
        .map((productId) => storeProducts.find((item) => String(item.id) === String(productId)))
        .filter(Boolean);
      const manualProductId = String(editingFiscalProduct?.id || productForm.productId || productForm.code || productForm.description || '').trim();
      const isManualSave = selectedProducts.length === 0;

      if (isManualSave && !manualProductId) {
        setMessage({ type: 'error', text: 'Selecione ao menos um produto ou informe código/descrição para salvar o cadastro fiscal.' });
        return;
      }

      const commonFiscalPayload = {
        ncm: normalizedNcm,
        unit: productForm.unit || 'un',
        origin: Number(productForm.origin || 0),
        csosn: productForm.csosn || '102',
        pisCst: productForm.pisCst || '49',
        cofinsCst: productForm.cofinsCst || '49',
        cest: productForm.cest || '',
        cBenef: productForm.cBenef || '',
        updatedAt: serverTimestamp()
      };

      const isEmptyFiscalValue = (value) => value === undefined || value === null || value === '';
      const buildProductPayload = (product, existing = null) => {
        const productId = String(product?.id || manualProductId || '').trim();
        const isMulti = selectedProducts.length > 1;
        const basePayload = {
          code: isMulti ? (product?.codigo || productId) : (productForm.code || product?.codigo || productId),
          description: isMulti ? (product?.nome || productForm.description || productId) : (productForm.description || product?.nome || productId),
          ...commonFiscalPayload
        };

        if (!existing) {
          return {
            payload: {
              ...basePayload,
              productId,
              createdAt: serverTimestamp()
            },
            action: 'created'
          };
        }

        if (fiscalProductConflictMode === 'ignore' && !editingFiscalProduct) {
          return { payload: null, action: 'skipped' };
        }

        if (fiscalProductConflictMode === 'fill-empty' && !editingFiscalProduct) {
          const patch = {};
          Object.entries({ productId, ...basePayload }).forEach(([field, value]) => {
            if (field === 'updatedAt') return;
            if (!isEmptyFiscalValue(value) && isEmptyFiscalValue(existing[field])) {
              patch[field] = value;
            }
          });
          if (Object.keys(patch).length === 0) {
            return { payload: null, action: 'skipped' };
          }
          return {
            payload: {
              ...patch,
              updatedAt: serverTimestamp()
            },
            action: 'updated'
          };
        }

        return {
          payload: {
            ...basePayload,
            productId
          },
          action: 'updated'
        };
      };

      const targets = isManualSave
        ? [{
            id: manualProductId,
            product: { id: manualProductId, nome: productForm.description, codigo: productForm.code || manualProductId },
            existing: editingFiscalProduct || fiscalProductsById.get(manualProductId)
          }]
        : selectedProducts.map((product) => ({
            id: String(product.id),
            product,
            existing: fiscalProductsById.get(String(product.id))
          }));

      const affectedCount = targets.length;
      const existingCount = targets.filter((target) => target.existing).length;
      const conflictLabel = {
        overwrite: 'sobrescrever os dados existentes',
        ignore: 'ignorar produtos que já possuem cadastro',
        'fill-empty': 'atualizar apenas campos vazios'
      }[fiscalProductConflictMode] || 'atualizar apenas campos vazios';
      const confirmText = [
        `Você está prestes a salvar cadastro fiscal para ${affectedCount} produto(s).`,
        existingCount > 0 ? `${existingCount} produto(s) já possuem cadastro fiscal; a regra escolhida é: ${conflictLabel}.` : 'Nenhum produto selecionado possui cadastro fiscal anterior.',
        'Deseja continuar?'
      ].join('\n\n');

      if (!window.confirm(confirmText)) return;

      setSavingFiscalProducts(true);
      setMessage(null);
      try {
        const writes = [];
        let skipped = 0;
        targets.forEach((target) => {
          const { payload, action } = buildProductPayload(target.product, target.existing);
          if (!payload) {
            skipped += 1;
            return;
          }
          writes.push({
            id: target.id,
            payload,
            action
          });
        });

        if (writes.length === 0) {
          setShowProductModal(false);
          resetProductForm();
          setMessage({ type: 'success', text: `Nenhum produto alterado. ${skipped} produto(s) foram ignorados pela regra escolhida.` });
          return;
        }

        const chunks = [];
        for (let index = 0; index < writes.length; index += 450) {
          chunks.push(writes.slice(index, index + 450));
        }

        const summary = { created: 0, updated: 0, errors: 0 };
        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach((item) => {
            batch.set(doc(db, 'lojas', effectiveStoreId, 'fiscalProducts', item.id), item.payload, { merge: true });
          });
          try {
            await batch.commit();
            chunk.forEach((item) => {
              if (item.action === 'created') summary.created += 1;
              if (item.action === 'updated') summary.updated += 1;
            });
          } catch (error) {
            summary.errors += chunk.length;
            console.error('[NotaFiscal] Erro ao salvar lote de produtos fiscais:', error);
          }
        }

        setShowProductModal(false);
        resetProductForm();
        const summaryText = `Produtos fiscais: ${summary.created} cadastrado(s), ${summary.updated} atualizado(s), ${summary.errors} com erro${skipped ? `, ${skipped} ignorado(s)` : ''}.`;
        if (productCorrectionOrderId) {
          setActiveTab('emitir');
          setMessage({ type: summary.errors ? 'error' : 'success', text: `${summaryText} Valide novamente o pedido para confirmar a emissão.` });
          setProductCorrectionOrderId('');
        } else {
          setMessage({ type: summary.errors ? 'error' : 'success', text: summaryText });
        }
      } catch (error) {
        console.error('[NotaFiscal] Erro ao salvar produto fiscal:', error);
        setMessage({ type: 'error', text: error?.message || 'Não foi possível salvar o cadastro fiscal.' });
      } finally {
        setSavingFiscalProducts(false);
      }
    };

    const orderColumns = [
      { header: 'Pedido', render: (row) => <span className="font-mono text-xs text-gray-500">{row.id?.slice(0, 8) || '-'}</span> },
      { header: 'Cliente', key: 'clienteNome' },
      { header: 'Total', render: (row) => <span className="font-semibold text-green-600">R$ {(row.total || 0).toFixed(2)}</span> },
      { header: 'Data', render: (row) => formatDateTime(row.createdAt) },
      { header: 'Nota', render: (row) => {
        const invoice = invoicesByOrderId.get(row.id);
        if (!invoice) return <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Pendente</span>;
        const reason = fiscalReturnReason(invoice);
        return (
          <div className="min-w-[150px]" title={reason || ''}>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusClass[invoice.status] || 'bg-gray-100 text-gray-700'}`}>{statusLabel[invoice.status] || invoice.status}</span>
            {reason && shouldShowFiscalReason(invoice) && <p className="mt-1 max-w-[260px] truncate text-xs text-red-700">{reason}</p>}
          </div>
        );
      } }
    ];

    const orderActions = isReadOnly ? [] : [
      {
        icon: Edit,
        label: 'Editar pedido antes da nota',
        onClick: handleOpenPreInvoiceOrderEdit,
        isVisible: (row) => !getPreInvoiceLockedReason(row)
      },
      { icon: RefreshCw, label: 'Validar', onClick: handleValidateOrder },
      { icon: Printer, label: 'Emitir', onClick: handleIssueOrder }
    ];

    const invoiceColumns = [
      { header: 'NFC-e', render: (row) => <span className="font-mono text-xs font-semibold text-gray-800">{formatFiscalNumber(row.number)}</span> },
      { header: 'Série', render: (row) => <span className="font-mono text-xs text-gray-600">{formatFiscalSeries(row.series)}</span> },
      { header: 'Pedido', render: (row) => <span className="font-mono text-xs">{row.orderId?.slice(0, 8) || '-'}</span> },
      { header: 'Cliente', render: (row) => getInvoiceCustomerName(row) },
      { header: 'CPF/CNPJ', render: (row) => <span className="font-mono text-xs text-gray-600">{maskCpfCnpj(getInvoiceCustomerDocument(row))}</span> },
      { header: 'Status', render: (row) => <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusClass[row.status] || 'bg-gray-100 text-gray-700'}`}>{statusLabel[row.status] || row.status}</span> },
      { header: 'Valor', render: (row) => <span className="font-semibold text-green-700">{formatCurrencyBR(getInvoiceValue(row))}</span> },
      { header: 'Emissão', render: (row) => formatDateTime(row.issuedAt || row.createdAt) },
      { header: 'Motivo', render: (row) => {
        const reason = fiscalReturnReason(row);
        return <span className="block max-w-[280px] truncate text-gray-700" title={reason || ''}>{reason || '-'}</span>;
      } }
    ];

    const invoiceActions = [
      { icon: Eye, label: 'Ver detalhes', onClick: (row) => setInvoiceToView(row) },
      { icon: FileText, label: 'Baixar/visualizar DANFE PDF', onClick: handleDownloadInvoicePdf, isVisible: (row) => row.status === 'authorized' },
      { icon: Download, label: 'Baixar XML', onClick: handleDownloadInvoiceXml, isVisible: (row) => row.status === 'authorized' },
      { icon: RefreshCw, label: 'Consultar retorno', onClick: handleRefreshInvoice, isVisible: (row) => !isReadOnly && row.status === 'pending_return' },
      { icon: X, label: 'Cancelar nota', onClick: handleOpenCancelInvoice, isVisible: (row) => !isReadOnly && row.status === 'authorized' }
    ];

    const fiscalProductColumns = [
      { header: 'Produto', render: (row) => <div><p className="font-medium text-gray-800">{row.description || row.nome || row.id}</p><p className="text-xs text-gray-500">{row.code || row.id}</p></div> },
      { header: 'NCM', key: 'ncm' },
      { header: 'ICMS/CST', render: (row) => row.csosn || row.cst || '-' },
      { header: 'CEST', render: (row) => row.cest || '-' },
      { header: 'Un.', render: (row) => row.unit || 'un' }
    ];

    const productActions = isReadOnly ? [] : [
      { icon: Edit, label: 'Editar', onClick: handleEditFiscalProduct },
      { icon: Trash2, label: 'Excluir', onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('fiscalProducts', row.id, effectiveStoreId) }) }
    ];

    const DetailSection = ({ title, children }) => (
      <section className="space-y-3 rounded-xl border border-gray-100 bg-white p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">{title}</h3>
        {children}
      </section>
    );

    const DetailField = ({ label, value, mono = false, full = false }) => (
      <div className={full ? 'md:col-span-2 xl:col-span-3' : ''}>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
        <p className={`mt-1 break-words text-sm text-gray-800 ${mono ? 'font-mono' : ''}`}>{value || '-'}</p>
      </div>
    );

    if (!effectiveStoreId) {
      return (
        <div className="p-4 md:p-6 min-h-screen bg-gradient-to-br from-pink-50/30 to-rose-50/30">
          <div className="bg-white border border-yellow-200 rounded-2xl p-6 shadow-lg max-w-3xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-yellow-600 mt-1" />
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Nota Fiscal</h1>
                <p className="text-gray-600 mt-2">Selecione uma loja específica no topo da tela para configurar e emitir NF-e/NFC-e.</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Nota Fiscal</h1>
            <p className="text-gray-600 mt-1">Emissão direta de NF-e/NFC-e para {storeName}</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-white border rounded-xl shadow-sm text-sm text-gray-700">
            <CheckCircle className="w-4 h-4 text-green-600" />
            {isReadOnly ? 'Consulta contábil' : `Ambiente: ${settingsForm.environment === 'production' ? 'Produção' : 'Homologação'}`}
          </div>
        </div>

        {message && (
          <div className={`p-4 rounded-xl border text-sm ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-lg border border-gray-100"><p className="text-sm text-gray-500">Autorizadas</p><p className="text-2xl font-bold text-green-600">{fiscalStats.authorized}</p></div>
          <div className="bg-white p-5 rounded-2xl shadow-lg border border-gray-100"><p className="text-sm text-gray-500">Rejeitadas</p><p className="text-2xl font-bold text-red-600">{fiscalStats.rejected}</p></div>
          <div className="bg-white p-5 rounded-2xl shadow-lg border border-gray-100"><p className="text-sm text-gray-500">Pendentes</p><p className="text-2xl font-bold text-yellow-600">{fiscalStats.pending}</p></div>
          <div className="bg-white p-5 rounded-2xl shadow-lg border border-gray-100"><p className="text-sm text-gray-500">Produtos fiscais</p><p className="text-2xl font-bold text-pink-600">{fiscalStats.products}</p></div>
        </div>

        <div className="flex flex-wrap gap-2 bg-white rounded-2xl p-2 shadow-lg border border-gray-100">
          {[
            ['emitir', isReadOnly ? 'Pedidos' : 'Emitir'],
            ['notas', 'Notas emitidas'],
            ['produtos', 'Produtos fiscais'],
            ['configuracao', 'Configuração']
          ].map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === id ? 'bg-pink-100 text-pink-700' : 'text-gray-600 hover:bg-pink-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'emitir' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-lg border border-gray-100 space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,1fr)_170px_170px_190px] gap-3 items-end">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Busca rápida</label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder="Buscar por pedido, cliente, valor, data, CPF/CNPJ"
                      className="w-full min-w-0 pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <Input
                  label="Data inicial"
                  type="date"
                  value={orderFilters.start}
                  onChange={(e) => setOrderFilter('start', e.target.value)}
                />
                <Input
                  label="Data final"
                  type="date"
                  value={orderFilters.end}
                  onChange={(e) => setOrderFilter('end', e.target.value)}
                />
                <Select label="Status da nota" value={orderFilters.status} onChange={(e) => setOrderFilter('status', e.target.value)}>
                  {invoiceStatusFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(280px,360px)_auto_minmax(240px,1fr)] gap-3 items-end">
                <Select value={modelOverride} onChange={(e) => setModelOverride(e.target.value)} className="md:w-56">
                  <option value="">Modelo automático</option>
                  <option value="55">Forçar NF-e 55</option>
                  <option value="65">Forçar NFC-e 65</option>
                </Select>
                <Select label="CFOP da operação" value={operationCfop} onChange={(e) => setOperationCfop(e.target.value)}>
                  {CFOP_OPERATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
                <a href="https://www.confaz.fazenda.gov.br/legislacao/ajustes/sinief/cfop_cvsn_70_vigente" target="_blank" rel="noreferrer" className="self-end pb-3 text-sm text-pink-700 underline hover:text-pink-800">
                  Tabela CFOP
                </a>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
                  <p className="text-sm text-gray-500 sm:mr-auto">
                    Mostrando <strong className="text-gray-800">{eligibleOrders.length}</strong> de <strong className="text-gray-800">{invoiceableOrders.length}</strong> pedidos.
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setOrderFilters((prev) => ({ ...prev, ...getCurrentMonthDateRange() }))}
                  >
                    <Calendar className="w-4 h-4" /> Mês atual
                  </Button>
                  <Button size="sm" variant="outline" onClick={resetOrderFiltersToCurrentMonth}>
                    <RefreshCw className="w-4 h-4" /> Limpar filtros
                  </Button>
                </div>
              </div>
            </div>
            <Table columns={orderColumns} data={eligibleOrders} actions={orderActions} />
            {eligibleOrders.length === 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 text-center text-sm text-gray-500">
                Nenhum pedido encontrado para os filtros selecionados.
              </div>
            )}
            {Object.entries(validationByOrder).map(([orderId, result]) => (
              <div key={orderId} className={`p-4 rounded-xl border text-sm ${result.ok === false ? 'bg-red-50 border-red-200 text-red-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                <p className="font-semibold">Validação do pedido {orderId.slice(0, 8)}</p>
                {result.errors?.length ? <p>{result.errors.join(' ')}</p> : <p>Modelo {result.model}, série {result.series}, próximo número {result.number}. Total: R$ {(result.totals?.invoice || 0).toFixed(2)}</p>}
                {!isReadOnly && result.itemIssues?.length ? (
                  <div className="mt-3 space-y-2">
                    <p className="font-medium">Complete o cadastro fiscal do produto para liberar a emissão:</p>
                    {result.itemIssues.map((issue) => (
                      <div key={`${issue.productId || issue.code || issue.index}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-red-200 bg-white/70 p-3">
                        <span>
                          <strong>{issue.description}</strong> - pendente: {issue.fields.join(', ')}
                          {issue.fields.length === 1 && issue.fields.includes('NCM') && (
                            <span className="block text-xs text-red-700 mt-1">
                              Clique para conferir e salvar o NCM. O padrão 1905.90.90 já será sugerido para confeitaria/pastelaria.
                            </span>
                          )}
                        </span>
                        <Button size="sm" variant="outline" onClick={() => handleCorrectFiscalProduct(orderId, issue)}>
                          <Edit className="w-4 h-4" /> {issue.fields.length === 1 && issue.fields.includes('NCM') ? 'Configurar NCM' : 'Configurar produto'}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {result.warnings?.length ? <p className="mt-1">{result.warnings.join(' ')}</p> : null}
              </div>
            ))}
            {busyOrderId && <p className="text-sm text-gray-500">Processando operação fiscal...</p>}
          </div>
        )}

        {activeTab === 'notas' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-lg border border-gray-100 space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,1fr)_170px_170px_190px] gap-3 items-end">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Busca rápida</label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      value={invoiceFilters.search}
                      onChange={(e) => setInvoiceFilter('search', e.target.value)}
                      placeholder="Buscar por número da NFC-e, pedido, cliente, CPF/CNPJ ou chave de acesso"
                      className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <Input
                  label="Data inicial"
                  type="date"
                  value={invoiceFilters.start}
                  onChange={(e) => setInvoiceFilter('start', e.target.value)}
                />
                <Input
                  label="Data final"
                  type="date"
                  value={invoiceFilters.end}
                  onChange={(e) => setInvoiceFilter('end', e.target.value)}
                />
                <Select label="Status da nota" value={invoiceFilters.status} onChange={(e) => setInvoiceFilter('status', e.target.value)}>
                  {invoiceStatusFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input
                  label="Emitente / CNPJ"
                  value={invoiceFilters.issuerDocument}
                  onChange={(e) => setInvoiceFilter('issuerDocument', e.target.value)}
                  placeholder={issuerForm.cnpj ? maskCpfCnpj(issuerForm.cnpj) : 'CNPJ da loja'}
                />
                <Input
                  label="Valor mínimo"
                  type="number"
                  min="0"
                  step="0.01"
                  value={invoiceFilters.minValue}
                  onChange={(e) => setInvoiceFilter('minValue', e.target.value)}
                  placeholder="R$ 0,00"
                />
                <Input
                  label="Valor máximo"
                  type="number"
                  min="0"
                  step="0.01"
                  value={invoiceFilters.maxValue}
                  onChange={(e) => setInvoiceFilter('maxValue', e.target.value)}
                  placeholder="R$ 999,99"
                />
              </div>
              {showAdvancedInvoiceFilters && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    <Input label="Chave de acesso" value={invoiceFilters.key} onChange={(e) => setInvoiceFilter('key', e.target.value)} placeholder="522606..." />
                    <Input label="Número da NFC-e" value={invoiceFilters.number} onChange={(e) => setInvoiceFilter('number', e.target.value)} placeholder="000000008" />
                    <Input label="Série" value={invoiceFilters.series} onChange={(e) => setInvoiceFilter('series', e.target.value)} placeholder="001" />
                    <Input label="Pedido interno" value={invoiceFilters.orderId} onChange={(e) => setInvoiceFilter('orderId', e.target.value)} placeholder="RQMWj9ap" />
                    <Input label="CPF/CNPJ do consumidor" value={invoiceFilters.customerDocument} onChange={(e) => setInvoiceFilter('customerDocument', e.target.value)} placeholder="058.559.683-24" />
                    <Input label="Nome do consumidor" value={invoiceFilters.customerName} onChange={(e) => setInvoiceFilter('customerName', e.target.value)} placeholder="Antonio Pedro" />
                    <Input label="Protocolo de autorização" value={invoiceFilters.protocol} onChange={(e) => setInvoiceFilter('protocol', e.target.value)} />
                    <Input label="Forma de pagamento" value={invoiceFilters.paymentMethod} onChange={(e) => setInvoiceFilter('paymentMethod', e.target.value)} placeholder="Cartão, Pix..." />
                    <Input label="Motivo / rejeição" value={invoiceFilters.reason} onChange={(e) => setInvoiceFilter('reason', e.target.value)} />
                  </div>
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-sm text-gray-500">
                  Mostrando <strong className="text-gray-800">{filteredInvoices.length}</strong> de <strong className="text-gray-800">{invoices.length}</strong> notas.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setShowAdvancedInvoiceFilters((prev) => !prev)}>
                    <Search className="w-4 h-4" /> {showAdvancedInvoiceFilters ? 'Ocultar avançados' : 'Filtros avançados'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setInvoiceFilters((prev) => ({ ...prev, ...getCurrentMonthDateRange() }))}
                  >
                    <Calendar className="w-4 h-4" /> Mês atual
                  </Button>
                  <Button size="sm" variant="outline" onClick={resetInvoiceFiltersToCurrentMonth}>
                    <RefreshCw className="w-4 h-4" /> Limpar filtros
                  </Button>
                </div>
              </div>
            </div>
            <Table columns={invoiceColumns} data={filteredInvoices} actions={invoiceActions} />
            {filteredInvoices.length === 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 text-center text-sm text-gray-500">
                Nenhuma nota encontrada para os filtros selecionados.
              </div>
            )}
          </div>
        )}

        {activeTab === 'produtos' && (
          <div className="space-y-4">
            {!isReadOnly && <div className="flex justify-end">
              <Button onClick={() => { resetProductForm(); setShowProductModal(true); }}><Plus className="w-4 h-4" /> Produto fiscal</Button>
            </div>}
            <Table columns={fiscalProductColumns} data={fiscalProducts} actions={productActions} />
          </div>
        )}

        {activeTab === 'configuracao' && (
          <form onSubmit={handleSaveFiscalConfig} className="space-y-6">
            {isReadOnly && (
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50 text-sm text-blue-800">
                Perfil Contador: consulta habilitada. Alterações fiscais, emissão e cancelamento não estão disponíveis.
              </div>
            )}
            <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 space-y-4">
              <h3 className="text-lg font-bold text-gray-800">Emitente</h3>
              {configLoading && <p className="text-sm text-gray-500">Carregando configuração...</p>}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input disabled={isReadOnly} label="CNPJ" value={issuerForm.cnpj || ''} onChange={(e) => setIssuerField('cnpj', e.target.value)} />
                <Input disabled={isReadOnly} label="Razão social" value={issuerForm.legalName || ''} onChange={(e) => setIssuerField('legalName', e.target.value)} />
                <Input disabled={isReadOnly} label="Nome fantasia" value={issuerForm.tradeName || ''} onChange={(e) => setIssuerField('tradeName', e.target.value)} />
                <Input disabled={isReadOnly} label="Inscrição estadual" value={issuerForm.stateRegistration || ''} onChange={(e) => setIssuerField('stateRegistration', e.target.value)} />
                <Select disabled={isReadOnly} label="Regime tributário" value={issuerForm.taxRegime || 1} onChange={(e) => setIssuerField('taxRegime', Number(e.target.value))}>
                  <option value={1}>Simples Nacional</option>
                  <option value={2}>Simples excesso sublimite</option>
                  <option value={3}>Regime normal</option>
                </Select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Input disabled={isReadOnly} label="Logradouro" value={issuerForm.address?.street || ''} onChange={(e) => setIssuerAddressField('street', e.target.value)} />
                <Input disabled={isReadOnly} label="Número" value={issuerForm.address?.number || ''} onChange={(e) => setIssuerAddressField('number', e.target.value)} />
                <Input disabled={isReadOnly} label="Bairro" value={issuerForm.address?.district || ''} onChange={(e) => setIssuerAddressField('district', e.target.value)} />
                <Input disabled={isReadOnly} label="CEP" value={issuerForm.address?.zip || ''} onChange={(e) => setIssuerAddressField('zip', e.target.value)} />
                <Input disabled={isReadOnly} label="Município" value={issuerForm.address?.city || ''} onChange={(e) => setIssuerAddressField('city', e.target.value)} />
                <Input disabled={isReadOnly} label="Código IBGE" value={issuerForm.address?.cityCode || ''} onChange={(e) => setIssuerAddressField('cityCode', e.target.value)} />
                <Input disabled={isReadOnly} label="UF" value={issuerForm.address?.state || ''} onChange={(e) => setIssuerAddressField('state', e.target.value.toUpperCase())} />
                <Input disabled={isReadOnly} label="Telefone" value={issuerForm.address?.phone || ''} onChange={(e) => setIssuerAddressField('phone', e.target.value)} />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Certificado digital A1</h3>
                  <p className="text-sm text-gray-500">Envie o .pfx da loja. O arquivo e a senha ficam no Secret Manager.</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${certificateInfo?.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                  {certificateInfo?.status === 'active' ? 'Certificado ativo' : 'Certificado pendente'}
                </span>
              </div>
              {certificateInfo?.status === 'active' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm bg-gray-50 rounded-xl p-4">
                  <p><strong>CNPJ:</strong> {certificateInfo.cnpj || '-'}</p>
                  <p><strong>Validade:</strong> {certificateInfo.validUntil ? formatDateTime(certificateInfo.validUntil) : '-'}</p>
                  <p><strong>Arquivo:</strong> {certificateInfo.filename || '-'}</p>
                  <p><strong>NFC-e CSC:</strong> {certificateInfo.nfceCscSecretVersion || certificateInfo.hasCsc ? 'Configurado' : 'Pendente'}</p>
                </div>
              )}
              {!isReadOnly && <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Certificado A1 (.pfx)</label>
                  <input type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={(e) => setCertificateForm({ ...certificateForm, file: e.target.files?.[0] || null })} className="w-full px-4 py-3 border rounded-xl border-gray-300 bg-white" />
                </div>
                <Input label="Senha do certificado" type="password" value={certificateForm.password} onChange={(e) => setCertificateForm({ ...certificateForm, password: e.target.value })} />
                <Input label="ID CSC" value={certificateForm.cscId} onChange={(e) => setCertificateForm({ ...certificateForm, cscId: e.target.value })} />
                <div className="md:col-span-3"><Input label="CSC NFC-e" type="password" value={certificateForm.csc} onChange={(e) => setCertificateForm({ ...certificateForm, csc: e.target.value })} /></div>
                <div className="flex items-end">
                  <Button type="button" disabled={certificateUploading} onClick={handleUploadCertificate} className="w-full">
                    <Save className="w-4 h-4" /> {certificateUploading ? 'Enviando...' : 'Salvar certificado'}
                  </Button>
                </div>
              </div>}
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 space-y-4">
              <h3 className="text-lg font-bold text-gray-800">Emissão</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select disabled={isReadOnly} label="Ambiente" value={settingsForm.environment} onChange={(e) => setSettingsForm({ ...settingsForm, environment: e.target.value })}>
                  <option value="homologation">Homologação</option>
                  <option value="production">Produção</option>
                </Select>
                <Input disabled={isReadOnly} label="Série NF-e 55" type="number" value={settingsForm.nfeSeries || 1} onChange={(e) => setSettingsForm({ ...settingsForm, nfeSeries: e.target.value })} />
                <Input disabled={isReadOnly} label="Série NFC-e 65" type="number" value={settingsForm.nfceSeries || 1} onChange={(e) => setSettingsForm({ ...settingsForm, nfceSeries: e.target.value })} />
                <Input disabled={isReadOnly} label="Natureza da operação" value={settingsForm.operationNature || ''} onChange={(e) => setSettingsForm({ ...settingsForm, operationNature: e.target.value })} />
                <Input disabled={isReadOnly} label="Pagamento padrão" value={settingsForm.defaultPaymentMethodCode || '99'} onChange={(e) => setSettingsForm({ ...settingsForm, defaultPaymentMethodCode: e.target.value })} />
                <Input disabled={isReadOnly} label="Indicador de presença" type="number" value={settingsForm.defaultPresence || 2} onChange={(e) => setSettingsForm({ ...settingsForm, defaultPresence: e.target.value })} />
                {isPlatformAdmin && (
                  <div className="md:col-span-3">
                    <Input
                      disabled={isReadOnly}
                      label="URL única do serviço fiscal (Cloud Run) - plataforma"
                      value={settingsForm.serviceUrl || ''}
                      placeholder="https://fiscal-service-xxxxx-rj.a.run.app"
                      onChange={(e) => setSettingsForm({ ...settingsForm, serviceUrl: e.target.value })}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Configuração global protegida; não pertence a uma loja.
                      {platformService?.configured ? ` Origem atual: ${platformService.source || 'backend'}.` : ' Ainda não configurada.'}
                    </p>
                  </div>
                )}
              </div>
              {!isReadOnly && <div className="flex justify-end">
                <Button type="submit" disabled={configSaving}><Save className="w-4 h-4" /> {configSaving ? 'Salvando...' : 'Salvar configuração fiscal'}</Button>
              </div>}
            </div>
          </form>
        )}

        <Modal isOpen={showProductModal} onClose={() => { setShowProductModal(false); setProductCorrectionOrderId(''); resetProductForm(); }} title={editingFiscalProduct ? 'Editar produto fiscal' : 'Novo produto fiscal'} size="lg">
          <form onSubmit={handleSaveFiscalProduct} className="space-y-4">
            <p className="text-sm text-gray-600">Selecione a classificação fiscal validada pelo contador. O padrão é 1905.90.90 para itens típicos de confeitaria/pastelaria; o CFOP é escolhido na emissão.</p>
            <div className="flex flex-wrap gap-3 text-sm">
              <a href="https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/classificacao-fiscal-de-mercadorias/ncm" target="_blank" rel="noreferrer" className="text-pink-700 underline hover:text-pink-800">Consultar NCM na Receita Federal</a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-gray-700">Produto vinculado</label>
                  <span className="text-xs font-medium text-gray-500">{selectedFiscalProductIds.length} selecionado(s)</span>
                </div>
                <div className="rounded-xl border border-gray-300 bg-white">
                  <div className="relative border-b border-gray-100 p-3">
                    <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      disabled={Boolean(editingFiscalProduct)}
                      value={fiscalProductSearchTerm}
                      onChange={(event) => setFiscalProductSearchTerm(event.target.value)}
                      placeholder="Pesquisar produto pelo nome"
                      className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-3 text-sm focus:border-transparent focus:ring-2 focus:ring-pink-500 disabled:bg-gray-50"
                    />
                  </div>
                  {!editingFiscalProduct && (
                    <label className="flex cursor-pointer items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-pink-50">
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={filteredFiscalProductOptions.length > 0 && filteredFiscalProductOptions.every((produto) => selectedFiscalProductIdSet.has(String(produto.id)))}
                          onChange={(event) => toggleAllVisibleFiscalProducts(event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                        />
                        Selecionar todos
                      </span>
                      <span className="text-xs text-gray-500">{filteredFiscalProductOptions.length} produto(s)</span>
                    </label>
                  )}
                  <div className="max-h-64 overflow-y-auto">
                    {filteredFiscalProductOptions.length ? filteredFiscalProductOptions.map((produto) => {
                      const isSelected = selectedFiscalProductIdSet.has(String(produto.id));
                      const alreadyRegistered = fiscalProductsById.has(String(produto.id));
                      return (
                        <label key={produto.id} className={`flex cursor-pointer items-start justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-pink-50 ${isSelected ? 'bg-pink-50' : ''}`}>
                          <span className="flex min-w-0 items-start gap-3">
                            <input
                              type="checkbox"
                              disabled={Boolean(editingFiscalProduct)}
                              checked={isSelected}
                              onChange={() => toggleFiscalProductSelection(produto.id)}
                              className="mt-1 h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500 disabled:opacity-60"
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-gray-800">{produto.nome || produto.id}</span>
                              <span className="block truncate text-xs text-gray-500">{produto.categoriaPrincipal || produto.categoria || 'Produto da loja'}</span>
                            </span>
                          </span>
                          {alreadyRegistered && <span className="shrink-0 rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">Cadastrado</span>}
                        </label>
                      );
                    }) : (
                      <div className="px-4 py-6 text-center text-sm text-gray-500">Nenhum produto encontrado.</div>
                    )}
                  </div>
                </div>
              </div>
              {selectedExistingFiscalProductCount > 0 && !editingFiscalProduct && (
                <div className="md:col-span-2 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                  <p className="text-sm font-medium text-yellow-900">{selectedExistingFiscalProductCount} produto(s) selecionado(s) já possuem cadastro fiscal.</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-yellow-950 md:grid-cols-3">
                    {[
                      ['fill-empty', 'Atualizar campos vazios'],
                      ['ignore', 'Ignorar existentes'],
                      ['overwrite', 'Sobrescrever existentes']
                    ].map(([value, label]) => (
                      <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/70 px-3 py-2">
                        <input
                          type="radio"
                          name="fiscalProductConflictMode"
                          value={value}
                          checked={fiscalProductConflictMode === value}
                          onChange={(event) => setFiscalProductConflictMode(event.target.value)}
                          className="text-pink-600 focus:ring-pink-500"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <Input
                label="Código"
                value={productForm.code}
                disabled={hasMultipleFiscalProductsSelected}
                placeholder={hasMultipleFiscalProductsSelected ? 'Automático por produto' : ''}
                onChange={(e) => setProductForm({ ...productForm, code: e.target.value })}
              />
              <Input
                label="Descrição fiscal"
                value={productForm.description}
                disabled={hasMultipleFiscalProductsSelected}
                placeholder={hasMultipleFiscalProductsSelected ? 'Usa o nome de cada produto' : ''}
                onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                required={!hasMultipleFiscalProductsSelected}
              />
              <Select label="NCM do produto" value={normalizeFiscalCode(productForm.ncm)} onChange={(e) => setProductForm({ ...productForm, ncm: e.target.value })} required>
                {productForm.ncm && !NCM_PRODUCT_OPTIONS.some((option) => option.value === normalizeFiscalCode(productForm.ncm)) && (
                  <option value={normalizeFiscalCode(productForm.ncm)}>{formatNcmCode(productForm.ncm)} - NCM cadastrado</option>
                )}
                {NCM_PRODUCT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
              <Input label="Unidade" value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })} />
              <Input label="Origem" type="number" value={productForm.origin} onChange={(e) => setProductForm({ ...productForm, origin: e.target.value })} />
              <Input label="ICMS/CST" value={productForm.csosn} onChange={(e) => setProductForm({ ...productForm, csosn: e.target.value })} />
              <Input label="CEST" value={productForm.cest} onChange={(e) => setProductForm({ ...productForm, cest: e.target.value })} />
              <Input label="PIS CST" value={productForm.pisCst} onChange={(e) => setProductForm({ ...productForm, pisCst: e.target.value })} />
              <Input label="COFINS CST" value={productForm.cofinsCst} onChange={(e) => setProductForm({ ...productForm, cofinsCst: e.target.value })} />
              <Input label="Código de benefício" value={productForm.cBenef} onChange={(e) => setProductForm({ ...productForm, cBenef: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="secondary" type="button" disabled={savingFiscalProducts} onClick={() => { setShowProductModal(false); resetProductForm(); }}>Cancelar</Button>
              <Button type="submit" disabled={savingFiscalProducts}><Save className="w-4 h-4" /> {savingFiscalProducts ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={Boolean(orderToEditBeforeInvoice)}
          onClose={() => {
            if (orderEditSaving) return;
            setOrderToEditBeforeInvoice(null);
            setOrderEditProductSearch('');
            setOrderEditError('');
          }}
          title="Editar pedido antes da nota"
          size="xl"
        >
          <form onSubmit={handleSavePreInvoiceOrderEdit} data-unsaved-changes={Boolean(orderToEditBeforeInvoice)} className="space-y-5">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Ajuste aqui os dados que serão usados na emissão fiscal. Depois de salvar, valide o pedido novamente antes de emitir a nota.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="Cliente cadastrado" value={orderEditForm.clienteId || ''} onChange={(event) => handleOrderEditClientChange(event.target.value)}>
                <option value="">Cliente manual / não vinculado</option>
                {(data.clientes || []).map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}
              </Select>
              <Input label="Nome do cliente na nota" value={orderEditForm.clienteNome || ''} onChange={(event) => setOrderEditDraft((prev) => ({ ...prev, clienteNome: event.target.value }))} required />
              <Input label="Telefone" value={orderEditForm.telefone || ''} onChange={(event) => setOrderEditDraft((prev) => ({ ...prev, telefone: event.target.value }))} />
              <Select label="Forma de pagamento" value={orderEditForm.formaPagamento || DEFAULT_ORDER_PAYMENT_METHOD} onChange={(event) => setOrderEditDraft((prev) => ({ ...prev, formaPagamento: event.target.value }))}>
                {ORDER_PAYMENT_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </Select>
              <div className="md:col-span-2">
                <Input label="Endereço do cliente" value={orderEditForm.clienteEndereco || ''} onChange={(event) => setOrderEditDraft((prev) => ({ ...prev, clienteEndereco: event.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <Textarea
                  label="Observação da nota/pedido"
                  rows={3}
                  value={orderEditForm.observacao || ''}
                  onChange={(event) => setOrderEditDraft((prev) => ({ ...prev, observacao: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,0.9fr)_minmax(360px,1.1fr)] gap-5">
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-800">Adicionar ou trocar produtos</h3>
                <Input
                  label="Buscar produto"
                  placeholder="Buscar por nome, código ou categoria"
                  value={orderEditProductSearch}
                  onChange={(event) => setOrderEditProductSearch(event.target.value)}
                />
                <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2">
                  {orderEditFilteredProducts.length ? orderEditFilteredProducts.map((product) => (
                    <div key={product.id} className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-pink-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-800">{product.nome}</p>
                        <p className="text-xs text-gray-500">{product.categoria || 'Produto'} - {formatCurrencyBR(product.preco || 0)}</p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => handleAddProductToPreInvoiceOrder(product)}>+</Button>
                    </div>
                  )) : (
                    <p className="p-4 text-center text-sm text-gray-500">Nenhum produto encontrado.</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-gray-800">Itens do pedido</h3>
                  <span className="text-sm text-gray-500">{(orderEditForm.itens || []).length} item(ns)</span>
                </div>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white">
                  {(orderEditForm.itens || []).length ? (orderEditForm.itens || []).map((item, index) => {
                    const productId = String(getOrderItemProductId(item) || '');
                    const selectedProductExists = storeProducts.some((product) => String(product.id) === productId);
                    return (
                      <div key={`${productId || item.nome || index}-${index}`} className="grid grid-cols-1 gap-3 border-b border-gray-100 p-3 last:border-b-0">
                        <Select label="Produto" value={productId} onChange={(event) => handleReplacePreInvoiceOrderItem(index, event.target.value)}>
                          {!selectedProductExists && productId && <option value={productId}>{item.nome || productId}</option>}
                          {storeProducts.map((product) => <option key={product.id} value={product.id}>{product.nome}</option>)}
                        </Select>
                        <div className="grid grid-cols-[120px_1fr_auto] gap-3 items-end">
                          <Input
                            label="Qtd."
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.quantity ?? item.quantidade ?? 1}
                            onChange={(event) => handleUpdatePreInvoiceOrderItem(index, 'quantity', event.target.value)}
                          />
                          <Input
                            label="Valor unitário"
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.preco ?? item.unitPrice ?? 0}
                            onChange={(event) => handleUpdatePreInvoiceOrderItem(index, 'preco', event.target.value)}
                          />
                          <button type="button" onClick={() => handleRemovePreInvoiceOrderItem(index)} className="mb-1 rounded-lg p-3 text-red-500 hover:bg-red-50" title="Remover item">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="text-right text-sm font-semibold text-gray-700">
                          Total do item: {formatCurrencyBR((Number(item.preco || item.unitPrice || 0) || 0) * (Number(item.quantity || item.quantidade || 1) || 1))}
                        </p>
                      </div>
                    );
                  }) : (
                    <p className="p-6 text-center text-sm text-gray-500">Nenhum produto no pedido.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <Input label="Desconto (R$)" type="number" min="0" step="0.01" value={orderEditForm.desconto || 0} onChange={(event) => setOrderEditDraft((prev) => ({ ...prev, desconto: event.target.value, cupom: null }))} />
                <Input label="Frete (R$)" type="number" min="0" step="0.01" value={orderEditForm.valorFrete || 0} onChange={(event) => setOrderEditDraft((prev) => ({ ...prev, valorFrete: event.target.value, frete: event.target.value }))} />
                <div className="rounded-xl bg-white p-3 text-sm text-gray-700">
                  <p>Subtotal</p>
                  <p className="text-lg font-bold text-gray-900">{formatCurrencyBR(orderEditForm.subtotal || 0)}</p>
                </div>
                <div className="rounded-xl bg-pink-50 p-3 text-sm text-pink-700">
                  <p>Total</p>
                  <p className="text-lg font-bold">{formatCurrencyBR(orderEditForm.total || 0)}</p>
                </div>
              </div>
            </div>

            {orderEditError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {orderEditError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                type="button"
                disabled={orderEditSaving}
                onClick={() => {
                  setOrderToEditBeforeInvoice(null);
                  setOrderEditProductSearch('');
                  setOrderEditError('');
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={orderEditSaving}>
                <Save className="w-4 h-4" /> {orderEditSaving ? 'Salvando...' : 'Salvar pedido'}
              </Button>
            </div>
          </form>
        </Modal>

        <Modal isOpen={Boolean(orderToIssue)} onClose={() => { if (!busyOrderId) { setOrderToIssue(null); setIssueAdditionalInfo(''); setIssueError(''); } }} title="Emitir nota fiscal" size="lg">
          <form onSubmit={handleConfirmIssue} className="space-y-4">
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-700">
              <p><strong>Pedido:</strong> {orderToIssue?.id?.slice(0, 8) || '-'}</p>
              <p><strong>Cliente:</strong> {orderToIssue?.clienteNome || '-'}</p>
              <p><strong>Total:</strong> R$ {(orderToIssue?.total || 0).toFixed(2)}</p>
            </div>
            <Textarea
              label="Informações adicionais da nota fiscal"
              rows={4}
              maxLength={5000}
              value={issueAdditionalInfo}
              onChange={(event) => setIssueAdditionalInfo(event.target.value)}
            />
            {issueError && <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">{issueError}</div>}
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="secondary" type="button" disabled={Boolean(busyOrderId)} onClick={() => { setOrderToIssue(null); setIssueAdditionalInfo(''); setIssueError(''); }}>Cancelar</Button>
              <Button type="submit" disabled={Boolean(busyOrderId)}><Printer className="w-4 h-4" /> {busyOrderId ? 'Emitindo...' : 'Confirmar emissão'}</Button>
            </div>
          </form>
        </Modal>

        <Modal isOpen={Boolean(invoiceToView)} onClose={() => setInvoiceToView(null)} title="Detalhes da NFC-e" size="xl">
          {invoiceToView && (() => {
            const invoice = invoiceToView;
            const order = getInvoiceOrder(invoice);
            const items = getInvoiceItems(invoice);
            const customerDocument = getInvoiceCustomerDocument(invoice);
            const displayedCustomerDocument = canViewFullFiscalDocument ? (customerDocument || '-') : maskCpfCnpj(customerDocument);
            const customerAddress = getOrderCustomerAddress(invoice);
            const issuerAddress = issuerForm.address || {};
            const reason = fiscalReturnReason(invoice);
            const value = getInvoiceValue(invoice);
            const discount = getInvoiceDiscount(invoice);
            const freight = getInvoiceFreight(invoice);
            const paidAmount = getInvoicePaidAmount(invoice);
            const change = getInvoiceChange(invoice);
            const paymentCode = getInvoicePaymentCode(invoice);
            const sefazUrl = sefazConsultaUrl(invoice);
            const statusBadge = <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${statusClass[invoice.status] || 'bg-gray-100 text-gray-700'}`}>{statusLabel[invoice.status] || invoice.status || '-'}</span>;

            return (
              <div className="space-y-4 bg-gray-50/60">
                <DetailSection title="Identificação da nota">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    <DetailField label="Chave de acesso" value={invoice.key || '-'} mono full />
                    <DetailField label="Número da NFC-e" value={formatFiscalNumber(invoice.number)} mono />
                    <DetailField label="Série" value={formatFiscalSeries(invoice.series)} mono />
                    <DetailField label="Modelo" value={invoice.model || '-'} />
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Status</p>
                      <div className="mt-1">{statusBadge}</div>
                    </div>
                    <DetailField label="Emissão" value={formatDateTime(invoice.issuedAt || invoice.createdAt)} />
                    <DetailField label="Protocolo de autorização" value={invoice.protocol || '-'} mono />
                    <DetailField label="Autorização" value={formatDateTime(invoice.authorizedAt || invoice.serviceResult?.authorizedAt || (invoice.status === 'authorized' ? invoice.updatedAt : null))} />
                    <DetailField label="Motivo/status SEFAZ" value={reason || '-'} full />
                    <DetailField label="Observação" value={invoice.additionalInfo || '-'} full />
                    <DetailField label="Justificativa de cancelamento" value={invoice.cancelReason || '-'} full />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="secondary" onClick={() => handleCopyInvoiceKey(invoice)}><Key className="w-4 h-4" /> Copiar chave</Button>
                    {sefazUrl && (
                      <a href={sefazUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-md transition-all hover:bg-gray-50" title="Consultar esta NFC-e na SEFAZ pela chave de acesso">
                        <Search className="w-4 h-4" /> Consultar na SEFAZ
                      </a>
                    )}
                  </div>
                </DetailSection>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <DetailSection title="Emitente">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <DetailField label="Razão social" value={issuerForm.legalName || '-'} />
                      <DetailField label="CNPJ" value={getInvoiceIssuerDocument(invoice) || '-'} mono />
                      <DetailField label="Inscrição Estadual" value={issuerForm.stateRegistration || '-'} mono />
                      <DetailField label="Telefone" value={issuerAddress.phone || '-'} />
                      <DetailField label="Endereço" value={fiscalAddressText(issuerAddress)} full />
                      <DetailField label="Cidade/UF" value={fiscalCityText(issuerAddress)} />
                    </div>
                  </DetailSection>

                  <DetailSection title="Consumidor">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <DetailField label="Nome" value={getInvoiceCustomerName(invoice)} />
                      <DetailField label="CPF/CNPJ" value={displayedCustomerDocument} mono />
                      <DetailField label="Endereço" value={fiscalAddressText(customerAddress)} full />
                      <DetailField label="Cidade/UF" value={fiscalCityText(customerAddress)} />
                    </div>
                  </DetailSection>
                </div>

                <DetailSection title="Itens da nota">
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full bg-white text-sm">
                      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-3 py-2">Código</th>
                          <th className="px-3 py-2">Descrição</th>
                          <th className="px-3 py-2">Quantidade</th>
                          <th className="px-3 py-2">Unidade</th>
                          <th className="px-3 py-2">Valor unitário</th>
                          <th className="px-3 py-2">Valor total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {items.length ? items.map((item, index) => {
                          const quantity = Number(item.quantity ?? item.quantidade ?? item.qCom ?? 1) || 1;
                          const unitValue = Number(item.unitValue ?? item.valorUnitario ?? item.preco ?? item.valor ?? 0) || 0;
                          const totalValue = Number(item.total ?? item.valorTotal ?? item.vProd ?? unitValue * quantity) || 0;
                          return (
                            <tr key={`${item.id || item.productId || item.code || index}`}>
                              <td className="px-3 py-2 font-mono text-xs text-gray-600">{item.code || item.codigo || item.productId || item.id || index + 1}</td>
                              <td className="px-3 py-2">{item.description || item.nome || item.produto || 'Produto'}</td>
                              <td className="px-3 py-2">{quantity}</td>
                              <td className="px-3 py-2">{item.unit || item.unidade || 'un'}</td>
                              <td className="px-3 py-2">{formatCurrencyBR(unitValue)}</td>
                              <td className="px-3 py-2 font-semibold text-gray-800">{formatCurrencyBR(totalValue)}</td>
                            </tr>
                          );
                        }) : (
                          <tr>
                            <td colSpan={6} className="px-3 py-6 text-center text-gray-500">Nenhum item detalhado encontrado para esta nota.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </DetailSection>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <DetailSection title="Totais">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <DetailField label="Quantidade total de itens" value={items.length || '-'} />
                      <DetailField label="Valor total" value={formatCurrencyBR(value)} />
                      <DetailField label="Desconto" value={formatCurrencyBR(discount)} />
                      <DetailField label="Frete" value={formatCurrencyBR(freight)} />
                      <DetailField label="Valor a pagar" value={formatCurrencyBR(value)} />
                      <DetailField label="Troco" value={formatCurrencyBR(change)} />
                    </div>
                  </DetailSection>

                  <DetailSection title="Pagamento">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-800">
                      <p><strong>{getInvoicePaymentMethod(invoice)}</strong> — {formatCurrencyBR(paidAmount)}</p>
                      {paymentCode && (
                        <p className="mt-2 text-xs text-gray-500">
                          Código fiscal usado: <span className="font-mono font-semibold text-gray-700">{paymentCode}</span>
                          {invoice.payment?.fallbackUsed ? ' (fallback da configuração)' : ''}
                        </p>
                      )}
                    </div>
                  </DetailSection>
                </div>

                <DetailSection title="Arquivos e ações fiscais">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => handleDownloadInvoicePdf(invoice)} disabled={invoice.status !== 'authorized'} title="Visualizar ou baixar DANFE/PDF"><FileText className="w-4 h-4" /> DANFE/PDF</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleDownloadInvoiceXml(invoice)} disabled={invoice.status !== 'authorized'} title="Baixar XML autorizado"><Download className="w-4 h-4" /> XML</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleCopyInvoiceKey(invoice)} title="Copiar chave de acesso"><Key className="w-4 h-4" /> Copiar chave</Button>
                    {sefazUrl && (
                      <a href={sefazUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-md transition-all hover:bg-gray-50" title="Consultar na SEFAZ pela chave de acesso">
                        <Search className="w-4 h-4" /> SEFAZ
                      </a>
                    )}
                    {!isReadOnly && invoice.status === 'authorized' && (
                      <Button size="sm" variant="danger" onClick={() => { setInvoiceToView(null); handleOpenCancelInvoice(invoice); }} title="Cancelar NFC-e autorizada"><X className="w-4 h-4" /> Cancelar NFC-e</Button>
                    )}
                  </div>
                </DetailSection>
              </div>
            );
          })()}
        </Modal>

        <Modal isOpen={Boolean(invoiceToCancel)} onClose={() => { if (!busyOrderId) { setInvoiceToCancel(null); setCancelReason(''); setCancelError(''); } }} title="Cancelar nota fiscal" size="md">
          <form onSubmit={handleConfirmCancelInvoice} className="space-y-4">
            <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-800">
              <p><strong>Nota:</strong> {invoiceToCancel ? `${invoiceToCancel.model || '-'} / ${invoiceToCancel.series || '-'} / ${invoiceToCancel.number || '-'}` : '-'}</p>
              <p><strong>Chave:</strong> {invoiceToCancel?.key || '-'}</p>
            </div>
            <Textarea
              label="Justificativa do cancelamento"
              rows={4}
              minLength={15}
              maxLength={255}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              required
            />
            {cancelError && <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">{cancelError}</div>}
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="secondary" type="button" disabled={Boolean(busyOrderId)} onClick={() => { setInvoiceToCancel(null); setCancelReason(''); setCancelError(''); }}>Voltar</Button>
              <Button variant="danger" type="submit" disabled={Boolean(busyOrderId)}><X className="w-4 h-4" /> {busyOrderId ? 'Cancelando...' : 'Confirmar cancelamento'}</Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  };

  const PlaceholderPage = ({ title }) => (<div className="p-6"><h1 className="text-3xl font-bold text-pink-600">{title}</h1><p>Em desenvolvimento...</p></div>);
  const userHasPermission = useCallback((menuId) => {
    if (!user) return menuId === 'pagina-inicial';

    if (user.role === ROLE_OWNER && !user?.hasCustomProfile) return true;

    const menuItem = allMenuItems.find(item => item.id === menuId);
    const permissionKey = menuItem?.permission || menuId;

    if (user.customPermissions) {
      return Boolean(user.customPermissions[permissionKey]);
    }

    const normalizedPermissions = sanitizePermissions(user.permissions, user.role);

    if (menuItem?.roles?.includes(user.role)) {
      return true;
    }

    return Boolean(normalizedPermissions[permissionKey]);
  }, [allMenuItems, user]);

  const canCreateStores = useMemo(() => {
    if (!user) return false;
    return user.role === ROLE_OWNER || user.role === ROLE_MANAGER;
  }, [user]);

  const effectiveStoreId = useMemo(() => {
    if (!user) return null;
    if (user.role === ROLE_OWNER && selectedStoreId === STORE_ALL_KEY) {
      return null;
    }
    try {
      return resolveActiveStoreForWrite();
    } catch (error) {
      return null;
    }
  }, [resolveActiveStoreForWrite, selectedStoreId, user]);

  const currentStoreIdForDisplay = useMemo(() => {
    if (!user) return null;
    if (user.role === ROLE_OWNER && selectedStoreId === STORE_ALL_KEY) {
      return STORE_ALL_KEY;
    }
    if (selectedStoreId) return selectedStoreId;
    const ids = resolveStoreIdsForView();
    return ids.length ? ids[0] : null;
  }, [user, selectedStoreId, resolveStoreIdsForView]);

  const renderCurrentPage = () => {
    if (authLoading || (loading && user)) {
      return (<div className="flex h-full w-full items-center justify-center"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-pink-500"></div></div>);
    }

    switch (currentPage) {
      case 'pagina-inicial': return <PaginaInicial />;
      case 'dashboard': return userHasPermission('dashboard') ? <Dashboard
                                        handleStopAndSnoozeAlarm={handleStopAndSnoozeAlarm}
                                        isAlarmPlaying={isAlarmPlaying}
                                        isAlarmSnoozed={isAlarmSnoozed}
                                        snoozeEndTime={snoozeEndTime}
                                        hasNewPendingOrders={hasNewPendingOrders}
                                        alarmPauseMinutes={resolvedAlarmPauseMinutes}
                                        // --- REMOVIDO: unlockAudio e audioUnlocked ---
                                        /> : <PaginaInicial />;
      case 'clientes': return userHasPermission('clientes') ? <Clientes /> : <PaginaInicial />;
      case 'produtos': return userHasPermission('produtos') ? <Produtos /> : <PaginaInicial />;
      case 'pedidos': return userHasPermission('pedidos') ? <Pedidos /> : <PaginaInicial />;
      case 'entre-lojas': return userHasPermission('entre-lojas') ? <EntreLojas /> : <PaginaInicial />;
      case 'agenda': return userHasPermission('agenda') ? <Agenda /> : <PaginaInicial />;
      case 'fornecedores': return userHasPermission('fornecedores') ? <Fornecedores data={data} addItem={addItem} updateItem={updateItem} deleteItem={deleteItem} setConfirmDelete={setConfirmDelete} effectiveStoreId={effectiveStoreId} updateStock={updateStock} currentUser={user} /> : <PaginaInicial />;
      case 'relatorios': return userHasPermission('relatorios') ? <Relatorios data={data} /> : <PaginaInicial />;
      case 'meu-espaco': return userHasPermission('meu-espaco') ? (
        <MeuEspaco
          user={user}
          resolveActiveStoreForWrite={resolveActiveStoreForWrite}
          currentStoreIdForDisplay={currentStoreIdForDisplay}
        />
      ) : <PaginaInicial />;
      case 'financeiro': return userHasPermission('financeiro') ? <Financeiro data={data} addItem={addItem} updateItem={updateItem} deleteItem={deleteItem} setConfirmDelete={setConfirmDelete} /> : <PaginaInicial />;
      case 'nota-fiscal': return userHasPermission('nota-fiscal') ? <NotaFiscal data={data} addItem={addItem} updateItem={updateItem} deleteItem={deleteItem} setConfirmDelete={setConfirmDelete} effectiveStoreId={effectiveStoreId} selectedStoreId={selectedStoreId} storeInfoMap={storeInfoMap} currentUser={user} /> : <PaginaInicial />;
      case 'ifood': return userHasPermission('ifood') ? <IfoodHub data={data} effectiveStoreId={effectiveStoreId} selectedStoreId={selectedStoreId} availableStores={availableStores} storeInfoMap={storeInfoMap} onSelectStore={selectStoreById} /> : <PaginaInicial />;
      case 'configuracoes': return userHasPermission('configuracoes') ? <Configuracoes user={user} setConfirmDelete={setConfirmDelete} data={data} addItem={addItem} updateItem={updateItem} deleteItem={deleteItem} availableStores={availableStores} storeInfoMap={storeInfoMap} resolveActiveStoreForWrite={resolveActiveStoreForWrite} selectedStoreId={selectedStoreId} /> : <PaginaInicial />;
      case 'financeiro': return user?.role === 'admin' ? <Financeiro data={data} addItem={addItem} updateItem={updateItem} deleteItem={deleteItem} setConfirmDelete={setConfirmDelete} /> : <PaginaInicial />;
      case 'configuracoes': return user?.role === 'admin' ? <Configuracoes user={user} setConfirmDelete={setConfirmDelete} data={data} addItem={addItem} updateItem={updateItem} deleteItem={deleteItem} /> : <PaginaInicial />;
      default: return user ? <PlaceholderPage title={allMenuItems.find(i=>i.id===currentPage)?.label || "Página"} /> : <PaginaInicial />;
    }
  };

  return (
    // --- REMOVIDO: onClick={unlockAudio} da div principal ---
    <div className="relative md:flex h-screen bg-gray-100 font-sans">
        {/* --- NOVO: Botão de ativação global renderizado condicionalmente --- */}
                {showActivateSoundButton && (
             <button
                id="btn-ativar-som"
                onClick={async () => {
                    await audioManager.userUnlock({ userGesture: true });
                    setAudioAllowed(audioManager.unlocked);
                    setShowActivateSoundButton(!audioManager.unlocked); // Esconde se desbloqueado
                }}
                className="fixed bottom-4 right-4 z-[9999] px-4 py-2 rounded-xl bg-pink-600 text-white border-none shadow-lg hover:bg-pink-700 transition-colors cursor-pointer"
             >
                🔊 Ativar som de pedidos
             </button>
        )}

        {isiOS && !soundUnlocked && (
          <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/50 px-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 text-center max-w-sm w-full space-y-3">
              <p className="text-lg font-semibold text-gray-800">Toque na tela para ativar o som</p>
              <p className="text-sm text-gray-600">Precisamos da sua interação para liberar os alertas de pedidos no iOS.</p>
            </div>
          </div>
        )}

        {!isDesktop && sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-30"></div>}
        
        <div className={`fixed md:relative flex flex-col bg-white shadow-lg h-full transition-transform duration-300 z-40 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${isDesktop ? (sidebarOpen ? 'w-64' : 'w-20') : 'w-64'}`}>
            <div className="flex items-center justify-between p-4 border-b h-16">
                <img src="logotipo.png" alt="Logotipo Ana Doceria" className={`h-8 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`} />
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg hover:bg-pink-50 hidden md:block">
                    <Menu className="w-6 h-6 text-gray-600" />
                </button>
            </div>
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto"> {/* Adicionado overflow */}
                {menuItems.map((item) => (
                    <button key={item.id} onClick={() => {setCurrentPage(item.id); if(!isDesktop) setSidebarOpen(false);}} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${currentPage === item.id ? 'bg-pink-100 text-pink-700' : 'hover:bg-pink-50 text-gray-700'} ${!sidebarOpen ? 'justify-center' : ''}`}>
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {(sidebarOpen || !isDesktop) && <span className="font-medium text-sm">{item.label}</span>} {/* Diminuído font size */}
                    </button>
                ))}
            </nav>
            {user && (
            <div className="p-4 border-t">
                <button onClick={handleLogout} className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-pink-50 text-gray-700 ${!sidebarOpen ? 'justify-center' : ''}`}>
                <LogOut className="w-5 h-5 flex-shrink-0" />
                {(sidebarOpen || !isDesktop) && <span className="text-sm">Sair</span>} {/* Diminuído font size */}
                </button>
            </div>
            )}
        </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 bg-white shadow-sm h-16 flex-shrink-0"> {/* Adicionado flex-shrink-0 */}
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-pink-50 md:hidden">
                <Menu className="w-6 h-6 text-gray-600" />
            </button>

            <div className="flex-1 flex items-center justify-center md:justify-start">
                {user && (
                    user.role === ROLE_OWNER ? (
                        <div className="flex items-center gap-3 flex-wrap">
                            {availableStores.length > 0 && (
                                <>
                                    <span className="text-sm text-gray-500 hidden sm:block">Visão:</span>
                                    <select value={currentStoreIdForDisplay || ''} onChange={handleStoreChange} className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-500">
                                        <option value={STORE_ALL_KEY}>Visão Geral</option>
                                        {availableStores.map(storeId => (
                                            <option key={storeId} value={storeId}>{storeInfoMap[storeId]?.nome || storeId}</option>
                                        ))}
                                    </select>
                                </>
                            )}
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setShowStoreManager(true)}
                                className="hidden sm:flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Adicionar Loja
                            </Button>
                            <button
                                type="button"
                                onClick={() => setShowStoreManager(true)}
                                className="sm:hidden inline-flex items-center justify-center p-2 rounded-lg border border-gray-300 text-pink-600 hover:bg-pink-50 focus:outline-none focus:ring-2 focus:ring-pink-500"
                                title="Adicionar Loja"
                            >
                                <Plus className="w-5 h-5" />
                                <span className="sr-only">Adicionar Loja</span>
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 flex-wrap">
                            {availableStores.length > 0 ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-500 hidden sm:block">Loja:</span>
                                    <select value={currentStoreIdForDisplay || ''} onChange={handleStoreChange} className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-500">
                                        {availableStores.map(storeId => (
                                            <option key={storeId} value={storeId}>{storeInfoMap[storeId]?.nome || storeId}</option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <span className="text-sm text-gray-500 hidden sm:block">Nenhuma loja cadastrada</span>
                            )}
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setShowStoreManager(true)}
                                className="hidden sm:flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Adicionar Loja
                            </Button>
                            <button
                                type="button"
                                onClick={() => setShowStoreManager(true)}
                                className="sm:hidden inline-flex items-center justify-center p-2 rounded-lg border border-gray-300 text-pink-600 hover:bg-pink-50 focus:outline-none focus:ring-2 focus:ring-pink-500"
                                title="Adicionar Loja"
                            >
                                <Plus className="w-5 h-5" />
                                <span className="sr-only">Adicionar Loja</span>
                            </button>
                        </div>
                    )
                )}
            </div>
            <div className="flex items-center gap-4">
                                {user && (
                                        <div className="relative">
                                                <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 rounded-full hover:bg-gray-100">
							<Bell className="w-5 h-5 text-gray-600" />
							{pendingOrders.length > 0 && 
								<span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center animate-pulse">
									{pendingOrders.length}
								</span>
							}
						</button>
						{showNotifications && (
							<div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl z-20 border">
								<div className="p-4 font-bold border-b">Pedidos Pendentes ({pendingOrders.length})</div>
								<div className="p-2 max-h-96 overflow-y-auto">
									{pendingOrders.length > 0 ? (
										pendingOrders.map(order => (
											<div key={order.id} className="p-2 border-b hover:bg-gray-50 cursor-pointer" onClick={() => { setCurrentPage('pedidos'); setShowNotifications(false); }}>
												<p className="font-semibold">{order.clienteNome || 'Cliente'}</p>
												<p className="text-sm text-gray-500">ID: {order.id?.substring(0,8) || 'N/A'}</p>
												<p className="text-sm text-gray-500">Data: {getJSDate(order.createdAt)?.toLocaleDateString() || '-'}</p>
												<p className="text-sm">Status: <span className="font-medium">{order.status}</span></p>
											</div>
										))
									) : (
										<p className="p-4 text-center text-gray-500">Nenhum pedido pendente.</p>
									)}
								</div>
							</div>
						)}
					</div>
				)}
				
				<div className="relative">
					<button onClick={() => {
						if (!user) {
							setShowLogin(true);
							setShowPasswordReset(false);
							setPasswordResetMessage({ text: '', type: '' });
						} else {
							setShowUserMenu(!showUserMenu);
						}
					}} className="p-2 rounded-full hover:bg-gray-100">
						<UserIcon className="w-6 h-6 text-gray-600" />
					</button>
					{user && <span className="absolute top-0 right-0 w-2 h-2 bg-green-500 rounded-full border-2 border-white"></span>}
					{showUserMenu && user && (
						<div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-xl z-20 border p-2">
							<p className="px-2 py-1 text-sm text-gray-700 font-semibold truncate">{user.auth.displayName || user.auth.email}</p>
                            <button onClick={() => { setCurrentPage('configuracoes'); setShowUserMenu(false); }} className="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded">Configurações</button>
                            <button onClick={handleLogout} className="w-full text-left px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded">Sair</button>
						</div>
					)}
				</div>
			</div>
        </div>
        {pedidosConnectivityStatus !== 'online' && (
          <div className={`mx-4 mt-3 rounded-lg border px-4 py-2 text-sm ${
            pedidosConnectivityStatus === 'offline'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-blue-200 bg-blue-50 text-blue-800'
          }`}>
            {pedidosConnectivityStatus === 'offline'
              ? 'Sem conexão com o Firestore para pedidos no momento. Os dados podem estar desatualizados.'
              : 'Reconectando com o Firestore de pedidos... atualizando dados em segundo plano.'}
          </div>
        )}
        <main className="flex-1 overflow-y-auto">
            {renderCurrentPage()}
        </main>
      </div>

      <StoreManagerModal
        isOpen={showStoreManager}
        onClose={() => setShowStoreManager(false)}
        availableStores={availableStores}
        storeInfoMap={storeInfoMap}
        onCreateStore={handleCreateStore}
        onSelectStore={selectStoreById}
        canCreate={canCreateStores}
        allowAllOption={user?.role === ROLE_OWNER}
        currentStoreId={currentStoreIdForDisplay}
        isCreatingStore={isCreatingStore}
      />

      <Modal isOpen={showLogin} onClose={() => {setShowLogin(false); setLoginError(''); setPasswordResetMessage({ text: '', type: '' });}} title={showPasswordReset ? "Recuperar Senha" : "Login"} size="sm">
        {showPasswordReset ? (
            <div className="space-y-4">
                <p className="text-sm text-gray-600">Insira seu e-mail para enviarmos um link de recuperação.</p>
                <Input label="Email" type="email" placeholder="seu@email.com" value={passwordResetEmail} onChange={(e) => setPasswordResetEmail(e.target.value)} />
                {passwordResetMessage.text && (
                    <p className={`text-sm ${passwordResetMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {passwordResetMessage.text}
                    </p>
                )}
                <div className="flex flex-col gap-2">
                    <Button onClick={handlePasswordReset} disabled={passwordResetMessage.type === 'loading'}>
                        {passwordResetMessage.type === 'loading' ? 'Enviando...' : 'Enviar Email de Recuperação'}
                    </Button>
                    <button onClick={() => setShowPasswordReset(false)} className="text-sm text-pink-600 hover:underline text-center">
                        Voltar para o Login
                    </button>
                </div>
            </div>
        ) : (
            <div className="space-y-4">
                <Input label="Email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Input label="Senha" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button onClick={() => setShowPasswordReset(true)} className="text-sm text-pink-600 hover:underline text-left w-full">
                    Esqueci a senha
                </button>
                {loginError && <p className="text-red-500 text-sm text-center">{loginError}</p>}
                <div className="flex flex-col gap-4 pt-2">
                    <Button onClick={handleLogin}>Entrar</Button>
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300" />
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="bg-white px-2 text-gray-500">ou</span>
                        </div>
                    </div>
                    <Button onClick={handleGoogleSignIn} variant="secondary">
                        <svg className="w-5 h-5" viewBox="0 0 48 48">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                            <path fill="none" d="M0 0h48v48H0z"></path>
                        </svg>
                        Entrar com Google
                    </Button>
                </div>
            </div>
        )}
      </Modal>

      <Modal isOpen={confirmDelete.isOpen} onClose={() => setConfirmDelete({ isOpen: false, onConfirm: ()=>{} })} title={confirmDelete.title || "Confirmar Exclusão"} size="sm">
        <div className="space-y-6">
            <p className="text-gray-600">{confirmDelete.message || 'Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.'}</p>
            <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setConfirmDelete({ isOpen: false, onConfirm: ()=>{} })}>Cancelar</Button>
                <Button variant="danger" onClick={async () => {
                  await confirmDelete.onConfirm();
                  setConfirmDelete({ isOpen: false, onConfirm: () => {} });
                }}>{confirmDelete.confirmLabel || 'Excluir'}</Button>
            </div>
        </div>
      </Modal>
      
      {lightboxImage && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setLightboxImage(null)}> {/* Aumentado z-index e adicionado backdrop */}
            <img src={lightboxImage} alt="Visualização Ampliada" className="max-w-[90%] max-h-[90%] rounded-lg shadow-2xl object-contain"/>
        </div>
      )}
    </div>
  );
}

export default App;
