const {
  DEFAULT_TIME_ZONE,
  ROLE_CLIENT,
  ROLE_MANAGER,
  ROLE_OWNER,
  assertSafeIntegerCents,
  calculateCashConference,
  calculateCashRefundsCents,
  calculateCashRemovalsCents,
  calculateCashSalesCents,
  calculateCashWithdrawalsCents,
  calculateOtherCashEntriesCents,
  datePartsInTimeZone,
  idempotencyDocumentId,
  isFinalizedOrder,
  normalizeIdempotencyKey,
  normalizeOperationalDate,
  normalizeRole,
  operationalDayBounds,
  resolveCashPermissions,
} = require('./caixa-core');

const CONFIG_OWNER_ONLY = 'somente_dono';
const CONFIG_OWNER_MANAGERS = 'dono_e_gerentes';
const CALCULATION_VERSION = 1;
const STORE_ALL_KEY = '__all__';
const MAX_LIST_LIMIT = 100;
const MAX_MARK_ALL_BATCH = 400;
const CASH_ALERT_TYPES = [
  'CAIXA_INICIO_DIVERGENTE',
  'CAIXA_ENCERRAMENTO_DIVERGENTE',
];
const CASH_ALERT_SITUATIONS = [
  'aberto',
  'em_analise',
  'resolvido',
];
const MAX_ALERT_SCAN = 500;
const MAX_ALERT_DELETE_BATCH = 50;

const cleanText = (value, maxLength = 500) => String(value || '')
  .trim()
  .slice(0, maxLength);

const extractStoreIds = (profile = {}) => {
  const candidates = [profile.lojaIds, profile.lojas, profile.lojaId];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return Array.from(new Set(candidate.map((value) => cleanText(value, 120))
        .filter(Boolean)));
    }
  }
  const single = cleanText(profile.lojaId, 120);
  return single ? [single] : [];
};

const hasStoreAccess = (role, storeIds, lojaId) => (
  (role === ROLE_OWNER && storeIds.length === 0) || storeIds.includes(lojaId)
);

const parseListLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, MAX_LIST_LIMIT);
};

const normalizeAlertSituation = (value) => (
  CASH_ALERT_SITUATIONS.includes(cleanText(value, 40).toLowerCase()) ?
    cleanText(value, 40).toLowerCase() :
    'aberto'
);

const normalizeAlertSort = (value) => {
  const normalized = cleanText(value, 60).toLowerCase();
  if ([
    'mais_recentes',
    'mais_antigos',
    'maior_diferenca',
    'menor_diferenca',
  ].includes(normalized)) return normalized;
  return 'mais_recentes';
};

const normalizeSearchText = (value) => cleanText(value, 240)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const documentData = (snapshot) => snapshot?.exists ? snapshot.data() || {} : {};

const snapshotRecords = (snapshot) => snapshot.docs.map((document) => ({
  id: document.id,
  path: document.ref.path,
  ...document.data(),
}));

const mergeSnapshotRecords = (...snapshots) => {
  const records = new Map();
  snapshots.forEach((snapshot) => {
    snapshotRecords(snapshot).forEach((record) => records.set(record.path, record));
  });
  return Array.from(records.values());
};

const publicOperationalRecord = (snapshotOrData, fallbackId = '') => {
  const isSnapshot = snapshotOrData &&
    typeof snapshotOrData.data === 'function';
  const data = isSnapshot ? documentData(snapshotOrData) : snapshotOrData || {};
  const id = isSnapshot ? snapshotOrData.id : fallbackId;
  if (!Object.keys(data).length) return null;
  return {
    id,
    lojaId: data.lojaId || '',
    dataOperacional: data.dataOperacional || id,
    valorInicialCentavos: Number.isSafeInteger(data.valorInicialCentavos) ?
      data.valorInicialCentavos :
      null,
    observacaoInicial: data.observacaoInicial || '',
    responsavelInicioUid: data.responsavelInicioUid || '',
    responsavelInicioNome: data.responsavelInicioNome || '',
    valorInicialResponsavelUid: data.responsavelInicioUid || '',
    valorInicialResponsavelNome: data.responsavelInicioNome || '',
    valorInicialRegistradoEm: data.valorInicialRegistradoEm || null,
    valorEncerramentoCentavos: Number.isSafeInteger(
      data.valorEncerramentoCentavos,
    ) ? data.valorEncerramentoCentavos : null,
    observacaoEncerramento: data.observacaoEncerramento || '',
    responsavelEncerramentoUid: data.responsavelEncerramentoUid || '',
    responsavelEncerramentoNome: data.responsavelEncerramentoNome || '',
    valorEncerramentoResponsavelUid: data.responsavelEncerramentoUid || '',
    valorEncerramentoResponsavelNome: data.responsavelEncerramentoNome || '',
    valorEncerramentoRegistradoEm: data.valorEncerramentoRegistradoEm || null,
    temValorEncerramento: data.temValorEncerramento === true,
  };
};

const publicRemoval = (snapshotOrData, fallbackId = '') => {
  const isSnapshot = snapshotOrData &&
    typeof snapshotOrData.data === 'function';
  const data = isSnapshot ? documentData(snapshotOrData) : snapshotOrData || {};
  const id = isSnapshot ? snapshotOrData.id : fallbackId;
  return {
    id,
    lojaId: data.lojaId || '',
    dataOperacional: data.dataOperacional || '',
    valorCentavos: Number.isSafeInteger(data.valorAtualCentavos) ?
      data.valorAtualCentavos :
      data.valorCentavos,
    valorOriginalCentavos: data.valorOriginalCentavos,
    motivo: data.motivo || '',
    observacao: data.observacao || '',
    destino: data.destino || '',
    responsavelUid: data.responsavelUid || '',
    responsavelNome: data.responsavelNome || '',
    responsavelEmail: data.responsavelEmail || '',
    criadoEm: data.criadoEm || null,
    atualizadoEm: data.atualizadoEm || null,
    ajustes: Array.isArray(data.ajustes) ? data.ajustes : [],
  };
};

const publicWithdrawal = (snapshotOrData, fallbackId = '') => {
  const isSnapshot = snapshotOrData &&
    typeof snapshotOrData.data === 'function';
  const data = isSnapshot ? documentData(snapshotOrData) : snapshotOrData || {};
  const id = isSnapshot ? snapshotOrData.id : fallbackId;
  return {
    id,
    lojaId: data.lojaId || '',
    dataOperacional: data.dataOperacional || data.dataRetirada || '',
    valorCentavos: data.valorCentavos,
    motivo: data.motivo || '',
    observacao: data.observacoes || data.observacao || '',
    responsavelUid: data.registradoPorUid || '',
    responsavelNome: data.registradoPorNome || '',
    responsavelEmail: data.registradoPorEmail || '',
    registradoEm: data.registradoEm || data.createdAt || null,
  };
};

