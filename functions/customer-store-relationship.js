// This collection is Admin-only. Never derive grants from orders or profile metadata.
const {createHash}=require('node:crypto');
const {FieldValue}=require('firebase-admin/firestore');
const ROOT='integrations/customerStoreRelationships/links';
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,150}$/.test(id)&&id!=='__all__';
const key=(storeId,customerId)=>createHash('sha256').update(JSON.stringify([storeId,customerId])).digest('hex');
const sources=['VERIFIED_CLAIM','STRONG_CHECKOUT','REVIEWED_LEGACY'];
function activeRelationship(data,storeId,customerId) {
  return data?.schemaVersion===1&&data.state==='ACTIVE'&&data.storeId===storeId&&data.customerId===customerId&&sources.includes(data.source)&&typeof data.evidenceRef==='string'&&data.evidenceRef.length>0;
}
function relationshipRef(db,storeId,customerId) {
  if(!validId(storeId)||!validId(customerId))throw Object.assign(new Error('Relacionamento inválido.'),{httpStatus:403});
  return db.doc(ROOT+'/'+key(storeId,customerId));
}
async function assertCustomerRelationship({db,tx,storeId,customerId}) {
  const ref=relationshipRef(db,storeId,customerId),snapshot=await (tx?tx.get(ref):ref.get());
  if(!activeRelationship(snapshot.data(),storeId,customerId))throw Object.assign(new Error('Relacionamento cliente–loja não autorizado; requer reconciliação.'),{httpStatus:403,code:'permission-denied'});
}
// Internal server call only; no callable/HTTP grant endpoint is exposed.
function grantCustomerRelationship({db,tx,storeId,customerId,source,evidenceRef}) {
  if(!sources.includes(source)||typeof evidenceRef!=='string'||!evidenceRef)throw new Error('Evidência de relacionamento obrigatória.');
  tx.set(relationshipRef(db,storeId,customerId),{schemaVersion:1,state:'ACTIVE',storeId,customerId,source,evidenceRef,updatedAt:FieldValue.serverTimestamp()});
}
module.exports={ROOT,key,activeRelationship,relationshipRef,assertCustomerRelationship,grantCustomerRelationship};
