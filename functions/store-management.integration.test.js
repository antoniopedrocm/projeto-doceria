process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.GCLOUD_PROJECT='demo-doceria-checkout';
const {test}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin'),express=require('express');
const {createStoreResolver,mountStoreRoutes}=require('./store-config');
test('gestão de lojas OWNER: ciclo, dependências, autorização e histórico',async t=>{
  assert.equal(process.env.GCLOUD_PROJECT,'demo-doceria-checkout');const handlers=require('./index'),db=admin.firestore();let n=0;
  const uid=role=>'sm-'+role,auth=role=>({uid:uid(role)}),request=(role,data)=>({...(role?{auth:auth(role)}:{}),data});
  for(const [role,profile]of Object.entries({owner:{role:'dono'},literalOwner:{role:'OWNER'},admin:{role:'admin',capabilities:{manage_stores:true}},manager:{role:'gerente',lojaIds:['sm-history']},staff:{role:'atendente',lojaIds:['sm-history']},customer:{role:'cliente'},revoked:{role:'owner',capabilities:{manage_stores:false}}}))await db.doc('users/'+uid(role)).set({ativo:true,...profile});
  const create=(id,role='owner')=>handlers.createStore.run(request(role,{storeId:id,nome:'Loja fixture '+id,patch:{publicSlug:'cardapio-'+id},requestId:'sm-create-request-'+(++n)}));
  const write=async(id,action,extra={},role='owner')=>{const s=await db.doc('lojas/'+id).get();return handlers.storeManagementWrite.run(request(role,{storeId:id,action,expectedRevision:Number(s.get('managementRevision') || 0),requestId:'sm-write-request-'+(++n),...extra}));};
  const get=(id,role='owner')=>handlers.storeManagementRead.run(request(role,id?{storeId:id}:{}));
  const resolver=createStoreResolver({db,getAvailability:()=> 'OPEN',loadPaymentConfig:async()=>({enabled:true})});
  await create('sm-history');
  try{
    await t.test('Dono cria DRAFT, sem publicação automática; checklist e projeção mínima',async()=>{await db.doc('lojas/sm-history/configuracoes/storefront').update({'catalog.extraPrivate':'PRIVATE_VALUE'});const r=await get('sm-history');assert.doesNotMatch(JSON.stringify(r),/PRIVATE_VALUE/);assert.equal(r.manage_stores,true);assert.equal(r.store.status,'DRAFT');assert.equal(r.store.ready,false);assert.equal(r.store.readiness.catalog,false);assert.equal((await resolver.publicConfig({storeId:'sm-history'})).active,false);await assert.rejects(write('sm-history','REACTIVATE',{confirm:true}),e=>e.code==='failed-precondition');});
    await t.test('papel literal OWNER preserva gestão e escopo global, sem depender do alias Admin',async()=>{assert.equal((await get('sm-history','literalOwner')).manage_stores,true);await create('literal-owner-draft','literalOwner');assert.equal((await get('literal-owner-draft','literalOwner')).store.status,'DRAFT');});
    await t.test('Admin, Gerente, Staff, Customer e capability revogada negados em todas mutações',async()=>{
      for(const role of ['admin','manager','staff','customer','revoked']){
        await assert.rejects(create('sm-denied-'+role,role),e=>e.code==='permission-denied');
        for(const action of ['UPDATE','DEACTIVATE','REACTIVATE','DELETE'])await assert.rejects(write('sm-history',action,{patch:{nome:'forged'},confirm:true,confirmName:'x'},role),e=>e.code==='permission-denied');
      }
      await assert.rejects(create('sm-anon',null),e=>e.code==='unauthenticated');await assert.rejects(get(null,null),e=>e.code==='unauthenticated');assert.equal((await get(null,'admin')).manage_stores,false);assert.equal((await get(null,'manager')).stores.length,1);
    });
    await t.test('edição preserva ID; não aceita storeId dentro do patch nem canal/legado',async()=>{
      await write('sm-history','UPDATE',{patch:{nome:'Nome interno',nomePublico:'Nome público',catalogEnabled:true,catalogCategory:'Delivery'}});assert.equal((await get('sm-history')).store.nome,'Nome público');
      await db.doc('lojas/sm-history/info/dados').update({endereco:{rua:'Snapshot estruturado'},telefone:62900000000});await write('sm-history','UPDATE',{patch:{nome:'Nome interno',endereco:'',telefone:''}});assert.deepEqual((await db.doc('lojas/sm-history/info/dados').get()).get('endereco'),{rua:'Snapshot estruturado'});assert.equal((await db.doc('lojas/sm-history/info/dados').get()).get('telefone'),62900000000);
      await assert.rejects(write('sm-history','UPDATE',{patch:{storeId:'troca'}}),e=>e.code==='invalid-argument');
      await db.doc('lojas/sm-legacy').set({nome:'Integração legada'});await assert.rejects(write('sm-legacy','DEACTIVATE',{confirm:true}),e=>e.code==='failed-precondition');
    });
    await t.test('reativação só após readiness; slug anterior continua compatível',async()=>{
      await db.doc('lojas/sm-history/configuracoes/config').set({timezone:'America/Sao_Paulo',schedule:Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(day=>[day,{enabled:true,open:'00:00',close:'23:59'}])),manualOverride:{mode:'auto'}});
      await db.doc('lojas/sm-history/configuracoes/storefront').update({'pickup.enabled':true,'delivery.enabled':true});await assert.rejects(write('sm-history','REACTIVATE',{confirm:true}),e=>e.code==='failed-precondition');
      await db.doc('lojas/sm-history/configuracoes/storefront').update({'delivery.enabled':false});await write('sm-history','UPDATE',{patch:{onlineEnabled:true}});await assert.rejects(write('sm-history','REACTIVATE',{confirm:true}),e=>e.code==='failed-precondition');await write('sm-history','UPDATE',{patch:{onlineEnabled:false}});
      await write('sm-history','REACTIVATE',{confirm:true});assert.equal((await resolver.publicConfig({storeId:'sm-history'})).active,true);
      await write('sm-history','UPDATE',{patch:{publicSlug:'cardapio-sm-renamed'}});
      const old=await resolver.publicConfig({alias:'cardapio-sm-history'}),fresh=await resolver.publicConfig({alias:'cardapio-sm-renamed'});assert.equal(old.storeId,fresh.storeId);assert.equal(old.publicSlug,'cardapio-sm-renamed');
    });
    await t.test('inativação preserva pedido/financeiro/fiscal/estoque e bloqueia novas vendas',async()=>{
      const paths=['pedidos/historic','invoices/old','financeiro/old','produtos/old'];for(const path of paths)await db.doc('lojas/sm-history/'+path).set({status:'Pendente',total:10,fixture:true});
      await assert.rejects(write('sm-history','DEACTIVATE'),e=>e.code==='failed-precondition');await write('sm-history','DEACTIVATE',{confirm:true});
      for(const path of paths)assert.equal((await db.doc('lojas/sm-history/'+path).get()).get('fixture'),true);
      assert.equal((await resolver.list()).stores.some(s=>s.storeId==='sm-history'),false);
      const app=express();app.use(express.json());mountStoreRoutes(app,resolver);app.post('/checkout/confirmar',(_req,res)=>res.json({unexpected:true}));const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
      try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/checkout/confirmar?lojaId=sm-history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cliente:{endereco:'Retirar na Loja'}})});assert.equal(response.status,403);assert.equal((await response.json()).code,'STORE_INACTIVE');}finally{await new Promise(r=>server.close(r));}
      await handlers.adminOrderSave.run(request('owner',{storeId:'sm-history',orderId:'historic',mode:'STATUS',patch:{status:'Em Produção'},expectedRevision:0,requestId:'sm-historical-status-request'}));assert.equal((await db.doc('lojas/sm-history/pedidos/historic').get()).get('status'),'Em Produção');
      await assert.rejects(write('sm-history','DELETE',{confirm:true,confirmName:'Nome interno'}),e=>e.code==='failed-precondition');assert.equal((await db.doc('lojas/sm-history').get()).exists,true);
    });
    await t.test('delete vazio exige nome, conserva auditoria e impede reutilizar ID',async()=>{
      await create('sm-empty');const name=(await db.doc('lojas/sm-empty').get()).get('nome');
      await assert.rejects(write('sm-empty','DELETE',{confirm:true,confirmName:'errado'}),e=>e.code==='failed-precondition');
      const result=await write('sm-empty','DELETE',{confirm:true,confirmName:name});assert.equal(result.deleted,true);assert.equal((await db.doc('lojas/sm-empty').get()).exists,false);assert.equal((await db.doc('lojas/sm-empty/configuracoes/storefront').get()).exists,false);await assert.rejects(create('sm-empty'),e=>e.code==='already-exists');
    });
    await t.test('referência desconhecida, alias e histórico bloqueiam hard delete sem deixar lock',async()=>{
      for(const type of ['external','alias','stock']){const id='sm-dependency-'+type;await create(id);if(type==='external')await db.doc('unusualDependency/sm').set({storeId:id});if(type==='alias')await db.doc('storefrontAliases/cardapio-sm-dependent').set({storeId:id,enabled:false});if(type==='stock')await db.doc('lojas/'+id+'/movimentacoes/stock').set({quantity:1});const name=(await db.doc('lojas/'+id).get()).get('nome');await assert.rejects(write(id,'DELETE',{confirm:true,confirmName:name}),e=>e.code==='failed-precondition');const current=await db.doc('lojas/'+id).get();assert.equal(current.exists,true);assert.equal(current.get('deletionLock'),undefined);}
    });
    await t.test('auditoria server-side cobre ciclo, dois eventos de delete e sem secrets',async()=>{
      const events=await db.collection('storeManagementAudit').get(),own=events.docs.filter(d=>d.get('storeId').startsWith('sm-')),actions=new Set(own.map(d=>d.get('action')));for(const action of ['STORE_CREATED','STORE_UPDATED','STORE_DEACTIVATED','STORE_REACTIVATED','STORE_DELETE_ATTEMPTED','STORE_DELETED'])assert.ok(actions.has(action));for(const event of own){assert.equal(event.get('actorUid'),uid('owner'));assert.equal(event.get('actorRole'),'OWNER');assert.ok(event.get('createdAt').toMillis()>0);assert.doesNotMatch(JSON.stringify(event.data()),/PRIVATE|apiKey|secret|password/);}
    });
    await t.test('Admin não pode se promover indiretamente nem redefinir senha de Dono',async()=>{
      await assert.rejects(handlers.createUser.run(request('admin',{email:'sm-owner-proxy@example.test',senha:'fixturePassword123',nome:'Proxy',role:'dono'})),e=>e.code==='permission-denied');
      await assert.rejects(handlers.updateUserPassword.run(request('admin',{uid:uid('owner'),newPassword:'fixturePassword123'})),e=>e.code==='permission-denied');
      const created=await handlers.createUser.run(request('owner',{email:'sm-real-admin@example.test',senha:'fixturePassword123',nome:'Admin fixture',role:'admin'}));assert.equal((await db.doc('users/'+created.uid).get()).get('role'),'admin');
      await assert.rejects(handlers.createStore.run({auth:{uid:created.uid},data:{nome:'Denied admin'}}),e=>e.code==='permission-denied');
    });
  }finally{await admin.app().delete();}
});
