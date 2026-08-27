const crypto = require('crypto');
const net = require('net');

const FOOD99_ENVIRONMENTS = Object.freeze({
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
});

const CURRENT_FOOD99_HOST = 'https://openapi.99food.com';
const LEGACY_FOOD99_HOST = 'https://openapi.didi-food.com';
const FOOD99_ALLOWED_API_ORIGINS = Object.freeze([CURRENT_FOOD99_HOST]);
const CATALOG_UPLOAD_WINDOW_MS = 60 * 1000;
const CATALOG_UPLOAD_SAFETY_MS = 5 * 1000;

const cleanText = (value) => String(value == null ? '' : value).trim();

const safeKeyPart = (value, fallback = 'none') => {
  const normalized = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
};

const normalizeFood99Environment = (value, fallback = FOOD99_ENVIRONMENTS.DEVELOPMENT) => {
  const normalized = cleanText(value).toLowerCase();
  if (['development', 'dev', 'sandbox', 'test', 'teste', 'testing', 'homologacao', 'homologação'].includes(normalized)) {
    return FOOD99_ENVIRONMENTS.DEVELOPMENT;
  }
  if (['production', 'prod', 'producao', 'produção'].includes(normalized)) {
    return FOOD99_ENVIRONMENTS.PRODUCTION;
  }
  return fallback;
};

