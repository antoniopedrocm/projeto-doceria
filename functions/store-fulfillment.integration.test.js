process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.GCLOUD_PROJECT='demo-doceria-checkout';
const {test}=require('node:test'),assert=require('node:assert/strict');
const admin=require('firebase-admin'),express=require('express');
const {createStoreResolver,mountStoreRoutes,assertFulfillment}=require('./store-config');
test('disponibilidade por loja: autorização, auditoria, persistência, readiness e checkout',async t=>{
  assert.equal(process.env.GCLOUD_PROJECT,'demo-doceria-checkout');
  const handlers=require('./index'),db=admin.firestore(),a='fulfillment-a',b='fulfillment-b';
  const batch=db.batch();for(const id of [a,b]){
    batch.set(db.doc('lojas/'+id),{nome:'Fixture '+id,ativo:true,status:'ACTIVE',storeConfigVersion:1});
    batch.set(db.doc(`lojas/${id}/configuracoes/storefront`),{schemaVersion:1,catalog:{enabled:true,category:'Delivery'},delivery:{enabled:true},pickup:{enabled:true},onlinePayment:{enabled:true}});
    batch.set(db.doc(`lojas/${id}/configuracoes/config`),{frete:{lat:-16,lng:-49,valorPorKm:3,valorMinimoFrete:2},schedule:{privateFixture:true}});
  }
  const profiles={owner:{role:'dono'},manager:{role:'gerente',lojaIds:[a]},restricted:{role:'gerente',lojaIds:[a],permissions:{configuracoes:false}},staff:{role:'atendente',lojaIds:[a]},customer:{role:'cliente'},inactive:{role:'dono',ativo:false},scopedOwner:{role:'dono',lojaIds:[b]}};
  for(const [uid,profile] of Object.entries(profiles))batch.set(db.doc('users/fulfill-'+uid),{ativo:true,...profile});await batch.commit();
  const get=(storeId=a,uid='owner')=>handlers.staffGetFulfillment.run({data:{storeId},...(uid?{auth:{uid:'fulfill-'+uid}}:{})});
  let serial=0;
  const save=(deliveryEnabled,pickupEnabled,expectedRevision,storeId=a,uid='owner',requestId='fulfillment-request-'+(++serial))=>handlers.staffSaveFulfillment.run({auth:{uid:'fulfill-'+uid},data:{storeId,deliveryEnabled,pickupEnabled,expectedRevision,requestId}});
  const resolver=createStoreResolver({db,getAvailability:()=> 'OPEN',loadPaymentConfig:async()=>({enabled:true})});
  const app=express();app.use(express.json());mountStoreRoutes(app,resolver);
  let calls=0;for(const path of ['/pedidos','/checkout/confirmar'])app.post(path,(_req,res)=>{calls++;res.json({ok:true});});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
  const post=async(storeId,pickup,path='/checkout/confirmar')=>{const r=await fetch(base+path+'?lojaId='+storeId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cliente:{endereco:pickup?'Retirar na Loja':'Rua fixture'}})});return {status:r.status,data:await r.json()};};
  try {
    await t.test('Staff configurações/loja, Customer, anônimo, inativo e override custom',async()=>{
      assert.equal((await get()).deliveryAvailable,true);assert.equal((await get(a,'manager')).storeId,a);
      for(const uid of ['restricted','staff','customer','inactive','scopedOwner'])await assert.rejects(get(a,uid));
      await assert.rejects(get(a,null),e=>e.code==='unauthenticated');await assert.rejects(get(b,'manager'),e=>e.code==='permission-denied');
      assert.equal((await get(a,'manager')).editable,false);await assert.rejects(save(false,true,0,a,'manager'),e=>e.code==='permission-denied');
      await db.doc('customProfiles/fulfill-manager').set({permissions:{configuracoes:false}});await assert.rejects(get(a,'manager'));await db.doc('customProfiles/fulfill-manager').delete();
      await assert.rejects(get('../a'),e=>e.code==='invalid-argument');
    });
    await t.test('quatro combinações, isolamento, recarregamento e enforcement real HTTP',async()=>{
      let revision=0;
      for(const [delivery,pickup] of [[false,true],[false,false],[true,false],[true,true]]){
        const result=await save(delivery,pickup,revision++);assert.equal(result.changed,true);assert.equal(result.deliveryReady,true);
        const fresh=await get(),c=await resolver.publicConfig({storeId:a});assert.equal(fresh.deliveryEnabled,delivery);assert.equal(fresh.pickupEnabled,pickup);assert.equal(c.delivery.available,delivery);assert.equal(c.pickup.enabled,pickup);
        for(const path of ['/pedidos','/checkout/confirmar']){assert.equal((await post(a,false,path)).status,delivery?200:409);assert.equal((await post(a,true,path)).status,pickup?200:409);}
        const other=await get(b);assert.equal(other.deliveryEnabled,true);assert.equal(other.pickupEnabled,true);
      }
      assert.equal((await get()).revision,4);
    });
    await t.test('auditoria mínima, timestamp, sem alteração do frete e retry idempotente',async()=>{
      const before=(await db.doc(`lojas/${a}/configuracoes/config`).get()).data();
      const id='fulfillment-idempotent-request';await save(false,true,4,a,'owner',id);const repeated=await save(false,true,4,a,'owner',id);assert.equal(repeated.duplicate,true);
      const events=await db.collection(`lojas/${a}/fulfillmentAudit`).get();assert.equal(events.size,5);
      const event=(await db.doc(`lojas/${a}/fulfillmentAudit/${id}`).get()).data();assert.equal(event.action,'FULFILLMENT_AVAILABILITY_CHANGED');assert.equal(event.staffUid,'fulfill-owner');assert.equal(event.storeId,a);assert.deepEqual(event.before,{deliveryEnabled:true,pickupEnabled:true});assert.deepEqual(event.after,{deliveryEnabled:false,pickupEnabled:true});assert.ok(event.createdAt.toMillis()>0);assert.doesNotMatch(JSON.stringify(event),/email|telefone|endereco/);
      assert.deepEqual((await db.doc(`lojas/${a}/configuracoes/config`).get()).data(),before);
      await assert.rejects(save(true,true,4,a,'owner',id),e=>e.code==='already-exists');await assert.rejects(save(true,true,4),e=>e.code==='aborted');
    });
    await t.test('enabled true não contorna frete inválido, sem herança da outra loja',async()=>{
      await db.doc(`lojas/${a}/configuracoes/config`).update({'frete.lat':999});
      const enabled=await save(true,true,5);assert.equal(enabled.deliveryEnabled,true);assert.equal(enabled.deliveryReady,false);assert.equal(enabled.deliveryAvailable,false);
      assert.equal((await resolver.publicConfig({storeId:a})).delivery.available,false);assert.equal((await post(a,false)).data.code,'DELIVERY_UNAVAILABLE');assert.equal((await post(a,true)).status,200);assert.equal((await get(b)).deliveryAvailable,true);
      await db.doc(`lojas/${a}/configuracoes/config`).update({'frete.lat':-16});assert.equal((await get()).deliveryAvailable,true);assert.equal((await post(a,false)).status,200);
    });
    await t.test('guarda transacional relê flags e rejeita desativação após middleware',async()=>{
      await save(false,false,6);
      for(const pickup of [true,false])await assert.rejects(db.runTransaction(tx=>assertFulfillment({db,storeId:a,pickup,read:ref=>tx.get(ref)})),e=>e.code===(pickup?'PICKUP_UNAVAILABLE':'DELIVERY_UNAVAILABLE'));
      assert.ok(calls>0);
    });
    await t.test('payload inválido e troca de loja negados sem escrita',async()=>{
      await assert.rejects(save(true,true,7,b,'manager'),e=>e.code==='permission-denied');
      await assert.rejects(handlers.staffSaveFulfillment.run({auth:{uid:'fulfill-owner'},data:{storeId:a,deliveryEnabled:'true',pickupEnabled:true,expectedRevision:7,requestId:'fulfillment-invalid-request'}}),e=>e.code==='invalid-argument');
      assert.equal((await get()).revision,7);
    });
  } finally {await new Promise(resolve=>server.close(resolve));await admin.app().delete();}
});
