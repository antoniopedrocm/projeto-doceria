const {before, after, test} = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {HttpsError} = require('firebase-functions/v2/https');
const {createFiscalFunctions} = require('./fiscal');

const storeId = 'fiscal-flow-test';
let db;
let api;
let transmissions = [];
let originalFetch;

const customer = () => ({
  name: 'Maria Silva', document: '52998224725',
  address: {street: 'Rua A', number: '10', district: 'Centro', city: 'Goiania', cityCode: '5208707', state: 'GO', zip: '74000000'},
});
const manualInvoice = () => ({
  customer: customer(), operationCfop: '5101', paymentMethodCode: '01', additionalInfo: 'Teste de homologação',
  items: [{description: 'Brigadeiro', code: 'B1', ncm: '19059090', unit: 'un', quantity: 2, unitPrice: 10, discount: 0, origin: 0, csosn: '102', pisCst: '49', cofinsCst: '49'}],
});
const invoke = (name, data, uid = 'owner') => api[name]({auth: {uid}, data: {lojaId: storeId, ...data}});

before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Execute este teste pelo emulador Firestore.');
  process.env.FISCAL_SERVICE_URL = 'http://127.0.0.1:19999';
  originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    const payload = JSON.parse(options.body);
    transmissions.push({path, payload});
    const response = path === '/capabilities' ? {inutilize: true, year: new Date().getUTCFullYear()}
      : path === '/validate' ? {ok: true, errors: [], warnings: []}
      : path === '/issue' ? {status: 'authorized', key: `key-${payload.invoice.model}-${payload.invoice.number}`, protocol: `protocol-${payload.invoice.number}`, cStat: 100, xMotivo: 'Autorizado'}
        : path === '/cancel' ? {status: 'cancelled', cancelProtocol: 'cancel-123', cStat: 135, xMotivo: 'Evento registrado'}
          : path === '/inutilize' ? {status: 'inutilized', protocol: 'inut-123', cStat: 102, xMotivo: 'Inutilização homologada'}
            : {error: 'Rota inesperada'};
    return {ok: !response.error, status: response.error ? 404 : 200, text: async () => JSON.stringify(response)};
  };
  admin.initializeApp({projectId: 'demo-fiscal-flow'});
  db = admin.firestore();
  const store = db.collection('lojas').doc(storeId);
  await Promise.all([
    store.collection('fiscalConfig').doc('issuer').set({cnpj: '37185245000140', legalName: 'Ana Guimarães Doceria', stateRegistration: '108911454', taxRegime: 1, address: {street: 'Av Comercial', number: '441', district: 'Centro', city: 'Goiania', cityCode: '5208707', state: 'GO', zip: '74465120'}}),
    store.collection('fiscalConfig').doc('settings').set({environment: 'homologation', nfeSeries: 1, nfceSeries: 2, operationNature: 'Venda', defaultPaymentMethodCode: '01'}),
    store.collection('fiscalConfig').doc('certificate').set({status: 'active', certPfxSecretVersion: 'projects/demo/secrets/cert/versions/1', certPasswordSecretVersion: 'projects/demo/secrets/password/versions/1', nfceCscSecretVersion: 'projects/demo/secrets/csc/versions/1', nfceCscIdSecretVersion: 'projects/demo/secrets/csc-id/versions/1'}),
  ]);
  api = createFiscalFunctions({
    admin, db, HttpsError, onCall: (...args) => args.at(-1), logger: {error: () => {}},
    verifyManagementAccess: async (uid) => uid === 'owner' ? {role: 'dono', allStores: true} : {role: 'gerente', stores: ['outra-loja']},
    verifyStoreReadAccess: async () => ({role: 'dono', allStores: true}),
    userHasAccessToStores: (stores, requested) => requested.every((id) => stores.includes(id)),
    STORE_ALL_KEY: 'all',
  });
});

after(async () => {
  global.fetch = originalFetch;
  delete process.env.FISCAL_SERVICE_URL;
  await admin.app().delete();
});

test('rascunho persiste sem numeração ou transmissão; checagem encontra campos, correção libera e emissão é única', async () => {
  const draft = manualInvoice();
  draft.customer.document = '52998224726';
  draft.customer.address.zip = '74000';
  draft.items[0].ncm = '';
  const saved = await invoke('fiscalSaveDraft', {model: 55, manualInvoice: draft});
  assert.equal(saved.status, 'draft');
  const ref = db.collection('lojas').doc(storeId).collection('invoices').doc(saved.draftId);
  const stored = (await ref.get()).data();
  assert.equal(stored.number, null);
  assert.equal(stored.manualInvoice.customer.name, 'Maria Silva');
  assert.equal(transmissions.length, 0);

  const invalid = await invoke('fiscalCheckDraft', {draftId: saved.draftId});
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(' '), /CPF\/CNPJ inválido/);
  assert.match(invalid.errors.join(' '), /CEP deve possuir 8 dígitos/);
  assert.match(invalid.errors.join(' '), /NCM válido/);
  await assert.rejects(invoke('fiscalIssueDraft', {draftId: saved.draftId, model: 55}), /CPF\/CNPJ inválido/);
  assert.equal(transmissions.length, 0);

  const corrected = manualInvoice();
  await invoke('fiscalSaveDraft', {draftId: saved.draftId, model: 55, manualInvoice: corrected});
  const ready = await invoke('fiscalCheckDraft', {draftId: saved.draftId});
  assert.equal(ready.ok, true);
  assert.equal(ready.preview.model, 55);
  assert.equal(ready.preview.number, null);
  assert.equal(ready.preview.totals.invoice, 20);
  assert.equal(ready.preview.customer.name, 'Maria Silva');
  const [first, second] = await Promise.all([
    invoke('fiscalIssueDraft', {draftId: saved.draftId, model: 55}),
    invoke('fiscalIssueDraft', {draftId: saved.draftId, model: 55}),
  ]);
  assert.ok([first, second].some((result) => result.status === 'authorized'));
  assert.ok([first, second].every((result) => ['authorized', 'validating'].includes(result.status)));
  assert.equal(transmissions.filter((entry) => entry.path === '/issue').length, 1);
  assert.equal(transmissions.find((entry) => entry.path === '/issue').payload.invoice.model, 55);
  assert.equal((await ref.get()).get('status'), 'authorized');
  await assert.rejects(invoke('fiscalSaveDraft', {draftId: saved.draftId, model: 55, manualInvoice: corrected}), /Somente rascunhos/);
});

