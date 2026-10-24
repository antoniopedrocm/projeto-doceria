const {test}=require('node:test'),assert=require('node:assert/strict');
const {getSmsEnterpriseProtection}=require('./recaptcha-enterprise');
const config={apiKey:'fixture-key'},valid={recaptchaKey:'projects/fixture/keys/managed-score-fixture-key',recaptchaEnforcementState:[{provider:'PHONE_PROVIDER',enforcementState:'ENFORCE'}],useSmsBotScore:true,useSmsTollFraudProtection:true};
test('somente chave gerenciada/ENFORCE com bot e toll fraud ativos é anunciada; sem scores/thresholds',async()=>{
  let request;const result=await getSmsEnterpriseProtection(config,async(url,options)=>{request={url,options};return {ok:true,json:async()=>valid};});
  assert.deepEqual(result,{siteKey:'managed-score-fixture-key'});assert.match(request.url,/clientType=CLIENT_TYPE_WEB&version=RECAPTCHA_ENTERPRISE/);assert.equal(request.options.method,'GET');
});
test('OFF/AUDIT, configuração inválida ou sem proteções falham fechado e não fazem fallback',async()=>{
  for(const data of [{...valid,recaptchaEnforcementState:[{provider:'PHONE_PROVIDER',enforcementState:'OFF'}]},{...valid,recaptchaEnforcementState:[{provider:'PHONE_PROVIDER',enforcementState:'AUDIT'}]},{...valid,useSmsBotScore:false},{...valid,useSmsTollFraudProtection:false},{...valid,recaptchaKey:''},{}])assert.equal(await getSmsEnterpriseProtection(config,async()=>({ok:true,json:async()=>data})),null);
  assert.equal(await getSmsEnterpriseProtection(config,async()=>({ok:false,json:async()=>valid})),null);assert.equal(await getSmsEnterpriseProtection(config,async()=>{throw Error('offline');}),null);
});
