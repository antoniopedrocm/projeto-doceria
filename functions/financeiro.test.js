const test = require('node:test');
const assert = require('node:assert/strict');
const { createFinanceiroFunctions } = require('./financeiro');

const snapshotOf = (id, value) => ({
  id,
  exists: value !== undefined,
  data: () => (value === undefined ? undefined : structuredClone(value))
});

const createFakeDb = (initialExpenses) => {
  const expenses = new Map(Object.entries(structuredClone(initialExpenses)));
  const expensesCollection = {
    get: async () => ({ docs: [...expenses].map(([id, value]) => snapshotOf(id, value)) }),
    doc: (id) => ({ id })
  };
  return {
    expenses,
    collection: (name) => {
      assert.equal(name, 'lojas');
      return {
        doc: (storeId) => ({
          collection: (collectionName) => {
            assert.equal(storeId, 'loja-a');
            assert.equal(collectionName, 'contas_a_pagar');
            return expensesCollection;
          }
        })
      };
    },
    runTransaction: async (operation) => operation({
      get: async (ref) => snapshotOf(ref.id, expenses.get(ref.id)),
      set: (ref, value) => expenses.set(ref.id, structuredClone(value))
    })
  };
};

test('prepara somente a seleção e a repetição é idempotente', async () => {
  const source = {
    descricao: 'Aluguel',
    categoria: 'Aluguel',
    fornecedorNome: 'Imobiliária Central',
    valor: 1500,
    competencia: '2026-08',
    dataVencimento: '2026-08-31',
    tipoRecorrencia: 'fixa',
    status: 'Pago',
    dataPagamento: '2026-08-05',
    comprovanteUrl: 'comprovante.pdf'
  };
  const db = createFakeDb({
    aluguel: source,
    internet: {
      descricao: 'Internet', valor: 200, competencia: '2026-08',
      dataVencimento: '2026-08-10', tipoRecorrencia: 'fixa', status: 'Pendente'
    }
  });
  class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  const { prepareNextFinancialMonth } = createFinanceiroFunctions({
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' } } },
    db,
    onCall: (handler) => handler,
    HttpsError,
    verifyManagementAccess: async () => ({ role: 'dono', allStores: true, stores: [] }),
    userHasAccessToStores: () => false,
    ROLE_OWNER: 'dono'
  });
  const request = {
    auth: { uid: 'gestor-1' },
    data: {
      sourceMonth: '2026-08',
      targetMonth: '2026-09',
      selectedExpenses: [{
        storeId: 'loja-a', expenseId: 'aluguel',
        valorCentavos: 150000, dataVencimento: '2026-09-30'
      }]
    }
  };

  const first = await prepareNextFinancialMonth(request);
  const second = await prepareNextFinancialMonth(request);

  assert.equal(first.createdCount, 1);
  assert.equal(first.ignoredCount, 0);
  assert.equal(second.createdCount, 0);
  assert.equal(second.ignoredCount, 1);
  assert.equal(db.expenses.size, 3);
  assert.equal(db.expenses.has('internet__2026-09'), false);
  assert.deepEqual(db.expenses.get('aluguel'), source);

  const target = db.expenses.get('aluguel__2026-09');
  assert.equal(target.lojaId, 'loja-a');
  assert.equal(target.competencia, '2026-09');
  assert.equal(target.dataVencimento, '2026-09-30');
  assert.equal(target.valor, 1500);
  assert.equal(target.status, 'Pendente');
  assert.equal(target.dataPagamento, undefined);
  assert.equal(target.comprovanteUrl, undefined);
});
