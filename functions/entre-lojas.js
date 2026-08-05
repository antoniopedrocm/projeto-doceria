const OWNER_ROLES = new Set([
  'dono', 'owner', 'admin', 'adm', 'administrador', 'administradora',
  'administrador_master', 'administradora_master', 'admin_master', 'master',
  'superadmin',
]);

const normalizeValue = (value) => String(value || '').trim();
const normalizeRole = (value) => normalizeValue(value).toLowerCase();

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

const createEntreLojasFunctions = ({admin, db, onCall, HttpsError, logger}) => ({
  recalculateEntreLojasClosing: onCall({timeoutSeconds: 60}, async (request) => {
    const uid = request.auth?.uid;
    const fechamentoId = normalizeValue(request.data?.fechamentoId);
    if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    if (!fechamentoId) throw new HttpsError('invalid-argument', 'Fechamento obrigatório.');

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
        if (profile.ativo === false || normalizeValue(profile.status).toLowerCase() === 'inativo') {
          throw new HttpsError('permission-denied', 'Usuário inativo.');
        }
        const closing = {id: closingSnapshot.id, ...closingSnapshot.data()};
        const relation = resolveEntreLojasRelation(profile, closing);
        if (!['dono', 'origem', 'destino'].includes(relation)) {
          throw new HttpsError('permission-denied', 'Você não possui vínculo com este fechamento.');
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
          'pagamento_informado', 'pagamento_confirmado', 'pagamento_contestado',
        ].includes(closing.status);
        const totalPagoRepasse = closingPaidInFull ? totals.totalRepasse : totals.totalPagoRepasse;
        const totalPagoRevenda = closingPaidInFull ? totals.totalRevenda : totals.totalPagoRevenda;
        const quantidadeRemessasPagas = closingPaidInFull ?
          totals.quantidadeRemessas : totals.quantidadeRemessasPagas;

        transaction.update(closingRef, {
          remessaIds: activeTransfers.map((transfer) => transfer.id),
          quantidadeRemessas: totals.quantidadeRemessas,
          quantidadeRemessasPagas,
          quantidadeTotalItens: totals.quantidadeTotalItens,
          totalRepasse: Number(totals.totalRepasse.toFixed(2)),
          totalRevenda: Number(totals.totalRevenda.toFixed(2)),
          totalPagoRepasse: Number(totalPagoRepasse.toFixed(2)),
          totalPagoRevenda: Number(totalPagoRevenda.toFixed(2)),
          totalRestanteRepasse: Number(Math.max(0, totals.totalRepasse - totalPagoRepasse).toFixed(2)),
          totalRestanteRevenda: Number(Math.max(0, totals.totalRevenda - totalPagoRevenda).toFixed(2)),
          dataAtualizacao: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {success: true, fechamentoId, relation, quantidadeRemessas: totals.quantidadeRemessas};
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('[Entre Lojas] Erro ao recalcular fechamento:', error);
      throw new HttpsError('internal', 'Não foi possível recalcular o fechamento.');
    }
  }),
});

module.exports = {calculateClosingTotals, createEntreLojasFunctions, resolveEntreLojasRelation};