const createCaixaFunctions = ({
  admin,
  db,
  onCall,
  onDocumentWritten,
  HttpsError,
  logger,
}) => {
  const FieldValue = admin.firestore.FieldValue;

  const storeRef = (lojaId) => db.collection('lojas').doc(lojaId);
  const userRef = (uid) => db.collection('users').doc(uid);
  const customProfileRef = (uid) => db.collection('customProfiles').doc(uid);
  const dailyRef = (lojaId, dateKey) => storeRef(lojaId)
    .collection('caixas').doc(dateKey);
  const conferenceRef = (lojaId, dateKey) => storeRef(lojaId)
    .collection('conferenciasCaixa').doc(dateKey);
  const removalsCollection = (lojaId) => storeRef(lojaId)
    .collection('sangriasCaixa');
  const alertsCollection = (lojaId) => storeRef(lojaId).collection('alertas');
  const internalConfigRef = (lojaId) => storeRef(lojaId)
    .collection('configuracoesInternas').doc('alertas');
  const idempotencyRef = (lojaId, operation, uid, key) => storeRef(lojaId)
    .collection('configuracoesInternas')
    .doc(`operacaoCaixa_${idempotencyDocumentId(operation, uid, key)}`);
  const notificationRef = (uid, notificationId) => userRef(uid)
    .collection('notificacoes').doc(notificationId);
  const logCollection = (lojaId) => storeRef(lojaId)
    .collection('configuracoes').doc('config').collection('logs');
  const alertAuditCollection = (lojaId, alertId) => alertsCollection(lojaId)
    .doc(alertId).collection('auditoria');

  const requireCashActor = async (
      request,
      {permission = '', allowedRoles = null} = {},
  ) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Voce precisa estar autenticado.');
    }
    const lojaId = cleanText(request.data?.lojaId, 120);
    if (!lojaId || lojaId === STORE_ALL_KEY || lojaId.includes('/')) {
      throw new HttpsError(
        'failed-precondition',
        'Selecione uma loja especifica.',
      );
    }

    const [profileSnap, customSnap, currentStoreSnap, configSnap] =
      await Promise.all([
        userRef(uid).get(),
        customProfileRef(uid).get(),
        storeRef(lojaId).get(),
        storeRef(lojaId).collection('configuracoes').doc('config').get(),
      ]);
    if (!profileSnap.exists) {
      throw new HttpsError(
        'permission-denied',
        'Perfil de usuario nao encontrado.',
      );
    }
    if (!currentStoreSnap.exists) {
      throw new HttpsError('not-found', 'Loja nao encontrada.');
    }

    const profile = documentData(profileSnap);
    const customProfile = documentData(customSnap);
    const role = normalizeRole(profile.role || customProfile.role);
    const storeIds = extractStoreIds(profile);
    if ([ROLE_CLIENT, 'contador'].includes(role)) {
      throw new HttpsError(
        'permission-denied',
        'Este perfil nao possui acesso ao Caixa.',
      );
    }
    if (!hasStoreAccess(role, storeIds, lojaId)) {
      throw new HttpsError(
        'permission-denied',
        'Voce nao possui acesso a esta loja.',
      );
    }
    const modulePermissions = customProfile.permissions &&
      typeof customProfile.permissions === 'object' ?
      customProfile.permissions :
      profile.permissions || {};
    if (
      role === ROLE_MANAGER &&
      modulePermissions.fornecedores === false
    ) {
      throw new HttpsError(
        'permission-denied',
        'Voce nao possui acesso ao modulo Fornecedores/Estoque.',
      );
    }
    if (Array.isArray(allowedRoles) && !allowedRoles.includes(role)) {
      throw new HttpsError(
        'permission-denied',
        'Seu perfil nao possui permissao para esta operacao.',
      );
    }

    const permissions = resolveCashPermissions(profile, customProfile);
    if (permission && permissions[permission] !== true) {
      throw new HttpsError(
        'permission-denied',
        'Voce nao possui permissao para esta operacao de caixa.',
      );
    }

    return {
      uid,
      lojaId,
      role,
      storeIds,
      permissions,
      nome: cleanText(profile.nome || profile.name || profile.email, 160) ||
        'Colaborador',
      email: cleanText(profile.email || request.auth?.token?.email, 240),
      timeZone: cleanText(documentData(configSnap).timezone, 80) ||
        DEFAULT_TIME_ZONE,
    };
  };

  const requireCashAlertActor = async (request, {ownerOnly = false} = {}) => {
    const actor = await requireCashActor(request, {
      allowedRoles: ownerOnly ? [ROLE_OWNER] : [ROLE_OWNER, ROLE_MANAGER],
    });
    if (actor.role === ROLE_OWNER) return actor;

    const configSnapshot = await internalConfigRef(actor.lojaId).get();
    const config = normalizeAlertConfig(documentData(configSnapshot));
    if (
      config.destinatarios !== CONFIG_OWNER_MANAGERS ||
      actor.permissions.visualizarDivergencias !== true
    ) {
      throw new HttpsError(
        'permission-denied',
        'Os alertas de caixa desta loja estao restritos ao dono.',
      );
    }
    return actor;
  };

  const requireDate = (request) => {
    const dateKey = normalizeOperationalDate(request.data?.dataOperacional);
    if (!dateKey) {
      throw new HttpsError(
        'invalid-argument',
        'dataOperacional deve usar o formato AAAA-MM-DD.',
      );
    }
    return dateKey;
  };

  const requireAmount = (request, {allowZero = false} = {}) => {
    const cents = assertSafeIntegerCents(
      request.data?.valorCentavos ?? request.data?.novoValorCentavos,
      {allowZero},
    );
    if (cents === null) {
      throw new HttpsError(
        'invalid-argument',
        allowZero ?
          'Informe um valor em centavos igual ou maior que zero.' :
          'Informe um valor em centavos maior que zero.',
      );
    }
    return cents;
  };

  const requireIdempotency = (request, operation, actor) => {
    const key = normalizeIdempotencyKey(request.data?.idempotencyKey);
    if (!key) {
      throw new HttpsError(
        'invalid-argument',
        'idempotencyKey invalida ou ausente.',
      );
    }
    return {
      key,
      keyHash: idempotencyDocumentId(operation, actor.uid, key),
      ref: idempotencyRef(actor.lojaId, operation, actor.uid, key),
    };
  };

  const setIdempotencyResult = (
      transaction,
      context,
      actor,
      operation,
      result,
  ) => {
    transaction.set(context.ref, {
      tipo: 'idempotencia_caixa',
      operacao: operation,
      lojaId: actor.lojaId,
      uid: actor.uid,
      chaveHash: context.keyHash,
      resultado: result,
      criadoEm: FieldValue.serverTimestamp(),
    });
  };

  const setActivityLog = (transaction, actor, action, details, entityId) => {
    const ref = logCollection(actor.lojaId).doc();
    transaction.set(ref, {
      action,
      details,
      source: 'caixa',
      entityId: entityId || '',
      userUid: actor.uid,
      userEmail: actor.email || '',
      userName: actor.nome,
      timestamp: FieldValue.serverTimestamp(),
    });
  };

  const setAlertAudit = (
      transaction,
      actor,
      alertId,
      action,
      previousState,
      newState,
      details = '',
  ) => {
    const ref = alertAuditCollection(actor.lojaId, alertId).doc();
    transaction.set(ref, {
      action,
      lojaId: actor.lojaId,
      alertaId: alertId,
      usuarioUid: actor.uid,
      usuarioNome: actor.nome,
      usuarioEmail: actor.email || '',
      perfil: actor.role,
      estadoAnterior: previousState || '',
      estadoNovo: newState || '',
      detalhes: cleanText(details, 1000),
      criadoEm: FieldValue.serverTimestamp(),
    });
  };

  const normalizeAlertConfig = (data = {}) => ({
    destinatarios: data.destinatarios === CONFIG_OWNER_MANAGERS ?
      CONFIG_OWNER_MANAGERS :
      CONFIG_OWNER_ONLY,
  });

  const publicCashAlert = (snapshot, notification = null) => {
    const data = documentData(snapshot);
    const values = data.valores && typeof data.valores === 'object' ?
      data.valores :
      {};
    const situation = normalizeAlertSituation(data.situacao);
    const read = notification?.lida === true;
    const informedCents = Number.isSafeInteger(
      values.valorInformadoCentavos,
    ) ? values.valorInformadoCentavos :
      (Number.isSafeInteger(values.valorInicialCentavos) ?
        values.valorInicialCentavos :
        values.valorEncerramentoCentavos);
    const expectedCents = Number.isSafeInteger(
      values.valorEsperadoCentavos,
    ) ? values.valorEsperadoCentavos :
      (Number.isSafeInteger(values.encerramentoAnteriorCentavos) ?
        values.encerramentoAnteriorCentavos :
        values.valorAnteriorCentavos);
    return {
      id: snapshot.id,
      categoria: 'caixa',
      tipo: data.tipo || '',
      origem: data.origem || (
        data.tipo === 'CAIXA_INICIO_DIVERGENTE' ?
          'divergencia_valor_inicial' :
          'divergencia_encerramento'
      ),
      lojaId: data.lojaId || snapshot.ref.parent.parent?.id || '',
      lojaNome: data.lojaNome || '',
      dataOperacional: data.dataOperacional || '',
      criadoEm: data.criadoEm || null,
      atualizadoEm: data.atualizadoEm || data.criadoEm || null,
      titulo: data.titulo || 'Divergencia de caixa',
      mensagem: data.mensagem || '',
      responsavelUid: data.responsavelUid || '',
      responsavelNome: data.responsavelNome || '',
      responsavelEmail: data.responsavelEmail || '',
      valorEsperadoCentavos: Number.isSafeInteger(expectedCents) ?
        expectedCents :
        null,
      valorInformadoCentavos: Number.isSafeInteger(informedCents) ?
        informedCents :
        null,
      diferencaCentavos: Number.isSafeInteger(data.diferencaCentavos) ?
        data.diferencaCentavos :
        null,
      valores: values,
      severidade: data.severidade || 'warning',
      situacao: situation,
      situacaoExibicao: situation === 'aberto' ?
        (read ? 'lido' : 'nao_lido') :
        situation,
      lida: read,
      lidaEm: notification?.lidaEm || null,
      referencia: data.referencia || '',
      destinatariosUids: Array.isArray(data.destinatariosUids) ?
        data.destinatariosUids :
        [],
      resolvidoPorUid: data.resolvidoPorUid || '',
      resolvidoPorNome: data.resolvidoPorNome || '',
      resolvidoEm: data.resolvidoEm || null,
      observacaoResolucao: data.observacaoResolucao || '',
    };
  };

  const matchesAlertFilters = (alert, filters = {}) => {
    if (filters.dataInicio && alert.dataOperacional < filters.dataInicio) {
      return false;
    }
    if (filters.dataFim && alert.dataOperacional > filters.dataFim) {
      return false;
    }
    if (filters.tipo && filters.tipo !== 'todos' &&
      alert.tipo !== filters.tipo) return false;
    if (filters.severidade && filters.severidade !== 'todas' &&
      alert.severidade !== filters.severidade) return false;
    if (filters.situacao && filters.situacao !== 'todas' &&
      alert.situacaoExibicao !== filters.situacao) return false;
    if (filters.divergencia === 'positiva' &&
      !(alert.diferencaCentavos > 0)) return false;
    if (filters.divergencia === 'negativa' &&
      !(alert.diferencaCentavos < 0)) return false;

    const responsible = normalizeSearchText(filters.responsavel);
    if (responsible && !normalizeSearchText([
      alert.responsavelNome,
      alert.responsavelEmail,
      alert.responsavelUid,
    ].join(' ')).includes(responsible)) return false;

    const search = normalizeSearchText(filters.pesquisa);
    if (search && !normalizeSearchText([
      alert.titulo,
      alert.mensagem,
      alert.responsavelNome,
      alert.dataOperacional,
    ].join(' ')).includes(search)) return false;
    return true;
  };

  const requireAlertId = (value) => {
    const alertId = cleanText(value, 180);
    if (!alertId || alertId.includes('/')) {
      throw new HttpsError('invalid-argument', 'Alerta invalido.');
    }
    return alertId;
  };

  const deleteCashAlerts = async (request, {single = false} = {}) => {
    const actor = await requireCashAlertActor(request, {ownerOnly: true});
    const rawIds = single ?
      [request.data?.alertaId] :
      request.data?.alertasIds;
    const alertIds = Array.from(new Set(
      (Array.isArray(rawIds) ? rawIds : [])
        .map((value) => requireAlertId(value)),
    ));
    if (!alertIds.length || alertIds.length > MAX_ALERT_DELETE_BATCH) {
      throw new HttpsError(
        'invalid-argument',
        `Selecione entre 1 e ${MAX_ALERT_DELETE_BATCH} alertas.`,
      );
    }
    const reason = cleanText(request.data?.motivo, 1000);
    const operation = single ?
      'excluirAlertaCaixa' :
      'excluirAlertasCaixaEmLote';
    const idempotency = requireIdempotency(request, operation, actor);
    const operationSnapshot = await idempotency.ref.get();
    if (operationSnapshot.exists) {
      return documentData(operationSnapshot).resultado || {
        success: true,
        excluidos: 0,
      };
    }

    let deletedCount = 0;
    for (const alertId of alertIds) {
      const wasDeleted = await db.runTransaction(async (transaction) => {
        const alertRef = alertsCollection(actor.lojaId).doc(alertId);
        const snapshot = await transaction.get(alertRef);
        if (!snapshot.exists) return false;
        const alert = documentData(snapshot);
        if (alert.isDeleted === true) return false;

        transaction.update(alertRef, {
          isDeleted: true,
          deletedAt: FieldValue.serverTimestamp(),
          deletedBy: actor.uid,
          deletedByName: actor.nome,
          deleteReason: reason,
          atualizadoEm: FieldValue.serverTimestamp(),
        });
        const recipients = Array.isArray(alert.destinatariosUids) ?
          alert.destinatariosUids.slice(0, 100) :
          [];
        recipients.forEach((uid) => {
          transaction.set(notificationRef(uid, alertId), {
            isDeleted: true,
            deletedAt: FieldValue.serverTimestamp(),
            deletedBy: actor.uid,
            deleteReason: reason,
            atualizadoEm: FieldValue.serverTimestamp(),
          }, {merge: true});
        });
        setAlertAudit(
          transaction,
          actor,
          alertId,
          single ? 'EXCLUSAO_LOGICA' : 'EXCLUSAO_LOGICA_EM_LOTE',
          normalizeAlertSituation(alert.situacao),
          'excluido',
          reason,
        );
        setActivityLog(
          transaction,
          actor,
          single ?
            'Alerta de caixa excluido' :
            'Alerta de caixa excluido em lote',
          reason || 'Exclusao logica sem motivo informado',
          alertId,
        );
        return true;
      });
      if (wasDeleted) deletedCount += 1;
    }

    const result = {
      success: true,
      excluidos: deletedCount,
      alertasIds: alertIds,
    };
    await idempotency.ref.set({
      tipo: 'idempotencia_caixa',
      operacao: operation,
      lojaId: actor.lojaId,
      uid: actor.uid,
      chaveHash: idempotency.keyHash,
      resultado: result,
      criadoEm: FieldValue.serverTimestamp(),
    });
    return result;
  };

  const resolveAlertRecipients = ({
    usersSnapshot,
    profilesSnapshot,
    lojaId,
    config,
  }) => {
    const customProfiles = new Map(profilesSnapshot.docs.map((document) => [
      document.id,
      document.data() || {},
    ]));
    return usersSnapshot.docs.flatMap((document) => {
      const profile = document.data() || {};
      const role = normalizeRole(profile.role || customProfiles.get(document.id)?.role);
      const storeIds = extractStoreIds(profile);
      if (role === ROLE_OWNER) {
        return [document.id];
      }
      if (
        role === ROLE_MANAGER &&
        config.destinatarios === CONFIG_OWNER_MANAGERS &&
        storeIds.includes(lojaId)
      ) {
        const permissions = resolveCashPermissions(
          profile,
          customProfiles.get(document.id) || {},
        );
        return permissions.visualizarDivergencias ? [document.id] : [];
      }
      return [];
    });
  };

  const setCashAlert = ({
    transaction,
    actor,
    type,
    dateKey,
    title,
    message,
    values,
    differenceCents,
    referencePath,
    keyHash,
    recipients,
  }) => {
    const alertId = idempotencyDocumentId(
      type,
      actor.lojaId,
      `${dateKey}:${referencePath}`,
    );
    const alertRef = alertsCollection(actor.lojaId).doc(alertId);
    const origin = type === 'CAIXA_INICIO_DIVERGENTE' ?
      'divergencia_valor_inicial' :
      'divergencia_encerramento';
    const base = {
      categoria: 'caixa',
      tipo: type,
      origem: origin,
      lojaId: actor.lojaId,
      dataOperacional: dateKey,
      titulo: title,
      mensagem: message,
      severidade: 'warning',
      valores: {
        ...values,
        diferencaCentavos: differenceCents,
      },
      diferencaCentavos: differenceCents,
      responsavelUid: actor.uid,
      responsavelNome: actor.nome,
      responsavelEmail: actor.email || '',
      criadoEm: FieldValue.serverTimestamp(),
      referencia: referencePath,
      chaveIdempotencia: keyHash,
      destinatariosUids: recipients,
      atualizadoEm: FieldValue.serverTimestamp(),
    };
    transaction.set(alertRef, base, {merge: true});
    recipients.forEach((uid) => {
      transaction.set(notificationRef(uid, alertId), {
        ...base,
        alertaId: alertId,
        alertaRef: alertRef.path,
        destinatarioUid: uid,
        lida: false,
        lidaEm: null,
      }, {merge: true});
    });
    setAlertAudit(
      transaction,
      actor,
      alertId,
      'CRIACAO_OU_ATUALIZACAO_DIVERGENCIA',
      '',
      'aberto',
      message,
    );
    return alertId;
  };

  const buildConferenceResponse = (data, actor, id) => {
    const response = {id, ...data};
    delete response.chaveIdempotencia;
    if (!actor.permissions.visualizarValoresCalculados) {
      delete response.vendasDinheiroCentavos;
      delete response.outrasEntradasDinheiroCentavos;
      delete response.retiradasDespesaCentavos;
      delete response.sangriasCentavos;
      delete response.estornosDinheiroCentavos;
      delete response.valorEsperadoCentavos;
      delete response.fontes;
    }
    if (!actor.permissions.visualizarDivergencias) {
      delete response.diferencaCentavos;
      delete response.temDivergencia;
    }
    if (!actor.permissions.visualizarSangrias) {
      delete response.sangriasCentavos;
    }
    return response;
  };

  const calculateDayInsideTransaction = async ({
    transaction,
    actor,
    dateKey,
  }) => {
    const bounds = operationalDayBounds(dateKey, actor.timeZone);
    const store = storeRef(actor.lojaId);
    const orders = store.collection('pedidos');
    const receivables = store.collection('contas_a_receber');
    const payables = store.collection('contas_a_pagar');
    const removals = removalsCollection(actor.lojaId);

    const [
      finalizedSnapshot,
      createdSnapshot,
      updatedSnapshot,
      receivableOperationalSnapshot,
      receivableLegacySnapshot,
      payableOperationalSnapshot,
      payableLegacySnapshot,
      removalsSnapshot,
    ] = await Promise.all([
      transaction.get(orders
        .where('finalizadoEm', '>=', bounds.start)
        .where('finalizadoEm', '<', bounds.end)),
      transaction.get(orders
        .where('createdAt', '>=', bounds.start)
        .where('createdAt', '<', bounds.end)),
      transaction.get(orders
        .where('updatedAt', '>=', bounds.start)
        .where('updatedAt', '<', bounds.end)),
      transaction.get(receivables.where('dataOperacional', '==', dateKey)),
      transaction.get(receivables.where('dataRecebimento', '==', dateKey)),
      transaction.get(payables.where('dataOperacional', '==', dateKey)),
      transaction.get(payables.where('dataRetirada', '==', dateKey)),
      transaction.get(removals.where('dataOperacional', '==', dateKey)),
    ]);

    const pendingFinalizationStamp = mergeSnapshotRecords(
      createdSnapshot,
      updatedSnapshot,
    ).find((order) => isFinalizedOrder(order) && !order.finalizadoEm);
    if (pendingFinalizationStamp) {
      throw new HttpsError(
        'failed-precondition',
        'Uma venda finalizada ainda esta sendo consolidada. Aguarde alguns segundos e tente novamente.',
      );
    }

    const orderRecords = mergeSnapshotRecords(
      finalizedSnapshot,
      createdSnapshot,
      updatedSnapshot,
    );
    const receivableRecords = mergeSnapshotRecords(
      receivableOperationalSnapshot,
      receivableLegacySnapshot,
    );
    const payableRecords = mergeSnapshotRecords(
      payableOperationalSnapshot,
      payableLegacySnapshot,
    );
    const removalRecords = snapshotRecords(removalsSnapshot);

    return {
      vendasDinheiroCentavos: calculateCashSalesCents(
        orderRecords,
        dateKey,
        actor.timeZone,
      ),
      outrasEntradasDinheiroCentavos: calculateOtherCashEntriesCents(
        receivableRecords,
        dateKey,
        actor.timeZone,
      ),
      retiradasDespesaCentavos: calculateCashWithdrawalsCents(
        payableRecords,
        dateKey,
        actor.timeZone,
      ),
      sangriasCentavos: calculateCashRemovalsCents(removalRecords, dateKey),
      estornosDinheiroCentavos: calculateCashRefundsCents(
        orderRecords,
        dateKey,
        actor.timeZone,
      ),
      fontes: {
        pedidos: orderRecords.map((record) => record.id),
        outrasEntradas: receivableRecords.map((record) => record.id),
        retiradasDespesa: payableRecords
          .filter((record) => record.registroCaixa === true ||
            record.origem === 'retirada_caixa' ||
            record.tipo === 'retirada_caixa' ||
            record.origem === 'retirada_despesa_caixa' ||
            record.tipo === 'retirada_despesa_caixa')
          .map((record) => record.id),
        sangrias: removalRecords.map((record) => record.id),
      },
    };
  };

  return {
    registrarValorInicialCaixa: onCall(async (request) => {
      const actor = await requireCashActor(request, {
        permission: 'registrarInicio',
      });
      const dateKey = requireDate(request);
      const initialCents = requireAmount(request, {allowZero: true});
      const idempotency = requireIdempotency(
        request,
        'registrarValorInicialCaixa',
        actor,
      );
      const observation = cleanText(request.data?.observacao, 1000);
      const recordRef = dailyRef(actor.lojaId, dateKey);
      const previousQuery = storeRef(actor.lojaId).collection('caixas')
        .where('temValorEncerramento', '==', true)
        .where('dataOperacional', '<', dateKey)
        .orderBy('dataOperacional', 'desc')
        .limit(1);

      await db.runTransaction(async (transaction) => {
        const [operationSnap, recordSnap, previousSnap] = await Promise.all([
          transaction.get(idempotency.ref),
          transaction.get(recordRef),
          transaction.get(previousQuery),
        ]);
        if (operationSnap.exists) return;

        const current = documentData(recordSnap);
        if (Number.isSafeInteger(current.valorInicialCentavos)) {
          throw new HttpsError(
            'already-exists',
            'O valor inicial deste dia ja foi informado.',
          );
        }

        const previousRecord = previousSnap.empty ? null :
          previousSnap.docs[0].data() || {};
        const previousClosingCents = previousRecord &&
          Number.isSafeInteger(previousRecord.valorEncerramentoCentavos) ?
          previousRecord.valorEncerramentoCentavos :
          null;
        const differenceCents = previousClosingCents === null ?
          null :
          initialCents - previousClosingCents;

        let recipients = [];
        if (differenceCents !== null && differenceCents !== 0) {
          const [configSnap, usersSnap, profilesSnap] = await Promise.all([
            transaction.get(internalConfigRef(actor.lojaId)),
            transaction.get(db.collection('users')),
            transaction.get(db.collection('customProfiles')),
          ]);
          recipients = resolveAlertRecipients({
            usersSnapshot: usersSnap,
            profilesSnapshot: profilesSnap,
            lojaId: actor.lojaId,
            config: normalizeAlertConfig(documentData(configSnap)),
          });
        }

        transaction.set(recordRef, {
          lojaId: actor.lojaId,
          dataOperacional: dateKey,
          valorInicialCentavos: initialCents,
          observacaoInicial: observation,
          responsavelInicioUid: actor.uid,
          responsavelInicioNome: actor.nome,
          responsavelInicioEmail: actor.email || '',
          valorInicialRegistradoEm: FieldValue.serverTimestamp(),
          temValorEncerramento: false,
          criadoEm: FieldValue.serverTimestamp(),
          atualizadoEm: FieldValue.serverTimestamp(),
        }, {merge: true});

        if (differenceCents !== null && differenceCents !== 0) {
          setCashAlert({
            transaction,
            actor,
            type: 'CAIXA_INICIO_DIVERGENTE',
            dateKey,
            title: 'Divergencia no valor inicial do caixa',
            message: 'O valor inicial informado diverge do ultimo encerramento da loja.',
            values: {
              encerramentoAnteriorCentavos: previousClosingCents,
              valorInicialCentavos: initialCents,
              valorAnteriorCentavos: previousClosingCents,
              valorInformadoCentavos: initialCents,
            },
            differenceCents,
            referencePath: recordRef.path,
            keyHash: idempotency.keyHash,
            recipients,
          });
        }

        setActivityLog(
          transaction,
          actor,
          'Valor inicial do caixa registrado',
          `Data operacional: ${dateKey}`,
          recordRef.id,
        );
        setIdempotencyResult(
          transaction,
          idempotency,
          actor,
          'registrarValorInicialCaixa',
          {registroId: recordRef.id},
        );
      });

      const saved = await recordRef.get();
      return {
        success: true,
        message: 'Valor inicial registrado com sucesso.',
        registro: publicOperationalRecord(saved),
      };
    }),

    registrarEncerramentoCaixa: onCall({timeoutSeconds: 120}, async (request) => {
      const actor = await requireCashActor(request, {
        permission: 'registrarEncerramento',
      });
      const dateKey = requireDate(request);
      const closingCents = requireAmount(request, {allowZero: true});
      const idempotency = requireIdempotency(
        request,
        'registrarEncerramentoCaixa',
        actor,
      );
      const observation = cleanText(request.data?.observacao, 1000);
      const recordRef = dailyRef(actor.lojaId, dateKey);
      const protectedRef = conferenceRef(actor.lojaId, dateKey);

      await db.runTransaction(async (transaction) => {
        const [operationSnap, recordSnap] = await Promise.all([
          transaction.get(idempotency.ref),
          transaction.get(recordRef),
        ]);
        if (operationSnap.exists) return;

        const current = documentData(recordSnap);
        if (!Number.isSafeInteger(current.valorInicialCentavos)) {
          throw new HttpsError(
            'failed-precondition',
            'Informe o valor inicial do dia antes do encerramento.',
          );
        }
        if (
          current.temValorEncerramento === true ||
          Number.isSafeInteger(current.valorEncerramentoCentavos)
        ) {
          throw new HttpsError(
            'already-exists',
            'O encerramento deste dia ja foi registrado.',
          );
        }

        const components = await calculateDayInsideTransaction({
          transaction,
          actor,
          dateKey,
        });
        const calculated = calculateCashConference({
          initialCents: current.valorInicialCentavos,
          cashSalesCents: components.vendasDinheiroCentavos,
          otherCashEntriesCents: components.outrasEntradasDinheiroCentavos,
          cashWithdrawalsCents: components.retiradasDespesaCentavos,
          cashRemovalsCents: components.sangriasCentavos,
          cashRefundsCents: components.estornosDinheiroCentavos,
          closingCents,
        });

        let recipients = [];
        if (calculated.differenceCents !== 0) {
          const [configSnap, usersSnap, profilesSnap] = await Promise.all([
            transaction.get(internalConfigRef(actor.lojaId)),
            transaction.get(db.collection('users')),
            transaction.get(db.collection('customProfiles')),
          ]);
          recipients = resolveAlertRecipients({
            usersSnapshot: usersSnap,
            profilesSnapshot: profilesSnap,
            lojaId: actor.lojaId,
            config: normalizeAlertConfig(documentData(configSnap)),
          });
        }

        transaction.set(recordRef, {
          valorEncerramentoCentavos: closingCents,
          observacaoEncerramento: observation,
          responsavelEncerramentoUid: actor.uid,
          responsavelEncerramentoNome: actor.nome,
          responsavelEncerramentoEmail: actor.email || '',
          valorEncerramentoRegistradoEm: FieldValue.serverTimestamp(),
          temValorEncerramento: true,
          atualizadoEm: FieldValue.serverTimestamp(),
        }, {merge: true});
        transaction.set(protectedRef, {
          lojaId: actor.lojaId,
          dataOperacional: dateKey,
          valorInicialCentavos: current.valorInicialCentavos,
          vendasDinheiroCentavos: components.vendasDinheiroCentavos,
          outrasEntradasDinheiroCentavos:
            components.outrasEntradasDinheiroCentavos,
          outrasEntradasCentavos: components.outrasEntradasDinheiroCentavos,
          retiradasDespesaCentavos: components.retiradasDespesaCentavos,
          retiradasDespesasCentavos: components.retiradasDespesaCentavos,
          sangriasCentavos: components.sangriasCentavos,
          estornosDinheiroCentavos: components.estornosDinheiroCentavos,
          valorEsperadoCentavos: calculated.expectedCents,
          valorEncerramentoCentavos: closingCents,
          diferencaCentavos: calculated.differenceCents,
          temDivergencia: calculated.differenceCents !== 0,
          responsavelInicioUid: current.responsavelInicioUid || '',
          responsavelInicioNome: current.responsavelInicioNome || '',
          responsavelEncerramentoUid: actor.uid,
          responsavelEncerramentoNome: actor.nome,
          fontes: components.fontes,
          versaoCalculo: CALCULATION_VERSION,
          calculadoEm: FieldValue.serverTimestamp(),
          criadoEm: FieldValue.serverTimestamp(),
          atualizadoEm: FieldValue.serverTimestamp(),
          chaveIdempotencia: idempotency.keyHash,
        });

        if (calculated.differenceCents !== 0) {
          setCashAlert({
            transaction,
            actor,
            type: 'CAIXA_ENCERRAMENTO_DIVERGENTE',
            dateKey,
            title: 'Divergencia no encerramento do caixa',
            message: 'O valor informado no encerramento diverge do valor esperado.',
            values: {
              valorEsperadoCentavos: calculated.expectedCents,
              valorEncerramentoCentavos: closingCents,
              valorInformadoCentavos: closingCents,
            },
            differenceCents: calculated.differenceCents,
            referencePath: protectedRef.path,
            keyHash: idempotency.keyHash,
            recipients,
          });
        }

        setActivityLog(
          transaction,
          actor,
          'Encerramento do caixa registrado',
          `Data operacional: ${dateKey}`,
          recordRef.id,
        );
        setIdempotencyResult(
          transaction,
          idempotency,
          actor,
          'registrarEncerramentoCaixa',
          {registroId: recordRef.id, conferenciaId: protectedRef.id},
        );
      });

      const saved = await recordRef.get();
      return {
        success: true,
        message: 'Encerramento registrado com sucesso.',
        registro: publicOperationalRecord(saved),
      };
    }),

    registrarRetiradaDespesaCaixa: onCall(async (request) => {
      const actor = await requireCashActor(request, {
        permission: 'registrarRetiradaDespesa',
      });
      const dateKey = requireDate(request);
      const amountCents = requireAmount(request);
      const reason = cleanText(request.data?.motivo, 300);
      if (!reason) {
        throw new HttpsError('invalid-argument', 'Informe o motivo da retirada.');
      }
      const observation = cleanText(request.data?.observacao, 1000);
      const idempotency = requireIdempotency(
        request,
        'registrarRetiradaDespesaCaixa',
        actor,
      );
      const withdrawalId = `caixa_${dateKey}_${idempotency.keyHash.slice(0, 24)}`;
      const withdrawalRef = storeRef(actor.lojaId)
        .collection('contas_a_pagar').doc(withdrawalId);
      const recordRef = dailyRef(actor.lojaId, dateKey);

      await db.runTransaction(async (transaction) => {
        const [operationSnap, withdrawalSnap, recordSnap] = await Promise.all([
          transaction.get(idempotency.ref),
          transaction.get(withdrawalRef),
          transaction.get(recordRef),
        ]);
        if (operationSnap.exists) return;
        if (withdrawalSnap.exists) {
          throw new HttpsError('already-exists', 'Esta retirada ja foi registrada.');
        }
        const daily = documentData(recordSnap);
        if (daily.temValorEncerramento === true) {
          throw new HttpsError(
            'failed-precondition',
            'Nao e possivel registrar retirada depois do encerramento do dia.',
          );
        }

        transaction.set(withdrawalRef, {
          lojaId: actor.lojaId,
          dataOperacional: dateKey,
          descricao: `Retirada para despesa - ${reason}`,
          valorCentavos: amountCents,
          valor: amountCents / 100,
          dataVencimento: dateKey,
          dataPagamento: dateKey,
          dataRetirada: dateKey,
          status: 'Pago',
          categoria: 'Despesa Variavel',
          tipo: 'retirada_despesa_caixa',
          origem: 'retirada_despesa_caixa',
          registroCaixa: true,
          motivo: reason,
          observacoes: observation,
          registradoPorUid: actor.uid,
          registradoPorNome: actor.nome,
          registradoPorEmail: actor.email || '',
          registradoEm: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          atualizadoEm: FieldValue.serverTimestamp(),
        });
        setActivityLog(
          transaction,
          actor,
          'Retirada para despesa registrada no caixa',
          `Data operacional: ${dateKey}; motivo: ${reason}`,
          withdrawalId,
        );
        setIdempotencyResult(
          transaction,
          idempotency,
          actor,
          'registrarRetiradaDespesaCaixa',
          {retiradaId: withdrawalId},
        );
      });

      const saved = await withdrawalRef.get();
      return {
        success: true,
        message: 'Retirada para despesa registrada com sucesso.',
        retirada: publicWithdrawal(saved),
      };
    }),

    registrarSangriaCaixa: onCall(async (request) => {
      const actor = await requireCashActor(request, {
        permission: 'registrarSangria',
        allowedRoles: [ROLE_OWNER, ROLE_MANAGER],
      });
      const dateKey = requireDate(request);
      const amountCents = requireAmount(request);
      const reason = cleanText(request.data?.motivo, 300);
      const observation = cleanText(request.data?.observacao, 1000);
      const destination = cleanText(request.data?.destino, 300);
      const idempotency = requireIdempotency(
        request,
        'registrarSangriaCaixa',
        actor,
      );
      const removalId = `sangria_${dateKey}_${idempotency.keyHash.slice(0, 24)}`;
      const removalRef = removalsCollection(actor.lojaId).doc(removalId);
      const recordRef = dailyRef(actor.lojaId, dateKey);

      await db.runTransaction(async (transaction) => {
        const [operationSnap, removalSnap, recordSnap] = await Promise.all([
          transaction.get(idempotency.ref),
          transaction.get(removalRef),
          transaction.get(recordRef),
        ]);
        if (operationSnap.exists) return;
        if (removalSnap.exists) {
          throw new HttpsError('already-exists', 'Esta sangria ja foi registrada.');
        }
        const daily = documentData(recordSnap);
        if (!Number.isSafeInteger(daily.valorInicialCentavos)) {
          throw new HttpsError(
            'failed-precondition',
            'Informe o valor inicial do dia antes de registrar sangria.',
          );
        }
        if (daily.temValorEncerramento === true) {
          throw new HttpsError(
            'failed-precondition',
            'Nao e possivel registrar sangria depois do encerramento do dia.',
          );
        }

        transaction.set(removalRef, {
          lojaId: actor.lojaId,
          dataOperacional: dateKey,
          valorOriginalCentavos: amountCents,
          valorAtualCentavos: amountCents,
          valorCentavos: amountCents,
          motivo: reason,
          observacao: observation,
          destino: destination,
          responsavelUid: actor.uid,
          responsavelNome: actor.nome,
          responsavelEmail: actor.email || '',
          ajustes: [],
          criadoEm: FieldValue.serverTimestamp(),
          atualizadoEm: FieldValue.serverTimestamp(),
        });
        setActivityLog(
          transaction,
          actor,
          'Sangria registrada no caixa',
          `Data operacional: ${dateKey}`,
          removalId,
        );
        setIdempotencyResult(
          transaction,
          idempotency,
          actor,
          'registrarSangriaCaixa',
          {sangriaId: removalId},
        );
      });

      const saved = await removalRef.get();
      return {
        success: true,
        message: 'Sangria registrada com sucesso.',
        sangria: publicRemoval(saved),
      };
    }),

    ajustarSangriaCaixa: onCall({timeoutSeconds: 120}, async (request) => {
      const actor = await requireCashActor(request, {
        permission: 'registrarSangria',
        allowedRoles: [ROLE_OWNER, ROLE_MANAGER],
      });
      const removalId = cleanText(request.data?.sangriaId, 160);
      if (!removalId || removalId.includes('/')) {
        throw new HttpsError('invalid-argument', 'sangriaId invalida.');
      }
      const newAmountCents = requireAmount(request, {allowZero: true});
      const adjustmentReason = cleanText(request.data?.motivoAjuste, 500);
      if (!adjustmentReason) {
        throw new HttpsError(
          'invalid-argument',
          'Informe o motivo auditavel do ajuste.',
        );
      }
      const observation = cleanText(request.data?.observacao, 1000);
      const idempotency = requireIdempotency(
        request,
        'ajustarSangriaCaixa',
        actor,
      );
      const removalRef = removalsCollection(actor.lojaId).doc(removalId);

      await db.runTransaction(async (transaction) => {
        const [operationSnap, removalSnap] = await Promise.all([
          transaction.get(idempotency.ref),
          transaction.get(removalRef),
        ]);
        if (operationSnap.exists) return;
        if (!removalSnap.exists) {
          throw new HttpsError('not-found', 'Sangria nao encontrada.');
        }
        const current = documentData(removalSnap);
        const currentAmountCents = Number.isSafeInteger(current.valorAtualCentavos) ?
          current.valorAtualCentavos :
          current.valorCentavos;
        if (!Number.isSafeInteger(currentAmountCents)) {
          throw new HttpsError(
            'failed-precondition',
            'A sangria nao possui valor valido para ajuste.',
          );
        }
        const dateKey = normalizeOperationalDate(current.dataOperacional);
        if (!dateKey) {
          throw new HttpsError(
            'failed-precondition',
            'A sangria nao possui data operacional valida.',
          );
        }
        const recordRef = dailyRef(actor.lojaId, dateKey);
        const protectedRef = conferenceRef(actor.lojaId, dateKey);
        const [recordSnap, protectedSnap] = await Promise.all([
          transaction.get(recordRef),
          transaction.get(protectedRef),
        ]);
        const daily = documentData(recordSnap);
        let recalculated = null;
        let components = null;
        if (daily.temValorEncerramento === true && protectedSnap.exists) {
          components = await calculateDayInsideTransaction({
            transaction,
            actor,
            dateKey,
          });
          components.sangriasCentavos += newAmountCents - currentAmountCents;
          recalculated = calculateCashConference({
            initialCents: daily.valorInicialCentavos,
            cashSalesCents: components.vendasDinheiroCentavos,
            otherCashEntriesCents: components.outrasEntradasDinheiroCentavos,
            cashWithdrawalsCents: components.retiradasDespesaCentavos,
            cashRemovalsCents: components.sangriasCentavos,
            cashRefundsCents: components.estornosDinheiroCentavos,
            closingCents: daily.valorEncerramentoCentavos,
          });
        }

        let alertRecipients = [];
        if (recalculated && recalculated.differenceCents !== 0) {
          const [configSnap, usersSnap, profilesSnap] = await Promise.all([
            transaction.get(internalConfigRef(actor.lojaId)),
            transaction.get(db.collection('users')),
            transaction.get(db.collection('customProfiles')),
          ]);
          alertRecipients = resolveAlertRecipients({
            usersSnapshot: usersSnap,
            profilesSnapshot: profilesSnap,
            lojaId: actor.lojaId,
            config: normalizeAlertConfig(documentData(configSnap)),
          });
        }

        const adjustment = {
          id: idempotency.keyHash.slice(0, 32),
          valorAnteriorCentavos: currentAmountCents,
          valorNovoCentavos: newAmountCents,
          deltaCentavos: newAmountCents - currentAmountCents,
          motivo: adjustmentReason,
          observacao: observation,
          responsavelUid: actor.uid,
          responsavelNome: actor.nome,
          responsavelEmail: actor.email || '',
          registradoEm: admin.firestore.Timestamp.now(),
        };
        transaction.update(removalRef, {
          valorAtualCentavos: newAmountCents,
          valorCentavos: newAmountCents,
          ajustes: FieldValue.arrayUnion(adjustment),
          atualizadoEm: FieldValue.serverTimestamp(),
        });

        if (recalculated && components) {
          transaction.set(protectedRef, {
            sangriasCentavos: components.sangriasCentavos,
            valorEsperadoCentavos: recalculated.expectedCents,
            diferencaCentavos: recalculated.differenceCents,
            temDivergencia: recalculated.differenceCents !== 0,
            fontes: components.fontes,
            versaoCalculo: CALCULATION_VERSION,
            recalculadoPorAjusteSangriaEm: FieldValue.serverTimestamp(),
            atualizadoEm: FieldValue.serverTimestamp(),
          }, {merge: true});

          if (recalculated.differenceCents !== 0) {
            setCashAlert({
              transaction,
              actor,
              type: 'CAIXA_ENCERRAMENTO_DIVERGENTE',
              dateKey,
              title: 'Divergencia no encerramento do caixa',
              message: 'Um ajuste auditado de sangria alterou a conferencia do encerramento.',
              values: {
                valorEsperadoCentavos: recalculated.expectedCents,
                valorEncerramentoCentavos: daily.valorEncerramentoCentavos,
                valorInformadoCentavos: daily.valorEncerramentoCentavos,
              },
              differenceCents: recalculated.differenceCents,
              referencePath: protectedRef.path,
              keyHash: idempotency.keyHash,
              recipients: alertRecipients,
            });
          }
        }

        setActivityLog(
          transaction,
          actor,
          'Sangria ajustada com auditoria',
          `Motivo: ${adjustmentReason}`,
          removalId,
        );
        setIdempotencyResult(
          transaction,
          idempotency,
          actor,
          'ajustarSangriaCaixa',
          {sangriaId: removalId, ajusteId: adjustment.id},
        );
      });

      const saved = await removalRef.get();
      return {
        success: true,
        message: 'Ajuste de sangria registrado com sucesso.',
        sangria: publicRemoval(saved),
      };
    }),

    obterRegistroDiarioCaixa: onCall(async (request) => {
      const actor = await requireCashActor(request);
      const dateKey = requireDate(request);
      const recordSnapshot = await dailyRef(actor.lojaId, dateKey).get();
      const response = {
        success: true,
        registro: publicOperationalRecord(recordSnapshot),
      };

      if (
        [ROLE_OWNER, ROLE_MANAGER].includes(actor.role) &&
        actor.permissions.visualizarConferencia
      ) {
        const protectedSnapshot = await conferenceRef(
          actor.lojaId,
          dateKey,
        ).get();
        response.conferencia = protectedSnapshot.exists ?
          buildConferenceResponse(
            protectedSnapshot.data() || {},
            actor,
            protectedSnapshot.id,
          ) :
          null;
      }

      return response;
    }),

    listarSangriasCaixa: onCall(async (request) => {
      const actor = await requireCashActor(request, {
        permission: 'visualizarSangrias',
        allowedRoles: [ROLE_OWNER, ROLE_MANAGER],
      });
      const startDate = normalizeOperationalDate(request.data?.dataInicio);
      const endDate = normalizeOperationalDate(request.data?.dataFim);
      if (!startDate || !endDate || startDate > endDate) {
        throw new HttpsError(
          'invalid-argument',
          'Informe um periodo valido para consultar as sangrias.',
        );
      }

      const resultLimit = parseListLimit(request.data?.limit);
      let removalQuery = removalsCollection(actor.lojaId)
        .where('dataOperacional', '>=', startDate)
        .where('dataOperacional', '<=', endDate)
        .orderBy('dataOperacional', 'desc')
        .orderBy('criadoEm', 'desc')
        .limit(resultLimit);
      const responsibleFilter = cleanText(
        request.data?.responsavelUid || request.data?.responsavel,
        240,
      ).toLowerCase();

      const snapshot = await removalQuery.get();
      const removals = snapshot.docs
        .map((document) => publicRemoval(document))
        .filter((item) => {
          if (!responsibleFilter) return true;
          return [
            item.responsavelUid,
            item.responsavelNome,
            item.responsavelEmail,
          ].some((value) => String(value || '').toLowerCase()
            .includes(responsibleFilter));
        });

      return {success: true, sangrias: removals};
    }),

    listarConferenciasCaixa: onCall(async (request) => {
      const actor = await requireCashActor(request, {
        permission: 'visualizarConferencia',
        allowedRoles: [ROLE_OWNER, ROLE_MANAGER],
      });
      const startDate = normalizeOperationalDate(request.data?.dataInicio);
      const endDate = normalizeOperationalDate(request.data?.dataFim);
      if (!startDate || !endDate || startDate > endDate) {
        throw new HttpsError(
          'invalid-argument',
          'Informe um periodo valido para consultar as conferencias.',
        );
      }

      const hasDifferenceFilter = typeof request.data?.comDiferenca ===
        'boolean';
      if (
        hasDifferenceFilter &&
        actor.permissions.visualizarDivergencias !== true
      ) {
        throw new HttpsError(
          'permission-denied',
          'Voce nao possui permissao para filtrar divergencias.',
        );
      }

      let conferenceQuery = storeRef(actor.lojaId)
        .collection('conferenciasCaixa')
        .where('dataOperacional', '>=', startDate)
        .where('dataOperacional', '<=', endDate);
      if (hasDifferenceFilter) {
        conferenceQuery = conferenceQuery.where(
          'temDivergencia',
          '==',
          request.data.comDiferenca,
        );
      }
      conferenceQuery = conferenceQuery
        .orderBy('dataOperacional', 'desc')
        .limit(parseListLimit(request.data?.limit));

      const responsibleFilter = cleanText(
        request.data?.responsavelUid || request.data?.responsavel,
        240,
      ).toLowerCase();
      const snapshot = await conferenceQuery.get();
      const conferences = snapshot.docs
        .map((document) => buildConferenceResponse(
          document.data() || {},
          actor,
          document.id,
        ))
        .filter((item) => {
          if (!responsibleFilter) return true;
          return [
            item.responsavelInicioUid,
            item.responsavelInicioNome,
            item.responsavelEncerramentoUid,
            item.responsavelEncerramentoNome,
          ].some((value) => String(value || '').toLowerCase()
            .includes(responsibleFilter));
        });

      return {success: true, conferencias: conferences};
    }),

    listarAlertasCaixa: onCall({timeoutSeconds: 60}, async (request) => {
      const actor = await requireCashAlertActor(request);
      const pageSizeValue = Number(request.data?.tamanhoPagina);
      const pageSize = Number.isInteger(pageSizeValue) && pageSizeValue > 0 ?
        Math.min(pageSizeValue, 25) :
        25;
      const sort = normalizeAlertSort(request.data?.ordenacao);
      const filters = {
        dataInicio: normalizeOperationalDate(request.data?.dataInicio),
        dataFim: normalizeOperationalDate(request.data?.dataFim),
        tipo: cleanText(request.data?.tipo, 80),
        situacao: cleanText(request.data?.situacao, 40).toLowerCase(),
        severidade: cleanText(request.data?.severidade, 40).toLowerCase(),
        responsavel: cleanText(request.data?.responsavel, 240),
        divergencia: cleanText(request.data?.divergencia, 40).toLowerCase(),
        pesquisa: cleanText(request.data?.pesquisa, 240),
      };
      const cursorId = cleanText(request.data?.cursor, 180);
      let cursorSnapshot = null;
      if (cursorId && !cursorId.includes('/')) {
        const snapshot = await alertsCollection(actor.lojaId)
          .doc(cursorId).get();
        if (snapshot.exists) cursorSnapshot = snapshot;
      }

      const sortField = sort.includes('diferenca') ?
        'diferencaCentavos' :
        'criadoEm';
      const sortDirection = [
        'mais_antigos',
        'menor_diferenca',
      ].includes(sort) ? 'asc' : 'desc';
      const rows = [];
      let lastScanned = cursorSnapshot;
      let scanned = 0;
      let sourceHasMore = true;
      let hasUnscannedInChunk = false;
      const queryChunk = 50;

      while (
        rows.length < pageSize &&
        scanned < MAX_ALERT_SCAN &&
        sourceHasMore
      ) {
        let alertsQuery = alertsCollection(actor.lojaId)
          .orderBy(sortField, sortDirection);
        if (lastScanned) alertsQuery = alertsQuery.startAfter(lastScanned);
        const snapshot = await alertsQuery.limit(queryChunk).get();
        if (snapshot.empty) {
          sourceHasMore = false;
          break;
        }
        sourceHasMore = snapshot.size === queryChunk;
        const notificationSnapshots = await Promise.all(
          snapshot.docs.map((document) => notificationRef(
            actor.uid,
            document.id,
          ).get()),
        );

        for (let index = 0; index < snapshot.docs.length; index += 1) {
          const document = snapshot.docs[index];
          const data = documentData(document);
          lastScanned = document;
          scanned += 1;
          if (data.isDeleted === true ||
            !CASH_ALERT_TYPES.includes(data.tipo)) continue;
          const notificationSnapshot = notificationSnapshots[index];
          const notification = notificationSnapshot.exists ?
            documentData(notificationSnapshot) :
            null;
          const alert = publicCashAlert(document, notification);
          if (matchesAlertFilters(alert, filters)) rows.push(alert);
          if (rows.length >= pageSize || scanned >= MAX_ALERT_SCAN) {
            hasUnscannedInChunk = index < snapshot.docs.length - 1;
            break;
          }
        }
      }

      if (sort === 'mais_recentes') {
        rows.sort((left, right) => {
          if (left.lida !== right.lida) return left.lida ? 1 : -1;
          const leftTime = left.criadoEm?.toMillis?.() || 0;
          const rightTime = right.criadoEm?.toMillis?.() || 0;
          return rightTime - leftTime;
        });
      }
      const page = rows.slice(0, pageSize);
      const hasMore = hasUnscannedInChunk || sourceHasMore ||
        scanned >= MAX_ALERT_SCAN;
      return {
        success: true,
        alertas: page,
        proximoCursor: hasMore && lastScanned ? lastScanned.id : '',
        temMais: hasMore,
        podeExcluir: actor.role === ROLE_OWNER,
        podeAlterarSituacao: [ROLE_OWNER, ROLE_MANAGER].includes(actor.role),
        resumoPagina: {
          naoLidos: page.filter((item) => item.lida !== true).length,
          emAnalise: page.filter((item) => (
            item.situacao === 'em_analise'
          )).length,
          resolvidos: page.filter((item) => (
            item.situacao === 'resolvido'
          )).length,
          total: page.length,
        },
      };
    }),

    obterDetalhesAlertaCaixa: onCall(async (request) => {
      const actor = await requireCashAlertActor(request);
      const alertId = requireAlertId(request.data?.alertaId);
      const alertSnapshot = await alertsCollection(actor.lojaId)
        .doc(alertId).get();
      if (!alertSnapshot.exists || documentData(alertSnapshot).isDeleted) {
        throw new HttpsError('not-found', 'Alerta nao encontrado.');
      }
      const alertData = documentData(alertSnapshot);
      const recipientIds = Array.isArray(alertData.destinatariosUids) ?
        alertData.destinatariosUids.slice(0, 100) :
        [];
      const [notificationSnapshots, profileSnapshots, auditSnapshot] =
        await Promise.all([
          Promise.all(recipientIds.map((uid) => notificationRef(
            uid,
            alertId,
          ).get())),
          Promise.all(recipientIds.map((uid) => userRef(uid).get())),
          alertAuditCollection(actor.lojaId, alertId)
            .orderBy('criadoEm', 'desc').limit(100).get(),
        ]);
      const ownIndex = recipientIds.indexOf(actor.uid);
      const ownNotification = ownIndex >= 0 &&
        notificationSnapshots[ownIndex]?.exists ?
        documentData(notificationSnapshots[ownIndex]) :
        null;
      const recipients = recipientIds.map((uid, index) => {
        const profile = documentData(profileSnapshots[index]);
        const notification = documentData(notificationSnapshots[index]);
        return {
          uid,
          nome: profile.nome || profile.name || profile.email || uid,
          email: profile.email || '',
          perfil: normalizeRole(profile.role),
          lida: notification.lida === true,
          lidaEm: notification.lidaEm || null,
          excluida: notification.isDeleted === true,
        };
      });
      return {
        success: true,
        alerta: publicCashAlert(alertSnapshot, ownNotification),
        destinatarios: recipients,
        auditoria: snapshotRecords(auditSnapshot),
        podeExcluir: actor.role === ROLE_OWNER,
      };
    }),

    listarNotificacoesCaixa: onCall(async (request) => {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new HttpsError(
          'unauthenticated',
          'Voce precisa estar autenticado.',
        );
      }
      const [profileSnapshot, customSnapshot] = await Promise.all([
        userRef(uid).get(),
        customProfileRef(uid).get(),
      ]);
      if (!profileSnapshot.exists) {
        throw new HttpsError(
          'permission-denied',
          'Perfil de usuario nao encontrado.',
        );
      }
      const profile = documentData(profileSnapshot);
      const customProfile = documentData(customSnapshot);
      const role = normalizeRole(profile.role || customProfile.role);
      if (![ROLE_OWNER, ROLE_MANAGER].includes(role)) {
        throw new HttpsError(
          'permission-denied',
          'Este perfil nao recebe alertas de caixa.',
        );
      }
      const permissions = resolveCashPermissions(profile, customProfile);
      const storeIds = extractStoreIds(profile);
      const noticesSnapshot = await userRef(uid)
        .collection('notificacoes')
        .where('categoria', '==', 'caixa')
        .limit(250)
        .get();
      const candidateNotices = noticesSnapshot.docs.filter((document) => {
        const data = documentData(document);
        return data.isDeleted !== true && CASH_ALERT_TYPES.includes(data.tipo);
      });
      const candidateStoreIds = Array.from(new Set(candidateNotices
        .map((document) => cleanText(documentData(document).lojaId, 120))
        .filter(Boolean)));
      const configSnapshots = await Promise.all(candidateStoreIds.map(
        (lojaId) => internalConfigRef(lojaId).get(),
      ));
      const configs = new Map(candidateStoreIds.map((lojaId, index) => [
        lojaId,
        normalizeAlertConfig(documentData(configSnapshots[index])),
      ]));
      const authorizedNotices = candidateNotices.filter((document) => {
        if (role === ROLE_OWNER) return true;
        const lojaId = cleanText(documentData(document).lojaId, 120);
        return storeIds.includes(lojaId) &&
          profile.permissions?.fornecedores !== false &&
          permissions.visualizarDivergencias === true &&
          configs.get(lojaId)?.destinatarios === CONFIG_OWNER_MANAGERS;
      });
      const alertSnapshots = await Promise.all(authorizedNotices.map(
        (document) => {
          const notice = documentData(document);
          return alertsCollection(notice.lojaId).doc(
            notice.alertaId || document.id,
          ).get();
        },
      ));
      const notifications = authorizedNotices.flatMap((document, index) => {
        const alertSnapshot = alertSnapshots[index];
        if (!alertSnapshot.exists || documentData(alertSnapshot).isDeleted) {
          return [];
        }
        return [publicCashAlert(alertSnapshot, documentData(document))];
      }).sort((left, right) => {
        const leftTime = left.criadoEm?.toMillis?.() || 0;
        const rightTime = right.criadoEm?.toMillis?.() || 0;
        return rightTime - leftTime;
      });
      return {success: true, notificacoes: notifications};
    }),

    alterarSituacaoAlertaCaixa: onCall(async (request) => {
      const actor = await requireCashAlertActor(request);
      const alertId = requireAlertId(request.data?.alertaId);
      const situation = normalizeAlertSituation(request.data?.situacao);
      if (!['em_analise', 'resolvido'].includes(situation)) {
        throw new HttpsError(
          'invalid-argument',
          'Selecione Em analise ou Resolvido.',
        );
      }
      const observation = cleanText(request.data?.observacao, 1000);
      const idempotency = requireIdempotency(
        request,
        'alterarSituacaoAlertaCaixa',
        actor,
      );
      await db.runTransaction(async (transaction) => {
        const alertRef = alertsCollection(actor.lojaId).doc(alertId);
        const [operationSnapshot, alertSnapshot] = await Promise.all([
          transaction.get(idempotency.ref),
          transaction.get(alertRef),
        ]);
        if (operationSnapshot.exists) return;
        if (!alertSnapshot.exists || documentData(alertSnapshot).isDeleted) {
          throw new HttpsError('not-found', 'Alerta nao encontrado.');
        }
        const previous = normalizeAlertSituation(
          documentData(alertSnapshot).situacao,
        );
        const resolution = situation === 'resolvido';
        transaction.update(alertRef, {
          situacao: situation,
          resolvidoPorUid: resolution ? actor.uid : null,
          resolvidoPorNome: resolution ? actor.nome : null,
          resolvidoPorEmail: resolution ? actor.email || '' : null,
          resolvidoEm: resolution ? FieldValue.serverTimestamp() : null,
          observacaoResolucao: resolution ? observation : '',
          atualizadoEm: FieldValue.serverTimestamp(),
        });
        setAlertAudit(
          transaction,
          actor,
          alertId,
          resolution ? 'ALERTA_RESOLVIDO' : 'ALERTA_EM_ANALISE',
          previous,
          situation,
          observation,
        );
        setActivityLog(
          transaction,
          actor,
          resolution ?
            'Alerta de caixa resolvido' :
            'Alerta de caixa colocado em analise',
          observation || `Situacao: ${situation}`,
          alertId,
        );
        setIdempotencyResult(
          transaction,
          idempotency,
          actor,
          'alterarSituacaoAlertaCaixa',
          {alertaId: alertId, situacao: situation},
        );
      });
      return {success: true, alertaId: alertId, situacao: situation};
    }),

    excluirAlertaCaixa: onCall(async (request) => (
      deleteCashAlerts(request, {single: true})
    )),

    excluirAlertasCaixaEmLote: onCall(async (request) => (
      deleteCashAlerts(request)
    )),

    obterConfiguracaoAlertasCaixa: onCall(async (request) => {
      const actor = await requireCashActor(request, {
        allowedRoles: [ROLE_OWNER, ROLE_MANAGER],
      });
      const snapshot = await internalConfigRef(actor.lojaId).get();
      const config = normalizeAlertConfig(documentData(snapshot));
      const canEdit = actor.role === ROLE_OWNER;
      const canViewAlerts = canEdit || (
        config.destinatarios === CONFIG_OWNER_MANAGERS &&
        actor.permissions.visualizarDivergencias === true
      );
      return {
        success: true,
        configuracao: {
          ...config,
          lojaId: actor.lojaId,
          atualizadoEm: documentData(snapshot).atualizadoEm || null,
          atualizadoPorNome: documentData(snapshot).atualizadoPorNome || '',
        },
        podeEditar: canEdit,
        canEdit,
        podeVisualizarAlertas: canViewAlerts,
        canViewAlerts,
      };
    }),

    salvarConfiguracaoAlertasCaixa: onCall(async (request) => {
      const actor = await requireCashActor(request, {
        allowedRoles: [ROLE_OWNER],
      });
      const recipients = cleanText(request.data?.destinatarios, 80);
      if (![CONFIG_OWNER_ONLY, CONFIG_OWNER_MANAGERS].includes(recipients)) {
        throw new HttpsError(
          'invalid-argument',
          'Selecione uma configuracao valida de destinatarios.',
        );
      }

      const configRef = internalConfigRef(actor.lojaId);
      await db.runTransaction(async (transaction) => {
        transaction.set(configRef, {
          lojaId: actor.lojaId,
          destinatarios: recipients,
          atualizadoEm: FieldValue.serverTimestamp(),
          atualizadoPorUid: actor.uid,
          atualizadoPorNome: actor.nome,
          atualizadoPorEmail: actor.email || '',
        }, {merge: true});
        setActivityLog(
          transaction,
          actor,
          'Configuracao de alertas do caixa atualizada',
          `Destinatarios: ${recipients}`,
          configRef.id,
        );
      });

      return {
        success: true,
        message: 'Configuracao de alertas salva com sucesso.',
        configuracao: {
          lojaId: actor.lojaId,
          destinatarios: recipients,
        },
      };
    }),

    atualizarEstadoNotificacaoCaixa: onCall(async (request) => {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new HttpsError(
          'unauthenticated',
          'Voce precisa estar autenticado.',
        );
      }
      const notificationId = cleanText(request.data?.notificacaoId, 180);
      if (!notificationId || notificationId.includes('/')) {
        throw new HttpsError(
          'invalid-argument',
          'Notificacao invalida.',
        );
      }
      if (typeof request.data?.lida !== 'boolean') {
        throw new HttpsError(
          'invalid-argument',
          'Informe o estado de leitura da notificacao.',
        );
      }

      const ref = notificationRef(uid, notificationId);
      const existingSnapshot = await ref.get();
      if (!existingSnapshot.exists) {
        throw new HttpsError('not-found', 'Notificacao nao encontrada.');
      }
      const existing = documentData(existingSnapshot);
      if (
        existing.categoria !== 'caixa' ||
        !CASH_ALERT_TYPES.includes(existing.tipo)
      ) {
        throw new HttpsError(
          'permission-denied',
          'Esta notificacao nao pertence ao caixa.',
        );
      }
      const actor = await requireCashAlertActor({
        ...request,
        data: {...request.data, lojaId: existing.lojaId},
      });
      const alertId = requireAlertId(existing.alertaId || notificationId);
      await db.runTransaction(async (transaction) => {
        const alertRef = alertsCollection(actor.lojaId).doc(alertId);
        const [snapshot, alertSnapshot] = await Promise.all([
          transaction.get(ref),
          transaction.get(alertRef),
        ]);
        if (!snapshot.exists) {
          throw new HttpsError('not-found', 'Notificacao nao encontrada.');
        }
        const notification = snapshot.data() || {};
        if (
          notification.categoria !== 'caixa' ||
          !CASH_ALERT_TYPES.includes(notification.tipo)
        ) {
          throw new HttpsError(
            'permission-denied',
            'Esta notificacao nao pertence ao caixa.',
          );
        }
        if (
          notification.isDeleted === true ||
          !alertSnapshot.exists ||
          documentData(alertSnapshot).isDeleted === true
        ) {
          throw new HttpsError('not-found', 'Alerta nao encontrado.');
        }
        const previous = notification.lida === true ? 'lido' : 'nao_lido';
        const next = request.data.lida ? 'lido' : 'nao_lido';
        transaction.update(ref, {
          lida: request.data.lida,
          lidaEm: request.data.lida ?
            FieldValue.serverTimestamp() :
            null,
          atualizadoEm: FieldValue.serverTimestamp(),
        });
        transaction.update(alertRef, {
          atualizadoEm: FieldValue.serverTimestamp(),
        });
        setAlertAudit(
          transaction,
          actor,
          alertId,
          request.data.lida ? 'MARCADO_COMO_LIDO' : 'MARCADO_COMO_NAO_LIDO',
          previous,
          next,
          `Estado individual de ${actor.nome}`,
        );
        setActivityLog(
          transaction,
          actor,
          request.data.lida ?
            'Alerta de caixa marcado como lido' :
            'Alerta de caixa marcado como nao lido',
          `Estado individual de leitura: ${next}`,
          alertId,
        );
      });

      return {
        success: true,
        notificacaoId: notificationId,
        lida: request.data.lida,
      };
    }),

    marcarTodasNotificacoesCaixaComoLidas: onCall(async (request) => {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new HttpsError(
          'unauthenticated',
          'Voce precisa estar autenticado.',
        );
      }
      const lojaId = cleanText(request.data?.lojaId, 120);
      if (lojaId.includes('/')) {
        throw new HttpsError('invalid-argument', 'Loja invalida.');
      }

      let updatedCount = 0;
      let batches = 0;
      while (batches < 20) {
        let notificationsQuery = userRef(uid)
          .collection('notificacoes')
          .where('categoria', '==', 'caixa')
          .where('lida', '==', false);
        if (lojaId) {
          notificationsQuery = notificationsQuery.where(
            'lojaId',
            '==',
            lojaId,
          );
        }
        const snapshot = await notificationsQuery
          .limit(MAX_MARK_ALL_BATCH)
          .get();
        if (snapshot.empty) break;

        const batch = db.batch();
        snapshot.docs.forEach((document) => batch.update(document.ref, {
          lida: true,
          lidaEm: FieldValue.serverTimestamp(),
          atualizadoEm: FieldValue.serverTimestamp(),
        }));
        await batch.commit();
        updatedCount += snapshot.size;
        batches += 1;
        if (snapshot.size < MAX_MARK_ALL_BATCH) break;
      }

      return {
        success: true,
        atualizadas: updatedCount,
        limiteAtingido: batches >= 20,
      };
    }),

    carimbarPedidoFinalizadoCaixa: onDocumentWritten(
      'lojas/{lojaId}/pedidos/{pedidoId}',
      async (event) => {
        const afterSnapshot = event.data?.after;
        if (!afterSnapshot?.exists) return null;
        const before = event.data?.before?.exists ?
          event.data.before.data() || {} :
          {};
        const after = afterSnapshot.data() || {};
        if (!isFinalizedOrder(after)) return null;
        if (isFinalizedOrder(before) && after.finalizadoEm) return null;

        const lojaId = cleanText(event.params?.lojaId, 120);
        const configSnapshot = await storeRef(lojaId)
          .collection('configuracoes').doc('config').get();
        const timeZone = cleanText(
          documentData(configSnapshot).timezone,
          80,
        ) || DEFAULT_TIME_ZONE;
        const operationalDate = datePartsInTimeZone(new Date(), timeZone);
        await afterSnapshot.ref.set({
          finalizadoEm: FieldValue.serverTimestamp(),
          dataOperacionalFinalizacao: operationalDate,
          atualizadoEmFinalizacao: FieldValue.serverTimestamp(),
        }, {merge: true});
        logger.info('Pedido carimbado para conferencia de caixa.', {
          lojaId,
          pedidoId: event.params?.pedidoId,
          dataOperacional: operationalDate,
        });
        return null;
      },
    ),
  };
};

module.exports = {createCaixaFunctions};
