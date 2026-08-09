const OWNER_ROLES = new Set([
  'dono',
  'owner',
  'admin',
  'adm',
  'administrador',
  'administradora',
  'administrador_master',
  'administradora_master',
  'admin_master',
  'master',
  'superadmin'
]);

const normalizeValue = (value) => String(value || '').trim();
const normalizeRole = (value) => normalizeValue(value).toLowerCase();
const normalizeStatusSet = (statuses = []) => (
  statuses instanceof Set
    ? statuses
    : new Set((Array.isArray(statuses) ? statuses : []).map(normalizeValue).filter(Boolean))
);

export const ENTRE_LOJAS_RELATION = Object.freeze({
  OWNER: 'dono',
  ORIGIN: 'origem',
  DESTINATION: 'destino',
  NONE: 'sem_vinculo'
});

export const getEntreLojasUserStoreIds = (user = {}) => {
  const rawStoreIds = Array.isArray(user?.lojaIds) && user.lojaIds.length
    ? user.lojaIds
    : (user?.lojaId ? [user.lojaId] : []);

  return Array.from(new Set(rawStoreIds.map(normalizeValue).filter(Boolean)));
};

export const getEntreLojasStoreRelation = ({ user, record }) => {
  const role = normalizeRole(user?.role);
  if (OWNER_ROLES.has(role)) return ENTRE_LOJAS_RELATION.OWNER;

  const storeIds = getEntreLojasUserStoreIds(user);
  const originStoreId = normalizeValue(record?.lojaOrigemId);
  const destinationStoreId = normalizeValue(record?.lojaDestinoId);

  // A origem tem prioridade quando o gerente esta vinculado aos dois lados.
  if (originStoreId && storeIds.includes(originStoreId)) return ENTRE_LOJAS_RELATION.ORIGIN;
  if (destinationStoreId && storeIds.includes(destinationStoreId)) return ENTRE_LOJAS_RELATION.DESTINATION;
  return ENTRE_LOJAS_RELATION.NONE;
};

const isOwnerRelation = (relation) => relation === ENTRE_LOJAS_RELATION.OWNER;
const isOriginRelation = (relation) => relation === ENTRE_LOJAS_RELATION.ORIGIN;
const isRelatedManager = (relation) => (
  relation === ENTRE_LOJAS_RELATION.ORIGIN
  || relation === ENTRE_LOJAS_RELATION.DESTINATION
);

export const canViewEntreLojasTransfer = ({ user, transfer, allowedStatuses = [] }) => {
  if (!user || !transfer) return false;

  const relation = getEntreLojasStoreRelation({ user, record: transfer });
  if (isOwnerRelation(relation)) return true;

  const status = normalizeValue(transfer.status);
  if (!status || !normalizeStatusSet(allowedStatuses).has(status)) return false;

  if (status === 'rascunho') return isOriginRelation(relation);
  return isRelatedManager(relation);
};

export const canViewEntreLojasClosing = ({ user, closing }) => {
  if (!user || !closing) return false;
  const relation = getEntreLojasStoreRelation({ user, record: closing });
  return isOwnerRelation(relation) || isRelatedManager(relation);
};

export const deduplicateEntreLojasTransfers = (transfers = []) => {
  const uniqueTransfers = new Map();
  transfers.forEach((transfer) => {
    if (transfer?.id) uniqueTransfers.set(transfer.id, transfer);
  });
  return Array.from(uniqueTransfers.values());
};

export const filterEntreLojasTransfers = ({
  transfers = [],
  user,
  allowedStatuses = [],
  selectedStoreId = null,
  activeTab = 'todas',
  statusFilter = 'todos',
  originFilter = 'todos',
  destinationFilter = 'todos',
  startDateFilter = '',
  endDateFilter = '',
  paymentStatuses = [],
  historyStatuses = [],
  resolveDate = (value) => value instanceof Date ? value : new Date(value)
}) => {
  const normalizedSelectedStoreId = normalizeValue(selectedStoreId);
  const userStoreIds = getEntreLojasUserStoreIds(user);
  const isOwner = OWNER_ROLES.has(normalizeRole(user?.role));

  return deduplicateEntreLojasTransfers(transfers).filter((transfer) => {
    if (!canViewEntreLojasTransfer({ user, transfer, allowedStatuses })) return false;

    const originId = normalizeValue(transfer.lojaOrigemId);
    const destinationId = normalizeValue(transfer.lojaDestinoId);
    if (
      normalizedSelectedStoreId
      && originId !== normalizedSelectedStoreId
      && destinationId !== normalizedSelectedStoreId
    ) return false;

    const sentInCurrentView = normalizedSelectedStoreId
      ? originId === normalizedSelectedStoreId
      : Boolean(originId && (isOwner || userStoreIds.includes(originId)));
    const receivedInCurrentView = normalizedSelectedStoreId
      ? destinationId === normalizedSelectedStoreId
      : Boolean(destinationId && (isOwner || userStoreIds.includes(destinationId)));

    if (activeTab === 'enviadas' && !sentInCurrentView) return false;
    if (activeTab === 'recebidas' && !receivedInCurrentView) return false;
    if (activeTab === 'aguardando_conferencia' && transfer.status !== 'aguardando_conferencia') return false;
    if (activeTab === 'aguardando_pagamento' && !paymentStatuses.includes(transfer.status)) return false;
    if (activeTab === 'historico' && !historyStatuses.includes(transfer.status)) return false;
    if (statusFilter !== 'todos' && transfer.status !== statusFilter) return false;
    if (originFilter !== 'todos' && originId !== normalizeValue(originFilter)) return false;
    if (destinationFilter !== 'todos' && destinationId !== normalizeValue(destinationFilter)) return false;

    const createdAtDate = resolveDate(transfer.dataCriacao);
    if (startDateFilter && createdAtDate && createdAtDate < new Date(`${startDateFilter}T00:00:00`)) return false;
    if (endDateFilter && createdAtDate && createdAtDate > new Date(`${endDateFilter}T23:59:59`)) return false;
    return true;
  });
};

