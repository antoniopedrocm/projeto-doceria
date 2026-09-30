const crypto = require('node:crypto');
const {DEV_PROJECT_ID, STORE_ID_PATTERN, getRuntimeProjectId} = require('./whatsapp-config');
const {buildHistoryEvent} = require('./whatsapp-history');
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' &&
  crypto.timingSafeEqual(Buffer.from(hash(a), 'hex'), Buffer.from(hash(b), 'hex'));
const correlationPattern = /^[a-f0-9-]{36}$/;
const ranks = {sent: 1, failed: 2, delivered: 3, read: 4};

// Validate the complete batch before performing any writes. Ignore inbound content.
const parseStatuses = (body, config) => {
  if (body?.object !== 'whatsapp_business_account' || !Array.isArray(body.entry) || body.entry.length > 20) throw new Error('payload');
  const events = [];
  let count = 0;
  for (const entry of body.entry) {
    if (!entry || typeof entry.id !== 'string' || !Array.isArray(entry.changes) || entry.changes.length > 20) throw new Error('payload');
    for (const change of entry.changes) {
      if (!change || typeof change.field !== 'string') throw new Error('payload');
      if (change.field !== 'messages') continue;
      const value = change.value;
      if (value?.messaging_product !== 'whatsapp' || typeof value.metadata?.phone_number_id !== 'string') throw new Error('payload');
      if (value.statuses === undefined) continue;
      if (!Array.isArray(value.statuses) || (count += value.statuses.length) > 100) throw new Error('payload');
      for (const status of value.statuses) {
        if (!status || typeof status.status !== 'string') throw new Error('payload');
        if (!Object.hasOwn(ranks, status.status)) continue;
        if (typeof status.id !== 'string' || !/^wamid\.[a-zA-Z0-9_+=/-]{1,500}$/.test(status.id) ||
            typeof status.recipient_id !== 'string' || !/^[1-9][0-9]{7,14}$/.test(status.recipient_id) ||
            typeof status.timestamp !== 'string' || !/^[0-9]{1,12}$/.test(status.timestamp) ||
            (status.biz_opaque_callback_data !== undefined && (typeof status.biz_opaque_callback_data !== 'string' ||
              status.biz_opaque_callback_data.length > 512))) throw new Error('payload');
        if (entry.id !== config.wabaId || value.metadata.phone_number_id !== config.phoneNumberId) continue;
        const errorCode = status.errors?.[0]?.code;
        events.push({messageId: status.id, status: status.status, providerAt: Number(status.timestamp) * 1000,
          recipientHash: hash(status.recipient_id), correlationId: status.biz_opaque_callback_data || null,
          ...(Number.isSafeInteger(errorCode) && errorCode >= 0 ? {metaCode: errorCode} : {})});
      }
    }
  }
  return events;
};

const applyStatus = async ({db, storeId, config, event, now = Date.now}) => db.runTransaction(async (tx) => {
  const messageRef = db.doc(`integrations/whatsapp/messages/${hash(event.messageId)}`);
  const message = (await tx.get(messageRef)).data();
  const correlationId = event.correlationId || message?.correlationId;
  if (!correlationPattern.test(correlationId || '') || (message && message.correlationId !== correlationId)) return 'unmatched';
  const correlationRef = db.doc(`integrations/whatsapp/correlations/${correlationId}`);
  const correlation = (await tx.get(correlationRef)).data();
  if (!correlation || correlation.storeId !== storeId || correlation.phoneNumberId !== config.phoneNumberId ||
      correlation.recipientHash !== event.recipientHash || (correlation.messageId && correlation.messageId !== event.messageId) ||
      !/^[a-f0-9]{64}$/.test(correlation.jobId)) return 'unmatched';
  const ref = db.doc(`integrations/whatsapp/jobs/${correlation.jobId}`);
  const job = (await tx.get(ref)).data();
  if (!job || job.storeId !== storeId || job.deliveryMode !== 'cloud' || job.phoneNumberId !== config.phoneNumberId ||
      job.attemptCount !== correlation.attempt || (job.lastResult?.messageId && job.lastResult.messageId !== event.messageId)) return 'unmatched';
  // One observation per provider message/status: repeated timestamps cannot grow history.
  const historyRef = db.doc(`${ref.path}/history/webhook-${hash(`${event.messageId}:${event.status}`)}`);
  if ((await tx.get(historyRef)).exists) return 'duplicate';
  const time = now();
  const outcome = {status: event.status, code: `meta_${event.status}`, messageId: event.messageId,
    ...(event.metaCode === undefined ? {} : {metaCode: event.metaCode})};
  const advances = ranks[event.status] > (ranks[job.delivery?.status] || 0);
  tx.set(historyRef, {...buildHistoryEvent({job, kind: 'webhook', time, outcome}), providerAt: event.providerAt, applied: advances});
  tx.set(messageRef, {correlationId});
  tx.update(correlationRef, {messageId: event.messageId});
  if (advances) tx.update(ref, {status: event.status, code: outcome.code, updatedAt: time,
    nextRunAt: Number.MAX_SAFE_INTEGER, prepared: null, owner: null,
    delivery: {...outcome, providerAt: event.providerAt, recordedAt: time}});
  return advances ? 'updated' : 'out_of_order';
});

