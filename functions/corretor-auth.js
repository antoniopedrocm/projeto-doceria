const ROLE_BROKER = 'corretor';

const BROKER_RESTRICTED_MODULES = new Set([
  'configuracoes',
  'ifood',
  'food99',
]);

const BROKER_FISCAL_ACTIONS = new Set([
  'read',
  'save-configuration',
  'upload-certificate',
  'validate',
  'issue',
  'issue-manual',
  'refresh',
  'artifact',
]);

const PROTECTED_FISCAL_FIELDS = new Set([
  'serviceUrl',
  'fiscalServiceUrl',
  'sharedSecret',
  'fiscalSharedSecret',
  'platformService',
]);

const ALLOWED_BROKER_ISSUER_FIELDS = [
  'cnpj',
  'legalName',
  'tradeName',
  'stateRegistration',
  'taxRegime',
  'address',
];

const ALLOWED_BROKER_ISSUER_ADDRESS_FIELDS = [
  'street',
  'number',
  'district',
  'city',
  'cityCode',
  'state',
  'zip',
  'phone',
];

const ALLOWED_BROKER_SETTINGS_FIELDS = [
  'environment',
  'nfeSeries',
  'nfceSeries',
  'operationNature',
  'defaultPaymentMethodCode',
  'defaultPresence',
];

const pickOwnFields = (source, allowedFields) => allowedFields.reduce((result, field) => {
  if (source && Object.prototype.hasOwnProperty.call(source, field)) {
    result[field] = source[field];
  }
  return result;
}, {});

const findProtectedFiscalFields = (payload = {}) => {
  const candidates = {
    ...(payload && typeof payload === 'object' ? payload : {}),
    ...(payload?.settings && typeof payload.settings === 'object' ? payload.settings : {}),
  };
  return [...PROTECTED_FISCAL_FIELDS].filter((field) => Object.prototype.hasOwnProperty.call(candidates, field));
};

const sanitizeBrokerFiscalConfiguration = ({issuer, settings} = {}) => {
  const allowedIssuer = pickOwnFields(issuer, ALLOWED_BROKER_ISSUER_FIELDS);
  if (allowedIssuer.address && typeof allowedIssuer.address === 'object') {
    allowedIssuer.address = pickOwnFields(allowedIssuer.address, ALLOWED_BROKER_ISSUER_ADDRESS_FIELDS);
  }
  return {
    issuer: allowedIssuer,
    settings: pickOwnFields(settings, ALLOWED_BROKER_SETTINGS_FIELDS),
  };
};

const canBrokerAccessModule = (permissions, moduleId) => (
  !BROKER_RESTRICTED_MODULES.has(moduleId) && permissions?.[moduleId] === true
);

const canBrokerPerformFiscalAction = (permissions, action) => (
  canBrokerAccessModule(permissions, 'nota-fiscal') && BROKER_FISCAL_ACTIONS.has(action)
);

module.exports = {
  ROLE_BROKER,
  BROKER_RESTRICTED_MODULES,
  BROKER_FISCAL_ACTIONS,
  PROTECTED_FISCAL_FIELDS,
  ALLOWED_BROKER_ISSUER_FIELDS,
  ALLOWED_BROKER_ISSUER_ADDRESS_FIELDS,
  ALLOWED_BROKER_SETTINGS_FIELDS,
  canBrokerAccessModule,
  canBrokerPerformFiscalAction,
  findProtectedFiscalFields,
  sanitizeBrokerFiscalConfiguration,
};
