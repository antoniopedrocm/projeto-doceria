process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const {test,after}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const {createPaymentSettings}=require('./payment-settings');const {createPaymentService}=require('./checkout-payment');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');const {doc,setDoc,getDoc,updateDoc,deleteDoc}=require('firebase/firestore');const fs=require('node:fs'),path=require('node:path');
const app=admin.initializeApp({projectId:'demo-doceria-checkout'},'settings'),db=app.firestore();after(()=>app.delete());
const svc=createPaymentSettings({db,admin:{firestore:admin.firestore,auth:()=>({getUser:async uid=>({disabled:uid==='disabled'})})},normalizeRole:r=>r==='admin'?'dono':r,extractStoreIds:p=>p?.lojaIds||[]});
const config={enabled:true,handle:'alpha',sendCustomerData:true,sendDeliveryAddress:true};
const req=(uid,storeId,extra={})=>({auth:{uid},data:{storeId,...extra}});
async function seed(){for(const id of ['settings-a','settings-b'])await db.doc('lojas/'+id).set({nome:id});for(const [uid,role,stores,permission] of [['owner','dono',[],false],['admin','admin',[],false],['manager','gerente',['settings-a'],true],['denied','gerente',['settings-a'],false],['disabled','dono',[],false]]){await db.doc('users/'+uid).set({role,lojaIds:stores,nome:uid});await db.doc('customProfiles/'+uid).set({permissionDetails:{configuracoes:{manage_payment_settings:permission}}});}}
test('autorização por loja, confirmação forte, concorrência e auditoria atômica',async()=>{
 await seed();const ref=db.doc('lojas/settings-a/configuracoesInternas/infinitepay');await ref.delete();const oldAudits=await db.collection('auditLogs').where('paymentSettingsStoreId','==','settings-a').get();await Promise.all(oldAudits.docs.map(d=>d.ref.delete()));
 for(const [uid,store] of [['denied','settings-a'],['manager','settings-b'],['disabled','settings-a']]) await assert.rejects(()=>svc.get(req(uid,store)),e=>e.code==='permission-denied');
 await svc.save(req('owner','settings-a',{config,expectedVersion:0,expectedHandle:''}));
 const first=await svc.get(req('admin','settings-a'));assert.equal(first.history.length,1);assert.equal(first.history[0].actor.uid,'owner');assert.ok(first.lastChange);
 const change={config:{...config,handle:'beta'},expectedVersion:1,expectedHandle:'alpha'};
 await assert.rejects(()=>svc.save(req('manager','settings-a',change)),e=>e.code==='failed-precondition');
 await assert.rejects(()=>svc.save(req('manager','settings-a',{...change,confirmChange:true,confirmation:'errado'})),e=>e.code==='failed-precondition');
 const results=await Promise.allSettled(['manager','admin'].map(uid=>svc.save(req(uid,'settings-a',{...change,confirmChange:true,confirmation:'ALTERAR'}))));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const latest=await svc.get(req('owner','settings-a'));assert.equal(latest.version,2);assert.equal(latest.history.length,2);assert.equal(latest.config.handle,'beta');
 await assert.rejects(()=>svc.save(req('owner','settings-a',{config:{...config,email:'private@example.com'},expectedVersion:2,expectedHandle:'beta'})),e=>e.code==='invalid-argument');
 await svc.save(req('admin','settings-a',{config:{...latest.config,sendCustomerData:false},expectedVersion:2,expectedHandle:'beta'}));assert.equal((await svc.get(req('owner','settings-a'))).version,3);
 await svc.save(req('owner','settings-a',{config:{...latest.config,enabled:false},expectedVersion:3,expectedHandle:'beta'}));
 const inactive={config:{...config,enabled:false,handle:'gamma'},expectedVersion:4,expectedHandle:'beta'};
 await assert.rejects(()=>svc.save(req('owner','settings-a',inactive)),e=>e.code==='failed-precondition');
 await svc.save(req('owner','settings-a',{...inactive,confirmChange:true}));
 await db.doc('users/manager').update({ativo:false});await assert.rejects(()=>svc.get(req('manager','settings-a')),e=>e.code==='permission-denied');
});
test('checkout usa tag da loja, falha sem configuração e preserva snapshot antigo',async()=>{
 await seed();const p=createPaymentService({db,admin,provider:{create:async payload=>{assert.equal(payload.handle,'original');assert.equal(payload.customer,undefined);return {url:'https://buy.infinitepay.io/test'};}}});
 const ref=db.doc('lojas/settings-b/configuracoesInternas/infinitepay');await ref.delete();await assert.rejects(()=>p.config('settings-b'));
 await ref.set({...config,handle:'merchant_b',redirectUrl:'https://example.com/return',webhookUrl:'https://example.com/hook'});assert.equal((await p.config('settings-b')).handle,'merchant_b');
 const id='e'.repeat(64);await db.doc('checkoutPayments/'+id).set({ownerUid:'owner',orderId:id,storeId:'settings-b',handle:'original',amount:100,payment_status:'PENDING',redirectUrl:'https://example.com/return',webhookUrl:'https://example.com/hook'});await p.start(id,'owner');
 await ref.update({enabled:false});await assert.rejects(()=>p.config('settings-b'));
});
test('Rules negam gravação direta, acesso cruzado à auditoria e autoelevação',async()=>{
 await seed();const env=await initializeTestEnvironment({projectId:'demo-doceria-checkout',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
 try {const staff=env.authenticatedContext('manager').firestore();await assertFails(setDoc(doc(staff,'lojas/settings-a/configuracoesInternas/infinitepay'),config));await assertFails(updateDoc(doc(staff,'customProfiles/manager'),{permissionDetails:{configuracoes:{manage_payment_settings:true}}}));await assertFails(updateDoc(doc(staff,'users/manager'),{role:'dono'}));
 const list=await db.collection('auditLogs').where('paymentSettingsStoreId','==','settings-a').get();assert.ok(list.size);const audit=doc(staff,list.docs[0].ref.path);await assertFails(getDoc(audit));await assertFails(updateDoc(audit,{changes:[]}));await assertFails(deleteDoc(audit));await assertFails(setDoc(doc(staff,'auditLogs/forged'),{paymentSettingsStoreId:'settings-a'}));
 }finally{await env.cleanup();}
});