const createWhatsAppWebhook = ({db, getProjectId = getRuntimeProjectId, now = Date.now,
  logger = {info: () => {}}, readSecret} = {}) => {
  let client;
  const secret = readSecret || (async (storeId, kind) => {
    if (!client) {
      const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
      client = new SecretManagerServiceClient();
    }
    const [version] = await client.accessSecretVersion({name:
      `projects/${DEV_PROJECT_ID}/secrets/whatsapp-dev-${storeId}-${kind}/versions/latest`}, {timeout: 5000, retry: null});
    return version.payload?.data?.toString('utf8');
  });
  return async (req, res) => {
    const reply = (code, text) => res.status(code).type('text/plain').send(text);
    if (getProjectId() !== DEV_PROJECT_ID) return reply(403, 'Disabled');
    const storeId = /^\/([a-zA-Z0-9_-]{1,100})\/?$/.exec(req.path || '')?.[1];
    if (!storeId || !STORE_ID_PATTERN.test(storeId)) return reply(404, 'Not found');
    if (!['GET', 'POST'].includes(req.method)) return reply(405, 'Method not allowed');
    if (req.method === 'POST' && (!Buffer.isBuffer(req.rawBody) || req.rawBody.length > 262144)) return reply(413, 'Invalid body');
    try {
      const config = (await db.doc(`integrations/whatsapp/stores/${storeId}`).get()).data();
      // Receiving receipts remains possible after sending is disabled.
      if (config?.webhookEnabled !== true || !/^[0-9]{1,30}$/.test(config.wabaId || '') ||
          !/^[0-9]{1,30}$/.test(config.phoneNumberId || '')) return reply(403, 'Disabled');
      const key = await secret(storeId, req.method === 'GET' ? 'verify-token' : 'app-secret');
      if (typeof key !== 'string' || !key.length || key.length > 8192 || /\s/.test(key)) throw new Error('secret');
      if (req.method === 'GET') {
        const query = req.query || {};
        if (query['hub.mode'] !== 'subscribe' || typeof query['hub.challenge'] !== 'string' ||
            !/^[0-9]{1,200}$/.test(query['hub.challenge']) ||
            !equal(query['hub.verify_token'], key)) return reply(403, 'Forbidden');
        return reply(200, query['hub.challenge']);
      }
      const signature = req.get('x-hub-signature-256');
      const expected = `sha256=${crypto.createHmac('sha256', key).update(req.rawBody).digest('hex')}`;
      if (typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature) || !equal(signature, expected)) return reply(401, 'Unauthorized');
      let events;
      try {events = parseStatuses(JSON.parse(req.rawBody.toString('utf8')), config);} catch (_) {return reply(400, 'Invalid payload');}
      const counts = {};
      for (const event of events) {
        const result = await applyStatus({db, storeId, config, event, now});
        counts[result] = (counts[result] || 0) + 1;
      }
      try {logger.info('WhatsApp webhook', {storeId, counts});} catch (_) { /* logging is best effort */ }
      return reply(200, 'EVENT_RECEIVED');
    } catch (_) {
      try {logger.info('WhatsApp webhook', {storeId, code: 'processing_unavailable'});} catch (_) { /* no-op */ }
      return reply(503, 'Unavailable');
    }
  };
};
module.exports = {createWhatsAppWebhook, parseStatuses, applyStatus};
