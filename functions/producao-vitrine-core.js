const PRODUCTION_STATUS = Object.freeze({
  DRAFT: 'rascunho',
  WAITING: 'aguardando_recebimento',
  RECEIVED: 'recebido',
  RECEIVED_WITH_DIVERGENCE: 'recebido_com_divergencia',
  CANCELLED: 'cancelado',
});

const PRODUCTION_STATUS_VALUES = Object.freeze(Object.values(PRODUCTION_STATUS));

const DIVERGENCE_REASONS = Object.freeze([
  'quantidade_menor',
  'quantidade_maior',
  'produto_nao_recebido',
  'produto_diferente',
  'produto_danificado',
  'outro',
]);

const OWNER_ROLES = new Set([
  'dono', 'owner', 'admin', 'adm', 'administrador', 'administradora',
  'administrador_master', 'administradora_master', 'admin_master', 'master', 'superadmin',
]);

const normalizeText = (value) => String(value || '').trim();
const normalizeRole = (value) => normalizeText(value).toLowerCase();

const getProfileStoreIds = (profile = {}) => {
  const candidates = [];
  if (Array.isArray(profile.lojaIds)) candidates.push(...profile.lojaIds);
  if (Array.isArray(profile.lojas)) candidates.push(...profile.lojas);
  if (Array.isArray(profile.lojaId)) candidates.push(...profile.lojaId);
  if (typeof profile.lojaId === 'string') candidates.push(profile.lojaId);
  return Array.from(new Set(candidates.map(normalizeText).filter(Boolean)));
};

const isOwner = (profile = {}) => OWNER_ROLES.has(normalizeRole(profile.role));

const hasStoreAccess = (profile = {}, storeId) => (
  isOwner(profile) || getProfileStoreIds(profile).includes(normalizeText(storeId))
);

const hasSuppliersPermission = (profile = {}) => (
  isOwner(profile) || profile?.permissions?.fornecedores !== false
);

const getWorkArea = (profile = {}) => [
  profile.setor,
  profile.departamento,
  profile.funcao,
  profile.cargo,
  profile.perfilNome,
].map(normalizeText).join(' ').toLowerCase();

const getProductionPermissions = (profile = {}, storeId = '') => {
  const role = normalizeRole(profile.role);
  const area = getWorkArea(profile);
  const owner = isOwner(profile);
  const manager = role === 'gerente' || role === 'gestor' || role === 'gestora';
  const attendant = role === 'atendente' || role === 'funcionario' || role === 'funcionaria';
  const explicitlyKitchen = /cozinha|producao|produção/.test(area);
  const explicitlyFront = /atend|loja|vitrine|balcao|balcão/.test(area);
  const related = hasStoreAccess(profile, storeId);
  const moduleAllowed = hasSuppliersPermission(profile);

  return {
    canRead: moduleAllowed && related && (owner || manager || attendant),
    canCreate: moduleAllowed && related && (owner || manager || attendant) && !explicitlyFront,
    canReceive: moduleAllowed && related && (owner || manager || attendant) && !explicitlyKitchen,
    canCancel: moduleAllowed && related && (owner || manager),
  };
};

const normalizeQuantity = (value, fieldName = 'quantidade') => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} deve ser um número maior ou igual a zero.`);
  }
  return Math.round(number * 1000) / 1000;
};

const sanitizeProductionItems = (items = []) => {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('Adicione pelo menos um produto à produção.');
  }
  if (items.length > 200) {
    throw new Error('Uma produção pode conter no máximo 200 produtos.');
  }

  const seen = new Set();
  return items.map((item, index) => {
    const productId = normalizeText(item?.productId || item?.produtoId);
    const quantity = normalizeQuantity(
        item?.quantidadeEnviada ?? item?.quantidadeProduzida ?? item?.quantidade,
        `Quantidade do item ${index + 1}`,
    );
    if (!productId) throw new Error(`Selecione o produto do item ${index + 1}.`);
    if (quantity <= 0) throw new Error(`A quantidade do item ${index + 1} deve ser maior que zero.`);
    if (seen.has(productId)) throw new Error('Não repita o mesmo produto na produção.');
    seen.add(productId);
    return {productId, quantidadeEnviada: quantity};
  });
};

const calculateReceiptItems = (sentItems = [], receivedItems = []) => {
  if (!Array.isArray(sentItems) || !sentItems.length) {
    throw new Error('A produção não possui itens para conferência.');
  }
  const receivedByProduct = new Map((receivedItems || []).map((item) => [
    normalizeText(item?.productId || item?.produtoId),
    item?.quantidadeRecebida ?? item?.quantidade,
  ]));

  const calculated = sentItems.map((item) => {
    const productId = normalizeText(item.productId || item.produtoId);
    if (!receivedByProduct.has(productId)) {
      throw new Error(`Informe a quantidade recebida de ${item.produtoNome || productId}.`);
    }
    const sent = normalizeQuantity(item.quantidadeEnviada, 'Quantidade enviada');
    const received = normalizeQuantity(receivedByProduct.get(productId), 'Quantidade recebida');
    return {
      ...item,
      productId,
      quantidadeEnviada: sent,
      quantidadeRecebida: received,
      divergencia: Math.round((received - sent) * 1000) / 1000,
    };
  });

  if (receivedByProduct.size !== sentItems.length) {
    throw new Error('A conferência contém produtos que não pertencem à produção.');
  }
  return calculated;
};

const validateDivergence = (items, reason, otherDescription = '') => {
  const hasDivergence = items.some((item) => Number(item.divergencia) !== 0);
  const normalizedReason = normalizeText(reason);
  const normalizedDescription = normalizeText(otherDescription);
  if (!hasDivergence) return {hasDivergence: false, reason: '', otherDescription: ''};
  if (!DIVERGENCE_REASONS.includes(normalizedReason)) {
    throw new Error('Informe um motivo válido para a divergência.');
  }
  if (normalizedReason === 'outro' && !normalizedDescription) {
    throw new Error('Descreva o motivo da divergência.');
  }
  return {hasDivergence: true, reason: normalizedReason, otherDescription: normalizedDescription};
};

const getNextReceiptStatus = (items) => (
  items.some((item) => Number(item.divergencia) !== 0) ?
    PRODUCTION_STATUS.RECEIVED_WITH_DIVERGENCE :
    PRODUCTION_STATUS.RECEIVED
);

const canSendProduction = (status) => status === PRODUCTION_STATUS.DRAFT;
const canReceiveProduction = (status) => status === PRODUCTION_STATUS.WAITING;
const isReceiptAlreadyProcessed = (status) => [
  PRODUCTION_STATUS.RECEIVED,
  PRODUCTION_STATUS.RECEIVED_WITH_DIVERGENCE,
].includes(status);

const getMovementId = (productionId, productId) => {
  const safe = `${productionId}_${productId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `producao_vitrine_${safe}`.slice(0, 1450);
};

module.exports = {
  DIVERGENCE_REASONS,
  PRODUCTION_STATUS,
  PRODUCTION_STATUS_VALUES,
  calculateReceiptItems,
  canReceiveProduction,
  canSendProduction,
  getMovementId,
  getNextReceiptStatus,
  getProductionPermissions,
  getProfileStoreIds,
  hasStoreAccess,
  isOwner,
  isReceiptAlreadyProcessed,
  normalizeQuantity,
  normalizeRole,
  sanitizeProductionItems,
  validateDivergence,
};
