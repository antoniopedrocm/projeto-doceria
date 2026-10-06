const { sanitizeEmployeeWorkSchedule, getPointScheduleDayInfo, isHourlyWorkSchedule,
  buildPointScheduleUpdate, getHourlyPointSummary, getHourlyPointBalance, hasIncompletePointLunch, hasIncompletePointPeriodLunch, isPointJourneyPending } = require('./point-schedule-core');
/**
 * Import function triggers from their respective sub-packages:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated, onDocumentWritten} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const crypto = require('crypto');
const {buildCheckoutWhatsApp} = require('./whatsapp-checkout');
const {quoteFreight, totalWithFreight} = require('./freight-core');
const {createWhatsAppWorkerFunctions} = require('./whatsapp-worker');
const {createWhatsAppWebhook} = require('./whatsapp-webhook');
const {createWhatsAppAdminFunctions} = require('./whatsapp-admin');
const {createFiscalFunctions} = require('./fiscal');
const {createIfoodFunctions} = require('./ifood');
const {createFood99Functions} = require('./food99');
const {createCaixaFunctions} = require('./caixa');
const {createEntreLojasFunctions} = require('./entre-lojas');
const {createEntreLojasReportFunctions} = require('./entre-lojas-report');
const {createProductionShowcaseFunctions} = require('./producao-vitrine');
const {
  createCustomerPurchaseMetricsFunctions,
} = require('./customer-purchase-metrics');
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
const {
  buildNewOrderData,
  isNewPendingOrder,
  profileCanReceiveOrder,
  shouldInterruptAlarmPause,
} = require('./new-order-notifications');

// Inicializa o Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
Object.assign(exports, createWhatsAppWorkerFunctions({db, onDocumentCreated, onSchedule, logger}));
Object.assign(exports, createWhatsAppAdminFunctions({db, onCall, HttpsError}));
exports.whatsappWebhook = onRequest({region: 'southamerica-east1', timeoutSeconds: 60, maxInstances: 2},
    createWhatsAppWebhook({db, logger}));
const auth = admin.auth();
const STORE_INFO_DOC_ID = 'dados';
const CONFIG_DOC_ID = 'config';
const ROLE_OWNER = 'dono';
const STORE_ALL_KEY = '__all__';
const ROLE_MANAGER = 'gerente';
const ROLE_ATTENDANT = 'atendente';
const ROLE_ACCOUNTANT = 'contador';
const ROLE_CLIENT = 'cliente';
const CASH_POST_CLOSING_PERMISSION = 'ajustarCaixaAposEncerramento';
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
  'food99',
  'configuracoes',
];
const ACCOUNTANT_RESTRICTED_MODULES = new Set(['ifood', 'food99', 'configuracoes']);
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
  const value = role.toLowerCase().trim();
  if ([ROLE_OWNER, ROLE_MANAGER, ROLE_ATTENDANT, ROLE_ACCOUNTANT, ROLE_CLIENT].includes(value)) {
    return value;
  }
  if (value === 'client') return ROLE_CLIENT;
  if (value === 'accountant') return ROLE_ACCOUNTANT;
  if (['admin', 'adm', 'administrador', 'administradora', 'administrador master', 'administradora master', 'admin master', 'admin_master', 'master', 'superadmin'].includes(value)) {
    return ROLE_OWNER;
  }
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
      ifood: true,
      food99: true,
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
      manageTransferDestinations: normalizedRole === ROLE_OWNER,
    },
    caixa: permissions?.fornecedores ?
      defaultCashPermissions(role) :
      defaultCashPermissions(ROLE_ACCOUNTANT),
    configuracoes: {
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
    'entre-lojas': {
      statuses,
      manageTransferDestinations: normalizedRole === ROLE_OWNER || (
        normalizedRole === ROLE_MANAGER &&
        entreLojasDetails?.manageTransferDestinations === true
      ),
    },
    caixa: permissions?.fornecedores ?
      sanitizeCashPermissions(caixaDetails, role) :
      defaultCashPermissions(ROLE_ACCOUNTANT),
    configuracoes: {
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
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
    return {role, stores, allStores: stores.length === 0, permissions};
  }

  if ([ROLE_MANAGER, ROLE_ACCOUNTANT].includes(role)) {
    if (!stores.length) {
      throw new HttpsError('permission-denied', 'Este usuário precisa estar associado a pelo menos uma loja.');
    }
    return {role, stores, allStores: false, permissions};
  }

  throw new HttpsError('permission-denied', 'Você não tem permissão para consultar esta operação.');
};

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

const verifyCustomerMetricsStoreAccess = async (uid, lojaId) => {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Você precisa estar autenticado.');
  }
  const profile = await getUserProfile(uid);
  if (!Object.keys(profile).length) {
    throw new HttpsError('permission-denied', 'Perfil de usuário não encontrado.');
  }
  const role = normalizeRole(profile.role);
  const stores = extractStoreIds(profile);
  if (role === ROLE_OWNER && stores.length === 0) return;
  if (
    [ROLE_OWNER, ROLE_MANAGER, ROLE_ATTENDANT, ROLE_ACCOUNTANT].includes(role) &&
    stores.includes(lojaId)
  ) {
    return;
  }
  throw new HttpsError(
      'permission-denied',
      'Você não tem permissão para sincronizar clientes desta loja.',
  );
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
        if (isHourlyWorkSchedule(getPointScheduleDayInfo(record.jornadaTrabalho, getPointRecordDate(record)).schedule) && hasIncompletePointLunch(period)) return [];
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
  if (isHourlyWorkSchedule(scheduleDay.schedule)) return { expectedMinutes: 0, hasDate: Boolean(date), isWorkday: false, isWeeklyDayOff: false };
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
  if (isVacationPointRecord(record)) {
    return {workedLabel: '', irregularidade: '', workedMinutes: null, irregularityMinutes: null, calculable: false};
  }
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
  if (isHourlyWorkSchedule(getPointScheduleDayInfo(record.jornadaTrabalho, getPointRecordDate(record)).schedule)) {
    return getHourlyPointSummary(workedMinutes, pointInconsistencies(record).length > 0 || hasIncompletePointPeriodLunch(record));
  }
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
  if (isHourlyWorkSchedule(getPointScheduleDayInfo(record.jornadaTrabalho, getPointRecordDate(record)).schedule)) return getHourlyPointBalance();
  const summary = summaryInput || calculatePointSummary(record);
  const irregularityMinutes = summary?.calculable && Number.isFinite(summary?.irregularityMinutes) ?
    summary.irregularityMinutes :
    null;
  let bancoHorasMinutes = 0;
  let horaExtraMinutes = 0;

  if (isVacationPointRecord(record) || isExcusedAbsenceRecord(record)) {
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
  if (isVacationPointRecord(record)) {
    return {
      inconsistente: false,
      necessitaAjuste: false,
      statusPonto: 'Férias',
      inconsistencias: [],
    };
  }
  if (isExcusedAbsenceRecord(record)) {
    return {
      inconsistente: false,
      necessitaAjuste: false,
      statusPonto: 'Falta abonada',
      inconsistencias: [],
    };
  }

  const issues = pointInconsistencies(record);
  const isHourly = isHourlyWorkSchedule(getPointScheduleDayInfo(record.jornadaTrabalho, getPointRecordDate(record)).schedule);
  if (isHourly && hasIncompletePointPeriodLunch(record)) issues.push('Período com marcação de almoço incompleta.');
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
    statusPonto: (getPointOpenEvent(record) || (isHourly && isPointJourneyPending(getPointEvents(record)))) ? 'Em andamento' : (getPointWorkIntervals(record).length ? 'Completo' : 'Sem registro'),
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

// DEV ainda mantém cardápios e clientes nas coleções legadas, sem documentos
// raiz em /lojas. Limita a compatibilidade aos IDs públicos conhecidos para
// não transformar lojaId em um valor arbitrário aceito pelas callables.
const LEGACY_PUBLIC_STORE_IDS = new Set([
  'ana-guimaraes-matriz',
  'ana-guimaraes-garavelo',
]);

const isValidPublicStoreId = async (storeId) => {
  if (LEGACY_PUBLIC_STORE_IDS.has(storeId)) return true;
  const storeDoc = await getStoreRef(storeId).get();
  return storeDoc.exists;
};

const getPostClosingCashPermissionDetails = (permissionDetails) => {
  if (!permissionDetails || typeof permissionDetails !== 'object') return {};
  const caixaDetails = permissionDetails.caixa || permissionDetails.cash;
  return caixaDetails && typeof caixaDetails === 'object' ? caixaDetails : {};
};

const hasExplicitPostClosingCashPermission = (permissionDetails) => (
  Object.prototype.hasOwnProperty.call(
      getPostClosingCashPermissionDetails(permissionDetails),
      CASH_POST_CLOSING_PERMISSION,
  )
);

const readsPostClosingCashPermission = (permissionDetails) => (
  getPostClosingCashPermissionDetails(permissionDetails)
      [CASH_POST_CLOSING_PERMISSION] === true
);

const withPostClosingCashPermission = (permissionDetails, enabled) => {
  const details = permissionDetails && typeof permissionDetails === 'object' ?
    permissionDetails : {};
  return {
    ...details,
    caixa: {
      ...getPostClosingCashPermissionDetails(details),
      [CASH_POST_CLOSING_PERMISSION]: enabled === true,
    },
  };
};

const preparePostClosingCashPermissionDetails = async ({
  requester,
  targetUid = '',
  targetRole,
  existingProfile = {},
  requestedPermissionDetails = null,
}) => {
  let existingPermissionDetails = existingProfile.permissionDetails || {};
  if (targetUid) {
    const existingCustomProfile = await db.collection('customProfiles')
        .doc(targetUid).get();
    if (existingCustomProfile.exists) {
      existingPermissionDetails = existingCustomProfile.data()
          ?.permissionDetails || existingPermissionDetails;
    }
  }

  const existingRole = normalizeRole(existingProfile.role);
  const normalizedTargetRole = normalizeRole(targetRole);
  const existingEnabled = existingRole === ROLE_MANAGER &&
    readsPostClosingCashPermission(existingPermissionDetails);
  const requestedEnabled = normalizedTargetRole === ROLE_MANAGER ? (
    hasExplicitPostClosingCashPermission(requestedPermissionDetails) ?
      readsPostClosingCashPermission(requestedPermissionDetails) :
      existingEnabled
  ) : false;

  if (requester.role === ROLE_MANAGER && requestedEnabled !== existingEnabled) {
    throw new HttpsError(
        'permission-denied',
        'Somente um Dono pode conceder ou remover a permissao de ajustar e corrigir o Caixa apos o encerramento.',
    );
  }

  const detailsToPersist = requestedPermissionDetails &&
    typeof requestedPermissionDetails === 'object' ?
    requestedPermissionDetails : existingPermissionDetails;
  return withPostClosingCashPermission(detailsToPersist, requestedEnabled);
};

const managerHasTransferDestinationPermission = (permissionDetails = {}) => (
  permissionDetails?.['entre-lojas']?.manageTransferDestinations === true ||
  permissionDetails?.entreLojas?.manageTransferDestinations === true
);

const assertManagerCannotGrantTransferDestinationAccess = async (
    requester,
    targetUid,
    requestedPermissionDetails,
) => {
  if (requester.role !== ROLE_MANAGER) return;
  const requested = managerHasTransferDestinationPermission(
      requestedPermissionDetails,
  );
  let existing = false;
  if (targetUid) {
    const existingCustomProfile = await db.collection('customProfiles')
        .doc(targetUid).get();
    const existingDetails = existingCustomProfile.data()?.permissionDetails || {};
    existing = managerHasTransferDestinationPermission(existingDetails);
  }
  if (requested === existing) return;
  throw new HttpsError(
      'permission-denied',
      'Somente um Dono pode alterar a permissão de gerenciar destinos de remessas.',
  );
};

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
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekdayRaw = parts.find((part) => part.type === 'weekday')?.value?.toLowerCase() || 'sun';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
  const weekdayMap = {sun: 'sun', mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat'};
  const weekday = weekdayMap[weekdayRaw.slice(0, 3)] || 'sun';
  return {weekday, minutes: (hour * 60) + minute};
};

const isStoreOpenNow = (storeConfig = {}, now = new Date()) => {
  const overrideMode = storeConfig?.manualOverride?.mode || 'auto';
  if (overrideMode === 'force_open') return true;
  if (overrideMode === 'force_closed') return false;

  const timezone = storeConfig?.timezone || DEFAULT_STORE_TIMEZONE;
  const schedule = storeConfig?.schedule || {};
  const {weekday, minutes} = getNowInTimeZone(timezone, now);

  const todayConfig = schedule[weekday];
  if (!todayConfig || !todayConfig.enabled) return false;

  const openMinutes = parseTimeToMinutes(todayConfig.open);
  const closeMinutes = parseTimeToMinutes(todayConfig.close);
  if (openMinutes === null || closeMinutes === null) return false;
  if (closeMinutes <= openMinutes) return false;

  return minutes >= openMinutes && minutes < closeMinutes;
};

// API Express para o Cardápio Online
const app = express();
app.use(cors({origin: true})); // Habilita CORS para a API do cardápio
app.use(express.json());

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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(targetRef);
    const payload = {
      ...data,
      lojaId: data.lojaId || lojaId || data.lojaId,
      atualizadoEm: timestamp,
    };

    if (lojaId) {
      payload.lojasVisitadas = admin.firestore.FieldValue.arrayUnion(lojaId);
    }

    if (Number.isFinite(purchaseCountIncrement) && purchaseCountIncrement !== 0) {
      payload.numeroDeCompras = admin.firestore.FieldValue.increment(purchaseCountIncrement);
    }

    if (Number.isFinite(purchaseValueIncrement) && purchaseValueIncrement !== 0) {
      payload.valorEmCompras = admin.firestore.FieldValue.increment(purchaseValueIncrement);
    }

    if (!snap.exists && setCreatedIfMissing) {
      payload.criadoEm = createdAt || timestamp;
      payload.numeroDeCompras = payload.numeroDeCompras ?? 0;
      payload.valorEmCompras = payload.valorEmCompras ?? 0;
      payload.lojasVisitadas = lojaId ? admin.firestore.FieldValue.arrayUnion(lojaId) : payload.lojasVisitadas;
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
      updates.enderecos = admin.firestore.FieldValue.arrayUnion(newAddress);
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


// Rota para criar um novo pedido
app.post("/pedidos", async (req, res) => {
  const lojaId = requireStoreId(req, res);
  if (!lojaId) return;
  try {
    const storeConfigSnap = await getStoreConfigDoc(lojaId).get();
    const storeConfig = storeConfigSnap.exists ? (storeConfigSnap.data() || {}) : {};

    if (!isStoreOpenNow(storeConfig)) {
      return res.status(403).json({
        code: 'STORE_CLOSED',
        message: 'A loja está fechada no momento. Volte em nosso horário de atendimento.',
      });
    }

    const newOrder = {
      ...req.body,
      lojaId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const docRef = await db.collection("lojas").doc(lojaId).collection("pedidos").add(newOrder);
    res.status(201).json({id: docRef.id});
  } catch (error) {
    logger.error("Erro ao criar pedido:", error);
    res.status(500).send("Erro ao criar pedido.");
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
  const valorFreteInformado = Number(req.body?.valorFrete ?? 0);
  const origem = typeof req.body?.origem === 'string' ? req.body.origem : 'Cardapio Online';
  const status = typeof req.body?.status === 'string' ? req.body.status : 'Pendente';

  if (!itens.length) {
    return res.status(400).json({ok: false, message: 'Adicione ao menos um item ao pedido.'});
  }

  if (!cliente?.nome || !cliente?.telefone) {
    return res.status(400).json({ok: false, message: 'Dados do cliente incompletos.'});
  }

  try {
    const whatsappConfirmation = buildCheckoutWhatsApp({
      phone: cliente.telefone,
      consent: req.body?.whatsappConsent,
      serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
    });
    const orderId = await db.runTransaction(async (transaction) => {
      const storeConfigRef = getStoreConfigDoc(lojaId);
      const storeConfigSnap = await transaction.get(storeConfigRef);
      const storeConfig = storeConfigSnap.exists ? (storeConfigSnap.data() || {}) : {};
      const pickup = cliente.endereco === 'Retirar na Loja';
      let freightQuote;
      try {
        freightQuote = quoteFreight({
          config: storeConfig.frete || storeConfig,
          distanceKm: req.body?.distanciaFreteKm,
          requestedFreight: valorFreteInformado,
          pickup,
        });
      } catch (error) {
        throw createHttpError(400, error.message);
      }
      const {valorFrete, freteACombinar, tipoFrete} = freightQuote;

      if (!isStoreOpenNow(storeConfig)) {
        throw createHttpError(
          403,
          'A loja está fechada no momento. Volte em nosso horário de atendimento.',
          'STORE_CLOSED',
        );
      }

      const stockUpdates = [];
      for (const item of itens) {
        const produtoId = item?.produtoId || item?.id;
        const quantity = Number(item?.quantity || 0);
        if (!produtoId || !Number.isFinite(quantity) || quantity <= 0) {
          throw createHttpError(400, 'Item de pedido inválido.');
        }

        const productRef = db.collection('lojas').doc(lojaId).collection('produtos').doc(String(produtoId));
        const productSnap = await transaction.get(productRef);

        if (!productSnap.exists) {
          throw createHttpError(404, `Produto ${produtoId} não encontrado.`);
        }

        const productData = productSnap.data() || {};
        if (typeof productData.estoque === 'number') {
          const newStock = productData.estoque - quantity;
          if (newStock < 0) {
            throw createHttpError(409, `Estoque insuficiente para ${productData.nome || produtoId}.`);
          }
          stockUpdates.push({ref: productRef, newStock});
        }
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
        if (limiteUso > 0 && usosAtuais >= limiteUso) {
          throw createHttpError(400, 'Este cupom atingiu o limite de usos.');
        }

        const valorMinimo = Number(cupomData.valorMinimo || 0);
        if (valorMinimo > 0 && subtotal < valorMinimo) {
          throw createHttpError(400, `O pedido mínimo para este cupom é de R$ ${valorMinimo.toFixed(2)}.`);
        }

        if (cupomData.tipoDesconto === 'percentual') {
          valorDesconto = Number(((subtotal * Number(cupomData.valor || 0)) / 100).toFixed(2));
        } else {
          valorDesconto = Number(Number(cupomData.valor || 0).toFixed(2));
        }
      } else if (descontoInformado > 0) {
        throw createHttpError(400, 'Desconto informado sem cupom válido.');
      }

      const descontoFinal = cupomDocRef ? valorDesconto : 0;
      let total;
      try {
        total = totalWithFreight(subtotal - descontoFinal, freightQuote);
      } catch (_) {
        throw createHttpError(400, 'Totais do pedido inválidos.');
      }
      if (!Number.isFinite(total) || total < 0) {
        throw createHttpError(400, 'Totais do pedido inválidos.');
      }

      let clienteRef = null;
      let clienteSnap = null;
      if (cliente?.id) {
        clienteRef = getClientsCollection().doc(String(cliente.id));
        clienteSnap = await transaction.get(clienteRef);
      }

      const orderRef = db.collection('lojas').doc(lojaId).collection('pedidos').doc();
      transaction.set(orderRef, {
        lojaId,
        clienteId: cliente.id || null,
        clienteNome: cliente.nome,
        clienteEndereco: cliente.endereco || '',
        telefone: cliente.telefone,
        whatsappConfirmation,
        formaPagamento: pagamento.forma || pagamento.formaPagamento || '',
        itens: itens.map((item) => ({
          produtoId: item?.produtoId || item?.id,
          nome: item?.nome || '',
          quantity: Number(item?.quantity || 0),
          preco: Number(item?.preco || 0),
        })),
        subtotal,
        desconto: descontoFinal,
        valorFrete,
        freteACombinar,
        tipoFrete,
        distanciaFreteKm: req.body?.distanciaFreteKm ?? null,
        total,
        cupom: cupomDocRef ? {codigo: couponCode, valorDesconto: descontoFinal} : null,
        status,
        origem,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      for (const stockUpdate of stockUpdates) {
        transaction.update(stockUpdate.ref, {estoque: stockUpdate.newStock});
      }

      if (cupomDocRef) {
        transaction.set(cupomDocRef, {usos: admin.firestore.FieldValue.increment(1)}, {merge: true});

        if (clienteRef && clienteSnap?.exists) {
          transaction.set(clienteRef, {
            cuponsUsados: admin.firestore.FieldValue.arrayUnion(couponCode),
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
          }, {merge: true});
        }
      }

      return {id: orderRef.id, desconto: descontoFinal, valorFrete, freteACombinar, tipoFrete, total};
    });

    return res.status(200).json({ok: true, ...orderId, whatsappPhoneStatus: whatsappConfirmation.phoneStatus});
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

        const configDoc = await getStoreConfigDoc(lojaId).get();
        let freteConfig = configDoc.exists ? (configDoc.data()?.frete || configDoc.data()) : null;

        if (!freteConfig || Object.keys(freteConfig).length === 0) {
            const legacyFreteDoc = await getLegacyConfigDoc(lojaId, 'frete').get();
            if (legacyFreteDoc.exists) {
                freteConfig = legacyFreteDoc.data();
                await getStoreConfigDoc(lojaId).set({ frete: freteConfig }, { merge: true });
            }
        }

        if (!freteConfig || Object.keys(freteConfig).length === 0) {
            const legacyDoc = await getLegacyInfoDoc(lojaId).get();
            freteConfig = legacyDoc.data()?.frete || null;

            if (freteConfig) {
                await getStoreConfigDoc(lojaId).set({ frete: freteConfig }, { merge: true });
            }
        }

        if (!freteConfig) {
            return res.status(404).json({ message: "Configuração de frete não encontrada." });
        }

        if (freteConfig.freteACombinar === true) {
            return res.status(200).json(quoteFreight({config: freteConfig}));
        }

        if (req.body?.distanciaKm !== undefined && req.body?.distanciaKm !== null) {
            try {
                return res.status(200).json({
                    ...quoteFreight({config: freteConfig, distanceKm: req.body.distanciaKm}),
                    distanciaKm: Number(req.body.distanciaKm).toFixed(2),
                });
            } catch (error) {
                return res.status(400).json({message: error.message});
            }
        }

        const lojaLat = Number(freteConfig.lat);
        const lojaLng = Number(freteConfig.lng);
        const valorPorKm = Number(freteConfig.valorPorKm);

        if (!Number.isFinite(lojaLat) || !Number.isFinite(lojaLng) || !Number.isFinite(valorPorKm)
            || !Number.isFinite(Number(clienteLat)) || !Number.isFinite(Number(clienteLng))
            || clienteLat == null || clienteLng == null) {
            return res.status(400).json({ message: "Configuração de frete inválida." });
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
        const freightQuote = quoteFreight({config: freteConfig, distanceKm: distanciaKm});

        res.status(200).json({
            ...freightQuote,
            distanciaKm: distanciaKm.toFixed(2)
        });

    } catch (error) {
        logger.error("Erro ao calcular frete:", error);
        res.status(500).send("Erro ao calcular frete.");
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


const LOOKUP_CLIENT_ALLOWED_ORIGINS = [
  'https://www.anaguimaraesdoceria.com.br',
  'https://anaguimaraesdoceria.com.br',
  'https://crmdoceria-9959e.web.app',
  'https://crmdoceria-9959e.firebaseapp.com',
  'https://crmdoceria-9959e-dev.web.app',
  'https://crmdoceria-9959e-dev.firebaseapp.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
];

exports.lookupClientByPhone = onCall({ cors: LOOKUP_CLIENT_ALLOWED_ORIGINS }, async (request) => {
  try {
    if (request.auth?.uid) await assertActiveUser(request.auth.uid);
    const rawPhone = request.data?.telefone;
    const lojaId = typeof request.data?.lojaId === 'string' ? request.data.lojaId.trim() : '';

    const normalizedPhone = normalizePhoneNumber(rawPhone);
    if (!normalizedPhone) {
      throw new HttpsError('invalid-argument', 'Telefone inválido.');
    }

    if (!lojaId) {
      throw new HttpsError('invalid-argument', 'lojaId é obrigatório.');
    }

    if (!(await isValidPublicStoreId(lojaId))) {
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!found) {
      await db.collection('auditLogs').add({
        ...auditPayload,
        outcome: 'not-found',
      });
      throw new HttpsError('not-found', 'Cliente não encontrado.');
    }

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
    if (request.auth?.uid) await assertActiveUser(request.auth.uid);
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

    if (!clientSnap.exists) {
      throw new HttpsError('not-found', 'Cliente não encontrado.');
    }

    await clientRef.update({
      nome,
      aniversario,
      lojaId,
      lojasVisitadas: admin.firestore.FieldValue.arrayUnion(lojaId),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
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
    if (request.auth?.uid) await assertActiveUser(request.auth.uid);
    const clientId = typeof request.data?.clientId === 'string' ? request.data.clientId.trim() : '';
    const lojaId = typeof request.data?.lojaId === 'string' ? request.data.lojaId.trim() : '';
    const incomingAddress = request.data?.address;
    const address = incomingAddress && typeof incomingAddress === 'object' ? incomingAddress : null;

    if (!clientId || !lojaId || !address) {
      throw new HttpsError('invalid-argument', 'Parâmetros obrigatórios ausentes.');
    }

    if (!(await isValidPublicStoreId(lojaId))) {
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
    if (!clientSnap.exists) {
      throw new HttpsError('not-found', 'Cliente não encontrado.');
    }

    await clientRef.update({
      enderecos: admin.firestore.FieldValue.arrayUnion(allowedAddress),
      lojasVisitadas: admin.firestore.FieldValue.arrayUnion(lojaId),
      lojaId,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
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
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
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
      historicoRegistros: admin.firestore.FieldValue.arrayUnion(pointEvent),
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
exports.api = onRequest(app);

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
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

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
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
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
        const permissionDetailsToPersist =
          await preparePostClosingCashPermissionDetails({
            requester,
            targetRole: normalizedRole,
            requestedPermissionDetails,
          });
        await assertManagerCannotGrantUserStatusAccess(
            requester,
            null,
            requestedPermissionDetails,
        );
        await assertManagerCannotGrantTransferDestinationAccess(
            requester,
            null,
            requestedPermissionDetails,
        );
        const sanitizedWorkSchedule = sanitizeEmployeeWorkSchedule({ ...jornadaTrabalho, historicoEscalas: undefined });
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
            permissionDetailsToPersist,
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
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        const permissionDetailsToPersist =
          await preparePostClosingCashPermissionDetails({
            requester,
            targetUid: uid,
            targetRole: normalizedRole,
            existingProfile,
            requestedPermissionDetails,
          });
        await assertManagerCannotGrantUserStatusAccess(
            requester,
            uid,
            requestedPermissionDetails,
        );
        await assertManagerCannotGrantTransferDestinationAccess(
            requester,
            uid,
            requestedPermissionDetails,
        );
        const sanitizedWorkSchedule = buildPointScheduleUpdate(
          existingProfile.jornadaTrabalho || existingProfile.escalaTrabalho || existingProfile.workSchedule,
          jornadaTrabalho || existingProfile.jornadaTrabalho,
          new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date()),
        );
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
            permissionDetailsToPersist,
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

        return { message: "Usuário atualizado com sucesso!", jornadaTrabalho: sanitizedWorkSchedule };
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


const chunkValues = (values, size = 500) => {
    const chunks = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
};

const getAuthorizedOrderTokenDocs = async (storeId) => {
    const tokensSnapshot = await db.collection('notificationTokens').get();
    if (tokensSnapshot.empty) return [];

    const userIds = [...new Set(tokensSnapshot.docs
        .map((snapshot) => String(snapshot.data()?.uid || '').trim())
        .filter(Boolean))];
    const profilesByUid = new Map();
    const customProfilesByUid = new Map();

    for (const userIdChunk of chunkValues(userIds, 100)) {
        const [profileSnapshots, customProfileSnapshots] = await Promise.all([
            db.getAll(...userIdChunk.map((uid) => db.collection('users').doc(uid))),
            db.getAll(...userIdChunk.map((uid) => db.collection('customProfiles').doc(uid))),
        ]);

        profileSnapshots.forEach((snapshot) => {
            if (snapshot.exists) profilesByUid.set(snapshot.id, snapshot.data() || {});
        });
        customProfileSnapshots.forEach((snapshot) => {
            if (snapshot.exists) customProfilesByUid.set(snapshot.id, snapshot.data() || {});
        });
    }

    return tokensSnapshot.docs.filter((snapshot) => {
        const uid = String(snapshot.data()?.uid || '').trim();
        return uid &&
            profileCanReceiveOrder(
                profilesByUid.get(uid),
                storeId,
                customProfilesByUid.get(uid),
            );
    });
};

const clearInterruptedAlarmPauses = async (storeId, orderCreatedAt) => {
    const pauseSnapshot = await db.collectionGroup('alarmPauses')
        .where('storeId', '==', storeId)
        .get();
    const pausesToClear = pauseSnapshot.docs.filter((snapshot) =>
        shouldInterruptAlarmPause(snapshot.data() || {}, orderCreatedAt),
    );

    for (const pauseChunk of chunkValues(pausesToClear)) {
        const batch = db.batch();
        pauseChunk.forEach((snapshot) => batch.delete(snapshot.ref));
        await batch.commit();
    }

    return pausesToClear.length;
};

const INVALID_TOKEN_CODES = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
]);
const RETRYABLE_MESSAGING_CODES = new Set([
    'messaging/internal-error',
    'messaging/server-unavailable',
    'messaging/unknown-error',
    'messaging/quota-exceeded',
]);

const sendNewOrderMulticast = async ({tokenDocs, data, orderId}) => {
    const invalidTokens = new Set();
    let pendingTokenDocs = tokenDocs;
    let successCount = 0;
    let failureCount = 0;

    for (let attempt = 1; attempt <= 2 && pendingTokenDocs.length; attempt += 1) {
        const retryTokenDocs = [];

        for (const tokenDocChunk of chunkValues(pendingTokenDocs)) {
            const tokens = tokenDocChunk.map((snapshot) => snapshot.id);
            const response = await admin.messaging().sendEachForMulticast({
                tokens,
                data,
                android: {
                    priority: 'high',
                    ttl: 10 * 60 * 1000,
                    restrictedPackageName: 'br.com.anaguimaraes.doceria',
                },
                webpush: {
                    headers: {
                        Urgency: 'high',
                        TTL: '600',
                    },
                },
            });

            for (let index = 0; index < response.responses.length; index += 1) {
                const result = response.responses[index];
                if (result.success) {
                    successCount += 1;
                    continue;
                }

                const errorCode = result.error?.code || 'messaging/unknown-error';
                const tokenDoc = tokenDocChunk[index];
                if (INVALID_TOKEN_CODES.has(errorCode)) {
                    invalidTokens.add(tokens[index]);
                    failureCount += 1;
                } else if (attempt === 1 && RETRYABLE_MESSAGING_CODES.has(errorCode)) {
                    retryTokenDocs.push(tokenDoc);
                } else {
                    failureCount += 1;
                }

                logger.error('Falha ao enviar notificação de novo pedido.', {
                    attempt,
                    errorCode,
                    orderId,
                });
            }
        }

        pendingTokenDocs = retryTokenDocs;
    }

    await Promise.all([...invalidTokens].map((token) =>
        db.collection('notificationTokens').doc(token).delete().catch((error) => {
            logger.error('Erro ao remover token FCM inválido.', {token, error});
        }),
    ));

    return {
        successCount,
        failureCount,
        invalidTokenCount: invalidTokens.size,
    };
};

const NOTIFICATION_CLAIM_LEASE_MS = 2 * 60 * 1000;
const NOTIFICATION_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

exports.notifyNewOrder = onDocumentCreated({
    document: 'lojas/{lojaId}/pedidos/{pedidoId}',
    region: 'southamerica-east1',
    retry: true,
}, async (event) => {
    const order = event.data?.data();
    const orderId = String(event.params?.pedidoId || '').trim();
    const storeId = String(event.params?.lojaId || '').trim();

    if (!order || !orderId || !storeId) {
        logger.warn('Novo pedido sem identificadores válidos. Push ignorado.');
        return;
    }

    if (!isNewPendingOrder(order)) {
        logger.info('Pedido criado fora do status Pendente. Push ignorado.', {orderId, storeId});
        return;
    }

    const eventKey = crypto.createHash('sha256')
        .update(`${storeId}:${orderId}`)
        .digest('hex');
    const eventRef = db.collection('notificationEvents').doc(eventKey);

    const now = Date.now();
    const claimStatus = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(eventRef);
        const previous = snapshot.data() || {};
        if (snapshot.exists && ['sent', 'partial_failure'].includes(previous.status)) {
            return 'completed';
        }
        if (snapshot.exists && previous.status === 'processing' &&
            Number(previous.leaseUntil || 0) > now) {
            return 'busy';
        }

        transaction.set(eventRef, {
            type: 'new_order',
            orderId,
            storeId,
            triggerEventId: event.id || '',
            status: 'processing',
            leaseUntil: now + NOTIFICATION_CLAIM_LEASE_MS,
            attemptCount: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromMillis(now + NOTIFICATION_EVENT_RETENTION_MS),
        }, {merge: true});
        return 'claimed';
    });

    if (claimStatus === 'completed') {
        logger.info('Evento de novo pedido já processado.', {orderId, storeId});
        return;
    }
    if (claimStatus === 'busy') {
        throw new Error(`Evento ${storeId}:${orderId} ainda está sendo processado.`);
    }

    try {
        const interruptedPauseCount = await clearInterruptedAlarmPauses(storeId, event.time);
        const tokenDocs = await getAuthorizedOrderTokenDocs(storeId);
        const data = buildNewOrderData({orderId, storeId, order});
        let delivery = {successCount: 0, failureCount: 0, invalidTokenCount: 0};

        if (tokenDocs.length) {
            delivery = await sendNewOrderMulticast({tokenDocs, data, orderId});
        }

        await eventRef.set({
            status: delivery.failureCount ? 'partial_failure' : 'sent',
            authorizedDeviceCount: tokenDocs.length,
            successCount: delivery.successCount,
            failureCount: delivery.failureCount,
            invalidTokenCount: delivery.invalidTokenCount,
            interruptedPauseCount,
            leaseUntil: 0,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
    } catch (error) {
        await eventRef.set({
            status: 'failed',
            leaseUntil: 0,
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true}).catch(() => undefined);
        logger.error('Erro ao enviar notificações de novo pedido.', {orderId, storeId, error});
        throw error;
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
    onCall,
    HttpsError,
    logger,
}));

Object.assign(exports, createEntreLojasReportFunctions({
    db,
    onCall: onActiveUserCall,
    HttpsError,
    logger,
}));

Object.assign(exports, createProductionShowcaseFunctions({
    admin,
    db,
    onCall: onActiveUserCall,
    HttpsError,
    logger,
}));

Object.assign(exports, createCustomerPurchaseMetricsFunctions({
    admin,
    db,
    onCall,
    onDocumentWritten,
    HttpsError,
    logger,
    verifyStoreAccess: verifyCustomerMetricsStoreAccess,
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

Object.assign(exports, createIfoodFunctions({
    admin,
    db,
    onCall: onActiveUserCall,
    onRequest,
    onSchedule,
    onDocumentWritten,
    HttpsError,
    logger,
    verifyManagementAccess,
    userHasAccessToStores,
    STORE_ALL_KEY,
}));

Object.assign(exports, createFood99Functions({
    admin,
    db,
    onCall: onActiveUserCall,
    onRequest,
    onSchedule,
    onDocumentWritten,
    HttpsError,
    logger,
    verifyManagementAccess,
    userHasAccessToStores,
    STORE_ALL_KEY,
}));
