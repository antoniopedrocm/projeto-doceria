const crypto = require('node:crypto');
const {DEV_PROJECT_ID, STORE_ID_PATTERN, getRuntimeProjectId, parseConfiguration, integrationStoreIdFor} = require('./whatsapp-config');
const {canAccessWhatsApp} = require('./whatsapp-access');
const {createOrderConfirmationPreparer} = require('./whatsapp-order-summary');
const {maskRecipient, recordHistory, sanitizeOutcome} = require('./whatsapp-history');
const {JOBS, jobIdFor} = require('./whatsapp-worker');
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const orderKey = (storeId, orderId) => hash(`${storeId}:${orderId}`);
const manualIdFor = (storeId, orderId, uid, requestId) => hash(`${storeId}:${orderId}:manual:${uid}:${requestId}`);
const pending = (job) => ['queued', 'processing', 'retry'].includes(job?.status);
const projectJob = (id, job) => ({id, mode: job.mode === 'manual' ? 'manual' : 'automatic',
  operatorId: job.mode === 'manual' ? job.operatorId : null,
  ...sanitizeOutcome({status: job.status, code: job.code}),
  attemptCount: job.attemptCount || 0, createdAt: job.createdAt || null, updatedAt: job.updatedAt || null,
  recipientMasked: /^\*{3}[0-9]{4}$/.test(job.recipientMasked || '') ? job.recipientMasked : null,
  lastResult: job.lastResult ? sanitizeOutcome(job.lastResult) : null,
  delivery: job.delivery ? sanitizeOutcome(job.delivery) : null,
});

