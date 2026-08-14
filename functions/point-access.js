const ROLE_OWNER = 'dono';
const ROLE_MANAGER = 'gerente';
const ROLE_ATTENDANT = 'atendente';
const ROLE_ACCOUNTANT = 'contador';

const normalizeStoreIds = (values = []) => Array.from(new Set(
    (Array.isArray(values) ? values : [values])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
));

const canViewPointStore = ({
  role,
  allowedStoreIds = [],
  requestedStoreId,
  allStores = false,
} = {}) => {
  const storeId = String(requestedStoreId || '').trim();
  if (!storeId) return false;
  if (role === ROLE_OWNER && allStores) return true;
  if (![ROLE_OWNER, ROLE_MANAGER, ROLE_ACCOUNTANT].includes(role)) {
    return false;
  }
  return normalizeStoreIds(allowedStoreIds).includes(storeId);
};

const canModifyPointStore = ({
  role,
  allowedStoreIds = [],
  requestedStoreId,
  allStores = false,
} = {}) => {
  if (role === ROLE_ACCOUNTANT) return false;
  const storeId = String(requestedStoreId || '').trim();
  if (!storeId) return false;
  if (role === ROLE_OWNER && allStores) return true;
  if (![ROLE_OWNER, ROLE_MANAGER, ROLE_ATTENDANT].includes(role)) {
    return false;
  }
  return normalizeStoreIds(allowedStoreIds).includes(storeId);
};

const employeeBelongsToStore = (employee = {}, requestedStoreId) => {
  const storeId = String(requestedStoreId || '').trim();
  if (!storeId) return false;
  const employeeStores = normalizeStoreIds([
    ...(Array.isArray(employee.lojaIds) ? employee.lojaIds : []),
    ...(Array.isArray(employee.lojas) ? employee.lojas : []),
    ...(Array.isArray(employee.lojaId) ? employee.lojaId : [employee.lojaId]),
  ]);
  return employeeStores.includes(storeId);
};

const canViewEmployeePoint = ({employee, ...access} = {}) => (
  canViewPointStore(access) &&
  employeeBelongsToStore(employee, access.requestedStoreId)
);

const sanitizePointEmployee = (employee = {}, id = '') => {
  const lojaIds = normalizeStoreIds([
    ...(Array.isArray(employee.lojaIds) ? employee.lojaIds : []),
    ...(Array.isArray(employee.lojas) ? employee.lojas : []),
    ...(Array.isArray(employee.lojaId) ? employee.lojaId : [employee.lojaId]),
  ]);

  return {
    id: String(id || employee.id || employee.uid || '').trim(),
    uid: String(id || employee.uid || employee.id || '').trim(),
    nome: String(
        employee.nome || employee.displayName || employee.name || '',
    ).trim(),
    email: String(employee.email || '').trim(),
    role: String(employee.role || '').trim(),
    matricula: String(
        employee.matricula || employee.matriculaFuncionario ||
        employee.employeeCode || employee.codigo || '',
    ).trim(),
    categoriaPonto: String(
        employee.categoriaPonto || employee.tipoPonto || '',
    ).trim(),
    lojaId: lojaIds[0] || null,
    lojaIds,
    status: String(employee.status || '').trim(),
    ativo: employee.ativo !== false &&
      String(employee.status || '').trim().toLowerCase() !== 'inativo',
    jornadaTrabalho: employee.jornadaTrabalho ||
      employee.escalaTrabalho || employee.workSchedule || null,
    dataInicioBancoHoras: employee.dataInicioBancoHoras ||
      employee.inicioBancoHoras || '',
  };
};

const filterPointEmployeesByStore = (employees = [], requestedStoreId) => (
  employees.filter((employee) => employeeBelongsToStore(
      employee,
      requestedStoreId,
  ))
);

module.exports = {
  ROLE_ACCOUNTANT,
  canModifyPointStore,
  canViewEmployeePoint,
  canViewPointStore,
  employeeBelongsToStore,
  filterPointEmployeesByStore,
  normalizeStoreIds,
  sanitizePointEmployee,
};