const normalizeBaseUrl = (value) => {
  try {
    const url = new URL(cleanText(value));
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.origin}${url.pathname === '/' ? '' : url.pathname}`;
  } catch (error) {
    return '';
  }
};

const normalizeHostname = (value) => cleanText(value).toLowerCase().replace(/^\[|\]$/g, '');

const isPrivateIpv4 = (hostname) => {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && c === 0)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
};

const isPrivateIpv6 = (hostname) => {
  const normalized = normalizeHostname(hostname);
  if (normalized === '::' || normalized === '::1') return true;
  if (/^(?:fc|fd)[0-9a-f]{2}:/i.test(normalized) || /^fe[89ab][0-9a-f]:/i.test(normalized)) return true;
  const mappedIpv4 = normalized.match(/^(?:0*:){2,}ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  return mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false;
};

const isLocalOrMetadataHostname = (value) => {
  const hostname = normalizeHostname(value);
  if (!hostname) return true;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (hostname === 'metadata' || hostname.startsWith('metadata.')) return true;
  if (hostname === 'metadata.google.internal' || hostname.endsWith('.metadata.google.internal')) return true;
  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) return isPrivateIpv4(hostname);
  if (ipVersion === 6) return isPrivateIpv6(hostname);
  return !hostname.includes('.');
};

const validateFood99ApiBaseUrl = (value) => {
  const normalized = normalizeBaseUrl(value);
  if (!normalized || !FOOD99_ALLOWED_API_ORIGINS.includes(normalized)) return '';
  try {
    const url = new URL(normalized);
    return isLocalOrMetadataHostname(url.hostname) ? '' : normalized;
  } catch (error) {
    return '';
  }
};

const validatePublicWebhookUrl = (value) => {
  try {
    const url = new URL(cleanText(value));
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return '';
    if (isLocalOrMetadataHostname(url.hostname)) return '';
    return `${url.origin}${url.pathname === '/' ? '' : url.pathname}${url.search}`;
  } catch (error) {
    return '';
  }
};

// Test and Production currently share the same approved OpenAPI origin. Saved
// values are honored only after exact allowlist validation, so a Firestore
// mutation can never redirect credentials to an arbitrary or retired host.
const resolveFood99BaseUrl = ({savedUrl} = {}) => validateFood99ApiBaseUrl(savedUrl) || CURRENT_FOOD99_HOST;

const isAllowedFood99ApiUrl = (value) => Boolean(validateFood99ApiBaseUrl(value));

const isNonEmptySignatureValue = (value) => (
  value !== undefined
  && value !== null
  && (typeof value === 'object' || cleanText(value) !== '')
);

const signatureValue = (value) => (
  typeof value === 'object' && value !== null ? 'Array' : String(value)
);

const nonEmptyParams = (params = {}) => Object.entries(params)
  .filter(([key, value]) => key !== 'sign' && isNonEmptySignatureValue(value))
  .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

const food99SignatureInput = (params = {}, appSecret = '') => (
  `${nonEmptyParams(params).map(([key, value]) => `${key}=${signatureValue(value)}`).join('&')}${String(appSecret || '')}`
);

const signFood99Params = (params = {}, appSecret = '') => crypto
  .createHash('md5')
  .update(food99SignatureInput(params, appSecret), 'utf8')
  .digest('hex');

const signFood99Webhook = (rawBody, appSecret = '') => {
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  return crypto.createHash('md5').update(raw).update(String(appSecret || ''), 'utf8').digest('hex');
};

const readJsonStringToken = (source, start) => {
  if (source[start] !== '"') return null;
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character !== '"') continue;
    const raw = source.slice(start, index + 1);
    try {
      return {end: index + 1, value: JSON.parse(raw)};
    } catch (error) {
      return null;
    }
  }
  return null;
};

// Express parses JSON numbers as IEEE-754 values. 99Food sends app_id as an
// unquoted 64-bit integer, so reading request.body can silently change it.
// Extracting the scalar from the authenticated raw body keeps every digit.
const extractFood99AppIdFromRawBody = (rawBody) => {
  const source = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  const values = [];
  for (let index = 0; index < source.length;) {
    if (source[index] !== '"') {
      index += 1;
      continue;
    }
    const keyToken = readJsonStringToken(source, index);
    if (!keyToken) return '';
    index = keyToken.end;
    let cursor = index;
    while (/\s/.test(source[cursor] || '')) cursor += 1;
    if (!['app_id', 'appId'].includes(keyToken.value) || source[cursor] !== ':') continue;
    cursor += 1;
    while (/\s/.test(source[cursor] || '')) cursor += 1;
    let value = '';
    if (source[cursor] === '"') {
      const valueToken = readJsonStringToken(source, cursor);
      value = valueToken ? cleanText(valueToken.value) : '';
      index = valueToken?.end || cursor + 1;
    } else {
      value = source.slice(cursor).match(/^\d+/)?.[0] || '';
      index = cursor + Math.max(1, value.length);
    }
    if (/^\d+$/.test(value)) values.push(value);
  }
  const distinct = dedupeIds(values);
  return distinct.length === 1 ? distinct[0] : '';
};

// JSON.parse converts integers larger than Number.MAX_SAFE_INTEGER before the
// webhook handler can inspect them. Preserve those scalars as strings while
// leaving the authenticated raw bytes untouched for signature verification.
const parseFood99JsonPreservingLargeIntegers = (rawBody) => {
  const source = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  let transformed = '';
  for (let index = 0; index < source.length;) {
    if (source[index] === '"') {
      const token = readJsonStringToken(source, index);
      if (!token) throw new SyntaxError('Invalid JSON string token.');
      transformed += source.slice(index, token.end);
      index = token.end;
      continue;
    }
    const numericToken = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!numericToken) {
      transformed += source[index];
      index += 1;
      continue;
    }
    const rendered = numericToken[0];
    const isInteger = !/[.eE]/.test(rendered);
    const unsafeInteger = isInteger && !Number.isSafeInteger(Number(rendered));
    transformed += unsafeInteger ? JSON.stringify(rendered) : rendered;
    index += rendered.length;
  }
  return JSON.parse(transformed);
};

const findBoundFood99Shop = (shops, merchantId) => {
  const target = cleanText(merchantId);
  if (!target) return null;
  const match = (Array.isArray(shops) ? shops : []).find((shop) => (
    cleanText(shop?.app_shop_id || shop?.appShopId) === target
    && (Number(shop?.bound_flag ?? shop?.boundFlag) === 1 || shop?.bound_flag === true || shop?.boundFlag === true)
  ));
  if (!match) return null;
  return {
    appShopId: target,
    name: cleanText(match.shop_name || match.shopName),
  };
};

const constantTimeEqual = (left, right) => {
  const leftBuffer = Buffer.from(cleanText(left).toLowerCase(), 'utf8');
  const rightBuffer = Buffer.from(cleanText(right).toLowerCase(), 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const validateAuthorizationUrl = (value) => {
  try {
    const url = new URL(cleanText(value));
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    const hostname = url.hostname.toLowerCase();
    const allowed = [
      '99app.com',
      '99food.com',
      'didi-food.com',
      'didiglobal.com',
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    return allowed ? url.toString() : '';
  } catch (error) {
    return '';
  }
};

const FOOD99_ERROR_CLASSIFICATIONS = Object.freeze({
  10101: {cause: 'authorization_missing', status: 'awaiting_authorization', retryable: false, suspend: true},
  10102: {cause: 'token_expired', status: 'connecting', retryable: true, suspend: false},
  14105: {cause: 'credentials_invalid', status: 'credentials_invalid', retryable: false, suspend: true},
  14106: {cause: 'credentials_invalid', status: 'credentials_invalid', retryable: false, suspend: true},
});

const endpointPath = (value) => {
  const withoutMethod = cleanText(value).replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, '');
  try {
    return new URL(withoutMethod).pathname.replace(/\/+$/, '') || '/';
  } catch (error) {
    return withoutMethod.split('?')[0].replace(/\/+$/, '') || '/';
  }
};

const isCatalogUploadRateLimit = ({errno, endpoint, errmsg, message} = {}) => (
  Number(errno || 0) === 10005
  && endpointPath(endpoint) === '/v3/item/item/upload'
  && /calling frequency exceeds/i.test(cleanText(errmsg || message))
);

const providerFailure = (errno) => ({
  cause: 'provider_failure',
  status: 'offline',
  retryable: false,
  suspend: false,
  errno: Number(errno || 0) || null,
});

const classifyFood99Failure = ({errno, httpStatus, endpoint, errmsg, message} = {}) => {
  const numericErrno = Number(errno || 0);
  if (numericErrno === 10005) {
    if (isCatalogUploadRateLimit({errno, endpoint, errmsg, message})) {
      return {cause: 'rate_limited', status: 'degraded', retryable: true, suspend: false, errno: numericErrno};
    }
    return providerFailure(numericErrno);
  }
  if (FOOD99_ERROR_CLASSIFICATIONS[numericErrno]) {
    return {...FOOD99_ERROR_CLASSIFICATIONS[numericErrno], errno: numericErrno};
  }
  const status = Number(httpStatus || 0);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) {
    return {cause: 'transient_http', status: 'degraded', retryable: true, suspend: false, errno: numericErrno || null};
  }
  return providerFailure(numericErrno);
};

const friendlyFood99Error = ({
  errno,
  requestId = '',
  endpoint = '',
  errmsg = '',
  message: providerMessage = '',
} = {}) => {
  const numericErrno = Number(errno || 0);
  let message = 'Não foi possível concluir a comunicação com a 99Food.';
  if (numericErrno === 14106 || numericErrno === 14105) {
    message = 'App ID/App Secret inválidos para o ambiente selecionado; em endpoints assinados, confira também a assinatura.';
  } else if (numericErrno === 10101) {
    message = 'A loja ainda não autorizou este aplicativo no ambiente selecionado.';
  } else if (numericErrno === 10102) {
    message = 'O token da loja expirou e precisa ser renovado.';
  } else if (isCatalogUploadRateLimit({errno, endpoint, errmsg, message: providerMessage})) {
    message = 'A 99Food limitou temporariamente a frequência desta operação.';
  }
  const technical = [
    numericErrno ? `errno ${numericErrno}` : '',
    requestId ? `requestId ${cleanText(requestId)}` : '',
    endpoint ? `endpoint ${cleanText(endpoint)}` : '',
  ].filter(Boolean).join(', ');
  return technical ? `${message} (${technical})` : message;
};

const tokenCacheKey = ({environment, lojaId, appKey, merchantId} = {}) => [
  normalizeFood99Environment(environment),
  safeKeyPart(lojaId),
  safeKeyPart(appKey),
  safeKeyPart(merchantId),
].join(':');

const environmentDocId = (prefix, environment, ...parts) => [
  safeKeyPart(prefix),
  normalizeFood99Environment(environment),
  ...parts.map((part) => safeKeyPart(part)),
].join('__').slice(0, 240);

const mappingDocId = (environment, productId) => environmentDocId('mapping', environment, productId);

const catalogQueueKey = ({environment, appKey} = {}) => environmentDocId('catalog_upload', environment, appKey);

const lockKey = ({environment, appKey, lojaId = 'global', operation} = {}) => environmentDocId(
  'lock',
  environment,
  appKey,
  lojaId,
  operation
);

const alertFingerprint = ({integration = 'food99', lojaId, environment, endpoint, errno, cause} = {}) => crypto
  .createHash('sha256')
  .update([
    safeKeyPart(integration),
    safeKeyPart(lojaId),
    normalizeFood99Environment(environment),
    cleanText(endpoint).toLowerCase(),
    String(Number(errno || 0)),
    safeKeyPart(cause),
  ].join('|'))
  .digest('hex')
  .slice(0, 32);

const jitteredBackoffMs = (attempt, {
  baseMs = 500,
  capMs = 30 * 1000,
  random = Math.random,
} = {}) => {
  const exponent = Math.max(0, Number(attempt) || 0);
  const ceiling = Math.min(capMs, baseMs * (2 ** exponent));
  return Math.max(1, Math.round(ceiling * (0.5 + (Math.max(0, Math.min(1, random())) * 0.5))));
};

const nextCatalogAttemptAt = (nowMs = Date.now(), random = Math.random) => {
  const jitterMs = Math.round(Math.max(0, Math.min(1, random())) * 10 * 1000);
  return Number(nowMs) + CATALOG_UPLOAD_WINDOW_MS + CATALOG_UPLOAD_SAFETY_MS + jitterMs;
};

const shouldRefreshToken = ({errno, expiresAtMs, hasPersistedToken, authorizationStatus} = {}) => {
  if (!hasPersistedToken || authorizationStatus !== 'authorized') return false;
  if (Number(errno || 0) === 10102) return true;
  return Number(expiresAtMs || 0) > 0 && Number(expiresAtMs) <= Date.now();
};

const canRunAuthorizedOperation = (config = {}) => Boolean(
  config.enabled
  && config.credentialsReady
  && config.merchantId
  && config.authorizationStatus === 'authorized'
);

const dedupeIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : []).map(cleanText).filter(Boolean)
));

const SENSITIVE_KEYS = new Set([
  'clientid',
  'client_id',
  'clientidmasked',
  'clientidfingerprint',
  'clientidsecretversion',
  'clientidsuffix',
  'appid',
  'app_id',
  'appidsuffix',
  'clientsecret',
  'client_secret',
  'clientsecretmasked',
  'clientsecretfingerprint',
  'clientsecretsecretversion',
  'webhooksecret',
  'webhooksecretmasked',
  'webhooksecretfingerprint',
  'webhooksecretversion',
  'appsecret',
  'app_secret',
  'authtoken',
  'auth_token',
  'token',
  'tokensecretversion',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'authorization',
  'didi-header-sign',
  'didiheadersign',
  'sign',
  'signature',
]);

const isPlainObject = (value) => {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const sanitizeObject = (input, blockedKeys = new Set(), seen = new WeakSet()) => {
  if (Array.isArray(input)) return input.map((value) => sanitizeObject(value, blockedKeys, seen));
  if (!isPlainObject(input)) return input;
  if (seen.has(input)) return '[circular]';
  seen.add(input);
  const result = Object.entries(input).reduce((safe, [key, value]) => {
    const normalizedKey = key.toLowerCase();
    if (!SENSITIVE_KEYS.has(normalizedKey) && !blockedKeys.has(normalizedKey)) {
      safe[key] = sanitizeObject(value, blockedKeys, seen);
    }
    return safe;
  }, {});
  seen.delete(input);
  return result;
};

const secretSafePublicConfig = (input = {}) => sanitizeObject(input);

const LOG_CONTENT_KEYS = new Set([
  'body',
  'payload',
  'headers',
  'query',
  'params',
  'rawbody',
  'response',
]);

const sanitizeLogContext = (input = {}) => sanitizeObject(input, LOG_CONTENT_KEYS);

module.exports = {
  CATALOG_UPLOAD_SAFETY_MS,
  CATALOG_UPLOAD_WINDOW_MS,
  CURRENT_FOOD99_HOST,
  FOOD99_ALLOWED_API_ORIGINS,
  FOOD99_ENVIRONMENTS,
  LEGACY_FOOD99_HOST,
  alertFingerprint,
  canRunAuthorizedOperation,
  catalogQueueKey,
  classifyFood99Failure,
  constantTimeEqual,
  dedupeIds,
  environmentDocId,
  extractFood99AppIdFromRawBody,
  findBoundFood99Shop,
  food99SignatureInput,
  friendlyFood99Error,
  isAllowedFood99ApiUrl,
  isLocalOrMetadataHostname,
  isCatalogUploadRateLimit,
  jitteredBackoffMs,
  lockKey,
  mappingDocId,
  nextCatalogAttemptAt,
  nonEmptyParams,
  normalizeFood99Environment,
  parseFood99JsonPreservingLargeIntegers,
  resolveFood99BaseUrl,
  safeKeyPart,
  sanitizeLogContext,
  secretSafePublicConfig,
  shouldRefreshToken,
  signFood99Params,
  signFood99Webhook,
  tokenCacheKey,
  validateAuthorizationUrl,
  validateFood99ApiBaseUrl,
  validatePublicWebhookUrl,
};
