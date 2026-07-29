const crypto = require('crypto');

const ROLE_OWNER = 'dono';
const ROLE_MANAGER = 'gerente';
const ROLE_ATTENDANT = 'atendente';
const ROLE_ACCOUNTANT = 'contador';
const ROLE_CLIENT = 'cliente';
const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

const CASH_PERMISSION_KEYS = [
  'registrarInicio',
  'registrarEncerramento',
  'registrarRetiradaDespesa',
  'registrarSangria',
  'visualizarSangrias',
  'visualizarConferencia',
  'visualizarValoresCalculados',
  'visualizarDivergencias',
];

const RECEIVED_STATUS_VALUES = new Set([
  'aprovado',
  'approved',
  'concluido',
  'completed',
  'paga',
  'pago',
  'paid',
  'recebido',
  'received',
  'settled',
]);

const REFUNDED_STATUS_VALUES = new Set([
  'concluido',
  'completed',
  'estornado',
  'refunded',
  'reembolsado',
  'returned',
]);

const normalizeText = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ');

const normalizeRole = (role) => {
  const value = normalizeText(role).replace(/[\s-]+/g, '_');
  if ([ROLE_OWNER, 'owner'].includes(value)) return ROLE_OWNER;
  if ([ROLE_MANAGER, 'gestor', 'gestora', 'manager'].includes(value)) {
    return ROLE_MANAGER;
  }
  if ([ROLE_ACCOUNTANT, 'accountant'].includes(value)) return ROLE_ACCOUNTANT;
  if ([ROLE_CLIENT, 'client'].includes(value)) return ROLE_CLIENT;
  if ([
    'admin',
    'adm',
    'administrador',
    'administradora',
    'administrador_master',
    'administradora_master',
    'admin_master',
    'master',
    'superadmin',
  ].includes(value)) {
    return ROLE_OWNER;
  }
  return ROLE_ATTENDANT;
};

const defaultCashPermissions = (role) => {
  const normalizedRole = normalizeRole(role);
  const denied = CASH_PERMISSION_KEYS.reduce((result, key) => {
    result[key] = false;
    return result;
  }, {});

  if ([ROLE_OWNER, ROLE_MANAGER].includes(normalizedRole)) {
    return CASH_PERMISSION_KEYS.reduce((result, key) => {
      result[key] = true;
      return result;
    }, {});
  }

  if (normalizedRole === ROLE_ATTENDANT) {
    return {
      ...denied,
      registrarInicio: true,
      registrarEncerramento: true,
      registrarRetiradaDespesa: true,
    };
  }

  return denied;
};

const sanitizeCashPermissions = (input, role) => {
  const normalizedRole = normalizeRole(role);
  const defaults = defaultCashPermissions(normalizedRole);
  if (normalizedRole === ROLE_OWNER) return defaults;
  if ([ROLE_ACCOUNTANT, ROLE_CLIENT].includes(normalizedRole)) return defaults;
  const source = input && typeof input === 'object' ? input : {};
  const sanitized = CASH_PERMISSION_KEYS.reduce((result, key) => {
    result[key] = Object.prototype.hasOwnProperty.call(source, key) ?
      Boolean(source[key]) :
      defaults[key];
    return result;
  }, {});
  if (normalizedRole === ROLE_ATTENDANT) {
    sanitized.registrarSangria = false;
    sanitized.visualizarSangrias = false;
    sanitized.visualizarConferencia = false;
    sanitized.visualizarValoresCalculados = false;
    sanitized.visualizarDivergencias = false;
  }
  return sanitized;
};

const resolveCashPermissionInput = (profile = {}, customProfile = {}) => (
  customProfile?.permissionDetails?.caixa ||
  customProfile?.cashPermissions ||
  profile?.permissionDetails?.caixa ||
  profile?.cashPermissions ||
  profile?.permissions?.caixa ||
  null
);

const resolveCashPermissions = (profile = {}, customProfile = {}) => (
  sanitizeCashPermissions(
    resolveCashPermissionInput(profile, customProfile),
    profile.role || customProfile.role,
  )
);

const normalizeOperationalDate = (value) => {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return '';
  }
  return text;
};

const timestampToDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value.toDate === 'function') {
    const converted = value.toDate();
    return converted instanceof Date && !Number.isNaN(converted.getTime()) ?
      converted :
      null;
  }
  if (typeof value === 'object' && Number.isFinite(value.seconds)) {
    const converted = new Date((value.seconds * 1000) +
      Math.floor(Number(value.nanoseconds || 0) / 1000000));
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  const converted = new Date(value);
  return Number.isNaN(converted.getTime()) ? null : converted;
};

const datePartsInTimeZone = (value, timeZone = DEFAULT_TIME_ZONE) => {
  const date = timestampToDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const timeZoneOffsetMilliseconds = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
    return result;
  }, {});
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - date.getTime();
};

const localMidnightUtc = (dateKey, timeZone = DEFAULT_TIME_ZONE) => {
  const normalized = normalizeOperationalDate(dateKey);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  const desiredAsUtc = Date.UTC(year, month - 1, day);
  let candidate = new Date(desiredAsUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset = timeZoneOffsetMilliseconds(candidate, timeZone);
    candidate = new Date(desiredAsUtc - offset);
  }
  return candidate;
};

const nextOperationalDate = (dateKey) => {
  const normalized = normalizeOperationalDate(dateKey);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, '0'),
    String(next.getUTCDate()).padStart(2, '0'),
  ].join('-');
};

const operationalDayBounds = (dateKey, timeZone = DEFAULT_TIME_ZONE) => {
  const normalized = normalizeOperationalDate(dateKey);
  if (!normalized) return null;
  return {
    start: localMidnightUtc(normalized, timeZone),
    end: localMidnightUtc(nextOperationalDate(normalized), timeZone),
  };
};

const normalizePaymentMethod = (value) => {
  const normalized = normalizeText(value).replace(/[\s_-]+/g, ' ');
  if (['cash', 'dinheiro', 'money'].includes(normalized)) return 'Dinheiro';
  if (normalized.startsWith('pix')) return 'Pix';
  if (normalized.includes('credito') || normalized.includes('credit')) {
    return 'Cartao de Credito';
  }
  if (normalized.includes('debito') || normalized.includes('debit')) {
    return 'Cartao de Debito';
  }
  return String(value || '').trim();
};

const isCashPayment = (value) => normalizePaymentMethod(value) === 'Dinheiro';

const isFinalizedOrder = (order = {}) => (
  normalizeText(order.status) === 'finalizado'
);

const isReceivedStatus = (status) => RECEIVED_STATUS_VALUES.has(
  normalizeText(status),
);

const isRefundedStatus = (status) => REFUNDED_STATUS_VALUES.has(
  normalizeText(status),
);

const assertSafeIntegerCents = (value, {allowZero = false} = {}) => {
  const parsed = typeof value === 'string' && /^-?\d+$/.test(value.trim()) ?
    Number(value) :
    value;
  if (!Number.isSafeInteger(parsed)) return null;
  if (allowZero ? parsed < 0 : parsed <= 0) return null;
  return parsed;
};

const moneyToCents = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/\s/g, '');
    if (!trimmed) return null;
    const normalized = trimmed.includes(',') ?
      trimmed.replace(/\./g, '').replace(',', '.') :
      trimmed;
    value = Number(normalized);
  }
  if (!Number.isFinite(value)) return null;
  const cents = Math.round((value + Number.EPSILON) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
};

const readMoneyCents = (
    source,
    centsFields = ['valorCentavos'],
    decimalFields = ['valor'],
) => {
  const record = source && typeof source === 'object' ? source : {};
  for (const field of centsFields) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
    const cents = assertSafeIntegerCents(record[field], {allowZero: true});
    if (cents !== null) return cents;
  }
  for (const field of decimalFields) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
    const cents = moneyToCents(record[field]);
    if (cents !== null) return cents;
  }
  return 0;
};

const recordOperationalDate = (
    record,
    directFields,
    timestampFields,
    timeZone,
) => {
  for (const field of directFields) {
    const normalized = normalizeOperationalDate(record?.[field]);
    if (normalized) return normalized;
  }
  for (const field of timestampFields) {
    const dateKey = datePartsInTimeZone(record?.[field], timeZone);
    if (dateKey) return dateKey;
  }
  return '';
};

const orderFinalizationOperationalDate = (
    order,
    timeZone = DEFAULT_TIME_ZONE,
) => recordOperationalDate(
  order,
  ['dataOperacionalFinalizacao'],
  ['finalizadoEm', 'finalizedAt', 'completedAt'],
  timeZone,
);

