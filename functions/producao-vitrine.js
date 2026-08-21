const {
  PRODUCTION_STATUS,
  PRODUCTION_STATUS_VALUES,
  calculateReceiptItems,
  canReceiveProduction,
  canSendProduction,
  getMovementId,
  getNextReceiptStatus,
  getProductionPermissions,
  getProfileStoreIds,
  isOwner,
  isReceiptAlreadyProcessed,
  normalizeRole,
  sanitizeProductionItems,
  validateDivergence,
} = require('./producao-vitrine-core');

const COLLECTION = 'producoesVitrine';
const MAX_QUERY_RESULTS = 500;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeText = (value, maxLength = 500) => String(value || '').trim().slice(0, maxLength);
const getSaoPauloDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const toIsoValue = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
};

const serializeProduction = (snapshot) => {
  const data = snapshot.data() || {};
  const timestampFields = [
    'criadoEm', 'atualizadoEm', 'enviadoEm', 'recebidoEm', 'canceladoEm',
  ];
  const result = {id: snapshot.id, ...data};
  timestampFields.forEach((field) => {
    result[field] = toIsoValue(result[field]);
  });
  result.historico = (result.historico || []).map((entry) => ({
    ...entry,
    dataHora: toIsoValue(entry.dataHora),
  }));
  return result;
};

