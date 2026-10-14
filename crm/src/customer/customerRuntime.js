import {getApps, initializeApp} from 'firebase/app';
import * as sdk from 'firebase/auth';
import {httpsCallable} from 'firebase/functions';
import {app, auth, functions} from '../firebaseConfig';
import {unregisterDeviceForPush} from '../utils/notifications';
// The named app is read only for retirement; it is never a login destination.
const legacyApp=getApps().find(a=>a.name==='cardapioPublic') || initializeApp(app.options,'cardapioPublic');
export const legacyAuth=sdk.getAuth(legacyApp);
if(app.options.projectId==='demo-doceria-checkout') sdk.connectAuthEmulator(legacyAuth,'http://127.0.0.1:9099',{disableWarnings:true});
export const customerAuth=auth;
const sessionModule=()=>import(/* webpackIgnore: true */ '/canonical-session.mjs?v=20261014-single-session');
let preparation;
export const prepareCanonicalSession=()=>{
  if(!preparation) preparation=sessionModule().then(module=>module.retireLegacySession({auth,legacyAuth,signOut:sdk.signOut,beforeConflict:async uid=>{
    window.localStorage.removeItem('auth-profile-cache-v1:'+uid);
    try {await unregisterDeviceForPush(uid,module.staffDevice(window.sessionStorage,uid));} catch {}
  }})).finally(()=>{preparation=null;});
  return preparation;
};
export const syncSessionCart=async(uid,options)=>(await sessionModule()).syncPrivateCart(window.sessionStorage,uid,options);
let logout;
export const logoutCanonicalSession=async()=>{
  if(!logout) {
    const module=await sessionModule();
    if(!logout) logout=module.createCanonicalLogout({auth,legacyAuth,signOut:sdk.signOut,storage:window.sessionStorage,
      beforeSignOut:async(uid,token)=>{window.localStorage.removeItem('auth-profile-cache-v1:'+uid);try {await unregisterDeviceForPush(uid,token);} catch(error){console.warn('[Auth] Push cleanup unavailable:',error?.code || 'cleanup-failed');}}});
  }
  return logout();
};
export const runtimeFor = () => ({auth,functions,httpsCallable,...sdk,logout:logoutCanonicalSession});
export const loadCustomerController = () => import(/* webpackIgnore: true */ '/customer-account-core.mjs?v=20261014-single-session');
