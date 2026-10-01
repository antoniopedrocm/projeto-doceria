const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createWhatsAppWorker, createWhatsAppWorkerFunctions, jobIdFor, JOBS, LEASE_MS, MAX_AGE_MS} = require('./whatsapp-worker');
const {createWhatsAppService} = require('./whatsapp');
const {buildCheckoutWhatsApp, CONSENT_VERSION} = require('./whatsapp-checkout');
const {DEV_PROJECT_ID} = require('./whatsapp-config');

const {memoryDb} = require('./whatsapp-test-support');
const {applyStatus} = require('./whatsapp-webhook');
const crypto = require('node:crypto');

const setup = ({mode = 'mock', service, project = DEV_PROJECT_ID} = {}) => {
  const db = memoryDb();
  let time = 1800000000000;
  const calls = [];
  const config = {enabled: true, automaticEnabled: true, automaticSince: time - 1000,
    mode, templateName: 'confirmacao_pedido_v1', templateLanguage: 'pt_BR',
    apiVersion: 'v25.0', phoneNumberId: mode === 'cloud' ? '12345' : null,
    allowedRecipients: ['5562991234567']};
  db.data.set('integrations/whatsapp/stores/matriz', config);
  const createEvent = (id = 'pedido1', overrides = {}) => {
    const order = {lojaId: 'matriz', origem: 'Plataforma', status: 'Pendente', telefone: '62991234567',
      clienteNome: 'Exemplo', itens: [{nome: 'Doce', quantity: 1, preco: 10}], total: 10,
      whatsappConfirmation: buildCheckoutWhatsApp({phone: '62991234567',
        consent: {accepted: true, version: CONSENT_VERSION}, serverTimestamp: () => time}), ...overrides};
    db.data.set(`lojas/matriz/pedidos/${id}`, structuredClone(order));
    return {id: `event-${id}`, params: {lojaId: 'matriz', pedidoId: id}, time: new Date(time).toISOString(),
      data: {data: () => structuredClone(order)}};
  };
  const worker = createWhatsAppWorker({db, now: () => time, getProjectId: () => project,
    service: {sendTemplate: async (prepared) => {
      calls.push(structuredClone(prepared));
      return service ? service(prepared, db) : {status: 'accepted', code: 'meta_accepted', messageId: 'wamid.test'};
    }}});
  return {db, calls, config, worker, createEvent, advance: (ms) => {time += ms;},
    job: (id = 'pedido1') => db.data.get(`${JOBS}/${jobIdFor('matriz', id)}`)};
};

test('pagamento online só admite job após PAID e replay não duplica', async () => {
  const f = setup();
  for (const payment_status of ['PENDING', 'FAILED', 'EXPIRED', 'CANCELLED']) {
    await f.worker.enqueue(f.createEvent('online', {payment_status}));
    assert.equal(f.job('online'), undefined);
  }
  await f.worker.enqueue(f.createEvent('online', {payment_status: 'PAID', requiresReview: true}));
  assert.equal(f.job('online'), undefined);
  const paid = f.createEvent('online', {payment_status: 'PAID', order_status: 'CONFIRMED'});
  await f.worker.enqueue(paid);
  await f.worker.enqueue(paid);
  assert.equal(f.job('online').status, 'queued');
  await f.worker.processJob(jobIdFor('matriz', 'online'));
  assert.equal(f.calls.length, 1);
});

