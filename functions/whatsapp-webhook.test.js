const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {memoryDb} = require('./whatsapp-test-support');
const {createWhatsAppWebhook} = require('./whatsapp-webhook');
const {DEV_PROJECT_ID} = require('./whatsapp-config');
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const correlationId = '11111111-1111-4111-8111-111111111111';
const jobId = 'a'.repeat(64);
const path = `integrations/whatsapp/jobs/${jobId}`;
const config = {webhookEnabled: true, wabaId: '123', phoneNumberId: '456'};
const payload = (status = 'delivered', extra = {}) => ({object: 'whatsapp_business_account', entry: [{id: '123', changes: [{
  field: 'messages', value: {messaging_product: 'whatsapp', metadata: {phone_number_id: '456'}, statuses: [{
    id: 'wamid.test', recipient_id: '5562991234567', status, timestamp: '1800000000',
    biz_opaque_callback_data: correlationId, ...extra,
  }]},
}]}]});
const setup = (options = {}) => {
  const db = memoryDb();
  db.data.set('integrations/whatsapp/stores/matriz', {...config});
  db.data.set(`integrations/whatsapp/correlations/${correlationId}`, {jobId, storeId: 'matriz', attempt: 1,
    phoneNumberId: '456', recipientHash: hash('5562991234567')});
  db.data.set(path, {storeId: 'matriz', orderId: 'pedido1', mode: 'automatic', deliveryMode: 'cloud',
    phoneNumberId: '456', attemptCount: 1, status: 'unknown', code: 'timeout', recipientMasked: '***4567', prepared: null});
  const logs = [];
  const handler = createWhatsAppWebhook({db, getProjectId: () => DEV_PROJECT_ID, now: () => 1800000000000,
    readSecret: async () => 'secret', logger: {info: (...args) => logs.push(args)}, ...options});
  const send = async (body = payload(), overrides = {}) => {
    const rawBody = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const req = {method: 'POST', path: '/matriz', rawBody,
      get: () => `sha256=${crypto.createHmac('sha256', 'secret').update(rawBody).digest('hex')}`, ...overrides};
    const res = {status(code) {this.code = code; return this;}, type() {return this;}, send(text) {this.text = text; return this;}};
    await handler(req, res);
    return res;
  };
  return {db, send, logs, job: () => db.data.get(path), history: () => [...db.data].filter(([key]) => key.startsWith(`${path}/history/`))};
};
test('GET verifica token e devolve challenge sem alteração', async () => {
  const f = setup();
  const query = {'hub.mode': 'subscribe', 'hub.verify_token': 'secret', 'hub.challenge': '123456'};
  const result = await f.send({}, {method: 'GET', query});
  assert.equal(result.code, 200); assert.equal(result.text, '123456');
  assert.equal((await f.send({}, {method: 'GET', query: {...query, 'hub.verify_token': ['secret']}})).code, 403);
  assert.equal(f.history().length, 0);
});
test('ambiente, path, método, configuração e segredos falham fechados', async () => {
  assert.equal((await setup({getProjectId: () => 'ana-guimaraes'}).send()).code, 403);
  assert.equal((await setup().send({}, {path: '/../matriz'})).code, 404);
  assert.equal((await setup().send({}, {method: 'PUT'})).code, 405);
  assert.equal((await setup({readSecret: async () => {throw Error('secret value');}}).send()).code, 503);
  const f = setup(); f.db.data.set('integrations/whatsapp/stores/matriz', {});
  assert.equal((await f.send()).code, 403);
});
test('assinatura usa rawBody, rejeita adulteração e limita tamanho', async () => {
  const f = setup();
  for (const signature of [undefined, 'sha256=bad', `sha256=${'0'.repeat(64)}`]) {
    assert.equal((await f.send(payload(), {get: () => signature})).code, 401);
  }
  assert.equal((await f.send(payload(), {rawBody: Buffer.alloc(262145)})).code, 413);
  assert.equal((await f.send('invalid json')).code, 400);
  assert.equal((await f.send(payload(), {body: {evil: true}})).code, 200);
  assert.equal(f.job().status, 'delivered');
});
test('valida lote inteiro antes de gravar e ignora mensagens recebidas', async () => {
  const f = setup(); const body = payload();
  body.entry[0].changes[0].value.statuses.push({status: 'read'});
  assert.equal((await f.send(body)).code, 400); assert.equal(f.history().length, 0);
  const inbound = payload(); delete inbound.entry[0].changes[0].value.statuses;
  inbound.entry[0].changes[0].value.messages = [{text: {body: 'private'}}];
  assert.equal((await f.send(inbound)).code, 200); assert.equal(f.history().length, 0);
});
test('duplicação concorrente e fora de ordem preservam read e histórico mínimo', async () => {
  const f = setup();
  await Promise.all(Array.from({length: 8}, () => f.send(payload('read'))));
  await f.send(payload('delivered')); await f.send(payload('sent'));
  await f.send(payload('failed', {errors: [{code: 131000, message: 'sensitive'}]}));
  await f.send(payload('read', {timestamp: '1800000100'}));
  assert.equal(f.job().status, 'read'); assert.equal(f.history().length, 4);
  assert.equal(f.job().nextRunAt, Number.MAX_SAFE_INTEGER);
  const serialized = JSON.stringify([f.history(), f.logs]);
  assert.ok(!serialized.includes('5562991234567')); assert.ok(!serialized.includes('sensitive'));
  assert.equal(f.history().filter(([, e]) => e.applied).length, 1);
});
test('reconcilia unknown e falha sem retry; evidencia positiva supera failed', async () => {
  const f = setup(); await f.send(payload('failed', {errors: [{code: 131000}]}));
  assert.equal(f.job().status, 'failed'); assert.equal(f.job().delivery.metaCode, 131000);
  await f.send(payload('sent')); assert.equal(f.job().status, 'failed');
  await f.send(payload('delivered')); assert.equal(f.job().status, 'delivered');
  assert.equal(f.job().owner, null);
});
test('correlação por ID Meta funciona sem callback após indexação', async () => {
  const f = setup(); await f.send();
  await f.send(payload('read', {biz_opaque_callback_data: undefined}));
  assert.equal(f.job().status, 'read');
});
test('não mistura loja, remetente, WABA, destinatário, tentativa ou ID Meta', async () => {
  for (const mutate of [
    (b) => {b.entry[0].id = '999';},
    (b) => {b.entry[0].changes[0].value.metadata.phone_number_id = '999';},
    (b) => {b.entry[0].changes[0].value.statuses[0].recipient_id = '5562991234568';},
    (b, f) => {f.job().attemptCount = 2;},
    (b, f) => {f.job().storeId = 'outra';},
    (b, f) => {f.job().lastResult = {messageId: 'wamid.other'};},
    (b) => {b.entry[0].changes[0].value.statuses[0].biz_opaque_callback_data = undefined;},
    (b) => {b.entry[0].changes[0].value.statuses[0].biz_opaque_callback_data = 'another-application';},
  ]) {
    const f = setup(); const body = payload(); mutate(body, f);
    assert.equal((await f.send(body)).code, 200); assert.equal(f.history().length, 0);
  }
});
test('falha atômica permite reentrega sem histórico parcial', async () => {
  const f = setup(); f.db.failNextCommit();
  assert.equal((await f.send()).code, 503); assert.equal(f.job().status, 'unknown'); assert.equal(f.history().length, 0);
  assert.equal((await f.send()).code, 200); assert.equal(f.history().length, 1);
});
