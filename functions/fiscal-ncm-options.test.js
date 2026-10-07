const {test} = require('node:test');
const assert = require('node:assert/strict');
const {HttpsError} = require('firebase-functions/v2/https');
const {createFiscalFunctions} = require('./fiscal');

const createHarness = () => {
  const records = new Map();
  let queue = Promise.resolve();
  const document = (path) => ({
    path,
    collection: (name) => collection(`${path}/${name}`),
    get: async () => ({exists: records.has(path), data: () => records.get(path), get: (field) => records.get(path)?.[field]}),
    set: async (data, options = {}) => records.set(path, {...(options.merge ? records.get(path) : {}), ...data}),
  });
  const collection = (path) => ({doc: (id) => document(`${path}/${id}`)});
  const db = {
    collection,
    runTransaction: async (callback) => {
      const previous = queue;
      let release;
      queue = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        const writes = [];
        const result = await callback({
          get: (ref) => ref.get(),
          set: (ref, data, options) => writes.push(() => ref.set(data, options)),
        });
        await Promise.all(writes.map((write) => write()));
        return result;
      } finally {
        release();
      }
    },
  };
  const api = createFiscalFunctions({
    admin: {firestore: {Timestamp: {now: () => new Date()}, FieldValue: {serverTimestamp: () => new Date(), delete: () => null}}},
    db, HttpsError, onCall: (handler) => handler, logger: {error: () => {}},
    verifyManagementAccess: async (uid) => uid === 'owner'
      ? {role: 'dono', allStores: true}
      : {role: 'gerente', stores: ['loja-b']},
    verifyStoreReadAccess: async () => ({role: 'dono', allStores: true}),
    userHasAccessToStores: (stores, requested) => requested.every((id) => stores.includes(id)),
    STORE_ALL_KEY: '__all__',
  });
  const call = (name, data = {}, uid = 'owner') => api[name]({auth: {uid}, data: {lojaId: 'loja-a', ...data}});
  return {api, call, records};
};

test('NCM persiste, é normalizado, conserva configuração e permanece isolado por loja', async () => {
  const {call, records} = createHarness();
  records.set('lojas/loja-a/fiscalConfig/settings', {nfeSeries: 7});
  const saved = await call('fiscalSaveNcmOption', {code: '2106.90.90', description: 'Descrição validada pelo contador'});
  assert.deepEqual(saved.option, {code: '21069090', description: 'Descrição validada pelo contador'});
  assert.equal(records.get('lojas/loja-a/fiscalConfig/settings').nfeSeries, 7);
  assert.equal(records.get('lojas/loja-a/fiscalConfig/settings').ncmOptions[0].createdByUid, 'owner');
  assert.deepEqual((await call('fiscalGetConfiguration')).ncmOptions, [saved.option]);
  assert.deepEqual((await call('fiscalGetConfiguration', {lojaId: 'loja-b'})).ncmOptions, []);
});

test('formatos inválidos e descrições vazias não gravam dados', async () => {
  const {call, records} = createHarness();
  for (const code of ['2106909', '210690900', '21069A90', '21.069.090']) {
    await assert.rejects(call('fiscalSaveNcmOption', {code, description: 'Descrição'}), /8 dígitos/);
  }
  await assert.rejects(call('fiscalSaveNcmOption', {code: '21069090', description: ' '}), /descrição/);
  assert.equal(records.size, 0);
});

test('duplicatas, inclusive requisições concorrentes, não criam duas opções', async () => {
  const {call, records} = createHarness();
  const input = {code: '21069090', description: 'Descrição validada pelo contador'};
  const results = await Promise.allSettled([call('fiscalSaveNcmOption', input), call('fiscalSaveNcmOption', input)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(records.get('lojas/loja-a/fiscalConfig/settings').ncmOptions.length, 1);
  await assert.rejects(call('fiscalSaveNcmOption', {...input, code: '19059090'}), /já está disponível/);
});

test('autenticação, permissão fiscal e loja específica são exigidas', async () => {
  const {api, call, records} = createHarness();
  const input = {code: '21069090', description: 'Descrição validada pelo contador'};
  await assert.rejects(api.fiscalSaveNcmOption({data: {lojaId: 'loja-a', ...input}}), /autenticado/);
  await assert.rejects(call('fiscalSaveNcmOption', input, 'manager'), /não tem acesso fiscal/);
  await assert.rejects(call('fiscalSaveNcmOption', {...input, lojaId: '__all__'}), /loja específica/);
  assert.equal(records.size, 0);
});
