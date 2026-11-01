const {before, after, test} = require('node:test');
const assert = require('node:assert/strict');
const {HttpsError} = require('firebase-functions/v2/https');
const {createFiscalFunctions} = require('./fiscal');

const records = new Map();
const recordVersions = new Map();
let sequence = 0;
let transactionQueue = Promise.resolve();
const sent = [];
const fieldValue = {
  serverTimestamp: () => ({kind: 'timestamp'}),
  arrayUnion: (...values) => ({kind: 'union', values}),
  delete: () => ({kind: 'delete'}),
};
const timestamp = () => new Date();
const nested = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
const snapshot = (ref) => ({
  id: ref.id,
  exists: records.has(ref.path),
  updateTime: {seconds: recordVersions.get(ref.path) || 0, nanoseconds: 0},
  data: () => records.get(ref.path),
  get: (field) => nested(records.get(ref.path), field),
});
const write = (ref, data, merge = false) => {
  const result = merge ? {...(records.get(ref.path) || {})} : {};
  for (const [key, value] of Object.entries(data)) {
    if (value?.kind === 'delete') {
      delete result[key];
    } else if (value?.kind === 'union') {
      result[key] = [...(result[key] || []), ...value.values];
    } else if (key.includes('.')) {
      const parts = key.split('.');
      let target = result;
      for (const part of parts.slice(0, -1)) target = target[part] ||= {};
      target[parts.at(-1)] = value;
    } else {
      result[key] = value;
    }
  }
  records.set(ref.path, result);
  recordVersions.set(ref.path, (recordVersions.get(ref.path) || 0) + 1);
};
const ref = (path) => ({
  path, id: path.split('/').at(-1),
  get: async function() { return snapshot(this); },
  set: async function(data, options = {}) { write(this, data, options.merge); },
  update: async function(data) { write(this, data, true); },
  collection: (name) => collection(`${path}/${name}`),
});
const collection = (path, filters = []) => ({
  doc: (id = `generated-${++sequence}`) => ref(`${path}/${id}`),
  select: () => collection(path, filters),
  limit: () => collection(path, filters),
  where: (field, operator, value) => collection(path, [...filters, {field, operator, value}]),
  get: async () => ({forEach: function(callback) { this.docs.forEach(callback); }, docs: [...records.keys()].filter((key) => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1)
    .map((key) => snapshot(ref(key)))
    .filter((item) => filters.every(({field, operator, value}) => {
      const actual = item.get(field);
      return operator === '>=' ? actual >= value : operator === '<=' ? actual <= value : actual === value;
    }))}),
});
const db = {
  collection,
  runTransaction: async (callback) => {
    const previous = transactionQueue;
    let release;
    transactionQueue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const writes = [];
      const result = await callback({
        get: async (document) => document.get(),
        set: (document, data, options = {}) => writes.push(() => write(document, data, options.merge)),
        update: (document, data) => writes.push(() => write(document, data, true)),
        create: (document, data) => {if (records.has(document.path)) throw new Error("Document exists"); writes.push(() => write(document, data));},
      });
      writes.forEach((apply) => apply());
      return result;
    } finally {
      release();
    }
  },
};
const artifacts = new Map();
const admin = {firestore: {FieldValue: fieldValue, Timestamp: {now: timestamp}}, storage: () => ({bucket: () => ({file: (path) => ({download: async () => [Buffer.from(artifacts.get(path) || '')]})})})};
let api;
let originalFetch;
const storeId = 'loja-a';
const call = (name, data, uid = 'owner') => api[name]({auth: {uid}, data: {lojaId: storeId, ...data}});
const form = () => ({
  customer: {name: 'Maria', document: '52998224725', address: {street: 'Rua A', number: '10', district: 'Centro', city: 'Goiania', cityCode: '5208707', state: 'GO', zip: '74000000'}},
  operationCfop: '5101', paymentMethodCode: '01',
  items: [{code: 'B1', description: 'Brigadeiro', ncm: '19059090', unit: 'un', quantity: 2, unitPrice: 10, discount: 0, origin: 0, csosn: '102', pisCst: '49', cofinsCst: '49'}],
});

before(() => {
  process.env.FISCAL_SERVICE_URL = 'http://127.0.0.1:19999';
  originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(options.body);
    sent.push({path, body, url});
    const response = path === '/capabilities' ? {inutilize: true, year: new Date().getUTCFullYear()}
      : path === '/validate' ? {ok: true, errors: []}
      : path === '/issue' ? {status: 'authorized', key: `key-${body.invoice.model}-${body.invoice.number}`, protocol: 'protocol-1', cStat: 100, xMotivo: 'Autorizado'}
        : path === '/cancel' ? {status: 'cancelled', cancelProtocol: 'cancel-1', cStat: 135, xMotivo: 'Evento aceito'}
          : {status: 'inutilized', protocol: 'inut-1', cStat: 102, xMotivo: 'Inutilização aceita'};
    return {ok: true, status: 200, text: async () => JSON.stringify(response)};
  };
  write(ref(`lojas/${storeId}/fiscalConfig/issuer`), {cnpj: '37185245000140', legalName: 'Ana Doceria', stateRegistration: '108911454', taxRegime: 1, address: {street: 'Av Comercial', number: '441', district: 'Centro', city: 'Goiania', cityCode: '5208707', state: 'GO', zip: '74465120'}});
  write(ref(`lojas/${storeId}/fiscalConfig/settings`), {environment: 'homologation', nfeSeries: 1, nfceSeries: 2, operationNature: 'Venda', defaultPaymentMethodCode: '01'});
  write(ref(`lojas/${storeId}/fiscalConfig/certificate`), {status: 'active', certPfxSecretVersion: 'secret/1', certPasswordSecretVersion: 'secret/2', nfceCscSecretVersion: 'secret/3', nfceCscIdSecretVersion: 'secret/4'});
  api = createFiscalFunctions({admin, db, HttpsError, logger: {error: () => {}, warn: () => {}}, onCall: (...args) => args.at(-1),
    verifyManagementAccess: async (uid) => {
      if (uid === 'accountant') throw new HttpsError('permission-denied', 'Consulta somente.');
      return uid === 'owner' || uid === 'disabled' ? {role: 'dono', allStores: true} : {role: 'gerente', stores: ['outra-loja']};
    },
    verifyStoreReadAccess: async (uid) => uid === 'owner' || uid === 'disabled'
      ? {role: 'dono', allStores: true}
      : uid === 'emitter' ? {role: 'funcionario', stores: [storeId], permissions: {'nota-fiscal': true}}
        : uid === 'accountant' ? {role: 'contador', stores: [storeId], permissions: {'nota-fiscal': false}}
        : uid === 'accountant-authorized' ? {role: 'contador', stores: [storeId], permissions: {'nota-fiscal': true}}
          : {role: 'gerente', stores: ['outra-loja']},
    userHasAccessToStores: (stores, requested) => requested.every((id) => stores.includes(id)), STORE_ALL_KEY: 'all'});
});
after(() => { global.fetch = originalFetch; delete process.env.FISCAL_SERVICE_URL; });