export const summarizeEntreLojasTransfers = (transfers = []) => transfers.reduce((summary, transfer) => {
  summary.total += 1;
  summary.totalRepasse += Number(transfer.totalRepasse) || 0;
  summary.totalRevenda += Number(transfer.totalRevenda) || 0;
  if (transfer.status === 'aguardando_conferencia') summary.aguardandoConferencia += 1;
  if (transfer.status === 'pagamento_informado') summary.aguardandoConfirmacao += 1;
  return summary;
}, {
  total: 0,
  totalRepasse: 0,
  totalRevenda: 0,
  aguardandoConferencia: 0,
  aguardandoConfirmacao: 0
});

export const getTransferActionPermissions = ({
  user,
  transfer,
  linkedClosingStatus = null,
  lockedForEdit = false
}) => {
  const role = normalizeRole(user?.role);
  const relation = getEntreLojasStoreRelation({ user, record: transfer });
  const status = normalizeValue(transfer?.status);
  const isOwner = isOwnerRelation(relation);
  const isManager = role === 'gerente';
  const isAttendant = role === 'atendente';
  const isOrigin = isOriginRelation(relation);
  const isRelated = isRelatedManager(relation);
  const isLinkedClosingLocked = Boolean(
    transfer?.fechamentoId
    && linkedClosingStatus
    && linkedClosingStatus !== 'aberto'
    && !isOwner
  );
  const canUseAdministrativeActions = isOwner || (isManager && isRelated);
  const canUseOriginActions = isOwner || (isManager && isOrigin);
  const canEditAsCurrentRole = isOwner || ((isManager || isAttendant) && isOrigin);

  return {
    relation,
    canConfirmWithoutDivergence: canUseAdministrativeActions
      && !isLinkedClosingLocked
      && status === 'aguardando_conferencia',
    canConfirmWithDivergence: canUseAdministrativeActions
      && !isLinkedClosingLocked
      && status === 'aguardando_conferencia',
    canMarkAsPaid: canUseAdministrativeActions
      && !isLinkedClosingLocked
      && ['aguardando_conferencia', 'conferencia_sem_divergencia', 'conferencia_com_divergencia'].includes(status),
    canConfirmPayment: canUseOriginActions
      && !transfer?.fechamentoId
      && status === 'pagamento_informado',
    canContestPayment: canUseOriginActions
      && !transfer?.fechamentoId
      && status === 'pagamento_informado',
    canEdit: canEditAsCurrentRole && !lockedForEdit,
    canDelete: (isOwner || isOrigin)
      && ['rascunho', 'aguardando_conferencia'].includes(status),
    canCancel: canUseOriginActions
      && !isLinkedClosingLocked
      && !['pagamento_confirmado', 'cancelado', 'cancelada'].includes(status)
  };
};

export const getClosingActionPermissions = ({ user, closing }) => {
  const role = normalizeRole(user?.role);
  const relation = getEntreLojasStoreRelation({ user, record: closing });
  const status = normalizeValue(closing?.status);
  const isOwner = isOwnerRelation(relation);
  const isManager = role === 'gerente';
  const isOrigin = isOriginRelation(relation);
  const isRelated = isRelatedManager(relation);
  const canUseAdministrativeActions = isOwner || (isManager && isRelated);
  const canUseOriginActions = isOwner || (isManager && isOrigin);

  return {
    relation,
    canConfirmWithoutDivergence: canUseAdministrativeActions,
    canConfirmWithDivergence: canUseAdministrativeActions,
    canMarkAsPaid: canUseAdministrativeActions
      && ['fechado', 'pagamento_contestado'].includes(status),
    canConfirmPayment: canUseOriginActions && status === 'pagamento_informado',
    canContestPayment: canUseOriginActions && status === 'pagamento_informado',
    canEdit: canUseOriginActions && status === 'aberto',
    canClose: canUseOriginActions && status === 'aberto',
    canCancel: canUseOriginActions && status !== 'pagamento_confirmado',
    // Exclusao nao faz parte desta alteracao; preserva a regra existente por vinculo.
    canDelete: (isOwner || (isManager && isRelated))
      && ['aberto', 'cancelado'].includes(status)
  };
};
