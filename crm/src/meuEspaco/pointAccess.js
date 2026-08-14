export const getPointEmployeeStoreIds = (employee = {}) => Array.from(new Set([
  ...(Array.isArray(employee.lojaIds) ? employee.lojaIds : []),
  ...(Array.isArray(employee.lojas) ? employee.lojas : []),
  ...(Array.isArray(employee.lojaId) ? employee.lojaId : [employee.lojaId]),
]
  .map((storeId) => String(storeId || '').trim())
  .filter(Boolean)));

export const employeeBelongsToPointStore = (employee = {}, storeId = '') => (
  getPointEmployeeStoreIds(employee).includes(String(storeId || '').trim())
);

export const isInactivePointEmployee = (employee = {}) => {
  const status = String(employee.status || '').trim().toLowerCase();
  return employee.ativo === false || status === 'inativo' || status === 'inactive';
};

export const getPointEmployeeOptionLabel = (employee = {}) => {
  const name = employee.nome || employee.displayName || employee.name ||
    employee.email || employee.id || 'Colaboradora';
  return isInactivePointEmployee(employee) ? `${name} (Inativo)` : name;
};
