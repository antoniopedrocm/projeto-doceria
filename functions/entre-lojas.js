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
  'superadmin',
]);

const normalizeValue = (value) => String(value || '').trim();
const normalizeRole = (value) => normalizeValue(value).toLowerCase();

const RESERVED_STORE_IDS = new Set(['internal', '__all__']);
const TECHNICAL_STORE_TYPES = new Set([
  'internal',
  'interno',
  'system',
  'sistema',
  'technical',
  'tecnico',
  'técnico',
]);

const normalizeStoreIds = (values = []) => Array.from(new Set(
    (Array.isArray(values) ? values : [])
        .map(normalizeValue)
        .filter(Boolean),
)).sort();

const isStoreActive = (store = {}) => {
  const status = normalizeValue(store.status).toLowerCase();
  return store.ativo !== false && ![
    'inativo',
    'inativa',
    'inactive',
    'desativado',
    'desativada',
  ].includes(status);
};

const createRealStoreSummary = ({
  id,
  rootExists = false,
  root = {},
  company = {},
  info = {},
} = {}) => {
  const storeId = normalizeValue(id);
  const normalizedId = storeId.toLowerCase();
  const merged = {...root, ...info, ...company};
  const storeType = normalizeValue(
      merged.tipoRegistro || merged.recordType || merged.tipo,
  ).toLowerCase();
  const isTechnicalRecord =
    !rootExists ||
    !storeId ||
    RESERVED_STORE_IDS.has(normalizedId) ||
    normalizedId.startsWith('__') ||
    merged.internal === true ||
    merged.interno === true ||
    merged.technical === true ||
    merged.tecnico === true ||
    merged.sistema === true ||
    merged.isSystem === true ||
    TECHNICAL_STORE_TYPES.has(storeType);
  const name = normalizeValue(
      merged.nomeFantasia || merged.nome || merged.razaoSocial,
  );

  if (isTechnicalRecord || !name) return null;

  return {
    id: storeId,
    nome: name,
    identificacao: normalizeValue(
        merged.identificacao || merged.codigo || merged.apelido,
    ),
    active: isStoreActive(root),
  };
};

const selectAvailableDestinationStores = (originStoreId, summaries = []) => {
  const originId = normalizeValue(originStoreId);
  const seenStoreIds = new Set();
  return (Array.isArray(summaries) ? summaries : []).filter((summary) => {
    const storeId = normalizeValue(summary?.id);
    if (
      !storeId ||
      storeId === originId ||
      summary?.active !== true ||
      seenStoreIds.has(storeId)
    ) return false;
    seenStoreIds.add(storeId);
    return true;
  });
};

const isAuthorizedTransferRoute = ({
  originStoreId,
  destinationStoreId,
  authorizedDestinationStoreIds = [],
  destinationExists = true,
  destinationActive = true,
}) => {
  const originId = normalizeValue(originStoreId);
  const destinationId = normalizeValue(destinationStoreId);
  return Boolean(
      originId &&
      destinationId &&
      originId !== destinationId &&
      destinationExists &&
      destinationActive &&
      normalizeStoreIds(authorizedDestinationStoreIds).includes(destinationId),
  );
};

const extractStoreIds = (profile = {}) => {
  const rawStoreIds = Array.isArray(profile.lojaIds) && profile.lojaIds.length ?
    profile.lojaIds :
    (profile.lojaId ? [profile.lojaId] : []);
  return Array.from(new Set(rawStoreIds.map(normalizeValue).filter(Boolean)));
};

const resolveEntreLojasRelation = (profile = {}, record = {}) => {
  if (OWNER_ROLES.has(normalizeRole(profile.role))) return 'dono';
  if (normalizeRole(profile.role) !== 'gerente') return 'sem_vinculo';

  const storeIds = extractStoreIds(profile);
  if (storeIds.includes(normalizeValue(record.lojaOrigemId))) return 'origem';
  if (storeIds.includes(normalizeValue(record.lojaDestinoId))) return 'destino';
  return 'sem_vinculo';
};

const calculateClosingTotals = (transfers = []) => transfers.reduce((totals, transfer) => {
  if (!transfer || ['cancelado', 'cancelada'].includes(transfer.status)) return totals;
  totals.quantidadeRemessas += 1;
  totals.quantidadeTotalItens += Number(transfer.quantidadeTotalItens) || 0;
  totals.totalRepasse += Number(transfer.totalRepasse) || 0;
  totals.totalRevenda += Number(transfer.totalRevenda) || 0;
  if (['pagamento_informado', 'pagamento_confirmado'].includes(transfer.status)) {
    totals.quantidadeRemessasPagas += 1;
    totals.totalPagoRepasse += Number(transfer.totalRepasse) || 0;
    totals.totalPagoRevenda += Number(transfer.totalRevenda) || 0;
  }
  return totals;
}, {
  quantidadeRemessas: 0,
  quantidadeRemessasPagas: 0,
  quantidadeTotalItens: 0,
  totalRepasse: 0,
  totalRevenda: 0,
  totalPagoRepasse: 0,
  totalPagoRevenda: 0,
});

