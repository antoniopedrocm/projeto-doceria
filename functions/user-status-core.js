const USER_STATUS_ACTIVE = 'ativo';
const USER_STATUS_INACTIVE = 'inativo';

const normalizeUserStatus = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isUserActive = (profile = {}, authRecord = null) => {
  if (profile?.ativo === false || authRecord?.disabled === true) return false;
  return normalizeUserStatus(profile?.status) !== USER_STATUS_INACTIVE;
};

const normalizeInactivationReason = (value) => String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 1000);

const managerHasUserStatusPermission = (permissionDetails = {}) => (
  permissionDetails?.configuracoes?.gerenciarStatusUsuarios === true
);

const storesAreWithinScope = (requesterStores = [], targetStores = []) => (
  targetStores.length > 0 &&
  requesterStores.length > 0 &&
  targetStores.every((storeId) => requesterStores.includes(storeId))
);

const countActiveOwners = (profiles = [], normalizeRole) => profiles
    .filter((profile) => (
      normalizeRole(profile?.role) === 'dono' && isUserActive(profile)
    ))
    .length;

const getUserStatusPolicyViolation = ({
  requesterUid,
  requesterRole,
  requesterStores = [],
  requesterAllStores = false,
  requesterPermissionDetails = {},
  targetUid,
  targetRole,
  targetStores = [],
  targetActive = true,
  activeOwnerCount = 0,
  activating = false,
}) => {
  if (requesterUid === targetUid) return 'self-management';
  if (requesterRole === 'gerente') {
    if (!managerHasUserStatusPermission(requesterPermissionDetails)) {
      return 'manager-permission';
    }
    if (targetRole === 'dono') return 'manager-owner';
    if (!storesAreWithinScope(requesterStores, targetStores)) {
      return 'store-scope';
    }
  }
  if (
    requesterRole === 'dono' &&
    !requesterAllStores &&
    !storesAreWithinScope(requesterStores, targetStores)
  ) {
    return 'store-scope';
  }
  if (
    !activating &&
    targetRole === 'dono' &&
    targetActive &&
    activeOwnerCount <= 1
  ) {
    return 'last-active-owner';
  }
  return null;
};

module.exports = {
  USER_STATUS_ACTIVE,
  USER_STATUS_INACTIVE,
  countActiveOwners,
  getUserStatusPolicyViolation,
  isUserActive,
  managerHasUserStatusPermission,
  normalizeInactivationReason,
  normalizeUserStatus,
  storesAreWithinScope,
};