test('gatilho de atualização admite apenas transição financeira confirmada sem reprocessar histórico', async () => {
  const f = setup();
  const register = (_options, handler) => handler;
  const triggers = createWhatsAppWorkerFunctions({db: f.db, worker: f.worker,
    onDocumentCreated: register, onDocumentUpdated: register, onSchedule: register});
  const run = (previous, order) => {
    const event = f.createEvent('online', order);
    return triggers.enqueuePaidWhatsAppConfirmation({...event, data: {
      before: {data: () => previous}, after: event.data,
    }});
  };
  await run({payment_status: 'PENDING'}, {payment_status: 'PENDING', order_status: 'PENDING'});
  await run({payment_status: 'PENDING'}, {payment_status: 'PAID', order_status: 'PENDING'});
  await run({payment_status: 'PAID'}, {payment_status: 'PAID', order_status: 'CONFIRMED'});
  await run({payment_status: 'PENDING'}, {payment_status: 'PAID', order_status: 'CONFIRMED', requiresReview: true});
  assert.equal(f.job('online'), undefined);
  for (let i = 0; i < 2; i++) await run({payment_status: 'PENDING'}, {payment_status: 'PAID', order_status: 'CONFIRMED'});
  assert.equal(f.job('online').status, 'queued');
  await f.worker.processJob(jobIdFor('matriz', 'online'));
  assert.equal(f.calls.length, 1);
});

test('revogação financeira entre enqueue e processamento impede envio', async () => {
  const f = setup();
  await f.worker.enqueue(f.createEvent('online', {payment_status: 'PAID'}));
  f.db.data.get('lojas/matriz/pedidos/online').payment_status = 'REFUNDED';
  await f.worker.processJob(jobIdFor('matriz', 'online'));
  assert.equal(f.calls.length, 0);
  assert.equal(f.job('online').code, 'order_no_longer_eligible');
});

test('status atual Em Produção continua elegível após admissão', async () => {
  const f = setup();
  await f.worker.enqueue(f.createEvent());
  f.db.data.get('lojas/matriz/pedidos/pedido1').status = 'Em Produção';
  await f.worker.processJob(jobIdFor('matriz', 'pedido1'));
  assert.equal(f.calls.length, 1);
});

test('webhook antes da resposta HTTP encerra job sem downgrade nem novo POST', async () => {
  const f = setup({mode: 'cloud', service: async (prepared, db) => {
    assert.ok(db.data.has(`integrations/whatsapp/correlations/${prepared.correlationId}`));
    await applyStatus({db, storeId: 'matriz', config: {phoneNumberId: '12345'}, event: {
      messageId: 'wamid.race', status: 'delivered', providerAt: 1800000000000,
      recipientHash: crypto.createHash('sha256').update(prepared.recipient).digest('hex'), correlationId: prepared.correlationId,
    }});
    return {status: 'failed', code: 'rate_limited'};
  }});
  await f.worker.enqueue(f.createEvent()); await f.worker.processJob(jobIdFor('matriz', 'pedido1'));
  assert.equal(f.job().status, 'delivered'); assert.equal(f.job().prepared, null);
  f.advance(360000); await f.worker.recover(); assert.equal(f.calls.length, 1);
  assert.ok(f.db.data.has(`${JOBS}/${jobIdFor('matriz', 'pedido1')}/history/late_result-1`));
});

test('aceitação cloud cria índice Meta; callback posterior dispensa identificador opaco', async () => {
  const f = setup({mode: 'cloud'});
  await f.worker.enqueue(f.createEvent()); await f.worker.processJob(jobIdFor('matriz', 'pedido1'));
  const result = await applyStatus({db: f.db, storeId: 'matriz', config: {phoneNumberId: '12345'}, event: {
    messageId: 'wamid.test', status: 'read', providerAt: 1800000000000,
    recipientHash: crypto.createHash('sha256').update('5562991234567').digest('hex'), correlationId: null,
  }});
  assert.equal(result, 'updated'); assert.equal(f.job().status, 'read');
});

