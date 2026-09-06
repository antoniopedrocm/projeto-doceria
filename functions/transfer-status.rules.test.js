const fs = require('node:fs');
const path = require('node:path');
const {test, before, after} = require('node:test');
const {
  initializeTestEnvironment, assertFails, assertSucceeds,
} = require('@firebase/rules-unit-testing');
const {
  doc, setDoc, getDoc, getDocs, collection, query, where,
} = require('firebase/firestore');

const statuses = [
  'rascunho', 'aguardando_conferencia', 'conferencia_sem_divergencia',
  'conferencia_com_divergencia', 'pagamento_informado', 'pagamento_confirmado',
  'pagamento_contestado', 'cancelado', 'cancelada',
];
let env;
const profile = (allowed) => ({
  role: 'gerente', lojaId: 'a', lojaIds: ['a'],
  permissions: {'entre-lojas': true},
  permissionDetails: {'entre-lojas': {statuses: allowed}},
});
const dbFor = (uid) => env.authenticatedContext(uid).firestore();
const read = (uid, id = 'visible') => (
  getDoc(doc(dbFor(uid), 'transferenciasEntreLojas', id))
);
const list = (uid, status, side = 'lojaOrigemId', store = 'a') => getDocs(query(
  collection(dbFor(uid), 'transferenciasEntreLojas'),
  where(side, '==', store), where('status', '==', status),
));
const updateProfile = (uid, data) => env.withSecurityRulesDisabled((ctx) => (
  setDoc(doc(ctx.firestore(), 'users', uid), data)
));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-transfer-status',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8'),
    },
  });
});
after(async () => { if (env) await env.cleanup(); });

statuses.forEach((status) => {
  test(`${status}: leitura, consultas, revogação, dono e multiloja`, async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', 'allowed'), profile([status]));
      await setDoc(doc(db, 'users', 'denied'),
          profile(statuses.filter((s) => s !== status)));
      await setDoc(doc(db, 'users', 'missing'), {
        role: 'gerente', lojaId: 'a', lojaIds: ['a'],
      });
      await setDoc(doc(db, 'users', 'owner'), {role: 'dono'});
      await setDoc(doc(db, 'users', 'destination'), {
        ...profile([status]), lojaId: 'b', lojaIds: ['b'],
      });
      await setDoc(doc(db, 'transferenciasEntreLojas', 'visible'), {
        lojaOrigemId: 'a', lojaDestinoId: 'b', status,
      });
      await setDoc(doc(db, 'transferenciasEntreLojas', 'outside'), {
        lojaOrigemId: 'c', lojaDestinoId: 'd', status,
      });
    });
    await assertSucceeds(read('allowed'));
    await assertFails(read('denied'));
    await assertFails(read('missing'));
    await assertFails(read('allowed', 'outside'));
    await assertSucceeds(read('owner', 'outside'));
    await assertSucceeds(list('allowed', status));
    await assertFails(list('denied', status));
    if (status === 'rascunho') {
      await assertFails(read('destination'));
    } else {
      await assertSucceeds(list('destination', status, 'lojaDestinoId', 'b'));
    }
    await updateProfile('allowed', profile([]));
    await assertFails(read('allowed'));
    await updateProfile('allowed', profile([status]));
    await assertSucceeds(read('allowed'));
    await updateProfile('allowed', {
      ...profile([status]), permissions: {'entre-lojas': false},
    });
    await assertFails(read('allowed'));
    await updateProfile('allowed', profile([status]));
    await env.withSecurityRulesDisabled((ctx) => setDoc(
      doc(ctx.firestore(), 'transferenciasEntreLojas', 'visible'),
      {status: 'status_desconhecido'}, {merge: true},
    ));
    await assertFails(read('allowed'));
  });
});
