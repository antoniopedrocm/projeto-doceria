const crypto = require('node:crypto');
const {DEV_PROJECT_ID, STORE_ID_PATTERN, getRuntimeProjectId, parseConfiguration, integrationStoreIdFor} = require('./whatsapp-config');
const {createOrderConfirmationPreparer} = require('./whatsapp-order-summary');
const {createWhatsAppService} = require('./whatsapp');
const {CONSENT_VERSION, normalizeBrazilPhone} = require('./whatsapp-checkout');
const {maskRecipient, sanitizeOutcome, recordHistory} = require('./whatsapp-history');
const {canAccessWhatsApp} = require('./whatsapp-access');
const {shouldNotifyOrder} = require('./checkout-reservation');

const JOBS = 'integrations/whatsapp/jobs';
const LEASE_MS = 180000;
const MAX_AGE_MS = 3600000;
const MAX_ATTEMPTS = 4;
const NEVER = Number.MAX_SAFE_INTEGER;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const jobIdFor = (storeId, orderId) => hash(`${storeId}:${orderId}:order_confirmation:automatic`);
const terminal = (status, code, now) => ({status, code, updatedAt: now, nextRunAt: NEVER, prepared: null, owner: null});
const safeResult = (result) => sanitizeOutcome({ ...result,
  status: ['accepted', 'simulated', 'skipped', 'failed', 'unknown'].includes(result?.status) ? result.status : 'unknown',
});
const automaticConfig = (raw, createdAt) => {
  const config = parseConfiguration(raw);
  if (raw.automaticEnabled !== true || config.mode === 'disabled' ||
      !Number.isSafeInteger(raw.automaticSince) || raw.automaticSince <= 0 || createdAt < raw.automaticSince) return null;
  return config;
};

