import {retireLegacySession,createCanonicalLogout,syncPrivateCart,staffDevice} from './canonical-session.mjs?v=20261014-single-session';
import {localCheckout, getCheckoutFirebaseConfig} from './checkout-environment.js';
// Firebase configuration and setup for the public/cardápio pages.
// CRM and authenticated public pages share DEFAULT. The named legacy app is
// initialized only to retire its old persistence without copying credentials.

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
  getFirestore,
  deleteDoc,
  connectFirestoreEmulator,
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  setDoc,
  arrayUnion,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';
import {
  getAuth,
  signOut,
  connectAuthEmulator,
  signInAnonymously,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

// --- Firebase project configuration ---
// These credentials correspond to the Ana Guimarães project hosted on
// Firebase.  Replace them only if you migrate the project to a new
// Firebase account.
const firebaseConfig = await getCheckoutFirebaseConfig();

// Every authenticated entry uses the same Firebase Auth instance.
const appName = '[DEFAULT]'; // accountContext is never an identity selector.
const app = getApps().find((a) => a.name === appName) || initializeApp(firebaseConfig, appName);

// Firestore service for data operations.
const db = getFirestore(app);

// Authentication service.
const auth = getAuth(app);
const functions = getFunctions(app, 'us-central1');
if (localCheckout) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings: true});
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

// Read the old persistence only to retire it, never to copy its credentials.
const legacyApp=getApps().find(a=>a.name==='cardapioPublic') || initializeApp(firebaseConfig,'cardapioPublic');
const legacyAuth=getAuth(legacyApp);
if(localCheckout) connectAuthEmulator(legacyAuth,'http://127.0.0.1:9099',{disableWarnings:true});
const retirePublicLegacy=()=>retireLegacySession({auth,legacyAuth,signOut,beforeConflict:async uid=>{
  window.localStorage.removeItem('auth-profile-cache-v1:'+uid);
  const token=staffDevice(window.sessionStorage,uid);
  if(token) {try {await deleteDoc(doc(db,'notificationTokens',token));} catch {}}
}});
const sessionTransition=await retirePublicLegacy();
if(sessionTransition!=='READY') syncPrivateCart(window.sessionStorage,null,{force:true});
onAuthStateChanged(auth,user=>syncPrivateCart(window.sessionStorage,user && !user.isAnonymous ? user.uid : null));
let retirement=null;
onAuthStateChanged(legacyAuth,user=>{
  if(!user || retirement) return;
  retirement=retirePublicLegacy().then(status=>{
    if(status!=='READY') syncPrivateCart(window.sessionStorage,null,{force:true});
  }).finally(()=>{retirement=null;});
});
const logout=createCanonicalLogout({auth,legacyAuth,signOut,storage:window.sessionStorage,
  beforeSignOut:async(uid,token)=>{
    window.localStorage.removeItem('auth-profile-cache-v1:'+uid);
    if(token && auth.currentUser?.uid===uid) {
      try {await deleteDoc(doc(db,'notificationTokens',token));}
      catch(error){console.warn('[Auth] Push cleanup unavailable:',error?.code || 'cleanup-failed');}
    }
  }});

const normalizeCallableError = (error) => {
  const rawCode = typeof error?.code === 'string' ? error.code : '';
  const code = rawCode.replace(/^functions\//, '') || 'unknown';
  return {
    code,
    message: error?.message || 'Erro desconhecido ao comunicar com o servidor.',
    original: error,
  };
};

const lookupClientByPhoneCallable = httpsCallable(functions, 'lookupClientByPhone');
const updateClientProfileCallable = httpsCallable(functions, 'updateClientProfile');

const lookupClientByPhone = async ({ telefone, lojaId }) => {
  const payload = {
    telefone: telefone == null ? '' : String(telefone),
    lojaId: typeof lojaId === 'string' ? lojaId.trim() : '',
  };

  return lookupClientByPhoneCallable(payload);
};
const updateClientProfile = async ({ lojaId, clientId, nome, aniversario }) => {
  const payload = {
    lojaId: typeof lojaId === 'string' ? lojaId.trim() : '',
    clientId: typeof clientId === 'string' ? clientId.trim() : '',
    nome: typeof nome === 'string' ? nome.trim() : '',
    aniversario: typeof aniversario === 'string' ? aniversario.trim() : '',
  };

  return updateClientProfileCallable(payload);
};



if (typeof window !== 'undefined') {
  window.lookupClientByPhone = lookupClientByPhone;
  window.updateClientProfile = updateClientProfile;
  window.normalizeCallableError = normalizeCallableError;
}

// Some Firebase projects restrict anonymous authentication and return
// 403 errors from securetoken.googleapis.com when visitors first open
// the public page.  To avoid noisy errors for unauthenticated visitors,
// anonymous auth is opt-in and only enabled when explicitly requested.
//
// Enable it by setting `window.ENABLE_ANON_AUTH = true` before loading
// this script on pages that truly need anonymous sessions.
const ANONYMOUS_AUTH_ENABLED = window.ENABLE_ANON_AUTH === true;

if (!ANONYMOUS_AUTH_ENABLED) {
  window.firebaseAnonAuthUnavailable = true;
  console.info('Autenticação anônima desativada para o cardápio público.');
} else {
  const handleAnonAuthError = (error) => {
    console.warn('Autenticação anônima indisponível; prosseguindo sem login.', error);
    window.firebaseAnonAuthUnavailable = true;
  };

  // Persist anonymous login so that returning visitors keep the same
  // anonymous user ID.  This prevents duplication of carts or orders
  // across reloads.
  setPersistence(auth, browserLocalPersistence)
    .then(() => {
      onAuthStateChanged(auth, (user) => {
        // If no user is signed in yet, sign in anonymously.  This should
        // only happen once per browser session.
        if (!user && !window.firebaseAnonAuthUnavailable) {
          signInAnonymously(auth).catch(handleAnonAuthError);
        } else if (!user) {
          handleAnonAuthError(new Error('anonymous auth skipped'));
        } else {
          console.log('Sessão anônima ativa:', user.uid);
        }
      });
    })
    .catch((error) => {
      console.error('Erro ao definir persistência de autenticação:', error);
      handleAnonAuthError(error);
    });
}

// --- Exports ---
// Export both the app instance and the Firestore helpers used by the
// cardápio pages.  Consumers can import exactly what they need
// without including unused modules in the bundle.
export {
  app,
  db,
  auth,
  functions,
  httpsCallable,
  lookupClientByPhone,
  updateClientProfile,
  normalizeCallableError,
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  setDoc,
  arrayUnion,
  onSnapshot,
};
