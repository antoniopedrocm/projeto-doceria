const crypto=require('node:crypto');
const {validId,catalogIdentity,deliveryFreight}=require('./store-config');
const {canManageStores}=require('./store-owner-policy');
function createFulfillmentAuthorizer({db,HttpsError,assertActiveUser,sanitizePermissions,extractStoreIds}) {
  return async(uid,storeId)=>{
    const profile=await assertActiveUser(uid),raw=String(profile.role || '').toLowerCase();
    const owners=['dono','owner','admin','adm','administrador','administradora','administrador_master'];
    if(![...owners,'gerente','atendente','funcionario','corretor'].includes(raw))throw new HttpsError('permission-denied','Permissão de configurações obrigatória.');
    const role=owners.includes(raw)?'dono':raw==='gerente'?'gerente':'atendente';
    const custom=(await db.doc('customProfiles/'+uid).get()).data() || {};
    const permissions=sanitizePermissions(custom.permissions || profile.permissions,role),stores=extractStoreIds(profile);
    if(!permissions.configuracoes || (!(role==='dono' && !stores.length) && !stores.includes(storeId)))throw new HttpsError('permission-denied','Sem permissão de configurações nesta loja.');
    return {uid,manageStores:canManageStores(profile,custom)};
  };
}
function createFulfillmentAdmin({db,admin,HttpsError,authorize,authorizeManage=authorize}) {
  const fail=(code,message)=>{throw new HttpsError(code,message);};
  const identify=data=>{if(!validId(data?.storeId))fail('invalid-argument','Loja inválida.');return `lojas/${data.storeId}`;};
  async function project(storeId) {
    const root=`lojas/${storeId}`,[store,definition,config]=await db.getAll(...[root,root+'/configuracoes/storefront',root+'/configuracoes/config'].map(p=>db.doc(p)));
    if(!store.exists)fail('not-found','Loja não encontrada.');
    const data=definition.data() || {},identity=catalogIdentity(store.data() || {},data,definition.exists);
    const deliveryEnabled=!identity.v1 || data.delivery?.enabled===true,pickupEnabled=!identity.v1 || data.pickup?.enabled===true;
    const deliveryReady=Boolean(await deliveryFreight({db,storeId,config:config.data() || {},v1:identity.v1}));
    return {storeId,deliveryEnabled,pickupEnabled,deliveryReady,deliveryAvailable:identity.active && identity.catalogEnabled && Boolean(identity.category) && deliveryEnabled && deliveryReady,
      pickupAvailable:identity.active && identity.catalogEnabled && Boolean(identity.category) && pickupEnabled,
      revision:Number(data.fulfillmentRevision || 0),editable:store.get('storeConfigVersion')===1 && data.schemaVersion===1};
  }
  async function get(request) {identify(request.data);const actor=await authorize(request.auth?.uid,request.data.storeId);const result=await project(request.data.storeId);return {...result,validContract:result.editable,manage_stores:actor.manageStores===true,editable:result.editable && actor.manageStores===true};}
  async function save(request) {
    const data=request.data || {},root=identify(data),actor=await authorizeManage(request.auth?.uid,data.storeId);
    if(Object.keys(data).some(k=>!['storeId','deliveryEnabled','pickupEnabled','expectedRevision','requestId'].includes(k)) ||
      typeof data.deliveryEnabled!=='boolean' || typeof data.pickupEnabled!=='boolean' || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision<0 || !/^[a-zA-Z0-9_-]{16,80}$/.test(data.requestId || ''))fail('invalid-argument','Disponibilidade inválida.');
    const ref=db.doc(root+'/configuracoes/storefront'),event=db.doc(root+'/fulfillmentAudit/'+data.requestId);
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify({uid:actor.uid,...data})).digest('hex');
    const result=await db.runTransaction(async tx=>{
      const [store,definition,previous]=await Promise.all([tx.get(db.doc(root)),tx.get(ref),tx.get(event)]);
      if(!store.exists)fail('not-found','Loja não encontrada.');
      if(previous.exists) {if(previous.get('staffUid')!==actor.uid || previous.get('fingerprint')!==fingerprint)fail('already-exists','Operação já utilizada.');return {changed:true,duplicate:true};}
      const current=definition.data() || {};
      if(store.get('storeConfigVersion')!==1 || current.schemaVersion!==1)fail('failed-precondition','A loja precisa de configuração storefront V1 válida antes de alterar a disponibilidade.');
      const revision=Number(current.fulfillmentRevision || 0);
      if(revision!==data.expectedRevision)fail('aborted','A configuração mudou em outra sessão. Recarregue antes de salvar.');
      const before={deliveryEnabled:current.delivery?.enabled===true,pickupEnabled:current.pickup?.enabled===true};
      const after={deliveryEnabled:data.deliveryEnabled,pickupEnabled:data.pickupEnabled};
      if(before.deliveryEnabled===after.deliveryEnabled && before.pickupEnabled===after.pickupEnabled)return {changed:false};
      tx.update(ref,{'delivery.enabled':data.deliveryEnabled,'pickup.enabled':data.pickupEnabled,fulfillmentRevision:revision+1,fulfillmentUpdatedAt:admin.firestore.FieldValue.serverTimestamp()});
      tx.create(event,{action:'FULFILLMENT_AVAILABILITY_CHANGED',storeId:data.storeId,staffUid:actor.uid,before,after,revision:revision+1,source:'CRM_FREIGHT_SETTINGS',createdAt:admin.firestore.FieldValue.serverTimestamp(),fingerprint});
      return {changed:true};
    });
    return {...await project(data.storeId),...result};
  }
  return {get,save};
}
module.exports={createFulfillmentAdmin,createFulfillmentAuthorizer};