// Backend-only. All durable records are under the client-denied integrations tree.
const createWhatsAppWorker = ({db, now = Date.now, getProjectId = getRuntimeProjectId,
  service = createWhatsAppService({db, getProjectId}), logger = {info: () => {}},
  getAuthUser = (uid) => require('firebase-admin').auth().getUser(uid)} = {}) => {
  const configRef = (storeId) => db.doc(`integrations/whatsapp/stores/${storeId}`);
  const stop = (tx, ref, job, status, code, time, kind = 'stopped') => {
    tx.update(ref, terminal(status, code, time));
    recordHistory(db, tx, ref, {job, kind, time, outcome: {status, code}});
  };
  const log = (id, status, code) => {
    // Deliberately omit phone, body, raw exception and secret. Logging cannot affect a job.
    try {logger.info('WhatsApp automatic processing', {jobId: id, status, code});} catch (_) { /* no-op */ }
  };

  const enqueue = async (event) => {
    if (getProjectId() !== DEV_PROJECT_ID) return;
    const orderStoreId = event.params?.lojaId;
    const storeId = integrationStoreIdFor(orderStoreId);
    const orderId = event.params?.pedidoId;
    const createdAt = Date.parse(event.time);
    const time = now();
    if (typeof orderStoreId !== 'string' || !STORE_ID_PATTERN.test(orderStoreId) ||
        !STORE_ID_PATTERN.test(storeId) ||
        typeof orderId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(orderId) ||
        !Number.isFinite(createdAt) || createdAt > time + 60000 || time - createdAt > MAX_AGE_MS) return;
    const order = event.data?.data();
    if (!order || order.lojaId !== orderStoreId || order.status !== 'Pendente' ||
        !['Plataforma', 'Cardapio Online'].includes(order.origem) ||
        (order.payment_status && (order.payment_status !== 'PAID' || order.requiresReview))) return;
    // Use the committed creation snapshot, not a later mutable version of the order.
    const preparer = createOrderConfirmationPreparer({getProjectId,
      db: {doc: () => ({get: async () => ({exists: true, data: () => order})})},
    });
    const prepared = await preparer.prepare({storeId, orderStoreId, orderId});
    const id = jobIdFor(storeId, orderId);
    const ref = db.doc(`${JOBS}/${id}`);
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) return; // Never reset sent, failed, simulated or unknown jobs.
      const configSnap = await tx.get(configRef(storeId));
      let config;
      try {config = automaticConfig(configSnap.data() || {}, createdAt);} catch (_) {return;}
      if (!config) return;
      if (prepared.status === 'ready' && config.mode === 'cloud' &&
          !config.allowedRecipients.includes(prepared.recipient)) return;
      // Bound admission even if callers create many different order documents.
      const quotaRef = db.doc(`integrations/whatsapp/quotas/${hash(`${storeId}:admission:${Math.floor(time / 86400000)}`)}`);
      const quota = (await tx.get(quotaRef)).data() || {};
      if ((quota.count || 0) >= 100) return;
      tx.set(quotaRef, {count: (quota.count || 0) + 1, updatedAt: time});
      const ready = prepared.status === 'ready';
      const job = {
        storeId, orderStoreId, orderId, type: 'order_confirmation', mode: 'automatic',
        operatorId: null, recipientMasked: maskRecipient(prepared.recipient),
        templateVersion: prepared.template?.version || null,
        createdAt, updatedAt: time, attemptCount: 0, owner: null,
        deliveryMode: config.mode, phoneNumberId: config.phoneNumberId || null,
        status: ready ? 'queued' : prepared.status,
        code: ready ? 'queued' : prepared.code,
        nextRunAt: ready ? time : NEVER,
        prepared: ready ? {storeId, recipient: prepared.recipient, bodyParameters: prepared.bodyParameters,
          expectedTemplate: prepared.expectedTemplate, templateVersion: prepared.template.version} : null,
      };
      tx.set(ref, job);
      recordHistory(db, tx, ref, {job, kind: 'created', time});
    });
    return id;
  };

  const processJob = async (id) => {
    if (getProjectId() !== DEV_PROJECT_ID || !/^[a-f0-9]{64}$/.test(id || '')) return;
    const ref = db.doc(`${JOBS}/${id}`);
    const owner = crypto.randomUUID();
    const claimed = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return null;
      const job = snapshot.data();
      const orderStoreId = job.orderStoreId || job.storeId;
      const time = now();
      if (!STORE_ID_PATTERN.test(orderStoreId) || integrationStoreIdFor(orderStoreId) !== job.storeId) return null;
      if (job.nextRunAt > time) return null;
      if (job.status === 'processing') {
        // Expired ownership cannot prove the previous POST did not reach Meta.
        stop(tx, ref, job, 'unknown', 'lease_expired', time, 'lease_expired');
        return null;
      }
      if (!['queued', 'retry'].includes(job.status)) return null;
      if (time - job.createdAt > MAX_AGE_MS || job.attemptCount >= MAX_ATTEMPTS) {
        stop(tx, ref, job, 'failed', 'retry_exhausted', time);
        return null;
      }
      const configSnap = await tx.get(configRef(job.storeId));
      let config;
      const manual = job.mode === 'manual';
      try {
        const raw = configSnap.data() || {};
        config = manual ? (raw.manualEnabled === true ? parseConfiguration(raw) : null) : automaticConfig(raw, job.createdAt);
        if (config?.mode === 'disabled') config = null;
      } catch (_) {config = null;}
      if (!config || config.mode !== job.deliveryMode ||
          (config.phoneNumberId || null) !== job.phoneNumberId) {
        stop(tx, ref, job, 'skipped', 'configuration_changed', time);
        return null;
      }
      if (manual) {
        let allowed = false;
        try {
          allowed = await canAccessWhatsApp({db, reader: tx, uid: job.operatorId, storeId: orderStoreId}) &&
            !(await getAuthUser(job.operatorId)).disabled;
        } catch (_) {allowed = false;}
        if (!allowed) {
          stop(tx, ref, job, 'skipped', 'operator_not_authorized', time);
          return null;
        }
      }
      const orderSnap = await tx.get(db.doc(`lojas/${orderStoreId}/pedidos/${job.orderId}`));
      const order = orderSnap.data();
      const consent = order?.whatsappConfirmation?.consent;
      const phone = normalizeBrazilPhone(order?.telefone);
      if (!order || order.lojaId !== orderStoreId || (manual ? order.status === 'Cancelado' : !['Pendente', 'Em Preparo', 'Em Produção'].includes(order.status)) ||
          (order.payment_status && (order.payment_status !== 'PAID' || order.requiresReview)) ||
          consent?.granted !== true || consent.status !== 'granted' || consent.version !== CONSENT_VERSION ||
          order.whatsappConfirmation.phoneStatus !== 'valid' ||
          phone.e164?.slice(1) !== job.prepared?.recipient ||
          order.whatsappConfirmation.phoneE164 !== phone.e164) {
        stop(tx, ref, job, 'skipped', 'order_no_longer_eligible', time);
        return null;
      }
      if (config.mode === 'cloud') {
        if (!config.allowedRecipients.includes(job.prepared.recipient)) {
          stop(tx, ref, job, 'skipped', 'recipient_not_allowed', time);
          return null;
        }
        // Per-recipient quota also covers different order IDs from repeated checkout submissions.
        // Count every POST attempt, not only successes, to bound uncertain/provider failures.
        const day = Math.floor(time / 86400000);
        const storeQuota = db.doc(`integrations/whatsapp/quotas/${hash(`${job.storeId}:send:${day}`)}`);
        const recipientQuota = db.doc(`integrations/whatsapp/quotas/${hash(`${job.prepared.recipient}:${manual ? 'manual-send' : 'send'}:${day}`)}`);
        const storeCount = ((await tx.get(storeQuota)).data() || {}).count || 0;
        const recipientData = (await tx.get(recipientQuota)).data() || {};
        if (storeCount >= 20 || (!manual && recipientData.jobId && recipientData.jobId !== id) || (recipientData.count || 0) >= 4) {
          stop(tx, ref, job, 'skipped', 'dev_quota_exceeded', time);
          return null;
        }
        tx.set(storeQuota, {count: storeCount + 1, updatedAt: time});
        tx.set(recipientQuota, {count: (recipientData.count || 0) + 1, jobId: id, updatedAt: time});
      }
      if (config.mode === 'cloud') {
        tx.set(db.doc(`integrations/whatsapp/correlations/${owner}`), {
          jobId: id, storeId: job.storeId, attempt: job.attemptCount + 1,
          recipientHash: hash(job.prepared.recipient), phoneNumberId: job.phoneNumberId,
        });
      }
      tx.update(ref, {status: 'processing', owner, attemptCount: job.attemptCount + 1,
        nextRunAt: time + LEASE_MS, updatedAt: time});
      recordHistory(db, tx, ref, {job, kind: 'attempt_started', time, attempt: job.attemptCount + 1,
        outcome: {status: 'processing', code: 'attempt_started'}});
      return {...job, attemptCount: job.attemptCount + 1};
    });
    if (!claimed) return;
    let result;
    try {
      result = await service.sendTemplate({...claimed.prepared, correlationId: owner,
        expectedDelivery: {mode: claimed.deliveryMode, phoneNumberId: claimed.phoneNumberId,
          ...(claimed.mode === 'manual' ? {manual: true} : {})}});
    } catch (_) {
      result = {status: 'unknown', code: 'transport_exception'};
    }
    const safe = safeResult(result);
    // A response-less failure must not be assumed safe to retry.
    const canRetry = safe.status === 'failed' &&
      ['rate_limited', 'credential_unavailable', 'configuration_unavailable'].includes(safe.code);
    const delay = Math.max(60000 * (2 ** (claimed.attemptCount - 1)),
      Number.isFinite(result?.retryAfterMs) ? result.retryAfterMs : 0);
    const time = now();
    const retry = claimed.mode !== 'manual' && canRetry && claimed.attemptCount < MAX_ATTEMPTS && time + delay - claimed.createdAt <= MAX_AGE_MS;
    // If this transaction fails, leave processing in place: recovery becomes unknown, not another POST.
    const recorded = await db.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      if (current?.owner !== owner || current.status !== 'processing') {
        if (current?.attemptCount === claimed.attemptCount &&
            ((current.status === 'unknown' && current.code === 'lease_expired') || current.delivery)) {
          recordHistory(db, tx, ref, {job: claimed, kind: 'late_result', time, outcome: safe});
        }
        return false;
      }
      tx.update(ref, {...(retry ? {status: 'retry', code: safe.code, owner: null, updatedAt: time, nextRunAt: time + delay} :
        terminal(safe.status, safe.code, time)), lastResult: safe});
      if (claimed.deliveryMode === 'cloud' && safe.messageId) {
        tx.set(db.doc(`integrations/whatsapp/messages/${hash(safe.messageId)}`), {correlationId: owner});
      }
      recordHistory(db, tx, ref, {job: claimed, kind: 'attempt_finished', time, outcome: safe, retryAt: retry ? time + delay : null});
      return true;
    });
    log(id, recorded ? (retry ? 'retry' : safe.status) : 'unknown', recorded ? safe.code : 'ownership_lost');
  };

  const recover = async () => {
    if (getProjectId() !== DEV_PROJECT_ID) return;
    const due = await db.collection(JOBS).where('nextRunAt', '<=', now()).orderBy('nextRunAt').limit(50).get();
    const results = await Promise.allSettled(due.docs.map((doc) => processJob(doc.id)));
    results.forEach((result, index) => {
      if (result.status === 'rejected') log(due.docs[index].id, 'failed', 'recovery_unavailable');
    });
  };
  return {enqueue, processJob, recover};
};