test('NFC-e permanece no modelo 65; cancelamento e inutilização usam eventos separados', async () => {
  const saved = await invoke('fiscalSaveDraft', {model: 65, manualInvoice: manualInvoice()});
  const ready = await invoke('fiscalCheckDraft', {draftId: saved.draftId});
  assert.equal(ready.ok, true);
  const issued = await invoke('fiscalIssueDraft', {draftId: saved.draftId, model: 65});
  assert.equal(issued.status, 'authorized');
  assert.equal(transmissions.filter((entry) => entry.path === '/issue').at(-1).payload.invoice.model, 65);
  const repeated = await invoke('fiscalIssueDraft', {draftId: saved.draftId, model: 55});
  assert.equal(repeated.status, 'authorized');
  const cancelled = await invoke('fiscalCancelInvoice', {invoiceId: saved.draftId, reason: 'Erro operacional confirmado pela loja'});
  assert.equal(cancelled.cancellationAccepted, true);
  const invoice = (await db.collection('lojas').doc(storeId).collection('invoices').doc(saved.draftId).get()).data();
  assert.equal(invoice.cancelProtocol, 'cancel-123');
  assert.equal(invoice.status, 'cancelled');
  await assert.rejects(invoke('fiscalCancelInvoice', {invoiceId: saved.draftId, reason: 'Erro operacional confirmado pela loja'}), /Somente notas autorizadas/);

  const base = {model: 65, series: 2, year: new Date().getUTCFullYear(), reason: 'Falha de sequência durante manutenção'};
  await assert.rejects(invoke('fiscalInutilizeNumbering', {...base, start: 1, end: 1}), /numeração já usada/);
  const result = await invoke('fiscalInutilizeNumbering', {...base, start: 2, end: 2});
  assert.equal(result.status, 'inutilized');
  assert.equal(result.protocol, 'inut-123');
  const repeatedInutilization = await invoke('fiscalInutilizeNumbering', {...base, start: 2, end: 2});
  assert.equal(repeatedInutilization.protocol, 'inut-123');
  assert.equal(transmissions.filter((entry) => entry.path === '/inutilize').length, 1);
});

test('permissão impede gravação fora da loja autorizada', async () => {
  await assert.rejects(invoke('fiscalSaveDraft', {model: 55, manualInvoice: manualInvoice()}, 'manager'), /não tem acesso fiscal/);
});

test('real Firestore transaction deduplicates clone, preserves original and leaves counters untouched', async () => {
  const sourceRef = db.collection('lojas').doc(storeId).collection('invoices').doc('original-clone-55');
  const form = manualInvoice();
  const original = {lojaId: storeId, model: 55, status: 'authorized', number: 123, series: 9, customer: form.customer, items: form.items,
    total: 999, totals: {invoice: 999}, operationCfop: '5101', paymentMethodCode: '01', key: 'original-key', protocol: 'original-protocol',
    history: [{status: 'authorized', message: 'Original'}]};
  await sourceRef.set(original);
  const counterRef = db.collection('lojas').doc(storeId).collection('fiscalCounters').doc('homologation_55_1');
  const before = (await counterRef.get()).data();
  const sentBefore = transmissions.length;
  const data = {invoiceId: sourceRef.id, cloneRequestId: 'clone-emulator-confirmation-token'};
  const [a, b] = await Promise.all([invoke('fiscalCloneInvoice', data), invoke('fiscalCloneInvoice', data)]);
  assert.equal(a.draftId, b.draftId);
  const draft = (await sourceRef.parent.doc(a.draftId).get()).data();
  assert.equal(draft.status, 'draft');
  assert.equal(draft.number, null);
  assert.equal(draft.key, undefined);
  assert.equal(draft.protocol, undefined);
  assert.equal(draft.total, 20);
  assert.equal(draft.history.length, 1);
  assert.deepEqual((await sourceRef.get()).data(), original);
  assert.deepEqual((await counterRef.get()).data(), before);
  assert.equal(transmissions.length, sentBefore);
  assert.equal((await invoke('fiscalCheckDraft', {draftId: a.draftId})).ok, true);
  const edit = {...draft.manualInvoice, additionalInfo: 'Alterada', items: draft.manualInvoice.items.map((item) => ({...item, quantity: 3}))};
  await invoke('fiscalSaveDraft', {draftId: a.draftId, model: 55, manualInvoice: edit});
  assert.equal((await sourceRef.parent.doc(a.draftId).get()).data().total, 30);
});
