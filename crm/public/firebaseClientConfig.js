// Firebase configuration and setup for the public/cardápio pages.
// This file initialises a named Firebase app instance to avoid
// interfering with the main CRM session.  It also ensures that
// anonymous authentication is persisted between reloads so each
// visitor retains a consistent session.

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
  getFirestore,
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
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

// --- Firebase project configuration ---
// These credentials correspond to the development Firebase project.
// Replace them only if you migrate the project to a new Firebase account.
const GOOGLE_API_KEY = 'AIzaSyCNU5ZEl60OcW5eZyL_ZoD0tFKpweQvhwU';

const firebaseConfig = {
  apiKey: GOOGLE_API_KEY,
  authDomain: 'crmdoceria-9959e.firebaseapp.com',
  projectId: 'crmdoceria-9959e',
  storageBucket: 'crmdoceria-9959e.firebasestorage.app',
  messagingSenderId: '389481198252',
  appId: '1:389481198252:web:429bff3cc5d4f353bea509',
  measurementId: 'G-XJ7LPG0229',
};

// Create or retrieve a named app instance.  Using a distinct name
// prevents interference with other Firebase initialisations on the page.
const appName = 'cardapioPublic';
const app = getApps().find((a) => a.name === appName) || initializeApp(firebaseConfig, appName);

// Firestore service for data operations.
const db = getFirestore(app);

// Authentication service.
const auth = getAuth(app);
const functions = getFunctions(app, 'us-central1');

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