test('eventos e consumidores concorrentes produzem uma única tentativa', async () => {
  const f = setup();
  const event = f.createEvent();
  await Promise.all(Array.from({length: 8}, () => f.worker.enqueue(event)));
  await Promise.all(Array.from({length: 8}, () => f.worker.processJob(jobIdFor('matriz', 'pedido1'))));
  assert.equal(f.calls.length, 1);
  assert.equal(f.job().status, 'accepted');
  assert.equal(f.job().attemptCount, 1);
  assert.equal(f.job().prepared, null);
  await f.worker.enqueue({...event, id: 'different-delivery-id'});
  await f.worker.recover();
  assert.equal(f.calls.length, 1);
});
test('gatilho do checkout matriz usa pedido físico e configuração interna sem duplicar job', async () => {
  const f = setup();
  const event = f.createEvent();
  const orderStoreId = 'ana-guimaraes-doceria-matriz';
  const order = f.db.data.get('lojas/matriz/pedidos/pedido1');
  f.db.data.delete('lojas/matriz/pedidos/pedido1');
  order.lojaId = orderStoreId;
  f.db.data.set(`lojas/${orderStoreId}/pedidos/pedido1`, order);
  event.params.lojaId = orderStoreId;
  event.data.data = () => structuredClone(order);

  await f.worker.enqueue(event);
  await f.worker.enqueue(event);
  assert.equal(f.job().storeId, 'matriz');
  assert.equal(f.job().orderStoreId, orderStoreId);
  await f.worker.processJob(jobIdFor('matriz', 'pedido1'));
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].storeId, 'matriz');
});

test('fila usa snapshot criado; edição posterior não altera conteúdo de retry', async () => {
  let attempt = 0;
  const f = setup({service: () => ++attempt === 1 ? {status: 'failed', code: 'rate_limited', retryAfterMs: 120000} :
    {status: 'accepted', code: 'meta_accepted', messageId: 'wamid.ok'}});
  await f.worker.enqueue(f.createEvent());
  const current = f.db.data.get('lojas/matriz/pedidos/pedido1');
  current.itens[0].nome = 'Outro doce'; current.total = 999;
  await f.worker.processJob(jobIdFor('matriz', 'pedido1'));
  assert.equal(f.job().status, 'retry');
  f.advance(60000); await f.worker.recover(); assert.equal(f.calls.length, 1);
  f.advance(60000); await f.worker.recover();
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[0].bodyParameters, f.calls[1].bodyParameters);
  assert.equal(f.calls[1].bodyParameters[2], 'R$ 10,00');
  assert.equal(f.job().status, 'accepted');
});

test('falha no enqueue ocorre fora da compra e é recuperável por reentrega', async () => {
  const f = setup(); const event = f.createEvent();
  f.db.failNextCommit();
  await assert.rejects(f.worker.enqueue(event));
  assert.equal(f.db.data.get('lojas/matriz/pedidos/pedido1').status, 'Pendente');
  assert.equal(f.job(), undefined);
  await f.worker.enqueue(event);
  await f.worker.recover();
  assert.equal(f.calls.length, 1);
});

test('falha de commit do claim nunca chama transporte', async () => {
  const f = setup(); await f.worker.enqueue(f.createEvent());
  f.db.failNextCommit();
  await assert.rejects(f.worker.processJob(jobIdFor('matriz', 'pedido1')));
  assert.equal(f.calls.length, 0);
  await f.worker.recover(); assert.equal(f.calls.length, 1);
});

test('aceitação seguida de falha ao salvar resultado não reenvia', async () => {
  const f = setup({service: (_, db) => {
    db.failNextCommit(); return {status: 'accepted', code: 'meta_accepted', messageId: 'wamid.sent'};
  }});
  await f.worker.enqueue(f.createEvent());
  await assert.rejects(f.worker.processJob(jobIdFor('matriz', 'pedido1')));
  assert.equal(f.job().status, 'processing');
  f.advance(LEASE_MS + 1); await f.worker.recover();
  assert.equal(f.job().status, 'unknown');
  assert.equal(f.calls.length, 1);
  await f.worker.recover(); assert.equal(f.calls.length, 1);
});

test('timeout, 5xx incerto e exceção não reexecutam pedido ou envio', async () => {
  for (const result of [{status: 'unknown', code: 'timeout'}, {status: 'unknown', code: 'provider_uncertain'}, null]) {
    const f = setup({service: () => {if (!result) throw new Error('sensitive'); return result;}});
    await f.worker.enqueue(f.createEvent()); await f.worker.recover();
    assert.equal(f.job().status, 'unknown');
    assert.equal(JSON.stringify(f.job()).includes('sensitive'), false);
    f.advance(LEASE_MS); await f.worker.recover(); assert.equal(f.calls.length, 1);
    assert.equal(f.db.data.get('lojas/matriz/pedidos/pedido1').status, 'Pendente');
  }
});

