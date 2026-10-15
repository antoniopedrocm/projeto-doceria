// Offline integration against the deployed DEV token contract; no live Auth/FCM.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,deleteDoc,runTransaction}=require('firebase/firestore');

test('DEV no-read token contract: exact delete, ownership, repetition and bounded logout',async()=>{
  const {removeStaffTokenAssociation,cleanupStaffDevice}=await import('../crm/public/staff-push-cleanup.mjs');
  const {createCanonicalLogout}=await import('../crm/public/canonical-session.mjs');
  const env=await initializeTestEnvironment({projectId:'demo-doceria-checkout',firestore:{host:'127.0.0.1',port:8080,
    rules:fs.readFileSync(path.join(__dirname,'fixtures/staff-push-dev-contract.rules'),'utf8')}});
  const uid='staff-push-a';
  const db=env.authenticatedContext(uid).firestore();
  const target=token=>doc(db,'notificationTokens',token);
  const remove=(token,current=()=>true)=>removeStaffTokenAssociation({db,token,current,doc,deleteDoc});
  const inspect=async()=>{
    let rows;
    await env.withSecurityRulesDisabled(async context=>{
      const adminDb=context.firestore();
      rows=await Promise.all(['T1-current','T2-other-device','T3-other-uid'].map(async token=>({token,
        exists:(await getDoc(doc(adminDb,'notificationTokens',token))).exists()})));
    });
    return rows;
  };
  try {
    await env.withSecurityRulesDisabled(async context=>{
      for(const [token,owner] of [['T1-current',uid],['T2-other-device',uid],['T3-other-uid','staff-push-b']]) {
        await setDoc(doc(context.firestore(),'notificationTokens',token),{uid:owner});
      }
    });
    // Negative control: the previous adapter fails before reaching its delete.
    await assertFails(runTransaction(db,async transaction=>{
      const snapshot=await transaction.get(target('T1-current'));
      if(snapshot.data()?.uid===uid) transaction.delete(target('T1-current'));
    }));
    assert.equal((await inspect())[0].exists,true);
    await assertFails(getDoc(target('T1-current')));
    assert.equal(await remove('T1-current'),'removed');
    assert.deepEqual((await inspect()).map(row=>row.exists),[false,true,true]);
    // A denied missing-resource delete is not proof of success, but is harmless.
    await assertFails(remove('T1-current'));
    await assertFails(remove('T3-other-uid'));
    const otherDb=env.authenticatedContext('customer-b').firestore();
    await assertFails(removeStaffTokenAssociation({db:otherDb,token:'T2-other-device',current:()=>true,doc,deleteDoc}));
    assert.equal(await remove('T2-other-device',()=>false),'uid-changed');
    assert.deepEqual((await inspect()).map(row=>row.exists),[false,true,true]);

    // Simultaneous real logout wrappers remain bounded even when a second delete
    // is denied. No sessionStorage marker, token enumeration or foreign cleanup.
    await env.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),'notificationTokens','T1-current'),{uid}));
    let user={uid};const auth={get currentUser(){return user;}};
    const warnings=[];
    const createLogout=()=>createCanonicalLogout({auth,storage:null,onCleanupError:code=>warnings.push(code),
      beforeSignOut:(_uid,_hint,signal)=>cleanupStaffDevice({auth,uid,signal,
        resolveToken:async()=> 'T1-current',removeAssociation:remove}),
      signOut:async()=>{user=null;}});
    const first=createLogout(),second=createLogout();
    await Promise.all([first(),second()]);
    assert.equal(auth.currentUser,null);
    assert.deepEqual((await inspect()).map(row=>row.exists),[false,true,true]);
    await first();
    assert.ok(warnings.every(code=>['coordination-unavailable','cleanup-incomplete'].includes(code)));
  } finally {await env.cleanup();}
});
