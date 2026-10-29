const {test} = require('node:test');
const assert = require('node:assert/strict');
const {isValidFiscalDocument} = require('./fiscal-core');

test('CPF e CNPJ válidos passam, dígitos verificadores e sequências inválidas não passam', () => {
  assert.equal(isValidFiscalDocument('529.982.247-25'), true);
  assert.equal(isValidFiscalDocument('37.185.245/0001-40'), true);
  assert.equal(isValidFiscalDocument('529.982.247-26'), false);
  assert.equal(isValidFiscalDocument('37.185.245/0001-41'), false);
  assert.equal(isValidFiscalDocument('111.111.111-11'), false);
  assert.equal(isValidFiscalDocument('123'), false);
});
