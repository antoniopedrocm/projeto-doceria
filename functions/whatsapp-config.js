const DEV_PROJECT_ID = 'crmdoceria-9959e';
const STORE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;
// Transport format only. Brazilian phone validation belongs to the checkout phase.
const RECIPIENT_PATTERN = /^[1-9][0-9]{7,14}$/;
const ORDER_STORE_TO_INTEGRATION = Object.freeze({
  'ana-guimaraes-doceria-matriz': 'matriz',
});
const integrationStoreIdFor = (orderStoreId) => ORDER_STORE_TO_INTEGRATION[orderStoreId] || orderStoreId;

const getRuntimeProjectId = (env = process.env) => {
  const ids = [env.GCLOUD_PROJECT, env.GCP_PROJECT];
  try {
    if (env.FIREBASE_CONFIG) ids.push(JSON.parse(env.FIREBASE_CONFIG).projectId);
  } catch (_) {
    return '';
  }
  const present = ids.filter(Boolean);
  return present.length && present.every((id) => id === present[0]) ? present[0] : '';
};

const parseConfiguration = (raw = {}) => {
  if (raw.enabled === undefined || raw.enabled === false) return {mode: 'disabled'};
  if (raw.enabled !== true || !['mock', 'cloud'].includes(raw.mode)) {
    throw new Error('invalid_configuration');
  }
  if (typeof raw.templateName !== 'string' || typeof raw.templateLanguage !== 'string' ||
      !/^[a-z0-9_]{1,512}$/.test(raw.templateName) ||
      !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(raw.templateLanguage)) {
    throw new Error('invalid_configuration');
  }
  const timeoutMs = raw.timeoutMs === undefined ? 10000 : raw.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new Error('invalid_configuration');
  }
  if (raw.mode === 'cloud' && (
    typeof raw.apiVersion !== 'string' || typeof raw.phoneNumberId !== 'string' ||
    !/^v[1-9][0-9]{0,2}\.0$/.test(raw.apiVersion) ||
    !/^[0-9]{1,30}$/.test(raw.phoneNumberId) ||
    !Array.isArray(raw.allowedRecipients) || !raw.allowedRecipients.length ||
    raw.allowedRecipients.length > 20 ||
    !raw.allowedRecipients.every((phone) => typeof phone === 'string' && RECIPIENT_PATTERN.test(phone))
  )) throw new Error('invalid_configuration');

  return Object.freeze({
    mode: raw.mode,
    templateName: raw.templateName,
    templateLanguage: raw.templateLanguage,
    timeoutMs,
    apiVersion: raw.apiVersion,
    phoneNumberId: raw.phoneNumberId,
    allowedRecipients: Object.freeze([...(raw.allowedRecipients || [])]),
  });
};

const accessTokenVersion = (storeId) => {
  if (!STORE_ID_PATTERN.test(storeId)) throw new Error('invalid_store');
  return `projects/${DEV_PROJECT_ID}/secrets/whatsapp-dev-${storeId}-access-token/versions/latest`;
};

module.exports = {
  DEV_PROJECT_ID, STORE_ID_PATTERN, RECIPIENT_PATTERN,
  getRuntimeProjectId, parseConfiguration, accessTokenVersion, integrationStoreIdFor,
};