test('rascunhos usam a URL global de produção e preservam administração fiscal do Contador autorizado', async () => {
  write(ref('integrations/fiscal'), {serviceUrl: 'http://127.0.0.1:19999'});
  const previous = process.env.FISCAL_SERVICE_URL;
  const previousSentLength = sent.length;
  process.env.FISCAL_SERVICE_URL = 'http://127.0.0.1:20001';
  try {
    const saved = await call('fiscalSaveDraft', {model: 55, manualInvoice: form()}, 'accountant-authorized');
    const expectNoTransmission = sent.filter((entry) => entry.path === '/issue').length;
    const checked = await call('fiscalCheckDraft', {draftId: saved.draftId}, 'accountant-authorized');
    assert.equal(checked.ok, true);
    assert.equal(sent.at(-1).url, 'http://127.0.0.1:19999/validate');
    assert.equal(sent.filter((entry) => entry.path === '/issue').length, expectNoTransmission);
    await assert.rejects(call('fiscalSaveConfiguration', {settings: {serviceUrl: 'http://127.0.0.1:20002'}}, 'accountant-authorized'), {code: 'permission-denied'});
  } finally {
    process.env.FISCAL_SERVICE_URL = previous;
    records.delete('integrations/fiscal');
    sent.splice(previousSentLength);
  }
});

test('rascunho salva sem transmitir, permanece editável e a checagem lista pendências específicas', async () => {
  const input = form();
  input.customer.document = '52998224726';
  input.customer.address.zip = '74000';
  input.items[0].ncm = '';
  const saved = await call('fiscalSaveDraft', {model: 55, manualInvoice: input});
  const invoice = records.get(`lojas/${storeId}/invoices/${saved.draftId}`);
  assert.equal(invoice.status, 'draft');
  assert.equal(invoice.number, null);
  assert.equal(sent.length, 0);
  const invalid = await call('fiscalCheckDraft', {draftId: saved.draftId});
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(' '), /CPF\/CNPJ inválido/);
  assert.match(invalid.errors.join(' '), /CEP deve possuir 8 dígitos/);
  assert.match(invalid.errors.join(' '), /NCM válido/);
  await assert.rejects(call('fiscalIssueDraft', {draftId: saved.draftId, model: 55}), /CPF\/CNPJ inválido/);
  await call('fiscalSaveDraft', {draftId: saved.draftId, model: 55, manualInvoice: form()});
  const ready = await call('fiscalCheckDraft', {draftId: saved.draftId});
  assert.equal(ready.ok, true);
  assert.equal(ready.preview.number, null);
  assert.equal(ready.preview.totals.invoice, 20);
  const [issued, duplicate] = await Promise.all([
    call('fiscalIssueDraft', {draftId: saved.draftId, model: 55}),
    call('fiscalIssueDraft', {draftId: saved.draftId, model: 55}),
  ]);
  assert.equal(issued.status, 'authorized');
  assert.ok(['validating', 'authorized'].includes(duplicate.status));
  assert.equal(sent.filter((item) => item.path === '/issue').length, 1);
  assert.equal(sent.find((item) => item.path === '/issue').body.invoice.model, 55);
  await assert.rejects(call('fiscalSaveDraft', {draftId: saved.draftId, model: 55, manualInvoice: form()}), /Somente rascunhos/);
});

test('rascunho manual é salvo mesmo sem modelo e só libera emissão após completar e validar', async () => {
  const input = form();
  input.customer.name = '';
  const issueCallsBefore = sent.filter((item) => item.path === '/issue').length;
  const saved = await call('fiscalSaveDraft', {model: null, manualInvoice: input});
  assert.equal(records.get(`lojas/${storeId}/invoices/${saved.draftId}`).status, 'draft');
  assert.equal(records.get(`lojas/${storeId}/invoices/${saved.draftId}`).model, null);
  assert.equal(sent.filter((item) => item.path === '/issue').length, issueCallsBefore);
  const incomplete = await call('fiscalCheckDraft', {draftId: saved.draftId});
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.errors.join(' '), /selecione NF-e ou NFC-e/);
  input.customer.name = 'Maria Silva';
  await call('fiscalSaveDraft', {draftId: saved.draftId, model: 55, manualInvoice: input});
  const ready = await call('fiscalCheckDraft', {draftId: saved.draftId});
  assert.equal(ready.ok, true);
  assert.equal(records.get(`lojas/${storeId}/invoices/${saved.draftId}`).number, null);
  assert.equal(sent.filter((item) => item.path === '/issue').length, issueCallsBefore);
});

test('NFC-e usa modelo próprio; cancelamento e inutilização são operações distintas', async () => {
  const saved = await call('fiscalSaveDraft', {model: 65, manualInvoice: form()});
  assert.equal((await call('fiscalCheckDraft', {draftId: saved.draftId})).ok, true);
  assert.equal((await call('fiscalIssueDraft', {draftId: saved.draftId, model: 65})).status, 'authorized');
  assert.equal(sent.filter((item) => item.path === '/issue').at(-1).body.invoice.model, 65);
  const cancelled = await call('fiscalCancelInvoice', {invoiceId: saved.draftId, reason: 'Erro operacional confirmado pela loja'});
  assert.equal(cancelled.cancellationAccepted, true);
  assert.equal(records.get(`lojas/${storeId}/invoices/${saved.draftId}`).cancelProtocol, 'cancel-1');
  await assert.rejects(call('fiscalCancelInvoice', {invoiceId: saved.draftId, reason: 'Erro operacional confirmado pela loja'}), /Somente notas autorizadas/);
  const operation = {model: 65, series: 2, start: 1, end: 1, year: new Date().getUTCFullYear(), reason: 'Falha de sequência durante manutenção'};
  await assert.rejects(call('fiscalInutilizeNumbering', operation), /numeração já usada/);
  const accepted = await call('fiscalInutilizeNumbering', {...operation, start: 2, end: 2});
  assert.equal(accepted.protocol, 'inut-1');
  assert.equal((await call('fiscalInutilizeNumbering', {...operation, start: 2, end: 2})).protocol, 'inut-1');
  assert.equal(sent.filter((item) => item.path === '/inutilize').length, 1);
});

