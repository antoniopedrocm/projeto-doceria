const {HttpsError}=require('firebase-functions/v2/https');
const FIELDS=['enabled','handle','sendCustomerData','sendDeliveryAddress'];
const values=c=>({enabled:c?.enabled===true,handle:c?.handle||'',sendCustomerData:c?.sendCustomerData!==false,sendDeliveryAddress:c?.sendDeliveryAddress!==false});
function assertFinancialPermissionGrant(requester,details,previousDetails={}) {
 const requested=details?.configuracoes?.manage_payment_settings===true||details?.settings?.manage_payment_settings===true;
 const alreadyGranted=previousDetails?.configuracoes?.manage_payment_settings===true;
 if(requester.role==='gerente'&&requested&&!alreadyGranted) throw new HttpsError('permission-denied','Somente um Dono pode conceder a permissão financeira.');
}
function createPaymentSettings({db,admin,normalizeRole,extractStoreIds}) {
  async function authorize(tx,uid,storeId) {
    if(typeof storeId!=='string'||! /^[a-zA-Z0-9_-]{1,100}$/.test(storeId)) throw new HttpsError('invalid-argument','Selecione uma loja válida.');
    const [user,custom,store]=await Promise.all([tx.get(db.doc('users/'+uid)),tx.get(db.doc('customProfiles/'+uid)),tx.get(db.doc('lojas/'+storeId))]);
    const p=user.data();const role=normalizeRole(p?.role);const stores=extractStoreIds(p);
    if(!p||p.ativo===false||String(p.status||'').trim().toLowerCase()==='inativo'||!['dono','gerente'].includes(role)) throw new HttpsError('permission-denied','Acesso financeiro negado.');
    if(!(role==='dono'&&!stores.length)&&!stores.includes(storeId)) throw new HttpsError('permission-denied','Loja não autorizada.');
    if(role==='gerente'&&custom.data()?.permissionDetails?.configuracoes?.manage_payment_settings!==true) throw new HttpsError('permission-denied','Permissão financeira necessária.');
    if(!store.exists) throw new HttpsError('not-found','Loja não encontrada.');
    return {uid,role,name:p.nome||p.email||uid};
  }
  async function run(request,write) {
    const uid=request.auth?.uid;
    if(!uid) throw new HttpsError('unauthenticated','Entre novamente.');
    if((await admin.auth().getUser(uid)).disabled) throw new HttpsError('permission-denied','Usuário inativo.');
    const d=request.data||{};const storeId=d.storeId;
    return db.runTransaction(async tx=>{
      const actor=await authorize(tx,uid,storeId);
      const ref=db.doc('lojas/'+storeId+'/configuracoesInternas/infinitepay');
      const snap=await tx.get(ref);const old=snap.data()||{};const previous=values(old);
      if(!write) {
        const history=await tx.get(db.collection('auditLogs').where('paymentSettingsStoreId','==',storeId).orderBy('timestamp','desc').limit(20));
        return {config:previous,version:old.version||0,lastChange:old.updatedAt?.toMillis()||null,updatedBy:old.updatedBy||null,operationalReady:!!old.redirectUrl&&!!old.webhookUrl,
          history:history.docs.map(s=>({id:s.id,...s.data(),timestamp:s.data().timestamp?.toMillis()||null}))};
      }
      const c=d.config;
      if(!c||Object.keys(c).some(k=>!FIELDS.includes(k))||typeof c.handle!=='string'||! /^[a-zA-Z0-9_-]{2,80}$/.test(c.handle)||FIELDS.filter(k=>k!=='handle').some(k=>typeof c[k]!=='boolean')) throw new HttpsError('invalid-argument','Configuração inválida. Informe a tag sem $.');
      if(d.expectedVersion!==(old.version||0)||d.expectedHandle!==previous.handle) throw new HttpsError('aborted','A configuração mudou. Recarregue antes de salvar.');
      if(previous.handle&&previous.handle!==c.handle && (d.confirmChange!==true||(previous.enabled&&d.confirmation!=='ALTERAR'))) throw new HttpsError('failed-precondition','Confirme a alteração da conta recebedora.');
      const changes=FIELDS.filter(k=>previous[k]!==c[k]).map(field=>({field,before:previous[field],after:c[field]}));
      if(!changes.length) return {saved:true,version:old.version||0};
      const timestamp=admin.firestore.FieldValue.serverTimestamp();
      tx.set(ref,{...c,version:(old.version||0)+1,updatedAt:timestamp,updatedBy:actor},{merge:true});
      tx.create(db.collection('auditLogs').doc(),{action:'infinitepay.settings.updated',source:'paymentSettingsSave',storeId,paymentSettingsStoreId:storeId,actor,changes,timestamp});
      return {saved:true,version:(old.version||0)+1};
    });
  }
  return {get:r=>run(r,false),save:r=>run(r,true)};
}
module.exports={createPaymentSettings,assertFinancialPermissionGrant};
