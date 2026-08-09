const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');

let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-corretor-rules',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
    },
  });
});

test.after(async () => {
  await testEnv?.cleanup();
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      db.doc('users/corretor-a').set({
        role: 'corretor',
        ativo: true,
        lojaId: 'matriz',
        lojaIds: ['matriz'],
        permissions: {produtos: true, financeiro: true, 'nota-fiscal': true},
      }),
      db.doc('users/corretor-sem-modulo').set({
        role: 'corretor',
        ativo: true,
        lojaId: 'matriz',
        lojaIds: ['matriz'],
        permissions: {},
      }),
      db.doc('users/corretor-inativo').set({
        role: 'corretor',
        ativo: false,
        status: 'inativo',
        lojaId: 'matriz',
        lojaIds: ['matriz'],
        permissions: {produtos: true, 'nota-fiscal': true},
      }),
      db.doc('users/corretor-fornecedores').set({
        role: 'corretor',
        ativo: true,
        lojaId: 'matriz',
        lojaIds: ['matriz'],
        permissions: {fornecedores: true},
      }),
      db.doc('users/dono-a').set({role: 'dono', ativo: true}),
      db.doc('users/gerente-a').set({role: 'gerente', ativo: true, lojaId: 'matriz', lojaIds: ['matriz']}),
      db.doc('lojas/matriz').set({nome: 'Matriz'}),
      db.doc('lojas/garavelo').set({nome: 'Garavelo'}),
      db.doc('lojas/matriz/produtos/p1').set({nome: 'Bolo'}),
      db.doc('lojas/garavelo/produtos/p2').set({nome: 'Torta'}),
      db.doc('lojas/matriz/contas_a_pagar/c1').set({valor: 10}),
      db.doc('lojas/matriz/invoices/n1').set({status: 'authorized'}),
      db.doc('lojas/matriz/fornecedores/f1').set({nome: 'Fornecedor'}),
      db.doc('lojas/matriz/fiscalConfig/settings').set({environment: 'production'}),
      db.doc('integrations/fiscal').set({serviceUrl: 'https://fiscal.example'}),
      db.doc('customProfiles/corretor-a').set({role: 'corretor', permissions: {produtos: true}}),
      db.doc('customProfiles/dono-a').set({role: 'dono'}),
    ]);
  });
});

test('Corretor lê módulos selecionados somente na loja vinculada', async () => {
  const db = testEnv.authenticatedContext('corretor-a').firestore();
  await assertSucceeds(db.doc('lojas/matriz/produtos/p1').get());
  await assertSucceeds(db.doc('lojas/matriz/contas_a_pagar/c1').get());
  await assertSucceeds(db.doc('lojas/matriz/invoices/n1').get());
  await assertFails(db.doc('lojas/garavelo/produtos/p2').get());
  await assertFails(db.doc('lojas/matriz/fornecedores/f1').get());
});

test('Corretor sem módulo selecionado não recebe dados', async () => {
  const db = testEnv.authenticatedContext('corretor-sem-modulo').firestore();
  await assertFails(db.doc('lojas/matriz/produtos/p1').get());
  await assertFails(db.doc('lojas/matriz/invoices/n1').get());
});

test('Corretor inativo não recebe dados nem o próprio perfil', async () => {
  const db = testEnv.authenticatedContext('corretor-inativo').firestore();
  await assertFails(db.doc('lojas/matriz').get());
  await assertFails(db.doc('lojas/matriz/produtos/p1').get());
  await assertFails(db.doc('users/corretor-inativo').get());
});

test('módulo Fornecedores permite consultar caixa sem liberar Financeiro', async () => {
  const db = testEnv.authenticatedContext('corretor-fornecedores').firestore();
  await assertSucceeds(db.doc('lojas/matriz/fornecedores/f1').get());
  await assertSucceeds(db.doc('lojas/matriz/contas_a_pagar/c1').get());
  await assertFails(db.doc('lojas/matriz/contas_a_receber/r1').get());
});

test('Corretor não escreve em módulos normais nem diretamente em dados fiscais', async () => {
  const db = testEnv.authenticatedContext('corretor-a').firestore();
  await assertFails(db.doc('lojas/matriz/produtos/p1').update({nome: 'Alterado'}));
  await assertFails(db.doc('lojas/matriz/contas_a_pagar/c1').update({pago: true}));
  await assertFails(db.doc('lojas/matriz/fiscalProducts/p1').set({ncm: '19059090'}));
  await assertFails(db.doc('lojas/matriz/fiscalConfig/settings').update({serviceUrl: 'https://evil.example'}));
  await assertFails(db.doc('integrations/fiscal').update({serviceUrl: 'https://evil.example'}));
});

test('Corretor só lê o próprio perfil e não gerencia usuários', async () => {
  const db = testEnv.authenticatedContext('corretor-a').firestore();
  await assertSucceeds(db.doc('users/corretor-a').get());
  await assertSucceeds(db.doc('customProfiles/corretor-a').get());
  await assertFails(db.doc('users/dono-a').get());
  await assertFails(db.doc('customProfiles/dono-a').get());
  await assertFails(db.doc('users/corretor-a').update({permissions: {produtos: false}}));
});

test('Dono e Gerente preservam as escritas existentes', async () => {
  const ownerDb = testEnv.authenticatedContext('dono-a').firestore();
  const managerDb = testEnv.authenticatedContext('gerente-a').firestore();
  await assertSucceeds(ownerDb.doc('lojas/matriz/produtos/p1').update({nome: 'Dono'}));
  await assertSucceeds(managerDb.doc('lojas/matriz/produtos/p1').update({nome: 'Gerente'}));
  const snap = await managerDb.doc('lojas/matriz/produtos/p1').get();
  assert.equal(snap.data().nome, 'Gerente');
});

test('somente Dono altera perfil e permissões de um Corretor', async () => {
  const ownerDb = testEnv.authenticatedContext('dono-a').firestore();
  const managerDb = testEnv.authenticatedContext('gerente-a').firestore();
  await assertFails(managerDb.doc('users/corretor-a').update({permissions: {produtos: false}}));
  await assertFails(managerDb.doc('customProfiles/corretor-a').update({permissions: {produtos: false}}));
  await assertSucceeds(ownerDb.doc('users/corretor-a').update({permissions: {produtos: false}}));
  await assertSucceeds(ownerDb.doc('customProfiles/corretor-a').update({permissions: {produtos: false}}));
});
