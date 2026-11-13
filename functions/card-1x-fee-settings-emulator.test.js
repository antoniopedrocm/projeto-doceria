process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const {createPaymentSettings}=require('./payment-settings');
const {createPaymentService}=require('./checkout-payment');
const {createCardFeeCredentials,secretId}=require('./card-1x-fee-credentials');
const app=admin.initializeApp({projectId:'demo-card-1x-fee'},'card-1x-fee-settings'),db=app.firestore();
const defaults={enabled:true,handle:'merchant_a',sendCustomerData:true,sendDeliveryAddress:true};
const settings=createPaymentSettings({db,admin:{auth:()=>({getUser:async()=>({disabled:false})})},normalizeRole:r=>r,extractStoreIds:p=>p?.lojaIds||[]});
const request=(uid,storeId,extra={})=>({auth:uid?{uid}:null,data:{storeId,...extra}});
const urls={redirectUrl:'https://example.invalid/return',webhookUrl:'https://example.invalid/hook'};
before(async()=>{
  for(const store of ['matriz','garavelo'])await db.doc('lojas/'+store).set({nome:store});
  for(const [uid,data] of Object.entries({owner:{role:'dono'},manager:{role:'gerente',lojaIds:['matriz']},denied:{role:'gerente',lojaIds:['matriz']},staff:{role:'atendente',lojaIds:['matriz']}})){
    await db.doc('users/'+uid).set(data);await db.doc('customProfiles/'+uid).set({permissionDetails:{configuracoes:{manage_payment_settings:uid==='manager'}}});
  }
  for(const store of ['matriz','garavelo'])await db.doc('lojas/'+store+'/configuracoesInternas/infinitepay').delete();
});
after(()=>app.delete());
test('default STORE is returned without creating a remote config document; save/reopen persists per-store',async()=>{
  const r=await settings.get(request('owner','matriz'));assert.equal(r.config.card1xFeePayer,'STORE');
  assert.equal(r.card1xFeePolicy.application,'PENDING_PROVIDER_VALIDATION');
  const ref=db.doc('lojas/matriz/configuracoesInternas/infinitepay');assert.equal((await ref.get()).exists,false);
  await settings.save(request('manager','matriz',{config:{...defaults,card1xFeePayer:'STORE'},expectedVersion:0,expectedHandle:''}));
  const saved=await settings.get(request('manager','matriz'));assert.equal(saved.config.card1xFeePayer,'STORE');assert.equal(saved.config.handle,'merchant_a');
  assert.equal((await ref.get()).data().card1xFeePayer,'STORE');
  assert.equal((await db.doc('lojas/garavelo/configuracoesInternas/infinitepay').get()).exists,false);
});
test('permissions cannot be bypassed and rejected CUSTOMER preference changes neither version nor merchant',async()=>{
  for(const [uid,store] of [[null,'matriz'],['denied','matriz'],['staff','matriz'],['manager','garavelo']]){
    await assert.rejects(()=>settings.save(request(uid,store,{config:defaults,expectedVersion:0,expectedHandle:''})),e=>['unauthenticated','permission-denied'].includes(e.code));
  }
  const ref=db.doc('lojas/matriz/configuracoesInternas/infinitepay'),before=(await ref.get()).data();
  await assert.rejects(()=>settings.save(request('manager','matriz',{config:{...defaults,card1xFeePayer:'CUSTOMER'},expectedVersion:before.version,expectedHandle:before.handle,customerPassThroughAvailable:true})),e=>e.code==='failed-precondition');
  assert.deepEqual((await ref.get()).data(),before);
});
test('legacy valid preference survives old-form save; explicit revert to STORE is audited without changing native installment policy',async()=>{
  const ref=db.doc('lojas/garavelo/configuracoesInternas/infinitepay');
  await ref.set({...defaults,...urls,handle:'merchant_b',card1xFeePayer:'CUSTOMER',version:4,options:{assured_installments:5},privateSentinel:'unchanged'});
  await settings.save(request('owner','garavelo',{config:{...defaults,handle:'merchant_b',sendCustomerData:false},expectedVersion:4,expectedHandle:'merchant_b'}));
  assert.equal((await settings.get(request('owner','garavelo'))).config.card1xFeePayer,'CUSTOMER');
  await settings.save(request('owner','garavelo',{config:{...defaults,handle:'merchant_b',sendCustomerData:false,card1xFeePayer:'STORE'},expectedVersion:5,expectedHandle:'merchant_b'}));
  const result=(await ref.get()).data();assert.equal(result.card1xFeePayer,'STORE');assert.equal(result.options.assured_installments,5);assert.equal(result.privateSentinel,'unchanged');assert.deepEqual({redirectUrl:result.redirectUrl,webhookUrl:result.webhookUrl},urls);
  const audits=(await db.collection('auditLogs').where('paymentSettingsStoreId','==','garavelo').get()).docs.map(d=>d.data());
  assert.ok(audits.some(a=>a.actor.uid==='owner' && a.changes.some(c=>c.field==='card1xFeePayer'&&c.before==='CUSTOMER'&&c.after==='STORE')));
});
test('no surcharge/options are fabricated: link retains server amount/merchant/events and repeated start is idempotent',async()=>{
  const payloads=[];const payments=createPaymentService({db,admin,provider:{create:async p=>{payloads.push(p);return {url:'https://buy.infinitepay.io/synthetic'};}}});
  const id='8'.repeat(64);await db.doc('checkoutPayments/'+id).set({ownerUid:'owner',orderId:id,storeId:'matriz',handle:'snapshot_merchant',amount:1234,payment_status:'PENDING',...urls});
  await payments.start(id,'owner');await payments.start(id,'owner');assert.equal(payloads.length,1);
  assert.equal(payloads[0].items[0].price,1234);assert.equal(payloads[0].handle,'snapshot_merchant');assert.equal(payloads[0].order_nsu,id);assert.equal(payloads[0].options,undefined);
  assert.ok(payloads[0].webhook.events.includes('paid'));assert.equal(payloads[0].apiKey,undefined);
});
const fakeKey=store=>'inchk_'+'synthetic-only-'+store;
async function nativeConfig(store,baseline,payer='STORE'){
 await db.doc('lojas/'+store).set({nome:store});
 await db.doc(`lojas/${store}/configuracoesInternas/infinitepay`).set({...defaults,...urls,handle:'merchant_'+store,card1xFeePayer:payer,card1xFeeBinding:{schemaVersion:1,enabled:true,storeId:store,handle:'merchant_'+store,baselineAssuredInstallments:baseline,secretVersion:`projects/demo-card-1x-fee/secrets/${secretId(store)}/versions/1`,validation:{schemaVersion:1,state:'VERIFIED_NO_PAYMENT',storeId:store,handle:'merchant_'+store,secretVersion:`projects/demo-card-1x-fee/secrets/${secretId(store)}/versions/1`,assuredInstallments:[0,1]}}});
}
function nativeService(readSecret,calls){return createPaymentService({db,admin,resolveCardFeeCredentials:createCardFeeCredentials({projectId:'demo-card-1x-fee',readSecret}),provider:{create:async(payload,credentials)=>{calls.push({payload,credentials});return {url:'https://buy.infinitepay.io/native-synthetic'};}}});}
async function paymentFor(service,store,id){const config=await service.config(store);await db.doc('checkoutPayments/'+id).set({ownerUid:'owner',orderId:id,storeId:store,amount:1478,payment_status:'PENDING',...config});return config;}
test('native policy snapshots preserve merchant/amount, distinct per-store header credentials and idempotency',async()=>{
 const calls=[];await nativeConfig('native_a',0);await nativeConfig('native_b',3);
 const service=nativeService(async name=>{const store=name.includes(secretId('native_a'))?'native_a':'native_b';return JSON.stringify({schemaVersion:1,storeId:store,handle:'merchant_'+store,baselineAssuredInstallments:store==='native_a'?0:3,apiKey:fakeKey(store)});},calls);
 for(const [store,id,target]of [['native_a','1'.repeat(64),1],['native_b','2'.repeat(64),3]]){await paymentFor(service,store,id);await service.start(id,'owner');await service.start(id,'owner');const c=calls.at(-1);assert.equal(c.payload.items[0].price,1478);assert.equal(c.payload.handle,'merchant_'+store);assert.equal(c.payload.options.assured_installments,target);assert.equal(c.credentials.apiKey,fakeKey(store));const p=(await db.doc('checkoutPayments/'+id).get()).data();assert.equal(JSON.stringify(p).includes('inchk_'),false);assert.equal(p.card1xFeeApplied.assuredInstallments,target);}
 assert.equal(calls.length,2);
});
test('native CUSTOMER=0 is allowed only after a compatible private binding; forged binding in settings is rejected',async()=>{
 await nativeConfig('native_customer',1);const config=await settings.get(request('owner','native_customer'));assert.equal(config.card1xFeePolicy.customerPassThroughAvailable,true);assert.equal(JSON.stringify(config).includes('secretVersion'),false);
 await settings.save(request('owner','native_customer',{config:{...defaults,handle:'merchant_native_customer',card1xFeePayer:'CUSTOMER'},expectedVersion:0,expectedHandle:'merchant_native_customer'}));
 const calls=[],service=nativeService(async()=>JSON.stringify({schemaVersion:1,storeId:'native_customer',handle:'merchant_native_customer',baselineAssuredInstallments:1,apiKey:fakeKey('native_customer')}),calls);
 const id='3'.repeat(64);await paymentFor(service,'native_customer',id);await service.start(id,'owner');assert.deepEqual(calls[0].payload.options,{assured_installments:0});
 await assert.rejects(()=>settings.save(request('owner','native_customer',{config:{...defaults,handle:'merchant_native_customer',card1xFeePayer:'CUSTOMER',card1xFeeBinding:{enabled:true}},expectedVersion:1,expectedHandle:'merchant_native_customer'})),e=>e.code==='invalid-argument');
});
test('missing/wrong credential never calls provider, releases only the creation lease and retries same order without duplication',async()=>{
 await nativeConfig('native_missing',1);let available=false;const calls=[],service=nativeService(async()=>{if(!available)throw Error('Synthetic missing secret');return JSON.stringify({schemaVersion:1,storeId:'native_missing',handle:'merchant_native_missing',baselineAssuredInstallments:1,apiKey:fakeKey('native_missing')});},calls),id='4'.repeat(64);
 await paymentFor(service,'native_missing',id);await assert.rejects(()=>service.start(id,'owner'),e=>e.httpStatus===503);const pending=(await db.doc('checkoutPayments/'+id).get()).data();assert.equal(pending.payment_status,'PENDING');assert.equal(pending.linkState,undefined);assert.equal(calls.length,0);
 available=true;await service.start(id,'owner');assert.equal(calls.length,1);assert.equal(calls[0].payload.order_nsu,id);
});
test('incompatible 2x+ policy or cross-store binding blocks configuration before order/payment creation',async()=>{
 await nativeConfig('native_incompatible',4,'CUSTOMER');const service=nativeService(async()=>{throw Error('Must not read key');},[]);await assert.rejects(()=>service.config('native_incompatible'),e=>e.httpStatus===503);
 await nativeConfig('native_cross',1);await db.doc('lojas/native_cross/configuracoesInternas/infinitepay').update({'card1xFeeBinding.storeId':'other'});await assert.rejects(()=>service.config('native_cross'),e=>e.httpStatus===503);
});
test('already-created checkout URL never reloads credentials or changes historical policy',async()=>{
 const id='5'.repeat(64),service=nativeService(async()=>{throw Error('Historical key must not be read');},[]);await db.doc('checkoutPayments/'+id).set({ownerUid:'owner',orderId:id,storeId:'matriz',handle:'old_merchant',amount:100,payment_status:'PENDING',checkoutUrl:'https://buy.infinitepay.io/original'});
 const before=(await db.doc('checkoutPayments/'+id).get()).data();assert.equal((await service.start(id,'owner')).checkoutUrl,before.checkoutUrl);assert.deepEqual((await db.doc('checkoutPayments/'+id).get()).data(),before);
});
test('two DEV stores sharing one merchant keep independent 1x preference, secret and payment snapshot',async()=>{
 const stores=['shared_a','shared_b'],handle='shared_merchant';
 for(const store of stores){await nativeConfig(store,1);await db.doc(`lojas/${store}/configuracoesInternas/infinitepay`).update({handle,'card1xFeeBinding.handle':handle,'card1xFeeBinding.validation.handle':handle});}
 await settings.save(request('owner','shared_b',{config:{...defaults,handle,card1xFeePayer:'CUSTOMER'},expectedVersion:0,expectedHandle:handle}));
 assert.equal((await settings.get(request('owner','shared_a'))).config.card1xFeePayer,'STORE');
 assert.equal((await settings.get(request('owner','shared_b'))).config.card1xFeePayer,'CUSTOMER');
 const calls=[],secretReads=[],service=nativeService(async name=>{secretReads.push(name);const store=name.includes(secretId('shared_a'))?'shared_a':'shared_b';return JSON.stringify({schemaVersion:1,storeId:store,handle,baselineAssuredInstallments:1,apiKey:fakeKey(store)});},calls);
 for(const [store,id,target]of [['shared_a','6'.repeat(64),1],['shared_b','7'.repeat(64),0]]){await paymentFor(service,store,id);await service.start(id,'owner');await service.start(id,'owner');const call=calls.at(-1);assert.equal(call.payload.handle,handle);assert.equal(call.payload.options.assured_installments,target);assert.equal(call.payload.items[0].price,1478);assert.equal(call.credentials.apiKey,fakeKey(store));const payment=(await db.doc('checkoutPayments/'+id).get()).data();assert.equal(payment.card1xFeePolicySnapshot.storeId,store);assert.equal(payment.card1xFeeApplied.assuredInstallments,target);}
 assert.equal(calls.length,2);assert.equal(new Set(secretReads).size,2);
});

