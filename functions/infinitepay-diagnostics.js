const crypto = require('node:crypto');
const {STATUS_CODES} = require('node:http');

const MAX_BODY_BYTES = 4096;
const SAFE_FIELDS = new Set(['handle', 'items', 'quantity', 'price', 'description', 'order_nsu',
  'redirect_url', 'webhook_url', 'customer', 'name', 'email', 'phone_number', 'address',
  'cep', 'street', 'number', 'neighborhood', 'complement']);
const SAFE_ERROR_CODES = new Set(['invalid_handle', 'checkout_not_enabled', 'checkout_disabled',
  'invalid_payload', 'validation_error', 'invalid_customer', 'invalid_phone_number',
  'invalid_url', 'internal_server_error']);
const SAFE_NETWORK_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED',
  'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID']);

async function readErrorBody(response) {
  // Consume a bounded sample only; the existing fetch deadline covers body reads too.
  if (!response.body?.getReader) return {text: '', bytes: 0, truncated: false};
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  let done = false;
  try {
    while (bytes < MAX_BODY_BYTES) {
      const next = await reader.read();
      if (next.done) {done = true; break;}
      const chunk = Buffer.from(next.value.subarray(0, MAX_BODY_BYTES - bytes));
      bytes += chunk.length;
      chunks.push(chunk);
    }
    return {text: Buffer.concat(chunks).toString('utf8'), bytes, truncated: !done};
  } finally {
    if (!done) reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function summarizeBody(sample) {
  // Never log arbitrary provider prose, echoed payloads, HTML, URLs or identifiers.
  // Unknown messages are deliberately omitted instead of relying on PII regexes.
  const summary = {sampleBytes: sample.bytes, truncated: sample.truncated, rawOmitted: true};
  let parsed;
  try {parsed = JSON.parse(sample.text); summary.format = 'json';} catch {
    summary.format = sample.text ? 'text' : 'empty';
    return summary;
  }
  const codes = new Set();
  const fields = new Set();
  const signals = new Set();
  const visit = (value, depth = 0) => {
    if (!value || depth > 4 || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (SAFE_FIELDS.has(key)) fields.add(key);
      if (['code', 'error_code', 'error'].includes(key) && SAFE_ERROR_CODES.has(item)) codes.add(item);
      if (['field', 'param', 'parameter'].includes(key) && typeof item === 'string') {
        const parts = item.split('.');
        if (parts.length <= 3 && parts.every(part => SAFE_FIELDS.has(part))) fields.add(item);
      }
      if (['message', 'error', 'detail'].includes(key) && typeof item === 'string') {
        if (/checkout.*(?:not enabled|disabled|não habilitado|desabilitado)/i.test(item)) signals.add('checkout_disabled');
        if (/handle.*(?:invalid|not found|inválid|não encontrad)/i.test(item)) signals.add('handle_rejected');
        if (/(?:phone|telefone).*(?:invalid|format|inválid)/i.test(item)) signals.add('phone_invalid');
      }
      visit(item, depth + 1);
    }
  };
  visit(parsed);
  return {...summary, codes: [...codes], fields: [...fields], signals: [...signals]};
}

function diagnostic({path, body, response, error, sample, kind}) {
  const status = Number.isInteger(response?.status) ? response.status : null;
  const mime = (response?.headers?.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const code = error?.cause?.code || error?.code;
  const timeout = ['TimeoutError', 'AbortError'].includes(error?.name) ||
    ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(code);
  return {
    timestamp: new Date().toISOString(),
    endpoint: `https://api.checkout.infinitepay.io/${path === 'links' ? 'links' : 'payment_check'}`,
    correlation: typeof body?.order_nsu === 'string' ?
      crypto.createHash('sha256').update(body.order_nsu).digest('hex').slice(0, 12) : null,
    kind: timeout ? 'timeout' : kind,
    upstreamStatus: status,
    upstreamStatusText: status && response?.statusText === STATUS_CODES[status] ? STATUS_CODES[status] : null,
    contentType: ['application/json', 'application/problem+json', 'text/plain', 'text/html'].includes(mime) ? mime : null,
    errorCode: SAFE_NETWORK_CODES.has(code) ? code : null,
    ...(sample ? {body: summarizeBody(sample)} : {}),
  };
}

module.exports = {readErrorBody, diagnostic};