test('pedido antigo pode ser preparado, checado e emitido como NF-e sem gerar NFC-e', async () => {
  const orderId = 'pedido-antigo-1';
  write(ref(`lojas/${storeId}/pedidos/${orderId}`), {
    status: 'Finalizado', clienteNome: 'Maria', clienteDocumento: '52998224725',
    clienteEnderecoFiscal: {street: 'Rua A', number: '10', district: 'Centro', city: 'Goiania', cityCode: '5208707', state: 'GO', zip: '74000000'},
    itens: [{produtoId: 'brigadeiro', nome: 'Brigadeiro', preco: 10, quantity: 2, fiscal: {ncm: '19059090', unit: 'un', origin: 0, csosn: '102', pisCst: '49', cofinsCst: '49'}}],
    total: 20,
  });
  const pending = await call('fiscalSaveDraft', {orderId, model: null, operationCfop: ''});
  assert.equal(records.get(`lojas/${storeId}/invoices/${pending.draftId}`).number, null);
  assert.match((await call('fiscalCheckDraft', {draftId: pending.draftId})).errors.join(' '), /selecione NF-e ou NFC-e/);
  const saved = await call('fiscalSaveDraft', {orderId, model: 55, operationCfop: '5101'});
  assert.equal(saved.draftId, pending.draftId);
  assert.equal(saved.status, 'draft');
  assert.equal(records.get(`lojas/${storeId}/invoices/${saved.draftId}`).number, null);
  assert.equal((await call('fiscalCheckDraft', {draftId: saved.draftId})).ok, true);
  assert.equal((await call('fiscalIssueDraft', {draftId: saved.draftId, model: 55})).status, 'authorized');
  assert.equal(records.get(`lojas/${storeId}/pedidos/${orderId}`).fiscal.authorizedInvoiceId, saved.draftId);
  await assert.rejects(call('fiscalSaveDraft', {orderId, model: 65, operationCfop: '5101'}), /Pedido já tem nota autorizada/);
});

test('permissões e loja específica são exigidas', async () => {
  write(ref('users/disabled'), {permissions: {'nota-fiscal': false}});
  await assert.rejects(call('fiscalSaveDraft', {model: 55, manualInvoice: form()}, 'disabled'), /não está habilitado/);
  await assert.rejects(call('fiscalSaveDraft', {model: 55, manualInvoice: form()}, 'manager'), /não tem acesso fiscal/);
  await assert.rejects(api.fiscalSaveDraft({auth: {uid: 'owner'}, data: {lojaId: 'all', model: 55, manualInvoice: form()}}), /Selecione uma loja específica/);
});

test('serviço sem rota de inutilização bloqueia antes de reservar a numeração', async () => {
  const previous = global.fetch;
  global.fetch = async (url, options) => new URL(url).pathname === '/capabilities'
    ? {ok: true, status: 200, text: async () => JSON.stringify({inutilize: false})}
    : previous(url, options);
  try {
    const counterPath = `lojas/${storeId}/fiscalCounters/homologation_65_2`;
    const before = records.get(counterPath).nextNumber;
    await assert.rejects(call('fiscalInutilizeNumbering', {
      model: 65, series: 2, start: before, end: before,
      year: new Date().getUTCFullYear(), reason: 'Falha de sequência durante manutenção',
    }), /ainda não suporta inutilização/);
    assert.equal(records.get(counterPath).nextNumber, before);
  } finally {
    global.fetch = previous;
  }
});

const seedOriginal = (id, model = 55, status = 'authorized') => {
  const editable = form();
  const original = {lojaId: storeId, model, status, number: 123, series: 7, environment: 'production',
    customer: editable.customer, items: editable.items.map((item) => ({...item, cfop: '5101', tax: {origin: 0, csosn: '102', pisCst: '49', cofinsCst: '49'}})),
    totals: {products: 999, invoice: 999, freight: 3, insurance: 1, other: 2}, total: 999,
    operationCfop: '5101', additionalInfo: 'Observação histórica', paymentMethodCode: '01',
    key: 'old-key', protocol: 'old-protocol', receipt: 'old-receipt', authorizedXml: 'old-xml', signedXml: 'old-signed', danfe: 'old-pdf', qrCode: 'old-qr', signature: 'old-signature', digestValue: 'old-digest',
    idempotencyKey: 'old-idempotency', requestId: 'old-request', jobId: 'old-job', cancelProtocol: 'old-cancel', issuedAt: 'old-date', authorizedAt: 'old-date',
    history: [{status: 'draft', action: 'created', message: 'Rascunho da nota original'},
      {status: 'draft', action: 'edited', message: 'Edição da nota original'},
      {status: 'draft', action: 'validated', message: 'Validação da nota original'},
      {status, message: 'Original intacta'}]};
  write(ref(`lojas/${storeId}/invoices/${id}`), original);
  return JSON.stringify(original);
};
const clone = (id, token = `confirmation-token-${id}`, uid = 'owner', extra = {}) => call('fiscalCloneInvoice', {invoiceId: id, cloneRequestId: token, ...extra}, uid);

test('authorized NF-e and NFC-e clone into independent drafts with no fiscal identity or transmission', async () => {
  for (const model of [55, 65]) {
    const id = `original-${model}`;
    const original = seedOriginal(id, model);
    const before = sent.length;
    const counters = JSON.stringify([...records].filter(([path]) => path.includes('/fiscalCounters/')));
    const saved = await clone(id);
    const draft = records.get(`lojas/${storeId}/invoices/${saved.draftId}`);
    assert.notEqual(saved.draftId, id);
    assert.equal(draft.status, 'draft');
    assert.equal(draft.number, null);
    assert.equal(draft.model, model);
    assert.equal(draft.orderId, null);
    for (const field of ['key', 'protocol', 'receipt', 'series', 'environment', 'authorizedXml', 'signedXml', 'qrCode', 'digestValue', 'signature', 'danfe', 'artifacts', 'cancelProtocol', 'issuedAt', 'authorizedAt', 'idempotencyKey', 'requestId', 'jobId', 'serviceResult', 'lastCheck']) assert.equal(draft[field], undefined, field);
    assert.deepEqual(draft.manualInvoice.customer, form().customer);
    assert.equal(draft.manualInvoice.items[0].quantity, 2);
    assert.equal(draft.manualInvoice.items[0].csosn, '102');
    assert.equal(draft.totals.products, 20);
    assert.equal(draft.total, 26);
    assert.equal(draft.clonedFromFiscalDocumentId, id);
    assert.equal(draft.history.length, 1);
    assert.doesNotMatch(JSON.stringify(draft.history), /da nota original|Original intacta/);
    assert.equal(draft.history[0].action, 'cloned');
    assert.equal(draft.history[0].by, 'owner');
    assert.equal(draft.history[0].model, model);
    assert.equal(sent.length, before);
    assert.equal(JSON.stringify([...records].filter(([path]) => path.includes('/fiscalCounters/'))), counters);
    assert.equal(JSON.stringify(records.get(`lojas/${storeId}/invoices/${id}`)), original);
  }
});

