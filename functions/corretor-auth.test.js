const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ALLOWED_BROKER_ISSUER_FIELDS,
  ALLOWED_BROKER_SETTINGS_FIELDS,
  canBrokerAccessModule,
  canBrokerPerformFiscalAction,
  findProtectedFiscalFields,
  sanitizeBrokerFiscalConfiguration,
} = require('./corretor-auth');

test('Corretor lê somente módulo explicitamente selecionado', () => {
  const permissions = {produtos: true, financeiro: false, 'nota-fiscal': true};
  assert.equal(canBrokerAccessModule(permissions, 'produtos'), true);
  assert.equal(canBrokerAccessModule(permissions, 'financeiro'), false);
  assert.equal(canBrokerAccessModule(permissions, 'configuracoes'), false);
  assert.equal(canBrokerAccessModule({...permissions, ifood: true}, 'ifood'), false);
});

test('Corretor emite/configura Nota Fiscal, mas não cancela', () => {
  const permissions = {'nota-fiscal': true};
  assert.equal(canBrokerPerformFiscalAction(permissions, 'save-configuration'), true);
  assert.equal(canBrokerPerformFiscalAction(permissions, 'issue'), true);
  assert.equal(canBrokerPerformFiscalAction(permissions, 'issue-manual'), true);
  assert.equal(canBrokerPerformFiscalAction(permissions, 'cancel'), false);
  assert.equal(canBrokerPerformFiscalAction({'nota-fiscal': false}, 'issue'), false);
});

test('allowlist fiscal do Corretor remove campos desconhecidos e protegidos', () => {
  const sanitized = sanitizeBrokerFiscalConfiguration({
    issuer: {cnpj: '1', legalName: 'Loja', address: {city: 'Goiânia'}, ownerOnly: true},
    settings: {environment: 'production', nfeSeries: 3, serviceUrl: 'https://evil.example', sharedSecret: 'x'},
  });
  assert.deepEqual(Object.keys(sanitized.issuer).sort(), [...ALLOWED_BROKER_ISSUER_FIELDS].filter((field) => ['cnpj', 'legalName', 'address'].includes(field)).sort());
  assert.deepEqual(Object.keys(sanitized.settings).sort(), [...ALLOWED_BROKER_SETTINGS_FIELDS].filter((field) => ['environment', 'nfeSeries'].includes(field)).sort());
  assert.equal(sanitized.settings.serviceUrl, undefined);
  assert.equal(sanitized.settings.sharedSecret, undefined);
});

test('detecta tentativa manual de alterar URL Cloud Run', () => {
  assert.deepEqual(findProtectedFiscalFields({settings: {serviceUrl: 'https://evil.example'}}), ['serviceUrl']);
  assert.deepEqual(findProtectedFiscalFields({platformService: {serviceUrl: 'https://evil.example'}}), ['platformService']);
  assert.deepEqual(findProtectedFiscalFields({settings: {nfeSeries: 2}}), []);
});
