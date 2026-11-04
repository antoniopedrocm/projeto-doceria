const {before, after, test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {initializeTestEnvironment, assertFails, assertSucceeds} = require('@firebase/rules-unit-testing');
const {doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs} = require('firebase/firestore');
let env;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Use Firestore emulator only.');
  env = await initializeTestEnvironment({projectId: 'demo-fiscal-flow', firestore: {rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8')}});
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, profile] of Object.entries({owner: {role:'dono'}, manager:{role:'gerente',lojaId:'rules-a',lojaIds:['rules-a']}, accountant:{role:'contador',lojaId:'rules-a',lojaIds:['rules-a'],permissions:{'nota-fiscal':true}}})) await setDoc(doc(db,'users',uid),profile);
    for (const store of ['rules-a','rules-b']) {
      await setDoc(doc(db,'lojas',store,'invoices','existing'),{status:'authorized',number:10,model:55});
      await setDoc(doc(db,'lojas',store,'fiscalInutilizations','existing'),{status:'inutilized',start:11,end:11});
    }
  });
});
after(async () => {if (env) await env.cleanup();});
test('counters, reservations and authoritative manual audit cannot be read or written by browsers', async () => {
  for (const uid of ['owner','manager','accountant',null]) {
    const db=(uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
    for (const parts of [['fiscalCounters','homologation_55_1'],['fiscalCounters','homologation_55_1','manualChanges','change'],['fiscalNumberBlocks','homologation_55_1_10']]) {
      const ref=doc(db,'lojas','rules-a',...parts);
      await assertFails(getDoc(ref)); await assertFails(setDoc(ref,{nextNumber:1})); await assertFails(deleteDoc(ref));
    }
  }
});
test('historical invoices and inutilizations stay immutable; store scoped history remains readable', async () => {
  for (const uid of ['owner','manager','accountant']) {
    const db=env.authenticatedContext(uid).firestore();
    for (const name of ['invoices','fiscalInutilizations']) {
      const ref=doc(db,'lojas','rules-a',name,'existing');
      await assertSucceeds(getDoc(ref)); await assertSucceeds(getDocs(collection(db,'lojas','rules-a',name)));
      await assertFails(updateDoc(ref,{status:'draft'})); await assertFails(deleteDoc(ref));
      await assertFails(setDoc(doc(db,'lojas','rules-a',name,'forged'),{status:'authorized'}));
      if(uid !== 'owner') await assertFails(getDoc(doc(db,'lojas','rules-b',name,'existing')));
    }
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'lojas','rules-a','invoices','existing')));
});
