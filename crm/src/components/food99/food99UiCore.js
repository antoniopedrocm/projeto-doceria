export const FOOD99_ENVIRONMENTS = Object.freeze({
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
});

export const normalizeFood99Environment = (value, fallback = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['development', 'dev', 'sandbox', 'test', 'teste', 'homologacao', 'homologação'].includes(normalized)) {
    return FOOD99_ENVIRONMENTS.DEVELOPMENT;
  }
  if (['production', 'prod', 'producao', 'produção'].includes(normalized)) {
    return FOOD99_ENVIRONMENTS.PRODUCTION;
  }
  return fallback;
};

export const food99EnvironmentLabel = (environment) => (
  normalizeFood99Environment(environment) === FOOD99_ENVIRONMENTS.PRODUCTION
    ? 'Produção'
    : 'Desenvolvimento (app Test oficial)'
);

const recordEnvironment = (record = {}) => normalizeFood99Environment(
  record.environment
  || record.food99Environment
  || record.providerEnvironment
  || record.context?.environment
  || record.details?.environment
);

export const isFood99RecordInEnvironment = (record, selectedEnvironment) => {
  const selected = normalizeFood99Environment(selectedEnvironment, FOOD99_ENVIRONMENTS.DEVELOPMENT);
  const stored = recordEnvironment(record);
  // Registros anteriores à separação de ambiente pertencem ao legado de produção.
  return stored ? stored === selected : selected === FOOD99_ENVIRONMENTS.PRODUCTION;
};

export const filterFood99RecordsByEnvironment = (records, selectedEnvironment) => (
  (Array.isArray(records) ? records : []).filter((record) => (
    isFood99RecordInEnvironment(record, selectedEnvironment)
  ))
);