test('clones allow customer, items, quantities, fiscal fields and observations to be edited and rechecked', async () => {
  seedOriginal('editable');
  const saved = await clone('editable');
  const draft = records.get(`lojas/${storeId}/invoices/${saved.draftId}`);
  const edited = structuredClone(draft.manualInvoice);
  edited.customer.name = 'Cliente alterado';
  edited.customer.address.zip = '123';
  edited.items[0].description = 'Item alterado';
  edited.items[0].quantity = 4;
  edited.additionalInfo = 'Observação alterada';
  const before = sent.filter((item) => item.path === '/issue').length;
  await call('fiscalSaveDraft', {draftId: saved.draftId, model: 55, manualInvoice: edited});
  assert.equal(records.get(`lojas/${storeId}/invoices/${saved.draftId}`).total, 46);
  assert.match((await call('fiscalCheckDraft', {draftId: saved.draftId})).errors.join(' '), /CEP deve possuir 8 dígitos/);
  edited.customer.address.zip = '74000000';
  edited.items[0].ncm = '';
  await call('fiscalSaveDraft', {draftId: saved.draftId, model: 55, manualInvoice: edited});
  assert.match((await call('fiscalCheckDraft', {draftId: saved.draftId})).errors.join(' '), /NCM válido/);
  edited.items[0].ncm = '19059090';
  // Changes in current product records must not overwrite the editable snapshot.
  edited.items[0].productId = 'current-product';
  write(ref(`lojas/${storeId}/fiscalProducts/current-product`), {code: 'DIFFERENT', description: 'Catálogo novo', ncm: '18069000', csosn: '500'});
  await call('fiscalSaveDraft', {draftId: saved.draftId, model: 55, manualInvoice: edited});
  const check = await call('fiscalCheckDraft', {draftId: saved.draftId});
  assert.equal(check.ok, true);
  assert.equal(check.preview.number, null);
  assert.equal(check.preview.items[0].description, 'Item alterado');
  assert.equal(check.preview.items[0].ncm, '19059090');
  assert.equal(check.preview.items[0].tax.csosn, '102');
  assert.equal(check.preview.customer.name, 'Cliente alterado');
  assert.equal(check.preview.additionalInfo, 'Observação alterada');
  assert.equal(check.preview.totals.invoice, 46);
  assert.equal(sent.filter((item) => item.path === '/issue').length, before);
  await assert.rejects(call('fiscalSaveDraft', {draftId: saved.draftId, model: 65, manualInvoice: edited}), /modelo da nota clonada/);
  await assert.rejects(call('fiscalIssueDraft', {draftId: saved.draftId, model: 65}), /Modelo da confirmação/);
});

test('double click and timeout retry return one clone; new confirmation produces another draft', async () => {
  seedOriginal('concurrent');
  const [a, b] = await Promise.all([clone('concurrent'), clone('concurrent')]);
  assert.equal(a.draftId, b.draftId);
  assert.equal((await clone('concurrent')).draftId, a.draftId);
  assert.equal(records.get(`lojas/${storeId}/invoices/${a.draftId}`).history.length, 1);
  assert.notEqual((await clone('concurrent', 'new-confirmation-token')).draftId, a.draftId);
});

test('rejected and cancelled notes keep their old history and create clean independent drafts', async () => {
  for (const status of ['rejected', 'cancelled']) {
    const original = seedOriginal(status, 65, status);
    const result = await clone(status);
    assert.equal(result.status, 'draft');
    assert.equal(result.model, 65);
    assert.equal(result.protocol, undefined);
    assert.equal(result.cancelProtocol, undefined);
    assert.equal(JSON.stringify(records.get(`lojas/${storeId}/invoices/${status}`)), original);
  }
});

test('cloning enforces authentication, management, fiscal permission, same store and permitted states', async () => {
  seedOriginal('protected');
  await assert.rejects(api.fiscalCloneInvoice({data: {lojaId: storeId, invoiceId: 'protected', cloneRequestId: 'confirmation-token-protected'}}), /autenticado/);
  for (const uid of ['manager', 'disabled', 'accountant']) await assert.rejects(clone('protected', 'confirmation-protected-token', uid));
  await assert.rejects(clone('protected', 'confirmation-protected-token', 'owner', {lojaId: 'all'}), /Selecione uma loja/);
  await assert.rejects(clone('protected', 'confirmation-protected-token', 'owner', {lojaId: 'outra-loja'}), /não encontrada nesta loja/);
  await assert.rejects(clone('../protected'), /inválido/);
  for (const status of ['draft', 'validating', 'pending_return']) {
    seedOriginal(`state-${status}`, 55, status);
    await assert.rejects(clone(`state-${status}`), /Clonagem disponível/);
  }
  seedOriginal('bad-model', 99);
  await assert.rejects(clone('bad-model'), /Modelo fiscal histórico/);
});

test('legacy notes use protected historical XML, not the current customer or product catalog', async () => {
  const xml = require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures/fiscal-clone.xml'), 'utf8');
  const path = `fiscal/${storeId}/invoices/legacy-xml/authorized.xml`;
  artifacts.set(path, xml);
  write(ref(`lojas/${storeId}/invoices/legacy-xml`), {lojaId: storeId, model: 55, status: 'authorized', number: 123, artifacts: {authorizedXml: {path}}});
  const result = await clone('legacy-xml');
  assert.equal(result.cloneDataSource, 'historical_xml');
  assert.equal(result.manualInvoice.customer.name, 'Maria & Filhos');
  assert.equal(result.manualInvoice.items[0].description, 'Bolo');
  assert.equal(result.number, null);
  assert.equal(result.total, 22);
  write(ref(`lojas/${storeId}/invoices/foreign-artifact`), {model: 55, status: 'authorized', artifacts: {authorizedXml: {path: 'fiscal/outra-loja/invoices/x/authorized.xml'}}});
  await assert.rejects(clone('foreign-artifact'), /não pertence a esta nota e loja/);
});

test('legacy rejected order fallback is explicit, has pending fiscal fields and never changes the order', async () => {
  const orderId = 'legacy-rejected-order';
  const order = {clienteNome: 'Cliente atual', itens: [{nome: 'Item atual', preco: 7, quantity: 2}], desconto: 1, valorFrete: 3};
  write(ref(`lojas/${storeId}/pedidos/${orderId}`), order);
  write(ref(`lojas/${storeId}/invoices/legacy-rejected`), {model: 55, status: 'rejected', orderId, operationCfop: '5101'});
  const result = await clone('legacy-rejected');
  assert.equal(result.cloneDataSource, 'current_order');
  assert.match(result.cloneWarnings[0], /podem diferir da nota original/);
  assert.equal(result.manualInvoice.customer.name, 'Cliente atual');
  assert.equal(result.manualInvoice.items[0].ncm, '');
  assert.equal(result.total, 16);
  assert.equal((await call('fiscalCheckDraft', {draftId: result.draftId})).ok, false);
  assert.deepEqual(records.get(`lojas/${storeId}/pedidos/${orderId}`), order);
});

