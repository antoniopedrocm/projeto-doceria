const FISCAL_MODULE = 'nota-fiscal';
const PROTECTED_PLATFORM_FIELDS = Object.freeze([
  'serviceUrl',
  'fiscalServiceUrl',
  'sharedSecret',
  'fiscalSharedSecret',
]);

const canAdministerFiscal = (requester = {}) => {
  if (requester.role === 'dono' || requester.role === 'gerente') return true;
  return requester.role === 'contador' && requester.permissions?.[FISCAL_MODULE] === true;
};

const canEditPlatformFiscalService = (requester = {}) => requester.role === 'dono';

const protectedPlatformFieldsIn = (value = {}) => PROTECTED_PLATFORM_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(value || {}, field));

module.exports = {
  FISCAL_MODULE,
  PROTECTED_PLATFORM_FIELDS,
  canAdministerFiscal,
  canEditPlatformFiscalService,
  protectedPlatformFieldsIn,
};
