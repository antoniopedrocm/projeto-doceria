const {createHash} = require('node:crypto');

const OPERATIONAL_PROFILES = 'integrations/customerStoreRelationships/operationalProfiles';
const FIELD_LIMITS = Object.freeze({
  nome: 150, telefone: 30, aniversario: 10, email: 254,
  endereco: 200, cep: 9, bairro: 100, cidade: 100, uf: 2,
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
    patch[field] = normalized;
  }
  return patch;
}

function operationalFields(source = {}) {
  return Object.fromEntries(Object.keys(FIELD_LIMITS).filter(field => typeof source?.[field] === 'string')
    .map(field => [field, source[field].slice(0, FIELD_LIMITS[field])]));
}

function operationalRevision(id, version, fields) {
  const entries = Object.keys(fields).sort().map(field => [field, fields[field]]);
  return createHash('sha256').update(JSON.stringify([id, version, entries])).digest('hex');
}

module.exports = {OPERATIONAL_PROFILES, operationalFields, operationalRevision, sanitizeOperationalPatch};
