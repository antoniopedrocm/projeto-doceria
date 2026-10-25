const {randomBytes,randomUUID,createHash}=require('node:crypto');
const {HttpsError}=require('firebase-functions/v2/https');
const {customerOwnerUids}=require('./customer-ownership');
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
const fail=(code,message)=>{throw new HttpsError(code,message);};
// Separate proof purpose. Address/profile grants never establish permanent ownership.
function createCustomerPhoneClaim({db,accounts,provider,now=Date.now}) {
  const root='integrations/customerIdentityClaims',challenges=db.collection(root+'/challenges');
  async function scope(request) {
    const identity=await accounts.identity(request),storeId=request.data?.storeId;
    if(typeof storeId!=='string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(storeId) || !(await db.doc('lojas/'+storeId).get()).exists)fail('invalid-argument','Selecione uma loja válida.');
    const existing=await accounts.registry.resolvePhone(request.data?.phone);
    if(!existing.customerId || customerOwnerUids(existing.customer.data()).some(uid=>uid!==identity.user.uid))fail('failed-precondition','Este cadastro precisa de conferência para vincular outra conta.');
    if(existing.phone.type!=='mobile')fail('failed-precondition','Este telefone exige conferência para vincular uma conta.');
    return {identity,existing,storeId};
  }
  async function status(request) {
    const s=await scope(request),{channels,policy}=await provider.load(s.storeId,s.existing.phone.e164);
    if(!channels.sms)fail('unavailable','A verificação não está disponível agora. Tente novamente mais tarde.');
    return {phoneMasked:'••••'+s.existing.phone.national.slice(-4),resendSeconds:policy.resendMs/1000,
      projectId:channels.sms.projectId,enterpriseSiteKey:channels.sms.enterpriseSiteKey};
  }
  async function start(request) {
    const s=await scope(request),{channels,policy}=await provider.load(s.storeId,s.existing.phone.e164),config=channels.sms;
    if(!config)fail('unavailable','Não foi possível enviar o código agora. Tente novamente mais tarde.');
    const ip=String(request.rawRequest?.ip || 'unknown'),id=randomBytes(32).toString('hex'),ref=challenges.doc(id);
    // Same counters as address OTP: switching purposes cannot double the SMS budget.
    const limits=db.collection('integrations/addressVerification/limits');
    await db.runTransaction(async tx=>{
      const counters=[['phone:'+hash(s.existing.phone.national),3600000,policy.phoneHourly],['ip:'+hash(ip),3600000,policy.ipHourly],['global',86400000,policy.globalDaily]];
      const snapshots=await Promise.all(counters.map(([key])=>tx.get(limits.doc(hash(key)))));
      if(snapshots[0].data()?.lastSentAt>now()-policy.resendMs)fail('resource-exhausted','Você solicitou códigos recentemente. Aguarde antes de tentar novamente.');
      snapshots.forEach((snap,i)=>{const d=snap.data();if(d && now()-d.windowAt<counters[i][1] && d.count>=counters[i][2])fail('resource-exhausted','Muitas tentativas. Aguarde alguns minutos.');});
      const current=await accounts.registry.resolvePhone(s.existing.phone.e164,tx);
      if(current.customerId!==s.existing.customerId || customerOwnerUids(current.customer.data()).some(uid=>uid!==s.identity.user.uid))fail('failed-precondition','Confira novamente a identificação.');
      snapshots.forEach((snap,i)=>{const d=snap.data(),same=d && now()-d.windowAt<counters[i][1];tx.set(snap.ref,{windowAt:same?d.windowAt:now(),count:(same?d.count:0)+1,lastSentAt:now()});});
      tx.create(ref,{purpose:'CUSTOMER_IDENTITY_CLAIM',uid:s.identity.user.uid,provider:s.identity.provider,subject:s.identity.sub,
        customerId:current.customerId,phoneKey:current.phone.key,storeId:s.storeId,status:'sending',createdAt:now(),expiresAt:now()+policy.otpMs,maxAttempts:policy.maxAttempts,attempts:0});
    });
    let proof;
    try {proof=await provider.start({channel:'sms',config,phone:s.existing.phone.e164,recaptchaToken:request.data?.recaptchaToken,challengeId:id});}
    catch {await ref.update({status:'failed'});fail('unavailable','Não foi possível enviar o código agora. Tente novamente em alguns instantes.');}
    await ref.update({proof,status:'sent'});
    return {challengeId:id,phoneMasked:'••••'+s.existing.phone.national.slice(-4),expiresAt:now()+policy.otpMs,resendAt:now()+policy.resendMs};
  }
  async function confirm(request) {
    const s=await scope(request),id=request.data?.challengeId;
    if(!/^[a-f0-9]{64}$/.test(id || ''))fail('permission-denied','Solicite um novo código.');
    const ref=challenges.doc(id),nonce=randomUUID();
    const d=await db.runTransaction(async tx=>{
      const value=(await tx.get(ref)).data();
      if(!value || value.purpose!=='CUSTOMER_IDENTITY_CLAIM' || value.customerId!==s.existing.customerId || value.phoneKey!==s.existing.phone.key || value.uid!==s.identity.user.uid || value.provider!==s.identity.provider || value.subject!==s.identity.sub || value.storeId!==s.storeId || value.expiresAt<=now() || !['sent','verifying'].includes(value.status))fail('permission-denied','Código expirado ou indisponível. Solicite um novo.');
      if(value.attempts>=value.maxAttempts || (value.status==='verifying' && value.leaseUntil>now()))fail('resource-exhausted','Muitas tentativas. Aguarde alguns minutos.');
      tx.update(ref,{status:'verifying',nonce,attempts:value.attempts+1,leaseUntil:now()+20000});return value;
    });
    let valid=false;
    try {
      const {channels}=await provider.load(s.storeId,s.existing.phone.e164);
      if(channels.sms && /^\d{6}$/.test(request.data?.code || ''))valid=await provider.verify({channel:'sms',config:channels.sms,phone:s.existing.phone.e164,proof:d.proof,code:request.data.code,challengeId:id});
    } catch { /* A failed provider check never grants ownership. */ }
    if(!valid){await db.runTransaction(async tx=>{if((await tx.get(ref)).data()?.nonce===nonce)tx.update(ref,{status:d.attempts+1>=d.maxAttempts?'locked':'sent'});});fail('permission-denied','Não foi possível confirmar o código. Confira e tente novamente.');}
    await accounts.registry.attachVerifiedClaim({identity:s.identity,phone:s.existing.phone.e164,challengeRef:ref,nonce,now:now()});
    return accounts.account(request);
  }
  const boundary=fn=>async request=>{try{return await fn(request);}catch(e){if(e instanceof HttpsError)throw e;if(e.httpStatus)fail(e.httpStatus===503?'unavailable':e.httpStatus===400?'invalid-argument':'failed-precondition',e.message);fail('internal','Não foi possível concluir a identificação agora. Tente novamente.');}};
  return {status:boundary(status),start:boundary(start),confirm:boundary(confirm)};
}
module.exports={createCustomerPhoneClaim};
