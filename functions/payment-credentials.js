const {createHash}=require('node:crypto');
const {FieldValue}=require('firebase-admin/firestore');
const {createCardFeeCredentials}=require('./card-1x-fee-credentials');
const {InfinitePayProvider,validateCheckoutUrl}=require('./checkout-payment');
const {credentialPortalStatus}=require('./payment-credential-status');
const sha=s=>createHash('sha256').update(s).digest('hex');
function createPaymentCredentials({db,HttpsError,authorizeRequest,authorizeTransaction,secretStore,projectId,provider=new InfinitePayProvider(),now=Date.now}) {
 const fail=(code,message)=>{throw new HttpsError(code,message);};
 const featureRef=db.doc('integrations/paymentCredentialManagement');
 const configRef=storeId=>db.doc(`lojas/${storeId}/configuracoesInternas/infinitepay`);
 const opRef=id=>db.doc('integrations/paymentCredentialOperations/requests/'+id);
 const timestamp=()=>FieldValue.serverTimestamp();
 const credentialReader=createCardFeeCredentials({projectId,readSecret:name=>secretStore.readText(name)});
 const baseFields=['storeId','handle','apiKey','requestId','expectedVersion','expectedHandle','confirmChange','confirmation','confirmPolicy','confirmValidationLinks'];
 async function enabled(tx){const f=(await tx.get(featureRef)).data();if(f?.enabled!==true||f.controlsVersion!==1||f.projectId!==projectId)fail('failed-precondition','O gerenciamento seguro de credenciais ainda não está habilitado neste ambiente.');return f;}
 function audit(tx,id,action,actor,storeId,changes){tx.create(db.collection('auditLogs').doc(id),{action,source:'INFINITEPAY_CREDENTIAL_PORTAL',storeId,paymentSettingsStoreId:storeId,actor,changes,timestamp:timestamp()});}
 async function scope(tx,uid,storeId){await enabled(tx);return authorizeTransaction(tx,uid,storeId);}
 async function save(request){
  const actor=await authorizeRequest(request),d=request.data||{},storeId=d.storeId,ref=configRef(storeId);
  if(Object.keys(d).some(k=>!baseFields.includes(k))||! /^[a-zA-Z0-9_-]{16,80}$/.test(d.requestId||'')||! /^[a-zA-Z0-9_-]{2,80}$/.test(d.handle||'')||typeof d.apiKey!=='string'||! /^inchk_[!-~]{8,1024}$/.test(d.apiKey)||!Number.isSafeInteger(d.expectedVersion)||d.expectedVersion<0||typeof d.expectedHandle!=='string')fail('invalid-argument','Informe uma InfiniteTag e uma API Key válidas para esta loja.');
  if(d.confirmPolicy!==true||d.confirmValidationLinks!==true)fail('invalid-argument','Confirme a política de 1x e a geração dos links de validação sem pagamento.');
  const id=sha(storeId+':'+actor.uid+':'+d.requestId),operationRef=opRef(id),fingerprint=sha(JSON.stringify([actor.uid,storeId,d.handle,d.expectedVersion,d.expectedHandle,sha(d.apiKey)]));
  const initial=await db.runTransaction(async tx=>{
   const currentActor=await scope(tx,actor.uid,storeId);const [config,prior]=await Promise.all([tx.get(ref),tx.get(operationRef)]),c=config.data()||{},previous=prior.data();
   if(previous){if(previous.fingerprint!==fingerprint)fail('already-exists','O identificador já foi usado em outra configuração.');return{duplicate:true,config:c,operation:previous};}
   if(d.expectedVersion!==(c.version||0)||d.expectedHandle!==(c.handle||''))fail('aborted','A configuração mudou. Recarregue antes de salvar.');
   if(c.handle&&c.handle!==d.handle&&(d.confirmChange!==true||(c.enabled&&d.confirmation!=='ALTERAR')))fail('failed-precondition','Confirme explicitamente a alteração da conta de recebimento.');
   if(['STORING','VALIDATING'].includes(c.card1xCredentialCandidate?.state))fail('failed-precondition','Já existe uma configuração de credencial em andamento. Consulte o estado antes de repetir.');
   const window=c.credentialAttemptWindow,same=window&&now()-window.since<3600000;
   if(same&&(window.count>=5||now()-window.last<60000))fail('resource-exhausted','Aguarde antes de iniciar outra configuração de credencial.');
   const candidate={operationId:id,state:'STORING',handle:d.handle,updatedAt:timestamp(),actorUid:actor.uid};
   tx.set(ref,{card1xCredentialCandidate:candidate,credentialAttemptWindow:{since:same?window.since:now(),last:now(),count:(same?window.count:0)+1}},{merge:true});
   tx.create(operationRef,{schemaVersion:1,storeId,actorUid:actor.uid,fingerprint,state:'STORING',handle:d.handle,previousHandle:c.handle||'',startedAt:timestamp(),links:{}});
   audit(tx,id+'-started','INFINITEPAY_CREDENTIAL_CONFIG_STARTED',currentActor,storeId,[{field:'credentialStatus',before:c.card1xCredentialCandidate?.state||null,after:'STORING'}]);
   return {duplicate:false,existingBinding:c.card1xFeeBinding};
  });
  if(initial.duplicate)return {saved:true,duplicate:true,...credentialPortalStatus(initial.config,initial.operation,{enabled:true,controlsVersion:1,projectId},projectId,now())};
  let secretVersion;
  try{
   secretVersion=await secretStore.write(storeId,{handle:d.handle,apiKey:d.apiKey},initial.existingBinding);
   await db.runTransaction(async tx=>{
    const a=await scope(tx,actor.uid,storeId);const c=(await tx.get(ref)).data()||{};if(c.card1xCredentialCandidate?.operationId!==id)fail('aborted','A configuração de credencial mudou.');
    tx.set(ref,{card1xCredentialCandidate:{...c.card1xCredentialCandidate,state:'VALIDATING',secretVersion,updatedAt:timestamp()}},{merge:true});
    tx.update(operationRef,{state:'VALIDATING',secretVersion,updatedAt:timestamp()});
    audit(tx,id+'-stored','INFINITEPAY_CREDENTIAL_VERSION_STORED',a,storeId,[{field:'credentialVersion',before:null,after:secretVersion}]);
   });
   for(const mode of ['STORE','CUSTOMER']){
    const assuredInstallments=mode==='STORE'?1:0,expiresAt=now()+3600000;
    const snapshot={schemaVersion:1,storeId,handle:d.handle,payer:mode,baselineAssuredInstallments:1,assuredInstallments,secretVersion};
    const credential=await credentialReader(snapshot,{storeId,handle:d.handle});
    await db.runTransaction(async tx=>{await scope(tx,actor.uid,storeId);const operation=(await tx.get(operationRef)).data();if(operation.state!=='VALIDATING'||operation.links?.[mode])fail('failed-precondition','A tentativa de validação já foi iniciada; não gere outro link.');tx.update(operationRef,{['links.'+mode]:{state:'REQUEST_STARTED',assuredInstallments,amountCents:100,expiresAt}});});
    const payload={handle:d.handle,order_nsu:'credential-validation-'+id+'-'+mode.toLowerCase(),items:[{quantity:1,price:100,description:`Validacao ${storeId} ${mode} - NAO PAGAR`}],redirect_url:`https://${projectId}.web.app/?public=1`,options:{...credential.options,single_payment:true,require_delivery_address:false,valid_until:new Date(expiresAt).toISOString()}};
    const result=await provider.create(payload,{apiKey:credential.apiKey}),url=validateCheckoutUrl(result.url);
    await db.runTransaction(async tx=>{const a=await scope(tx,actor.uid,storeId);const operation=(await tx.get(operationRef)).data();if(operation.state!=='VALIDATING'||operation.links?.[mode]?.state!=='REQUEST_STARTED')fail('aborted','A validação mudou em outra sessão.');tx.update(operationRef,{['links.'+mode]:{state:'READY',url,assuredInstallments,amountCents:100,expiresAt,acceptedAt:timestamp()}});audit(tx,id+'-'+mode,'INFINITEPAY_CREDENTIAL_LINK_VALIDATED',a,storeId,[{field:'nativeFeePolicy',before:null,after:{mode,assuredInstallments,amountCents:100}}]);});
   }
   return await db.runTransaction(async tx=>{const a=await scope(tx,actor.uid,storeId);const [cSnap,oSnap]=await Promise.all([tx.get(ref),tx.get(operationRef)]),c=cSnap.data()||{},o=oSnap.data();if(c.card1xCredentialCandidate?.operationId!==id||o.state!=='VALIDATING'||!['STORE','CUSTOMER'].every(m=>o.links?.[m]?.state==='READY'))fail('aborted','A validação está incompleta.');const candidate={...c.card1xCredentialCandidate,state:'PENDING_REVIEW',updatedAt:timestamp()};tx.set(ref,{card1xCredentialCandidate:candidate},{merge:true});tx.update(operationRef,{state:'PENDING_REVIEW',updatedAt:timestamp()});audit(tx,id+'-ready','INFINITEPAY_CREDENTIAL_PENDING_REVIEW',a,storeId,[{field:'credentialStatus',before:'VALIDATING',after:'PENDING_REVIEW'}]);return{saved:true,...credentialPortalStatus({...c,card1xCredentialCandidate:candidate},{...o,state:'PENDING_REVIEW'},{enabled:true,controlsVersion:1,projectId},projectId,now())};});
  }catch(error){
   const failureCode=error.credentialCode||([401,403].includes(error.providerStatus)?'PROVIDER_CREDENTIAL_REJECTED':'CREDENTIAL_VALIDATION_INCOMPLETE');
   try{await db.runTransaction(async tx=>{const[cSnap,oSnap]=await Promise.all([tx.get(ref),tx.get(operationRef)]),c=cSnap.data()||{},o=oSnap.data();if(!o||!['STORING','VALIDATING'].includes(o.state))return;tx.update(operationRef,{state:'REVIEW_REQUIRED',failureCode,updatedAt:timestamp()});if(c.card1xCredentialCandidate?.operationId===id)tx.set(ref,{card1xCredentialCandidate:{...c.card1xCredentialCandidate,state:'REVIEW_REQUIRED',...(secretVersion?{secretVersion}:{}),failureCode,updatedAt:timestamp()}},{merge:true});audit(tx,id+'-failed','INFINITEPAY_CREDENTIAL_VALIDATION_FAILED',actor,storeId,[{field:'credentialStatus',before:o.state,after:'REVIEW_REQUIRED'},{field:'failureCode',before:null,after:failureCode}]);});}catch{/* Never expose an upstream error, request, payload or credential. */}
   fail('failed-precondition',failureCode==='PROVIDER_CREDENTIAL_REJECTED'?'A InfinitePay recusou a credencial ou sua correspondência com a conta. A credencial anterior foi preservada.':'Não foi possível concluir a validação segura. Consulte o estado antes de repetir. A credencial anterior foi preservada.');
  }
 }
 async function activate(request){
  const actor=await authorizeRequest(request),d=request.data||{};
  if(Object.keys(d).some(k=>!['storeId','operationId','expectedVersion','expectedHandle','confirmedReview','reviewedModes','confirmation'].includes(k))||! /^[a-f0-9]{64}$/.test(d.operationId||'')||d.confirmedReview!==true||!Array.isArray(d.reviewedModes)||d.reviewedModes.length!==2||!['STORE','CUSTOMER'].every(m=>d.reviewedModes.includes(m)))fail('invalid-argument','Confirme a revisão dos dois links, sem realizar pagamento.');
  const ref=configRef(d.storeId),operationRef=opRef(d.operationId);
  return db.runTransaction(async tx=>{
   const a=await scope(tx,actor.uid,d.storeId),[cSnap,oSnap]=await Promise.all([tx.get(ref),tx.get(operationRef)]),c=cSnap.data()||{},o=oSnap.data(),candidate=c.card1xCredentialCandidate;
   if(!o||o.storeId!==d.storeId||candidate?.operationId!==d.operationId)fail('not-found','Validação desta loja não encontrada.');
   if(o.state==='ACTIVE'&&c.card1xFeeBinding?.secretVersion===o.secretVersion)return{activated:true,duplicate:true,version:c.version||0};
   if(o.state!=='PENDING_REVIEW'||candidate.state!=='PENDING_REVIEW'||!['STORE','CUSTOMER'].every(m=>o.links?.[m]?.state==='READY'&&o.links[m].expiresAt>now()&&o.links[m].assuredInstallments===(m==='STORE'?1:0)))fail('failed-precondition','Os dois links precisam estar validados e disponíveis para revisão.');
   if(d.expectedVersion!==(c.version||0)||d.expectedHandle!==(c.handle||'')||o.previousHandle!==(c.handle||''))fail('aborted','A configuração mudou. Recarregue antes de ativar.');
   if(c.handle&&c.handle!==o.handle&&d.confirmation!=='ALTERAR')fail('failed-precondition','Confirme explicitamente a nova conta de recebimento.');
   const binding={schemaVersion:1,enabled:true,storeId:d.storeId,handle:o.handle,baselineAssuredInstallments:1,secretVersion:o.secretVersion,validation:{schemaVersion:1,state:'VERIFIED_NO_PAYMENT',storeId:d.storeId,handle:o.handle,secretVersion:o.secretVersion,assuredInstallments:[0,1],operationId:d.operationId,reviewedBy:actor.uid,reviewedAt:timestamp()}};
   const version=(c.version||0)+1;
   tx.set(ref,{handle:o.handle,card1xFeePayer:['STORE','CUSTOMER'].includes(c.card1xFeePayer)?c.card1xFeePayer:'STORE',card1xFeeBinding:binding,card1xCredentialCandidate:{...candidate,state:'ACTIVE',updatedAt:timestamp()},version,updatedAt:timestamp(),updatedBy:a},{merge:true});
   tx.update(operationRef,{state:'ACTIVE',activatedBy:a.uid,activatedAt:timestamp()});
   audit(tx,d.operationId+'-active','INFINITEPAY_CREDENTIAL_ACTIVATED',a,d.storeId,[{field:'handle',before:c.handle||'',after:o.handle},{field:'credentialVersion',before:c.card1xFeeBinding?.secretVersion||null,after:o.secretVersion},{field:'credentialStatus',before:'PENDING_REVIEW',after:'ACTIVE'}]);
   return {activated:true,version};
  });
 }
 return{save,activate};
}
module.exports={createPaymentCredentials};
