const {createHash}=require('node:crypto');
const {cardFeeSecretId}=require('./card-1x-fee-policy');
const invalid=code=>Object.assign(new Error('A credencial exige revisão segura. A configuração anterior foi preservada.'),{credentialCode:code});
function createInfinitePaySecretStore({projectId,client}={}) {
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(projectId||''))throw invalid('INVALID_ENVIRONMENT');
  let sdk=client;
  const getClient=()=>sdk||(sdk=new (require('@google-cloud/secret-manager').SecretManagerServiceClient)());
  const options={timeout:15000,retry:null};
  function resource(storeId){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(storeId||'')||storeId==='__all__')throw invalid('INVALID_STORE');return `projects/${projectId}/secrets/${cardFeeSecretId(storeId)}`;}
  const labels=storeId=>({doceria_component:'infinitepay',doceria_store:createHash('sha256').update(storeId).digest('hex').slice(0,40),doceria_project:projectId});
  async function readText(name){
    if(typeof name!=='string'||!new RegExp('^projects/'+projectId+'/secrets/infinitepay-checkout-[a-f0-9]{20}/versions/[1-9][0-9]*$').test(name))throw invalid('INVALID_SECRET_REFERENCE');
    try{const[v]=await getClient().accessSecretVersion({name},options);const data=v.payload?.data;if(!data||data.length>8192)throw invalid('INVALID_SECRET_PAYLOAD');return data.toString('utf8');}catch{throw invalid('CREDENTIAL_STORAGE_UNAVAILABLE');}
  }
  async function write(storeId,{handle,apiKey},existingBinding){
    const name=resource(storeId),expected=labels(storeId);let metadata;
    try{
      try{[metadata]=await getClient().getSecret({name},options);}catch(e){if(e.code!==5&&e.code!=='NOT_FOUND')throw e;
        try{[metadata]=await getClient().createSecret({parent:`projects/${projectId}`,secretId:cardFeeSecretId(storeId),secret:{replication:{automatic:{}},labels:expected}},options);}catch(e){if(e.code!==6&&e.code!=='ALREADY_EXISTS')throw e;[metadata]=await getClient().getSecret({name},options);}
      }
      if(Object.entries(expected).some(([k,v])=>metadata.labels?.[k]!==v)){
        // Adopt a pre-existing manually managed resource only with an already trusted binding.
        if(existingBinding?.storeId!==storeId||!existingBinding.secretVersion?.startsWith(name+'/versions/'))throw invalid('EXISTING_SECRET_REVIEW_REQUIRED');
        const prior=JSON.parse(await readText(existingBinding.secretVersion));
        if(prior.schemaVersion!==1||prior.storeId!==storeId||prior.handle!==existingBinding.handle)throw invalid('EXISTING_SECRET_REVIEW_REQUIRED');
      }
      const payload=Buffer.from(JSON.stringify({schemaVersion:1,storeId,handle,baselineAssuredInstallments:1,apiKey}),'utf8');
      if(payload.length>8192)throw invalid('INVALID_SECRET_PAYLOAD');
      const[v]=await getClient().addSecretVersion({parent:name,payload:{data:payload}},options);
      const prefix=(metadata.name||name)+'/versions/';
      if(!v.name?.startsWith(prefix)||!/^[1-9][0-9]*$/.test(v.name.slice(prefix.length)))throw invalid('INVALID_SECRET_REFERENCE');
      return name+'/versions/'+v.name.slice(prefix.length);
    }catch(e){throw invalid(e.credentialCode||'CREDENTIAL_STORAGE_UNAVAILABLE');}
  }
  return {write,readText};
}
module.exports={createInfinitePaySecretStore};