test('a clone is revalidated before issue, uses current series and a new fiscal number', async () => {
  seedOriginal('new-number', 55);
  const saved = await clone('new-number');
  const before = sent.filter((item) => item.path === '/issue').length;
  write(ref(`lojas/${storeId}/fiscalConfig/certificate`), {status: 'inactive'});
  await assert.rejects(call('fiscalIssueDraft', {draftId: saved.draftId, model: 55}), /Certificado A1/);
  assert.equal(sent.filter((item) => item.path === '/issue').length, before);
  write(ref(`lojas/${storeId}/fiscalConfig/certificate`), {status: 'active', certPfxSecretVersion: 'secret/1', certPasswordSecretVersion: 'secret/2'});
  await call('fiscalIssueDraft', {draftId: saved.draftId, model: 55});
  const payload = sent.filter((item) => item.path === '/issue').at(-1).body;
  assert.equal(payload.invoice.model, 55);
  assert.equal(payload.invoice.series, 1);
  assert.notEqual(payload.invoice.number, 123);
  assert.notEqual(payload.invoiceId, 'new-number');
  assert.notEqual(records.get(`lojas/${storeId}/invoices/${saved.draftId}`).key, 'old-key');
});

test('missing tax origin and unsupported historical fields block a clone instead of silently changing taxation', async () => {
  seedOriginal('tax-review');
  const saved = await clone('tax-review');
  const form = structuredClone(saved.manualInvoice);
  form.items[0].origin = null;
  form.items[0].cest = '1234567';
  await call('fiscalSaveDraft', {draftId: saved.draftId, model: 55, manualInvoice: form});
  const result = await call('fiscalCheckDraft', {draftId: saved.draftId});
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /origem fiscal não informada/);
  assert.match(result.errors.join(' '), /cest informado/);
  assert.equal(records.get(`lojas/${storeId}/invoices/${saved.draftId}`).manualInvoice.items[0].cest, '1234567');
});

test('NF-e manual persiste, reabre, altera e rateia frete sem pedido, ignorando totais manipulados', async () => {
  const input = {...form(), freight: '300.00', freightMode: '0', total: 1};
  input.items[0].quantity = 1; input.items[0].unitPrice = 2025; input.items[0].freight = 999;
  const saved = await call('fiscalSaveDraft', {model: 55, manualInvoice: input});
  const reopened = await call('fiscalGetInvoice', {invoiceId: saved.draftId});
  assert.equal(reopened.orderId ?? null, null);
  assert.equal(reopened.manualInvoice.freight, '300.00');
  assert.equal(reopened.total, 2325);
  const checked = await call('fiscalCheckDraft', {draftId: saved.draftId});
  assert.equal(checked.ok, true);
  assert.equal(checked.preview.totals.freight, 300);
  const payload = sent.at(-1).body;
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].freight, 300);
  assert.equal(payload.totals.freight, 300);
  assert.equal(payload.totals.invoice, 2325);
  assert.equal(payload.invoice.payment.amount, 2325);
  assert.equal(payload.transport.freightMode, '0');
  input.freight = 0;
  const updated = await call('fiscalSaveDraft', {draftId: saved.draftId, model: 55, manualInvoice: input});
  assert.equal(updated.draftId, saved.draftId);
  assert.equal((await call('fiscalGetInvoice', {invoiceId: saved.draftId})).totals.invoice, 2025);
  assert.equal((await call('fiscalCheckDraft', {draftId: saved.draftId})).ok, true);
  assert.equal(sent.at(-1).body.items[0].freight, 0);
});

test('NF-e manual negativa ou modalidade inválida é salva, mas não transmitida', async () => {
  for (const change of [{freight: -1}, {freight: 'abc'}, {freight: false}, {freight: []}, {freight: {}}, {freightMode: '7'}]) {
    const saved = await call('fiscalSaveDraft', {model: 55, manualInvoice: {...form(), ...change}});
    const before = sent.length;
    const result = await call('fiscalCheckDraft', {draftId: saved.draftId});
    assert.equal(result.ok, false);
    assert.equal(sent.length, before);
    await assert.rejects(call('fiscalIssueDraft', {draftId: saved.draftId, model: 55}));
    assert.equal(sent.length, before);
  }
});

test('NF-e manual distribui centavos e preserva observação de faturamento parcial', async () => {
  const input = {...form(), freight: .02, additionalInfo: 'Faturamento parcial; frete desta NF-e informado manualmente.'};
  input.items = Array.from({length: 3}, () => ({...input.items[0], quantity: 1, unitPrice: 1}));
  const saved = await call('fiscalSaveDraft', {model: 55, manualInvoice: input});
  assert.equal((await call('fiscalCheckDraft', {draftId: saved.draftId})).ok, true);
  assert.deepEqual(sent.at(-1).body.items.map((item) => item.freight), [0, 0, .02]);
  assert.equal(sent.at(-1).body.additionalInfo, input.additionalInfo);
  assert.equal(sent.at(-1).body.totals.invoice, 3.02);
});

test('Consulta 217 não apaga rejeição 535, XML, identificação, data ou tentativa anterior', async () => {
  const invoiceId = 'freight-rejected';
  const original = {model: 55, series: 1, number: 7, environment: 'production', status: 'rejected',
    cStat: 535, xMotivo: 'Total do Frete difere do somatório dos itens', key: 'original-key',
    issuedAt: '2026-10-13', serviceResult: {cStat: 535}, history: [{status: 'rejected', message: 'freight original'}],
    artifacts: {signedXml: {path: `fiscal/${storeId}/invoices/${invoiceId}/signed.xml`}}};
  write(ref(`lojas/${storeId}/invoices/${invoiceId}`), original);
  artifacts.set(original.artifacts.signedXml.path, '<NFe/>');
  const previous = global.fetch;
  global.fetch = async () => ({ok: true, status: 200, text: async () => JSON.stringify({status: 'rejected', cStat: 217, xMotivo: 'NF-e não consta na base de dados da SEFAZ'})});
  try {
    const result = await call('fiscalRefreshInvoice', {invoiceId});
    assert.equal(result.cStat, 535);
    assert.equal(result.xMotivo, original.xMotivo);
    assert.equal(result.lastConsultation.cStat, 217);
    const stored = records.get(`lojas/${storeId}/invoices/${invoiceId}`);
    for (const key of ['key', 'status', 'number', 'issuedAt', 'cStat', 'xMotivo', 'artifacts', 'serviceResult']) assert.deepEqual(stored[key], original[key]);
    assert.equal(stored.history.length, 2);
    assert.equal(stored.history[1].action, 'consultation');
  } finally { global.fetch = previous; }
});