test('optional API key: basic store uses its handle without Secrets/options while another store uses its own active native credential',async()=>{
 const basic='optional_matriz',advanced='optional_garavelo',calls=[],reads=[];
 await db.doc('lojas/'+basic).set({nome:basic});
 await db.doc(`lojas/${basic}/configuracoesInternas/infinitepay`).set({...defaults,...urls,handle:'basic_merchant'});
 await nativeConfig(advanced,1);
 const service=nativeService(async name=>{reads.push(name);assert.ok(name.includes(secretId(advanced)));return JSON.stringify({schemaVersion:1,storeId:advanced,handle:'merchant_'+advanced,baselineAssuredInstallments:1,apiKey:fakeKey(advanced)});},calls);
 const first='9'.repeat(64),second='a'.repeat(64);
 const config=await paymentFor(service,basic,first);assert.equal(config.card1xFeePolicySnapshot,undefined);
 await service.start(first,'owner');await service.start(first,'owner');
 assert.equal(reads.length,0);assert.equal(calls.length,1);assert.equal(calls[0].payload.handle,'basic_merchant');assert.equal(calls[0].payload.options,undefined);assert.equal(calls[0].credentials,undefined);
 const panel=await settings.get(request('owner',basic));assert.equal(panel.card1xFeePolicy.customerPassThroughAvailable,false);
 await paymentFor(service,advanced,second);await service.start(second,'owner');
 assert.equal(reads.length,1);assert.equal(calls.length,2);assert.equal(calls[1].payload.handle,'merchant_'+advanced);assert.equal(calls[1].payload.options.assured_installments,1);assert.equal(calls[1].credentials.apiKey,fakeKey(advanced));
 for(const call of calls){assert.equal(call.payload.items[0].price,1478);assert.ok(call.payload.webhook.events.includes('paid'));assert.equal(call.payload.options?.discounts,undefined);assert.equal(call.payload.options?.payment_methods_enabled,undefined);}
});
