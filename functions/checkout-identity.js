const crypto=require('node:crypto');
const MODES=Object.freeze({STRONG:'strong_auth',PHONE:'legacy_phone',GUEST:'guest'});
const fail=()=>{throw Object.assign(new Error('Para pagar online, entre com Google ou e-mail.'),{httpStatus:403,code:'CHECKOUT_STRONG_AUTH_REQUIRED'});};
const hash=token=>crypto.createHash('sha256').update(token).digest('hex');
function createCheckoutIdentity({db,now=Date.now}) {
  // Existing Rules deny Customer reads and all client writes under this root.
  const records=db.collection('checkoutPayments').doc('_identity').collection('contexts');
  const ref=token=>/^[a-f0-9]{64}$/.test(token || '') ? records.doc(hash(token)) : fail();
  function validate(data,storeId) {
    if(!data || data.storeId!==storeId || data.expiresAt<=now() || !Object.values(MODES).includes(data.mode)) fail();
    return data;
  }
  async function select({token,storeId,mode,uid=null,customerId=null,legacyCustomerId=null,phone=null,phoneRecordHash=null,expectedRevision}) {
    if(!Object.values(MODES).includes(mode)) fail();
    if(mode===MODES.STRONG && (!uid || !customerId)) fail();
    // An explicit selection can renew an expired context without clearing storage.
    // An in-flight lookup with a revision must never silently renew/promote it.
    if(token && expectedRevision===undefined) {
      const prior=(await ref(token).get()).data();
      if(prior && prior.expiresAt<=now()) token=null;
    }
    const value=token || crypto.randomBytes(32).toString('hex');
    const reference=ref(value);
    const data=await db.runTransaction(async tx=>{
      const prior=(await tx.get(reference)).data();
      if(token) validate(prior,storeId);
      if(expectedRevision!==undefined && prior?.revision!==expectedRevision) fail();
      const next={storeId,mode,revision:(prior?.revision || 0)+1,expiresAt:now()+24*60*60*1000,
        ownerUid:mode===MODES.STRONG?uid:null,customerId:mode===MODES.STRONG?customerId:null,
        legacyCustomerId:mode===MODES.PHONE?legacyCustomerId:null,phoneHash:mode===MODES.PHONE && phone?hash(phone):null,
        legacyPhone:mode===MODES.PHONE && /^\d{10,11}$/.test(phone || '')?phone:null,
        phoneRecordHash:mode===MODES.PHONE?phoneRecordHash:null};
      tx.set(reference,next);return next;
    });
    return {token:value,mode:data.mode,revision:data.revision};
  }
  async function read(token,storeId,tx=null) {
    const reference=ref(token);
    return validate((await (tx?tx.get(reference):reference.get())).data(),storeId);
  }
  function requireStrong(data,uid,customerId) {
    if(data.mode!==MODES.STRONG || data.ownerUid!==uid || data.customerId!==customerId) fail();
  }
  return {select,read,requireStrong,ref};
}
module.exports={createCheckoutIdentity,MODES};
