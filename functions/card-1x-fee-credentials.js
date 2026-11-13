const {resolveCard1xInstallments,cardFeeSecretId:secretId}=require('./card-1x-fee-policy');
const failure=()=>Object.assign(new Error('A configuração segura de taxas desta loja está pendente. Nenhuma cobrança foi iniciada.'),{httpStatus:503,code:'CARD_FEE_CONFIGURATION_REQUIRED'});
function createCardFeeCredentials({projectId,readSecret}={}) {
  let client;
  const read=readSecret|| (async name=>{
    const {SecretManagerServiceClient}=require('@google-cloud/secret-manager');client=client||new SecretManagerServiceClient();
    const [version]=await client.accessSecretVersion({name},{timeout:10000,retry:null});const bytes=version.payload?.data;
    if(!bytes||bytes.length>8192)throw failure();return bytes.toString('utf8');
  });
  return async(snapshot,{storeId,handle})=>{
    try{
      if(!projectId||snapshot.schemaVersion!==1||snapshot.storeId!==storeId||snapshot.handle!==handle)throw failure();
      const prefix=`projects/${projectId}/secrets/${secretId(storeId)}/versions/`;
      if(!snapshot.secretVersion?.startsWith(prefix)||!/^[1-9]\d*$/.test(snapshot.secretVersion.slice(prefix.length)))throw failure();
      const raw=await read(snapshot.secretVersion);if(typeof raw!=='string'||Buffer.byteLength(raw)>8192)throw failure();
      const secret=JSON.parse(raw);
      if(secret.schemaVersion!==1||secret.storeId!==storeId||secret.handle!==handle||secret.baselineAssuredInstallments!==snapshot.baselineAssuredInstallments||typeof secret.apiKey!=='string'||!/^inchk_[!-~]{8,1024}$/.test(secret.apiKey))throw failure();
      const assuredInstallments=resolveCard1xInstallments(snapshot.payer,secret.baselineAssuredInstallments);
      if(assuredInstallments!==snapshot.assuredInstallments)throw failure();
      return {apiKey:secret.apiKey,options:{assured_installments:assuredInstallments}};
    }catch{throw failure();} // Never propagate a secret, upstream body or credential exception.
  };
}
module.exports={createCardFeeCredentials,secretId};