test('retry seguro é limitado a quatro tentativas', async () => {
  const f = setup({service: () => ({status: 'failed', code: 'credential_unavailable'})});
  await f.worker.enqueue(f.createEvent());
  for (let index = 0; index < 5; index++) {await f.worker.recover(); f.advance(500000);}
  assert.equal(f.calls.length, 4);
  assert.equal(f.job().status, 'failed');
});

test('4xx permanente é terminal', async () => {
  const f = setup({service: () => ({status: 'failed', code: 'provider_rejected', httpStatus: 401, metaCode: 190})});
  await f.worker.enqueue(f.createEvent()); await f.worker.recover();
  f.advance(60000); await f.worker.recover();
  assert.equal(f.calls.length, 1); assert.equal(f.job().lastResult.httpStatus, 401);
});

test('produção, configuração desligada, origens indevidas e eventos antigos não são enfileirados', async () => {
  const production = setup({project: 'ana-guimaraes'});
  await production.worker.enqueue(production.createEvent()); assert.equal(production.job(), undefined);
  for (const change of [{status: 'Cancelado'}, {origem: '99Food'}, {lojaId: 'outra'}]) {
    const f = setup(); await f.worker.enqueue(f.createEvent('pedido1', change)); assert.equal(f.job(), undefined);
  }
  const f = setup(); const event = f.createEvent(); f.config.automaticEnabled = false;
  await f.worker.enqueue(event); assert.equal(f.job(), undefined);
  f.config.automaticEnabled = true; f.advance(MAX_AGE_MS + 1);
  await f.worker.enqueue(event); assert.equal(f.job(), undefined);
});

test('revogação de consentimento, cancelamento ou troca de telefone interrompem a fila', async () => {
  for (const mutate of [(o) => {o.status = 'Cancelado';}, (o) => {o.whatsappConfirmation.consent.granted = false;},
    (o) => {o.telefone = '62991234568';}]) {
    const f = setup(); await f.worker.enqueue(f.createEvent());
    mutate(f.db.data.get('lojas/matriz/pedidos/pedido1'));
    await f.worker.recover(); assert.equal(f.calls.length, 0);
    assert.equal(f.job().status, 'skipped');
  }
});

test('mock não se transforma em envio real após alteração de configuração', async () => {
  const f = setup(); await f.worker.enqueue(f.createEvent());
  f.config.mode = 'cloud'; f.config.phoneNumberId = '12345';
  await f.worker.recover(); assert.equal(f.calls.length, 0);
  assert.equal(f.job().code, 'configuration_changed');
});

test('destinatário fora da lista DEV e novo pedido para mesmo destinatário são bloqueados', async () => {
  const f = setup({mode: 'cloud'});
  await f.worker.enqueue(f.createEvent()); await f.worker.recover();
  await f.worker.enqueue(f.createEvent('pedido2')); await f.worker.recover();
  assert.equal(f.calls.length, 1); assert.equal(f.job('pedido2').code, 'dev_quota_exceeded');
  f.config.allowedRecipients = ['5562990000000'];
  await f.worker.enqueue(f.createEvent('pedido3')); assert.equal(f.job('pedido3'), undefined);
});

test('limite de admissão contém criação massiva de jobs', async () => {
  const f = setup();
  for (let index = 0; index < 102; index++) await f.worker.enqueue(f.createEvent(`p${index}`));
  assert.equal([...f.db.data.keys()].filter((key) => key.startsWith(`${JOBS}/`) && key.split('/').length === 4).length, 100);
});

