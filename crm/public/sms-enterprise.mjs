const friendly=()=>new Error('Não foi possível enviar o código agora. Aguarde um momento e tente novamente.');
// Official score-key JS integration. No Firebase sign-in, verifier widget,
// render(), token cache, fallback challenge or CAPTCHA iframe manipulation.
export function createEnterpriseSmsVerifier({document,window,mainProjectId,timeoutMs=20000}) {
  const scripts=new Map();let sequence=0;
  function bounded(operation) {
    let timer;
    return Promise.race([operation,new Promise((_,reject)=>{timer=window.setTimeout(()=>reject(friendly()),timeoutMs);})]).finally(()=>window.clearTimeout(timer));
  }
  async function load(siteKey) {
    if(!scripts.has(siteKey)) {
      const script=document.createElement('script');script.async=true;script.defer=true;
      const callback='doceriaSmsEnterpriseReady'+(++sequence);
      script.src='https://www.google.com/recaptcha/enterprise.js?render='+encodeURIComponent(siteKey)+'&hl=pt-BR&onload='+callback;
      const promise=bounded(new Promise((resolve,reject)=>{window[callback]=resolve;script.onerror=()=>reject(friendly());})).finally(()=>{delete window[callback];});
      scripts.set(siteKey,promise);document.head.append(script);
      promise.catch(()=>{scripts.delete(siteKey);script.remove();});
    }
    await scripts.get(siteKey);
    const enterprise=window.grecaptcha?.enterprise;
    if(typeof enterprise?.ready!=='function' || typeof enterprise?.execute!=='function') throw friendly();
    await bounded(new Promise(resolve=>enterprise.ready(resolve)));return enterprise;
  }
  return async config=>{
    if(mainProjectId!=='crmdoceria-9959e' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(config?.projectId || '') || ['crmdoceria-9959e','ana-guimaraes'].includes(config.projectId) || !/^[\w-]{20,100}$/.test(config.enterpriseSiteKey || '')) throw friendly();
    try {
      // Google's documented score-badge branding alternative. The requesting
      // modal displays attribution text. Never hide a CAPTCHA/challenge iframe.
      if(!document.querySelector('style[data-sms-score-branding]')) {
        const branding=document.createElement('style');branding.dataset.smsScoreBranding='true';
        branding.textContent='html[data-sms-score-only="true"] .grecaptcha-badge { visibility: hidden; }';document.head.append(branding);
      }
      document.documentElement.dataset.smsScoreOnly='true';
      const enterprise=await load(config.enterpriseSiteKey);
      const token=await bounded(enterprise.execute(config.enterpriseSiteKey,{action:'sendVerificationCode'}));
      if(typeof token!=='string' || token.length<10 || token.length>10000) throw friendly();
      return {token,dispose:()=>{}};
    }catch{throw friendly();}
  };
}
