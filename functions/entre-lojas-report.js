const OWNER_ROLES = new Set([
  'dono', 'owner', 'admin', 'adm', 'administrador', 'administradora',
  'administrador_master', 'administradora_master', 'admin_master', 'master',
  'superadmin',
]);
const REPORT_DEFAULT_ROLES = new Set(['dono', 'gerente', 'contador']);
const INVALID_STATUSES = new Set(['rascunho', 'cancelado', 'cancelada']);
const VALID_STATUSES = new Set([
  'aguardando_conferencia',
  'conferencia_sem_divergencia',
  'conferencia_com_divergencia',
  'pagamento_informado',
  'pagamento_confirmado',
  'pagamento_contestado',
]);
const MAX_TRANSFERS = 5000;
const normalize = (value) => String(value || '').trim();
const money = (value) => Number((Number(value) || 0).toFixed(2));

const extractStoreIds = (profile = {}) => {
  const source = Array.isArray(profile.lojaIds) && profile.lojaIds.length ?
    profile.lojaIds :
    (Array.isArray(profile.lojas) && profile.lojas.length ?
      profile.lojas : (profile.lojaId ? [profile.lojaId] : []));
  return Array.from(new Set(source.map(normalize).filter(Boolean)));
};

const isTransferVisible = ({transfer = {}, isOwner, storeIds = []}) => {
  if (isOwner) return true;
  const storeSet = storeIds instanceof Set ? storeIds : new Set(storeIds);
  return storeSet.has(normalize(transfer.lojaOrigemId)) ||
    storeSet.has(normalize(transfer.lojaDestinoId));
};

const validateFilters = (input = {}, HttpsError = Error) => {
  const startDate = normalize(input.startDate);
  const endDate = normalize(input.endDate);
  const validIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(value + 'T12:00:00.000Z').getTime());
  if (!validIsoDate(startDate) || !validIsoDate(endDate)) {
    throw new HttpsError(
        'invalid-argument',
        'Informe um período válido para gerar o relatório.',
    );
  }
  const start = new Date(startDate + 'T12:00:00.000Z');
  const end = new Date(endDate + 'T12:00:00.000Z');
  const days = Math.floor((end - start) / 86400000) + 1;
  if (days < 1 || days > 366) {
    throw new HttpsError(
        'invalid-argument',
        'O período deve ter entre 1 e 366 dias.',
    );
  }
  return {
    startDate,
    endDate,
    origemId: normalize(input.origemId),
    destinoId: normalize(input.destinoId),
    produtoId: normalize(input.produtoId),
    status: normalize(input.status),
    topLimit: Number(input.topLimit) === 10 ? 10 : 5,
  };
};

const hasReportPermission = ({profile = {}, customProfile = {}}) => {
  const role = normalize(profile.role).toLowerCase();
  if (OWNER_ROLES.has(role)) return true;
  const permissions = customProfile.permissions || profile.permissions || {};
  if (typeof permissions.relatorios === 'boolean') {
    return permissions.relatorios;
  }
  return REPORT_DEFAULT_ROLES.has(role);
};

const getAllowedStatuses = ({profile, customProfile, isOwner}) => {
  if (isOwner) return Array.from(VALID_STATUSES);
  const details = customProfile.permissionDetails ||
    profile.permissionDetails || {};
  const moduleDetails = details['entre-lojas'] || details.entreLojas || {};
  const configured = Array.isArray(moduleDetails.statuses) ?
    moduleDetails.statuses :
    (Array.isArray(moduleDetails.status) ? moduleDetails.status : null);
  if (!configured) return Array.from(VALID_STATUSES);
  return Array.from(new Set(
      configured.map(normalize).filter((status) => VALID_STATUSES.has(status)),
  ));
};

const historicalValues = (item = {}) => {
  const quantity = Number(item.quantidade ?? item.quantity ?? 0) || 0;
  const transferUnit = Number(
      item.valorUnitarioRepasse ?? item.valorRepasse ?? 0,
  ) || 0;
  const resaleUnit = Number(
      item.valorUnitarioRevenda ?? item.valorRevenda ?? item.preco ?? 0,
  ) || 0;
  return {
    quantity,
    transferTotal: money(item.totalRepasse == null ?
      quantity * transferUnit : Number(item.totalRepasse) || 0),
    resaleTotal: money(item.totalRevenda == null ?
      quantity * resaleUnit : Number(item.totalRevenda) || 0),
  };
};

const productIdentity = (item = {}) => {
  const productId = normalize(item.produtoId ?? item.productId ?? item.id);
  const name = normalize(item.nome ?? item.produtoNome) || 'Produto sem nome';
  return {
    key: productId ? 'id:' + productId : 'legacy:' + name.toLowerCase(),
    productId,
    name,
  };
};

