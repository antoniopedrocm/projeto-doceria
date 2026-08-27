const fs = require('node:fs');
const path = require('node:path');
const {after, before, beforeEach, describe, test} = require('node:test');
const {
  assertFails,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {doc, getDoc, setDoc, updateDoc} = require('firebase/firestore');

const PROJECT_ID = 'demo-caixa-rules';
const STORE_A = 'loja-a';
let testEnv;

before(async () => {
  const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  testEnv = await initializeTestEnvironment({projectId: PROJECT_ID, firestore: {rules}});
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users', 'owner'), {
        role: 'dono', lojaId: null, lojaIds: [], permissions: {fornecedores: true},
      }),
      setDoc(doc(db, 'users', 'attendant-a'), {
        role: 'atendente', lojaId: STORE_A, lojaIds: [STORE_A], permissions: {fornecedores: true},
      }),
      setDoc(doc(db, 'producoesVitrine', 'producao-a'), {
        numero: 'PV-TESTE',
        lojaDestinoId: STORE_A,
        status: 'aguardando_recebimento',
        itens: [{productId: 'produto-a', quantidadeEnviada: 10}],
      }),
    ]);
  });
});

after(async () => {
  await testEnv.cleanup();
});

describe('isolamento de Produção / Vitrine', () => {
  test('clientes não leem nem gravam produções diretamente', async () => {
    const ownerDb = testEnv.authenticatedContext('owner').firestore();
    const attendantDb = testEnv.authenticatedContext('attendant-a').firestore();

    await assertFails(getDoc(doc(ownerDb, 'producoesVitrine', 'producao-a')));
    await assertFails(getDoc(doc(attendantDb, 'producoesVitrine', 'producao-a')));
    await assertFails(setDoc(doc(ownerDb, 'producoesVitrine', 'forjada'), {
      lojaDestinoId: STORE_A,
      status: 'recebido',
    }));
    await assertFails(updateDoc(doc(attendantDb, 'producoesVitrine', 'producao-a'), {
      status: 'recebido',
    }));
  });
});
