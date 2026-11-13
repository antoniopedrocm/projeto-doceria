// Native fee policy. Never infer the merchant's current installment threshold.
const {HttpsError}=require('firebase-functions/v2/https');
const {createHash}=require('node:crypto');
const STORE='STORE',CUSTOMER='CUSTOMER';
const cardFeeSecretId=storeId=>'infinitepay-checkout-'+createHash('sha256').update(storeId).digest('hex').slice(0,20);
function card1xFeePayer(config) {
  return [STORE,CUSTOMER].includes(config?.card1xFeePayer)?config.card1xFeePayer:STORE;
}
function resolveCard1xInstallments(payer,baseline) {
  if(![STORE,CUSTOMER].includes(payer)||!Number.isInteger(baseline)||baseline<0||baseline>12)throw new HttpsError('failed-precondition','Confirme a política atual de parcelamento da conta InfinitePay antes de aplicar a preferência.');
  if(payer===CUSTOMER&&baseline>1)throw new HttpsError('failed-precondition','Repassar a taxa em 1x também alteraria parcelas de 2x ou mais. A política vigente exige decisão específica do Dono.');
  return payer===STORE?Math.max(1,baseline):0;
}
function card1xSnapshot(config,storeId,projectId) {
  const b=config?.card1xFeeBinding;if(b?.enabled!==true)return null;
  if(b.schemaVersion!==1||b.storeId!==storeId||b.handle!==config.handle||typeof b.secretVersion!=='string')throw new HttpsError('failed-precondition','O vínculo seguro de taxas não corresponde à loja e à conta de recebimento.');
  const match=/^projects\/([a-z0-9-]+)\/secrets\/([^/]+)\/versions\/([1-9]\d*)$/.exec(b.secretVersion);
  if(!match||match[2]!==cardFeeSecretId(storeId)||(projectId&&match[1]!==projectId))throw new HttpsError('failed-precondition','A referência segura da credencial não corresponde ao ambiente e à loja.');
  for(const known of [config.options?.assured_installments,config.assured_installments])if(Number.isInteger(known)&&known>=0&&known<=12&&known!==b.baselineAssuredInstallments)throw new HttpsError('failed-precondition','A política confirmada diverge da configuração existente. Revise antes de aplicar.');
  const payer=card1xFeePayer(config),assuredInstallments=resolveCard1xInstallments(payer,b.baselineAssuredInstallments);
  return {schemaVersion:1,storeId,handle:b.handle,payer,baselineAssuredInstallments:b.baselineAssuredInstallments,assuredInstallments,secretVersion:b.secretVersion};
}
function validateCard1xPreference(config,previous,{storeId,projectId}={}) {
  const value=Object.hasOwn(config,'card1xFeePayer')?config.card1xFeePayer:card1xFeePayer(previous);
  if (![STORE,CUSTOMER].includes(value)) throw new HttpsError('invalid-argument','Preferência de taxa do cartão em 1x inválida.');
  // Preserve an existing valid preference, but never silently activate new pass-through.
  if (value===CUSTOMER && card1xFeePayer(previous)!==CUSTOMER && !card1xFeeStatus({...previous,handle:config.handle||previous?.handle},storeId,projectId).customerPassThroughAvailable) {
    throw new HttpsError('failed-precondition','Repasse da taxa em 1x ainda indisponível nesta integração. É necessário validar a configuração da InfinitePay e preservar a regra de 2x ou mais.');
  }
  return value;
}
function card1xFeeStatus(config,storeId,projectId) {
  let prepared=null,reason='CREDENTIAL_AND_MERCHANT_POLICY_REQUIRED';
  try{prepared=card1xSnapshot(config,storeId,projectId);if(prepared)reason='REAL_CHECKOUT_VALIDATION_REQUIRED';}catch{reason='MERCHANT_POLICY_OR_BINDING_INCOMPATIBLE';}
  const b=config?.card1xFeeBinding;
  const v=b?.validation,verified=!!prepared&&b.baselineAssuredInstallments<=1&&v?.schemaVersion===1&&v.state==='VERIFIED_NO_PAYMENT'&&v.storeId===storeId&&v.handle===b.handle&&v.secretVersion===b.secretVersion&&Array.isArray(v.assuredInstallments)&&v.assuredInstallments.length===2&&v.assuredInstallments.includes(0)&&v.assuredInstallments.includes(1);
  return {payer:card1xFeePayer(config),application:verified?'LINK_POLICY_VERIFIED_NO_PAYMENT':prepared?'PREPARED_NOT_HOMOLOGATED':'PENDING_PROVIDER_VALIDATION',reason:verified?'NATIVE_LINK_POLICY_ACTIVATED':reason,
    baselineAssuredInstallments:prepared?.baselineAssuredInstallments??null,
    customerPassThroughAvailable:verified&&b.baselineAssuredInstallments<=1};
}
module.exports={STORE,CUSTOMER,card1xFeePayer,validateCard1xPreference,card1xFeeStatus,card1xSnapshot,resolveCard1xInstallments,cardFeeSecretId};