const paymentOperationalDate = (payment, fallbackDate, timeZone) => (
  recordOperationalDate(
    payment,
    ['dataOperacional'],
    ['recebidoEm', 'paidAt', 'receivedAt'],
    timeZone,
  ) || fallbackDate
);

const orderReceivedCashCents = (
    order,
    dateKey,
    timeZone = DEFAULT_TIME_ZONE,
) => {
  if (!isFinalizedOrder(order)) return 0;
  const finalizationDate = orderFinalizationOperationalDate(order, timeZone);
  if (finalizationDate !== dateKey) return 0;

  if (Array.isArray(order.pagamentos)) {
    return order.pagamentos.reduce((total, payment) => {
      if (!payment || !isCashPayment(payment.metodo || payment.method)) {
        return total;
      }
      if (!isReceivedStatus(payment.status)) return total;
      const receivedDate = paymentOperationalDate(
        payment,
        finalizationDate,
        timeZone,
      );
      if (receivedDate !== dateKey) return total;
      return total + readMoneyCents(
        payment,
        ['valorCentavos', 'amountCents'],
        ['valor', 'amount'],
      );
    }, 0);
  }

  if (!isCashPayment(order.formaPagamento || order.paymentMethod)) return 0;
  return readMoneyCents(
    order,
    ['totalCentavos', 'valorTotalCentavos'],
    ['total', 'valorTotal'],
  );
};

const calculateCashSalesCents = (
    orders,
    dateKey,
    timeZone = DEFAULT_TIME_ZONE,
) => (Array.isArray(orders) ? orders : []).reduce(
  (total, order) => total + orderReceivedCashCents(order, dateKey, timeZone),
  0,
);

const otherCashEntryCents = (
    entry,
    dateKey,
    timeZone = DEFAULT_TIME_ZONE,
) => {
  const linkedOrderFields = [
    'pedidoId',
    'orderId',
    'pedidoVendaId',
    'vendaId',
    'pedidoRef',
    'origemPedidoId',
  ];
  if (linkedOrderFields.some((field) => Boolean(entry?.[field]))) return 0;
  if (!isReceivedStatus(entry?.status)) return 0;
  if (!isCashPayment(entry?.metodo || entry?.formaPagamento)) return 0;
  const entryDate = recordOperationalDate(
    entry,
    ['dataOperacional', 'dataRecebimento'],
    ['recebidoEm', 'createdAt'],
    timeZone,
  );
  if (entryDate !== dateKey) return 0;
  return readMoneyCents(entry, ['valorCentavos'], ['valor']);
};

const calculateOtherCashEntriesCents = (
    entries,
    dateKey,
    timeZone = DEFAULT_TIME_ZONE,
) => (Array.isArray(entries) ? entries : []).reduce(
  (total, entry) => total + otherCashEntryCents(entry, dateKey, timeZone),
  0,
);

const isCashWithdrawal = (entry = {}) => (
  (
    entry.registroCaixa === true &&
    (
      normalizeText(entry.origem) === 'retirada_despesa_caixa' ||
      normalizeText(entry.tipo) === 'retirada_despesa_caixa' ||
      normalizeText(entry.origem) === 'retirada_para_despesa' ||
      normalizeText(entry.tipo) === 'retirada_para_despesa'
    )
  ) ||
  normalizeText(entry.origem) === 'retirada_caixa' ||
  normalizeText(entry.tipo) === 'retirada_caixa'
);

const cashWithdrawalCents = (
    entry,
    dateKey,
    timeZone = DEFAULT_TIME_ZONE,
) => {
  if (!isCashWithdrawal(entry) || !isReceivedStatus(entry.status)) return 0;
  const entryDate = recordOperationalDate(
    entry,
    ['dataOperacional', 'dataRetirada', 'dataPagamento'],
    ['registradoEm', 'createdAt'],
    timeZone,
  );
  if (entryDate !== dateKey) return 0;
  return readMoneyCents(entry, ['valorCentavos'], ['valor']);
};

const calculateCashWithdrawalsCents = (
    entries,
    dateKey,
    timeZone = DEFAULT_TIME_ZONE,
) => (Array.isArray(entries) ? entries : []).reduce(
  (total, entry) => total + cashWithdrawalCents(entry, dateKey, timeZone),
  0,
);

