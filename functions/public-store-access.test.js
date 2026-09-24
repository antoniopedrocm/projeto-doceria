const test = require('node:test');
const assert = require('node:assert/strict');
const {createPublicStoreValidator} = require('./public-store-access');

test('aceita apenas os IDs legados conhecidos sem documento raiz', async () => {
  const getStoreRef = () => {
    throw new Error('não deve consultar o Firestore para lojas legadas');
  };
  const isValidPublicStoreId = createPublicStoreValidator(getStoreRef);

  assert.equal(await isValidPublicStoreId('ana-guimaraes-matriz'), true);
  assert.equal(await isValidPublicStoreId('ana-guimaraes-garavelo'), true);
});

test('aceita loja nova somente quando o documento raiz existe', async () => {
  const queriedIds = [];
  const getStoreRef = (storeId) => {
    queriedIds.push(storeId);
    return {get: async () => ({exists: storeId === 'loja-nova'})};
  };
  const isValidPublicStoreId = createPublicStoreValidator(getStoreRef);

  assert.equal(await isValidPublicStoreId('loja-nova'), true);
  assert.equal(await isValidPublicStoreId('loja-inexistente'), false);
  assert.deepEqual(queriedIds, ['loja-nova', 'loja-inexistente']);
});
