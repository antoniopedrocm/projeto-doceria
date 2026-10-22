const crypto = require('node:crypto');
const PROVIDER_EVENT_NAMES = Object.freeze(['created', 'paid', 'settled', 'canceled', 'refunded', 'payment_failed']);

// This is our defensive input policy, not an undocumented provider envelope.
// A hint can deny automatic processing; it can never establish financial truth.
function inspectPaymentSignal(input) {
  const object = input && typeof input === 'object' && !Array.isArray(input);
  const correlation = object && typeof input.order_nsu === 'string' && /^[a-f0-9]{64}$/.test(input.order_nsu)
    ? crypto.createHash('sha256').update(input.order_nsu).digest('hex').slice(0, 12) : null;
  const result = (action, reason, eventHint = 'NONE') => ({action, reason, eventHint, correlation});
  if (!object) return result('REJECT', 'INVALID_BODY');
  const hints = ['event', 'type', 'status'].filter(key => Object.hasOwn(input, key)).map(key => input[key]);
  if (hints.length && !hints.every(value => value === 'paid')) {
    const name = hints.length === 1 && PROVIDER_EVENT_NAMES.includes(hints[0]) ? hints[0] : 'UNKNOWN';
    return result('HOLD', 'UNVERIFIED_PROVIDER_EVENT', name);
  }
  const slug = input.invoice_slug || input.slug;
  if (typeof input.order_nsu !== 'string' || !/^[a-f0-9]{64}$/.test(input.order_nsu) ||
      typeof input.transaction_nsu !== 'string' || !/^[\w-]{1,160}$/.test(input.transaction_nsu) ||
      typeof slug !== 'string' || !/^[\w-]{1,160}$/.test(slug)) return result('REJECT', 'INVALID_REFERENCES');
  return {...result('VERIFY_APPROVAL', 'QUERY_REQUIRED', hints.length ? 'paid' : 'NONE'),
    references: {orderNsu: input.order_nsu, transactionNsu: input.transaction_nsu, slug}};
}

module.exports = {PROVIDER_EVENT_NAMES, inspectPaymentSignal};
