import {app} from './firebaseClientConfig.js?v=20261015-persistence';
import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {initializeAuth,inMemoryPersistence,RecaptchaVerifier} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

// RecaptchaVerifier only verifies the app. No sign-in/linking, persistence
// change or Firebase ID token ever runs through this UI.
export async function createSmsRecaptcha(config,container) {
  if(!config || app.options.projectId!=='crmdoceria-9959e' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(config.projectId || '') || ['crmdoceria-9959e','ana-guimaraes'].includes(config.projectId)) throw new Error('Verificação SMS indisponível.');
  let verifier;
  try {
    const name='address-sms-'+config.projectId;
    const secondary=getApps().find(candidate=>candidate.name===name) || initializeApp(config,name);
    const auth=initializeAuth(secondary,{persistence:inMemoryPersistence});
    verifier=new RecaptchaVerifier(auth,container,{size:'normal'});
    return {token:await verifier.verify(),dispose:()=>verifier.clear()};
  } catch {verifier?.clear();throw new Error('Não foi possível validar a verificação de segurança. Tente novamente.');}
}