const effectiveCashRemovalCents = (record = {}) => {
  if (Number.isSafeInteger(record.valorAtualCentavos)) {
    return Math.max(0, record.valorAtualCentavos);
  }
  const base = readMoneyCents(
    record,
    ['valorOriginalCentavos', 'valorCentavos'],
    ['valorOriginal', 'valor'],
  );
  const adjustment = (Array.isArray(record.ajustes) ? record.ajustes : [])
    .reduce((total, item) => {
      const cents = Number.isSafeInteger(item?.deltaCentavos) ?
        item.deltaCentavos :
        moneyToCents(item?.delta);
      return total + (cents ?? 0);
    }, 0);
  return Math.max(0, base + adjustment);
};

const calculateCashRemovalsCents = (records, dateKey) => (
  (Array.isArray(records) ? records : []).reduce((total, record) => {
    if (normalizeOperationalDate(record?.dataOperacional) !== dateKey) {
      return total;
    }
    return total + effectiveCashRemovalCents(record);
  }, 0)
);

const cashRefundEntryCents = (
    refund,
    dateKey,
    timeZone = DEFAULT_TIME_ZONE,
) => {
  if (!isCashPayment(refund?.metodo || refund?.formaPagamento)) return 0;
  if (!isRefundedStatus(refund?.status)) return 0;
  const refundDate = recordOperationalDate(
    refund,
    ['dataOperacional', 'dataEstorno'],
    ['estornadoEm', 'refundedAt', 'createdAt'],
    timeZone,
  );
  if (refundDate !== dateKey) return 0;
  return readMoneyCents(
    refund,
    ['valorCentavos', 'amountCents'],
    ['valor', 'amount'],
  );
};

const calculateCashRefundsCents = (
    orders,
    dateKey,
    timeZone = DEFAULT_TIME_ZONE,
) => (Array.isArray(orders) ? orders : []).reduce((total, order) => {
  const refunds = Array.isArray(order?.estornos) ? order.estornos :
    (Array.isArray(order?.reembolsos) ? order.reembolsos : []);
  return total + refunds.reduce(
    (subtotal, refund) => subtotal + cashRefundEntryCents(
      refund,
      dateKey,
      timeZone,
    ),
    0,
  );
}, 0);

const calculateCashConference = ({
  initialCents = 0,
  cashSalesCents = 0,
  otherCashEntriesCents = 0,
  cashWithdrawalsCents = 0,
  cashRemovalsCents = 0,
  cashRefundsCents = 0,
  closingCents = null,
} = {}) => {
  const expectedCents = initialCents + cashSalesCents +
    otherCashEntriesCents - cashWithdrawalsCents -
    cashRemovalsCents - cashRefundsCents;
  const differenceCents = Number.isSafeInteger(closingCents) ?
    closingCents - expectedCents :
    null;
  return {expectedCents, differenceCents};
};

const normalizeIdempotencyKey = (value) => {
  const key = String(value || '').trim();
  if (key.length < 8 || key.length > 160) return '';
  return /^[A-Za-z0-9._:-]+$/.test(key) ? key : '';
};

const idempotencyDocumentId = (operation, uid, key) => crypto
  .createHash('sha256')
  .update(`${operation}:${uid}:${key}`)
  .digest('hex');

module.exports = {
  CASH_PERMISSION_KEYS,
  DEFAULT_TIME_ZONE,
  ROLE_ACCOUNTANT,
  ROLE_ATTENDANT,
  ROLE_CLIENT,
  ROLE_MANAGER,
  ROLE_OWNER,
  assertSafeIntegerCents,
  calculateCashConference,
  calculateCashRefundsCents,
  calculateCashRemovalsCents,
  calculateCashSalesCents,
  calculateCashWithdrawalsCents,
  calculateOtherCashEntriesCents,
  cashRefundEntryCents,
  cashWithdrawalCents,
  datePartsInTimeZone,
  defaultCashPermissions,
  effectiveCashRemovalCents,
  idempotencyDocumentId,
  isCashPayment,
  isCashWithdrawal,
  isFinalizedOrder,
  isReceivedStatus,
  moneyToCents,
  nextOperationalDate,
  normalizeIdempotencyKey,
  normalizeOperationalDate,
  normalizePaymentMethod,
  normalizeRole,
  operationalDayBounds,
  orderFinalizationOperationalDate,
  orderReceivedCashCents,
  readMoneyCents,
  resolveCashPermissions,
  sanitizeCashPermissions,
  timestampToDate,
};