test('Consulta automática 217 após duplicidade preserva retorno original da emissão e não retransmite', async () => {
  const previous = global.fetch;
  const issued = [];
  global.fetch = async (url, options) => {
    const endpoint = new URL(url).pathname;
    if (!['/issue', '/consult'].includes(endpoint)) return previous(url, options);
    issued.push(endpoint);
    const result = endpoint === '/issue' ? {status: 'rejected', cStat: 204, xMotivo: 'Duplicidade de NF-e', key: 'test-key', signedXml: '<NFe/>'}
      : {status: 'rejected', cStat: 217, xMotivo: 'NF-e não consta na base de dados da SEFAZ'};
    return {ok: true, status: 200, text: async () => JSON.stringify(result)};
  };
  try {
    const saved = await call('fiscalSaveDraft', {model: 55, manualInvoice: form()});
    const result = await call('fiscalIssueDraft', {draftId: saved.draftId, model: 55});
    assert.equal(result.cStat, 204);
    assert.match(result.xMotivo, /Duplicidade/);
    const stored = records.get(`lojas/${storeId}/invoices/${saved.draftId}`);
    assert.equal(stored.lastConsultation.cStat, 217);
    assert.equal(stored.issuanceRejection.cStat, 204);
    assert.equal(stored.history.at(-1).action, 'consultation');
    assert.deepEqual(issued, ['/issue', '/consult']);
  } finally { global.fetch = previous; }
});

test('contador NF-e ajustado para 67 segue até 70 somente na emissão e preserva NFC-e e nota de origem', async () => {
  seedOriginal('legacy-sequence-reference', 55);
  const originalPath = `lojas/${storeId}/invoices/legacy-sequence-reference`;
  write(ref(originalPath), {number: 62}, true);
  const original = JSON.stringify(records.get(originalPath));
  const counterPath = `lojas/${storeId}/fiscalCounters/homologation_55_1`;
  const nfcePath = `lojas/${storeId}/fiscalCounters/homologation_65_2`;
  const nfceBefore = JSON.stringify(records.get(nfcePath));
  write(ref(counterPath), {environment: 'homologation', model: 55, series: 1, nextNumber: 67});
  for (let number = 67; number <= 70; number++) {
    const draft = await clone('legacy-sequence-reference', `sequence-confirmation-token-${number}`);
    assert.equal(draft.number, null);
    assert.equal(records.get(counterPath).nextNumber, number);
    assert.equal((await call('fiscalCheckDraft', {draftId: draft.draftId})).ok, true);
    assert.equal(records.get(counterPath).nextNumber, number);
    const before = sent.filter((entry) => entry.path === '/issue').length;
    await call('fiscalIssueDraft', {draftId: draft.draftId, model: 55});
    const issued = records.get(`lojas/${storeId}/invoices/${draft.draftId}`);
    assert.equal(issued.number, number);
    assert.equal(issued.model, 55);
    assert.equal(records.get(counterPath).nextNumber, number + 1);
    assert.equal(sent.filter((entry) => entry.path === '/issue').at(-1).body.invoice.number, number);
    await call('fiscalIssueDraft', {draftId: draft.draftId, model: 55});
    assert.equal(sent.filter((entry) => entry.path === '/issue').length, before + 1);
    assert.equal(records.get(counterPath).nextNumber, number + 1);
  }
  assert.equal(JSON.stringify(records.get(nfcePath)), nfceBefore);
  assert.equal(JSON.stringify(records.get(originalPath)), original);
});

const numberingChange = async (nextNumber, model = 55, extra = {}, uid = 'owner') => {
  const row = (await call('fiscalGetNumbering', {}, uid)).sequences.find((entry) => entry.model === model);
  return {model, series: row.series, environment: row.environment, issuerCnpj: row.issuerCnpj, nextNumber,
    expectedNextNumber: row.nextNumber, expectedRevision: row.revision, confirmed: true,
    changeRequestId: `numbering-request-${++sequence}`, ...extra};
};

test('manual numbering is independent by model, audited, idempotent and never calls provider or modifies historical invoices', async () => {
  const invoices = JSON.stringify([...records].filter(([path]) => path.includes('/invoices/')));
  const nfcePath = `lojas/${storeId}/fiscalCounters/homologation_65_2`;
  const nfceBefore = JSON.stringify(records.get(nfcePath));
  const sentBefore = sent.length;
  const payload = await numberingChange(1000);
  const [first, repeated] = await Promise.all([call('fiscalSetNextNumber', payload), call('fiscalSetNextNumber', payload)]);
  assert.equal(first.nextNumber, 1000);
  assert.equal(repeated.repeated, true);
  assert.equal(JSON.stringify(records.get(nfcePath)), nfceBefore);
  const audit = [...records].filter(([path, value]) => path.startsWith('auditLogs/') && value.action === 'fiscal_numbering_manually_changed');
  assert.equal(audit.length, 1);
  assert.equal(audit[0][1].uid, 'owner');
  assert.equal(audit[0][1].before.nextNumber, 71);
  assert.equal(audit[0][1].after.nextNumber, 1000);
  assert.equal(audit[0][1].details.direction, 'increase');
  assert.equal(audit[0][1].details.availabilityConfirmedBySefaz, false);
  assert.equal(records.get(audit[0][1].authoritativePath).fingerprint, audit[0][1].fingerprint);
  const nfeBefore = JSON.stringify(records.get(`lojas/${storeId}/fiscalCounters/homologation_55_1`));
  await call('fiscalSetNextNumber', await numberingChange(2000, 65));
  assert.equal(JSON.stringify(records.get(`lojas/${storeId}/fiscalCounters/homologation_55_1`)), nfeBefore);
  assert.equal(sent.length, sentBefore);
  assert.equal(JSON.stringify([...records].filter(([path]) => path.includes('/invoices/'))), invoices);
  await assert.rejects(call('fiscalSetNextNumber', {...payload, nextNumber: 1001}), /outra alteração/);
});

test('mutable global audit mirror cannot forge the protected numbering receipt', async () => {
  const payload = await numberingChange(1300);
  const id = require('node:crypto').createHash('sha256').update(JSON.stringify([storeId, 'owner', payload.environment, payload.model, payload.series, payload.changeRequestId])).digest('hex');
  write(ref(`auditLogs/manual_numbering_${id}`), {fingerprint: 'forged', numbering: {nextNumber: 999}});
  const result = await call('fiscalSetNextNumber', payload);
  assert.equal(result.nextNumber, 1300);
  assert.equal(records.get(`lojas/${storeId}/fiscalCounters/homologation_55_1`).nextNumber, 1300);
  assert.equal(records.get(`auditLogs/manual_numbering_${id}`).after.nextNumber, 1300);
});