const getProfileAccess = async (db, uid, HttpsError) => {
  const [profileSnapshot, customProfileSnapshot] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('customProfiles').doc(uid).get(),
  ]);
  if (!profileSnapshot.exists) {
    throw new HttpsError('permission-denied', 'Perfil de usuário não encontrado.');
  }

  const profile = profileSnapshot.data() || {};
  const profileStatus = normalizeValue(profile.status).toLowerCase();
  if (
    profile.ativo === false ||
    profile.authDisabled === true ||
    profileStatus === 'inativo'
  ) {
    throw new HttpsError('permission-denied', 'Sua conta está inativa.');
  }
  const customProfile = customProfileSnapshot.exists ?
    customProfileSnapshot.data() || {} :
    {};
  const role = normalizeRole(customProfile.role || profile.role);
  const permissions = customProfile.permissions || profile.permissions || {};
  const permissionDetails = customProfile.permissionDetails ||
    profile.permissionDetails || {};
  const entreLojasDetails = permissionDetails['entre-lojas'] ||
    permissionDetails.entreLojas || {};
  const isOwner = OWNER_ROLES.has(role);

  return {
    uid,
    profile,
    role,
    isOwner,
    storeIds: extractStoreIds(profile),
    canUseModule: isOwner || permissions['entre-lojas'] !== false,
    canManageDestinations: isOwner || (
      role === 'gerente' &&
      entreLojasDetails.manageTransferDestinations === true
    ),
  };
};

const assertOriginAccess = (access, originStoreId, HttpsError) => {
  const originId = normalizeValue(originStoreId);
  if (!originId) {
    throw new HttpsError('invalid-argument', 'Loja de origem obrigatória.');
  }
  if (!access.canUseModule) {
    throw new HttpsError(
        'permission-denied',
        'Você não possui acesso ao módulo Entre Lojas.',
    );
  }
  if (!access.isOwner && !access.storeIds.includes(originId)) {
    throw new HttpsError(
        'permission-denied',
        'Você não possui acesso à loja de origem.',
    );
  }
  return originId;
};

const loadStoreSummary = async (db, storeId) => {
  const id = normalizeValue(storeId);
  const rootRef = db.collection('lojas').doc(id);
  const [rootSnapshot, companySnapshot, infoSnapshot] = await Promise.all([
    rootRef.get(),
    rootRef.collection('meuEspaco').doc('empresa').get(),
    rootRef.collection('info').doc('dados').get(),
  ]);

  return createRealStoreSummary({
    id,
    rootExists: rootSnapshot.exists,
    root: rootSnapshot.exists ? rootSnapshot.data() || {} : {},
    company: companySnapshot.exists ? companySnapshot.data() || {} : {},
    info: infoSnapshot.exists ? infoSnapshot.data() || {} : {},
  });
};

const getKnownStoreIds = async (db) => {
  const storesSnapshot = await db.collection('lojas').select().get();
  return normalizeStoreIds(
      storesSnapshot.docs.map((snapshot) => snapshot.id),
  );
};

const getAuthorizedDestinationIds = async (db, originStoreId) => {
  const configSnapshot = await db.collection('lojas').doc(originStoreId)
      .collection('configuracoes').doc('config').get();
  return normalizeStoreIds(
      configSnapshot.data()?.entreLojas?.authorizedDestinationStoreIds,
  ).filter((destinationId) => destinationId !== originStoreId);
};

const listAuthorizedDestinations = async ({db, access, originStoreId, HttpsError}) => {
  const originId = assertOriginAccess(access, originStoreId, HttpsError);
  const [originSummary, destinationIds] = await Promise.all([
    loadStoreSummary(db, originId),
    getAuthorizedDestinationIds(db, originId),
  ]);
  if (!originSummary) {
    throw new HttpsError('not-found', 'Loja de origem não encontrada.');
  }
  const summaries = await Promise.all(
      destinationIds.map((destinationId) => loadStoreSummary(db, destinationId)),
  );
  return selectAvailableDestinationStores(originId, summaries);
};

