export const normalizeRole = (role, {strict = false} = {}) => {
  if (!role || typeof role !== 'string') return strict ? null : 'atendente';

  const value = role.trim().toLowerCase();
  if (!value) return strict ? null : 'atendente';

  const normalizedValue = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const ownerAliases = new Set([
    "dono",
    'owner',
    'proprietario',
    'proprietaria',
    'admin',
    'adm',
    'administrador',
    'administradora',
    'administrador master',
    'administradora master',
    'administradormaster',
    'administrador_master',
    'admin master',
    'admin_master',
    'master',
    'adminstrador',
    'adminstradora',
    'superadmin',
    'superadministrador',
    'superadministradora'
  ]);

  const managerAliases = new Set([
    "gerente",
    'manager',
    'gerencia',
    'gerente',
    'gestor',
    'gestora'
  ]);

  const attendantAliases = new Set([
    "atendente",
    'atendente',
    'colaborador',
    'colaboradora',
    'funcionario',
    'funcionaria',
    'vendedor',
    'vendedora'
  ]);

  const clientAliases = new Set([
    "cliente",
    'client',
    'cliente'
  ]);

  const accountantAliases = new Set([
    "contador",
    'accountant',
    'contabilidade'
  ]);

  if (ownerAliases.has(normalizedValue)) {
    return "dono";
  }

  if (managerAliases.has(normalizedValue)) {
    return "gerente";
  }

  if (attendantAliases.has(normalizedValue)) {
    return "atendente";
  }

  if (accountantAliases.has(normalizedValue)) {
    return "contador";
  }

  if (clientAliases.has(normalizedValue)) {
    return "cliente";
  }

  if (["dono", "gerente", "atendente", "contador", "cliente"].includes(value)) {
    return value;
  }

  return strict ? null : 'atendente';
};
export const isActiveStaffProfile = profile => Boolean(profile && profile.ativo !== false && String(profile.status || "").trim().toLowerCase() !== "inativo" && profile.authDisabled !== true && profile.firebaseAuthDisabled !== true && ["dono", "gerente", "atendente", "contador"].includes(normalizeRole(profile.role, {strict:true})));
