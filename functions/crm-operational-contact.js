const {createHash} = require('node:crypto');
const {isValidFiscalDocument} = require('./fiscal-core');

const OPERATIONAL_PROFILES = 'integrations/customerStoreRelationships/operationalProfiles';
const FIELD_LIMITS = Object.freeze({
  nome: 150, telefone: 30, aniversario: 10, email: 254,
  endereco: 200, cep: 9, bairro: 100, cidade: 100, uf: 2, cpf: 18, codigoIbge: 7,
});

function operationalError(message, httpStatus) {
  return Object.assign(new Error(message), {httpStatus});
}

function sanitizeOperationalPatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length) {
    throw operationalError('Informe os campos do cadastro da loja.', 400);
  }
  const patch = {};
  for (const [field, value] of Object.entries(input)) {
    if (!Object.hasOwn(FIELD_LIMITS, field) || typeof value !== 'string' || value.length > FIELD_LIMITS[field] || /[\u0000-\u001f\u007f]/.test(value)) {
      throw operationalError('Campo de cadastro operacional inválido.', 400);
    }
    const normalized = field === 'uf' ? value.trim().toUpperCase() : value.trim();
    if (field === 'nome' && !normalized ||
        field === 'telefone' && normalized && !/^\+?[\d ().-]+$/.test(normalized) ||
        field === 'email' && normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ||
        field === 'cep' && normalized && !/^\d{5}-?\d{3}$/.test(normalized) ||
        field === 'uf' && normalized && !/^[A-Z]{2}$/.test(normalized)) {
      throw operationalError('Revise os dados de contato do cadastro da loja.', 400);
    }
    if (field === 'aniversario' && normalized) {
      const day = new Date(normalized + 'T00:00:00.000Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isFinite(day.valueOf()) ||
          day.toISOString().slice(0, 10) !== normalized) {
        throw operationalError('Data de aniversário inválida.', 400);
      }
    }
    if (field === 'cpf' && normalized && (!/^(?:\d{11}|\d{14}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/.test(normalized) ||
        !isValidFiscalDocument(normalized))) {
      throw operationalError('Informe um CPF ou CNPJ válido.', 400);
    }
    if (field === 'codigoIbge' && normalized && !/^\d{7}$/.test(normalized)) {
      throw operationalError('O código IBGE deve ter 7 dígitos.', 400);
    }
    patch[field] = field === 'cpf' ? normalized.replace(/\D/g, '') : normalized;
  }
  return patch;
}

function operationalFields(source = {}) {
  return Object.fromEntries(Object.keys(FIELD_LIMITS).filter(field => typeof source?.[field] === 'string')
    .map(field => [field, source[field].slice(0, FIELD_LIMITS[field])]));
}

// Only used after the directory validates an existing canonical relationship.
const LEGACY_CONTACT_FIELDS = ['cpfCnpj', 'cpf_cnpj', 'cnpjCpf', 'cnpj_cpf', 'cnpj',
  'codigoMunicipio', 'cityCode', 'ibge', 'phone', 'dataAniversario', 'birthDate'];

function legacyOperationalFields(source = {}) {
  const addresses = [source.address, source.enderecos?.[0], source.endereco, source];
  const pick = (objects, keys) => {
    for (const object of objects) {
      for (const key of keys) {
        const value = object?.[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (Number.isSafeInteger(value) && value >= 0) return String(value);
      }
    }
    return '';
  };
  const birthDate = source.aniversario || source.dataAniversario || source.birthDate;
  const date = typeof birthDate?.toDate === 'function' ? birthDate.toDate() : null;
  const dateText = typeof birthDate === 'string' ? birthDate.trim() :
    date instanceof Date && Number.isFinite(date.valueOf()) ? date.toISOString().slice(0, 10) : '';
  const localDate = dateText.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return operationalFields({
    ...source,
    telefone: pick([source], ['telefone', 'phone', 'normalizedPhone', 'phone_number']),
    aniversario: localDate ? [localDate[3], localDate[2], localDate[1]].join('-') : dateText.slice(0, 10),
    cpf: pick([source], ['documento', 'cpfCnpj', 'cpf_cnpj', 'cnpjCpf', 'cnpj_cpf', 'cpf', 'cnpj']).replace(/\D/g, ''),
    endereco: typeof source.endereco === 'string' ? source.endereco :
      pick(addresses, ['street', 'logradouro', 'rua', 'endereco', 'enderecoCompleto']),
    cep: pick(addresses, ['cep', 'zip', 'enderecoCep']),
    bairro: pick(addresses, ['bairro', 'district', 'bairroFiscal', 'neighborhood']),
    cidade: pick(addresses, ['cidade', 'city', 'municipio']),
    uf: pick(addresses, ['uf', 'state']).toUpperCase(),
    codigoIbge: pick(addresses, ['codigoIbge', 'codigoMunicipio', 'cityCode', 'ibge']),
  });
}

function operationalRevision(id, version, fields) {
  const entries = Object.keys(fields).sort().map(field => [field, fields[field]]);
  return createHash('sha256').update(JSON.stringify([id, version, entries])).digest('hex');
}

module.exports = {OPERATIONAL_PROFILES, LEGACY_CONTACT_FIELDS, legacyOperationalFields,
  operationalFields, operationalRevision, sanitizeOperationalPatch};