const createProductionShowcaseFunctions = ({admin, db, onCall, HttpsError, logger}) => {
  const timestampNow = () => admin.firestore.Timestamp.now();

  const loadProfile = async (uid) => {
    const [profileSnap, customSnap] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('customProfiles').doc(uid).get(),
    ]);
    if (!profileSnap.exists) {
      throw new HttpsError('permission-denied', 'Perfil de usuário não encontrado.');
    }
    const profile = profileSnap.data() || {};
    const profileStatus = normalizeText(profile.status).toLowerCase();
    if (profile.ativo === false || profile.authDisabled === true || profileStatus === 'inativo') {
      throw new HttpsError('permission-denied', 'Sua conta está inativa.');
    }
    const custom = customSnap.exists ? (customSnap.data() || {}) : {};
    return {
      ...profile,
      uid,
      permissions: custom.permissions || profile.permissions || {},
      permissionDetails: custom.permissionDetails || profile.permissionDetails || {},
    };
  };

  const actorSnapshot = (request, profile) => ({
    uid: request.auth.uid,
    nome: normalizeText(
        profile.nome || profile.name || request.auth.token?.name || request.auth.token?.email || 'Usuário',
        160,
    ),
    email: normalizeText(profile.email || request.auth.token?.email, 200),
    perfil: normalizeRole(profile.role),
    lojaIds: getProfileStoreIds(profile),
  });

  const assertStorePermission = (profile, storeId, permission) => {
    if (!storeId) throw new HttpsError('invalid-argument', 'Selecione a loja/vitrine de destino.');
    const permissions = getProductionPermissions(profile, storeId);
    if (!permissions[permission]) {
      throw new HttpsError('permission-denied', 'Você não tem permissão para esta ação nesta loja.');
    }
    return permissions;
  };

  const getStoreName = async (storeId) => {
    const storeRef = db.collection('lojas').doc(storeId);
    const [storeSnap, infoSnap] = await Promise.all([
      storeRef.get(),
      storeRef.collection('info').doc('dados').get(),
    ]);
    if (!storeSnap.exists) throw new HttpsError('not-found', 'Loja/vitrine não encontrada.');
    return normalizeText(
        storeSnap.data()?.nome || infoSnap.data()?.nome || infoSnap.data()?.razaoSocial || storeId,
        160,
    );
  };

  const loadHistoricalItems = async (storeId, items) => {
    const refs = items.map((item) => db.collection('lojas').doc(storeId)
        .collection('produtos').doc(item.productId));
    const snapshots = await Promise.all(refs.map((ref) => ref.get()));
    return items.map((item, index) => {
      const snapshot = snapshots[index];
      if (!snapshot.exists) {
        throw new HttpsError('not-found', `Produto ${item.productId} não encontrado na loja de destino.`);
      }
      const product = snapshot.data() || {};
      if (product.status === 'Inativo' || product.ativo === false) {
        throw new HttpsError('failed-precondition', `${product.nome || 'Produto'} está inativo.`);
      }
      return {
        productId: item.productId,
        produtoNome: normalizeText(product.nome || product.descricao || item.productId, 220),
        produtoCodigo: normalizeText(product.codigo || product.sku || '', 100),
        unidade: normalizeText(product.unidade || product.unit || 'un', 30),
        quantidadeEnviada: item.quantidadeEnviada,
        quantidadeRecebida: null,
        divergencia: null,
      };
    });
  };

  const notifyUsers = async ({storeId, productionId, title, message, divergence = false}) => {
    try {
      const usersSnap = await db.collection('users').get();
      const now = timestampNow();
      const writes = [];
      usersSnap.docs.forEach((userSnap) => {
        const user = {...(userSnap.data() || {}), uid: userSnap.id};
        if (user.ativo === false || normalizeText(user.status).toLowerCase() === 'inativo') return;
        const role = normalizeRole(user.role);
        const permissions = getProductionPermissions(user, storeId);
        const isManagement = isOwner(user) || ['gerente', 'gestor', 'gestora'].includes(role);
        if (divergence ? !isManagement : !permissions.canReceive) return;
        const ref = db.collection('users').doc(userSnap.id).collection('notificacoes').doc();
        writes.push({ref, data: {
          categoria: 'producao_vitrine',
          tipo: divergence ? 'PRODUCAO_VITRINE_DIVERGENCIA' : 'PRODUCAO_VITRINE_AGUARDANDO',
          titulo: title,
          mensagem: message,
          producaoId: productionId,
          lojaId: storeId,
          lida: false,
          criadoEm: now,
        }});
      });
      for (let offset = 0; offset < writes.length; offset += 400) {
        const batch = db.batch();
        writes.slice(offset, offset + 400).forEach(({ref, data}) => batch.set(ref, data));
        await batch.commit();
      }
    } catch (error) {
      logger.warn('[Produção/Vitrine] Não foi possível gerar todas as notificações.', error);
    }
  };

  const createProductionShowcase = onCall({timeoutSeconds: 60}, async (request) => {
    const profile = await loadProfile(request.auth.uid);
    const destinationStoreId = normalizeText(request.data?.lojaDestinoId, 150);
    assertStorePermission(profile, destinationStoreId, 'canCreate');
    const productionDate = normalizeText(request.data?.dataProducao, 10);
    if (!DATE_PATTERN.test(productionDate)) {
      throw new HttpsError('invalid-argument', 'Informe uma data de produção válida.');
    }
    const role = normalizeRole(profile.role);
    const canChangeProductionDate = isOwner(profile) || ['gerente', 'gestor', 'gestora'].includes(role);
    if (!canChangeProductionDate && productionDate !== getSaoPauloDate()) {
      throw new HttpsError(
          'permission-denied',
          'Seu perfil só pode registrar uma produção com a data atual.',
      );
    }
    const requestedStatus = request.data?.status === PRODUCTION_STATUS.DRAFT ?
      PRODUCTION_STATUS.DRAFT : PRODUCTION_STATUS.WAITING;
    const rawItems = sanitizeProductionItems(request.data?.itens || []);
    const [storeName, items] = await Promise.all([
      getStoreName(destinationStoreId),
      loadHistoricalItems(destinationStoreId, rawItems),
    ]);
    const actor = actorSnapshot(request, profile);
    const now = timestampNow();
    const ref = db.collection(COLLECTION).doc();
    const number = `PV-${productionDate.replace(/-/g, '')}-${ref.id.slice(0, 6).toUpperCase()}`;
    const total = items.reduce((sum, item) => sum + item.quantidadeEnviada, 0);
    const history = [{
      acao: 'producao_criada',
      statusAnterior: null,
      statusPosterior: PRODUCTION_STATUS.DRAFT,
      dataHora: now,
      usuarioUid: actor.uid,
      usuarioNome: actor.nome,
      perfil: actor.perfil,
      lojaId: destinationStoreId,
    }];
    if (requestedStatus === PRODUCTION_STATUS.WAITING) {
      history.push({
        acao: 'enviada_para_vitrine',
        statusAnterior: PRODUCTION_STATUS.DRAFT,
        statusPosterior: PRODUCTION_STATUS.WAITING,
        dataHora: now,
        usuarioUid: actor.uid,
        usuarioNome: actor.nome,
        perfil: actor.perfil,
        lojaId: destinationStoreId,
      });
    }
    await ref.set({
      schemaVersion: 1,
      numero: number,
      dataProducao: productionDate,
      lojaDestinoId: destinationStoreId,
      lojaDestinoNome: storeName,
      itens: items,
      quantidadeTotalItens: total,
      quantidadeTotalRecebida: null,
      observacaoProducao: normalizeText(request.data?.observacao, 2000),
      status: requestedStatus,
      criadoEm: now,
      atualizadoEm: now,
      criadoPorUid: actor.uid,
      criadoPorNome: actor.nome,
      criadoPorPerfil: actor.perfil,
      enviadoEm: requestedStatus === PRODUCTION_STATUS.WAITING ? now : null,
      enviadoPorUid: requestedStatus === PRODUCTION_STATUS.WAITING ? actor.uid : null,
      enviadoPorNome: requestedStatus === PRODUCTION_STATUS.WAITING ? actor.nome : null,
      historico: history,
    });

    if (requestedStatus === PRODUCTION_STATUS.WAITING) {
      await notifyUsers({
        storeId: destinationStoreId,
        productionId: ref.id,
        title: 'Nova produção aguardando recebimento',
        message: `A cozinha enviou ${total} itens para ${storeName}.`,
      });
    }
    return {id: ref.id, numero: number, status: requestedStatus};
  });

  const sendProductionShowcase = onCall({timeoutSeconds: 60}, async (request) => {
    const productionId = normalizeText(request.data?.producaoId, 200);
    if (!productionId) throw new HttpsError('invalid-argument', 'Produção não informada.');
    const profile = await loadProfile(request.auth.uid);
    const ref = db.collection(COLLECTION).doc(productionId);
    const actor = actorSnapshot(request, profile);
    const now = timestampNow();
    let production;
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Produção não encontrada.');
      production = snap.data() || {};
      assertStorePermission(profile, production.lojaDestinoId, 'canCreate');
      if (production.status === PRODUCTION_STATUS.WAITING) return;
      if (!canSendProduction(production.status)) {
        throw new HttpsError('failed-precondition', 'Somente rascunhos podem ser enviados.');
      }
      transaction.update(ref, {
        status: PRODUCTION_STATUS.WAITING,
        enviadoEm: now,
        enviadoPorUid: actor.uid,
        enviadoPorNome: actor.nome,
        atualizadoEm: now,
        historico: admin.firestore.FieldValue.arrayUnion({
          acao: 'enviada_para_vitrine',
          statusAnterior: PRODUCTION_STATUS.DRAFT,
          statusPosterior: PRODUCTION_STATUS.WAITING,
          dataHora: now,
          usuarioUid: actor.uid,
          usuarioNome: actor.nome,
          perfil: actor.perfil,
          lojaId: production.lojaDestinoId,
        }),
      });
    });
    if (production.status !== PRODUCTION_STATUS.WAITING) {
      await notifyUsers({
        storeId: production.lojaDestinoId,
        productionId,
        title: 'Nova produção aguardando recebimento',
        message: `A cozinha enviou ${production.quantidadeTotalItens || 0} itens para ${production.lojaDestinoNome || production.lojaDestinoId}.`,
      });
    }
    return {id: productionId, status: PRODUCTION_STATUS.WAITING};
  });

  const receiveProductionShowcase = onCall({timeoutSeconds: 120}, async (request) => {
    const productionId = normalizeText(request.data?.producaoId, 200);
    if (!productionId) throw new HttpsError('invalid-argument', 'Produção não informada.');
    const profile = await loadProfile(request.auth.uid);
    const actor = actorSnapshot(request, profile);
    const productionRef = db.collection(COLLECTION).doc(productionId);
    const now = timestampNow();
    let finalResult = null;

    await db.runTransaction(async (transaction) => {
      const productionSnap = await transaction.get(productionRef);
      if (!productionSnap.exists) throw new HttpsError('not-found', 'Produção não encontrada.');
      const production = productionSnap.data() || {};
      assertStorePermission(profile, production.lojaDestinoId, 'canReceive');

      if (isReceiptAlreadyProcessed(production.status)) {
        finalResult = {id: productionId, status: production.status, idempotent: true};
        return;
      }
      if (!canReceiveProduction(production.status)) {
        throw new HttpsError('failed-precondition', 'Esta produção não está aguardando recebimento.');
      }

      const receiptItems = calculateReceiptItems(production.itens || [], request.data?.itens || []);
      const divergence = validateDivergence(
          receiptItems,
          request.data?.motivoDivergencia,
          request.data?.descricaoOutroMotivo,
      );
      const nextStatus = getNextReceiptStatus(receiptItems);
      const itemRefs = receiptItems.map((item) => {
        const storeRef = db.collection('lojas').doc(production.lojaDestinoId);
        return {
          item,
          productRef: storeRef.collection('produtos').doc(item.productId),
          stockRef: storeRef.collection('estoque').doc(item.productId),
          movementRef: storeRef.collection('kardex').doc(getMovementId(productionId, item.productId)),
        };
      });
      const snapshots = [];
      for (const refs of itemRefs) {
        const [productSnap, stockSnap, movementSnap] = await Promise.all([
          transaction.get(refs.productRef),
          transaction.get(refs.stockRef),
          transaction.get(refs.movementRef),
        ]);
        snapshots.push({productSnap, stockSnap, movementSnap});
      }
      snapshots.forEach(({movementSnap}) => {
        if (movementSnap.exists) {
          throw new HttpsError(
              'failed-precondition',
              'Esta produção já possui movimentação de estoque. Atualize a tela antes de tentar novamente.',
          );
        }
      });

      itemRefs.forEach((refs, index) => {
        const {productSnap, stockSnap} = snapshots[index];
        const quantity = refs.item.quantidadeRecebida;
        if (!productSnap.exists && !stockSnap.exists) {
          throw new HttpsError('not-found', `${refs.item.produtoNome} não existe mais no estoque da loja.`);
        }
        const productData = productSnap.data() || {};
        const stockData = stockSnap.data() || {};
        const previous = Number(productData.estoque ?? stockData.quantidade ?? 0) || 0;
        if (quantity > 0) {
          if (productSnap.exists) {
            transaction.update(refs.productRef, {
              estoque: admin.firestore.FieldValue.increment(quantity),
              updatedAt: now,
            });
          }
          if (stockSnap.exists) {
            transaction.update(refs.stockRef, {
              quantidade: admin.firestore.FieldValue.increment(quantity),
              updatedAt: now,
            });
          }
        }
        transaction.create(refs.movementRef, {
          produtoId: refs.item.productId,
          produtoNome: refs.item.produtoNome,
          tipo: 'entrada',
          origem: 'producao_vitrine',
          producaoId: productionId,
          producaoNumero: production.numero,
          quantidade: quantity,
          delta: quantity,
          motivo: 'Recebimento de Produção / Vitrine',
          usuarioId: actor.uid,
          usuarioNome: actor.nome,
          lojaId: production.lojaDestinoId,
          createdAt: now,
          estoqueAnterior: previous,
          estoquePosterior: previous + quantity,
          idempotencyKey: getMovementId(productionId, refs.item.productId),
        });
      });

      const receivedTotal = receiptItems.reduce((sum, item) => sum + item.quantidadeRecebida, 0);
      transaction.update(productionRef, {
        status: nextStatus,
        itens: receiptItems,
        quantidadeTotalRecebida: receivedTotal,
        recebidoEm: now,
        recebidoPorUid: actor.uid,
        recebidoPorNome: actor.nome,
        recebidoPorPerfil: actor.perfil,
        motivoDivergencia: divergence.reason,
        descricaoOutroMotivo: divergence.otherDescription,
        observacaoRecebimento: normalizeText(request.data?.observacao, 2000),
        estoqueProcessado: true,
        estoqueProcessadoEm: now,
        atualizadoEm: now,
        historico: admin.firestore.FieldValue.arrayUnion({
          acao: divergence.hasDivergence ? 'recebida_com_divergencia' : 'recebida_sem_divergencia',
          statusAnterior: PRODUCTION_STATUS.WAITING,
          statusPosterior: nextStatus,
          dataHora: now,
          usuarioUid: actor.uid,
          usuarioNome: actor.nome,
          perfil: actor.perfil,
          lojaId: production.lojaDestinoId,
          motivoDivergencia: divergence.reason,
          observacao: normalizeText(request.data?.observacao, 1000),
          itens: receiptItems.map((item) => ({
            productId: item.productId,
            quantidadeEnviada: item.quantidadeEnviada,
            quantidadeRecebida: item.quantidadeRecebida,
            divergencia: item.divergencia,
          })),
        }),
      });
      finalResult = {id: productionId, status: nextStatus, idempotent: false};
    });

    if (finalResult.status === PRODUCTION_STATUS.RECEIVED_WITH_DIVERGENCE && !finalResult.idempotent) {
      const snap = await productionRef.get();
      const production = snap.data() || {};
      await notifyUsers({
        storeId: production.lojaDestinoId,
        productionId,
        title: 'Produção recebida com divergência',
        message: `${production.numero || 'Uma produção'} foi conferida com divergência em ${production.lojaDestinoNome || production.lojaDestinoId}.`,
        divergence: true,
      });
    }
    return finalResult;
  });

  const cancelProductionShowcase = onCall({timeoutSeconds: 60}, async (request) => {
    const productionId = normalizeText(request.data?.producaoId, 200);
    const reason = normalizeText(request.data?.motivo, 1000);
    if (!productionId || !reason) {
      throw new HttpsError('invalid-argument', 'Informe a produção e o motivo do cancelamento.');
    }
    const profile = await loadProfile(request.auth.uid);
    const actor = actorSnapshot(request, profile);
    const ref = db.collection(COLLECTION).doc(productionId);
    const now = timestampNow();
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Produção não encontrada.');
      const production = snap.data() || {};
      assertStorePermission(profile, production.lojaDestinoId, 'canCancel');
      if (![PRODUCTION_STATUS.DRAFT, PRODUCTION_STATUS.WAITING].includes(production.status)) {
        throw new HttpsError('failed-precondition', 'Somente produções não recebidas podem ser canceladas.');
      }
      transaction.update(ref, {
        status: PRODUCTION_STATUS.CANCELLED,
        canceladoEm: now,
        canceladoPorUid: actor.uid,
        canceladoPorNome: actor.nome,
        motivoCancelamento: reason,
        atualizadoEm: now,
        historico: admin.firestore.FieldValue.arrayUnion({
          acao: 'producao_cancelada',
          statusAnterior: production.status,
          statusPosterior: PRODUCTION_STATUS.CANCELLED,
          dataHora: now,
          usuarioUid: actor.uid,
          usuarioNome: actor.nome,
          perfil: actor.perfil,
          lojaId: production.lojaDestinoId,
          observacao: reason,
        }),
      });
    });
    return {id: productionId, status: PRODUCTION_STATUS.CANCELLED};
  });

  const listProductionShowcase = onCall({timeoutSeconds: 60}, async (request) => {
    const profile = await loadProfile(request.auth.uid);
    if (!profile.permissions || profile.permissions.fornecedores === false) {
      throw new HttpsError('permission-denied', 'Você não tem acesso ao módulo Fornecedores/Estoque.');
    }
    const endDate = DATE_PATTERN.test(request.data?.dataFinal || '') ? request.data.dataFinal :
      new Date().toISOString().slice(0, 10);
    const defaultStart = new Date(`${endDate}T12:00:00Z`);
    defaultStart.setUTCDate(defaultStart.getUTCDate() - 13);
    const startDate = DATE_PATTERN.test(request.data?.dataInicial || '') ? request.data.dataInicial :
      defaultStart.toISOString().slice(0, 10);
    if (startDate > endDate) throw new HttpsError('invalid-argument', 'O período informado é inválido.');
    const snap = await db.collection(COLLECTION)
        .where('dataProducao', '>=', startDate)
        .where('dataProducao', '<=', endDate)
        .orderBy('dataProducao', 'desc')
        .limit(MAX_QUERY_RESULTS)
        .get();
    const rows = snap.docs
        .filter((docSnap) => getProductionPermissions(profile, docSnap.data()?.lojaDestinoId).canRead)
        .map(serializeProduction);
    return {producoes: rows, dataInicial: startDate, dataFinal: endDate, limite: MAX_QUERY_RESULTS};
  });

  const listProductionShowcaseProducts = onCall({timeoutSeconds: 60}, async (request) => {
    const storeId = normalizeText(request.data?.lojaId, 150);
    const profile = await loadProfile(request.auth.uid);
    const permissions = getProductionPermissions(profile, storeId);
    if (!permissions.canRead || (!permissions.canCreate && !permissions.canReceive)) {
      throw new HttpsError('permission-denied', 'Você não tem acesso aos produtos desta loja.');
    }
    const snap = await db.collection('lojas').doc(storeId).collection('produtos').limit(500).get();
    const products = snap.docs
        .map((docSnap) => ({id: docSnap.id, ...(docSnap.data() || {})}))
        .filter((product) => product.ativo !== false && product.status !== 'Inativo')
        .map((product) => ({
          id: product.id,
          nome: normalizeText(product.nome || product.descricao || product.id, 220),
          codigo: normalizeText(product.codigo || product.sku || '', 100),
          unidade: normalizeText(product.unidade || product.unit || 'un', 30),
        }))
        .sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR'));
    return {produtos: products};
  });

  return {
    createProductionShowcase,
    sendProductionShowcase,
    receiveProductionShowcase,
    cancelProductionShowcase,
    listProductionShowcase,
    listProductionShowcaseProducts,
  };
};

module.exports = {
  COLLECTION,
  PRODUCTION_STATUS_VALUES,
  createProductionShowcaseFunctions,
  serializeProduction,
};