test('trabalhador integrado ao cliente HTTP trata indisponibilidade sem alterar compra', async () => {
  const f = setup({mode: 'cloud'});
  let httpCalls = 0;
  const service = createWhatsAppService({db: f.db, getProjectId: () => DEV_PROJECT_ID,
    createSecretClient: () => ({accessSecretVersion: async () => [{payload: {data: Buffer.from('synthetic-token')}}]}),
    fetchImpl: async () => {httpCalls++; return new Response(JSON.stringify({error: {code: 1}}), {status: 503});},
  });
  const worker = createWhatsAppWorker({db: f.db, now: () => 1800000000000, getProjectId: () => DEV_PROJECT_ID, service});
  await worker.enqueue(f.createEvent()); await worker.recover(); await worker.recover();
  assert.equal(httpCalls, 1); assert.equal(f.job().status, 'unknown');
  assert.equal(f.db.data.get('lojas/matriz/pedidos/pedido1').status, 'Pendente');
});

test('consumidor lento perde ownership sem outra tentativa ou sobrescrever recuperação', async () => {
  let release;
  let started;
  const begun = new Promise((resolve) => {started = resolve;});
  const f = setup({service: () => new Promise((resolve) => {release = resolve; started();})});
  await f.worker.enqueue(f.createEvent());
  const pending = f.worker.processJob(jobIdFor('matriz', 'pedido1'));
  await begun;
  f.advance(LEASE_MS + 1); await f.worker.recover();
  assert.equal(f.job().status, 'unknown');
  release({status: 'accepted', code: 'meta_accepted', messageId: 'wamid.late'});
  await pending;
  assert.equal(f.calls.length, 1);
  assert.equal(f.job().status, 'unknown');
});

test('ausência de consentimento e resumo inválido registram terminal sem chamar API', async () => {
  for (const [update, expected] of [[{whatsappConfirmation: null}, 'skipped'], [{total: -1}, 'failed']]) {
    const f = setup(); await f.worker.enqueue(f.createEvent('pedido1', update));
    await f.worker.recover(); assert.equal(f.calls.length, 0); assert.equal(f.job().status, expected);
  }
});

test('quota de vinte tentativas por loja em DEV é compartilhada entre jobs', async () => {
  const f = setup({mode: 'cloud'});
  const phones = Array.from({length: 20}, (_, i) => `6299123${String(4500 + i)}`);
  f.config.allowedRecipients = phones.map((p) => `55${p}`);
  for (let i = 0; i < 20; i++) {
    await f.worker.enqueue(f.createEvent(`order${i}`, {telefone: phones[i],
      whatsappConfirmation: buildCheckoutWhatsApp({phone: phones[i],
        consent: {accepted: true, version: CONSENT_VERSION}, serverTimestamp: () => 1800000000000})}));
  }
  await f.worker.recover(); assert.equal(f.calls.length, 20);
  await f.worker.enqueue(f.createEvent('extra', {telefone: phones[0],
    whatsappConfirmation: buildCheckoutWhatsApp({phone: phones[0],
      consent: {accepted: true, version: CONSENT_VERSION}, serverTimestamp: () => 1800000000000})}));
  await f.worker.recover();
  assert.equal(f.calls.length, 20); assert.equal(f.job('extra').code, 'dev_quota_exceeded');
});

test('transporte verifica desligamento automático ocorrido após claim', async () => {
  const f = setup();
  f.config.automaticEnabled = false;
  const service = createWhatsAppService({db: f.db, getProjectId: () => DEV_PROJECT_ID,
    fetchImpl: () => {throw new Error('must not send');}});
  const result = await service.sendTemplate({storeId: 'matriz', recipient: '5562991234567',
    bodyParameters: ['test'], expectedDelivery: {mode: 'mock', phoneNumberId: null}});
  assert.equal(result.code, 'delivery_configuration_changed');
});

const history = (f, orderId = 'pedido1') => [...f.db.data.entries()]
    .filter(([key]) => key.startsWith(`${JOBS}/${jobIdFor('matriz', orderId)}/history/`))
    .map(([, value]) => value);

