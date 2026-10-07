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
    verifyManagementAccess: async (uid) => {
      if (uid === 'accountant') throw new HttpsError('permission-denied', 'Sem acesso de gestão.');
      return uid === 'owner' ? {role: 'dono', allStores: true} : {role: 'gerente', stores: ['loja-b']};
    },
    verifyStoreReadAccess: async (uid) => uid === 'owner' ? {role: 'dono', allStores: true}
      : uid === 'accountant' ? {role: 'contador', stores: ['loja-a'], permissions: {'nota-fiscal': true}}
        : {role: 'gerente', stores: ['loja-b']},
    userHasAccessToStores: (stores, requested) => requested.every((id) => stores.includes(id)),
    STORE_ALL_KEY: '__all__',
  });
  const call = (name, data = {}, uid = 'owner') => api[name]({auth: {uid}, data: {lojaId: 'loja-a', ...data}});
  return {api, call, records};
};

for (const catalog of [
  {kind: 'NCM', save: 'fiscalSaveNcmOption', list: 'fiscalGetConfiguration', field: 'ncmOptions', result: 'ncmOptions', code: '21069090', inputCode: '2106.90.90', initial: '19059090', invalid: ['2106909', '210690900', '21069A90', '21.069.090'], digits: /8 dígitos/},
  {kind: 'CFOP', save: 'fiscalSaveCfopOption', list: 'fiscalListCfopOptions', field: 'cfopOptions', result: 'options', code: '5949', inputCode: '5949', initial: '5101', invalid: ['594', '59490', '594A', '5.949'], digits: /4 dígitos/},
]) {
  test(`${catalog.kind} persiste, conserva configuração e permanece isolado por loja`, async () => {
    const {call, records} = createHarness();
    const otherField = catalog.kind === 'NCM' ? 'cfopOptions' : 'ncmOptions';
    records.set('lojas/loja-a/fiscalConfig/settings', {nfeSeries: 7, [otherField]: [{code: 'existente', description: 'Outro catálogo'}]});
    const saved = await call(catalog.save, {code: catalog.inputCode, description: 'Descrição validada pelo contador'});
    assert.deepEqual(saved.option, {code: catalog.code, description: 'Descrição validada pelo contador'});
    const settings = records.get('lojas/loja-a/fiscalConfig/settings');
    assert.equal(settings.nfeSeries, 7);
    assert.equal(settings[otherField].length, 1);
    assert.equal(settings[catalog.field][0].createdByUid, 'owner');
    assert.ok(settings[catalog.field][0].createdAt instanceof Date);
    assert.deepEqual((await call(catalog.list))[catalog.result], [saved.option]);
    assert.deepEqual((await call(catalog.list, {lojaId: 'loja-b'}))[catalog.result], []);
    assert.deepEqual([...records.keys()], ['lojas/loja-a/fiscalConfig/settings']);
  });

  test(`${catalog.kind}: formato inválido, descrição vazia ou muito longa não gravam dados`, async () => {
    const {call, records} = createHarness();
    for (const code of catalog.invalid) {
      await assert.rejects(call(catalog.save, {code, description: 'Descrição'}), catalog.digits);
    }
    for (const description of [' ', 'x'.repeat(121)]) {
      await assert.rejects(call(catalog.save, {code: catalog.code, description}), /descrição/);
    }
    assert.equal(records.size, 0);
  });

  test(`${catalog.kind}: duplicatas, inclusive requisições concorrentes, não criam duas opções`, async () => {
    const {call, records} = createHarness();
    const input = {code: catalog.code, description: 'Descrição validada pelo contador'};
    const results = await Promise.allSettled([call(catalog.save, input), call(catalog.save, input)]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(records.get('lojas/loja-a/fiscalConfig/settings')[catalog.field].length, 1);
    await assert.rejects(call(catalog.save, {...input, code: catalog.initial}), /já está disponível/);
  });

  test(`${catalog.kind}: autenticação, permissão fiscal e loja específica são exigidas`, async () => {
    const {api, call, records} = createHarness();
    const input = {code: catalog.code, description: 'Descrição validada pelo contador'};
    await assert.rejects(api[catalog.save]({data: {lojaId: 'loja-a', ...input}}), /autenticado/);
    await assert.rejects(call(catalog.save, input, 'manager'), /não tem acesso fiscal/);
    await assert.rejects(call(catalog.list, {}, 'manager'), /não tem acesso fiscal/);
    await assert.rejects(call(catalog.save, input, 'accountant'), /gestão/);
    assert.deepEqual((await call(catalog.list, {}, 'accountant'))[catalog.result], []);
    await assert.rejects(call(catalog.save, {...input, lojaId: '__all__'}), /loja específica/);
    records.set('users/owner', {permissions: {'nota-fiscal': false}});
    await assert.rejects(call(catalog.save, input), /não está habilitado/);
    if (catalog.kind === 'CFOP') await assert.rejects(call(catalog.list), /não está habilitado/);
    assert.deepEqual([...records.keys()], ['users/owner']);
  });
}
