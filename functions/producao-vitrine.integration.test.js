const {after, before, beforeEach, describe, test} = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {createProductionShowcaseFunctions} = require('./producao-vitrine');

const PROJECT_ID = 'demo-caixa-rules';
const APP_NAME = 'producao-vitrine-integration';
const STORE_A = 'loja-a';
const STORE_B = 'loja-b';

class TestHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const directOnCall = (options, handler) => (
  typeof options === 'function' ? options : handler
);

const requestFor = (uid, data = {}) => ({
  auth: {uid, token: {email: `${uid}@example.test`, name: uid}},
  data,
});

let app;
let db;
let api;

before(() => {
  app = admin.apps.find((candidate) => candidate.name === APP_NAME) ||
    admin.initializeApp({projectId: PROJECT_ID}, APP_NAME);
  db = app.firestore();
  api = createProductionShowcaseFunctions({
    admin,
    db,
    onCall: directOnCall,
    HttpsError: TestHttpsError,
    logger: {warn: () => {}, error: () => {}, info: () => {}},
  });
});

beforeEach(async () => {
  const snapshots = await Promise.all([
    db.collection('producoesVitrine').get(),
    db.collection('users').get(),
    db.collection('lojas').get(),
  ]);
  const batch = db.batch();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((document) => batch.delete(document.ref)));
  await batch.commit();

  await Promise.all([
    db.collection('users').doc('kitchen').set({
      role: 'atendente', lojaId: STORE_A, lojaIds: [STORE_A], setor: 'Cozinha', permissions: {fornecedores: true},
    }),
    db.collection('users').doc('front').set({
      role: 'atendente', lojaId: STORE_A, lojaIds: [STORE_A], setor: 'Atendimento', permissions: {fornecedores: true},
    }),
    db.collection('users').doc('outsider').set({
      role: 'atendente', lojaId: STORE_B, lojaIds: [STORE_B], setor: 'Atendimento', permissions: {fornecedores: true},
    }),
    db.collection('lojas').doc(STORE_A).set({nome: 'Loja A'}),
    db.collection('lojas').doc(STORE_B).set({nome: 'Loja B'}),
    db.collection('lojas').doc(STORE_A).collection('produtos').doc('brigadeiro').set({
      nome: 'Brigadeiro', unidade: 'un', estoque: 5, ativo: true,
    }),
    db.collection('lojas').doc(STORE_A).collection('estoque').doc('brigadeiro').set({
      nome: 'Brigadeiro', unidade: 'un', quantidade: 5,
    }),
  ]);
});

after(async () => {
  if (app) await app.delete();
});

describe('fluxo transacional de Produção / Vitrine', () => {
  test('confirma divergência uma vez e retry não duplica estoque', async () => {
    const created = await api.createProductionShowcase(requestFor('kitchen', {
      lojaDestinoId: STORE_A,
      dataProducao: '2026-08-21',
      status: 'aguardando_recebimento',
      itens: [{productId: 'brigadeiro', quantidade: 10}],
    }));

    const payload = {
      producaoId: created.id,
      itens: [{productId: 'brigadeiro', quantidadeRecebida: 8}],
      motivoDivergencia: 'quantidade_menor',
      observacao: 'Duas unidades não chegaram.',
    };
    const first = await api.receiveProductionShowcase(requestFor('front', payload));
    const retry = await api.receiveProductionShowcase(requestFor('front', payload));

    assert.equal(first.status, 'recebido_com_divergencia');
    assert.equal(first.idempotent, false);
    assert.equal(retry.idempotent, true);

    const [production, product, stock, movements] = await Promise.all([
      db.collection('producoesVitrine').doc(created.id).get(),
      db.collection('lojas').doc(STORE_A).collection('produtos').doc('brigadeiro').get(),
      db.collection('lojas').doc(STORE_A).collection('estoque').doc('brigadeiro').get(),
      db.collection('lojas').doc(STORE_A).collection('kardex')
          .where('producaoId', '==', created.id).get(),
    ]);
    const item = production.data().itens[0];
    assert.equal(item.quantidadeEnviada, 10);
    assert.equal(item.quantidadeRecebida, 8);
    assert.equal(item.divergencia, -2);
    assert.equal(product.data().estoque, 13);
    assert.equal(stock.data().quantidade, 13);
    assert.equal(movements.size, 1);
    assert.equal(movements.docs[0].data().quantidade, 8);
  });

  test('usuário de outra loja não lista nem recebe a produção', async () => {
    const created = await api.createProductionShowcase(requestFor('kitchen', {
      lojaDestinoId: STORE_A,
      dataProducao: '2026-08-21',
      status: 'aguardando_recebimento',
      itens: [{productId: 'brigadeiro', quantidade: 10}],
    }));
    const listed = await api.listProductionShowcase(requestFor('outsider', {
      dataInicial: '2026-08-21', dataFinal: '2026-08-21',
    }));
    assert.equal(listed.producoes.length, 0);
    await assert.rejects(
        api.receiveProductionShowcase(requestFor('outsider', {
          producaoId: created.id,
          itens: [{productId: 'brigadeiro', quantidadeRecebida: 10}],
        })),
        (error) => error.code === 'permission-denied',
    );
  });
});
