import * as bundledApp from 'firebase/app';
import * as bundledAuth from 'firebase/auth';
import {getCanonicalAuth} from '../../src/canonicalAuth.mjs';
import {createCanonicalLogout} from '../../public/canonical-session.mjs';

// Local fixture only. No production/DEV API key, credential, permission or FCM.
if(window.location.hostname!=='127.0.0.1') throw Error('Local emulator only');
const tab=new URLSearchParams(window.location.search).get('tab');
if(!['A','B'].includes(tab)) throw Error('Tab A/B required');
// Exercise the exact SDK boundary used by the CRM and the public entry.
const sdk=tab==='A'?bundledAuth:await import(/* webpackIgnore: true */ 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js');
const appSdk=tab==='A'?bundledApp:await import(/* webpackIgnore: true */ 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
const canonical=tab==='A'?getCanonicalAuth:(await import(/* webpackIgnore: true */ '/canonical-auth.mjs')).getCanonicalAuth;
const {initializeApp,deleteApp,SDK_VERSION}=appSdk;
let app,auth,unsubscribe,context=null,nullEvents=0,removedEvents=0,cleanupEvents=[];
window.addEventListener('storage',event=>{
  if(event.key?.startsWith('firebase:authUser:') && event.newValue===null) removedEvents++;
});
const config={projectId:'demo-doceria-checkout',apiKey:'demo-persistence-key',
  appId:'demo-persistence-browser',authDomain:'demo-doceria-checkout.firebaseapp.com'};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const post=(url,value)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
function snapshot(){
  return {uid:auth?.currentUser?.uid || null,context,nullEvents,removedEvents,
    persistence:auth?.persistenceManager?.persistence?.constructor===sdk.indexedDBLocalPersistence?'indexedDB':
      auth?.persistenceManager?.persistence?.constructor===sdk.browserLocalPersistence?'localStorage':null,
    sdk:SDK_VERSION,cleanupEvents:[...cleanupEvents],release:document.querySelector('meta[name="release"]').content};
}
async function boot(mode='canonical',nextContext='staff'){
  unsubscribe?.();if(app)await deleteApp(app);
  app=initializeApp(config);context=nextContext;nullEvents=0;removedEvents=0;
  // Simulate an unavailable IDB capability, not a replacement storage engine.
  // The fallback still uses the real Firebase SDK and browser localStorage.
  class UnavailableIndexedDB extends sdk.indexedDBLocalPersistence {
    async _isAvailable(){return false;}
  }
  const policySdk=mode==='fallback'?{...sdk,indexedDBLocalPersistence:UnavailableIndexedDB}:sdk;
  auth=mode==='legacy'?sdk.initializeAuth(app,{persistence:sdk.browserLocalPersistence,popupRedirectResolver:sdk.browserPopupRedirectResolver}):
    mode==='old-default'?sdk.getAuth(app):canonical(app,policySdk);
  sdk.connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
  await auth.authStateReady();
  if(mode==='canonical' && canonical(app,sdk)!==auth)throw Error('Duplicate Auth');
  unsubscribe=sdk.onAuthStateChanged(auth,user=>{if(!user){nullEvents++;context=null;}});
  await wait(50);
}
async function execute(command){
  switch(command.action){
    case 'boot': await boot(command.mode,command.context);break;
    case 'dispose': unsubscribe?.();if(app)await deleteApp(app);app=null;auth=null;context=null;break;
    case 'login': await sdk.signInAnonymously(auth);context=command.context;break;
    case 'context': context=command.context;break;
    case 'inspect': await wait(command.wait || 0);break;
    case 'logout': await createCanonicalLogout({auth,signOut:sdk.signOut,
      beforeSignOut:async()=>{cleanupEvents.push('T1-cleanup');}})();break;
    case 'reload': sessionStorage.setItem('persistence-test-reload',JSON.stringify(command));window.location.reload();return;
    default: throw Error('Unknown fixture action');
  }
  await post('/report',{tab,id:command.id,result:snapshot()});
}
const reload=JSON.parse(sessionStorage.getItem('persistence-test-reload') || 'null');
if(reload){sessionStorage.removeItem('persistence-test-reload');await boot('canonical',reload.context);await post('/report',{tab,id:reload.id,result:snapshot()});}
document.querySelector('#start').onclick=()=>post('/run',{});
document.querySelector('#state').textContent='Local fixture '+tab+' ready — Firebase '+SDK_VERSION;
for(;;){
  try{
    const response=await fetch('/poll?tab='+tab),command=await response.json();
    if(command)try{await execute(command);}catch(error){await post('/report',{tab,id:command.id,error:error.code || error.message});}
    const results=await (await fetch('/results')).json();
    document.querySelector('#results').textContent=JSON.stringify(results,null,2);
  }catch{document.querySelector('#state').textContent='Local test server stopped';break;}
  await wait(100);
}