const createEntreLojasFunctions = ({admin, db, onCall, HttpsError, logger}) => ({
  listAuthorizedTransferDestinations: onCall(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    }
    const access = await getProfileAccess(db, uid, HttpsError);
    const originStoreId = normalizeValue(request.data?.originStoreId);
    const destinations = await listAuthorizedDestinations({
      db,
      access,
      originStoreId,
      HttpsError,
    });
    return {originStoreId, destinations};
  }),

  getTransferDestinationConfiguration: onCall(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    }
    const access = await getProfileAccess(db, uid, HttpsError);
    const originStoreId = assertOriginAccess(
        access,
        request.data?.originStoreId,
        HttpsError,
    );
    if (!access.canManageDestinations) {
      throw new HttpsError(
          'permission-denied',
          'Você não possui permissão para gerenciar destinos de remessas.',
      );
    }

    const [authorizedDestinationStoreIds, knownStoreIds] = await Promise.all([
      getAuthorizedDestinationIds(db, originStoreId),
      getKnownStoreIds(db),
    ]);
    const summaries = await Promise.all(normalizeStoreIds([
      ...knownStoreIds,
      ...authorizedDestinationStoreIds,
    ])
        .filter((storeId) => storeId !== originStoreId)
        .map((storeId) => loadStoreSummary(db, storeId)));
    const stores = selectAvailableDestinationStores(originStoreId, summaries);
    const availableStoreIds = new Set(stores.map((store) => store.id));
    return {
      originStoreId,
      authorizedDestinationStoreIds: authorizedDestinationStoreIds.filter(
          (storeId) => availableStoreIds.has(storeId),
      ),
      stores,
    };
  }),

  updateTransferDestinations: onCall(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    }
    const access = await getProfileAccess(db, uid, HttpsError);
    const originStoreId = assertOriginAccess(
        access,
        request.data?.originStoreId,
        HttpsError,
    );
    if (!access.canManageDestinations) {
      throw new HttpsError(
          'permission-denied',
          'Você não possui permissão para gerenciar destinos de remessas.',
      );
    }

    const destinationStoreIds = normalizeStoreIds(
        request.data?.authorizedDestinationStoreIds,
    );
    if (destinationStoreIds.includes(originStoreId)) {
      throw new HttpsError(
          'invalid-argument',
          'A loja de origem não pode ser destino dela mesma.',
      );
    }

    const [originSummary, destinationSummaries] = await Promise.all([
      loadStoreSummary(db, originStoreId),
      Promise.all(destinationStoreIds.map((destinationId) => (
        loadStoreSummary(db, destinationId)
      ))),
    ]);
    if (!originSummary) {
      throw new HttpsError('not-found', 'Loja de origem não encontrada.');
    }
    const invalidDestination = destinationSummaries.find(
        (summary) => !summary || summary.active !== true,
    );
    if (invalidDestination || destinationSummaries.length !== destinationStoreIds.length) {
      throw new HttpsError(
          'failed-precondition',
          'Todos os destinos precisam existir e estar ativos.',
      );
    }

    const configRef = db.collection('lojas').doc(originStoreId)
        .collection('configuracoes').doc('config');
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const result = await db.runTransaction(async (transaction) => {
      const configSnapshot = await transaction.get(configRef);
      const previousIds = normalizeStoreIds(
          configSnapshot.data()?.entreLojas?.authorizedDestinationStoreIds,
      ).filter((destinationId) => destinationId !== originStoreId);
      const addedIds = destinationStoreIds.filter((id) => !previousIds.includes(id));
      const removedIds = previousIds.filter((id) => !destinationStoreIds.includes(id));
      const summaryById = new Map(destinationSummaries
          .map((summary) => [summary.id, summary]));

      transaction.set(configRef, {
        entreLojas: {
          authorizedDestinationStoreIds: destinationStoreIds,
          destinationsUpdatedAt: timestamp,
          destinationsUpdatedByUid: uid,
          destinationsUpdatedByName: normalizeValue(
              access.profile.nome || access.profile.email || uid,
          ),
        },
      }, {merge: true});

      [...addedIds.map((id) => ({id, action: 'adicionado'})),
        ...removedIds.map((id) => ({id, action: 'removido'}))]
          .forEach(({id, action}) => {
            const auditRef = db.collection('transferDestinationAuditLogs').doc();
            transaction.set(auditRef, {
              categoria: 'entre-lojas',
              tipo: 'destino_remessa',
              acao: action,
              usuario: normalizeValue(
                  access.profile.nome || access.profile.email || uid,
              ),
              usuarioUid: uid,
              perfil: access.role,
              lojaOrigemId: originStoreId,
              lojaOrigemNome: originSummary.nome,
              lojaDestinoId: id,
              lojaDestinoNome: summaryById.get(id)?.nome || id,
              dataHora: timestamp,
            });
          });

      return {addedIds, removedIds};
    });

    return {
      success: true,
      originStoreId,
      authorizedDestinationStoreIds: destinationStoreIds,
      ...result,
    };
  }),

  recalculateEntreLojasClosing: onCall({timeoutSeconds: 60}, async (request) => {
    const uid = request.auth?.uid;
    const fechamentoId = normalizeValue(request.data?.fechamentoId);
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    }
    if (!fechamentoId) {
      throw new HttpsError('invalid-argument', 'Fechamento obrigatório.');
    }

    try {
      return await db.runTransaction(async (transaction) => {
        const userRef = db.collection('users').doc(uid);
        const closingRef = db.collection('fechamentosEntreLojas').doc(fechamentoId);
        const [userSnapshot, closingSnapshot] = await Promise.all([
          transaction.get(userRef),
          transaction.get(closingRef),
        ]);
        if (!userSnapshot.exists) {
          throw new HttpsError('permission-denied', 'Perfil de usuário não encontrado.');
        }
        if (!closingSnapshot.exists) {
          throw new HttpsError('not-found', 'Fechamento não encontrado.');
        }

        const profile = userSnapshot.data() || {};
        if (
          profile.ativo === false ||
          profile.authDisabled === true ||
          normalizeValue(profile.status).toLowerCase() === 'inativo'
        ) {
          throw new HttpsError('permission-denied', 'Sua conta está inativa.');
        }
        const closing = {id: closingSnapshot.id, ...closingSnapshot.data()};
        const relation = resolveEntreLojasRelation(profile, closing);
        if (!['dono', 'origem', 'destino'].includes(relation)) {
          throw new HttpsError(
              'permission-denied',
              'Você não possui vínculo com este fechamento.',
          );
        }

        const transferIds = Array.from(new Set(
            (closing.remessaIds || []).map(normalizeValue).filter(Boolean),
        ));
        const transferSnapshots = [];
        for (const transferId of transferIds) {
          transferSnapshots.push(await transaction.get(
              db.collection('transferenciasEntreLojas').doc(transferId),
          ));
        }
        const activeTransfers = transferSnapshots
            .filter((snapshot) => snapshot.exists)
            .map((snapshot) => ({id: snapshot.id, ...snapshot.data()}))
            .filter((transfer) => (
              transfer.fechamentoId === fechamentoId
              && !['cancelado', 'cancelada'].includes(transfer.status)
            ));
        const totals = calculateClosingTotals(activeTransfers);
        const closingPaidInFull = [
          'pagamento_informado',
          'pagamento_confirmado',
          'pagamento_contestado',
        ].includes(closing.status);
        const totalPagoRepasse = closingPaidInFull ?
          totals.totalRepasse :
          totals.totalPagoRepasse;
        const totalPagoRevenda = closingPaidInFull ?
          totals.totalRevenda :
          totals.totalPagoRevenda;
        const quantidadeRemessasPagas = closingPaidInFull ?
          totals.quantidadeRemessas :
          totals.quantidadeRemessasPagas;

        transaction.update(closingRef, {
          remessaIds: activeTransfers.map((transfer) => transfer.id),
          quantidadeRemessas: totals.quantidadeRemessas,
          quantidadeRemessasPagas,
          quantidadeTotalItens: totals.quantidadeTotalItens,
          totalRepasse: Number(totals.totalRepasse.toFixed(2)),
          totalRevenda: Number(totals.totalRevenda.toFixed(2)),
          totalPagoRepasse: Number(totalPagoRepasse.toFixed(2)),
          totalPagoRevenda: Number(totalPagoRevenda.toFixed(2)),
          totalRestanteRepasse: Number(Math.max(
              0,
              totals.totalRepasse - totalPagoRepasse,
          ).toFixed(2)),
          totalRestanteRevenda: Number(Math.max(
              0,
              totals.totalRevenda - totalPagoRevenda,
          ).toFixed(2)),
          dataAtualizacao: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
          success: true,
          fechamentoId,
          relation,
          quantidadeRemessas: totals.quantidadeRemessas,
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('[Entre Lojas] Erro ao recalcular fechamento:', error);
      throw new HttpsError('internal', 'Não foi possível recalcular o fechamento.');
    }
  }),
});

module.exports = {
  calculateClosingTotals,
  createRealStoreSummary,
  createEntreLojasFunctions,
  isAuthorizedTransferRoute,
  isStoreActive,
  resolveEntreLojasRelation,
  selectAvailableDestinationStores,
};