const mergeTransferItems = (transfer = {}) => {
  const merged = new Map();
  (Array.isArray(transfer.itens) ? transfer.itens : []).forEach((item) => {
    const identity = productIdentity(item);
    const values = historicalValues(item);
    if (values.quantity <= 0) return;
    const row = merged.get(identity.key) || {
      productKey: identity.key,
      productId: identity.productId,
      productName: identity.name,
      unit: normalize(item.unidade ?? item.unidadeMedida),
      quantity: 0,
      transferTotal: 0,
      resaleTotal: 0,
    };
    row.quantity += values.quantity;
    row.transferTotal += values.transferTotal;
    row.resaleTotal += values.resaleTotal;
    merged.set(identity.key, row);
  });
  return Array.from(merged.values()).map((row) => ({
    ...row,
    transferTotal: money(row.transferTotal),
    resaleTotal: money(row.resaleTotal),
  }));
};

const aggregateTransfers = (transfers = [], input = {}) => {
  const filters = {
    origemId: normalize(input.origemId),
    destinoId: normalize(input.destinoId),
    produtoId: normalize(input.produtoId),
    status: normalize(input.status),
    topLimit: Number(input.topLimit) === 10 ? 10 : 5,
  };
  const uniqueTransfers = new Map();
  transfers.forEach((transfer) => {
    if (transfer?.id) uniqueTransfers.set(transfer.id, transfer);
  });
  const products = new Map();
  const destinations = new Map();
  const countedTransfers = new Set();
  const detail = [];
  const productOptions = new Map();

  uniqueTransfers.forEach((transfer) => {
    const status = normalize(transfer.status);
    if (INVALID_STATUSES.has(status) || !VALID_STATUSES.has(status)) return;
    if (filters.status && filters.status !== status) return;
    if (filters.origemId &&
      filters.origemId !== normalize(transfer.lojaOrigemId)) return;
    if (filters.destinoId &&
      filters.destinoId !== normalize(transfer.lojaDestinoId)) return;

    const items = mergeTransferItems(transfer).filter((item) => (
      !filters.produtoId ||
      filters.produtoId === item.productId ||
      filters.produtoId === item.productKey
    ));
    if (!items.length) return;
    countedTransfers.add(transfer.id);
    const destinationId = normalize(transfer.lojaDestinoId);
    const destination = destinations.get(destinationId) || {
      storeId: destinationId,
      storeName: normalize(transfer.lojaDestinoNome) || destinationId,
      quantity: 0,
      transferIds: new Set(),
      transferTotal: 0,
      resaleTotal: 0,
    };

    items.forEach((item) => {
      if (item.productId) {
        productOptions.set(item.productId, {
          id: item.productId,
          name: item.productName,
        });
      }
      const product = products.get(item.productKey) || {
        productKey: item.productKey,
        productId: item.productId,
        productName: item.productName,
        unit: item.unit,
        quantity: 0,
        transferIds: new Set(),
        transferTotal: 0,
        resaleTotal: 0,
      };
      product.quantity += item.quantity;
      product.transferIds.add(transfer.id);
      product.transferTotal += item.transferTotal;
      product.resaleTotal += item.resaleTotal;
      products.set(item.productKey, product);

      destination.quantity += item.quantity;
      destination.transferIds.add(transfer.id);
      destination.transferTotal += item.transferTotal;
      destination.resaleTotal += item.resaleTotal;

      detail.push({
        transferId: transfer.id,
        transferNumber: transfer.numero || transfer.id,
        date: transfer.dataRemessa || null,
        originId: normalize(transfer.lojaOrigemId),
        originName: normalize(transfer.lojaOrigemNome) ||
          normalize(transfer.lojaOrigemId),
        destinationId,
        destinationName: normalize(transfer.lojaDestinoNome) || destinationId,
        productKey: item.productKey,
        productId: item.productId,
        productName: item.productName,
        unit: item.unit,
        quantity: item.quantity,
        transferTotal: item.transferTotal,
        resaleTotal: item.resaleTotal,
        status,
        closing: normalize(transfer.fechamentoNome) || '-',
        responsible: normalize(
            transfer.enviadoPorNome ?? transfer.criadoPorNome,
        ) || '-',
      });
    });
    destinations.set(destinationId, destination);
  });

  const serializeAggregate = (row, countKey) => ({
    ...row,
    [countKey]: row.transferIds.size,
    transferIds: undefined,
    quantity: Number(row.quantity.toFixed(3)),
    transferTotal: money(row.transferTotal),
    resaleTotal: money(row.resaleTotal),
  });
  const summary = Array.from(products.values())
      .map((row) => serializeAggregate(row, 'transferCount'))
      .sort((a, b) => b.quantity - a.quantity ||
        a.productName.localeCompare(b.productName, 'pt-BR'));
  const destinationRanking = Array.from(destinations.values())
      .map((row) => serializeAggregate(row, 'transferCount'))
      .sort((a, b) => b.quantity - a.quantity);
  const totals = summary.reduce((result, row) => {
    result.quantity += row.quantity;
    result.transferTotal += row.transferTotal;
    result.resaleTotal += row.resaleTotal;
    return result;
  }, {
    transferCount: countedTransfers.size,
    quantity: 0,
    productCount: summary.length,
    transferTotal: 0,
    resaleTotal: 0,
  });

  return {
    totals: {
      ...totals,
      quantity: Number(totals.quantity.toFixed(3)),
      transferTotal: money(totals.transferTotal),
      resaleTotal: money(totals.resaleTotal),
    },
    summary,
    detail: detail.sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || ''))),
    topProducts: summary.slice(0, filters.topLimit),
    topDestinations: destinationRanking.slice(0, filters.topLimit),
    productOptions: Array.from(productOptions.values())
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  };
};