test('histórico guarda cada tentativa de retry e persiste máscara depois de limpar payload', async () => {
  let attempt = 0;
  const f = setup({service: () => ++attempt === 1 ? {status: 'failed', code: 'rate_limited', httpStatus: 429} :
    {status: 'accepted', code: 'meta_accepted', messageId: 'wamid.result'}});
  await f.worker.enqueue(f.createEvent()); await f.worker.recover();
  f.advance(60000); await f.worker.recover();
  const events = history(f);
  assert.equal(events.length, 5);
  assert.equal(events.filter((e) => e.kind === 'attempt_started').length, 2);
  const finished = events.filter((e) => e.kind === 'attempt_finished');
  assert.equal(finished[0].outcome.httpStatus, 429);
  assert.equal(finished[0].retryScheduled, true);
  assert.equal(finished[1].outcome.messageId, 'wamid.result');
  assert.equal(f.job().prepared, null);
  assert.equal(f.job().recipientMasked, '***4567');
  assert.ok(events.every((event) => event.mode === 'automatic' && event.operatorId === null));
  assert.equal(JSON.stringify(events).includes('5562991234567'), false);
});

test('histórico não duplica eventos sob concorrência e reentrega', async () => {
  const f = setup(); const event = f.createEvent();
  await Promise.all(Array.from({length: 5}, () => f.worker.enqueue(event)));
  await Promise.all(Array.from({length: 5}, () => f.worker.processJob(jobIdFor('matriz', 'pedido1'))));
  await f.worker.enqueue(event); await f.worker.recover();
  assert.equal(history(f).length, 3);
  assert.equal(f.calls.length, 1);
});

test('falha de commit não registra tentativa inexistente nem perde início da tentativa incerta', async () => {
  const f = setup({service: (_, db) => {db.failNextCommit(); return {status: 'accepted', code: 'meta_accepted'};}});
  await f.worker.enqueue(f.createEvent());
  f.db.failNextCommit(); await assert.rejects(f.worker.processJob(jobIdFor('matriz', 'pedido1')));
  assert.equal(history(f).length, 1);
  await assert.rejects(f.worker.processJob(jobIdFor('matriz', 'pedido1')));
  assert.equal(history(f).filter((e) => e.kind === 'attempt_started').length, 1);
  assert.equal(history(f).filter((e) => e.kind === 'attempt_finished').length, 0);
  f.advance(LEASE_MS + 1); await f.worker.recover();
  assert.equal(history(f).find((e) => e.kind === 'lease_expired').outcome.status, 'unknown');
  assert.equal(f.calls.length, 1);
});

test('resposta tardia preserva ID Meta no histórico sem reabrir job indeterminado', async () => {
  let release;
  let started;
  const begun = new Promise((resolve) => {started = resolve;});
  const f = setup({service: () => new Promise((resolve) => {release = resolve; started();})});
  await f.worker.enqueue(f.createEvent());
  const pending = f.worker.processJob(jobIdFor('matriz', 'pedido1'));
  await begun; f.advance(LEASE_MS + 1); await f.worker.recover();
  release({status: 'accepted', code: 'meta_accepted', messageId: 'wamid.late'}); await pending;
  assert.equal(f.job().status, 'unknown');
  assert.equal(history(f).find((e) => e.kind === 'late_result').outcome.messageId, 'wamid.late');
  assert.equal(f.calls.length, 1);
});

test('interrupção sem chamada e job legado ficam rastreáveis sem backfill inventado', async () => {
  const f = setup(); await f.worker.enqueue(f.createEvent());
  // Simulate an already queued phase-4 job without phase-5 metadata/history.
  delete f.job().recipientMasked; delete f.job().templateVersion;
  for (const key of [...f.db.data.keys()]) if (key.includes('/history/')) f.db.data.delete(key);
  f.config.automaticEnabled = false;
  await f.worker.recover();
  const events = history(f);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'stopped');
  assert.equal(events[0].attempt, 0);
  assert.equal(events[0].recipientMasked, '***4567');
  assert.equal(f.calls.length, 0);
});