const healthTimestampMillis = (record = {}) => {
  const value = record.updatedAt || record.authValidatedAt || record.lastAuthorizationCheckAt;
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const seconds = Number(value.seconds ?? value._seconds);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const newestHealthRecord = (records = []) => records.reduce((newest, record) => {
  if (!newest) return record;
  return healthTimestampMillis(record) > healthTimestampMillis(newest) ? record : newest;
}, null);

export const selectFood99HealthRecord = (records, selectedEnvironment, remoteHealth = null) => {
  const environment = normalizeFood99Environment(selectedEnvironment, FOOD99_ENVIRONMENTS.DEVELOPMENT);
  const scopedId = `status_${environment}`;
  const filtered = filterFood99RecordsByEnvironment(records, environment);
  const exact = filtered.filter((record) => record?.id === scopedId || recordEnvironment(record) === environment);
  if (remoteHealth && recordEnvironment(remoteHealth) === environment) exact.push(remoteHealth);
  const current = newestHealthRecord(exact);
  if (current) return current;
  if (environment === FOOD99_ENVIRONMENTS.PRODUCTION) {
    return filtered.find((record) => record?.id === 'status') || remoteHealth || null;
  }
  return remoteHealth && recordEnvironment(remoteHealth) === environment ? remoteHealth : null;
};

const AUTHORIZATION_STATUS_ALIASES = Object.freeze({
  not_configured: 'not_configured',
  unconfigured: 'not_configured',
  inactive: 'not_configured',
  configuration_incomplete: 'configuration_incomplete',
  incomplete: 'configuration_incomplete',
  awaiting_authorization: 'awaiting_authorization',
  pending: 'awaiting_authorization',
  pending_authorization: 'awaiting_authorization',
  connecting: 'connecting',
  authorized: 'authorized',
  connected: 'authorized',
  online: 'authorized',
  credentials_invalid: 'credentials_invalid',
  invalid_credentials: 'credentials_invalid',
  degraded: 'degraded',
  offline: 'offline',
});

export const normalizeFood99AuthorizationStatus = (value, fallback = 'not_configured') => {
  const normalized = String(value || '').trim().toLowerCase();
  return AUTHORIZATION_STATUS_ALIASES[normalized] || fallback;
};

export const FOOD99_AUTHORIZATION_STATUS_META = Object.freeze({
  not_configured: {label: 'Não configurada', tone: 'neutral'},
  configuration_incomplete: {label: 'Configuração incompleta', tone: 'warning'},
  awaiting_authorization: {label: 'Aguardando autorização', tone: 'warning'},
  connecting: {label: 'Conectando', tone: 'info'},
  authorized: {label: 'Conectada', tone: 'success'},
  credentials_invalid: {label: 'Credenciais inválidas', tone: 'danger'},
  degraded: {label: 'Degradada', tone: 'warning'},
  offline: {label: 'Offline', tone: 'danger'},
});

export const food99AuthorizationStatusMeta = (status) => {
  const normalized = normalizeFood99AuthorizationStatus(status);
  return {id: normalized, ...FOOD99_AUTHORIZATION_STATUS_META[normalized]};
};

export const resolveFood99AuthorizationStatus = (config = {}, health = {}) => {
  const explicitCandidates = [
    health.status,
    health.authorizationStatus,
    config.authorizationStatus,
  ];
  for (const candidate of explicitCandidates) {
    const normalized = String(candidate || '').trim().toLowerCase();
    if (AUTHORIZATION_STATUS_ALIASES[normalized]) return AUTHORIZATION_STATUS_ALIASES[normalized];
  }
  if (!config.credentialsReady) return 'configuration_incomplete';
  if (!config.merchantId) return 'configuration_incomplete';
  return 'awaiting_authorization';
};

export const canRunFood99Operations = (authorizationStatus) => (
  normalizeFood99AuthorizationStatus(authorizationStatus) === 'authorized'
);

const cleanText = (value) => String(value || '').trim();

// Whitelist intencional: nenhum valor mascarado ou referência de segredo entra no estado React.
export const sanitizeFood99PlatformConfig = (input = {}, selectedEnvironment = FOOD99_ENVIRONMENTS.DEVELOPMENT) => ({
  environment: normalizeFood99Environment(input.environment, normalizeFood99Environment(selectedEnvironment, FOOD99_ENVIRONMENTS.DEVELOPMENT)),
  effectiveApiBaseUrl: cleanText(input.effectiveApiBaseUrl || input.platformApiBaseUrl || input.apiBaseUrl),
  effectiveAuthUrl: cleanText(input.effectiveAuthUrl || input.platformAuthUrl || input.authUrl),
  webhookUrl: cleanText(input.webhookUrl),
  webhookEnabled: Boolean(input.webhookEnabled),
  inventoryEndpointTemplate: cleanText(input.inventoryEndpointTemplate),
  inventoryMethod: cleanText(input.inventoryMethod || 'POST').toUpperCase(),
  credentialsReady: Boolean(input.credentialsReady),
  clientIdReady: Boolean(input.clientIdReady),
  clientSecretReady: Boolean(input.clientSecretReady),
  webhookSecretReady: Boolean(input.webhookSecretReady),
});

const PLATFORM_DRAFT_FIELDS = [
  'effectiveApiBaseUrl',
  'effectiveAuthUrl',
  'webhookUrl',
  'webhookEnabled',
  'inventoryEndpointTemplate',
  'inventoryMethod',
];

export const isFood99PlatformConfigDirty = (current = {}, baseline = {}) => PLATFORM_DRAFT_FIELDS.some((field) => (
  current[field] !== baseline[field]
));

const isHttpsDraftUrl = (value) => {
  try {
    const url = new URL(cleanText(value));
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch (error) {
    return false;
  }
};

export const isValidFood99PlatformDraft = (draft = {}) => (
  isHttpsDraftUrl(draft.effectiveApiBaseUrl)
  && isHttpsDraftUrl(draft.effectiveAuthUrl)
  && isHttpsDraftUrl(draft.webhookUrl)
);

export const sanitizeFood99StoreConfig = (input = {}, selectedEnvironment = FOOD99_ENVIRONMENTS.DEVELOPMENT) => ({
  merchantId: cleanText(input.merchantId),
  merchantName: cleanText(input.merchantName),
  environment: normalizeFood99Environment(input.environment, normalizeFood99Environment(selectedEnvironment, FOOD99_ENVIRONMENTS.DEVELOPMENT)),
  enabled: Boolean(input.enabled),
  pollingEnabled: input.pollingEnabled !== false,
  ordersSyncEnabled: input.ordersSyncEnabled !== false,
  stockSyncEnabled: input.stockSyncEnabled !== false,
  catalogSyncEnabled: input.catalogSyncEnabled !== false,
  autoConfirm: input.autoConfirm !== false,
  autoStartPreparation: Boolean(input.autoStartPreparation),
  credentialsReady: Boolean(input.credentialsReady),
  platformCredentialsReady: Boolean(input.platformCredentialsReady),
  credentialScope: cleanText(input.credentialScope),
  platformWebhookSecretReady: Boolean(input.platformWebhookSecretReady),
  authorizationStatus: input.authorizationStatus
    ? normalizeFood99AuthorizationStatus(input.authorizationStatus)
    : '',
  effectiveApiBaseUrl: cleanText(input.effectiveApiBaseUrl || input.apiBaseUrl),
  effectiveAuthUrl: cleanText(input.effectiveAuthUrl || input.authUrl),
  queue: input.queue && typeof input.queue === 'object' ? {...input.queue} : {},
});

export const food99QueueNextAt = (queue = {}) => (
  queue.nextAllowedAt
  || queue.nextRunAt
  || queue.scheduledFor
  || queue.nextWindowAt
  || null
);

export const isFood99PublishQueued = (result = {}) => {
  const status = String(result.status || result.queueStatus || '').toLowerCase();
  return Boolean(result.queued || result.scheduled || ['queued', 'scheduled', 'pending', 'submitted'].includes(status));
};
