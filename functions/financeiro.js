const {
  FINANCIAL_RECURRENCE_SINGLE,
  buildTargetExpense,
  expenseLogicalKey,
  expenseSeriesId,
  getExpenseMonth,
  getExpenseRecurrenceType,
  isValidDueDateForMonth,
  isValidFinancialMonth,
  normalizeMoneyCents,
  recurrenceTargetId,
  shiftFinancialMonth
} = require('./financeiro-core');

const MAX_SELECTED_EXPENSES = 200;

const createFinanceiroFunctions = ({
  admin,
  db,
  onCall,
  HttpsError,
  verifyManagementAccess,
  userHasAccessToStores,
  ROLE_OWNER
}) => {
  const prepareNextFinancialMonth = onCall(async (request) => {
    const requesterUid = request.auth?.uid;
    const requester = await verifyManagementAccess(requesterUid);
    const sourceMonth = request.data?.sourceMonth;
    const targetMonth = request.data?.targetMonth;
    const selections = Array.isArray(request.data?.selectedExpenses) ? request.data.selectedExpenses : [];

    if (!isValidFinancialMonth(sourceMonth) || targetMonth !== shiftFinancialMonth(sourceMonth, 1)) {
      throw new HttpsError('invalid-argument', 'Informe a competência atual e a competência seguinte válidas.');
    }
    if (!selections.length || selections.length > MAX_SELECTED_EXPENSES) {
      throw new HttpsError('invalid-argument', `Selecione entre 1 e ${MAX_SELECTED_EXPENSES} despesas.`);
    }

    const normalizedSelections = selections.map((selection) => {
      const storeId = String(selection?.storeId || '').trim();
      const expenseId = String(selection?.expenseId || '').trim();
      if (!storeId || !expenseId || storeId.includes('/') || expenseId.includes('/')) {
        throw new HttpsError('invalid-argument', 'Uma das despesas selecionadas é inválida.');
      }
      if (!Number.isSafeInteger(Number(selection.valorCentavos)) || Number(selection.valorCentavos) < 0) {
        throw new HttpsError('invalid-argument', 'Revise os valores informados.');
      }
      if (!isValidDueDateForMonth(selection.dataVencimento, targetMonth)) {
        throw new HttpsError('invalid-argument', 'Todo vencimento deve pertencer à próxima competência.');
      }
      return {
        storeId,
        expenseId,
        valueCents: normalizeMoneyCents(Number(selection.valorCentavos)),
        dueDate: selection.dataVencimento
      };
    });

    const uniqueSelections = Array.from(new Map(
      normalizedSelections.map((selection) => [`${selection.storeId}:${selection.expenseId}`, selection])
    ).values());
    const requestedStores = Array.from(new Set(uniqueSelections.map((selection) => selection.storeId)));
    if (!(requester.role === ROLE_OWNER && requester.allStores)
      && !userHasAccessToStores(requester.stores, requestedStores)) {
      throw new HttpsError('permission-denied', 'Você não pode preparar despesas de outra loja.');
    }

    let createdCount = 0;
    let ignoredCount = 0;
    const results = [];
    const selectionsByStore = uniqueSelections.reduce((groups, selection) => {
      if (!groups[selection.storeId]) groups[selection.storeId] = [];
      groups[selection.storeId].push(selection);
      return groups;
    }, {});

    for (const [storeId, storeSelections] of Object.entries(selectionsByStore)) {
      const expensesCollection = db.collection('lojas').doc(storeId).collection('contas_a_pagar');
      const snapshot = await expensesCollection.get();
      const docsById = new Map(snapshot.docs.map((docSnap) => [docSnap.id, docSnap]));
      const existingSeries = new Set();
      const existingLogicalKeys = new Set();
      snapshot.docs.forEach((docSnap) => {
        const expense = docSnap.data() || {};
        if (getExpenseMonth(expense) !== targetMonth) return;
        if (expense.serieRecorrenciaId) existingSeries.add(String(expense.serieRecorrenciaId));
        if (expense.recorrenciaOrigemId) existingSeries.add(String(expense.recorrenciaOrigemId));
        existingLogicalKeys.add(expenseLogicalKey(expense, storeId, targetMonth, expense.dataVencimento));
      });

      for (const selection of storeSelections) {
        const sourceDoc = docsById.get(selection.expenseId);
        if (!sourceDoc) {
          throw new HttpsError('not-found', 'Uma despesa selecionada não foi encontrada. Atualize a página.');
        }
        const expense = sourceDoc.data() || {};
        const recurrenceType = getExpenseRecurrenceType(expense);
        if (getExpenseMonth(expense) !== sourceMonth || recurrenceType === FINANCIAL_RECURRENCE_SINGLE) {
          throw new HttpsError('failed-precondition', 'A seleção contém uma despesa que não é recorrente nesta competência.');
        }

        const seriesId = expenseSeriesId(expense, sourceDoc.id);
        const targetId = recurrenceTargetId(expense, sourceDoc.id, targetMonth);
        const logicalKey = expenseLogicalKey(expense, storeId, targetMonth);
        if (existingSeries.has(seriesId) || existingLogicalKeys.has(logicalKey)) {
          ignoredCount += 1;
          results.push({ storeId, expenseId: sourceDoc.id, targetId, status: 'already-exists' });
          continue;
        }

        const targetRef = expensesCollection.doc(targetId);
        const created = await db.runTransaction(async (transaction) => {
          const existingTarget = await transaction.get(targetRef);
          if (existingTarget.exists) return false;
          const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
          transaction.set(targetRef, buildTargetExpense(expense, {
            expenseId: sourceDoc.id,
            storeId,
            sourceMonth,
            targetMonth,
            valueCents: selection.valueCents,
            dueDate: selection.dueDate,
            serverTimestamp,
            requesterUid
          }));
          return true;
        });

        if (created) {
          createdCount += 1;
          existingSeries.add(seriesId);
          existingLogicalKeys.add(logicalKey);
          results.push({ storeId, expenseId: sourceDoc.id, targetId, status: 'created' });
        } else {
          ignoredCount += 1;
          results.push({ storeId, expenseId: sourceDoc.id, targetId, status: 'already-exists' });
        }
      }
    }

    return { sourceMonth, targetMonth, createdCount, ignoredCount, results };
  });

  return { prepareNextFinancialMonth };
};

module.exports = { createFinanceiroFunctions };
