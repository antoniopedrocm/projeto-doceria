/**
 * Import function triggers from their respective sub-packages:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated, onDocumentUpdated, onDocumentWritten} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const {FieldValue} = require('firebase-admin/firestore');
const express = require("express");
const cors = require("cors");
const crypto = require('crypto');
const {buildCheckoutWhatsApp} = require('./whatsapp-checkout');
const {createWhatsAppWorker, createWhatsAppWorkerFunctions} = require('./whatsapp-worker');
const {createWhatsAppAdminFunctions} = require('./whatsapp-admin');
const {createWhatsAppWebhook} = require('./whatsapp-webhook');
const {quoteFreight, totalWithFreight, validateFreightCoordinates,
  loadStoreFreightConfig, orderFreightSnapshot, assertFreightClaims} = require('./freight-core');
const {resolveFreightDistance} = require('./freight-distance');
const {createFiscalFunctions} = require('./fiscal');
const {createCaixaFunctions} = require('./caixa');
const {createEntreLojasFunctions} = require('./entre-lojas');
const {
  defaultCashPermissions,
  sanitizeCashPermissions,
} = require('./caixa-core');
const {
  USER_STATUS_ACTIVE,
  USER_STATUS_INACTIVE,
  countActiveOwners,
  getUserStatusPolicyViolation,
  isUserActive,
  managerHasUserStatusPermission,
  normalizeInactivationReason,
} = require('./user-status-core');

// Inicializa o Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
const whatsappWorker = createWhatsAppWorker({db, logger});
Object.assign(exports, createWhatsAppWorkerFunctions({db, onDocumentCreated, onDocumentUpdated, onSchedule, logger, worker: whatsappWorker}));
Object.assign(exports, createWhatsAppAdminFunctions({db, onCall, HttpsError}));
exports.whatsappWebhook = onRequest({region: 'southamerica-east1', timeoutSeconds: 60, maxInstances: 2},
    createWhatsAppWebhook({db, logger}));
const auth = admin.auth();
const {createCustomerAccount} = require('./checkout-auth');
const customerAccounts = createCustomerAccount({admin, db,getStoreAvailability:config=>getStoreAvailability(config)});
const {createPaymentService, cents, paymentError} = require('./checkout-payment');
const checkoutPayments = createPaymentService({db, admin});
const {paymentPrefill}=require('./payment-prefill');
const {RESERVATION_MS, shouldNotifyOrder} = require('./checkout-reservation');
const {claimOnlineOrderNotification} = require('./checkout-notification');
exports.expireCheckoutReservations = onSchedule({schedule:'every 5 minutes', region:'southamerica-east1'}, async () => {
  const results = await checkoutPayments.expireDue();
  for (const result of results) if (result.error) logger.error('checkout_reservation_expiry_failed', {paymentId:result.id});
});
async function checkoutToken(req) {
  const token = String(req.headers.authorization || '').match(/^Bearer (.+)$/)?.[1];
  if (!token) throw paymentError('Entre novamente para continuar.',401);
  try {return await auth.verifyIdToken(token, true);} catch {throw paymentError('Sessão inválida.',401);}
}
const LOOKUP_CLIENT_ALLOWED_ORIGINS = [
  'https://www.anaguimaraesdoceria.com.br',
  'https://anaguimaraesdoceria.com.br',
  'https://crmdoceria-9959e.web.app',
  'https://crmdoceria-9959e.firebaseapp.com',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
];
exports.customerAccount = onCall({cors:LOOKUP_CLIENT_ALLOWED_ORIGINS}, customerAccounts.account);
exports.customerCompleteProfile = onCall({cors:LOOKUP_CLIENT_ALLOWED_ORIGINS}, customerAccounts.completeProfile);
exports.customerUpdate = onCall({cors:LOOKUP_CLIENT_ALLOWED_ORIGINS}, customerAccounts.update);
exports.customerOrders = onCall({cors:LOOKUP_CLIENT_ALLOWED_ORIGINS}, customerAccounts.orders);
exports.customerOrderDetail = onCall({cors:LOOKUP_CLIENT_ALLOWED_ORIGINS}, customerAccounts.orderDetail);
exports.customerReorderPreview = onCall({cors:LOOKUP_CLIENT_ALLOWED_ORIGINS}, customerAccounts.reorderPreview);
exports.customerAddAddress = onCall({cors:LOOKUP_CLIENT_ALLOWED_ORIGINS}, customerAccounts.addAddress);
exports.customerDeleteAddress = onCall({cors:LOOKUP_CLIENT_ALLOWED_ORIGINS}, customerAccounts.deleteAddress);
exports.customerUpdateAddress = onCall({cors:LOOKUP_CLIENT_ALLOWED_ORIGINS}, customerAccounts.updateAddress);
exports.customerSetDefaultAddress = onCall({cors:LOOKUP_CLIENT_ALLOWED_ORIGINS}, customerAccounts.setDefaultAddress);
const STORE_INFO_DOC_ID = 'dados';
const CONFIG_DOC_ID = 'config';
const ROLE_OWNER = 'dono';
const STORE_ALL_KEY = '__all__';
const ROLE_MANAGER = 'gerente';
const ROLE_ATTENDANT = 'atendente';
const ROLE_ACCOUNTANT = 'contador';
const ROLE_CLIENT = 'cliente';
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
  'configuracoes',
];
const ACCOUNTANT_RESTRICTED_MODULES = new Set(['configuracoes']);
const ENTRE_LOJAS_TRANSFER_STATUS_VALUES = [
  'rascunho',
  'aguardando_conferencia',
  'conferencia_sem_divergencia',
  'conferencia_com_divergencia',
  'pagamento_informado',
  'pagamento_confirmado',
  'pagamento_contestado',
  'cancelado',
  'cancelada',
];

const normalizeRole = (role) => {
  if (!role || typeof role !== 'string') return ROLE_ATTENDANT;
  const value = role.toLowerCase();
  if ([ROLE_OWNER, ROLE_MANAGER, ROLE_ATTENDANT, ROLE_ACCOUNTANT, ROLE_CLIENT].includes(value)) {
    return value;
  }
  if (value === 'client') return ROLE_CLIENT;
  if (value === 'accountant') return ROLE_ACCOUNTANT;
  if (value === 'admin') return ROLE_OWNER;
  return ROLE_ATTENDANT;
};

const getDefaultPermissionsForRole = (role) => {
  const basePermissions = MENU_PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});

  const normalizedRole = normalizeRole(role);

  if (normalizedRole === ROLE_OWNER) {
    return MENU_PERMISSION_KEYS.reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
  }

  if (normalizedRole === ROLE_MANAGER) {
    return {
      ...basePermissions,
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
      configuracoes: true,
    };
  }

  if (normalizedRole === ROLE_ACCOUNTANT) {
    return {
      ...basePermissions,
      'pagina-inicial': true,
      dashboard: true,
      relatorios: true,
      financeiro: true,
      'nota-fiscal': true,
    };
  }

  if (normalizedRole === ROLE_CLIENT) {
    return {
      ...basePermissions,
      'pagina-inicial': true,
      'meu-espaco': true,
    };
  }

  return {
    ...basePermissions,
    'pagina-inicial': true,
    clientes: true,
    pedidos: true,
    'entre-lojas': true,
    agenda: true,
    fornecedores: true,
    'meu-espaco': true,
  };
};

const sanitizePermissions = (permissions, role) => {
  const defaults = getDefaultPermissionsForRole(role);
  if (!permissions || typeof permissions !== 'object') {
    return defaults;
  }

  return MENU_PERMISSION_KEYS.reduce((acc, key) => {
    if (normalizeRole(role) === ROLE_ACCOUNTANT && ACCOUNTANT_RESTRICTED_MODULES.has(key)) {
      acc[key] = false;
      return acc;
    }
    if (normalizeRole(role) === ROLE_ATTENDANT && key === 'fornecedores') {
      acc[key] = true;
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

const getDefaultPermissionDetailsForRole = (role, permissionsInput = null) => {
  const permissions = permissionsInput || getDefaultPermissionsForRole(role);
  const normalizedRole = normalizeRole(role);
  return {
    'entre-lojas': {
      statuses: permissions?.['entre-lojas'] ? [...ENTRE_LOJAS_TRANSFER_STATUS_VALUES] : [],
    },
    caixa: permissions?.fornecedores ?
      defaultCashPermissions(role) :
      defaultCashPermissions(ROLE_ACCOUNTANT),
    configuracoes: {
      manage_payment_settings: normalizedRole === ROLE_OWNER,
      gerenciarStatusUsuarios: normalizedRole === ROLE_OWNER,
    },
  };
};

const sanitizePermissionDetails = (permissionDetails, role, permissionsInput = null) => {
  const permissions = permissionsInput || getDefaultPermissionsForRole(role);
  const details = permissionDetails && typeof permissionDetails === 'object' ? permissionDetails : null;
  const entreLojasDetails = details?.['entre-lojas'] || details?.entreLojas || null;
  const rawStatuses = permissions?.['entre-lojas'] && entreLojasDetails ?
    (Array.isArray(entreLojasDetails.statuses) ?
      entreLojasDetails.statuses :
      (Array.isArray(entreLojasDetails.status) ? entreLojasDetails.status : [])) :
    (permissions?.['entre-lojas'] ? [...ENTRE_LOJAS_TRANSFER_STATUS_VALUES] : []);
  const statuses = Array.from(new Set(rawStatuses
      .map((status) => String(status || '').trim())
      .filter((status) => ENTRE_LOJAS_TRANSFER_STATUS_VALUES.includes(status))));
  const caixaDetails = details?.caixa || details?.cash || null;
  const configuracoesDetails = details?.configuracoes || details?.settings || {};
  const normalizedRole = normalizeRole(role);

  return {
    'entre-lojas': {statuses},
    caixa: permissions?.fornecedores ?
      sanitizeCashPermissions(caixaDetails, role) :
      defaultCashPermissions(ROLE_ACCOUNTANT),
    configuracoes: {
      manage_payment_settings: normalizedRole === ROLE_OWNER || (normalizedRole === ROLE_MANAGER && configuracoesDetails.manage_payment_settings === true),
      gerenciarStatusUsuarios: normalizedRole === ROLE_OWNER || (
        normalizedRole === ROLE_MANAGER &&
        configuracoesDetails.gerenciarStatusUsuarios === true
      ),
    },
  };
};

const ensureCustomProfile = async (uid, role, permissionsInput = null, permissionDetailsInput = null) => {
  const permissions = sanitizePermissions(permissionsInput, role);
  const permissionDetails = permissionDetailsInput &&
    typeof permissionDetailsInput === 'object' ?
    sanitizePermissionDetails(permissionDetailsInput, role, permissions) :
    getDefaultPermissionDetailsForRole(role, permissions);
  await db.collection('customProfiles').doc(uid).set({
    uid,
    permissions,
    permissionDetails,
    role,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  return {permissions, permissionDetails};
};

const getUserPermissions = async (uid, role) => {
  const snap = await db.collection('customProfiles').doc(uid).get();
  if (snap.exists) {
    const data = snap.data() || {};
    const sanitized = sanitizePermissions(data.permissions, role);
    const permissionDetails = sanitizePermissionDetails(data.permissionDetails, role, sanitized);
    await ensureCustomProfile(uid, role, sanitized, permissionDetails);
    return sanitized;
  }

  const ensured = await ensureCustomProfile(uid, role);
  return ensured.permissions;
};

const extractStoreIds = (profile) => {
  if (!profile) return [];
  if (Array.isArray(profile.lojaIds) && profile.lojaIds.length) return profile.lojaIds;
  if (Array.isArray(profile.lojas) && profile.lojas.length) return profile.lojas;
  if (Array.isArray(profile.lojaId) && profile.lojaId.length) return profile.lojaId;
  if (typeof profile.lojaId === 'string' && profile.lojaId.trim().length) return [profile.lojaId.trim()];
  return [];
};

const userHasAccessToStores = (requesterStores, targetStores) => {
  if (!targetStores || targetStores.length === 0) {
    return true;
  }
  if (!requesterStores || requesterStores.length === 0) {
    return false;
  }
  return targetStores.every((storeId) => requesterStores.includes(storeId));
};

const getUserProfile = async (uid) => {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? snap.data() : {};
};

const assertActiveUser = async (uid) => {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Você precisa estar autenticado.');
  }
  const profile = await getUserProfile(uid);
  if (!Object.keys(profile).length) {
    throw new HttpsError('permission-denied', 'Perfil de usuário não encontrado.');
  }
  if (!isUserActive(profile)) {
    throw new HttpsError(
        'permission-denied',
        'Sua conta está inativa. Entre em contato com o responsável pela empresa.',
    );
  }
  return profile;
};

const onActiveUserCall = (optionsOrHandler, possibleHandler) => {
  const hasOptions = typeof optionsOrHandler !== 'function';
  const handler = hasOptions ? possibleHandler : optionsOrHandler;
  const guardedHandler = async (request) => {
    await assertActiveUser(request.auth?.uid);
    return handler(request);
  };
  return hasOptions ?
    onCall(optionsOrHandler, guardedHandler) :
    onCall(guardedHandler);
};

const verifyManagementAccess = async (uid) => {
  const profile = await assertActiveUser(uid);
  const role = normalizeRole(profile.role);
  const stores = extractStoreIds(profile);
  const customProfileSnap = await db.collection('customProfiles').doc(uid).get();
  const customProfile = customProfileSnap.exists ? customProfileSnap.data() : {};
  const permissions = sanitizePermissions(
      customProfile.permissions || profile.permissions,
      role,
  );
  const permissionDetails = sanitizePermissionDetails(
      customProfile.permissionDetails || profile.permissionDetails,
      role,
      permissions,
  );

  if (role === ROLE_OWNER) {
    return {
      role,
      stores,
      allStores: stores.length === 0,
      profile,
      permissions,
      permissionDetails,
    };
  }

  if (role === ROLE_MANAGER) {
    if (!stores.length) {
      throw new HttpsError('permission-denied', 'Gerentes precisam estar associados a pelo menos uma loja.');
    }
    return {
      role,
      stores,
      allStores: false,
      profile,
      permissions,
      permissionDetails,
    };
  }

  throw new HttpsError('permission-denied', 'Você não tem permissão para realizar esta ação.');
};

const assertNotManagingSelf = (requesterUid, targetUid) => {
  if (targetUid && requesterUid === targetUid) {
    throw new HttpsError('permission-denied', 'Você não pode alterar o próprio perfil ou permissões.');
  }
};

const grantsOwnerEquivalentPermissions = (role, permissionsInput, targetStores = []) => {
  if (normalizeRole(role) === ROLE_OWNER) return true;
  if (!permissionsInput || typeof permissionsInput !== 'object') return false;
  const sanitized = sanitizePermissions(permissionsInput, role);
  return !targetStores.length && MENU_PERMISSION_KEYS.every((permission) => sanitized[permission] === true);
};

const assertManagerCannotGrantOwnerAccess = (requester, targetRole, permissionsInput, targetStores = []) => {
  if (requester.role !== ROLE_MANAGER) return;
  if (normalizeRole(targetRole) === ROLE_OWNER || grantsOwnerEquivalentPermissions(targetRole, permissionsInput, targetStores)) {
    throw new HttpsError('permission-denied', 'Gerentes não podem conceder perfil ou permissões de dono.');
  }
};

const assertManagerCannotGrantUserStatusAccess = async (
    requester,
    targetUid,
    requestedPermissionDetails,
) => {
  const existingFinancialDetails = targetUid ?
    (await db.collection('customProfiles').doc(targetUid).get()).data()?.permissionDetails : null;
  assertFinancialPermissionGrant(requester, requestedPermissionDetails, existingFinancialDetails);

  if (
    requester.role !== ROLE_MANAGER ||
    !managerHasUserStatusPermission(requestedPermissionDetails)
  ) {
    return;
  }
  if (targetUid) {
    const existingCustomProfile = await db.collection('customProfiles')
        .doc(targetUid).get();
    const existingDetails = existingCustomProfile.data()?.permissionDetails || {};
    if (managerHasUserStatusPermission(existingDetails)) return;
  }
  throw new HttpsError(
      'permission-denied',
      'Somente um Dono pode conceder a permissão de gerenciar status de usuários.',
  );
};

const rethrowHttpsError = (error) => {
  if (error instanceof HttpsError) {
    throw error;
  }
};

const verifyStoreReadAccess = async (uid) => {
  const profile = await assertActiveUser(uid);
  const role = normalizeRole(profile.role);
  const stores = extractStoreIds(profile);
  const permissions = await getUserPermissions(uid, role);

  if (role === ROLE_OWNER) {
    return {role, stores, allStores: stores.length === 0, permissions, profile};
  }

  if ([ROLE_MANAGER, ROLE_ACCOUNTANT].includes(role)) {
    if (!stores.length) {
      throw new HttpsError('permission-denied', 'Este usuário precisa estar associado a pelo menos uma loja.');
    }
    return {role, stores, allStores: false, permissions, profile};
  }

  throw new HttpsError('permission-denied', 'Você não tem permissão para consultar esta operação.');
};

const {createPaymentSettings,assertFinancialPermissionGrant}=require('./payment-settings');
const paymentSettings=createPaymentSettings({db,admin,normalizeRole,extractStoreIds});
exports.paymentSettingsGet=onCall({region:'us-central1'},paymentSettings.get);
exports.paymentSettingsSave=onCall({region:'us-central1'},paymentSettings.save);

const verifyPointStoreAccess = async (uid, lojaId) => {
  const profile = await assertActiveUser(uid);
  if (!lojaId || lojaId === STORE_ALL_KEY) {
    throw new HttpsError('failed-precondition', 'Selecione uma loja específica para registrar o ponto.');
  }
  const role = normalizeRole(profile.role);
  const stores = extractStoreIds(profile);

  if (role === ROLE_OWNER && stores.length === 0) {
    return {profile, role, stores, allStores: true};
  }
  if ([ROLE_OWNER, ROLE_MANAGER, ROLE_ATTENDANT, ROLE_ACCOUNTANT].includes(role) && stores.includes(lojaId)) {
    return {profile, role, stores, allStores: false};
  }
  throw new HttpsError('permission-denied', 'Você não tem permissão para registrar ponto nesta loja.');
};

const POINT_DEFAULT_EXPECTED_MINUTES = 8 * 60;
const POINT_DAILY_BANK_LIMIT_MINUTES = 15;
const POINT_SATURDAY_BANK_LIMIT_MINUTES = 5 * 60;
const POINT_MISSING_LUNCH_BANK_MINUTES = 60;
const POINT_WEEK_DAY_VALUES = ['0', '1', '2', '3', '4', '5', '6'];
const POINT_WORK_SCHEDULE_TYPE_VALUES = ['seg-sex', 'seg-sab-folga', 'personalizada'];
const DEFAULT_POINT_DAILY_LOADS = {
  0: '00:00',
  1: '08:00',
  2: '08:00',
  3: '08:00',
  4: '08:00',
  5: '08:00',
  6: '05:00',
};
const DEFAULT_POINT_WORK_SCHEDULE = {
  tipoEscala: 'seg-sex',
  diasTrabalho: ['1', '2', '3', '4', '5'],
  cargaHorariaPorDia: DEFAULT_POINT_DAILY_LOADS,
  folgaSemanal: '',
  folgaVariavel: false,
  horarioPadrao: {
    entrada: '09:30',
    almocoSaida: '12:00',
    almocoRetorno: '13:00',
    saida: '18:30',
    intervaloMinutos: 60,
  },
};

const parsePointDurationToMinutes = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  if (!text) return fallback;
  const timeMatch = text.match(/^(\d{1,3}):(\d{2})$/);
  if (timeMatch) {
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) return (hours * 60) + minutes;
  }
  const numberMatch = text.replace(',', '.').match(/^(\d+(?:\.\d+)?)$/);
  if (numberMatch) {
    const hours = Number(numberMatch[1]);
    if (Number.isFinite(hours)) return Math.round(hours * 60);
  }
  return fallback;
};

const formatPointDurationInput = (minutes) => {
  const normalized = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const sanitizePointTimeInput = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return /^\d{1,2}:\d{2}$/.test(text) ? text : fallback;
};

const sanitizeEmployeeWorkSchedule = (input = null) => {
  const source = input && typeof input === 'object' ? input : {};
  const type = POINT_WORK_SCHEDULE_TYPE_VALUES.includes(source.tipoEscala) ?
    source.tipoEscala :
    DEFAULT_POINT_WORK_SCHEDULE.tipoEscala;
  const defaultWorkdays = type === 'seg-sab-folga' ?
    ['1', '2', '3', '4', '5', '6'] :
    [...DEFAULT_POINT_WORK_SCHEDULE.diasTrabalho];
  const rawWorkdays = Array.isArray(source.diasTrabalho) && source.diasTrabalho.length ?
    source.diasTrabalho :
    defaultWorkdays;
  const diasTrabalho = Array.from(new Set(
      rawWorkdays
          .map((day) => String(day))
          .filter((day) => POINT_WEEK_DAY_VALUES.includes(day)),
  ));
  const rawLoads = source.cargaHorariaPorDia && typeof source.cargaHorariaPorDia === 'object' ?
    source.cargaHorariaPorDia :
    {};
  const cargaHorariaPorDia = POINT_WEEK_DAY_VALUES.reduce((acc, day) => {
    const fallbackMinutes = parsePointDurationToMinutes(DEFAULT_POINT_DAILY_LOADS[day], 0);
    acc[day] = formatPointDurationInput(parsePointDurationToMinutes(rawLoads[day], fallbackMinutes));
    return acc;
  }, {});
  const rawBreak = source.horarioPadrao?.intervaloMinutos;

  return {
    tipoEscala: type,
    diasTrabalho,
    cargaHorariaPorDia,
    folgaSemanal: POINT_WEEK_DAY_VALUES.includes(String(source.folgaSemanal)) ?
      String(source.folgaSemanal) :
      '',
    folgaVariavel: Boolean(source.folgaVariavel),
    horarioPadrao: {
      entrada: sanitizePointTimeInput(source.horarioPadrao?.entrada, DEFAULT_POINT_WORK_SCHEDULE.horarioPadrao.entrada),
      almocoSaida: sanitizePointTimeInput(source.horarioPadrao?.almocoSaida, DEFAULT_POINT_WORK_SCHEDULE.horarioPadrao.almocoSaida),
      almocoRetorno: sanitizePointTimeInput(source.horarioPadrao?.almocoRetorno, DEFAULT_POINT_WORK_SCHEDULE.horarioPadrao.almocoRetorno),
      saida: sanitizePointTimeInput(source.horarioPadrao?.saida, DEFAULT_POINT_WORK_SCHEDULE.horarioPadrao.saida),
      intervaloMinutos: Math.max(0, Math.round(Number(rawBreak) || DEFAULT_POINT_WORK_SCHEDULE.horarioPadrao.intervaloMinutos)),
    },
  };
};

const getPointScheduleDayInfo = (scheduleInput, date) => {
  const schedule = sanitizeEmployeeWorkSchedule(scheduleInput);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return {isWorkday: false, expectedMinutes: 0, isWeeklyDayOff: false, schedule};
  }
  const dayKey = String(date.getDay());
  const isWeeklyDayOff = !schedule.folgaVariavel && schedule.folgaSemanal === dayKey;
  const isWorkday = schedule.diasTrabalho.includes(dayKey) && !isWeeklyDayOff;
  const expectedMinutes = isWorkday ? parsePointDurationToMinutes(schedule.cargaHorariaPorDia[dayKey], 0) : 0;
  return {isWorkday, expectedMinutes, isWeeklyDayOff, schedule};
};

const pointTimeToMinutes = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const formatPointMinutes = (minutes) => {
  const normalized = Number(minutes) || 0;
  const hrs = Math.floor(Math.abs(normalized) / 60);
  const mins = Math.abs(normalized) % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const formatSignedPointMinutes = (minutes) => {
  const normalized = Number(minutes) || 0;
  const sign = normalized < 0 ? '-' : normalized > 0 ? '+' : '';
  const abs = Math.abs(normalized);
  const hrs = Math.floor(abs / 60);
  const mins = abs % 60;
  return `${sign}${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const hasPointTimeValue = (value) => pointTimeToMinutes(value) !== null;

const toPointInterval = (startValue, endValue, source = null) => {
  const start = typeof startValue === 'number' ? startValue : pointTimeToMinutes(startValue);
  const end = typeof endValue === 'number' ? endValue : pointTimeToMinutes(endValue);
  if (start === null || end === null || end <= start) return null;
  return {start, end, source};
};

const mergePointIntervals = (intervals = []) => {
  const sorted = intervals
    .filter(Boolean)
    .map((interval) => ({...interval}))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  sorted.forEach((interval) => {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end) {
      merged.push(interval);
      return;
    }
    previous.end = Math.max(previous.end, interval.end);
  });
  return merged;
};

const sumPointIntervals = (intervals = []) => intervals.reduce(
  (total, interval) => total + (interval.end - interval.start),
  0,
);

const subtractPointIntervals = (baseIntervals = [], deductions = []) => {
  const base = mergePointIntervals(baseIntervals);
  const cuts = mergePointIntervals(deductions);
  return base.flatMap((interval) => {
    let fragments = [interval];
    cuts.forEach((cut) => {
      fragments = fragments.flatMap((fragment) => {
        if (cut.end <= fragment.start || cut.start >= fragment.end) return [fragment];
        const pieces = [];
        if (cut.start > fragment.start) pieces.push({start: fragment.start, end: cut.start});
        if (cut.end < fragment.end) pieces.push({start: cut.end, end: fragment.end});
        return pieces;
      });
    });
    return fragments;
  });
};

const getActivePointSupplementalPeriods = (record = {}) => (
  Array.isArray(record.periodosComplementares) ?
    record.periodosComplementares.filter((period) => period && period.ativo !== false) :
    []
);

const getLegacyPointEvents = (record = {}) => [
  record.horaEntrada && {
    tipo: 'entrada',
    hora: record.horaEntrada,
    origem: 'funcionaria',
    localizacao: record.localizacaoEntrada || null,
    endereco: record.localizacaoEntradaEndereco || '',
  },
  record.horaAlmocoSaida && {tipo: 'almoco_inicio', hora: record.horaAlmocoSaida, origem: 'funcionaria'},
  record.horaAlmocoRetorno && {tipo: 'almoco_fim', hora: record.horaAlmocoRetorno, origem: 'funcionaria'},
  record.horaSaida && {
    tipo: 'saida',
    hora: record.horaSaida,
    origem: 'funcionaria',
    localizacao: record.localizacaoSaida || null,
    endereco: record.localizacaoSaidaEndereco || '',
  },
].filter(Boolean);

const getPointEvents = (record = {}) => {
  const stored = Array.isArray(record.batidas) ? record.batidas.filter(Boolean) : [];
  return stored.length ? stored : getLegacyPointEvents(record);
};

const getPointOpenEvent = (record = {}) => {
  let openEvent = null;
  getPointEvents(record).forEach((event) => {
    if (event.tipo === 'entrada' || event.tipo === 'almoco_fim') openEvent = event;
    if (event.tipo === 'saida' || event.tipo === 'almoco_inicio') openEvent = null;
  });
  return openEvent;
};

const getPointEventWorkIntervals = (record = {}) => {
  const intervals = [];
  let openStart = null;
  getPointEvents(record).forEach((event) => {
    const minute = pointTimeToMinutes(event.hora);
    if (minute === null) return;
    if (event.tipo === 'entrada' || event.tipo === 'almoco_fim') {
      if (openStart === null) openStart = minute;
      return;
    }
    if ((event.tipo === 'saida' || event.tipo === 'almoco_inicio') && openStart !== null) {
      const interval = toPointInterval(openStart, minute, event);
      if (interval) intervals.push(interval);
      openStart = null;
    }
  });
  return intervals;
};

const getPointWorkIntervals = (record = {}) => {
  const storedPeriods = Array.isArray(record.periodosTrabalho) ?
    record.periodosTrabalho
      .filter((period) => period && period.ativo !== false)
      .flatMap((period) => {
        const start = period.horaInicio || period.inicio;
        const end = period.horaFim || period.fim;
        const startMinutes = pointTimeToMinutes(start);
        const endMinutes = pointTimeToMinutes(end);
        const lunchStart = pointTimeToMinutes(period.horaAlmocoSaida);
        const lunchReturn = pointTimeToMinutes(period.horaAlmocoRetorno);
        const hasValidLunch = startMinutes !== null && endMinutes !== null &&
          lunchStart !== null && lunchReturn !== null &&
          lunchStart > startMinutes && lunchReturn > lunchStart && lunchReturn < endMinutes;
        if (!hasValidLunch) return [toPointInterval(start, end, period)].filter(Boolean);
        return [
          toPointInterval(startMinutes, lunchStart, period),
          toPointInterval(lunchReturn, endMinutes, period),
        ].filter(Boolean);
      })
      .filter(Boolean) :
    [];
  const entrada = pointTimeToMinutes(record.horaEntrada);
  const saida = pointTimeToMinutes(record.horaSaida);
  const almocoSaida = pointTimeToMinutes(record.horaAlmocoSaida);
  const almocoRetorno = pointTimeToMinutes(record.horaAlmocoRetorno);
  const legacyIntervals = [];
  if (entrada !== null && saida !== null) {
    if (almocoSaida !== null && almocoRetorno !== null) {
      legacyIntervals.push(toPointInterval(entrada, almocoSaida), toPointInterval(almocoRetorno, saida));
    } else if (almocoSaida === null && almocoRetorno === null) {
      legacyIntervals.push(toPointInterval(entrada, saida));
    }
  }
  return mergePointIntervals([
    ...legacyIntervals.filter(Boolean),
    ...getPointEventWorkIntervals(record),
    ...storedPeriods,
  ]);
};

const consolidatePointRecordsForCalculation = (records = [], primaryRecord = {}) => {
  const activeRecords = records.filter((record) => (
    record && record.ativo !== false && record.duplicadoArquivado !== true
  ));
  const workIntervals = mergePointIntervals(activeRecords.flatMap(getPointWorkIntervals));
  const supplementalKeys = new Set();
  const supplementalPeriods = activeRecords.flatMap((record) => (
    getActivePointSupplementalPeriods(record).filter((period) => {
      const key = [period.tipo, period.horaInicio, period.horaFim].join('|');
      if (supplementalKeys.has(key)) return false;
      supplementalKeys.add(key);
      return true;
    })
  ));
  const hasPeriodContent = workIntervals.length > 0 || supplementalPeriods.length > 0;
  return {
    ...primaryRecord,
    tipoLancamento: hasPeriodContent ? 'normal' : primaryRecord.tipoLancamento,
    faltaSemAbono: hasPeriodContent ? false : primaryRecord.faltaSemAbono,
    faltaAbonada: hasPeriodContent ? false : primaryRecord.faltaAbonada,
    abonoFalta: hasPeriodContent ? false : primaryRecord.abonoFalta,
    folgaCompensada: hasPeriodContent ? false : primaryRecord.folgaCompensada,
    liberacaoChefia: hasPeriodContent ? false : primaryRecord.liberacaoChefia,
    ferias: hasPeriodContent ? false : primaryRecord.ferias,
    lancamentoFerias: hasPeriodContent ? false : primaryRecord.lancamentoFerias,
    folga: hasPeriodContent ? false : primaryRecord.folga,
    feriado: hasPeriodContent ? false : primaryRecord.feriado,
    periodosTrabalho: workIntervals.map((interval, index) => ({
      id: `consolidado_${index}_${interval.start}_${interval.end}`,
      horaInicio: formatPointMinutes(interval.start),
      horaFim: formatPointMinutes(interval.end),
      origem: interval.source?.origem || 'funcionaria',
      ativo: true,
    })),
    periodosComplementares: supplementalPeriods,
  };
};

const isExcusedAbsenceRecord = (record = {}) => (
  record.tipoLancamento === 'abono_falta' ||
  record.faltaAbonada === true ||
  record.abonoFalta === true
);

const isVacationPointRecord = (record = {}) => (
  record.tipoLancamento === 'ferias' ||
  record.tipoLancamento === 'férias' ||
  record.ferias === true ||
  record.lancamentoFerias === true ||
  (!record.tipoLancamento && String(record.justificativa || '').trim().toLowerCase() === 'férias') ||
  (!record.tipoLancamento && String(record.justificativa || '').trim().toLowerCase() === 'ferias')
);

const normalizePointAdministrativeType = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\s-]+/g, '_');

const isAdministrativePointRecord = (record = {}) => (
  isVacationPointRecord(record) ||
  ['manual_pelo_gestor', 'falta', 'abono_falta', 'falta_abonada', 'folga_compensada', 'liberacao_chefia', 'folga', 'feriado']
    .includes(normalizePointAdministrativeType(record.tipoLancamento)) ||
  record.lancamentoManualGestor === true ||
  record.manualPeloGestor === true ||
  record.faltaSemAbono === true ||
  record.faltaAbonada === true ||
  record.abonoFalta === true ||
  record.folgaCompensada === true ||
  record.liberacaoChefia === true ||
  record.folga === true ||
  record.feriado === true
);

const parseExpectedPointMinutes = (...values) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (!text) continue;
    const timeMatch = text.match(/(\d{1,3}):(\d{2})/);
    if (timeMatch) {
      const hours = Number(timeMatch[1]);
      const minutes = Number(timeMatch[2]);
      if (Number.isFinite(hours) && Number.isFinite(minutes)) return (hours * 60) + minutes;
    }
    const numberMatch = text.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
    if (numberMatch) {
      const hours = Number(numberMatch[1]);
      if (Number.isFinite(hours) && hours > 0) return Math.round(hours * 60);
    }
  }
  return POINT_DEFAULT_EXPECTED_MINUTES;
};

const getPointRecordDate = (record = {}) => {
  const [year, month, day] = String(record.dia || '').split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
};

const isBrazilNationalPointHoliday = (dayKey = '') => {
  const suffix = String(dayKey || '').slice(4);
  return ['-01-01', '-04-21', '-05-01', '-09-07', '-10-12', '-11-02', '-11-15', '-11-20', '-12-25']
    .includes(suffix);
};

const normalizePointBankStartDate = (value) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  return "";
};

const getExpectedPointMinutesForDay = (record = {}) => {
  const date = getPointRecordDate(record);
  const dayOfWeek = date ? date.getDay() : null;
  const scheduleDay = getPointScheduleDayInfo(record.jornadaTrabalho, date);
  const expectedMinutes = parseExpectedPointMinutes(
    record.jornadaEsperadaMinutos,
    record.jornadaDiariaMinutos,
    record.cargaHorariaDiariaMinutos,
    record.jornadaEsperada,
    record.jornadaDiaria,
    record.cargaHorariaDiaria,
    record.horasDiarias
  );

  return {
    expectedMinutes: dayOfWeek !== null && scheduleDay.isWorkday && !isBrazilNationalPointHoliday(record.dia) ?
      (scheduleDay.expectedMinutes || expectedMinutes) :
      0,
    hasDate: dayOfWeek !== null,
  };
};

const isSaturdayPointRecord = (record = {}) => {
  const date = getPointRecordDate(record);
  return date instanceof Date && !Number.isNaN(date.getTime()) && date.getDay() === 6;
};

const isSegSabScheduledSaturdayWorkday = (record = {}) => {
  const date = getPointRecordDate(record);
  if (!(date instanceof Date) || Number.isNaN(date.getTime()) || date.getDay() !== 6) return false;
  const scheduleDay = getPointScheduleDayInfo(record.jornadaTrabalho, date);
  return scheduleDay.schedule?.tipoEscala === 'seg-sab-folga' && scheduleDay.isWorkday;
};

const calculatePointSummary = (record = {}) => {
  if (isExcusedAbsenceRecord(record)) {
    return {workedLabel: '', irregularidade: '', workedMinutes: null, irregularityMinutes: null, calculable: false};
  }

  const supplementalPeriods = getActivePointSupplementalPeriods(record);
  const actualIntervals = getPointWorkIntervals(record);
  const externalIntervals = supplementalPeriods
    .filter((period) => period.tipo === 'trabalho_externo')
    .map((period) => toPointInterval(period.horaInicio, period.horaFim, period))
    .filter(Boolean);
  const privateIntervals = supplementalPeriods
    .filter((period) => period.tipo === 'saida_particular')
    .map((period) => toPointInterval(period.horaInicio, period.horaFim, period))
    .filter(Boolean);
  const justifiedIntervals = supplementalPeriods
    .filter((period) => ['abono_periodo', 'liberacao_chefia_periodo'].includes(period.tipo))
    .map((period) => toPointInterval(period.horaInicio, period.horaFim, period))
    .filter(Boolean);
  const beforeDeductions = mergePointIntervals([...actualIntervals, ...externalIntervals]);
  const effectiveIntervals = subtractPointIntervals(beforeDeductions, privateIntervals);
  const workedMinutes = sumPointIntervals(effectiveIntervals);
  const justifiedRegisteredMinutes = sumPointIntervals(mergePointIntervals(justifiedIntervals));
  const {expectedMinutes, hasDate} = getExpectedPointMinutesForDay(record);
  const justifiedAppliedMinutes = Math.min(justifiedRegisteredMinutes, Math.max(expectedMinutes - workedMinutes, 0));
  const consideredMinutes = workedMinutes + justifiedAppliedMinutes;
  const hasOpenPeriod = Boolean(getPointOpenEvent(record));
  const hasCalculableContent = workedMinutes > 0 || justifiedRegisteredMinutes > 0 || (!hasOpenPeriod && expectedMinutes > 0 && !getPointEvents(record).length);

  if (!hasCalculableContent) {
    return {workedLabel: '', irregularidade: '', workedMinutes: null, irregularityMinutes: null, calculable: false};
  }

  const workedLabel = formatPointMinutes(workedMinutes);
  if (!hasDate) {
    return {
      workedLabel,
      irregularidade: '',
      workedMinutes,
      consideredMinutes,
      justifiedAppliedMinutes,
      irregularityMinutes: null,
      calculable: false,
    };
  }

  const diff = consideredMinutes - expectedMinutes;
  const irregularidade = diff === 0 ? '00:00' : formatSignedPointMinutes(diff);
  return {
    workedLabel,
    irregularidade,
    workedMinutes,
    consideredMinutes,
    justifiedAppliedMinutes,
    irregularityMinutes: diff,
    calculable: true,
  };
};

const formatPointBalanceCell = (minutes) => {
  const normalized = Number(minutes) || 0;
  return normalized === 0 ? '-' : formatSignedPointMinutes(normalized);
};

const hasMissingLunchBreak = (record = {}, summary = null) => (
  hasPointTimeValue(record.horaEntrada) &&
  hasPointTimeValue(record.horaSaida) &&
  summary?.calculable === true &&
  !hasPointTimeValue(record.horaAlmocoSaida) &&
  !hasPointTimeValue(record.horaAlmocoRetorno) &&
  getActivePointSupplementalPeriods(record).length === 0 &&
  getPointWorkIntervals(record).length <= 1
);

const calculatePointBalanceDistribution = (record = {}, summaryInput = null) => {
  const summary = summaryInput || calculatePointSummary(record);
  const irregularityMinutes = summary?.calculable && Number.isFinite(summary?.irregularityMinutes) ?
    summary.irregularityMinutes :
    null;
  let bancoHorasMinutes = 0;
  let horaExtraMinutes = 0;

  if (isExcusedAbsenceRecord(record)) {
    return {
      bancoHorasMinutes: 0,
      horaExtraMinutes: 0,
      bancoHoras: '-',
      horaExtra: '-',
      almocoNaoRegistradoBancoHoras: 0,
      calculable: false,
    };
  }

  const isScheduledSegSabSaturday = isSegSabScheduledSaturdayWorkday(record);
  const isSaturdayWorked = isSaturdayPointRecord(record) &&
    !isScheduledSegSabSaturday &&
    summary?.calculable === true &&
    Number.isFinite(summary?.workedMinutes) &&
    summary.workedMinutes > 0;
  const isScheduledSegSabSaturdayWorked = isScheduledSegSabSaturday &&
    summary?.calculable === true &&
    Number.isFinite(summary?.workedMinutes) &&
    summary.workedMinutes > 0;
  const missingLunchBankMinutes = !isSaturdayWorked &&
    !isScheduledSegSabSaturdayWorked &&
    hasMissingLunchBreak(record, summary) ?
    POINT_MISSING_LUNCH_BANK_MINUTES :
    0;

  if (isSaturdayWorked) {
    bancoHorasMinutes += Math.min(summary.workedMinutes, POINT_SATURDAY_BANK_LIMIT_MINUTES);
    horaExtraMinutes += Math.max(summary.workedMinutes - POINT_SATURDAY_BANK_LIMIT_MINUTES, 0);
  } else if (isScheduledSegSabSaturdayWorked) {
    if (irregularityMinutes > 0) {
      horaExtraMinutes += irregularityMinutes;
    } else if (irregularityMinutes < 0) {
      bancoHorasMinutes += irregularityMinutes;
    }
  } else if (irregularityMinutes > 0) {
    bancoHorasMinutes += Math.min(irregularityMinutes, POINT_DAILY_BANK_LIMIT_MINUTES);
    horaExtraMinutes += Math.max(irregularityMinutes - POINT_DAILY_BANK_LIMIT_MINUTES, 0);
  } else if (irregularityMinutes < 0) {
    bancoHorasMinutes += irregularityMinutes;
  }

  if (missingLunchBankMinutes > 0) {
    bancoHorasMinutes += missingLunchBankMinutes;
  }

  return {
    bancoHorasMinutes,
    horaExtraMinutes,
    bancoHoras: formatPointBalanceCell(bancoHorasMinutes),
    horaExtra: formatPointBalanceCell(horaExtraMinutes),
    almocoNaoRegistradoBancoHoras: missingLunchBankMinutes,
    calculable: summary?.calculable === true,
  };
};

const pointInconsistencies = (record = {}) => {
  const issues = [];
  if (Array.isArray(record.batidas) && record.batidas.length) {
    let state = 'sem_periodo';
    record.batidas.forEach((event) => {
      if (event.tipo === 'entrada') {
        if (state !== 'sem_periodo') issues.push('Entrada registrada enquanto já existia um período aberto.');
        state = 'trabalhando';
      } else if (event.tipo === 'almoco_inicio') {
        if (state !== 'trabalhando') issues.push('Início do almoço sem período de trabalho aberto.');
        state = 'almoco';
      } else if (event.tipo === 'almoco_fim') {
        if (state !== 'almoco') issues.push('Retorno do almoço sem início de almoço correspondente.');
        state = 'trabalhando';
      } else if (event.tipo === 'saida') {
        if (state !== 'trabalhando') issues.push('Saída registrada sem entrada correspondente.');
        state = 'sem_periodo';
      }
    });
    return [...new Set(issues)];
  }
  if (record.horaSaida && !record.horaEntrada) {
    issues.push('Saída registrada sem entrada correspondente.');
  }
  if (record.horaAlmocoSaida && !record.horaEntrada) {
    issues.push('Início do almoço registrado sem entrada correspondente.');
  }
  if (record.horaAlmocoRetorno && !record.horaAlmocoSaida) {
    issues.push('Retorno do almoço registrado sem início de almoço correspondente.');
  }
  if (record.horaAlmocoSaida && !record.horaAlmocoRetorno && record.horaSaida) {
    issues.push('Saída final registrada sem retorno do almoço.');
  }
  return issues;
};

const pointStatusPatch = (record = {}) => {
  if (isExcusedAbsenceRecord(record)) {
    return {
      inconsistente: false,
      necessitaAjuste: false,
      statusPonto: 'Falta abonada',
      inconsistencias: [],
    };
  }

  const issues = pointInconsistencies(record);
  if (issues.length) {
    return {
      inconsistente: true,
      necessitaAjuste: true,
      statusPonto: 'Pendente de ajuste',
      inconsistencias: issues,
    };
  }
  return {
    inconsistente: false,
    necessitaAjuste: false,
    statusPonto: getPointOpenEvent(record) ? 'Em andamento' : (getPointWorkIntervals(record).length ? 'Completo' : 'Sem registro'),
    inconsistencias: [],
  };
};

const requireStoreId = (req, res) => {
  const lojaId = req.params.lojaId || req.query.lojaId || req.body?.lojaId;
  if (!lojaId) {
    res.status(400).json({ message: 'Parâmetro lojaId é obrigatório.' });
    return null;
  }
  return lojaId;
};

const generateStoreId = (value) => {
  if (!value) return '';

  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || `loja-${Date.now()}`;
};

const getStoreRef = (storeId) => db.collection('lojas').doc(storeId);

const getStoreConfigDoc = (storeId) => getStoreRef(storeId).collection('configuracoes').doc(CONFIG_DOC_ID);
const getStoreConfigCollection = (storeId, collectionName) => getStoreConfigDoc(storeId).collection(collectionName);
const getLegacyConfigDoc = (storeId, configId) => getStoreRef(storeId).collection('configuracoes').doc(configId);

const getLegacyInfoDoc = (storeId) => getStoreRef(storeId).collection('info').doc(STORE_INFO_DOC_ID);

const DEFAULT_STORE_TIMEZONE = 'America/Sao_Paulo';

const parseTimeToMinutes = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
};

const getNowInTimeZone = (timezone, now = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || DEFAULT_STORE_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(now);
  const weekdayRaw = parts.find((part) => part.type === 'weekday')?.value?.toLowerCase() || 'sun';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
  const weekdayMap = {sun: 'sun', mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat'};
  const weekday = weekdayMap[weekdayRaw.slice(0, 3)] || 'sun';
  return {weekday, minutes: (hour * 60) + minute};
};

const getStoreAvailability = (storeConfig, now = new Date()) => {
  if (!storeConfig || typeof storeConfig !== 'object') return 'CONFIG_UNAVAILABLE';
  const overrideMode = storeConfig?.manualOverride?.mode || 'auto';
  if (overrideMode === 'force_open') return 'OPEN';
  if (overrideMode === 'force_closed') return 'CLOSED';
  if (overrideMode !== 'auto' || typeof storeConfig.timezone !== 'string' ||
      !storeConfig.timezone.trim() || !storeConfig.schedule ||
      typeof storeConfig.schedule !== 'object' || Array.isArray(storeConfig.schedule)) {
    return 'CONFIG_UNAVAILABLE';
  }

  let weekday;
  let minutes;
  try {
    ({weekday, minutes} = getNowInTimeZone(storeConfig.timezone, now));
  } catch (error) {
    return 'CONFIG_UNAVAILABLE';
  }

  const todayConfig = storeConfig.schedule[weekday];
  if (!todayConfig || typeof todayConfig.enabled !== 'boolean') return 'CONFIG_UNAVAILABLE';
  if (!todayConfig.enabled) return 'CLOSED';

  const openMinutes = parseTimeToMinutes(todayConfig.open);
  const closeMinutes = parseTimeToMinutes(todayConfig.close);
  if (openMinutes === null || closeMinutes === null || closeMinutes <= openMinutes) return 'CONFIG_UNAVAILABLE';

  return minutes >= openMinutes && minutes < closeMinutes ? 'OPEN' : 'CLOSED';
};

// API Express para o Cardápio Online
const app = express();
app.use(cors({origin: true})); // Habilita CORS para a API do cardápio
app.use(express.json());
app.get('/checkout/config', async (req,res) => {
  const store=String(req.query.lojaId || '');
  if(!/^[\w-]+$/.test(store)) return res.status(400).json({enabled:false});
  try {await checkoutPayments.config(store);return res.json({enabled:true});} catch {return res.json({enabled:false});}
});
app.post('/checkout/webhook', async(req,res)=>{
  try {return res.json(await checkoutPayments.reconcile(req.body));}
  catch(e){return res.status(e.httpStatus || 500).json({ok:false});}
});
app.post('/checkout/payment-status', async(req,res)=>{
  try {
    const user=await checkoutToken(req);
    const paymentId=String(req.body?.paymentId || '');
    await checkoutPayments.status(paymentId,user.uid);
    if(req.body.transaction_nsu && (req.body.slug || req.body.invoice_slug)) {
      try {await checkoutPayments.reconcile({...req.body,order_nsu:paymentId});} catch(e) {if(e.httpStatus!==409) throw e;}
    }
    return res.json(await checkoutPayments.status(paymentId,user.uid));
  } catch(e) {return res.status(e.httpStatus || 500).json({message:e.message});}
});

const CLIENTS_COLLECTION = 'clientes';
const getClientsCollection = () => db.collection(CLIENTS_COLLECTION);

const sanitizeClientPayload = (input = {}) => {
  const {
    comprasIncrement,
    incrementarCompras,
    totalComprasIncrement,
    totalCompras,
    compras,
    numeroDeComprasIncrement,
    valorEmComprasIncrement,
    numeroDeCompras,
    valorEmCompras,
    lojasVisitadas,
    criadoEm,
    criadoEmOriginal,
    updatedAt,
    atualizadoEm,
    createdAt,
    ...rest
  } = input || {};

  for (const key of ['authOwnerUid', 'uid', 'authIdentities', 'customerId', 'phoneVerified', 'payment_status', 'order_status']) delete rest[key];
  delete rest.numeroDeComprasIncrement;
  delete rest.valorEmComprasIncrement;

  const purchaseCountIncrement = Number(
    numeroDeComprasIncrement ?? incrementarCompras ?? compras ?? 0,
  );

  const purchaseValueIncrement = Number(
    valorEmComprasIncrement ?? totalComprasIncrement ?? totalCompras ?? valorEmCompras ?? 0,
  );

  return {
    data: rest,
    purchaseCountIncrement: Number.isFinite(purchaseCountIncrement) ? purchaseCountIncrement : 0,
    purchaseValueIncrement: Number.isFinite(purchaseValueIncrement) ? purchaseValueIncrement : 0,
    createdAt: criadoEm || createdAt || criadoEmOriginal || null,
  };
};

const findClientByPhone = async (telefone) => {
  if (!telefone) return null;
  const snapshot = await admin.firestore().collection(CLIENTS_COLLECTION).where('telefone', '==', telefone).limit(1).get();
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  return {id: docSnap.id, data: docSnap.data()};
};

const normalizePhoneNumber = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';

  let digits = String(value).replace(/\D/g, '');

  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  if (digits.length < 10 || digits.length > 11) return '';
  return digits;
};

const getPhoneLookupCandidates = (normalizedPhone) => {
  if (!normalizedPhone) return [];

  const candidates = [normalizedPhone];
  if (normalizedPhone.length === 11 && normalizedPhone[2] === '9') {
    candidates.push(`${normalizedPhone.slice(0, 2)}${normalizedPhone.slice(3)}`);
  }

  if (normalizedPhone.length === 10) {
    candidates.push(`${normalizedPhone.slice(0, 2)}9${normalizedPhone.slice(2)}`);
  }

  return Array.from(new Set(candidates));
};

const abbreviateName = (name) => {
  if (typeof name !== 'string' || !name.trim()) return 'Cliente';
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0];
  }

  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
};

const getClientRegistrationStatus = (clientData = {}) => {
  const hasName = typeof clientData.nome === 'string' && clientData.nome.trim().length > 0;
  const hasBirthdate = typeof clientData.aniversario === 'string' && clientData.aniversario.trim().length > 0;
  const hasAddress = Array.isArray(clientData.enderecos) && clientData.enderecos.length > 0;

  return hasName && hasBirthdate && hasAddress ? 'completo' : 'incompleto';
};

const buildSafeClientPayload = (clientData = {}) => ({
  nome: typeof clientData.nome === 'string' ? clientData.nome : '',
  telefone: typeof clientData.telefone === 'string' ? clientData.telefone : '',
  aniversario: typeof clientData.aniversario === 'string' ? clientData.aniversario : '',
  enderecos: Array.isArray(clientData.enderecos) ? clientData.enderecos : [],
  lojasVisitadas: Array.isArray(clientData.lojasVisitadas) ? clientData.lojasVisitadas : [],
  statusCadastro: getClientRegistrationStatus(clientData),
  nomeAbreviado: abbreviateName(clientData.nome),
});

const findClientByNormalizedPhone = async (normalizedPhone) => {
  const candidates = getPhoneLookupCandidates(normalizedPhone);

  for (const candidate of candidates) {
    const existing = await findClientByPhone(candidate);
    if (existing) {
      return {
        ...existing,
        matchedPhone: candidate,
      };
    }
  }

  return null;
};

const hashForPrivacy = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

const RATE_LIMIT_MAX_CALLS = 8;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_BLOCK_MS = 20 * 60 * 1000;

const enforcePhoneLookupRateLimit = async ({callerKeyHash, phoneHash}) => {
  const ref = db.collection('rateLimits').doc('phoneLookup').collection('entries').doc(callerKeyHash);
  const now = Date.now();

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const currentData = snap.exists ? snap.data() || {} : {};

    const blockedUntil = Number(currentData.blockedUntil || 0);
    if (blockedUntil > now) {
      throw new HttpsError('permission-denied', 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
    }

    const windowStart = Number(currentData.windowStart || 0);
    const isSameWindow = windowStart > 0 && now - windowStart < RATE_LIMIT_WINDOW_MS;
    const currentCount = isSameWindow ? Number(currentData.count || 0) : 0;
    const nextCount = currentCount + 1;

    const nextPayload = {
      count: nextCount,
      windowStart: isSameWindow ? windowStart : now,
      lastAttemptAt: now,
      lastPhoneHash: phoneHash,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (nextCount > RATE_LIMIT_MAX_CALLS) {
      nextPayload.blockedUntil = now + RATE_LIMIT_BLOCK_MS;
      transaction.set(ref, nextPayload, {merge: true});
      throw new HttpsError('permission-denied', 'Limite de tentativas excedido. Tente novamente mais tarde.');
    }

    transaction.set(ref, nextPayload, {merge: true});
  });
};

const createHttpError = (status, message, code = null) => {
  const error = new Error(message);
  error.httpStatus = status;
  if (code) error.code = code;
  return error;
};

const assertStoreOpen = (storeConfig) => {
  const availability = getStoreAvailability(storeConfig);
  if (availability === 'OPEN') return;
  if (availability === 'CLOSED') {
    throw createHttpError(403, 'A loja está fechada no momento. Volte em nosso horário de atendimento.', 'STORE_CLOSED');
  }
  throw createHttpError(503, 'Não foi possível verificar o horário da loja no momento.', 'CONFIG_UNAVAILABLE');
};

const normalizeCouponCode = (value) => (
  typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : ''
);

const upsertClientDocument = async ({
  targetRef,
  data,
  lojaId,
  setCreatedIfMissing = false,
  purchaseCountIncrement = 0,
  purchaseValueIncrement = 0,
  createdAt = null,
}) => {
  const timestamp = FieldValue.serverTimestamp();
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(targetRef);
    if (snap.data()?.authOwnerUid) throw createHttpError(403, 'Use Minha Conta para alterar este cadastro.');
    const payload = {
      ...data,
      lojaId: data.lojaId || lojaId || data.lojaId,
      atualizadoEm: timestamp,
    };

    if (lojaId) {
      payload.lojasVisitadas = FieldValue.arrayUnion(lojaId);
    }

    if (Number.isFinite(purchaseCountIncrement) && purchaseCountIncrement !== 0) {
      payload.numeroDeCompras = FieldValue.increment(purchaseCountIncrement);
    }

    if (Number.isFinite(purchaseValueIncrement) && purchaseValueIncrement !== 0) {
      payload.valorEmCompras = FieldValue.increment(purchaseValueIncrement);
    }

    if (!snap.exists && setCreatedIfMissing) {
      payload.criadoEm = createdAt || timestamp;
      payload.numeroDeCompras = payload.numeroDeCompras ?? 0;
      payload.valorEmCompras = payload.valorEmCompras ?? 0;
      payload.lojasVisitadas = lojaId ? FieldValue.arrayUnion(lojaId) : payload.lojasVisitadas;
    }

    transaction.set(targetRef, payload, {merge: true});
    return {id: targetRef.id};
  });
};

// Rota para buscar todos os produtos ativos
app.get("/produtos", async (req, res) => {
  const lojaId = requireStoreId(req, res);
  if (!lojaId) return;
  try {
    const snapshot = await db.collection("lojas").doc(lojaId).collection("produtos").where("status", "==", "Ativo").get();
    const products = snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
    res.status(200).json(products);
  } catch (error) {
    logger.error("Erro ao buscar produtos:", error);
    res.status(500).send("Erro ao buscar produtos.");
  }
});

// Rota para buscar cliente por telefone
app.get("/clientes/buscar", async (req, res) => {
  const lojaId = requireStoreId(req, res);
  if (!lojaId) return;

  const telefone = typeof req.query?.telefone === 'string' ? req.query.telefone.trim() : '';
  if (!telefone) {
    return res.status(400).json({message: 'Parâmetro telefone é obrigatório.'});
  }

  try {
    const existing = await findClientByPhone(telefone);
    if (!existing) {
      return res.status(404).json({message: 'Cliente não encontrado.'});
    }

    await upsertClientDocument({
      targetRef: getClientsCollection().doc(existing.id),
      data: existing.data,
      lojaId,
      setCreatedIfMissing: true,
    });

    const refreshed = await getClientsCollection().doc(existing.id).get();
    return res.status(200).json({id: refreshed.id, ...refreshed.data()});
  } catch (error) {
    logger.error("Erro ao buscar cliente por telefone:", error);
    res.status(500).send("Erro ao buscar cliente.");
  }
});

// Rota para buscar todos os clientes
app.get("/clientes", async (req, res) => {
  const lojaId = requireStoreId(req, res);
  if (!lojaId) return;
  try {
    const token = await checkoutToken(req);
    const staff = (await db.collection('users').doc(token.uid).get()).data();
    if (!staff || staff.ativo === false || staff.status === 'inativo' || !['dono', 'gerente', 'atendente'].includes(staff.role)) return res.status(403).json({message:'Acesso restrito à equipe.'});
    if (staff.role !== 'dono' && staff.lojaId !== lojaId && !staff.lojaIds?.includes(lojaId)) return res.status(403).json({message:'Loja não autorizada.'});
    const snapshot = await getClientsCollection().where('lojasVisitadas', 'array-contains', lojaId).get();
    const clients = snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
    res.status(200).json(clients);
  } catch (error) {
    logger.error("Erro ao buscar clientes:", error);
    res.status(500).send("Erro ao buscar clientes.");
  }
});

// Rota para criar um novo cliente
app.post("/clientes", async (req, res) => {
  const lojaId = requireStoreId(req, res);
  if (!lojaId) return;

  try {
    const {data: newClient, purchaseCountIncrement, purchaseValueIncrement} = sanitizeClientPayload(req.body || {});
    const telefone = typeof newClient.telefone === 'string' ? newClient.telefone.trim() : '';

    const existing = await findClientByPhone(telefone);
    const targetRef = existing ? getClientsCollection().doc(existing.id) : getClientsCollection().doc();

    await upsertClientDocument({
      targetRef,
      data: newClient,
      lojaId,
      setCreatedIfMissing: !existing,
      purchaseCountIncrement,
      purchaseValueIncrement,
    });

    const savedSnap = await targetRef.get();
    const responseStatus = existing ? 200 : 201;
    res.status(responseStatus).json({id: targetRef.id, ...savedSnap.data()});
  } catch (error) {
    logger.error("Erro ao criar cliente:", error);
    res.status(500).send("Erro ao criar cliente.");
  }
});

// Rota para atualizar um cliente (adicionar endereço ou registrar compra)
app.put("/clientes/:id", async (req, res) => {
  const lojaId = requireStoreId(req, res);
  if (!lojaId) return;

  try {
    const {id} = req.params;
    const {newAddress, ...rawData} = req.body || {};
    const {data: clientData, purchaseCountIncrement, purchaseValueIncrement} = sanitizeClientPayload(rawData);
    const clientRef = getClientsCollection().doc(id);
    const updates = {...clientData};

    if (newAddress) {
      updates.enderecos = FieldValue.arrayUnion(newAddress);
    }

    await upsertClientDocument({
      targetRef: clientRef,
      data: updates,
      lojaId,
      setCreatedIfMissing: true,
      purchaseCountIncrement,
      purchaseValueIncrement,
    });

    const updatedSnap = await clientRef.get();
    res.status(200).json({id, ...updatedSnap.data()});
  } catch (error) {
    logger.error("Erro ao atualizar cliente:", error);
    res.status(500).send("Erro ao atualizar cliente.");
  }
});


const quoteOrderFreight = async (transaction, storeId, primaryData, payload, pickup, address) => {
  try {
    const config = pickup ? {} : await loadStoreFreightConfig({
      db, storeId, primaryData, read: (ref) => transaction.get(ref),
    });
    if (!pickup && config.freteACombinar !== true) validateFreightCoordinates(config);
    const distanceKm = pickup || config.freteACombinar === true ? null : await resolveFreightDistance({
      config, address,
    });
    const quote = quoteFreight({
      config,
      pickup,
      distanceKm,
    });
    const freight = orderFreightSnapshot({config, quote, storeId, distanceKm});
    assertFreightClaims(payload, freight, pickup);
    return freight;
  } catch (error) {
    if (error.httpStatus) throw error;
    throw createHttpError(400, error.message, 'FREIGHT_INVALID');
  }
};

// Rota para criar um novo pedido
app.post("/pedidos", async (req, res) => {
  const lojaId = requireStoreId(req, res);
  if (!lojaId) return;

  const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
  if (!itens.length) {
    return res.status(400).json({ok: false, message: 'Adicione ao menos um item ao pedido.'});
  }

  try {
    const orderId = await db.runTransaction(async (transaction) => {
      const storeConfigSnap = await transaction.get(getStoreConfigDoc(lojaId));
      const storeConfig = storeConfigSnap.exists ? (storeConfigSnap.data() || {}) : null;
      assertStoreOpen(storeConfig);

      const validatedItems = [];
      let calculatedSubtotal = 0;

      for (const item of itens) {
        const produtoId = item?.produtoId || item?.id;
        const quantity = Number(item?.quantity || item?.quantidade || 0);
        if (!produtoId || !Number.isFinite(quantity) || quantity <= 0) {
          throw createHttpError(400, 'Item de pedido inválido.');
        }

        const productRef = db.collection('lojas').doc(lojaId).collection('produtos').doc(String(produtoId));
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists) {
          throw createHttpError(404, `Produto ${produtoId} não encontrado.`);
        }

        const productData = productSnap.data() || {};
        const productStatus = productData.status || 'Ativo';
        if (productData.ativo === false || productStatus !== 'Ativo') {
          throw createHttpError(409, `Produto ${productData.nome || produtoId} não está disponível.`, 'PRODUCT_UNAVAILABLE');
        }

        if (typeof productData.estoque === 'number' && productData.estoque < quantity) {
          throw createHttpError(409, `Estoque insuficiente para ${productData.nome || produtoId}.`, 'OUT_OF_STOCK');
        }

        const currentPrice = Number(productData.preco || 0);
        if (!Number.isFinite(currentPrice) || currentPrice < 0) {
          throw createHttpError(409, `Preço inválido para ${productData.nome || produtoId}.`, 'PRODUCT_PRICE_INVALID');
        }

        const clientPrice = Number(item?.preco || 0);
        if (Number.isFinite(clientPrice) && Math.abs(clientPrice - currentPrice) > 0.009) {
          throw createHttpError(
            409,
            `O preço de ${productData.nome || produtoId} mudou. Revise o pedido antes de salvar.`,
            'PRICE_CHANGED',
          );
        }

        calculatedSubtotal += currentPrice * quantity;
        validatedItems.push({
          produtoId: String(produtoId),
          nome: productData.nome || item?.nome || '',
          quantity,
          preco: Number(currentPrice.toFixed(2)),
        });
      }

      const subtotalFinal = Number(calculatedSubtotal.toFixed(2));
      const descontoFinal = Math.min(Math.max(Number(req.body?.desconto || 0), 0), subtotalFinal);
      const freight = await quoteOrderFreight(
        transaction,
        lojaId,
        storeConfig,
        req.body,
        req.body?.clienteEndereco === 'Retirar na Loja',
        req.body?.clienteEndereco,
      );
      const totalFinal = totalWithFreight(subtotalFinal - descontoFinal, freight);

      const orderRef = db.collection("lojas").doc(lojaId).collection("pedidos").doc();
      transaction.set(orderRef, {
        ...req.body,
        lojaId,
        itens: validatedItems,
        subtotal: subtotalFinal,
        desconto: descontoFinal,
        ...freight,
        total: totalFinal,
        createdAt: FieldValue.serverTimestamp(),
      });

      return orderRef.id;
    });

    res.status(201).json({id: orderId});
  } catch (error) {
    logger.error("Erro ao criar pedido:", error);
    const statusCode = Number(error?.httpStatus) || 500;
    const payload = {ok: false, message: error?.message || 'Erro ao criar pedido.'};
    if (error?.code) payload.code = error.code;
    res.status(statusCode).json(payload);
  }
});

app.post("/checkout/confirmar", async (req, res) => {
  const lojaId = requireStoreId(req, res);
  if (!lojaId) return;

  const cliente = req.body?.cliente || {};
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
  const pagamento = req.body?.pagamento || {};
  const cupom = req.body?.cupom || null;
  const subtotal = Number(req.body?.subtotal ?? 0);
  const descontoInformado = Number(req.body?.desconto ?? 0);
  const origem = typeof req.body?.origem === 'string' ? req.body.origem : 'Cardapio Online';
  const status = 'Pendente';
  const online = pagamento.forma === 'Online';

  if (!itens.length) {
    return res.status(400).json({ok: false, message: 'Adicione ao menos um item ao pedido.'});
  }

  if (!cliente?.nome || !cliente?.telefone) {
    return res.status(400).json({ok: false, message: 'Dados do cliente incompletos.'});
  }

  try {
    const whatsappConfirmation = buildCheckoutWhatsApp({phone: cliente.telefone,
      consent: req.body?.whatsappConsent, serverTimestamp: () => FieldValue.serverTimestamp()});
    let paymentConfig, paymentId, ownerUid, orderRef, fingerprint, buyerEmail, checkoutCustomerId;
    if(req.headers.authorization) ownerUid=(await checkoutToken(req)).uid;
    if(online) {
      const token=await checkoutToken(req);ownerUid=token.uid;buyerEmail=token.email;
      let account;
      try {account=await customerAccounts.account({auth:{uid:ownerUid,token}});}
      catch(e) {
        if(['unauthenticated','permission-denied','not-found'].includes(e.code)) throw paymentError('Entre em sua conta de cliente para pagar online.',403);
        throw e;
      }
      checkoutCustomerId=account.customer?.id;
      if(!checkoutCustomerId || cliente.id!==checkoutCustomerId) throw paymentError('Entre em sua conta de cliente para pagar online.',403);
      if(!/^[a-zA-Z0-9_-]{16,100}$/.test(req.body?.idempotencyKey || '')) throw paymentError('Identificador do pedido inválido.',400);
      paymentConfig=await checkoutPayments.config(lojaId);
      paymentId=crypto.createHash('sha256').update(ownerUid+':'+lojaId+':'+req.body.idempotencyKey).digest('hex');
      fingerprint=crypto.createHash('sha256').update(JSON.stringify({cliente,itens,cupom,subtotal,delivery:req.body.delivery,descontoInformado})).digest('hex');
      orderRef=db.collection('lojas').doc(lojaId).collection('pedidos').doc(paymentId);
    }
    const orderId = await db.runTransaction(async (transaction) => {
      if(online) {
        const prior=await transaction.get(db.collection('checkoutPayments').doc(paymentId));
        if(prior.exists) {
          if(prior.data().fingerprint!==fingerprint) throw paymentError('O pedido já foi enviado com outros dados. Consulte o pagamento pendente.');
          const savedOrder = await transaction.get(orderRef);
          if (!savedOrder.exists) throw paymentError('Pedido indisponível. Consulte o pagamento pendente.');
          assertFreightClaims(req.body, savedOrder.data(), cliente.endereco === 'Retirar na Loja');
          return prior.data().orderId;
        }
      }
      const storeConfigRef = getStoreConfigDoc(lojaId);
      const storeConfigSnap = await transaction.get(storeConfigRef);
      const storeConfig = storeConfigSnap.exists ? (storeConfigSnap.data() || {}) : null;
      assertStoreOpen(storeConfig);
      const freight = await quoteOrderFreight(
        transaction,
        lojaId,
        storeConfig,
        req.body,
        cliente.endereco === 'Retirar na Loja',
        cliente.endereco,
      );
      const seenProducts=new Set();
      const stockUpdates = [];
      const validatedItems = [];
      let calculatedSubtotal = 0;

      for (const item of itens) {
        const produtoId = item?.produtoId || item?.id;
        const quantity = Number(item?.quantity || 0);
        if (!produtoId || !Number.isSafeInteger(quantity) || quantity <= 0 || seenProducts.has(String(produtoId))) {
          throw createHttpError(400, 'Item de pedido inválido.');
        }

        seenProducts.add(String(produtoId));
        const productRef = db.collection('lojas').doc(lojaId).collection('produtos').doc(String(produtoId));
        const productSnap = await transaction.get(productRef);

        if (!productSnap.exists) {
          throw createHttpError(404, `Produto ${produtoId} não encontrado.`);
        }

        const productData = productSnap.data() || {};
        const productStatus = productData.status || 'Ativo';
        if (productData.ativo === false || productStatus !== 'Ativo') {
          throw createHttpError(409, `Produto ${productData.nome || produtoId} não está disponível.`, 'PRODUCT_UNAVAILABLE');
        }

        const currentPrice = Number(productData.preco || 0);
        if (!Number.isFinite(currentPrice) || currentPrice < 0) {
          throw createHttpError(409, `Preço inválido para ${productData.nome || produtoId}.`, 'PRODUCT_PRICE_INVALID');
        }

        const clientPrice = Number(item?.preco || 0);
        if (Number.isFinite(clientPrice) && Math.abs(clientPrice - currentPrice) > 0.009) {
          throw createHttpError(
            409,
            `O preço de ${productData.nome || produtoId} mudou. Revise o carrinho antes de confirmar.`,
            'PRICE_CHANGED',
          );
        }

        if (typeof productData.estoque === 'number') {
          const newStock = productData.estoque - quantity;
          if (newStock < 0) {
            throw createHttpError(409, `Estoque insuficiente para ${productData.nome || produtoId}.`);
          }
          stockUpdates.push({ref: productRef, newStock, quantity});
        }

        calculatedSubtotal += currentPrice * quantity;
        validatedItems.push({
          produtoId: String(produtoId),
          nome: productData.nome || item?.nome || '',
          quantity,
          preco: Number(currentPrice.toFixed(2)),
        });
      }

      const subtotalFinal = Number(calculatedSubtotal.toFixed(2));
      if (!Number.isFinite(subtotalFinal) || subtotalFinal <= 0) {
        throw createHttpError(400, 'Subtotal do pedido inválido.');
      }

      if (Math.abs(subtotal - subtotalFinal) > 0.009) {
        throw createHttpError(
          409,
          'O subtotal mudou porque produtos foram atualizados. Revise o carrinho antes de confirmar.',
          'CART_CHANGED',
        );
      }

      let cupomDocRef = null;
      let couponCode = '';
      let valorDesconto = 0;

      if (cupom?.codigo) {
        couponCode = normalizeCouponCode(cupom.codigo);
        if (!couponCode) {
          throw createHttpError(400, 'Cupom inválido.');
        }

        let cupomQuerySnap = await transaction.get(
          getStoreConfigCollection(lojaId, 'cupons').where('codigo', '==', couponCode).limit(1),
        );

        if (!cupomQuerySnap.empty) {
          cupomDocRef = cupomQuerySnap.docs[0].ref;
        } else if (cupom?.id) {
          const fallbackRef = getStoreConfigCollection(lojaId, 'cupons').doc(String(cupom.id));
          const fallbackSnap = await transaction.get(fallbackRef);
          if (fallbackSnap.exists && normalizeCouponCode(fallbackSnap.data()?.codigo) === couponCode) {
            cupomDocRef = fallbackRef;
          }
        }

        if (!cupomDocRef) {
          throw createHttpError(404, 'Cupom não encontrado.');
        }

        const cupomSnap = await transaction.get(cupomDocRef);
        const cupomData = cupomSnap.data() || {};
        if (cupomData.status !== 'Ativo') {
          throw createHttpError(400, 'Este cupom não está ativo.');
        }

        const usosAtuais = typeof cupomData.usos === 'number' ? cupomData.usos : 0;
        const limiteUso = Number(cupomData.limiteUso || 0);
        if (limiteUso > 0 && usosAtuais + Number(cupomData.reservados || 0) >= limiteUso) {
          throw createHttpError(400, 'Este cupom atingiu o limite de usos.');
        }

        const valorMinimo = Number(cupomData.valorMinimo || 0);
        if (valorMinimo > 0 && subtotalFinal < valorMinimo) {
          throw createHttpError(400, `O pedido mínimo para este cupom é de R$ ${valorMinimo.toFixed(2)}.`);
        }

        if (cupomData.tipoDesconto === 'percentual') {
          valorDesconto = Number(((subtotalFinal * Number(cupomData.valor || 0)) / 100).toFixed(2));
        } else {
          valorDesconto = Number(Number(cupomData.valor || 0).toFixed(2));
        }
      } else if (descontoInformado > 0) {
        throw createHttpError(400, 'Desconto informado sem cupom válido.');
      }

      const descontoFinal = cupomDocRef ? Math.min(subtotalFinal, Math.max(0,valorDesconto)) : 0;
      const total = totalWithFreight(subtotalFinal - descontoFinal, freight);
      if (!Number.isFinite(total) || total < 0) {
        throw createHttpError(400, 'Totais do pedido inválidos.');
      }

      let clienteRef = null;
      let clienteSnap = null;
      if (cliente?.id) {
        clienteRef = getClientsCollection().doc(String(cliente.id));
        clienteSnap = await transaction.get(clienteRef);
      }

      if (online && (!clienteSnap?.exists || clienteRef.id!==checkoutCustomerId || clienteSnap.data().authOwnerUid!==ownerUid)) throw paymentError('Cadastro de cliente não autorizado para pagamento online.',403);
      if (clienteSnap?.data()?.authOwnerUid && clienteSnap.data().authOwnerUid !== ownerUid) throw paymentError('Entre na conta vinculada ao cadastro.',403);
      if (online && clienteSnap?.data()?.cuponsUsados?.includes(couponCode)) throw paymentError('Você já utilizou este cupom.');
      if (couponCode && clienteSnap?.data()?.cuponsReservados?.includes(couponCode)) throw paymentError('Este cupom está reservado em outro pedido.');
      if (!orderRef) orderRef = db.collection('lojas').doc(lojaId).collection('pedidos').doc();
      if(online) {
        transaction.set(db.collection('checkoutPayments').doc(paymentId),{
          orderId:orderRef.id,orderPath:orderRef.path,storeId:lojaId,ownerUid,fingerprint,
          payment_status:'PENDING',amount:cents(total),...paymentConfig,
          expiresAt:admin.firestore.Timestamp.fromMillis(Date.now()+RESERVATION_MS),
          reservation:{state:'HELD',stock:stockUpdates.map(s=>({path:s.ref.path,quantity:s.quantity})),
            couponPath:cupomDocRef?.path || null,couponCode,
            customerPath:cupomDocRef && clienteSnap?.exists ? clienteRef.path : null},
          ...paymentPrefill(paymentConfig,cliente,req.body.delivery,buyerEmail),
          createdAt:FieldValue.serverTimestamp()
        });
      }
      transaction.set(orderRef, {
        lojaId,
        clienteId: cliente.id || null,
        clienteNome: cliente.nome,
        clienteEndereco: cliente.endereco || '',
        telefone: cliente.telefone,
        whatsappConfirmation,
        formaPagamento: pagamento.forma || pagamento.formaPagamento || '',
        itens: validatedItems,
        subtotal: subtotalFinal,
        desconto: descontoFinal,
        ...freight,
        total,
        cupom: cupomDocRef ? {codigo: couponCode, valorDesconto: descontoFinal} : null,
        status: online ? 'Aguardando pagamento' : status,
        ...(online ? {order_status:'PENDING',payment_status:'PENDING',paymentId,ownerUid} : {}),
        origem,
        createdAt: FieldValue.serverTimestamp(),
      });

      for (const stockUpdate of stockUpdates) {
        transaction.update(stockUpdate.ref, {estoque: stockUpdate.newStock});
      }

      if (cupomDocRef) {
        transaction.set(cupomDocRef, {[online ? 'reservados' : 'usos']: FieldValue.increment(1)}, {merge: true});

        if (clienteRef && clienteSnap?.exists) {
          transaction.set(clienteRef, {
            [online ? 'cuponsReservados' : 'cuponsUsados']: FieldValue.arrayUnion(couponCode),
            atualizadoEm: FieldValue.serverTimestamp(),
          }, {merge: true});
        }
      }

      return {id: orderRef.id, subtotal: subtotalFinal, desconto: descontoFinal, ...freight, total,
        whatsappPhoneStatus: whatsappConfirmation.phoneStatus};
    });

    if(online) return res.status(200).json({ok:true,...await checkoutPayments.start(paymentId,ownerUid),whatsappPhoneStatus:whatsappConfirmation.phoneStatus});
    return res.status(200).json({ok: true, ...orderId});
  } catch (error) {
    logger.error('Erro ao confirmar checkout:', error);
    const statusCode = Number(error?.httpStatus) || 500;
    const payload = {
      ok: false,
      message: error?.message || 'Erro ao confirmar pedido.',
    };
    if (error?.code) payload.code = error.code;
    return res.status(statusCode).json(payload);
  }
});

// Rota para calcular frete
app.post("/frete/calcular", async (req, res) => {
	const lojaId = requireStoreId(req, res);
    if (!lojaId) return;
    try {
        const { clienteLat, clienteLng } = req.body;
        const freteConfig = await loadStoreFreightConfig({db, storeId: lojaId});
        if (freteConfig.freteACombinar === true) {
            return res.status(200).json({...quoteFreight({config: freteConfig}), distanciaKm: null});
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'clienteEndereco')) {
            const distanciaKm = await resolveFreightDistance({config: freteConfig, address: req.body.clienteEndereco});
            return res.status(200).json({...quoteFreight({config: freteConfig, distanceKm: distanciaKm}), distanciaKm});
        }
        const {lat: lojaLat, lng: lojaLng} = validateFreightCoordinates(freteConfig);
        if (req.body?.distanciaKm != null) {
            return res.status(200).json({
                ...quoteFreight({config: freteConfig, distanceKm: req.body.distanciaKm}),
                distanciaKm: Number(req.body.distanciaKm),
            });
        }
        try {
            validateFreightCoordinates({lat: clienteLat, lng: clienteLng});
        } catch (error) {
            return res.status(400).json({message: 'Confirme novamente o endereço para calcular o frete.'});
        }

        function getDistance(lat1, lon1, lat2, lon2) {
            const R = 6371; // Raio da Terra em km
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        const distanciaKm = getDistance(lojaLat, lojaLng, clienteLat, clienteLng);
        return res.status(200).json({
            ...quoteFreight({config: freteConfig, distanceKm: distanciaKm}),
            distanciaKm,
        });

    } catch (error) {
        logger.error("Erro ao calcular frete:", error);
        return res.status(error.httpStatus || 400).json({message: error.message || 'Erro ao calcular frete.'});
    }
});


// Rota para verificar cupom
app.post("/cupons/verificar", async (req, res) => {
    const { codigo, totalCarrinho } = req.body;
    const lojaId = requireStoreId(req, res);
    if (!lojaId) return;
    try {
        const cupomCodigo = codigo.toUpperCase();
        const cuponsCollection = getStoreConfigCollection(lojaId, 'cupons');
        let cupom = null;
        let legacyCupomFound = false;

        const newPathSnapshot = await cuponsCollection.where('codigo', '==', cupomCodigo).limit(1).get();
        if (!newPathSnapshot.empty) {
            const docSnap = newPathSnapshot.docs[0];
            cupom = { id: docSnap.id, ...docSnap.data() };
        }

        if (!cupom) {
            const legacyConfigDoc = await getLegacyConfigDoc(lojaId, 'cupons').get();
            if (legacyConfigDoc.exists) {
                const data = legacyConfigDoc.data() || {};
                const possibleLists = [data.lista, data.cupons, data.items];

                for (const list of possibleLists) {
                    if (Array.isArray(list)) {
                        cupom = list.find((item) => item?.codigo?.toUpperCase && item.codigo.toUpperCase() === cupomCodigo);
                    }
                    if (cupom) break;
                }

                if (!cupom && typeof data === 'object' && data !== null) {
                    const directCupom = data[cupomCodigo] || data[cupomCodigo.toLowerCase()];
                    if (directCupom && typeof directCupom === 'object') {
                        cupom = { codigo: cupomCodigo, ...directCupom };
                    }
                }

                legacyCupomFound = Boolean(cupom);
            }
        }

        if (!cupom) {
            const legacyDoc = await getLegacyInfoDoc(lojaId).get();
            const legacyCupons = legacyDoc.data()?.cupons;
            if (Array.isArray(legacyCupons)) {
                cupom = legacyCupons.find((item) => item?.codigo?.toUpperCase && item.codigo.toUpperCase() === cupomCodigo) || null;
                legacyCupomFound = Boolean(cupom);
            }
        }

        if (!cupom) {
            return res.status(404).json({ valido: false, mensagem: "Cupom não encontrado." });
        }

        if (legacyCupomFound) {
            const targetId = cupom.id || cupomCodigo.toLowerCase();
            const { id, ...cupomData } = cupom;
            await cuponsCollection.doc(targetId).set({ ...cupomData, codigo: cupomCodigo }, { merge: true });
            cupom = { ...cupomData, codigo: cupomCodigo, id: targetId };
        }

        if (cupom.status !== "Ativo") {
            return res.status(400).json({ valido: false, mensagem: "Este cupom não está ativo." });
        }
        const usosAtuais = typeof cupom.usos === 'number' ? cupom.usos : 0;
        if (cupom.limiteUso && usosAtuais >= cupom.limiteUso) {
            return res.status(400).json({ valido: false, mensagem: "Este cupom atingiu o limite de usos." });
        }
        if (cupom.valorMinimo && totalCarrinho < cupom.valorMinimo) {
            return res.status(400).json({ valido: false, mensagem: `O pedido mínimo para este cupom é de R$ ${cupom.valorMinimo.toFixed(2)}.` });
        }
        
        let valorDesconto = 0;
        if (cupom.tipoDesconto === 'percentual') {
            valorDesconto = (totalCarrinho * cupom.valor) / 100;
        } else {
            valorDesconto = cupom.valor;
        }
        
        cupom.valorDesconto = parseFloat(valorDesconto.toFixed(2));

        res.status(200).json({ valido: true, cupom });

    } catch (error) {
        logger.error("Erro ao verificar cupom:", error);
        res.status(500).send("Erro ao verificar cupom.");
    }
});




exports.lookupClientByPhone = onCall({ cors: LOOKUP_CLIENT_ALLOWED_ORIGINS }, async (request) => {
  try {
    const rawPhone = request.data?.telefone;
    const lojaId = typeof request.data?.lojaId === 'string' ? request.data.lojaId.trim() : '';

    const normalizedPhone = normalizePhoneNumber(rawPhone);
    if (!normalizedPhone) {
      throw new HttpsError('invalid-argument', 'Telefone inválido.');
    }

    if (!lojaId) {
      throw new HttpsError('invalid-argument', 'lojaId é obrigatório.');
    }

    const storeDoc = await getStoreRef(lojaId).get();
    if (!storeDoc.exists) {
      throw new HttpsError('permission-denied', 'Loja inválida para consulta.');
    }

    const rawIp = request.rawRequest?.headers?.['x-forwarded-for'] || request.rawRequest?.ip || 'unknown';
    const callerIdentity = request.auth?.uid || `${rawIp}`.split(',')[0].trim() || 'anonymous';
    const callerKeyHash = hashForPrivacy(callerIdentity);
    const phoneHash = hashForPrivacy(normalizedPhone);

    await enforcePhoneLookupRateLimit({callerKeyHash, phoneHash});

    const found = await findClientByNormalizedPhone(normalizedPhone);

    const auditPayload = {
      action: 'lookupClientByPhone',
      callerKeyHash,
      phoneHash,
      lojaId,
      found: Boolean(found),
      createdAt: FieldValue.serverTimestamp(),
    };

    if (!found) {
      await db.collection('auditLogs').add({
        ...auditPayload,
        outcome: 'not-found',
      });
      throw new HttpsError('not-found', 'Cliente não encontrado.');
    }

    if (found.data?.authOwnerUid) throw new HttpsError('permission-denied', 'Este cadastro usa Minha Conta. Continue com Google.');
    await upsertClientDocument({
      targetRef: getClientsCollection().doc(found.id),
      data: found.data,
      lojaId,
      setCreatedIfMissing: true,
    });

    await db.collection('auditLogs').add({
      ...auditPayload,
      outcome: 'success',
      clientId: found.id,
    });

    return {
      clientId: found.id,
      phoneNormalized: normalizedPhone,
      client: buildSafeClientPayload(found.data),
    };
  } catch (error) {
    logger.error('lookupClientByPhone failed', {
      code: error?.code || null,
      message: error?.message || 'Erro desconhecido',
      stack: error?.stack || null,
      hasAuth: Boolean(request.auth?.uid),
      lojaId: request.data?.lojaId || null,
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Não foi possível buscar o cliente agora. Tente novamente.');
  }
});


exports.updateClientProfile = onCall({ cors: LOOKUP_CLIENT_ALLOWED_ORIGINS }, async (request) => {
  try {
    const lojaId = typeof request.data?.lojaId === 'string' ? request.data.lojaId.trim() : '';
    const clientId = typeof request.data?.clientId === 'string' ? request.data.clientId.trim() : '';
    const nome = typeof request.data?.nome === 'string' ? request.data.nome.trim() : '';
    const aniversario = typeof request.data?.aniversario === 'string' ? request.data.aniversario.trim() : '';

    if (!lojaId) {
      throw new HttpsError('invalid-argument', 'lojaId é obrigatório.');
    }

    if (!clientId) {
      throw new HttpsError('invalid-argument', 'clientId é obrigatório.');
    }

    if (!nome) {
      throw new HttpsError('invalid-argument', 'nome é obrigatório.');
    }

    if (!aniversario) {
      throw new HttpsError('invalid-argument', 'aniversario é obrigatório.');
    }

    const clientRef = getClientsCollection().doc(clientId);
    const clientSnap = await clientRef.get();

    if (clientSnap.data()?.authOwnerUid && clientSnap.data().authOwnerUid !== request.auth?.uid) throw new HttpsError('permission-denied', 'Entre na conta vinculada a este cadastro.');
    if (!clientSnap.exists) {
      throw new HttpsError('not-found', 'Cliente não encontrado.');
    }

    await clientRef.update({
      nome,
      aniversario,
      lojaId,
      lojasVisitadas: FieldValue.arrayUnion(lojaId),
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    const updatedClientSnap = await clientRef.get();
    const updatedClientData = updatedClientSnap.data() || {};

    return {
      clientId,
      client: buildSafeClientPayload(updatedClientData),
    };
  } catch (error) {
    logger.error('updateClientProfile failed', {
      code: error?.code || null,
      message: error?.message || 'Erro desconhecido',
      clientId: request.data?.clientId || null,
      lojaId: request.data?.lojaId || null,
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Não foi possível atualizar o perfil agora. Tente novamente.');
  }
});

exports.addClientAddress = onCall({ cors: LOOKUP_CLIENT_ALLOWED_ORIGINS }, async (request) => {
  try {
    const clientId = typeof request.data?.clientId === 'string' ? request.data.clientId.trim() : '';
    const lojaId = typeof request.data?.lojaId === 'string' ? request.data.lojaId.trim() : '';
    const incomingAddress = request.data?.address;
    const address = incomingAddress && typeof incomingAddress === 'object' ? incomingAddress : null;

    if (!clientId || !lojaId || !address) {
      throw new HttpsError('invalid-argument', 'Parâmetros obrigatórios ausentes.');
    }

    const storeDoc = await getStoreRef(lojaId).get();
    if (!storeDoc.exists) {
      throw new HttpsError('permission-denied', 'Loja inválida para atualização.');
    }

    const allowedAddress = {
      enderecoCompleto: typeof address.enderecoCompleto === 'string' ? address.enderecoCompleto.trim() : '',
      nickname: typeof address.nickname === 'string' ? address.nickname.trim() : '',
      referencia: typeof address.referencia === 'string' ? address.referencia.trim() : '',
      complemento: typeof address.complemento === 'string' ? address.complemento.trim() : '',
      semNumero: Boolean(address.semNumero),
      isDefault: Boolean(address.isDefault),
      localizacaoFrequente: Boolean(address.localizacaoFrequente),
      criadoEm: typeof address.criadoEm === 'string' && address.criadoEm.trim() ? address.criadoEm.trim() : new Date().toISOString(),
    };

    const lat = Number(address.lat);
    const lng = Number(address.lng);
    if (!allowedAddress.enderecoCompleto || !allowedAddress.nickname || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new HttpsError('invalid-argument', 'Dados de endereço inválidos.');
    }

    allowedAddress.lat = lat;
    allowedAddress.lng = lng;

    const clientRef = getClientsCollection().doc(clientId);
    const clientSnap = await clientRef.get();
    if (clientSnap.data()?.authOwnerUid && clientSnap.data().authOwnerUid !== request.auth?.uid) throw new HttpsError('permission-denied', 'Entre na conta vinculada a este cadastro.');
    if (!clientSnap.exists) {
      throw new HttpsError('not-found', 'Cliente não encontrado.');
    }

    await clientRef.update({
      enderecos: FieldValue.arrayUnion(allowedAddress),
      lojasVisitadas: FieldValue.arrayUnion(lojaId),
      lojaId,
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    return {success: true, address: allowedAddress};
  } catch (error) {
    logger.error('addClientAddress failed', {
      code: error?.code || null,
      message: error?.message || 'Erro desconhecido',
      clientId: request.data?.clientId || null,
      lojaId: request.data?.lojaId || null,
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Não foi possível salvar o endereço agora. Tente novamente.');
  }
});

const getSaoPauloPointNow = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: DEFAULT_STORE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    now,
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    competenciaKey: `${parts.year}-${parts.month}`,
    timeLabel: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`,
  };
};

const pointPayloadForType = (type, timeLabel, coords, address) => {
  const cleanAddress = typeof address === 'string' ? address.trim() : '';
  const location = coords && Number.isFinite(Number(coords.latitude)) && Number.isFinite(Number(coords.longitude))
    ? {
        latitude: Number(coords.latitude),
        longitude: Number(coords.longitude),
        capturedAt: typeof coords.capturedAt === 'string' ? coords.capturedAt : new Date().toISOString(),
      }
    : null;
  return {
    entrada: {
      horaEntrada: timeLabel,
      localizacaoEntrada: location,
      localizacaoEntradaEndereco: cleanAddress,
    },
    almoco_inicio: {
      horaAlmocoSaida: timeLabel,
    },
    almoco_fim: {
      horaAlmocoRetorno: timeLabel,
    },
    saida: {
      horaSaida: timeLabel,
      localizacaoSaida: location,
      localizacaoSaidaEndereco: cleanAddress,
    },
  }[type] || null;
};

const getPointEventState = (events = []) => {
  let state = 'sem_periodo';
  events.forEach((event) => {
    if (event.tipo === 'entrada') state = 'trabalhando';
    if (event.tipo === 'almoco_inicio') state = 'almoco';
    if (event.tipo === 'almoco_fim') state = 'trabalhando';
    if (event.tipo === 'saida') state = 'sem_periodo';
  });
  return state;
};

const validatePointTransition = (type, current = {}, timeLabel = '') => {
  const events = getPointEvents(current);
  const state = getPointEventState(events);
  const currentMinutes = pointTimeToMinutes(timeLabel);
  const lastEvent = events[events.length - 1];
  const lastMinutes = pointTimeToMinutes(lastEvent?.hora);
  if (currentMinutes !== null && lastMinutes !== null && currentMinutes <= lastMinutes) {
    throw new HttpsError('failed-precondition', 'O novo horário deve ser posterior à última batida registrada.');
  }
  if (type === 'entrada') {
    if (state !== 'sem_periodo') {
      throw new HttpsError('already-exists', 'Já existe um período de trabalho aberto.');
    }
    return;
  }
  if (type === 'almoco_inicio') {
    if (state !== 'trabalhando') {
      throw new HttpsError('failed-precondition', 'Registre a entrada antes do início do almoço.');
    }
    return;
  }
  if (type === 'almoco_fim') {
    if (state !== 'almoco') {
      throw new HttpsError('failed-precondition', 'Registre o início do almoço antes do retorno.');
    }
    return;
  }
  if (type === 'saida') {
    if (state === 'almoco') {
      throw new HttpsError('failed-precondition', 'Registre o retorno do almoço antes da saída.');
    }
    if (state !== 'trabalhando') {
      throw new HttpsError('failed-precondition', 'Registre uma entrada antes da saída.');
    }
    return;
  }
  throw new HttpsError('invalid-argument', 'Tipo de registro de ponto inválido.');
};

const buildPointWorkPeriodsFromEvents = (events = []) => {
  const periods = [];
  let openEvent = null;
  events.forEach((event) => {
    if (event.tipo === 'entrada' || event.tipo === 'almoco_fim') {
      openEvent = event;
      return;
    }
    if ((event.tipo === 'saida' || event.tipo === 'almoco_inicio') && openEvent) {
      const interval = toPointInterval(openEvent.hora, event.hora);
      if (interval) {
        periods.push({
          id: `${openEvent.id || openEvent.registradoEm}_${event.id || event.registradoEm}`,
          horaInicio: openEvent.hora,
          horaFim: event.hora,
          origem: openEvent.origem || 'funcionaria',
          entradaBatidaId: openEvent.id || '',
          saidaBatidaId: event.id || '',
          ativo: true,
        });
      }
      openEvent = null;
    }
  });
  return periods;
};

exports.registerEmployeePoint = onCall({timeoutSeconds: 60}, async (request) => {
  const uid = request.auth?.uid;
  const lojaId = String(request.data?.lojaId || '').trim();
  const type = String(request.data?.type || '').trim();
  const {profile} = await verifyPointStoreAccess(uid, lojaId);
  const employeeSchedule = sanitizeEmployeeWorkSchedule(profile.jornadaTrabalho || profile.escalaTrabalho || profile.workSchedule);
  const {now, dayKey, competenciaKey, timeLabel} = getSaoPauloPointNow();
  const pontosRef = db.collection('lojas').doc(lojaId).collection('pontos');
  const punchAuditRef = db.collection('lojas').doc(lojaId).collection('pontosAuditoria').doc();
  const fallbackRecordRef = pontosRef.doc(`${uid}_${dayKey}`);
  const timestamp = FieldValue.serverTimestamp();
  const actionMap = {
    entrada: 'entrada',
    almoco_inicio: 'início do almoço',
    almoco_fim: 'retorno do almoço',
    saida: 'saída',
  };
  const actionPayload = pointPayloadForType(type, timeLabel, request.data?.coords || null, request.data?.address || '');
  if (!actionPayload) {
    throw new HttpsError('invalid-argument', 'Tipo de registro de ponto inválido.');
  }

  let responseRecord = null;
  let responseRecordId = fallbackRecordRef.id;
  await db.runTransaction(async (transaction) => {
    const existingQuery = pontosRef
      .where('funcionarioId', '==', uid)
      .where('dia', '==', dayKey)
      .where('competencia', '==', competenciaKey);
    const querySnap = await transaction.get(existingQuery);
    const recordRef = querySnap.empty ? fallbackRecordRef : querySnap.docs[0].ref;
    const recordSnap = querySnap.empty ? await transaction.get(recordRef) : querySnap.docs[0];
    const existingData = recordSnap.exists ? recordSnap.data() || {} : {};
    if (isAdministrativePointRecord(existingData)) {
      throw new HttpsError('failed-precondition', 'Este dia possui um lançamento administrativo. Solicite o ajuste a um gestor autorizado.');
    }
    validatePointTransition(type, existingData, timeLabel);
    const legacyPayload = Object.entries(actionPayload).reduce((acc, [field, value]) => {
      if (existingData[field] === undefined || existingData[field] === null || existingData[field] === '') {
        acc[field] = value;
      }
      return acc;
    }, {});
    const previousEvents = getPointEvents(existingData).map((event, index) => ({
      ...event,
      id: event.id || `legado_${index}_${event.tipo}_${event.hora}`,
      origem: event.origem || 'funcionaria',
    }));
    const pointEvent = {
      id: `${now.getTime()}_${type}`,
      tipo: type,
      descricao: actionMap[type],
      hora: timeLabel,
      origem: 'funcionaria',
      funcionarioId: uid,
      registradoEm: now.toISOString(),
      localizacao: actionPayload.localizacaoEntrada || actionPayload.localizacaoSaida || null,
      endereco: actionPayload.localizacaoEntradaEndereco || actionPayload.localizacaoSaidaEndereco || '',
    };
    const nextEvents = [...previousEvents, pointEvent];
    const nextWorkPeriods = buildPointWorkPeriodsFromEvents(nextEvents);

    const baseData = {
      funcionarioId: uid,
      funcionarioNome: profile.nome || profile.name || profile.email || 'Colaborador',
      dia: dayKey,
      data: admin.firestore.Timestamp.fromDate(now),
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
      bancoHoras: '',
      bancoHorasMinutes: 0,
      horaExtra: '',
      horaExtraMinutes: 0,
      almocoNaoRegistradoBancoHoras: 0,
      justificativa: '',
      competencia: competenciaKey,
      empresaId: lojaId,
      jornadaTrabalho: employeeSchedule,
      historicoAlteracoes: [],
      createdAt: timestamp,
    };
    const mergedRecord = {
      ...(recordSnap.exists ? {} : baseData),
      ...existingData,
      jornadaTrabalho: existingData.jornadaTrabalho || employeeSchedule,
      ...legacyPayload,
      batidas: nextEvents,
      periodosTrabalho: nextWorkPeriods,
      updatedAt: timestamp,
    };
    const dailyRecords = querySnap.docs
      .map((document) => document.ref.path === recordRef.path ? mergedRecord : document.data())
      .concat(querySnap.empty ? [mergedRecord] : []);
    const calculationRecord = consolidatePointRecordsForCalculation(dailyRecords, mergedRecord);
    const statusPatch = pointStatusPatch(calculationRecord);
    const summary = calculatePointSummary(calculationRecord);
    const balanceDistribution = calculatePointBalanceDistribution(calculationRecord, summary);
    const updateData = {
      ...(recordSnap.exists ? {} : baseData),
      ...legacyPayload,
      batidas: nextEvents,
      periodosTrabalho: nextWorkPeriods,
      ...statusPatch,
      irregularidade: statusPatch.inconsistente ? 'Pendente de ajuste' : summary.irregularidade,
      qtde: statusPatch.inconsistente ? '' : summary.workedLabel,
      bancoHoras: statusPatch.inconsistente ? '' : balanceDistribution.bancoHoras,
      bancoHorasMinutes: statusPatch.inconsistente ? 0 : balanceDistribution.bancoHorasMinutes,
      horaExtra: statusPatch.inconsistente ? '' : balanceDistribution.horaExtra,
      horaExtraMinutes: statusPatch.inconsistente ? 0 : balanceDistribution.horaExtraMinutes,
      almocoNaoRegistradoBancoHoras: statusPatch.inconsistente ? 0 : balanceDistribution.almocoNaoRegistradoBancoHoras,
      jornadaTrabalho: mergedRecord.jornadaTrabalho,
      updatedAt: timestamp,
      historicoRegistros: FieldValue.arrayUnion(pointEvent),
    };
    transaction.set(recordRef, updateData, {merge: true});
    transaction.set(punchAuditRef, {
      tipo: 'batida_funcionaria',
      acao: 'criado',
      origem: 'funcionaria',
      pontoId: recordRef.id,
      lojaId,
      funcionarioId: uid,
      funcionarioNome: profile.nome || profile.name || profile.email || 'Colaborador',
      dia: dayKey,
      tipoBatida: type,
      horario: timeLabel,
      valorAnterior: previousEvents[previousEvents.length - 1] || null,
      valorNovo: pointEvent,
      justificativa: '',
      gestorId: '',
      gestor: '',
      criadoEm: timestamp,
      data: now.toISOString(),
    });
    responseRecordId = recordRef.id;
    responseRecord = {
      ...calculationRecord,
      ...statusPatch,
      irregularidade: updateData.irregularidade,
      qtde: updateData.qtde,
      bancoHoras: updateData.bancoHoras,
      bancoHorasMinutes: updateData.bancoHorasMinutes,
      horaExtra: updateData.horaExtra,
      horaExtraMinutes: updateData.horaExtraMinutes,
      almocoNaoRegistradoBancoHoras: updateData.almocoNaoRegistradoBancoHoras,
      id: recordRef.id,
    };
  });

  return {
    ok: true,
    recordId: responseRecordId,
    record: responseRecord,
    inconsistent: Boolean(responseRecord?.inconsistente),
    message: responseRecord?.inconsistente
      ? 'Saída registrada sem entrada correspondente. Este ponto necessita de análise ou ajuste.'
      : `Ponto de ${actionMap[type]} registrado com sucesso!`,
  };
});

// Exporta o app Express como uma Cloud Function HTTP
exports.api = onRequest({secrets: ["GOOGLE_MAPS_SERVER_API_KEY"]}, app);

// Cria uma nova loja e garante que os dados fiquem isolados por loja
exports.createStore = onCall(async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
        throw new HttpsError('unauthenticated', 'Você precisa estar autenticado.');
    }

    const requester = await verifyManagementAccess(uid);

    if (![ROLE_OWNER, ROLE_MANAGER].includes(requester.role)) {
        throw new HttpsError('permission-denied', 'Apenas donos ou gerentes podem criar novas lojas.');
    }

    const rawName = typeof request.data?.nome === 'string' ? request.data.nome.trim() : '';
    const rawId = typeof request.data?.storeId === 'string' ? request.data.storeId.trim() : '';

    if (!rawName) {
        throw new HttpsError('invalid-argument', 'Informe o nome da loja.');
    }

    const normalizedId = generateStoreId(rawId || rawName);

    if (!normalizedId || normalizedId === STORE_ALL_KEY) {
        throw new HttpsError('invalid-argument', 'Identificador inválido para a loja.');
    }

    const storeDocRef = db.collection('lojas').doc(normalizedId);
    const timestamp = FieldValue.serverTimestamp();

    await db.runTransaction(async (transaction) => {
        const existingDoc = await transaction.get(storeDocRef);

        if (existingDoc.exists) {
            throw new HttpsError('already-exists', 'Já existe uma loja com esse identificador.');
        }

        const storePayload = {
            nome: rawName,
            criadoEm: timestamp,
            criadoPor: uid,
        };

        transaction.set(storeDocRef, storePayload, {merge: true});

        transaction.set(storeDocRef.collection('info').doc(STORE_INFO_DOC_ID), {
            nome: rawName,
            criadoEm: timestamp,
            criadoPor: uid,
        }, {merge: true});

        transaction.set(storeDocRef.collection('meuEspaco').doc('empresa'), {
            nomeFantasia: rawName,
            documento: '',
            contato: { telefone: '', email: '' },
            endereco: {},
            atualizadoEm: timestamp,
            criadoPor: uid,
        }, {merge: true});

        transaction.set(storeDocRef.collection('meuEspaco').doc('ponto'), {
            nome: rawName,
            endereco: {},
            horarioFuncionamento: [],
            atualizadoEm: timestamp,
            criadoPor: uid,
        }, {merge: true});

        const configuracoesDoc = storeDocRef.collection('configuracoes').doc(CONFIG_DOC_ID);

        transaction.set(configuracoesDoc, {
            frete: {
                ativo: false,
                tipo: 'fixo',
                valor: 0,
                valorMinimo: 0,
                atualizadoEm: timestamp,
                criadoPor: uid,
            },
            iniciadoEm: timestamp,
            criadoPor: uid,
        }, {merge: true});
    });

    const profile = await getUserProfile(uid);
    let assignedStoreIds = null;
    let primaryStoreId = profile.lojaId || null;

    if (!requester.allStores) {
        const existingIds = extractStoreIds(profile);
        const updatedStoreIds = Array.from(new Set([...existingIds, normalizedId]));
        const userUpdate = {
            lojaIds: updatedStoreIds,
        };

        if (!profile.lojaId) {
            userUpdate.lojaId = normalizedId;
            primaryStoreId = normalizedId;
        }

        await db.collection('users').doc(uid).set(userUpdate, {merge: true});
        assignedStoreIds = updatedStoreIds;

        if (!primaryStoreId) {
            primaryStoreId = updatedStoreIds[0] || null;
        }
    }

    return {
        storeId: normalizedId,
        storeData: {
            nome: rawName,
        },
        assignedStoreIds,
        primaryStoreId,
        canAccessAllStores: requester.allStores,
    };
});

// --- FUNÇÕES CHAMÁVEIS (CALLABLE FUNCTIONS) PARA GERENCIAMENTO DE USUÁRIOS ---

// Lista todos os usuários
exports.listAllUsers = onCall(async (request) => {
    const requester = await verifyManagementAccess(request.auth?.uid);
    try {
        const listUsersResult = await auth.listUsers(1000);
        const usersFromAuth = listUsersResult.users;
        const usersFromFirestoreSnap = await db.collection("users").get();
        const usersDataFromFirestore = {};
        usersFromFirestoreSnap.forEach((doc) => {
            usersDataFromFirestore[doc.id] = doc.data();
        });
        const statusMetadataSnap = await db.collection('userStatusMetadata').get();
        const statusMetadata = {};
        statusMetadataSnap.forEach((doc) => {
            statusMetadata[doc.id] = doc.data();
        });

        const customProfilesSnap = await db.collection('customProfiles').get();
        const customProfiles = {};
        customProfilesSnap.forEach((doc) => {
            customProfiles[doc.id] = doc.data();
        });

        const combinedUsers = await Promise.all(usersFromAuth.map(async (userRecord) => {
            const firestoreData = usersDataFromFirestore[userRecord.uid] || {};
            const privateStatusData = statusMetadata[userRecord.uid] || {};
            const storedProfile = customProfiles[userRecord.uid];
            const role = firestoreData.role
                ? normalizeRole(firestoreData.role)
                : (storedProfile?.role ? normalizeRole(storedProfile.role) : ROLE_CLIENT);
            const lojaIds = extractStoreIds(firestoreData);
            const lojaId = lojaIds[0] || null;
            const ensuredProfile = storedProfile ? null : await ensureCustomProfile(userRecord.uid, role);
            const permissions = storedProfile
                ? sanitizePermissions(storedProfile.permissions, role)
                : ensuredProfile.permissions;
            const permissionDetails = storedProfile
                ? sanitizePermissionDetails(storedProfile.permissionDetails || firestoreData.permissionDetails, role, permissions)
                : ensuredProfile.permissionDetails;
            const active = isUserActive(firestoreData, userRecord);

            if (!storedProfile) {
                customProfiles[userRecord.uid] = {permissions, permissionDetails};
            }

            return {
                uid: userRecord.uid,
                email: userRecord.email,
                nome: firestoreData.nome || userRecord.displayName || "Sem nome",
                role,
                lojaId,
                lojaIds,
                permissions,
                permissionDetails,
                ativo: active,
                status: active ? USER_STATUS_ACTIVE : USER_STATUS_INACTIVE,
                authDisabled: userRecord.disabled === true,
                inativadoEm: firestoreData.inativadoEm || null,
                inativadoPor: firestoreData.inativadoPor || null,
                motivoInativacao: privateStatusData.motivoInativacao || '',
                reativadoEm: firestoreData.reativadoEm || null,
                reativadoPor: firestoreData.reativadoPor || null,
                jornadaTrabalho: sanitizeEmployeeWorkSchedule(firestoreData.jornadaTrabalho),
                dataInicioBancoHoras: normalizePointBankStartDate(
                  firestoreData.dataInicioBancoHoras ||
                  firestoreData.inicioBancoHoras ||
                  firestoreData.jornadaTrabalho?.dataInicioBancoHoras
                ),
            };
        }));

        const filteredUsers = combinedUsers.filter((userData) => {
            const targetStores = extractStoreIds(userData);
            if (requester.role === ROLE_OWNER) {
                if (requester.allStores || !requester.stores.length) {
                    return true;
                }
                return userHasAccessToStores(requester.stores, targetStores);
            }
            if (requester.role === ROLE_MANAGER) {
                return userHasAccessToStores(requester.stores, targetStores);
            }
            return false;
        });

        return {users: filteredUsers};
    } catch (error) {
        logger.error("Erro ao listar usuários:", error);
        throw new HttpsError("internal", "Não foi possível listar os usuários.");
    }
});

const assertCanChangeUserStatus = async ({
  requester,
  requesterUid,
  targetUid,
  targetProfile,
  activating,
}) => {
  const targetRole = normalizeRole(targetProfile.role);
  const targetStores = extractStoreIds(targetProfile);
  let activeOwnerCount = 0;
  if (!activating && targetRole === ROLE_OWNER && isUserActive(targetProfile)) {
    const usersSnapshot = await db.collection('users').get();
    activeOwnerCount = countActiveOwners(
        usersSnapshot.docs.map((document) => document.data() || {}),
        normalizeRole,
    );
  }
  const violation = getUserStatusPolicyViolation({
    requesterUid,
    requesterRole: requester.role,
    requesterStores: requester.stores,
    requesterAllStores: requester.allStores,
    requesterPermissionDetails: requester.permissionDetails,
    targetUid,
    targetRole,
    targetStores,
    targetActive: isUserActive(targetProfile),
    activeOwnerCount,
    activating,
  });
  const violations = {
    'self-management': {
      code: 'permission-denied',
      message: activating ?
        'Você não pode reativar sua própria conta por esta tela.' :
        'Você não pode inativar sua própria conta por esta tela.',
    },
    'manager-permission': {
      code: 'permission-denied',
      message: 'Você não possui permissão para gerenciar o status de usuários.',
    },
    'manager-owner': {
      code: 'permission-denied',
      message: 'Gerentes não podem alterar o status de um Dono.',
    },
    'store-scope': {
      code: 'permission-denied',
      message: 'Você não pode alterar usuários fora do seu escopo de lojas.',
    },
    'last-active-owner': {
      code: 'failed-precondition',
      message: 'Não é possível inativar este usuário porque ele é o último Dono ativo da empresa.',
    },
  };
  if (violation) {
    throw new HttpsError(
        violations[violation].code,
        violations[violation].message,
    );
  }
};

const getUserStatusAuditStoreIds = async (targetProfile) => {
  const targetStores = extractStoreIds(targetProfile);
  if (targetStores.length) return targetStores;
  const storesSnapshot = await db.collection('lojas').select().get();
  return storesSnapshot.docs.map((document) => document.id);
};

const persistUserStatusAndAudit = async ({
  targetUid,
  targetProfile,
  targetAuth,
  requesterUid,
  requester,
  activating,
  reason,
  tokensRevoked,
}) => {
  const timestamp = FieldValue.serverTimestamp();
  const previousStatus = isUserActive(targetProfile) ?
    USER_STATUS_ACTIVE :
    USER_STATUS_INACTIVE;
  const nextStatus = activating ? USER_STATUS_ACTIVE : USER_STATUS_INACTIVE;
  const targetStores = extractStoreIds(targetProfile);
  const actorProfile = requester.profile || {};
  const actorEmail = actorProfile.email || '';
  const commonAudit = {
    categoria: 'usuarios',
    tipo: activating ? 'reativacao_usuario' : 'inativacao_usuario',
    action: activating ? 'Usuário reativado' : 'Usuário inativado',
    usuarioAfetado: targetProfile.nome || targetAuth.displayName || targetAuth.email || targetUid,
    usuarioAfetadoUid: targetUid,
    usuarioAfetadoEmail: targetProfile.email || targetAuth.email || '',
    perfil: normalizeRole(targetProfile.role),
    lojaIds: targetStores,
    statusAnterior: previousStatus,
    novoStatus: nextStatus,
    motivo: activating ? '' : reason,
    realizadoPorUid: requesterUid,
    realizadoPor: actorProfile.nome || actorEmail || requesterUid,
    userEmail: actorEmail,
    timestamp,
    firebaseAuthentication: {
      disabled: !activating,
      tokensRevoked,
      resultado: 'sucesso',
    },
  };
  const details = activating ?
    `${commonAudit.usuarioAfetado} (${commonAudit.usuarioAfetadoEmail}) foi reativado com o mesmo perfil, lojas e permissões.` :
    `${commonAudit.usuarioAfetado} (${commonAudit.usuarioAfetadoEmail}) foi inativado. Motivo: ${reason}. Firebase Auth desabilitado e sessões revogadas.`;
  const statusPatch = activating ? {
    ativo: true,
    status: USER_STATUS_ACTIVE,
    reativadoEm: timestamp,
    reativadoPor: requesterUid,
    updatedAt: timestamp,
    firebaseAuthDisabled: false,
  } : {
    ativo: false,
    status: USER_STATUS_INACTIVE,
    inativadoEm: timestamp,
    inativadoPor: requesterUid,
    updatedAt: timestamp,
    firebaseAuthDisabled: true,
  };
  const auditStoreIds = await getUserStatusAuditStoreIds(targetProfile);
  const batch = db.batch();
  batch.set(db.collection('users').doc(targetUid), statusPatch, {merge: true});
  if (!activating) {
    batch.set(db.collection('userStatusMetadata').doc(targetUid), {
      motivoInativacao: reason,
      inativadoEm: timestamp,
      inativadoPor: requesterUid,
      updatedAt: timestamp,
    }, {merge: true});
  }
  batch.set(db.collection('auditLogs').doc(), {
    ...commonAudit,
    details,
  });
  auditStoreIds.forEach((storeId) => {
    const logRef = db.collection('lojas').doc(storeId)
        .collection('configuracoes').doc(CONFIG_DOC_ID)
        .collection('logs').doc();
    batch.set(logRef, {
      ...commonAudit,
      details,
      lojaId: storeId,
    });
  });
  await batch.commit();
  return {
    ...statusPatch,
    ativo: activating,
    status: nextStatus,
  };
};

const changeUserStatus = async (request, activating) => {
  const requesterUid = request.auth?.uid;
  const requester = await verifyManagementAccess(requesterUid);
  const targetUid = typeof request.data?.uid === 'string' ?
    request.data.uid.trim() :
    '';
  const reason = normalizeInactivationReason(request.data?.motivo);
  if (!targetUid) {
    throw new HttpsError('invalid-argument', 'UID do usuário é obrigatório.');
  }
  if (!activating && !reason) {
    throw new HttpsError(
        'invalid-argument',
        'O motivo da inativação é obrigatório.',
    );
  }

  const targetRef = db.collection('users').doc(targetUid);
  const targetSnapshot = await targetRef.get();
  if (!targetSnapshot.exists) {
    throw new HttpsError('not-found', 'Usuário não encontrado.');
  }
  const targetProfile = targetSnapshot.data() || {};
  const targetAuth = await auth.getUser(targetUid).catch((error) => {
    if (error?.code === 'auth/user-not-found') {
      throw new HttpsError(
          'failed-precondition',
          'O usuário não existe no Firebase Authentication.',
      );
    }
    throw error;
  });
  const internalActive = isUserActive(targetProfile);
  const authActive = targetAuth.disabled !== true;
  const alreadyInDesiredState = activating ?
    internalActive && authActive :
    !internalActive && !authActive;
  if (alreadyInDesiredState) {
    return {
      success: true,
      unchanged: true,
      uid: targetUid,
      ativo: activating,
      status: activating ? USER_STATUS_ACTIVE : USER_STATUS_INACTIVE,
      message: activating ?
        'O usuário já está ativo.' :
        'O usuário já está inativo.',
    };
  }

  await assertCanChangeUserStatus({
    requester,
    requesterUid,
    targetUid,
    targetProfile,
    activating,
  });

  let tokensRevoked = false;
  if (activating) {
    await auth.updateUser(targetUid, {disabled: false});
  } else {
    await auth.updateUser(targetUid, {disabled: true});
    await auth.revokeRefreshTokens(targetUid);
    tokensRevoked = true;
  }

  const persisted = await persistUserStatusAndAudit({
    targetUid,
    targetProfile,
    targetAuth,
    requesterUid,
    requester,
    activating,
    reason,
    tokensRevoked,
  });
  return {
    success: true,
    unchanged: false,
    uid: targetUid,
    ativo: persisted.ativo,
    status: persisted.status,
    authDisabled: !activating,
    tokensRevoked,
    message: activating ?
      'Usuário reativado com sucesso.' :
      'Usuário inativado com sucesso.',
  };
};

exports.inativarUsuario = onCall(async (request) => {
  try {
    return await changeUserStatus(request, false);
  } catch (error) {
    rethrowHttpsError(error);
    logger.error('Erro ao inativar usuário:', error);
    throw new HttpsError('internal', 'Não foi possível inativar o usuário.');
  }
});

exports.reativarUsuario = onCall(async (request) => {
  try {
    return await changeUserStatus(request, true);
  } catch (error) {
    rethrowHttpsError(error);
    logger.error('Erro ao reativar usuário:', error);
    throw new HttpsError('internal', 'Não foi possível reativar o usuário.');
  }
});

// Cria um novo usuário
exports.createUser = onCall(async (request) => {
    const requester = await verifyManagementAccess(request.auth?.uid);
    const {
        email,
        senha,
        nome,
        role,
        lojaId,
        lojaIds = [],
        permissions: requestedPermissions = null,
        permissionDetails: requestedPermissionDetails = null,
        jornadaTrabalho = null,
        dataInicioBancoHoras = "",
    } = request.data;
    try {
		if (!email || !senha || !nome) {
            throw new HttpsError("invalid-argument", "Email, senha e nome são obrigatórios.");
        }

        const normalizedRole = normalizeRole(role);

        if (normalizedRole === ROLE_OWNER && requester.role !== ROLE_OWNER) {
            throw new HttpsError("permission-denied", "Somente donos podem criar outros donos.");
        }

        let targetStores = [];
        if (normalizedRole === ROLE_OWNER) {
            targetStores = Array.isArray(lojaIds) ? lojaIds : [];
            if (requester.role === ROLE_OWNER && !requester.allStores && requester.stores.length) {
                if (!userHasAccessToStores(requester.stores, targetStores)) {
                    throw new HttpsError("permission-denied", "Você não pode atribuir lojas fora do seu escopo.");
                }
            }
        } else {
            const primaryStore = lojaId || (Array.isArray(lojaIds) && lojaIds.length ? lojaIds[0] : null);
            if (!primaryStore) {
                throw new HttpsError("invalid-argument", "lojaId é obrigatório para este tipo de usuário.");
            }
            targetStores = Array.isArray(lojaIds) && lojaIds.length ? lojaIds : [primaryStore];
            const requesterStores = requester.role === ROLE_OWNER && requester.allStores ? targetStores : requester.stores;
            if (!userHasAccessToStores(requesterStores, targetStores)) {
                throw new HttpsError("permission-denied", "Você não pode criar usuários para outras lojas.");
            }
        }
        assertManagerCannotGrantOwnerAccess(requester, normalizedRole, requestedPermissions, targetStores);
        await assertManagerCannotGrantUserStatusAccess(
            requester,
            null,
            requestedPermissionDetails,
        );
        const sanitizedWorkSchedule = sanitizeEmployeeWorkSchedule(jornadaTrabalho);
        const sanitizedBankStartDate = normalizePointBankStartDate(dataInicioBancoHoras);

        const userRecord = await auth.createUser({
            email,
            password: senha,
            displayName: nome,
        });
        const {permissions, permissionDetails} = await ensureCustomProfile(
            userRecord.uid,
            normalizedRole,
            requestedPermissions,
            requestedPermissionDetails,
        );

        await db.collection("users").doc(userRecord.uid).set({
            email,
            nome,
            role: normalizedRole,
            lojaId: targetStores[0] || null,
            lojaIds: targetStores,
            permissions,
            permissionDetails,
            ativo: true,
            status: USER_STATUS_ACTIVE,
            jornadaTrabalho: sanitizedWorkSchedule,
            dataInicioBancoHoras: sanitizedBankStartDate,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
        return {uid: userRecord.uid, message: "Usuário criado com sucesso!"};
    } catch (error) {
        rethrowHttpsError(error);
        logger.error("Erro ao criar usuário:", error);
        throw new HttpsError("internal", `Erro ao criar usuário: ${error.message}`);
    }
});

// Atualiza um usuário
exports.updateUser = onCall(async (request) => {

    const requester = await verifyManagementAccess(request.auth?.uid);
    const {
        uid,
        nome,
        role,
        email,
        lojaId,
        lojaIds = [],
        permissions: requestedPermissions = null,
        permissionDetails: requestedPermissionDetails = null,
        jornadaTrabalho = null,
        dataInicioBancoHoras = "",
    } = request.data;

    if (!uid || !nome || !role || !email) {
        throw new HttpsError("invalid-argument", "Dados incompletos. UID, nome, role e email são obrigatórios.");
    }

    assertNotManagingSelf(request.auth?.uid, uid);

    try {

		const normalizedRole = normalizeRole(role);
        if (normalizedRole === ROLE_OWNER && requester.role !== ROLE_OWNER) {
            throw new HttpsError("permission-denied", "Somente donos podem atualizar dados de um dono.");
        }

        const existingProfile = await getUserProfile(uid);
        const existingStores = extractStoreIds(existingProfile);
        const existingRole = normalizeRole(existingProfile.role);

        let targetStores = [];
        if (normalizedRole === ROLE_OWNER) {
            targetStores = Array.isArray(lojaIds) ? lojaIds : existingStores;
        } else {
            const primaryStore = lojaId || (Array.isArray(lojaIds) && lojaIds.length ? lojaIds[0] : existingStores[0]);
            if (!primaryStore) {
                throw new HttpsError("invalid-argument", "lojaId é obrigatório para este tipo de usuário.");
            }
            targetStores = Array.isArray(lojaIds) && lojaIds.length ? lojaIds : [primaryStore];
        }

        const requesterStores = requester.role === ROLE_OWNER && requester.allStores ? targetStores : requester.stores;
        const storesToCheck = targetStores.length ? targetStores : existingStores;

        if (requester.role === ROLE_MANAGER) {
            if (existingRole === ROLE_OWNER || normalizedRole === ROLE_OWNER) {
                throw new HttpsError("permission-denied", "Gerentes não podem atualizar dados de donos.");
            }
            if (!userHasAccessToStores(requesterStores, storesToCheck)) {
                throw new HttpsError("permission-denied", "Você não pode atualizar usuários de outra loja.");
            }
        } else if (requester.role === ROLE_OWNER && !requester.allStores && requester.stores.length) {
            if (!userHasAccessToStores(requester.stores, storesToCheck)) {
                throw new HttpsError("permission-denied", "Você não pode atualizar usuários de outra loja.");
            }
        }

        assertManagerCannotGrantOwnerAccess(requester, normalizedRole, requestedPermissions, targetStores);
        await assertManagerCannotGrantUserStatusAccess(
            requester,
            uid,
            requestedPermissionDetails,
        );
        const sanitizedWorkSchedule = sanitizeEmployeeWorkSchedule(jornadaTrabalho || existingProfile.jornadaTrabalho);
        const hasBankStartDatePayload = Object.prototype.hasOwnProperty.call(request.data || {}, "dataInicioBancoHoras");
        const sanitizedBankStartDate = hasBankStartDatePayload
          ? normalizePointBankStartDate(dataInicioBancoHoras)
          : normalizePointBankStartDate(existingProfile.dataInicioBancoHoras);

        const authUpdatePayload = {
            displayName: nome,
        };

        const currentUser = await auth.getUser(uid);
        if (currentUser.email !== email) {
            authUpdatePayload.email = email;
        }

        await auth.updateUser(uid, authUpdatePayload);

        const existingPermissions = await getUserPermissions(uid, existingRole);
        const {permissions, permissionDetails} = await ensureCustomProfile(
            uid,
            normalizedRole,
            requestedPermissions || existingPermissions,
            requestedPermissionDetails,
        );

        // **CORREÇÃO APLICADA AQUI**
        // Troca `update` por `set` com `merge: true` para evitar erros
        // caso o documento do usuário não exista no Firestore.
        await db.collection("users").doc(uid).set({
            nome: nome,
            role: normalizedRole,
            email: email,
            lojaId: targetStores[0] || null,
            lojaIds: targetStores,
            permissions,
            permissionDetails,
            jornadaTrabalho: sanitizedWorkSchedule,
            dataInicioBancoHoras: sanitizedBankStartDate,
        }, { merge: true });

        return { message: "Usuário atualizado com sucesso!" };
    } catch (error) {
        rethrowHttpsError(error);
        logger.error("Erro detalhado ao atualizar usuário:", {
            code: error.code,
            message: error.message,
            uid: uid,
        });
        
        const detailedMessage = `Não foi possível atualizar o usuário. Motivo: ${error.message || 'Erro interno no servidor.'}`;

        if (error.code === "auth/email-already-exists") {
            throw new HttpsError("already-exists", "O email fornecido já está em uso por outro usuário.");
        }
        
        throw new HttpsError("internal", detailedMessage, { originalCode: error.code });
    }
});

// Deleta um usuário
exports.deleteUser = onCall(async (request) => {
    const requester = await verifyManagementAccess(request.auth?.uid);
    const {uid} = request.data;
    assertNotManagingSelf(request.auth?.uid, uid);

    try {
		const targetProfile = await getUserProfile(uid);
        const targetStores = extractStoreIds(targetProfile);
        const targetRole = normalizeRole(targetProfile.role);

        if (targetRole === ROLE_OWNER && requester.role !== ROLE_OWNER) {
            throw new HttpsError("permission-denied", "Somente donos podem remover outros donos.");
        }

        const requesterStores = requester.role === ROLE_OWNER && requester.allStores ? targetStores : requester.stores;
        if (requester.role === ROLE_MANAGER && !userHasAccessToStores(requesterStores, targetStores)) {
            throw new HttpsError("permission-denied", "Você não pode remover usuários de outra loja.");
        }

        await auth.deleteUser(uid);
        await db.collection("users").doc(uid).delete();
        await db.collection('customProfiles').doc(uid).delete();
        return {message: "Usuário deletado com sucesso!"};
    } catch (error) {
        rethrowHttpsError(error);
        logger.error("Erro ao deletar usuário:", error);
        throw new HttpsError("internal", "Não foi possível deletar o usuário.");
    }
});

// Atualiza a senha de um usuário
exports.updateUserPassword = onCall(async (request) => {
    const requester = await verifyManagementAccess(request.auth?.uid);
    const {uid, newPassword} = request.data;
    assertNotManagingSelf(request.auth?.uid, uid);

    try {
		const targetProfile = await getUserProfile(uid);
        const targetRole = normalizeRole(targetProfile.role);
        if (targetRole === ROLE_OWNER && requester.role !== ROLE_OWNER) {
            throw new HttpsError("permission-denied", "Somente donos podem alterar a senha de outro dono.");
        }
        if (requester.role === ROLE_MANAGER) {
            const targetStores = extractStoreIds(targetProfile);
            if (!userHasAccessToStores(requester.stores, targetStores)) {
                throw new HttpsError("permission-denied", "Você não pode alterar usuários de outra loja.");
            }
        }
        await auth.updateUser(uid, {password: newPassword});
        return {message: "Senha alterada com sucesso!"};
    } catch (error) {
        rethrowHttpsError(error);
        logger.error("Erro ao alterar senha:", error);
        throw new HttpsError("internal", "Não foi possível alterar a senha.");
    }
});

const FINANCIAL_RECURRENCE_FIXED = 'fixa';
const FINANCIAL_RECURRENCE_VARIABLE = 'variavel';
const FINANCIAL_RECURRENCE_SINGLE = 'avulsa';

const getFinancialMonthKey = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: DEFAULT_STORE_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    return `${year}-${month}`;
};

const isValidFinancialMonth = (monthKey) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey || ''));

const shiftFinancialMonth = (monthKey, delta) => {
    const [year, month] = monthKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const getExpenseRecurrenceType = (expense = {}) => {
    const configuredType = String(expense.tipoRecorrencia || expense.recorrenciaTipo || '').toLowerCase();
    if ([FINANCIAL_RECURRENCE_FIXED, FINANCIAL_RECURRENCE_VARIABLE, FINANCIAL_RECURRENCE_SINGLE].includes(configuredType)) {
        return configuredType;
    }

    const normalizedCategory = String(expense.categoria || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    if (normalizedCategory === 'despesa fixa') return FINANCIAL_RECURRENCE_FIXED;
    if (normalizedCategory === 'despesa variavel') return FINANCIAL_RECURRENCE_VARIABLE;
    return FINANCIAL_RECURRENCE_SINGLE;
};

const getExpenseMonth = (expense = {}) => {
    if (isValidFinancialMonth(expense.competencia)) return expense.competencia;
    const dueDate = expense.dataVencimento;
    if (typeof dueDate === 'string' && isValidFinancialMonth(dueDate.slice(0, 7))) {
        return dueDate.slice(0, 7);
    }
    if (dueDate && typeof dueDate.toDate === 'function') {
        return getFinancialMonthKey(dueDate.toDate());
    }
    return '';
};

const rollFinancialDueDate = (dueDate, targetMonth) => {
    const originalDate = typeof dueDate === 'string' ? dueDate.match(/^\d{4}-\d{2}-(\d{2})/) : null;
    const requestedDay = originalDate ? Number(originalDate[1]) : 1;
    const [year, month] = targetMonth.split('-').map(Number);
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${targetMonth}-${String(Math.min(requestedDay, maxDay)).padStart(2, '0')}`;
};

const prepareRecurringExpensesForStores = async (storeIds, sourceMonth) => {
    const targetMonth = shiftFinancialMonth(sourceMonth, 1);
    let createdCount = 0;
    let ignoredCount = 0;
    let batch = db.batch();
    let batchSize = 0;

    const commitBatch = async () => {
        if (!batchSize) return;
        await batch.commit();
        batch = db.batch();
        batchSize = 0;
    };

    for (const storeId of storeIds) {
        const expensesCollection = db.collection('lojas').doc(storeId).collection('contas_a_pagar');
        const snapshot = await expensesCollection.get();

        for (const expenseDoc of snapshot.docs) {
            const expense = expenseDoc.data() || {};
            const recurrenceType = getExpenseRecurrenceType(expense);

            if (recurrenceType === FINANCIAL_RECURRENCE_SINGLE || getExpenseMonth(expense) !== sourceMonth) {
                continue;
            }

            const seriesId = String(expense.serieRecorrenciaId || expenseDoc.id);
            const targetId = `${seriesId}__${targetMonth}`;
            const targetRef = expensesCollection.doc(targetId);
            const existingTarget = await targetRef.get();
            if (existingTarget.exists) {
                ignoredCount += 1;
                continue;
            }

            const targetExpense = {
                ...expense,
                valor: recurrenceType === FINANCIAL_RECURRENCE_VARIABLE ? 0 : Number(expense.valor || 0),
                dataVencimento: rollFinancialDueDate(expense.dataVencimento, targetMonth),
                competencia: targetMonth,
                status: 'Pendente',
                tipoRecorrencia: recurrenceType,
                recorrente: true,
                aguardandoFatura: recurrenceType === FINANCIAL_RECURRENCE_VARIABLE,
                serieRecorrenciaId: seriesId,
                geradoPorRecorrencia: true,
                recorrenciaOrigemId: expenseDoc.id,
                recorrenciaOrigemCompetencia: sourceMonth,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            };

            delete targetExpense.dataPagamento;
            delete targetExpense.pagoEm;
            delete targetExpense.baixadoEm;

            batch.set(targetRef, targetExpense);
            batchSize += 1;
            createdCount += 1;

            if (batchSize >= 400) {
                await commitBatch();
            }
        }
    }

    await commitBatch();
    return {sourceMonth, targetMonth, createdCount, ignoredCount};
};

exports.prepareNextFinancialMonth = onCall(async (request) => {
    const requester = await verifyManagementAccess(request.auth?.uid);
    const requestedStores = Array.isArray(request.data?.storeIds)
        ? Array.from(new Set(request.data.storeIds.filter((storeId) => typeof storeId === 'string' && storeId)))
        : [];
    const sourceMonth = isValidFinancialMonth(request.data?.sourceMonth)
        ? request.data.sourceMonth
        : getFinancialMonthKey();

    let allowedStores = requester.stores;
    if (requester.role === ROLE_OWNER && requester.allStores) {
        if (requestedStores.length) {
            allowedStores = requestedStores;
        } else {
            const storesSnapshot = await db.collection('lojas').get();
            allowedStores = storesSnapshot.docs.map((storeDoc) => storeDoc.id);
        }
    } else if (requestedStores.length) {
        if (!userHasAccessToStores(requester.stores, requestedStores)) {
            throw new HttpsError('permission-denied', 'Você não pode preparar contas de outra loja.');
        }
        allowedStores = requestedStores;
    }

    if (!allowedStores.length) {
        throw new HttpsError('failed-precondition', 'Nenhuma loja disponível para preparar o mês seguinte.');
    }

    return prepareRecurringExpensesForStores(allowedStores, sourceMonth);
});

exports.rollFinancialRecurringExpenses = onSchedule({
    schedule: '15 3 * * *',
    timeZone: DEFAULT_STORE_TIMEZONE,
    region: 'southamerica-east1',
}, async () => {
    const sourceMonth = getFinancialMonthKey();
    const storesSnapshot = await db.collection('lojas').get();
    const storeIds = storesSnapshot.docs.map((storeDoc) => storeDoc.id);
    const result = await prepareRecurringExpensesForStores(storeIds, sourceMonth);
    logger.info('Virada automatica do financeiro concluida.', result);
});

const getTransferFinancialMonth = (transfer = {}) => {
    const paymentDate = transfer.dataPagamento || transfer.dataPagamentoConfirmado;
    if (typeof paymentDate === 'string' && /^\d{4}-\d{2}/.test(paymentDate)) {
        return paymentDate.slice(0, 7);
    }
    if (paymentDate && typeof paymentDate.toDate === 'function') {
        return getFinancialMonthKey(paymentDate.toDate());
    }
    return getFinancialMonthKey();
};

const getFinancialDateComparableValue = (value) => {
    if (value && typeof value.toMillis === 'function') {
        return value.toMillis();
    }
    return value || null;
};

const transferFinancialDataChanged = (before = {}, after = {}) => (
    before.status !== after.status
    || before.totalRepasse !== after.totalRepasse
    || before.lojaOrigemId !== after.lojaOrigemId
    || before.lojaOrigemNome !== after.lojaOrigemNome
    || before.lojaDestinoId !== after.lojaDestinoId
    || before.lojaDestinoNome !== after.lojaDestinoNome
    || before.dataPagamento !== after.dataPagamento
    || getFinancialDateComparableValue(before.dataPagamentoConfirmado)
        !== getFinancialDateComparableValue(after.dataPagamentoConfirmado)
);

const TRANSFER_FINANCIAL_MODEL = 'origem_entrada_destino_despesa_v2';

const syncConfirmedTransferFinancialRecords = async ({
    transferId,
    transferRef,
    transfer,
    previousTransfer = {},
    syncSource = 'trigger',
}) => {
    const destinationStoreId = String(transfer.lojaDestinoId || '').trim();
    const originStoreId = String(transfer.lojaOrigemId || '').trim();
    const originName = String(
        transfer.lojaOrigemNome || originStoreId || 'Loja de origem'
    ).trim();
    const destinationName = String(
        transfer.lojaDestinoNome || destinationStoreId || 'Loja de destino'
    ).trim();
    const amount = Number(transfer.totalRepasse);

    if (!originStoreId || !destinationStoreId || !transferId || !Number.isFinite(amount) || amount < 0) {
        logger.warn('Repasse confirmado sem dados válidos para gerar lançamentos financeiros.', {
            transferId,
            originStoreId,
            destinationStoreId,
            amount,
        });
        return false;
    }

    const entryId = `repasse_entre_lojas_${transferId}`;
    const expenseId = `repasse_entre_lojas_${transferId}`;
    const previousOriginStoreId = String(previousTransfer.lojaOrigemId || '').trim();
    const previousDestinationStoreId = String(previousTransfer.lojaDestinoId || '').trim();
    const entryRef = db.collection('lojas')
        .doc(originStoreId)
        .collection('contas_a_receber')
        .doc(entryId);
    const expenseRef = db.collection('lojas')
        .doc(destinationStoreId)
        .collection('contas_a_pagar')
        .doc(expenseId);
    const previousEntryRef = (
        previousTransfer.status === 'pagamento_confirmado'
        && previousOriginStoreId
        && previousOriginStoreId !== originStoreId
    )
        ? db.collection('lojas')
            .doc(previousOriginStoreId)
            .collection('contas_a_receber')
            .doc(entryId)
        : null;
    const previousExpenseRef = (
        previousTransfer.status === 'pagamento_confirmado'
        && previousDestinationStoreId
        && previousDestinationStoreId !== destinationStoreId
    )
        ? db.collection('lojas')
            .doc(previousDestinationStoreId)
            .collection('contas_a_pagar')
            .doc(expenseId)
        : null;
    const legacyEntryRef = db.collection('lojas')
        .doc(destinationStoreId)
        .collection('contas_a_receber')
        .doc(entryId);
    const legacyExpenseRef = db.collection('lojas')
        .doc(originStoreId)
        .collection('contas_a_pagar')
        .doc(expenseId);
    const previousLegacyEntryRef = previousTransfer.status === 'pagamento_confirmado' && previousDestinationStoreId
        ? db.collection('lojas')
            .doc(previousDestinationStoreId)
            .collection('contas_a_receber')
            .doc(entryId)
        : null;
    const previousLegacyExpenseRef = previousTransfer.status === 'pagamento_confirmado' && previousOriginStoreId
        ? db.collection('lojas')
            .doc(previousOriginStoreId)
            .collection('contas_a_pagar')
            .doc(expenseId)
        : null;
    const operationDate = (
        transfer.dataPagamento
        || transfer.dataPagamentoConfirmado
        || admin.firestore.Timestamp.now()
    );
    const competence = getTransferFinancialMonth(transfer);
    const now = FieldValue.serverTimestamp();
    const isNewEntry = (
        previousTransfer.status !== 'pagamento_confirmado'
        || previousOriginStoreId !== originStoreId
        || transfer.financeiroModelo !== TRANSFER_FINANCIAL_MODEL
        || !previousTransfer.financeiroContaReceberId
    );
    const isNewExpense = (
        previousTransfer.status !== 'pagamento_confirmado'
        || previousDestinationStoreId !== destinationStoreId
        || transfer.financeiroModelo !== TRANSFER_FINANCIAL_MODEL
        || !previousTransfer.financeiroContaPagarId
    );
    const entryData = {
        tipo: 'entrada',
        descricao: `Repasse automático - ${destinationName}`,
        valor: amount,
        dataRecebimento: operationDate,
        competencia: competence,
        categoria: 'Repasse Interno',
        fonte: 'Entre Lojas',
        canal: 'Entre Lojas',
        metodo: 'Repasse Interno',
        status: 'Recebido',
        centroCusto: originStoreId,
        lojaId: originStoreId,
        origemAutomatica: 'entre_lojas',
        transferenciaEntreLojasId: transferId,
        transferenciaEntreLojasRef: transferRef,
        lojaOrigemId: originStoreId,
        lojaOrigemNome: originName,
        lojaDestinoId: destinationStoreId,
        lojaDestinoNome: destinationName,
        updatedAt: now,
        ...(isNewEntry ? {createdAt: now} : {}),
    };
    const expenseData = {
        tipo: 'saida',
        descricao: `Compra/Repasse interno para - ${originName}`,
        valor: amount,
        dataVencimento: operationDate,
        dataPagamento: operationDate,
        competencia: competence,
        categoria: 'Repasse Entre Lojas',
        fonte: 'Transferência Interna',
        canal: 'Entre Lojas',
        status: 'Pago',
        centroCusto: destinationStoreId,
        lojaId: destinationStoreId,
        origemAutomatica: 'entre_lojas',
        transferenciaEntreLojasId: transferId,
        transferenciaEntreLojasRef: transferRef,
        lojaOrigemId: originStoreId,
        lojaOrigemNome: originName,
        lojaDestinoId: destinationStoreId,
        lojaDestinoNome: destinationName,
        updatedAt: now,
        ...(isNewExpense ? {createdAt: now} : {}),
    };

    const batch = db.batch();
    const currentPaths = new Set([entryRef.path, expenseRef.path]);
    const obsoleteRefs = new Map();
    [previousEntryRef, previousExpenseRef, legacyEntryRef, legacyExpenseRef, previousLegacyEntryRef, previousLegacyExpenseRef]
        .filter((ref) => ref && !currentPaths.has(ref.path))
        .forEach((ref) => obsoleteRefs.set(ref.path, ref));
    obsoleteRefs.forEach((ref) => batch.delete(ref));
    batch.set(entryRef, entryData, {merge: true});
    batch.set(expenseRef, expenseData, {merge: true});
    batch.set(transferRef, {
        financeiroIntegrado: true,
        financeiroModelo: TRANSFER_FINANCIAL_MODEL,
        financeiroContaReceberId: entryId,
        financeiroContaPagarId: expenseId,
        financeiroContaReceberLojaId: originStoreId,
        financeiroContaPagarLojaId: destinationStoreId,
        financeiroIntegradoEm: now,
    }, {merge: true});
    await batch.commit();

    logger.info('Entrada e saída financeiras sincronizadas a partir de repasse confirmado.', {
        syncSource,
        transferId,
        originStoreId,
        destinationStoreId,
        entryId,
        expenseId,
        amount,
    });
    return true;
};

exports.syncConfirmedTransferToFinancialEntry = onDocumentUpdated({
    document: 'transferenciasEntreLojas/{transferId}',
    region: 'southamerica-east1',
}, async (event) => {
    const previousTransfer = event.data?.before.data() || {};
    const transfer = event.data?.after.data() || {};

    if (
        transfer.status !== 'pagamento_confirmado'
        || !transferFinancialDataChanged(previousTransfer, transfer)
    ) {
        return;
    }

    await syncConfirmedTransferFinancialRecords({
        transferId: String(event.params.transferId || ''),
        transferRef: event.data.after.ref,
        transfer,
        previousTransfer,
    });
});

exports.reconcileConfirmedTransferFinancialRecords = onSchedule({
    schedule: 'every 15 minutes',
    timeZone: DEFAULT_STORE_TIMEZONE,
    region: 'southamerica-east1',
}, async () => {
    const transfersSnapshot = await db.collection('transferenciasEntreLojas')
        .where('status', '==', 'pagamento_confirmado')
        .get();
    let synchronizedCount = 0;

    for (const transferDoc of transfersSnapshot.docs) {
        const transfer = transferDoc.data();
        const originStoreId = String(transfer.lojaOrigemId || '').trim();
        const destinationStoreId = String(transfer.lojaDestinoId || '').trim();
        const isCurrentModel = (
            transfer.financeiroModelo === TRANSFER_FINANCIAL_MODEL
            && transfer.financeiroContaReceberLojaId === originStoreId
            && transfer.financeiroContaPagarLojaId === destinationStoreId
        );

        if (isCurrentModel) {
            continue;
        }

        const synchronized = await syncConfirmedTransferFinancialRecords({
            transferId: transferDoc.id,
            transferRef: transferDoc.ref,
            transfer,
            previousTransfer: transfer,
            syncSource: 'scheduled-reconciliation',
        });
        if (synchronized) {
            synchronizedCount += 1;
        }
    }

    logger.info('Reconciliação de repasses financeiros concluída.', {
        confirmedTransferCount: transfersSnapshot.size,
        synchronizedCount,
        financialModel: TRANSFER_FINANCIAL_MODEL,
    });
});


exports.notifyNewOrder = onDocumentWritten({
    document: "lojas/{lojaId}/pedidos/{pedidoId}",
    region: "southamerica-east1",
}, async (event) => {
    let orderData = event.data?.after?.data();
    const previousOrder = event.data?.before?.data();
    if (orderData?.paymentId && orderData.payment_status === 'PAID') {
      await checkoutPayments.syncOrderStatus(event.data.after.ref.path);
      orderData = (await event.data.after.ref.get()).data();
    }
    if (!shouldNotifyOrder(previousOrder, orderData)) return;

    if (!orderData) {
        logger.warn(
            "Novo pedido criado sem dados. Notificação não enviada.",
        );
        return;
    }

    let notificationAttemptRef;
    try {
        const orderId = String(
            event.params?.pedidoId || "",
        );

        const lojaId = String(
            event.params?.lojaId ||
            orderData.lojaId ||
            "",
        );

        const status = orderData.status ?
            String(orderData.status) :
            "Pendente";

        const customerName =
            orderData.clienteNome ||
            orderData.nomeCliente ||
            orderData.nome ||
            orderData.cliente?.nome ||
            "";

        const orderCode =
            orderData.numeroPedido ||
            orderData.codigo ||
            orderData.numero ||
            "";

        const title =
            "Novo pedido recebido";

        let body = customerName ?
            `Pedido de ${customerName}` :
            "Um novo pedido foi recebido.";

        if (orderCode) {
            body =
                `${body} (#${orderCode})`;
        }

        /*
         * Busca os dispositivos cadastrados.
         */
        const tokensSnapshot =
            await db
                .collection("notificationTokens")
                .get();

        if (tokensSnapshot.empty) {
            logger.info(
                "Nenhum token de notificação cadastrado.",
            );
            return;
        }

        /*
         * Mantemos token + informações do dispositivo
         * para conseguirmos separar Android nativo,
         * web e dispositivos antigos.
         */
        const tokenEntries =
            tokensSnapshot.docs.map((doc) => ({
                token: doc.id,
                data: doc.data() || {},
            }));

        /*
         * Filtra os tokens que possuem acesso
         * à loja deste pedido.
         *
         * Tokens antigos que não possuem informação
         * de loja continuam sendo aceitos para não
         * quebrar o CRM/web existente.
         */
        const storeTokenEntries =
            tokenEntries.filter((entry) => {
                const tokenData =
                    entry.data || {};

                const directStoreId =
                    String(
                        tokenData.storeId ||
                        tokenData.lojaId ||
                        "",
                    ).trim();

                const rawStoreIds =
                    tokenData.storeIds ||
                    tokenData.lojaIds ||
                    [];

                const storeIds =
                    Array.isArray(rawStoreIds) ?
                        rawStoreIds
                            .map((value) =>
                                String(value || "").trim(),
                            )
                            .filter(Boolean) :
                        [];

                const allStores =
                    tokenData.allStores === true;

                const hasStoreScope =
                    allStores ||
                    directStoreId.length > 0 ||
                    storeIds.length > 0;

                /*
                 * Token legado.
                 * Mantém o comportamento atual.
                 */
                if (!hasStoreScope) {
                    return true;
                }

                return (
                    allStores ||
                    directStoreId === lojaId ||
                    storeIds.includes(lojaId)
                );
            });

        if (storeTokenEntries.length === 0) {
            logger.info(
                `Nenhum dispositivo cadastrado para a loja ${lojaId}.`,
            );
            return;
        }

        if (orderData.paymentId) {
            const claimed = await claimOnlineOrderNotification({
                db, admin, orderRef: event.data.after.ref,
                paymentId: orderData.paymentId,
            });
            if (!claimed) return;
            notificationAttemptRef = db.collection('checkoutNotificationAttempts').doc(orderData.paymentId);
        }

        /*
         * O novo aplicativo Android grava:
         *
         * platform: "android"
         *
         * Esses aparelhos receberão DATA-ONLY
         * para que o FirebaseMessagingService
         * execute mesmo com o app em segundo plano.
         */
        const androidTokens =
            storeTokenEntries
                .filter((entry) =>
                    String(
                        entry.data?.platform || "",
                    ).toLowerCase() === "android",
                )
                .map((entry) => entry.token);

        /*
         * Tokens web e tokens antigos continuam
         * usando o formato já existente.
         */
        const legacyTokens =
            storeTokenEntries
                .filter((entry) =>
                    String(
                        entry.data?.platform || "",
                    ).toLowerCase() !== "android",
                )
                .map((entry) => entry.token);

        const dataPayload = {
            title,
            body,
            orderId,
            lojaId,
            status,
            url: "/",
            source: "new-order",
            playAlarm: "true",
        };

        const tokensToDelete =
            new Set();

        const collectInvalidTokens = (
            response,
            sentTokens,
        ) => {
            response.responses.forEach(
                (result, index) => {
                    if (result.success) {
                        return;
                    }

                    const errorCode =
                        result.error?.code;

                    logger.error(
                        "Falha ao enviar notificação push:",
                        result.error,
                    );

                    if (
                        errorCode ===
                            "messaging/registration-token-not-registered" ||
                        errorCode ===
                            "messaging/invalid-registration-token"
                    ) {
                        tokensToDelete.add(
                            sentTokens[index],
                        );
                    }
                },
            );
        };

        /*
         * NOVO ANDROID NATIVO
         *
         * Não usamos "notification" aqui.
         *
         * Dessa forma o payload chega no
         * NewOrderMessagingService.onMessageReceived(),
         * que cria a notificação usando o canal
         * sonoro "new_orders".
         */
        if (androidTokens.length > 0) {
            const androidMessage = {
                tokens: androidTokens,

                data: dataPayload,

                android: {
                    priority: "high",
                },
            };

            const androidResponse =
                await admin
                    .messaging()
                    .sendEachForMulticast(
                        androidMessage,
                    );

            collectInvalidTokens(
                androidResponse,
                androidTokens,
            );

            logger.info(
                `Push Android enviado. Sucesso: ` +
                `${androidResponse.successCount}. Falhas: ` +
                `${androidResponse.failureCount}.`,
            );
        }

        /*
         * CRM WEB / DISPOSITIVOS LEGADOS
         *
         * Mantém o formato que já estava
         * sendo utilizado no sistema atual.
         */
        if (legacyTokens.length > 0) {
            const legacyMessage = {
                tokens: legacyTokens,

                notification: {
                    title,
                    body,
                },

                data: dataPayload,

                android: {
                    priority: "high",

                    notification: {
                        title,
                        body,
                        channelId: "new-orders",
                        sound: "default",
                        clickAction:
                            "FLUTTER_NOTIFICATION_CLICK",
                    },
                },

                apns: {
                    payload: {
                        aps: {
                            alert: {
                                title,
                                body,
                            },

                            sound: "default",

                            category:
                                "NEW_ORDER",
                        },
                    },
                },

                webpush: {
                    headers: {
                        Urgency: "high",
                    },

                    notification: {
                        title,
                        body,

                        icon:
                            "/logo192.png",

                        badge:
                            "/logo192.png",

                        tag:
                            "new-order",

                        renotify:
                            true,

                        vibrate: [
                            200,
                            100,
                            200,
                        ],

                        data: {
                            orderId,
                            lojaId,
                            url: "/",
                        },
                    },

                    fcmOptions: {
                        link: "/",
                    },
                },
            };

            const legacyResponse =
                await admin
                    .messaging()
                    .sendEachForMulticast(
                        legacyMessage,
                    );

            collectInvalidTokens(
                legacyResponse,
                legacyTokens,
            );

            logger.info(
                `Push legado enviado. Sucesso: ` +
                `${legacyResponse.successCount}. Falhas: ` +
                `${legacyResponse.failureCount}.`,
            );
        }

        /*
         * Remove tokens que o Firebase informou
         * que não são mais válidos.
         */
        if (tokensToDelete.size > 0) {
            await Promise.all(
                Array.from(tokensToDelete)
                    .map((token) =>
                        db
                            .collection(
                                "notificationTokens",
                            )
                            .doc(token)
                            .delete()
                            .catch((error) => {
                                logger.error(
                                    "Erro ao remover token inválido:",
                                    error,
                                );
                            }),
                    ),
            );
        }

        logger.info(
            `Processamento do pedido ${orderId} concluído. ` +
            `Loja: ${lojaId}. ` +
            `Android: ${androidTokens.length}. ` +
            `Legados: ${legacyTokens.length}.`,
        );
        if (notificationAttemptRef) await notificationAttemptRef.update({
            state: 'SENT', completedAt: FieldValue.serverTimestamp(),
        });
    } catch (error) {
        if (notificationAttemptRef) await notificationAttemptRef.update({
            state: 'REVIEW', completedAt: FieldValue.serverTimestamp(),
        }).catch((updateError) => logger.error('Falha ao registrar resultado do push:', updateError));
        logger.error(
            "Erro ao enviar notificações de novo pedido:",
            error,
        );
    }
});

Object.assign(exports, createCaixaFunctions({
    admin,
    db,
    onCall: onActiveUserCall,
    onDocumentWritten,
    HttpsError,
    logger,
}));

Object.assign(exports, createEntreLojasFunctions({
    admin,
    db,
    onCall: onActiveUserCall,
    HttpsError,
    logger,
}));

Object.assign(exports, createFiscalFunctions({
    admin,
    db,
    onCall: onActiveUserCall,
    HttpsError,
    logger,
    verifyManagementAccess,
    verifyStoreReadAccess,
    userHasAccessToStores,
    STORE_ALL_KEY,
}));