const createWhatsAppAdmin = ({db, getProjectId = getRuntimeProjectId, now = Date.now,
  getAuthUser = (uid) => require('firebase-admin').auth().getUser(uid),
  HttpsError = require('firebase-functions/v2/https').HttpsError} = {}) => {
  const fail = (code, text) => {throw new HttpsError(code, text);};
  const validate = async (request) => {
    if (getProjectId() !== DEV_PROJECT_ID) fail('failed-precondition', 'WhatsApp disponível somente em DEV.');
    const uid = request.auth?.uid;
    if (!uid) fail('unauthenticated', 'Entre novamente para continuar.');
    const {storeId: orderStoreId, orderId} = request.data || {};
    if (typeof orderStoreId !== 'string' || !STORE_ID_PATTERN.test(orderStoreId) ||
        typeof orderId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(orderId)) fail('invalid-argument', 'Pedido inválido.');
    let user;
    try {user = await getAuthUser(uid);} catch (_) {fail('permission-denied', 'Usuário indisponível.');}
    if (user.disabled || !await canAccessWhatsApp({db, uid, storeId: orderStoreId})) fail('permission-denied', 'Sem acesso aos pedidos desta loja.');
    return {uid, storeId: integrationStoreIdFor(orderStoreId), orderStoreId, orderId};
  };
  const requestManual = async (request) => {
    const {uid, storeId, orderStoreId, orderId} = await validate(request);
    const {requestId, confirmResend} = request.data;
    if (typeof requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(requestId) ||
        confirmResend !== true) fail('invalid-argument', 'Confirme o reenvio antes de continuar.');
    const id = manualIdFor(storeId, orderId, uid, requestId);
    return db.runTransaction(async (tx) => {
      if (!await canAccessWhatsApp({db, reader: tx, uid, storeId: orderStoreId})) fail('permission-denied', 'Sem acesso aos pedidos desta loja.');
      const ref = db.doc(`${JOBS}/${id}`);
      const existing = (await tx.get(ref)).data();
      if (existing) return {job: projectJob(id, existing), duplicate: true};
      const configRaw = (await tx.get(db.doc(`integrations/whatsapp/stores/${storeId}`))).data() || {};
      let config;
      try {config = parseConfiguration(configRaw);} catch (_) {fail('failed-precondition', 'Configuração WhatsApp indisponível.');}
      if (configRaw.manualEnabled !== true || config.mode === 'disabled') fail('failed-precondition', 'Reenvio pela API não está habilitado nesta loja.');
      const order = (await tx.get(db.doc(`lojas/${orderStoreId}/pedidos/${orderId}`))).data();
      if (!order || order.lojaId !== orderStoreId) fail('not-found', 'Pedido não encontrado nesta loja.');
      if (order.status === 'Cancelado') fail('failed-precondition', 'Pedido cancelado não pode receber confirmação.');
      const prepared = await createOrderConfirmationPreparer({getProjectId,
        db: {doc: () => ({get: async () => ({exists: true, data: () => order})})}}).prepare({storeId, orderStoreId, orderId});
      if (prepared.status !== 'ready') fail('failed-precondition', 'Não foi possível preparar o resumo: verifique consentimento, telefone e dados do pedido.');
      if (config.mode === 'cloud' && !config.allowedRecipients.includes(prepared.recipient)) fail('failed-precondition', 'Destinatário fora da lista de testes DEV.');
      const indexRef = db.doc(`integrations/whatsapp/manualOrders/${orderKey(storeId, orderId)}`);
      const index = (await tx.get(indexRef)).data() || {jobIds: [], lastRequestedAt: 0};
      const latest = index.jobIds.length ? (await tx.get(db.doc(`${JOBS}/${index.jobIds[index.jobIds.length - 1]}`))).data() : null;
      if (pending(latest)) fail('failed-precondition', 'Já existe um envio manual pendente para este pedido.');
      const time = now();
      if (index.jobIds.length >= 20 || (index.lastRequestedAt && time - index.lastRequestedAt < 60000)) fail('resource-exhausted', 'Limite de reenvios atingido. Aguarde antes de tentar novamente.');
      const job = {storeId, orderStoreId, orderId, type: 'order_confirmation', mode: 'manual', operatorId: uid,
        recipientMasked: maskRecipient(prepared.recipient), templateVersion: prepared.template.version,
        createdAt: time, updatedAt: time, attemptCount: 0, owner: null,
        deliveryMode: config.mode, phoneNumberId: config.phoneNumberId || null,
        status: 'queued', code: 'queued', nextRunAt: time,
        prepared: {storeId, recipient: prepared.recipient, bodyParameters: prepared.bodyParameters,
          expectedTemplate: prepared.expectedTemplate, templateVersion: prepared.template.version}};
      tx.set(ref, job);
      tx.set(indexRef, {jobIds: [...index.jobIds, id], lastRequestedAt: time});
      recordHistory(db, tx, ref, {job, kind: 'created', time});
      return {job: projectJob(id, job), duplicate: false};
    });
  };
  const getStatus = async (request) => {
    const {storeId, orderStoreId, orderId} = await validate(request);
    const order = (await db.doc(`lojas/${orderStoreId}/pedidos/${orderId}`).get()).data();
    if (!order || order.lojaId !== orderStoreId) fail('not-found', 'Pedido não encontrado nesta loja.');
    const index = (await db.doc(`integrations/whatsapp/manualOrders/${orderKey(storeId, orderId)}`).get()).data();
    const ids = [jobIdFor(storeId, orderId), ...(index?.jobIds || []).slice(-20)];
    const jobs = (await Promise.all(ids.map(async (id) => {
      if (!/^[a-f0-9]{64}$/.test(id)) return null;
      const job = (await db.doc(`${JOBS}/${id}`).get()).data();
      if (!job || job.storeId !== storeId || job.orderId !== orderId) return null;
      const history = request.data.includeHistory === true ?
        await db.collection(`${JOBS}/${id}/history`).orderBy('recordedAt', 'desc').limit(20).get() : {docs: []};
      return {...projectJob(id, job), history: history.docs.map((doc) => {
        const e = doc.data();
        return {kind: e.kind, recordedAt: e.recordedAt, attempt: e.attempt, outcome: sanitizeOutcome(e.outcome)};
      })};
    }))).filter(Boolean);
    jobs.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    const config = (await db.doc(`integrations/whatsapp/stores/${storeId}`).get()).data();
    return {jobs, manualEnabled: config?.enabled === true && config?.manualEnabled === true,
      scope: 'dev'};
  };
  return {requestManual, getStatus};
};
const createWhatsAppAdminFunctions = ({db, onCall, HttpsError}) => {
  const service = createWhatsAppAdmin({db, HttpsError});
  const options = {region: 'southamerica-east1', timeoutSeconds: 60, maxInstances: 2};
  return {getWhatsAppOrderStatus: onCall(options, service.getStatus), requestWhatsAppOrderResend: onCall(options, service.requestManual)};
};
module.exports = {createWhatsAppAdmin, createWhatsAppAdminFunctions, manualIdFor};
