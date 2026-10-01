const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {memoryDb} = require('./whatsapp-test-support');
const {createWhatsAppAdmin} = require('./whatsapp-admin');
const {createWhatsAppWorker, JOBS, jobIdFor} = require('./whatsapp-worker');
const {createWhatsAppService} = require('./whatsapp');
const {buildCheckoutWhatsApp, CONSENT_VERSION} = require('./whatsapp-checkout');
const {DEV_PROJECT_ID} = require('./whatsapp-config');
const {applyStatus} = require('./whatsapp-webhook');
const setup = () => {
  const db = memoryDb(); let time = 1800000000000; const calls = [];
  const profile = {role: 'atendente', lojaId: 'matriz', status: 'ativo'};
  const config = {enabled: true, manualEnabled: true, automaticEnabled: false, mode: 'mock',
    templateName: 'confirmacao_pedido_v1', templateLanguage: 'pt_BR'};
  const order = {lojaId: 'matriz', status: 'Pendente', telefone: '62991234567', total: 10,
    itens: [{nome: 'Doce', quantity: 1, preco: 10}], whatsappConfirmation: buildCheckoutWhatsApp({phone: '62991234567',
      consent: {accepted: true, version: CONSENT_VERSION}, serverTimestamp: () => time})};
  db.data.set('users/operator', profile); db.data.set('integrations/whatsapp/stores/matriz', config);
  db.data.set('lojas/matriz/pedidos/pedido1', order);
  const options = {db, now: () => time, getProjectId: () => DEV_PROJECT_ID, getAuthUser: async () => ({disabled: false})};
  const admin = createWhatsAppAdmin(options);
  const request = {auth: {uid: 'operator'}, data: {storeId: 'matriz', orderId: 'pedido1', requestId: crypto.randomUUID(), confirmResend: true}};
  const worker = createWhatsAppWorker({...options, service: {sendTemplate: async (input) => {
    calls.push(input); return {status: 'simulated', code: 'mock_only'};
  }}});
  return {db, options, admin, request, profile, config, order, calls, worker,
    advance: () => {time += 61000;}, next: () => ({...request, data: {...request.data, requestId: crypto.randomUUID()}})};
};
test('autenticação, status ativo, módulo pedidos e escopo são exigidos para consulta e reenvio', async () => {
  for (const change of [
    f => {f.request.auth = null;}, f => {f.profile.status = 'inativo';},
    f => {f.profile.lojaId = 'outra';}, f => {f.profile.role = 'cozinha';},
    f => {f.profile.permissions = {pedidos: false};},
    f => {f.db.data.set('customProfiles/operator', {permissions: {pedidos: false}});},
    f => {f.options.getAuthUser = async () => ({disabled: true}); f.admin = createWhatsAppAdmin(f.options);},
    f => {f.options.getProjectId = () => 'ana-guimaraes'; f.admin = createWhatsAppAdmin(f.options);},
  ]) {
    const f = setup(); change(f);
    await assert.rejects(() => f.admin.getStatus(f.request));
    await assert.rejects(() => f.admin.requestManual(f.request));
    assert.equal([...f.db.data.keys()].filter(k => k.startsWith(JOBS)).length, 0);
  }
});
test('valida IDs, confirmação e pedido da loja sem aceitar dados de mensagem do cliente', async () => {
  const f = setup();
  for (const data of [{storeId: '../x'}, {orderId: 'x/y'}, {requestId: 'bad'}, {confirmResend: false}]) {
    await assert.rejects(() => f.admin.requestManual({...f.request, data: {...f.request.data, ...data}}));
  }
  f.request.data.recipient = '123'; f.request.data.bodyParameters = ['injected'];
  const {job} = await f.admin.requestManual(f.request);
  const saved = f.db.data.get(`${JOBS}/${job.id}`);
  assert.equal(saved.prepared.recipient, '5562991234567'); assert.ok(!saved.prepared.bodyParameters.includes('injected'));
  assert.equal(saved.operatorId, 'operator'); assert.equal(saved.mode, 'manual');
});
test('pedido do checkout matriz usa caminho canônico e configuração/secret internos sem ampliar autorização', async () => {
  const f = setup();
  const orderStoreId = 'ana-guimaraes-doceria-matriz';
  f.profile.lojaId = orderStoreId;
  f.order.lojaId = orderStoreId;
  f.db.data.delete('lojas/matriz/pedidos/pedido1');
  f.db.data.set(`lojas/${orderStoreId}/pedidos/pedido1`, f.order);
  f.request.data.storeId = orderStoreId;

  const {job} = await f.admin.requestManual(f.request);
  const saved = f.db.data.get(`${JOBS}/${job.id}`);
  assert.equal(saved.storeId, 'matriz');
  assert.equal(saved.orderStoreId, orderStoreId);
  await f.worker.processJob(job.id);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].storeId, 'matriz');
  assert.equal((await f.admin.getStatus(f.request)).jobs[0].id, job.id);

  await assert.rejects(() => f.admin.requestManual({
    ...f.request, data: {...f.request.data, storeId: 'matriz', requestId: crypto.randomUUID()},
  }), {code: 'permission-denied'});
});
test('mesma intenção concorrente admite um job; outra intenção pendente é bloqueada', async () => {
  const f = setup();
  const results = await Promise.all(Array.from({length: 8}, () => f.admin.requestManual(f.request)));
  assert.equal(new Set(results.map(r => r.job.id)).size, 1);
  assert.equal(results.filter(r => !r.duplicate).length, 1);
  await assert.rejects(() => f.admin.requestManual(f.next()), {code: 'failed-precondition'});
  await f.worker.processJob(results[0].job.id); assert.equal(f.calls.length, 1);
  assert.equal((await f.admin.requestManual(f.request)).duplicate, true);
});
test('reenvio independe do job automático aceito/falho e da chave automática desligada', async () => {
  for (const status of ['accepted', 'failed', 'unknown']) {
    const f = setup();
    const auto = {storeId: 'matriz', orderId: 'pedido1', status, createdAt: 1};
    f.db.data.set(`${JOBS}/${jobIdFor('matriz', 'pedido1')}`, auto);
    const {job} = await f.admin.requestManual(f.request); await f.worker.processJob(job.id);
    assert.equal(f.calls.length, 1); assert.equal(auto.status, status);
    const manual = f.db.data.get(`${JOBS}/${job.id}`); assert.equal(manual.status, 'simulated');
    assert.equal(f.calls[0].expectedDelivery.manual, true);
  }
});
test('novo reenvio após sucesso tem ID próprio e respeita intervalo', async () => {
  const f = setup(); const first = await f.admin.requestManual(f.request); await f.worker.processJob(first.job.id);
  await assert.rejects(() => f.admin.requestManual(f.next()), {code: 'resource-exhausted'});
  f.advance(); const second = await f.admin.requestManual(f.next()); await f.worker.processJob(second.job.id);
  assert.notEqual(first.job.id, second.job.id); assert.equal(f.calls.length, 2);
});
test('falha de commit da solicitação é atômica e pode ser repetida', async () => {
  const f = setup(); f.db.failNextCommit(); await assert.rejects(() => f.admin.requestManual(f.request));
  assert.equal([...f.db.data.keys()].filter(k => k.startsWith(JOBS)).length, 0);
  assert.equal((await f.admin.requestManual(f.request)).duplicate, false);
});
test('consentimento, telefone, configuração e cancelamento impedem admissão', async () => {
  for (const change of [f => {f.order.whatsappConfirmation.consent.granted = false;},
    f => {f.order.telefone = 'invalid';}, f => {f.config.manualEnabled = false;},
    f => {f.order.status = 'Cancelado';}, f => {f.order.lojaId = 'outra';}]) {
    const f = setup(); change(f); await assert.rejects(() => f.admin.requestManual(f.request));
  }
});
test('worker revalida operador, consentimento e desligamento após admissão', async () => {
  for (const change of [f => {f.profile.status = 'inativo';}, f => {f.profile.lojaId = 'outra';},
    f => {f.config.manualEnabled = false;}, f => {f.order.whatsappConfirmation.consent.granted = false;}]) {
    const f = setup(); const {job} = await f.admin.requestManual(f.request); change(f);
    await f.worker.processJob(job.id); assert.equal(f.calls.length, 0);
    assert.equal(f.db.data.get(`${JOBS}/${job.id}`).status, 'skipped');
  }
});
test('consulta expõe somente projeção autorizada e histórico limitado', async () => {
  const f = setup(); const {job} = await f.admin.requestManual(f.request); await f.worker.processJob(job.id);
  const view = await f.admin.getStatus({...f.request, data: {...f.request.data, includeHistory: true}});
  assert.equal(view.jobs.length, 1); assert.equal(view.jobs[0].history.length, 3);
  assert.equal(view.jobs[0].operatorId, 'operator'); assert.equal(view.jobs[0].recipientMasked, '***4567');
  assert.equal(view.manualEnabled, true);
  const text = JSON.stringify(view); for (const secret of ['5562991234567', 'bodyParameters', 'phoneNumberId', 'owner', 'correlationId']) assert.ok(!text.includes(secret));
  assert.equal((await f.admin.getStatus(f.request)).jobs[0].history.length, 0);
});
test('serviço permite manual quando automático está desligado, mas respeita chave manual', async () => {
  const f = setup(); const service = createWhatsAppService({db: f.db, getProjectId: () => DEV_PROJECT_ID});
  const input = {storeId: 'matriz', recipient: '5562991234567', expectedDelivery: {mode: 'mock', phoneNumberId: null, manual: true}};
  assert.equal((await service.sendTemplate(input)).status, 'simulated');
  f.config.manualEnabled = false; assert.equal((await service.sendTemplate(input)).code, 'delivery_configuration_changed');
});
test('manual finalizado usa pedido salvo; falha temporária não gera retry automático', async () => {
  const f = setup(); f.order.status = 'Finalizado';
  const {job} = await f.admin.requestManual(f.request);
  let count = 0;
  const worker = createWhatsAppWorker({...f.options, service: {sendTemplate: async () => {count++; return {status: 'failed', code: 'rate_limited'};}}});
  await worker.processJob(job.id); f.advance(); await worker.recover();
  assert.equal(count, 1); assert.equal(f.db.data.get(`${JOBS}/${job.id}`).status, 'failed');
});

