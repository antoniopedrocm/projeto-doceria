export const CAIXA_PERMISSION_KEYS = [
  'registrarInicio',
  'registrarEncerramento',
  'registrarRetiradaDespesa',
  'registrarSangria',
  'visualizarSangrias',
  'visualizarConferencia',
  'visualizarValoresCalculados',
  'visualizarDivergencias',
];

export const CAIXA_PERMISSION_LABELS = {
  registrarInicio: 'Informar valor inicial do dia',
  registrarEncerramento: 'Informar valor de encerramento',
  registrarRetiradaDespesa: 'Registrar retirada para despesa',
  registrarSangria: 'Registrar sangria',
  visualizarSangrias: 'Consultar sangrias',
  visualizarConferencia: 'Consultar histórico gerencial',
  visualizarValoresCalculados: 'Visualizar valores calculados',
  visualizarDivergencias: 'Visualizar diferenças',
};

const normalizeRole = (role) => String(role || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export const getDefaultCaixaPermissionsForRole = (role) => {
  const normalizedRole = normalizeRole(role);
  const canManageCash = [
    'dono',
    'owner',
    'gerente',
    'manager',
    'gestor',
    'gestora',
    'admin',
    'adm',
    'administrador',
    'administradora',
  ].includes(normalizedRole);

  if (canManageCash) {
    return CAIXA_PERMISSION_KEYS.reduce((permissions, key) => ({
      ...permissions,
      [key]: true,
    }), {});
  }

  const isAttendant = [
    'atendente',
    'colaborador',
    'colaboradora',
    'funcionario',
    'funcionaria',
    'vendedor',
    'vendedora',
  ].includes(normalizedRole);

  return CAIXA_PERMISSION_KEYS.reduce((permissions, key) => ({
    ...permissions,
    [key]: isAttendant && [
      'registrarInicio',
      'registrarEncerramento',
      'registrarRetiradaDespesa',
    ].includes(key),
  }), {});
};

export const sanitizeCaixaPermissions = (permissions, role) => {
  const normalizedRole = normalizeRole(role);
  const defaults = getDefaultCaixaPermissionsForRole(role);
  const source = permissions && typeof permissions === 'object' ? permissions : {};

  if (['dono', 'owner', 'admin', 'adm', 'administrador', 'administradora'].includes(normalizedRole)) {
    return defaults;
  }

  const isManager = ['gerente', 'manager', 'gestor', 'gestora'].includes(normalizedRole);
  const isAttendant = [
    'atendente',
    'colaborador',
    'colaboradora',
    'funcionario',
    'funcionaria',
    'vendedor',
    'vendedora',
  ].includes(normalizedRole);

  if (!isManager && !isAttendant) return getEmptyCaixaPermissions();

  return CAIXA_PERMISSION_KEYS.reduce((result, key) => ({
    ...result,
    [key]: isAttendant && ![
      'registrarInicio',
      'registrarEncerramento',
      'registrarRetiradaDespesa',
    ].includes(key)
      ? false
      : (Object.prototype.hasOwnProperty.call(source, key)
        ? Boolean(source[key])
        : defaults[key]),
  }), {});
};

export const getEmptyCaixaPermissions = () => CAIXA_PERMISSION_KEYS.reduce((permissions, key) => ({
  ...permissions,
  [key]: false,
}), {});

export const getLocalOperationalDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getMonthStartDate = (date = new Date()) => getLocalOperationalDate(
  new Date(date.getFullYear(), date.getMonth(), 1),
);

export const parseCurrencyToCents = (value) => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const cents = Math.round(value * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  }

  const text = String(value ?? '').trim();
  if (!text) return null;

  const sanitized = text.replace(/[^\d,.-]/g, '');
  if (!sanitized || !/^-?\d+(?:[.,]\d+)?$/.test(sanitized.replace(/\.(?=.*[,.])/g, ''))) {
    return null;
  }
  const normalized = sanitized.includes(',')
    ? sanitized.replace(/\./g, '').replace(',', '.')
    : sanitized;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  const cents = Math.round(parsed * 100);
  return Number.isSafeInteger(cents) ? cents : null;
};

export const formatCentsBRL = (value) => {
  const cents = Number(value);
  const normalized = Number.isFinite(cents) ? cents : 0;
  return (normalized / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

export const getDocumentCents = (document, centsKey, legacyCurrencyKey) => {
  const rawCentsValue = document?.[centsKey];
  if (rawCentsValue !== null && rawCentsValue !== undefined && rawCentsValue !== '') {
    const centsValue = Number(rawCentsValue);
    if (Number.isFinite(centsValue)) return Math.round(centsValue);
  }

  const rawLegacyValue = document?.[legacyCurrencyKey];
  if (rawLegacyValue === null || rawLegacyValue === undefined || rawLegacyValue === '') return null;

  const legacyValue = Number(rawLegacyValue);
  return Number.isFinite(legacyValue) ? Math.round(legacyValue * 100) : null;
};

export const createIdempotencyKey = (scope = 'caixa') => {
  const randomPart = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `${scope}:${randomPart}`;
};

export const isCashNotification = (notification = {}) => [
  'CAIXA_INICIO_DIVERGENTE',
  'CAIXA_ENCERRAMENTO_DIVERGENTE',
].includes(String(notification.tipo || notification.type || '').toUpperCase());