const chunk = (items, size = 10) => {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const queryTransfers = async ({db, filters, isOwner, storeIds}) => {
  const transfersRef = db.collection('transferenciasEntreLojas');
  const dated = (query) => query
      .where('dataRemessa', '>=', filters.startDate)
      .where('dataRemessa', '<=', filters.endDate)
      .orderBy('dataRemessa', 'asc')
      .limit(MAX_TRANSFERS + 1);
  const snapshots = [];
  if (isOwner) {
    snapshots.push(await dated(transfersRef).get());
  } else {
    for (const storeIdsChunk of chunk(storeIds)) {
      snapshots.push(await dated(transfersRef.where(
          'lojaOrigemId', 'in', storeIdsChunk,
      )).get());
      snapshots.push(await dated(transfersRef.where(
          'lojaDestinoId', 'in', storeIdsChunk,
      )).get());
    }
  }
  const transferMap = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((document) => {
    transferMap.set(document.id, {id: document.id, ...document.data()});
  }));
  return {
    transfers: Array.from(transferMap.values()),
    exceeded: transferMap.size > MAX_TRANSFERS ||
      snapshots.some((snapshot) => snapshot.size > MAX_TRANSFERS),
  };
};

const createEntreLojasReportFunctions = ({db, onCall, HttpsError, logger}) => ({
  getEntreLojasReport: onCall({timeoutSeconds: 120}, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    }
    const filters = validateFilters(request.data || {}, HttpsError);
    try {
      const [userSnapshot, customSnapshot] = await Promise.all([
        db.collection('users').doc(uid).get(),
        db.collection('customProfiles').doc(uid).get(),
      ]);
      if (!userSnapshot.exists) {
        throw new HttpsError(
            'permission-denied',
            'Perfil de usuário não encontrado.',
        );
      }
      const profile = userSnapshot.data() || {};
      const profileStatus = normalize(profile.status).toLowerCase();
      if (profile.ativo === false || profile.authDisabled === true ||
        profileStatus === 'inativo') {
        throw new HttpsError(
            'permission-denied',
            'Sua conta está inativa.',
        );
      }
      const customProfile = customSnapshot.exists ?
        customSnapshot.data() || {} : {};
      if (!hasReportPermission({profile, customProfile})) {
        throw new HttpsError(
            'permission-denied',
            'Você não possui acesso ao módulo Relatórios.',
        );
      }
      const role = normalize(profile.role).toLowerCase();
      const isOwner = OWNER_ROLES.has(role);
      const storeIds = extractStoreIds(profile);
      if (!isOwner && !storeIds.length) {
        throw new HttpsError(
            'permission-denied',
            'Seu usuário não possui lojas autorizadas para este relatório.',
        );
      }
      const allowedStatuses = getAllowedStatuses({
        profile, customProfile, isOwner,
      });
      if (filters.status && !allowedStatuses.includes(filters.status)) {
        throw new HttpsError(
            'permission-denied',
            'O status solicitado não está autorizado para seu usuário.',
        );
      }
      const queried = await queryTransfers({
        db, filters, isOwner, storeIds,
      });
      if (queried.exceeded) {
        throw new HttpsError(
            'resource-exhausted',
            'O período retornou mais de 5.000 remessas. Reduza o intervalo.',
        );
      }
      const storeSet = new Set(storeIds);
      const statusSet = new Set(allowedStatuses);
      const visibleTransfers = queried.transfers.filter((transfer) => (
        isTransferVisible({transfer, isOwner, storeIds: storeSet}) &&
        statusSet.has(normalize(transfer.status))
      ));
      return {
        ...aggregateTransfers(visibleTransfers, filters),
        filters: {
          ...filters,
          allowedStatuses,
          allowedStoreIds: isOwner ? null : storeIds,
        },
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('[Entre Lojas] Erro ao gerar relatório:', error);
      throw new HttpsError(
          'internal',
          'Não foi possível gerar o relatório de remessas.',
      );
    }
  }),
});

module.exports = {
  INVALID_STATUSES,
  VALID_STATUSES,
  aggregateTransfers,
  createEntreLojasReportFunctions,
  extractStoreIds,
  hasReportPermission,
  historicalValues,
  isTransferVisible,
  mergeTransferItems,
  validateFilters,
};
