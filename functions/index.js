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
const {createFiscalFunctions} = require('./fiscal');
const {createIfoodFunctions} = require('./ifood');
const {createFood99Functions} = require('./food99');
const {createCaixaFunctions} = require('./caixa');
const {createEntreLojasReportFunctions} = require('./entre-lojas-report');
const {
  defaultCashPermissions,
  sanitizeCashPermissions,
} = require('./caixa-core');

// Inicializa o Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
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
  return {
    'entre-lojas': {
      statuses: permissions?.['entre-lojas'] ? [...ENTRE_LOJAS_TRANSFER_STATUS_VALUES] : [],
    },
    caixa: permissions?.fornecedores ?
      defaultCashPermissions(role) :
      defaultCashPermissions(ROLE_ACCOUNTANT),
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

  return {
    'entre-lojas': {statuses},
    caixa: permissions?.fornecedores ?
      sanitizeCashPermissions(caixaDetails, role) :
      defaultCashPermissions(ROLE_ACCOUNTANT),
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

const verifyManagementAccess = async (uid) => {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Você precisa estar autenticado.');
  }
  const profile = await getUserProfile(uid);
  const role = normalizeRole(profile.role);
  const stores = extractStoreIds(profile);

  if (role === ROLE_OWNER) {
    return { role, stores, allStores: stores.length === 0 };
  }

  if (role === ROLE_MANAGER) {
    if (!stores.length) {
      throw new HttpsError('permission-denied', 'Gerentes precisam estar associados a pelo menos uma loja.');
    }
    return { role, stores, allStores: false };
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

const rethrowHttpsError = (error) => {
  if (error instanceof HttpsError) {
    throw error;
  }
};

const verifyStoreReadAccess = async (uid) => {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Você precisa estar autenticado.');
  }
  const profile = await getUserProfile(uid);
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
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Você precisa estar autenticado.');
  }
  if (!lojaId || lojaId === STORE_ALL_KEY) {
    throw new HttpsError('failed-precondition', 'Selecione uma loja específica para registrar o ponto.');
  }
  const profile = await getUserProfile(uid);
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

const isExcusedAbsenceRecord = (record = {}) => (
  record.tipoLancamento === 'abono_falta' ||
  record.faltaAbonada === true ||
  record.abonoFalta === true
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
    expectedMinutes: dayOfWeek !== null && scheduleDay.isWorkday ?
      (scheduleDay.expectedMinutes || expectedMinutes) :
      0,
    hasDate: dayOfWeek !== null,
  };
};

const isSaturdayPointRecord = (record = {}) => {
  const date = getPointRecordDate(record);
  return date instanceof Date && !Number.isNaN(date.getTime()) && date.getDay() === 6;
};

const calculatePointSummary = (record = {}) => {
  if (isExcusedAbsenceRecord(record)) {
    return {workedLabel: '', irregularidade: '', workedMinutes: null, irregularityMinutes: null, calculable: false};
  }

  const entrada = pointTimeToMinutes(record.horaEntrada);
  const saida = pointTimeToMinutes(record.horaSaida);
  if (entrada === null || saida === null) {
    return {workedLabel: '', irregularidade: '', workedMinutes: null, irregularityMinutes: null, calculable: false};
  }

  const almocoSaida = pointTimeToMinutes(record.horaAlmocoSaida);
  const almocoRetorno = pointTimeToMinutes(record.horaAlmocoRetorno);
  const hasLunchStart = hasPointTimeValue(record.horaAlmocoSaida);
  const hasLunchReturn = hasPointTimeValue(record.horaAlmocoRetorno);
  const hasCompleteLunch = hasLunchStart && hasLunchReturn;
  const hasNoLunch = !hasLunchStart && !hasLunchReturn;

  if (!hasCompleteLunch && !hasNoLunch) {
    return {workedLabel: '', irregularidade: '', workedMinutes: null, irregularityMinutes: null, calculable: false};
  }

  const workedMinutes = hasCompleteLunch ?
    (almocoSaida - entrada) + (saida - almocoRetorno) :
    saida - entrada;

  if (!Number.isFinite(workedMinutes) || workedMinutes <= 0) {
    return {workedLabel: '', irregularidade: '', workedMinutes: null, irregularityMinutes: null, calculable: false};
  }

  const workedLabel = formatPointMinutes(workedMinutes);
  const {expectedMinutes, hasDate} = getExpectedPointMinutesForDay(record);
  if (!hasDate) {
    return {
      workedLabel,
      irregularidade: '',
      workedMinutes,
      irregularityMinutes: null,
      calculable: false,
    };
  }

  const diff = workedMinutes - expectedMinutes;
  const irregularidade = diff === 0 ? '00:00' : formatSignedPointMinutes(diff);
  return {workedLabel, irregularidade, workedMinutes, irregularityMinutes: diff, calculable: true};
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
  !hasPointTimeValue(record.horaAlmocoRetorno)
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

  const isSaturdayWorked = isSaturdayPointRecord(record) &&
    hasPointTimeValue(record.horaEntrada) &&
    hasPointTimeValue(record.horaSaida) &&
    summary?.calculable === true &&
    Number.isFinite(summary?.workedMinutes);
  const missingLunchBankMinutes = !isSaturdayWorked && hasMissingLunchBreak(record, summary) ?
    POINT_MISSING_LUNCH_BANK_MINUTES :
    0;

  if (isSaturdayWorked) {
    bancoHorasMinutes += Math.min(summary.workedMinutes, POINT_SATURDAY_BANK_LIMIT_MINUTES);
    horaExtraMinutes += Math.max(summary.workedMinutes - POINT_SATURDAY_BANK_LIMIT_MINUTES, 0);
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
    statusPonto: record.horaSaida ? 'Completo' : 'Em andamento',
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
  const valorFrete = Number(req.body?.valorFrete ?? 0);
  const origem = typeof req.body?.origem === 'string' ? req.body.origem : 'Cardapio Online';
  const status = typeof req.body?.status === 'string' ? req.body.status : 'Pendente';

  if (!itens.length) {
    return res.status(400).json({ok: false, message: 'Adicione ao menos um item ao pedido.'});
  }

  if (!cliente?.nome || !cliente?.telefone) {
    return res.status(400).json({ok: false, message: 'Dados do cliente incompletos.'});
  }

  try {
    const orderId = await db.runTransaction(async (transaction) => {
      const storeConfigRef = getStoreConfigDoc(lojaId);
      const storeConfigSnap = await transaction.get(storeConfigRef);
      const storeConfig = storeConfigSnap.exists ? (storeConfigSnap.data() || {}) : {};

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
      const total = Number((subtotal - descontoFinal + valorFrete).toFixed(2));
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

      return orderRef.id;
    });

    return res.status(200).json({ok: true, id: orderId});
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

        const lojaLat = freteConfig.lat;
        const lojaLng = freteConfig.lng;
        const valorPorKm = freteConfig.valorPorKm;

        if (typeof lojaLat !== 'number' || typeof lojaLng !== 'number' || typeof valorPorKm !== 'number') {
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
        const valorFrete = distanciaKm * valorPorKm;

        res.status(200).json({
            valorFrete: parseFloat(valorFrete.toFixed(2)),
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

const validatePointTransition = (type, current = {}) => {
  if (current.horaSaida) {
    throw new HttpsError('failed-precondition', 'A jornada de hoje já foi encerrada.');
  }
  if (type === 'entrada') {
    if (current.horaEntrada) throw new HttpsError('already-exists', 'A entrada de hoje já foi registrada.');
    return;
  }
  if (type === 'almoco_inicio') {
    if (!current.horaEntrada) throw new HttpsError('failed-precondition', 'Registre a entrada antes do início do almoço.');
    if (current.horaAlmocoSaida) throw new HttpsError('already-exists', 'O início do almoço de hoje já foi registrado.');
    return;
  }
  if (type === 'almoco_fim') {
    if (!current.horaAlmocoSaida) throw new HttpsError('failed-precondition', 'Registre o início do almoço antes do retorno.');
    if (current.horaAlmocoRetorno) throw new HttpsError('already-exists', 'O retorno do almoço de hoje já foi registrado.');
    return;
  }
  if (type === 'saida') {
    if (current.horaAlmocoSaida && !current.horaAlmocoRetorno) {
      throw new HttpsError('failed-precondition', 'Registre o retorno do almoço antes da saída.');
    }
    return;
  }
  throw new HttpsError('invalid-argument', 'Tipo de registro de ponto inválido.');
};

exports.registerEmployeePoint = onCall({timeoutSeconds: 60}, async (request) => {
  const uid = request.auth?.uid;
  const lojaId = String(request.data?.lojaId || '').trim();
  const type = String(request.data?.type || '').trim();
  const {profile} = await verifyPointStoreAccess(uid, lojaId);
  const employeeSchedule = sanitizeEmployeeWorkSchedule(profile.jornadaTrabalho || profile.escalaTrabalho || profile.workSchedule);
  const {now, dayKey, competenciaKey, timeLabel} = getSaoPauloPointNow();
  const pontosRef = db.collection('lojas').doc(lojaId).collection('pontos');
  const fallbackRecordRef = pontosRef.doc(`${uid}_${dayKey}`);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const actionMap = {
    entrada: 'entrada',
    almoco_inicio: 'início do almoço',
    almoco_fim: 'retorno do almoço',
    saida: 'saída',
  };
  const payload = pointPayloadForType(type, timeLabel, request.data?.coords || null, request.data?.address || '');
  if (!payload) {
    throw new HttpsError('invalid-argument', 'Tipo de registro de ponto inválido.');
  }

  let responseRecord = null;
  let responseRecordId = fallbackRecordRef.id;
  await db.runTransaction(async (transaction) => {
    const existingQuery = pontosRef
      .where('funcionarioId', '==', uid)
      .where('dia', '==', dayKey)
      .where('competencia', '==', competenciaKey)
      .limit(1);
    const querySnap = await transaction.get(existingQuery);
    const recordRef = querySnap.empty ? fallbackRecordRef : querySnap.docs[0].ref;
    const recordSnap = querySnap.empty ? await transaction.get(recordRef) : querySnap.docs[0];
    const existingData = recordSnap.exists ? recordSnap.data() || {} : {};
    validatePointTransition(type, existingData);

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
      ...payload,
      updatedAt: timestamp,
    };
    const statusPatch = pointStatusPatch(mergedRecord);
    const summary = calculatePointSummary(mergedRecord);
    const balanceDistribution = calculatePointBalanceDistribution(mergedRecord, summary);
    const updateData = {
      ...(recordSnap.exists ? {} : baseData),
      ...payload,
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
      historicoRegistros: admin.firestore.FieldValue.arrayUnion({
        tipo: type,
        descricao: actionMap[type],
        hora: timeLabel,
        registradoEm: now.toISOString(),
      }),
    };
    transaction.set(recordRef, updateData, {merge: true});
    responseRecordId = recordRef.id;
    responseRecord = {
      ...mergedRecord,
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

        const customProfilesSnap = await db.collection('customProfiles').get();
        const customProfiles = {};
        customProfilesSnap.forEach((doc) => {
            customProfiles[doc.id] = doc.data();
        });

        const combinedUsers = await Promise.all(usersFromAuth.map(async (userRecord) => {
            const firestoreData = usersDataFromFirestore[userRecord.uid] || {};
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
            jornadaTrabalho: sanitizedWorkSchedule,
            dataInicioBancoHoras: sanitizedBankStartDate,
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


exports.notifyNewOrder = onDocumentCreated({
    document: "pedidos/{pedidoId}",
    region: "southamerica-east1",
}, async (event) => {
    const orderData = event.data?.data();

    if (!orderData) {
        logger.warn("Novo pedido criado sem dados. Notificação não enviada.");
        return;
    }

    try {
        const tokensSnapshot = await db.collection("notificationTokens").get();

        if (tokensSnapshot.empty) {
            logger.info("Nenhum token de notificação cadastrado. Ignorando envio de push.");
            return;
        }

        const tokens = tokensSnapshot.docs.map((doc) => doc.id);
        const orderId = String(event.params?.pedidoId || "");
        const status = orderData.status ? String(orderData.status) : "Pendente";
        const customerName = orderData.clienteNome || orderData.nomeCliente || orderData.nome || orderData.cliente?.nome || "";
        const orderCode = orderData.numeroPedido || orderData.codigo || orderData.numero || "";

        const title = "Novo pedido recebido";
        let body = customerName ? `Pedido de ${customerName}` : "Um novo pedido foi recebido.";
        if (orderCode) {
            body = `${body} (#${orderCode})`;
        }

        const message = {
            tokens,
            notification: {
                title,
                body,
            },
            data: {
                orderId,
                status,
                url: "/",
                source: "new-order",
            },
            android: {
                priority: "high",
                notification: {
                    title,
                    body,
                    channelId: "new-orders",
                    sound: "default",
                    clickAction: "FLUTTER_NOTIFICATION_CLICK",
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
                        category: "NEW_ORDER",
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
                    icon: "/logo192.png",
                    badge: "/logo192.png",
                    tag: "new-order",
                    renotify: true,
                    vibrate: [200, 100, 200],
                    data: {
                        orderId,
                        url: "/",
                    },
                },
                fcmOptions: {
                    link: "/",
                },
            },
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        const tokensToDelete = [];

        response.responses.forEach((res, index) => {
            if (!res.success) {
                const errorCode = res.error?.code;
                logger.error("Falha ao enviar notificação push:", res.error);

                if (errorCode === "messaging/registration-token-not-registered" || errorCode === "messaging/invalid-registration-token") {
                    tokensToDelete.push(tokens[index]);
                }
            }
        });

        if (tokensToDelete.length > 0) {
            await Promise.all(tokensToDelete.map((token) => db.collection("notificationTokens").doc(token).delete().catch((error) => {
                logger.error("Erro ao remover token inválido:", error);
            })));
        }
    } catch (error) {
        logger.error("Erro ao enviar notificações de novo pedido:", error);
    }
});

const onActiveEntreLojasReportCall = (options, handler) => onCall(
    options,
    async (request) => {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
      }
      const profileSnapshot = await db.collection('users').doc(uid).get();
      const profile = profileSnapshot.exists ? profileSnapshot.data() || {} : {};
      const status = String(profile.status || '').trim().toLowerCase();
      if (!profileSnapshot.exists || profile.ativo === false ||
        profile.authDisabled === true || status === 'inativo') {
        throw new HttpsError(
            'permission-denied',
            'Sua conta está inativa ou não possui perfil válido.',
        );
      }
      return handler(request);
    },
);

Object.assign(exports, createCaixaFunctions({
    admin,
    db,
    onCall,
    onDocumentWritten,
    HttpsError,
    logger,
}));

Object.assign(exports, createEntreLojasReportFunctions({
    db,
    onCall: onActiveEntreLojasReportCall,
    HttpsError,
    logger,
}));

Object.assign(exports, createFiscalFunctions({
    admin,
    db,
    onCall,
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
    onCall,
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
    onCall,
    onRequest,
    onSchedule,
    onDocumentWritten,
    HttpsError,
    logger,
    verifyManagementAccess,
    userHasAccessToStores,
    STORE_ALL_KEY,
}));
