/* global globalThis */
// Public Identity Platform metadata. Only managed score keys in ENFORCE are
// accepted; no downgrade to a v2 challenge, AUDIT or OFF.
async function getSmsEnterpriseProtection(config,fetchImpl=globalThis.fetch) {
  try {
    const response=await fetchImpl(`https://identitytoolkit.googleapis.com/v2/recaptchaConfig?key=${config.apiKey}&clientType=CLIENT_TYPE_WEB&version=RECAPTCHA_ENTERPRISE`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok) return null;
    const data=await response.json(),phone=data.recaptchaEnforcementState?.find(p=>p.provider==='PHONE_PROVIDER');
    const match=/^projects\/[^/]+\/keys\/([\w-]{20,100})$/.exec(data.recaptchaKey || '');
    if(phone?.enforcementState!=='ENFORCE' || data.useSmsBotScore!==true || data.useSmsTollFraudProtection!==true || !match) return null;
    return {siteKey:match[1]};
  } catch {return null;}
}
module.exports={getSmsEnterpriseProtection};
