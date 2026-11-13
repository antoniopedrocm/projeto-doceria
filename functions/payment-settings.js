const {HttpsError}=require('firebase-functions/v2/https');
const {FieldValue}=require('firebase-admin/firestore');
const {card1xFeePayer,validateCard1xPreference,card1xFeeStatus}=require('./card-1x-fee-policy');
const {credentialPortalStatus}=require('./payment-credential-status');
const BOOLEAN_FIELDS=['enabled','sendCustomerData','sendDeliveryAddress'];
const FIELDS=['enabled','handle','sendCustomerData','sendDeliveryAddress','card1xFeePayer'];
const values=c=>({enabled:c?.enabled===true,handle:c?.handle||'',sendCustomerData:c?.sendCustomerData!==false,sendDeliveryAddress:c?.sendDeliveryAddress!==false,card1xFeePayer:card1xFeePayer(c)});
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
        const feature=(await tx.get(db.doc('integrations/paymentCredentialManagement'))).data()||{};
        const candidateId=old.card1xCredentialCandidate?.operationId;
        const operation=typeof candidateId==='string'&&/^[a-f0-9]{64}$/.test(candidateId)?(await tx.get(db.doc('integrations/paymentCredentialOperations/requests/'+candidateId))).data()||{}:{};
        return {config:previous,credential:credentialPortalStatus(old,operation,feature,db.projectId),card1xFeePolicy:card1xFeeStatus(old,storeId,db.projectId),version:old.version||0,lastChange:old.updatedAt?.toMillis()||null,updatedBy:old.updatedBy||null,operationalReady:!!old.redirectUrl&&!!old.webhookUrl,
          history:history.docs.map(s=>({id:s.id,...s.data(),timestamp:s.data().timestamp?.toMillis()||null}))};
      }
      const input=d.config;
      if(!input||Object.keys(input).some(k=>!FIELDS.includes(k))||typeof input.handle!=='string'||! /^[a-zA-Z0-9_-]{2,80}$/.test(input.handle)||BOOLEAN_FIELDS.some(k=>typeof input[k]!=='boolean')) throw new HttpsError('invalid-argument','Configuração inválida. Informe a tag sem $.');
      const c={...input,card1xFeePayer:validateCard1xPreference(input,old,{storeId,projectId:db.projectId})};
      if(previous.handle!==c.handle&&old.card1xFeeBinding?.enabled===true)throw new HttpsError('failed-precondition','Cadastre e valide a credencial da nova conta antes de alterar a InfiniteTag.');
      if(d.expectedVersion!==(old.version||0)||d.expectedHandle!==previous.handle) throw new HttpsError('aborted','A configuração mudou. Recarregue antes de salvar.');
      if(previous.handle&&previous.handle!==c.handle && (d.confirmChange!==true||(previous.enabled&&d.confirmation!=='ALTERAR'))) throw new HttpsError('failed-precondition','Confirme a alteração da conta recebedora.');
      const changes=FIELDS.filter(k=>previous[k]!==c[k]).map(field=>({field,before:previous[field],after:c[field]}));
      if(!changes.length) return {saved:true,version:old.version||0};
      const timestamp=FieldValue.serverTimestamp();
      tx.set(ref,{...c,version:(old.version||0)+1,updatedAt:timestamp,updatedBy:actor},{merge:true});
      tx.create(db.collection('auditLogs').doc(),{action:'infinitepay.settings.updated',source:'paymentSettingsSave',storeId,paymentSettingsStoreId:storeId,actor,changes,timestamp});
      return {saved:true,version:(old.version||0)+1};
    });
  }
  async function authorizeCredential(request){const uid=request.auth?.uid;if(!uid)throw new HttpsError('unauthenticated','Entre novamente.');if((await admin.auth().getUser(uid)).disabled)throw new HttpsError('permission-denied','Usuário inativo.');return db.runTransaction(tx=>authorize(tx,uid,request.data?.storeId));}
  return {get:r=>run(r,false),save:r=>run(r,true),authorizeCredential,authorizeTransaction:authorize};
}
module.exports={createPaymentSettings,assertFinancialPermissionGrant};
