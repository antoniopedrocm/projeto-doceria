// Reuse the existing CRM role/store policy; no customer body field is authority.
const isClientStaffProfile = (profile, lojaId) => Boolean(profile && profile.ativo !== false && profile.status !== 'inativo' &&
  ['dono', 'gerente', 'atendente'].includes(profile.role) &&
  (profile.role === 'dono' || profile.lojaId === lojaId || profile.lojaIds?.includes(lojaId)));
const fail = (message, httpStatus = 403) => { throw Object.assign(new Error(message), {httpStatus}); };
const fields = ['nome', 'email', 'cpf', 'documento', 'endereco', 'cep', 'bairro', 'cidade', 'uf', 'codigoIbge', 'aniversario', 'status'];
const addressFields = ['street', 'number', 'complement', 'district', 'city', 'state', 'zip', 'cityCode'];
const pickText = (input, allowed) => Object.fromEntries(allowed.filter(key => Object.hasOwn(input, key)).map(key => {
  if (input[key] !== null && typeof input[key] !== 'string') fail('Campo de cadastro inválido: ' + key + '.', 400);
  return [key, input[key]];
}));
function claimedClientPatch({customer, input, profile, customProfile = {}, lojaId, storeRelationshipVerified=false}) {
  if (!lojaId || lojaId === '__all__' || !isClientStaffProfile(profile, lojaId)) fail('Você não tem permissão para alterar clientes nesta loja.');
  const permissions = customProfile.permissions || profile.permissions || {};
  if (permissions.clientes === false) fail('O módulo Clientes não está habilitado para este usuário.');
  if (profile.role !== 'dono' && !storeRelationshipVerified && customer.lojaId !== lojaId && !(Array.isArray(customer.lojasVisitadas) && customer.lojasVisitadas.includes(lojaId))) fail('O cliente não está vinculado à loja autorizada.');
  const patch = pickText(input, fields);
  if (Object.hasOwn(input, 'address')) {
    if (input.address === null) patch.address = null;
    else if (!input.address || typeof input.address !== 'object' || Array.isArray(input.address)) fail('Endereço cadastral inválido.', 400);
    else patch.address = {...(customer.address && typeof customer.address === 'object' && !Array.isArray(customer.address) ? customer.address : {}), ...pickText(input.address, addressFields)};
  }
  // Phone, ownership, verified delivery addresses, purchases, coupons and
  // provider/login state stay immutable in the CRM profile form.
  return patch;
}
module.exports = {isClientStaffProfile, claimedClientPatch};
