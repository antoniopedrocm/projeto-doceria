const {test} = require('node:test');
const assert = require('node:assert/strict');
const {maskRecipient, sanitizeOutcome, buildHistoryEvent, recordHistory} = require('./whatsapp-history');

const job = {storeId: 'matriz', orderId: 'pedido1', mode: 'automatic', attemptCount: 1,
  deliveryMode: 'mock', prepared: {recipient: '5562991234567', templateVersion: 'order-summary-v1', bodyParameters: ['private']}};

test('histórico minimiza destinatário e exclui conteúdo, credenciais e erro externo', () => {
  const event = buildHistoryEvent({job, kind: 'attempt_finished', time: 123,
    outcome: {status: 'failed', code: 'provider_rejected', httpStatus: 401, metaCode: 190,
      token: 'secret', message: 'private', headers: {Authorization: 'secret'}}});
  assert.equal(event.recipientMasked, '***4567');
  assert.equal(event.operatorId, null);
  assert.equal(event.outcome.httpStatus, 401);
  assert.equal(event.outcome.metaCode, 190);
  assert.equal(/secret|private|5562991234567/.test(JSON.stringify(event)), false);
});

test('automático e manual têm identidade explícita sem inferir operador do cliente', () => {
  const manual = buildHistoryEvent({job: {...job, mode: 'manual', operatorId: 'staff-123'}, kind: 'attempt_started', time: 123});
  assert.equal(manual.mode, 'manual');
  assert.equal(manual.operatorId, 'staff-123');
  assert.throws(() => buildHistoryEvent({job: {...job, mode: 'manual'}, kind: 'attempt_started', time: 123}), /manual_operator_required/);
  assert.equal(buildHistoryEvent({job: {...job, operatorId: 'ignored'}, kind: 'created', time: 123}).operatorId, null);
});

test('campos inválidos não se tornam texto de erro persistido', () => {
  assert.deepEqual(sanitizeOutcome({status: 'token', code: 'customer_secret', httpStatus: 900, metaCode: -1,
    messageId: 'Bearer private'}), {status: 'unknown', code: 'unexpected_result'});
  assert.equal(maskRecipient('not a phone'), null);
  assert.throws(() => buildHistoryEvent({job, kind: 'arbitrary', time: 123}));
  assert.throws(() => buildHistoryEvent({job, kind: 'created', time: NaN}));
});

test('mesmo esquema registra manual sem usar a chave automática ou disparar mensagem', () => {
  const writes = [];
  const db = {doc: (path) => ({path})};
  const tx = {set: (ref, event) => writes.push({path: ref.path, event})};
  recordHistory(db, tx, {path: 'integrations/whatsapp/jobs/manual-request-1'}, {
    job: {...job, mode: 'manual', operatorId: 'staff-123'}, kind: 'attempt_finished', time: 123,
    outcome: {status: 'accepted', code: 'meta_accepted', messageId: 'wamid.manual'},
  });
  assert.equal(writes[0].path, 'integrations/whatsapp/jobs/manual-request-1/history/attempt_finished-1');
  assert.equal(writes[0].event.outcome.messageId, 'wamid.manual');
});

test('registro distingue falha da tentativa e agendamento de retry', () => {
  const event = buildHistoryEvent({job, kind: 'attempt_finished', time: 1000, retryAt: 61000,
    outcome: {status: 'failed', code: 'rate_limited'}});
  assert.equal(event.outcome.status, 'failed');
  assert.equal(event.retryScheduled, true);
  assert.equal(event.nextRetryAt, 61000);
});