const createWhatsAppWorkerFunctions = ({db, onDocumentCreated, onDocumentUpdated, onSchedule, logger, worker = createWhatsAppWorker({db, logger})}) => {
  return {
    enqueueWhatsAppConfirmation: onDocumentCreated({document: 'lojas/{lojaId}/pedidos/{pedidoId}',
      region: 'southamerica-east1', retry: true, maxInstances: 2}, worker.enqueue),
    // Dedicated paid-transition trigger keeps retries independent of staff FCM notifications.
    enqueuePaidWhatsAppConfirmation: onDocumentUpdated({document: 'lojas/{lojaId}/pedidos/{pedidoId}',
      region: 'southamerica-east1', retry: true, maxInstances: 2}, async (event) => {
      const previous = event.data?.before?.data();
      const order = event.data?.after?.data();
      if (order?.payment_status !== 'PAID' || !shouldNotifyOrder(previous, order)) return;
      return worker.enqueue({...event, data: event.data.after});
    }),
    processWhatsAppConfirmation: onDocumentCreated({document: `${JOBS}/{jobId}`,
      region: 'southamerica-east1', retry: true, timeoutSeconds: 120, maxInstances: 2},
    (event) => worker.processJob(event.params.jobId)),
    recoverWhatsAppConfirmations: onSchedule({schedule: 'every 1 minutes', region: 'southamerica-east1',
      timeoutSeconds: 120, maxInstances: 1}, worker.recover),
  };
};
module.exports = {createWhatsAppWorker, createWhatsAppWorkerFunctions, jobIdFor, JOBS, LEASE_MS, MAX_AGE_MS};