test('manual changes check authentication, administrative fiscal permissions, confirmation, integers and store access', async () => {
  const payload = await numberingChange(900);
  await assert.rejects(api.fiscalSetNextNumber({data: {...payload, lojaId: storeId}}), /autenticado/);
  await assert.rejects(call('fiscalSetNextNumber', payload, 'emitter'), /administrar/);
  assert.equal((await call('fiscalGetNumbering', {}, 'emitter')).canManage, false);
  await assert.rejects(call('fiscalSetNextNumber', payload, 'manager'), /acesso fiscal/);
  await assert.rejects(call('fiscalSetNextNumber', payload, 'accountant'), /administrar/);
  await assert.rejects(call('fiscalSetNextNumber', payload, 'disabled'), /não está habilitado/);
  for (const nextNumber of [-1, 0, 1.5, '900', true, 1000000000]) await assert.rejects(call('fiscalSetNextNumber', {...payload, nextNumber}), /inteiro/);
  await assert.rejects(call('fiscalSetNextNumber', {...payload, confirmed: false}), /Confirme/);
  await assert.rejects(call('fiscalSetNextNumber', {...payload, environment: 'production'}), /ambiente ou série mudou/);
  await assert.rejects(call('fiscalSetNextNumber', {...payload, series: 2}), /ambiente ou série mudou/);
  await assert.rejects(call('fiscalSetNextNumber', {...payload, issuerCnpj: 'other-issuer'}), /Emitente/);
  await call('fiscalSetNextNumber', await numberingChange(900, 55, {}, 'accountant-authorized'), 'accountant-authorized');
});

test('lower numbers check all recorded states, historical reservations, blocks, inutilizations and collision keys', async () => {
  const path = `lojas/${storeId}/invoices/known-number-fixture`;
  const context = {model: 55, series: 1, environment: 'homologation'};
  try {
    for (const status of ['authorized', 'rejected', 'cancelled', 'denied', 'validating', 'pending_return']) {
      write(ref(path), {...context, status, number: 500});
      await assert.rejects(call('fiscalSetNextNumber', await numberingChange(500)), /usado|andamento/);
    }
    write(ref(path), {...context, status: 'rejected', history: [{number: 501}]});
    await assert.rejects(call('fiscalSetNextNumber', await numberingChange(501)), /conhecido/);
    write(ref(path), {...context, status: 'rejected', xMotivo: 'Duplicidade 52241037185245000140550010000000091193246958'});
    await assert.rejects(call('fiscalSetNextNumber', await numberingChange(9)), /conhecido/);
    records.delete(path);
    const block = `lojas/${storeId}/fiscalNumberBlocks/homologation_55_1_502`;
    write(ref(block), {...context, status: 'reserved'});
    await assert.rejects(call('fiscalSetNextNumber', await numberingChange(502)), /reservado/);
    records.delete(block);
    const operation = `lojas/${storeId}/fiscalInutilizations/test-number-range`;
    write(ref(operation), {...context, status: 'inutilized', start: 503, end: 505});
    await assert.rejects(call('fiscalSetNextNumber', await numberingChange(504)), /inutilizado/);
    records.delete(operation);
    const result = await call('fiscalSetNextNumber', await numberingChange(600));
    assert.equal(result.nextNumber, 600);
  } finally { records.delete(path); }
});

