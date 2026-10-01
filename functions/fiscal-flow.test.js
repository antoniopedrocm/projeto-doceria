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
const admin = {firestore: {FieldValue: fieldValue, Timestamp: {now: timestamp}}};
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
    verifyManagementAccess: async (uid) => uid === 'owner' ? {role: 'dono', allStores: true} : {role: 'gerente', stores: ['outra-loja']},
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
