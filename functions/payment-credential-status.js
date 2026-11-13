function credentialPortalStatus(config={},operation={},feature={},projectId,now=Date.now()) {
 const available=feature.enabled===true&&feature.controlsVersion===1&&feature.projectId===projectId;
 const c=config.card1xCredentialCandidate,b=config.card1xFeeBinding;
 const state=c?.state||(b?.enabled?'CONFIGURED_PENDING_VALIDATION':'NOT_CONFIGURED');
 return {available,state,configured:!!(c?.secretVersion||b?.secretVersion),active:!!b?.enabled,
   candidateHandle:c?.handle||null,operationId:c?.operationId||null,lastFailureCode:c?.failureCode||null,
   versionNumber:(c?.secretVersion||b?.secretVersion||'').split('/versions/')[1]||null,
   links:available&&state==='PENDING_REVIEW'?['STORE','CUSTOMER'].flatMap(mode=>{
     const l=operation.links?.[mode];return l?.state==='READY'?[{mode,url:l.url,amountCents:100,assuredInstallments:mode==='STORE'?1:0,expiresAt:l.expiresAt,expired:l.expiresAt<=now}]:[];
   }):[]};
}
module.exports={credentialPortalStatus};