test('stale counter revision or two different administrators confirmations cannot overwrite a concurrent change', async () => {
  const stale = await numberingChange(700);
  const path = `lojas/${storeId}/fiscalCounters/homologation_55_1`;
  write(ref(path), {nextNumber: 600}, true); // same number, different revision
  await assert.rejects(call('fiscalSetNextNumber', stale), /numeração mudou/);
  const a = await numberingChange(700);
  const b = await numberingChange(800);
  const results = await Promise.allSettled([call('fiscalSetNextNumber', a), call('fiscalSetNextNumber', b)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(records.get(path).nextNumber, 700);
});

test('environments, series, zero series and stores use independent persisted sequences without inferring maximum', async () => {
  const settingsPath = `lojas/${storeId}/fiscalConfig/settings`;
  const settings = {...records.get(settingsPath)};
  const originalCounter = JSON.stringify(records.get(`lojas/${storeId}/fiscalCounters/homologation_55_1`));
  try {
    write(ref(settingsPath), {...settings, environment: 'production', nfeSeries: 2});
    const row = (await call('fiscalGetNumbering', {})).sequences[0];
    assert.equal(row.nextNumber, 1);
    assert.equal(row.configured, false);
    await call('fiscalSetNextNumber', await numberingChange(40));
    assert.equal(records.get(`lojas/${storeId}/fiscalCounters/production_55_2`).nextNumber, 40);
    write(ref(settingsPath), {...settings, nfeSeries: 0});
    await call('fiscalSetNextNumber', await numberingChange(30));
    assert.equal(records.get(`lojas/${storeId}/fiscalCounters/homologation_55_0`).nextNumber, 30);
    const other = 'other-numbering-store';
    write(ref(`lojas/${other}/fiscalConfig/settings`), settings);
    write(ref(`lojas/${other}/fiscalConfig/issuer`), records.get(`lojas/${storeId}/fiscalConfig/issuer`));
    const data = await call('fiscalGetNumbering', {lojaId: other});
    await call('fiscalSetNextNumber', {...await numberingChange(50), lojaId: other, series: 1, expectedNextNumber: 1, expectedRevision: data.sequences[0].revision});
    assert.equal(records.get(`lojas/${other}/fiscalCounters/homologation_55_1`).nextNumber, 50);
    assert.equal(JSON.stringify(records.get(`lojas/${storeId}/fiscalCounters/homologation_55_1`)), originalCounter);
  } finally { write(ref(settingsPath), settings); }
});

test('two new drafts reserve different numbers concurrently, same-attempt retry reserves once, and known targets block before provider', async () => {
  await call('fiscalSetNextNumber', await numberingChange(10000));
  const a = await call('fiscalSaveDraft', {model: 55, manualInvoice: form()});
  const b = await call('fiscalSaveDraft', {model: 55, manualInvoice: form()});
  await Promise.all([call('fiscalCheckDraft', {draftId: a.draftId}), call('fiscalCheckDraft', {draftId: b.draftId})]);
  const counter = `lojas/${storeId}/fiscalCounters/homologation_55_1`;
  assert.equal(records.get(counter).nextNumber, 10000);
  const before = sent.filter((entry) => entry.path === '/issue').length;
  await Promise.all([call('fiscalIssueDraft', {draftId: a.draftId, model: 55}), call('fiscalIssueDraft', {draftId: a.draftId, model: 55}), call('fiscalIssueDraft', {draftId: b.draftId, model: 55})]);
  assert.deepEqual([a, b].map((draft) => records.get(`lojas/${storeId}/invoices/${draft.draftId}`).number).sort(), [10000, 10001]);
  assert.equal(records.get(counter).nextNumber, 10002);
  assert.equal(sent.filter((entry) => entry.path === '/issue').length, before + 2);
  const saved = await call('fiscalSaveDraft', {model: 55, manualInvoice: form()});
  write(ref(counter), {nextNumber: 10000}, true); // corrupted/stale counter cannot resend a known number
  const checked = await call('fiscalCheckDraft', {draftId: saved.draftId});
  assert.equal(checked.ok, false);
  assert.match(checked.errors.join(' '), /conhecido/);
  await assert.rejects(call('fiscalIssueDraft', {draftId: saved.draftId, model: 55}), /conhecido/);
  assert.equal(records.get(counter).nextNumber, 10000);
  assert.equal(sent.filter((entry) => entry.path === '/issue').length, before + 2);
  assert.equal(records.get(`lojas/${storeId}/invoices/${saved.draftId}`).number, null);
});

test('legacy rejection 539 and consultation digest failure do not trigger automatic number hunting', async () => {
  const previous = global.fetch;
  const requests = [];
  const orderId = 'legacy-no-auto-number-retry';
  write(ref(`lojas/${storeId}/pedidos/${orderId}`), {status: 'Finalizado', clienteNome: 'Cliente', clienteDocumento: '52998224725', clienteEnderecoFiscal: form().customer.address, total: 20,
    itens: [{nome: 'Bolo', quantity: 2, preco: 10, fiscal: {ncm: '19059090', unit: 'un', csosn: '102', origin: 0, pisCst: '49', cofinsCst: '49'}}]});
  await call('fiscalSetNextNumber', await numberingChange(11000));
  global.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/validate') return previous(url, options);
    requests.push(path);
    if (path === '/consult') throw new Error('digest: documentos se referem a diferentes objetos');
    return {ok: true, status: 200, text: async () => JSON.stringify({status: 'rejected', cStat: 539, xMotivo: 'Duplicidade de NF-e com diferença na chave', key: 'test-key', signedXml: '<NFe/>'})};
  };
  try {
    const result = await call('fiscalIssueInvoice', {orderId, modelOverride: 55, operationCfop: '5101'});
    assert.equal(result.cStat, 539);
    assert.deepEqual(requests, ['/issue', '/consult']);
    assert.equal(records.get(`lojas/${storeId}/fiscalCounters/homologation_55_1`).nextNumber, 11001);
    const original = records.get(`lojas/${storeId}/invoices/${result.invoiceId}`);
    assert.equal(original.number, 11000);
    assert.equal(original.key, 'test-key');
    assert.equal(original.issuanceRejection.cStat, 539);
    assert.equal(records.get(`lojas/${storeId}/fiscalNumberBlocks/homologation_55_1_11000`).invoiceId, result.invoiceId);
  } finally { global.fetch = previous; }
});

test('legacy retry after ordinary rejection keeps its original reservation; new attempts use a new draft', async () => {
  const previous = global.fetch;
  const orderId = 'legacy-rejection-retry';
  write(ref(`lojas/${storeId}/pedidos/${orderId}`), {status: 'Finalizado', clienteNome: 'Cliente', clienteDocumento: '52998224725', clienteEnderecoFiscal: form().customer.address, total: 20,
    itens: [{nome: 'Bolo', quantity: 2, preco: 10, fiscal: {ncm: '19059090', unit: 'un', csosn: '102', origin: 0, pisCst: '49', cofinsCst: '49'}}]});
  await call('fiscalSetNextNumber', await numberingChange(12000));
  let issued = 0;
  global.fetch = async (url, options) => {
    if (new URL(url).pathname !== '/issue') return previous(url, options);
    issued++;
    return {ok: true, status: 200, text: async () => JSON.stringify({status: 'rejected', cStat: 535, xMotivo: 'Rejeição original preservada', key: 'original-attempt-key'})};
  };
  try {
    const request = {orderId, modelOverride: 55, operationCfop: '5101'};
    const original = await call('fiscalIssueInvoice', request);
    const retry = await call('fiscalIssueInvoice', request);
    assert.equal(retry.invoiceId, original.invoiceId);
    assert.equal(retry.cStat, 535);
    assert.equal(retry.key, original.key);
    assert.equal(issued, 1);
    assert.equal(records.get(`lojas/${storeId}/fiscalCounters/homologation_55_1`).nextNumber, 12001);
  } finally { global.fetch = previous; }
});

test('series configuration rejects empty or malformed values and never changes counters', async () => {
  const counters = JSON.stringify([...records].filter(([path]) => path.includes('/fiscalCounters/')));
  const configuration = JSON.stringify(records.get(`lojas/${storeId}/fiscalConfig/settings`));
  for (const value of ['', ' ', -1, 1000, false, [], 1.5]) {
    await assert.rejects(call('fiscalSaveConfiguration', {settings: {nfeSeries: value}}), /séries fiscais inteiras/);
  }
  assert.equal(JSON.stringify([...records].filter(([path]) => path.includes('/fiscalCounters/'))), counters);
  assert.equal(JSON.stringify(records.get(`lojas/${storeId}/fiscalConfig/settings`)), configuration);
});

test('DEV payment adapter preserves provider capture authority and blocks mismatched paid amounts without consuming numbering', async () => {
  const invoiceCount = sent.filter((entry) => entry.path === '/issue').length;
  const counter = JSON.stringify(records.get('lojas/'+storeId+'/fiscalCounters/homologation_55_1'));
  const path = 'lojas/'+storeId+'/pedidos/dev-online-payment';
  const order = {...records.get('lojas/'+storeId+'/pedidos/pedido-antigo-1'), fiscal: {}, paymentId:'dev-payment', payment_status:'PAID', paymentMode:'ONLINE_NOW', formaPagamento:'Cartão online'};
  write(ref(path), order);
  write(ref('checkoutPayments/dev-payment'),{orderPath:path,storeId,payment_status:'PAID',amount:2000,captureMethod:'pix'});
  const saved=await call('fiscalSaveDraft',{orderId:'dev-online-payment',model:55,operationCfop:'5101'});
  assert.equal((await call('fiscalCheckDraft',{draftId:saved.draftId})).ok,true);
  assert.equal(sent.at(-1).body.invoice.payment.methodCode,'17');
  write(ref('checkoutPayments/dev-payment'),{amount:2100},true);
  assert.match((await call('fiscalCheckDraft',{draftId:saved.draftId})).errors.join(' '),/Concilie a diferença/);
  assert.equal(sent.filter((entry)=>entry.path==='/issue').length,invoiceCount);
  assert.equal(JSON.stringify(records.get('lojas/'+storeId+'/fiscalCounters/homologation_55_1')),counter);
});
test('DEV agreed payment method can still be resolved through its fiscal callable before validation', async () => {
  const orderId='dev-agreed-payment';
  const order={...records.get('lojas/'+storeId+'/pedidos/pedido-antigo-1'),fiscal:{},paymentMode:'AGREED_LATER',paymentMethod:null};
  write(ref('lojas/'+storeId+'/pedidos/'+orderId),order);
  const saved=await call('fiscalSaveDraft',{orderId,model:55,operationCfop:'5101'});
  assert.match((await call('fiscalCheckDraft',{draftId:saved.draftId})).errors.join(' '),/Forma de pagamento/);
  await call('fiscalResolveOrderPaymentMethod',{orderId,paymentMethodLabel:'Dinheiro'});
  assert.equal(records.get('lojas/'+storeId+'/pedidos/'+orderId).paymentMethod,'CASH');
  assert.equal((await call('fiscalCheckDraft',{draftId:saved.draftId})).ok,true);
  assert.equal(sent.at(-1).body.invoice.payment.methodCode,'01');
});
