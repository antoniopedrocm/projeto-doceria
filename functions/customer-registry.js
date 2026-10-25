const {createHash}=require('node:crypto');
const {FieldValue}=require('firebase-admin/firestore');
const {normalizeCustomerPhone}=require('./customer-phone');
const {ownsCustomer,customerOwnerUids}=require('./customer-ownership');
const digest=value=>createHash('sha256').update(value).digest('hex');
const failure=(code,message,status=409)=>Object.assign(new Error(message),{code,httpStatus:status});
const review=()=>failure('CUSTOMER_PHONE_REVIEW','Este cadastro precisa de conferência antes de continuar.');
const validId=value=>typeof value==='string' && /^[a-zA-Z0-9_-]{1,150}$/.test(value);
function createCustomerRegistry({db}) {
  // Existing integrations Rules deny every client read/write, including Staff.
  const root=db.doc('integrations/customerRegistry');
  const phoneRef=phone=>db.doc('integrations/customerRegistry/phones/'+phone.key);
  const aliasRef=id=>db.doc('integrations/customerRegistry/aliases/'+digest(id));
  const uidRef=uid=>db.doc('integrations/customerRegistry/uids/'+digest(uid));
  const identityRef=identity=>db.collection('customerAuthIdentities').doc(digest(identity.provider+':'+identity.sub));
  async function ready(tx) {
    if((await tx.get(root)).data()?.state!=='READY') throw failure('CUSTOMER_REGISTRY_UNAVAILABLE','Cadastro temporariamente indisponível. Tente novamente em instantes.',503);
  }
  async function resolveId(id,tx) {
    if(!validId(id)) throw review();
    const seen=new Set();let current=id;
    for(let depth=0;depth<5;depth++) {
      if(seen.has(current)) throw review();seen.add(current);
      const alias=await (tx?tx.get(aliasRef(current)):aliasRef(current).get()),data=alias.data();
      if(!alias.exists) return current;
      if(data?.state!=='READY' || !validId(data.customerId)) throw review();
      if(data.customerId===current) return current;current=data.customerId;
    }
    throw review();
  }
  async function resolvePhone(value,tx) {
    const phone=normalizeCustomerPhone(value);
    const run=async transaction=>{
      await ready(transaction);const index=await transaction.get(phoneRef(phone));
      if(!index.exists)return {phone,customerId:null,customer:null};
      const data=index.data();if(data.state!=='READY' || data.normalizedPhone!==phone.e164 || !validId(data.customerId)) throw review();
      const ref=db.doc('clientes/'+data.customerId),customer=await transaction.get(ref);
      if(!customer.exists || customer.data().canonicalStatus==='ALIAS') throw review();
      let current;try{current=normalizeCustomerPhone(customer.data().telefone || customer.data().phone_number);}catch{throw review();}
      if(current.e164!==phone.e164) throw review();
      return {phone,customerId:ref.id,customer};
    };
    return tx?run(tx):db.runTransaction(run);
  }
  async function createOrGet({phone:value,data={}}) {
    // Identity/ownership is a separate verified operation, never supplied here.
    if(Object.keys(data).some(k=>['uid','authOwnerUid','authOwnerUids','authIdentities','identityRegistryVersion','canonicalCustomerId','canonicalStatus','legacyCustomerIds'].includes(k))) throw failure('CUSTOMER_IDENTITY_FORBIDDEN','Confira os dados do cadastro.',403);
    const ref=db.collection('clientes').doc();
    return db.runTransaction(async tx=>{
      const existing=await resolvePhone(value,tx);if(existing.customerId)return {...existing,created:false};
      const fields={...data,telefone:existing.phone.national,phone_number:existing.phone.e164,normalizedPhone:existing.phone.e164,
        canonicalStatus:'CANONICAL',identityRegistryVersion:1,legacyCustomerIds:[],criadoEm:FieldValue.serverTimestamp(),atualizadoEm:FieldValue.serverTimestamp()};
      tx.create(ref,fields);tx.create(phoneRef(existing.phone),{state:'READY',normalizedPhone:existing.phone.e164,customerId:ref.id,updatedAt:FieldValue.serverTimestamp()});
      return {phone:existing.phone,customerId:ref.id,created:true};
    });
  }
  function assertPhoneUnchanged(customer,value) {
    if(normalizeCustomerPhone(customer.telefone || customer.phone_number).e164!==normalizeCustomerPhone(value).e164)
      throw failure('CUSTOMER_PHONE_CHANGE_REQUIRES_VERIFICATION','A troca de telefone exige um fluxo de verificação próprio.');
  }
  async function resolveStrongIdentity(identity) {
    const [mapping,uid]=await db.getAll(identityRef(identity),uidRef(identity.user.uid));
    if((mapping.exists && mapping.data().uid && mapping.data().uid!==identity.user.uid) || (uid.exists && uid.data().uid!==identity.user.uid))throw review();
    const ids=[...new Set([mapping.data()?.customerId,uid.data()?.customerId].filter(Boolean))];
    const resolved=await Promise.all(ids.map(id=>resolveId(id)));if(new Set(resolved).size>1)throw review();
    return {...identity,customerId:resolved[0] || null};
  }
  async function couponState(customerId,tx) {
    const read=ref=>tx?tx.get(ref):ref.get(),customer=await read(db.doc('clientes/'+customerId));
    if(!customer.exists || customer.data().canonicalStatus==='ALIAS')throw review();const data=customer.data();
    const aliases=data.identityRegistryVersion===1 && Array.isArray(data.legacyCustomerIds)?data.legacyCustomerIds:[];
    if(aliases.length>29 || aliases.some(id=>!validId(id) || id===customerId))throw review();
    const snapshots=await Promise.all(aliases.map(id=>read(db.doc('clientes/'+id))));
    if(snapshots.some(s=>!s.exists || s.data().canonicalStatus!=='ALIAS' || s.data().canonicalCustomerId!==customerId))throw review();
    const rows=[data,...snapshots.map(s=>s.data())],values=field=>[...new Set(rows.flatMap(row=>Array.isArray(row[field])?row[field].filter(v=>typeof v==='string'):[]))];
    return {used:values('cuponsUsados'),reserved:values('cuponsReservados')};
  }
  async function createForStrong({identity,phone:value,nome}) {
    // identity must come from the existing Admin-verified Google/password gate.
    if(!identity?.user?.uid || !['google','email_password'].includes(identity.provider) || typeof identity.sub!=='string')throw review();
    const phone=normalizeCustomerPhone(value),ref=db.collection('clientes').doc();
    return db.runTransaction(async tx=>{
      const [mapping,uid]=await tx.getAll(identityRef(identity),uidRef(identity.user.uid));
      if((mapping.exists && mapping.data().uid && mapping.data().uid!==identity.user.uid) || (uid.exists && uid.data().uid!==identity.user.uid))throw review();
      const mapped=[...new Set([mapping.data()?.customerId,uid.data()?.customerId].filter(Boolean))];
      let customerId;
      if(mapped.length) {
        const ids=await Promise.all(mapped.map(id=>resolveId(id,tx)));if(new Set(ids).size!==1)throw review();
        customerId=ids[0];const customer=await tx.get(db.doc('clientes/'+customerId));
        if(!customer.exists || !ownsCustomer(customer.data(),identity.user.uid))throw review();assertPhoneUnchanged(customer.data(),value);
      } else {
        const existing=await resolvePhone(value,tx);
        if(existing.customerId && !ownsCustomer(existing.customer.data(),identity.user.uid))
          return {claimRequired:true,identityReviewRequired:customerOwnerUids(existing.customer.data()).length>0,phoneMasked:'••••'+phone.national.slice(-4)};
        customerId=existing.customerId || ref.id;
        if(!existing.customerId) {
          tx.create(ref,{nome,telefone:phone.national,phone_number:phone.e164,normalizedPhone:phone.e164,authOwnerUid:identity.user.uid,authOwnerUids:[identity.user.uid],
            phone_verified_at:null,phoneOwnership:'UNVERIFIED',canonicalStatus:'CANONICAL',identityRegistryVersion:1,legacyCustomerIds:[],enderecos:[],criadoEm:FieldValue.serverTimestamp(),atualizadoEm:FieldValue.serverTimestamp()});
          tx.create(phoneRef(phone),{state:'READY',normalizedPhone:phone.e164,customerId,updatedAt:FieldValue.serverTimestamp()});
        }
      }
      tx.set(identityRef(identity),{provider:identity.provider,subject:identity.sub,customerId,uid:identity.user.uid,updatedAt:FieldValue.serverTimestamp()});
      tx.set(uidRef(identity.user.uid),{uid:identity.user.uid,customerId,updatedAt:FieldValue.serverTimestamp()});
      return {customerId,claimRequired:false};
    });
  }
  async function attachVerifiedClaim({identity,phone,challengeRef,nonce,now}) {
    return db.runTransaction(async tx=>{
      const [challenge,mapping,uid]=await tx.getAll(challengeRef,identityRef(identity),uidRef(identity.user.uid));
      const d=challenge.data(),existing=await resolvePhone(phone,tx);
      if(!d || d.purpose!=='CUSTOMER_IDENTITY_CLAIM' || d.uid!==identity.user.uid || d.provider!==identity.provider || d.subject!==identity.sub ||
        d.status!=='verifying' || d.nonce!==nonce || d.expiresAt<=now || d.phoneKey!==existing.phone.key || d.customerId!==existing.customerId) throw review();
      if((mapping.exists && mapping.data().customerId!==existing.customerId) || (uid.exists && uid.data().customerId!==existing.customerId)) throw review();
      const owners=customerOwnerUids(existing.customer.data());
      if(owners.some(owner=>owner!==identity.user.uid))throw review();
      tx.update(existing.customer.ref,{authOwnerUid:identity.user.uid,authOwnerUids:[identity.user.uid],identityRegistryVersion:1,
        phoneOwnership:'VERIFIED',phone_verified_at:FieldValue.serverTimestamp(),atualizadoEm:FieldValue.serverTimestamp()});
      tx.set(identityRef(identity),{provider:identity.provider,subject:identity.sub,customerId:existing.customerId,uid:identity.user.uid,updatedAt:FieldValue.serverTimestamp()});
      tx.set(uidRef(identity.user.uid),{uid:identity.user.uid,customerId:existing.customerId,updatedAt:FieldValue.serverTimestamp()});
      tx.update(challengeRef,{status:'consumed',proof:null,consumedAt:now});
      tx.create(db.collection('integrations/customerRegistry/audit').doc(),{action:'identity_claim_verified',customerId:existing.customerId,uid:identity.user.uid,phoneKey:existing.phone.key,at:now});
      return {customerId:existing.customerId};
    });
  }
  return {resolvePhone,resolveId,createOrGet,createForStrong,resolveStrongIdentity,couponState,attachVerifiedClaim,assertPhoneUnchanged,phoneRef,aliasRef,uidRef,identityRef};
}
module.exports={createCustomerRegistry};
