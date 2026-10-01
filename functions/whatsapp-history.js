const KINDS = new Set(['created', 'attempt_started', 'attempt_finished', 'stopped', 'lease_expired', 'late_result', 'webhook']);
const STATUSES = new Set(['queued', 'processing', 'retry', 'accepted', 'simulated', 'skipped', 'failed', 'unknown', 'sent', 'delivered', 'read']);
// Never preserve arbitrary provider/exception text, even if it resembles a code.
const CODES = new Set([
  'operator_not_authorized',
  'meta_sent', 'meta_delivered', 'meta_read', 'meta_failed',
  'queued', 'attempt_started', 'meta_accepted', 'mock_only', 'disabled', 'environment_blocked',
  'invalid_store', 'configuration_unavailable', 'invalid_message', 'recipient_not_allowed',
  'credential_unavailable', 'credential_invalid', 'internal_error', 'template_mismatch',
  'delivery_configuration_changed', 'invalid_response', 'timeout', 'network_error',
  'provider_uncertain', 'provider_rejected', 'rate_limited', 'unexpected_result',
  'transport_exception', 'lease_expired', 'retry_exhausted', 'configuration_changed',
  'order_no_longer_eligible', 'dev_quota_exceeded', 'consent_missing', 'invalid_recipient',
  'invalid_order_data', 'summary_too_long', 'unsupported_item_options', 'order_not_found',
  'order_unavailable', 'store_mismatch', 'invalid_order_reference',
]);
const sanitizeOutcome = (result) => {
  const safe = {
    status: STATUSES.has(result?.status) ? result.status : 'unknown',
    code: CODES.has(result?.code) ? result.code : 'unexpected_result',
  };
  if (Number.isInteger(result?.httpStatus) && result.httpStatus >= 100 && result.httpStatus <= 599) safe.httpStatus = result.httpStatus;
  if (Number.isSafeInteger(result?.metaCode) && result.metaCode >= 0) safe.metaCode = result.metaCode;
  if (typeof result?.messageId === 'string' && /^wamid\.[a-zA-Z0-9_+=/-]{1,500}$/.test(result.messageId)) safe.messageId = result.messageId;
  return safe;
};
const maskRecipient = (phone) => typeof phone === 'string' && /^[1-9][0-9]{7,14}$/.test(phone) ?
  `***${phone.slice(-4)}` : null;

const buildHistoryEvent = ({job, kind, time, attempt = job.attemptCount, outcome, retryAt = null}) => {
  if (!KINDS.has(kind) || !Number.isSafeInteger(time) || time < 0 ||
      !Number.isSafeInteger(attempt) || attempt < 0 || !['automatic', 'manual'].includes(job.mode)) {
    throw new Error('invalid_history_event');
  }
  if (job.mode === 'manual' && (typeof job.operatorId !== 'string' || !job.operatorId.trim() || job.operatorId.length > 128)) {
    throw new Error('manual_operator_required');
  }
  return {
    schemaVersion: 1, kind, recordedAt: time, attempt,
    retryScheduled: Number.isSafeInteger(retryAt) && retryAt > time,
    nextRetryAt: Number.isSafeInteger(retryAt) && retryAt > time ? retryAt : null,
    storeId: job.storeId, orderId: job.orderId, type: 'order_confirmation', mode: job.mode,
    operatorId: job.mode === 'manual' ? job.operatorId : null,
    recipientMasked: /^\*{3}[0-9]{4}$/.test(job.recipientMasked || '') ? job.recipientMasked : maskRecipient(job.prepared?.recipient),
    templateVersion: job.templateVersion || job.prepared?.templateVersion || null,
    deliveryMode: ['mock', 'cloud'].includes(job.deliveryMode) ? job.deliveryMode : null,
    outcome: sanitizeOutcome(outcome || {status: job.status, code: job.code}),
  };
};

// Call inside the same transaction as the guarded state transition. Deterministic
// event IDs mean transaction retries do not create duplicate history entries.
const recordHistory = (db, tx, jobRef, options) => {
  const event = buildHistoryEvent(options);
  tx.set(db.doc(`${jobRef.path}/history/${event.kind}-${event.attempt}`), event);
};
module.exports = {maskRecipient, sanitizeOutcome, buildHistoryEvent, recordHistory};