test('cloud manual mantém allowlist/quota própria e recibos com operador', async () => {
  const f = setup();
  Object.assign(f.config, {mode: 'cloud', apiVersion: 'v25.0', phoneNumberId: '12345', allowedRecipients: ['5562991234567']});
  let calls = 0;
  const worker = createWhatsAppWorker({...f.options, service: {sendTemplate: async () => {
    calls++; return {status: 'accepted', code: 'meta_accepted', messageId: `wamid.manual${calls}`};
  }}});
  const first = await f.admin.requestManual(f.request); await worker.processJob(first.job.id);
  const recipientHash = crypto.createHash('sha256').update('5562991234567').digest('hex');
  assert.equal(await applyStatus({db: f.db, storeId: 'matriz', config: f.config, event: {
    messageId: 'wamid.manual1', status: 'delivered', providerAt: 1800000000000, recipientHash,
  }}), 'updated');
  const history = await f.admin.getStatus({...f.request, data: {...f.request.data, includeHistory: true}});
  assert.equal(history.jobs[0].status, 'delivered'); assert.equal(history.jobs[0].operatorId, 'operator');
  for (let i = 0; i < 4; i++) {
    f.advance(); const {job} = await f.admin.requestManual(f.next()); await worker.processJob(job.id);
  }
  assert.equal(calls, 4);
  const recent = await f.admin.getStatus(f.request); assert.equal(recent.jobs[0].code, 'dev_quota_exceeded');
  f.config.allowedRecipients = ['5562999999999']; f.advance();
  await assert.rejects(() => f.admin.requestManual(f.next()), {code: 'failed-precondition'});
});
