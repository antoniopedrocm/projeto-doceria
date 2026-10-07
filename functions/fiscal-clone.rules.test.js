const {before, after, test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {initializeTestEnvironment, assertSucceeds, assertFails} = require('@firebase/rules-unit-testing');
const {doc, getDoc, setDoc, updateDoc, deleteDoc} = require('firebase/firestore');
let env;
const store = 'clone-rules-a';
before(async () => {
  env = await initializeTestEnvironment({projectId: 'demo-fiscal-flow', firestore: {rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8')}});
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users/clone-owner'), {role: 'dono', permissions: {}}),
      setDoc(doc(db, 'users/clone-manager'), {role: 'gerente', lojaId: store, lojaIds: [store], permissions: {'nota-fiscal': true}}),
      setDoc(doc(db, 'users/clone-other'), {role: 'gerente', lojaId: 'outra-loja', lojaIds: ['outra-loja'], permissions: {'nota-fiscal': true}}),
      setDoc(doc(db, 'users/clone-accountant'), {role: 'contador', lojaId: store, lojaIds: [store], permissions: {'nota-fiscal': true}}),
      setDoc(doc(db, `lojas/${store}/invoices/original`), {status: 'authorized', model: 55, number: 123}),
      setDoc(doc(db, `lojas/${store}/invoices/clone`), {status: 'draft', model: 55, number: null}),
    ]);
  });
});
after(async () => { if (env) await env.cleanup(); });

test('authorized store profiles read draft and original; another store and anonymous cannot', async () => {
  for (const uid of ['clone-owner', 'clone-manager', 'clone-accountant']) {
    const db = env.authenticatedContext(uid).firestore();
    await assertSucceeds(getDoc(doc(db, `lojas/${store}/invoices/clone`)));
    await assertSucceeds(getDoc(doc(db, `lojas/${store}/invoices/original`)));
  }
  for (const db of [env.authenticatedContext('clone-other').firestore(), env.unauthenticatedContext().firestore()]) await assertFails(getDoc(doc(db, `lojas/${store}/invoices/clone`)));
});

test('even owner cannot bypass callable to create, change or delete fiscal documents', async () => {
  const db = env.authenticatedContext('clone-owner').firestore();
  await assertFails(setDoc(doc(db, `lojas/${store}/invoices/bypass`), {status: 'draft'}));
  await assertFails(updateDoc(doc(db, `lojas/${store}/invoices/clone`), {status: 'authorized', number: 123}));
  await assertFails(updateDoc(doc(db, `lojas/${store}/invoices/original`), {status: 'draft'}));
  await assertFails(deleteDoc(doc(db, `lojas/${store}/invoices/original`)));
});

test('direct numbering counter writes are denied', async () => {
  const db = env.authenticatedContext('clone-owner').firestore();
  await assertFails(setDoc(doc(db, `lojas/${store}/fiscalCounters/homologation_55_1`), {nextNumber: 123}));
});
