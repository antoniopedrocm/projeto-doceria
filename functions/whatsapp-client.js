/* global globalThis */
const {RECIPIENT_PATTERN} = require('./whatsapp-config');

const failure = (code, extra = {}) => ({status: 'failed', code, retryable: false, ...extra});
const uncertain = (code, extra = {}) => ({
  status: 'unknown', code, retryable: false, ...extra,
});

const buildTemplatePayload = (config, recipient, bodyParameters = []) => {
  if (typeof recipient !== 'string' || !RECIPIENT_PATTERN.test(recipient) ||
      !Array.isArray(bodyParameters) || bodyParameters.length > 30 ||
      !bodyParameters.every((text) => typeof text === 'string' && text.trim().length > 0 &&
        text.length <= 1024 && !/[\r\n\t\x00-\x1f]/.test(text))) {
    throw new Error('invalid_message');
  }
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {name: config.templateName, language: {code: config.templateLanguage}},
  };
  if (bodyParameters.length) {
    payload.template.components = [{
      type: 'body', parameters: bodyParameters.map((text) => ({type: 'text', text})),
    }];
  }
  return payload;
};

const retryDelay = (value) => {
  if (!value) return null;
  const millis = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(millis) && millis >= 0 ? Math.min(millis, 86400000) : null;
};

// Single attempt only. The future durable worker owns retries and reconciliation.
const sendCloudTemplate = async ({config, payload, token, fetchImpl = globalThis.fetch}) => {
  if (typeof token !== 'string' || !token.length || token.length > 8192 || /\s/.test(token)) {
    return failure('credential_invalid');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(
        `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'},
          body: JSON.stringify(payload),
        });
    // Keep the deadline active while consuming the response body as well.
    let body;
    try {
      body = await response.json();
    } catch (_) {
      return uncertain(controller.signal.aborted ? 'timeout' : 'invalid_response', {
        httpStatus: response.status,
      });
    }
    const metaCode = Number.isSafeInteger(body?.error?.code) ? body.error.code : null;
    if (response.ok) {
      const id = body?.messages?.[0]?.id;
      if (body?.error || body?.messaging_product !== 'whatsapp' ||
          body?.messages?.length !== 1 || typeof id !== 'string' ||
          !/^wamid\.[a-zA-Z0-9_+=/-]{1,500}$/.test(id)) {
        return uncertain('invalid_response', {httpStatus: response.status});
      }
      return {status: 'accepted', code: 'meta_accepted', retryable: false, messageId: id};
    }
    const details = {httpStatus: response.status, metaCode};
    // A server failure may happen after acceptance: never blindly repeat it.
    if (response.status >= 500 || response.status === 408) {
      return uncertain('provider_uncertain', details);
    }
    if (response.status === 429 && metaCode !== null) {
      return failure('rate_limited', {
        ...details, retryable: true, retryAfterMs: retryDelay(response.headers.get('retry-after')),
      });
    }
    if (response.status >= 400 && response.status < 500 && metaCode !== null) {
      return failure('provider_rejected', details);
    }
    return uncertain('invalid_response', details);
  } catch (_) {
    // Never return raw exceptions, request headers, token, recipient or Meta text.
    return uncertain(controller.signal.aborted ? 'timeout' : 'network_error');
  } finally {
    clearTimeout(timer);
  }
};

module.exports = {buildTemplatePayload, sendCloudTemplate, failure};
