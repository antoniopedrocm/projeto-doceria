const assert = require('node:assert/strict');
const {describe, test} = require('node:test');
const {canAdministerFiscal, canEditPlatformFiscalService, protectedPlatformFieldsIn} = require('./fiscal-permissions');

describe('permissoes administrativas do modulo fiscal', () => {
  test('libera Dono e preserva o comportamento do Gerente', () => {
    assert.equal(canAdministerFiscal({role: 'dono'}), true);
    assert.equal(canAdministerFiscal({role: 'gerente'}), true);
  });

  test('libera Contador somente com modulo Nota Fiscal', () => {
    assert.equal(canAdministerFiscal({role: 'contador', permissions: {'nota-fiscal': true}}), true);
    assert.equal(canAdministerFiscal({role: 'contador', permissions: {'nota-fiscal': false}}), false);
    assert.equal(canAdministerFiscal({role: 'contador', permissions: {financeiro: true}}), false);
  });

  test('nao amplia privilegios de outros perfis', () => {
    assert.equal(canAdministerFiscal({role: 'atendente', permissions: {'nota-fiscal': true}}), false);
    assert.equal(canAdministerFiscal({role: 'cliente'}), false);
  });

  test('mantem a configuracao global exclusiva do Dono', () => {
    assert.equal(canEditPlatformFiscalService({role: 'dono'}), true);
    assert.equal(canEditPlatformFiscalService({role: 'contador', permissions: {'nota-fiscal': true}}), false);
    assert.equal(canEditPlatformFiscalService({role: 'gerente'}), false);
  });

  test('detecta URL e segredos globais, inclusive aliases legados', () => {
    assert.deepEqual(protectedPlatformFieldsIn({environment: 'production'}), []);
    assert.deepEqual(protectedPlatformFieldsIn({serviceUrl: 'https://example.test'}), ['serviceUrl']);
    assert.deepEqual(
        protectedPlatformFieldsIn({fiscalServiceUrl: 'x', sharedSecret: 'y', fiscalSharedSecret: 'z'}),
        ['fiscalServiceUrl', 'sharedSecret', 'fiscalSharedSecret'],
    );
  });
});
