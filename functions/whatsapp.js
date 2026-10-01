/* global globalThis */
const {
  DEV_PROJECT_ID, STORE_ID_PATTERN, getRuntimeProjectId,
  parseConfiguration, accessTokenVersion,
} = require('./whatsapp-config');
const {buildTemplatePayload, sendCloudTemplate, failure} = require('./whatsapp-client');

// Backend-only factory. No Firebase trigger or callable is exported in phase 1.
// Dependencies are supplied by trusted server code, never by checkout input.
const createWhatsAppService = ({
  db,
  getProjectId = getRuntimeProjectId,
  fetchImpl = globalThis.fetch,
  createSecretClient = () => {
    const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
    return new SecretManagerServiceClient();
  },
} = {}) => {
  let secretClient;
  return {
    async sendTemplate({storeId, recipient, bodyParameters = [], expectedTemplate, expectedDelivery, correlationId} = {}) {
      try {
        if (getProjectId() !== DEV_PROJECT_ID) return failure('environment_blocked');
        if (typeof storeId !== 'string' || !STORE_ID_PATTERN.test(storeId)) {
          return failure('invalid_store');
        }
        let config;
        let rawConfig;
        try {
          // Root integrations tree is already denied to all Firestore clients.
          const snapshot = await db.doc(`integrations/whatsapp/stores/${storeId}`).get();
          rawConfig = snapshot.exists ? snapshot.data() : {};
          config = parseConfiguration(rawConfig);
        } catch (_) {
          return failure('configuration_unavailable');
        }
        if (config.mode === 'disabled') {
          return {status: 'skipped', code: 'disabled', retryable: false};
        }
        if (expectedDelivery && ((expectedDelivery.manual === true ? rawConfig.manualEnabled : rawConfig.automaticEnabled) !== true || config.mode !== expectedDelivery.mode ||
            (config.phoneNumberId || null) !== expectedDelivery.phoneNumberId)) {
          return failure('delivery_configuration_changed');
        }
        if (expectedTemplate && (config.templateName !== expectedTemplate.name ||
            config.templateLanguage !== expectedTemplate.language)) {
          return failure('template_mismatch');
        }
        let payload;
        try {
          payload = buildTemplatePayload(config, recipient, bodyParameters);
          if (correlationId !== undefined) {
            if (typeof correlationId !== 'string' || !/^[a-f0-9-]{36}$/.test(correlationId)) throw new Error('invalid_correlation');
            payload.biz_opaque_callback_data = correlationId;
          }
        } catch (_) {
          return failure('invalid_message');
        }
        if (config.mode === 'mock') {
          return {status: 'simulated', code: 'mock_only', retryable: false};
        }
        if (!config.allowedRecipients.includes(recipient)) return failure('recipient_not_allowed');
        let token;
        try {
          if (!secretClient) secretClient = createSecretClient();
          const [version] = await secretClient.accessSecretVersion({
            name: accessTokenVersion(storeId),
          }, {timeout: config.timeoutMs, retry: null});
          token = version.payload?.data?.toString('utf8') || '';
        } catch (_) {
          return failure('credential_unavailable');
        }
        return await sendCloudTemplate({config, payload, token, fetchImpl});
      } catch (_) {
        return failure('internal_error');
      }
    },
  };
};

module.exports = {createWhatsAppService};
