const {before, after, test} = require('node:test');
const assert = require('node:assert/strict');
const {HttpsError} = require('firebase-functions/v2/https');
const {createFiscalFunctions} = require('./fiscal');

const records = new Map();
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
  where: (field, operator, value) => collection(path, [...filters, {field, operator, value}]),
  get: async () => ({docs: [...records.keys()].filter((key) => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1)
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
        get: async (document) => snapshot(document),
        set: (document, data, options = {}) => writes.push(() => write(document, data, options.merge)),
        update: (document, data) => writes.push(() => write(document, data, true)),
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
    sent.push({path, body});
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
  api = createFiscalFunctions({admin, db, HttpsError, logger: {error: () => {}}, onCall: (...args) => args.at(-1),
    verifyManagementAccess: async (uid) => {
      if (uid === 'accountant') throw new HttpsError('permission-denied', 'Consulta somente.');
      return uid === 'owner' || uid === 'disabled' ? {role: 'dono', allStores: true} : {role: 'gerente', stores: ['outra-loja']};
    },
    verifyStoreReadAccess: async () => ({role: 'dono', allStores: true}),
    userHasAccessToStores: (stores, requested) => requested.every((id) => stores.includes(id)), STORE_ALL_KEY: 'all'});
});
after(() => { global.fetch = originalFetch; delete process.env.FISCAL_SERVICE_URL; });

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
    history: [{status, message: 'Original intacta'}]};
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
