const crypto=require('node:crypto');
const {validId,deliveryFreight}=require('./store-config');
const {canManageStores,isStoreOwner}=require('./store-owner-policy');
const slugValid=s=>typeof s==='string' && /^cardapio-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length<=100;
const storeKind=s=>s.storeConfigVersion!==1?'LEGACY':s.parentStoreId || s.channelId || s.integrationId || ['channel','integration','canal','integracao'].includes(String(s.kind || s.type || s.tipo).toLowerCase())?'CHANNEL':'STORE';
const status=s=>s.status==='DRAFT'?'DRAFT':s.ativo===false || s.ativa===false || ['INACTIVE','INATIVO','INATIVA'].includes(String(s.status).toUpperCase())?'INACTIVE':'ACTIVE';
const text=value=>typeof value==='string'?value.trim():'';
const view=s=>Object.fromEntries(['nome','nomePublico','publicSlug','status','ativo','managementRevision'].filter(k=>['string','boolean','number'].includes(typeof s[k])).map(k=>[k,s[k]]));
const publication=definition=>({catalog:{enabled:definition.catalog?.enabled===true,category:text(definition.catalog?.category)},onlinePayment:{enabled:definition.onlinePayment?.enabled===true}});
function createStoreManagement({db,admin,HttpsError,assertActiveUser,extractStoreIds,normalizeRole,getAvailability}) {
  const fail=(code,message)=>{throw new HttpsError(code,message);};
  const timestamp=()=>admin.firestore.FieldValue.serverTimestamp();
  async function actor(uid,storeId=null,write=false) {
    const profile=await assertActiveUser(uid),custom=(await db.doc('customProfiles/'+uid).get()).data() || {};
    const role=normalizeRole(profile.role),stores=extractStoreIds(profile),all=(role==='dono' || isStoreOwner(profile)) && !stores.length;
    if(!['dono','gerente','atendente','contador'].includes(role) || ['cliente','client'].includes(String(profile.role).toLowerCase()))fail('permission-denied','Acesso Staff obrigatório.');
    const owner=canManageStores(profile,custom);
    if(write&&!owner)fail('permission-denied','Somente Dono com manage_stores pode gerenciar lojas.');
    if(storeId && !all && !stores.includes(storeId))fail('permission-denied','Sem acesso a esta loja.');
    return {uid,profile,stores,all,owner};
  }
  const owner=(uid,id)=>actor(uid,id,true);
  const identify=id=>{if(!validId(id)||['all','__all__','geral'].includes(id))fail('invalid-argument','Loja inválida.');return db.doc('lojas/'+id);};
  const snapshot=(ref,data)=>({ref,id:ref.id,exists:true,data:()=>data});
  async function inspect(id,store,read=ref=>ref.get()) {
    const root='lojas/'+id,definition=(await read(db.doc(root+'/configuracoes/storefront'))).data() || {},config=(await read(db.doc(root+'/configuracoes/config'))).data() || {};
    const aliases=await db.collection('storefrontAliases').where('storeId','==',id).limit(30).get();
    const menuSlug=store.publicSlug || aliases.docs.find(d=>!d.data().channelId)?.id || '';
    const slugRecord=slugValid(menuSlug)?await read(db.doc('storefrontAliases/'+menuSlug)):null;
    const freight=await deliveryFreight({db,storeId:id,config,v1:true,read});
    let payment=true;
    if(definition.onlinePayment?.enabled===true){const p=(await read(db.doc(root+'/configuracoesInternas/infinitepay'))).data() || {};try{payment=p.enabled===true && /^[a-zA-Z0-9_-]{2,80}$/.test(p.handle || '') && new URL(p.redirectUrl).protocol==='https:' && new URL(p.webhookUrl).protocol==='https:';}catch{payment=false;}}
    const readiness={basic:Boolean(text(store.nome)),catalog:definition.catalog?.enabled===true && Boolean(text(definition.catalog?.category)),schedule:getAvailability({...config,manualOverride:{mode:'auto'}})!=='CONFIG_UNAVAILABLE',
      pickup:definition.pickup?.enabled===true,delivery:definition.delivery?.enabled===true,freight:definition.delivery?.enabled!==true || Boolean(freight),payment,menu:slugValid(menuSlug) && (!slugRecord?.exists || (slugRecord.get('storeId')===id && !slugRecord.get('channelId')))};
    const ready=storeKind(store)==='STORE' && Object.entries(readiness).filter(([k])=>!['pickup','delivery'].includes(k)).every(([,v])=>v) && (readiness.pickup || readiness.delivery);
    return {readiness,ready,menuSlug,definition};
  }
  function row(doc) {const s=doc.data();return {storeId:doc.id,...view(s),nome:text(s.nomePublico) || text(s.nome) || 'Loja sem nome cadastrado',legalName:text(s.nome),status:status(s),kind:storeKind(s),canDeleteCandidate:s.managementSchemaVersion===1 && !s.wasActivated && status(s)==='DRAFT',revision:Number(s.managementRevision || 0)};}
  async function read(request) {
    const a=await actor(request.auth?.uid,request.data?.storeId || null),id=request.data?.storeId;
    if(id){const ref=identify(id),doc=await ref.get();if(!doc.exists)fail('not-found','Loja não encontrada.');const info=await inspect(id,doc.data()),basic=(await db.doc(ref.path+'/info/dados').get()).data() || {};return {manage_stores:a.owner,store:{...row(doc),...info,basic:{telefone:text(basic.telefone),endereco:text(basic.endereco)},definition:publication(info.definition)},canEdit:a.owner && storeKind(doc.data())==='STORE'};}
    const cursor=request.data?.cursor;if(cursor && !validId(cursor))fail('invalid-argument','Cursor inválido.');let query=db.collection('lojas').orderBy('__name__').limit(50);if(cursor)query=query.startAfter(cursor);
    const docs=await query.get();return {manage_stores:a.owner,stores:docs.docs.filter(d=>a.all || a.stores.includes(d.id)).map(row),nextCursor:docs.size===50?docs.docs.at(-1).id:null};
  }
  function input(data) {
    const patch=data.patch || {};
    if(Object.keys(patch).some(k=>!['nome','nomePublico','publicSlug','telefone','endereco','catalogEnabled','catalogCategory','onlineEnabled'].includes(k)))fail('invalid-argument','Campos estruturais inválidos.');
    for(const key of ['telefone','endereco'])if(patch[key]!==undefined&&(typeof patch[key]!=='string'||patch[key].length>300))fail('invalid-argument','Contato/endereço inválido.');
    for(const key of ['nome','nomePublico','catalogCategory'])if(patch[key]!==undefined && (typeof patch[key]!=='string'||patch[key].length>160 || (key==='nome'&&!patch[key].trim())))fail('invalid-argument','Nome/categoria inválido.');
    if(patch.publicSlug!==undefined && !slugValid(patch.publicSlug))fail('invalid-argument','Use um slug cardapio-nome válido.');
    for(const key of ['catalogEnabled','onlineEnabled'])if(patch[key]!==undefined && typeof patch[key]!=='boolean')fail('invalid-argument','Configuração inválida.');return patch;
  }
  async function dependencies(id,store) {
    const blocked=[],known=new Map([['info',['dados']],['meuEspaco',['empresa','ponto']],['configuracoes',['config','storefront']]]),bootstrap=[];
    if(store.managementSchemaVersion!==1 || store.wasActivated || status(store)!=='DRAFT')blocked.push('Somente rascunho criado por este gerenciamento, nunca publicado, pode ser excluído.');
    for(const col of await identify(id).listCollections()){
      const docs=await col.limit(20).get();if(!known.has(col.id)){blocked.push('Dados ou histórico em '+col.id);continue;}
      if((await col.listDocuments()).length!==docs.size)blocked.push('Descendentes órfãos ou limite em '+col.id);
      for(const doc of docs.docs){if(!known.get(col.id).includes(doc.id) || (await doc.ref.listCollections()).length)blocked.push('Dependência em '+col.id);else bootstrap.push(doc);}
      if(docs.size>=20)blocked.push('Limite de dependências atingido.');
    }
    // Probe IDs only; never serialize financial/customer payloads.
    const roots=await db.listCollections();if(roots.length>100)throw Error('Dependency inventory exceeds safe bound');
    const fields=[['storeId','=='],['lojaId','=='],['parentStoreId','=='],['originStoreId','=='],['destinationStoreId','=='],['origemLojaId','=='],['destinoLojaId','=='],['lojaOrigemId','=='],['lojaDestinoId','=='],['lojaIds','array-contains'],['authorizedDestinationStoreIds','array-contains'],['lojasVisitadas','array-contains']];
    const probes=roots.filter(c=>!['lojas','storeManagementAudit','storeIdTombstones'].includes(c.id)).flatMap(c=>fields.map(([field,op])=>[c.id,field,op]));
    for(let i=0;i<probes.length;i+=20){const results=await Promise.all(probes.slice(i,i+20).map(async([collection,field,op])=>({collection,snap:await db.collection(collection).where(field,op,id).select(field).limit(1).get()})));for(const result of results)if(!result.snap.empty)blocked.push('Referência em '+result.collection);}
    if(!(await db.collection('lojas').where('parentStoreId','==',id).limit(1).get()).empty)blocked.push('Loja/canal dependente.');
    const others=await db.collection('lojas').limit(101).get();if(others.size>100)throw Error('Cross-store dependency inventory exceeds safe bound');
    const contains=value=>value===id || (typeof value?.path==='string'&&typeof value?.get==='function'?(value.path==='lojas/'+id||value.path.startsWith('lojas/'+id+'/')):Array.isArray(value)?value.some(contains):value&&Object.getPrototypeOf(value)===Object.prototype&&Object.entries(value).some(([key,v])=>key===id||contains(v)));
    for(const other of others.docs.filter(d=>d.id!==id))for(const collection of ['configuracoes','canais','configuracoesInternas']){
      let query=db.collection(other.ref.path+'/'+collection).limit(51);if(collection==='configuracoesInternas')query=query.select('storeId','originStoreId','authorizedDestinationStoreIds','destinationStoreIds','lojasAutorizadas','destinosAutorizados','entreLojas');const docs=await query.get();if(docs.size>50)throw Error('Cross-store configuration bound exceeded');if(docs.docs.some(doc=>contains(doc.data())))blocked.push('Configuração dependente em outra loja.');
    }
    return {blocked:[...new Set(blocked)],bootstrap};
  }
  async function write(request) {
    const data=request.data || {},action=data.action;
    if(!['CREATE','UPDATE','DEACTIVATE','REACTIVATE','DELETE'].includes(action))fail('invalid-argument','Ação inválida.');
    const a=await actor(request.auth?.uid,action==='CREATE'?null:data.storeId,true);
    const requestId=data.requestId || (action==='CREATE'?crypto.randomUUID():'');if(!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId))fail('invalid-argument','Operação inválida.');
    const patch=input(data),id=action==='CREATE'?(data.storeId || ('loja-'+crypto.randomUUID())):data.storeId,ref=identify(id),event=db.doc('storeManagementAudit/'+requestId);
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify({uid:a.uid,data})).digest('hex');
    const unlock=()=>db.runTransaction(async tx=>{const fresh=await tx.get(ref);if(fresh.exists&&fresh.get('deletionLock')===requestId)tx.update(ref,{deletionLock:admin.firestore.FieldValue.delete()});});
    let deletion=null;
    if(action==='DELETE'){
      const s=await ref.get();if(!s.exists){const done=await event.get();if(done.get('action')==='STORE_DELETED'&&done.get('actorUid')===a.uid&&done.get('fingerprint')===fingerprint)return done.get('result');fail('not-found','Loja não encontrada.');}
      if(data.confirm!==true||data.confirmName!==s.get('nome'))fail('failed-precondition','Confirme a exclusão digitando o nome da loja.');
      const attempt=db.doc('storeManagementAudit/'+requestId+'-attempt');
      await db.runTransaction(async tx=>{const old=await tx.get(attempt);if(old.exists && (old.get('fingerprint')!==fingerprint || old.get('actorUid')!==a.uid))fail('already-exists','Operação de exclusão já utilizada.');if(!old.exists)tx.create(attempt,{storeId:id,actorUid:a.uid,actorRole:'OWNER',action:'STORE_DELETE_ATTEMPTED',before:view(s.data()),after:null,createdAt:timestamp(),fingerprint});});
      if(s.get('managementSchemaVersion')===1 && !s.get('wasActivated') && status(s.data())==='DRAFT')await db.runTransaction(async tx=>{
        const fresh=await tx.get(ref);if(fresh.get('managementRevision')!==data.expectedRevision || (fresh.get('deletionLock') && fresh.get('deletionLock')!==requestId))fail('aborted','A loja mudou. Recarregue.');tx.update(ref,{deletionLock:requestId});
      });
      try{deletion=await dependencies(id,s.data());}catch{await unlock();fail('failed-precondition','Não foi possível comprovar ausência de dependências. A loja foi preservada.');}
      if(deletion.blocked.length){await unlock();fail('failed-precondition','Esta loja possui histórico ou dependências e não pode ser excluída. Use Inativar.');}
    }
    try {const result=await db.runTransaction(async tx=>{
      const [s,prior,tombstone]=await Promise.all([tx.get(ref),tx.get(event),tx.get(db.doc('storeIdTombstones/'+id))]);
      if(prior.exists){if(prior.get('fingerprint')!==fingerprint||prior.get('actorUid')!==a.uid)fail('already-exists','Operação já utilizada.');return prior.get('result');}
      const current=s.data() || {};
      if(action==='CREATE'&&s.exists)fail('already-exists','Identificador já cadastrado.');
      if(action==='CREATE'&&tombstone.exists)fail('already-exists','Identificador reservado para preservar a auditoria.');
      if(action!=='CREATE'&&!s.exists)fail('not-found','Loja não encontrada.');
      if(action!=='CREATE'&&storeKind(current)!=='STORE')fail('failed-precondition','Canal/integração ou legado sem modelo válido. Não pode ser gerenciado como loja física.');
      if(current.deletionLock && (action!=='DELETE'||current.deletionLock!==requestId))fail('failed-precondition','Loja em verificação de exclusão.');
      if(action!=='CREATE'&&(!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision!==Number(current.managementRevision || 0)))fail('aborted','A loja mudou em outra sessão. Recarregue.');
      if(['DEACTIVATE','REACTIVATE'].includes(action)&&data.confirm!==true)fail('failed-precondition','Confirmação explícita obrigatória.');
      let next={...current},eventAction;
      const infoRef=db.doc(ref.path+'/info/dados'),definitionRef=db.doc(ref.path+'/configuracoes/storefront');
      const basicSnap=await tx.get(infoRef),basic=basicSnap.data() || {},basicPatch=Object.fromEntries(['telefone','endereco'].filter(k=>patch[k]!==undefined).map(k=>[k,patch[k].trim()]));
      for(const field of Object.keys(basicPatch))if(basic[field]!=null&&typeof basic[field]!=='string'){if(basicPatch[field])fail('failed-precondition','Este dado básico usa um modelo estruturado. Preserve-o e utilize a configuração própria da empresa.');delete basicPatch[field];}
      const definitionSnap=await tx.get(definitionRef),definition=definitionSnap.data() || {};
      let nextDefinition={...definition};
      if(action==='CREATE'){
        const nome=patch.nome || data.nome;if(typeof nome!=='string'||!nome.trim()||nome.length>160)fail('invalid-argument','Nome obrigatório.');
        next={nome:nome.trim(),nomePublico:patch.nomePublico?.trim() || nome.trim(),publicSlug:patch.publicSlug || ('cardapio-'+id),storeConfigVersion:1,managementSchemaVersion:1,status:'DRAFT',ativo:false,wasActivated:false,criadoEm:timestamp(),criadoPor:a.uid};
        if(!slugValid(next.publicSlug))fail('invalid-argument','Slug inválido.');
        nextDefinition={schemaVersion:1,catalog:{enabled:false,category:''},pickup:{enabled:false},delivery:{enabled:false},onlinePayment:{enabled:false}};eventAction='STORE_CREATED';
      } else if(action==='UPDATE'){
        for(const key of ['nome','nomePublico','publicSlug'])if(patch[key]!==undefined)next[key]=patch[key].trim();
        if(patch.catalogEnabled!==undefined)nextDefinition.catalog={...definition.catalog,enabled:patch.catalogEnabled};
        if(patch.catalogCategory!==undefined)nextDefinition.catalog={...nextDefinition.catalog,category:patch.catalogCategory.trim()};
        if(patch.onlineEnabled!==undefined)nextDefinition.onlinePayment={...definition.onlinePayment,enabled:patch.onlineEnabled};eventAction='STORE_UPDATED';
      } else if(action==='DEACTIVATE'){next={...current,ativo:false,status:'INACTIVE'};eventAction='STORE_DEACTIVATED';}
      else if(action==='REACTIVATE'){next={...current,ativo:true,status:'ACTIVE',wasActivated:true};eventAction='STORE_REACTIVATED';}
      else eventAction='STORE_DELETED';
      next.managementRevision=Number(current.managementRevision || 0)+1;
      let aliasRef=null;
      if(next.publicSlug){aliasRef=db.doc('storefrontAliases/'+next.publicSlug);const alias=await tx.get(aliasRef);if(alias.exists&&(alias.get('storeId')!==id||alias.get('channelId')))fail('already-exists','Slug já pertence a outra loja/canal.');}
      if(action==='REACTIVATE'||(action==='UPDATE'&&status(current)==='ACTIVE')){
        const ownRead=r=>r.path===ref.path?Promise.resolve(snapshot(ref,next)):r.path===definitionRef.path?Promise.resolve(snapshot(definitionRef,nextDefinition)):tx.get(r);
        const checked=await inspect(id,next,ownRead);if(!checked.ready)fail('failed-precondition','Configuração incompleta: confira cadastro, catálogo, agenda, atendimento/frete, pagamento solicitado e slug.');
      }
      if(action==='DELETE'){
        const boot=await Promise.all(deletion.bootstrap.map(doc=>tx.get(doc.ref)));
        for(let i=0;i<boot.length;i++)if(boot[i].updateTime?.toMillis()!==deletion.bootstrap[i].updateTime?.toMillis())fail('aborted','A loja recebeu alterações. Refaça a verificação.');
        for(const doc of boot)tx.delete(doc.ref);tx.delete(ref);
        tx.create(db.doc('storeIdTombstones/'+id),{storeId:id,deletedAt:timestamp(),actorUid:a.uid});
      } else {
        tx.set(ref,{...next,updatedAt:timestamp()});
        if(action==='CREATE'||action==='UPDATE'){tx.set(definitionRef,nextDefinition);tx.set(infoRef,{nome:next.nomePublico || next.nome,...basicPatch},{merge:true});}
        if(action==='CREATE'){
          tx.create(db.doc(ref.path+'/configuracoes/config'),{manualOverride:{mode:'force_closed'},iniciadoEm:timestamp(),criadoPor:a.uid});
          tx.create(db.doc(ref.path+'/meuEspaco/empresa'),{nomeFantasia:next.nome,documento:'',contato:{telefone:'',email:''},endereco:{}});
          tx.create(db.doc(ref.path+'/meuEspaco/ponto'),{nome:next.nome,endereco:{},horarioFuncionamento:[]});
          if(!a.all)tx.update(db.doc('users/'+a.uid),{lojaIds:admin.firestore.FieldValue.arrayUnion(id)});
        }
        if(aliasRef&&status(next)==='ACTIVE')tx.set(aliasRef,{storeId:id,enabled:true},{merge:true});
      }
      const result={ok:true,storeId:id,storeData:{nome:next.nomePublico || next.nome},deleted:action==='DELETE',revision:next.managementRevision,...(action==='CREATE'?{assignedStoreIds:a.all?null:[...new Set([...a.stores,id])],primaryStoreId:a.profile.lojaId || id,canAccessAllStores:a.all}:{})};
      tx.create(event,{storeId:id,actorUid:a.uid,actorRole:'OWNER',action:eventAction,before:s.exists?view(current):null,after:action==='DELETE'?null:view(next),basicChanges:Object.keys(basicPatch).filter(k=>text(basic[k])!==basicPatch[k]).map(field=>({field,before:text(basic[field]),after:basicPatch[field]})),publicationBefore:action==='UPDATE'?publication(definition):null,publicationAfter:action==='UPDATE'?publication(nextDefinition):null,createdAt:timestamp(),fingerprint,result});
      return result;
    });return result;} finally {if(action==='DELETE')await unlock();}
  }
  return {read,write,owner};
}
module.exports={createStoreManagement,storeKind,slugValid};
