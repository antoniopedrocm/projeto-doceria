// Firebase configuration and initialization for the CRM side of the project.
// This file centralises the Firebase SDK setup so other modules can import
// the configured services without duplicating boilerplate.

import { initializeApp, getApps } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import {
  getFirestore,
  onSnapshot as firestoreOnSnapshot,
  getDoc as firestoreGetDoc,
  getDocs as firestoreGetDocs,
  deleteDoc as firestoreDeleteDoc,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import {
  getMessaging,
  isSupported as messagingIsSupported,
} from 'firebase/messaging';

// --- Firebase project configuration ---
// Prefer environment variables so production deployments can use a
// dedicated API key and auth domain. Hard-coded fallbacks keep local
// development working out of the box.
const envVar = (key) => process.env[key] || import.meta.env?.[key] || '';

const GOOGLE_API_KEY = 'AIzaSyCNU5ZEl60OcW5eZyL_ZoD0tFKpweQvhwU';
const DEFAULT_FIREBASE_STORAGE_BUCKET = 'crmdoceria-9959e.firebasestorage.app';
const LEGACY_FIREBASE_STORAGE_BUCKET = 'crmdoceria-9959e.appspot.com';

const normalizeStorageBucket = (bucket) => {
  const normalizedBucket = String(bucket || '').trim().replace(/^gs:\/\//i, '');
  if (!normalizedBucket || normalizedBucket === LEGACY_FIREBASE_STORAGE_BUCKET) {
    return DEFAULT_FIREBASE_STORAGE_BUCKET;
  }

  return normalizedBucket;
};

const firebaseConfig = {
  apiKey: envVar('REACT_APP_FIREBASE_API_KEY') || GOOGLE_API_KEY,
  authDomain: envVar('REACT_APP_FIREBASE_AUTH_DOMAIN') ||
    'crmdoceria-9959e.firebaseapp.com',
  projectId: envVar('REACT_APP_FIREBASE_PROJECT_ID') || 'crmdoceria-9959e',
  // Keep old env files from pointing uploads at the retired appspot bucket.
  storageBucket: normalizeStorageBucket(
    envVar('REACT_APP_FIREBASE_STORAGE_BUCKET') || DEFAULT_FIREBASE_STORAGE_BUCKET
  ),
  messagingSenderId:
    envVar('REACT_APP_FIREBASE_MESSAGING_SENDER_ID') || '389481198252',
  appId:
    envVar('REACT_APP_FIREBASE_APP_ID') ||
    '1:389481198252:web:429bff3cc5d4f353bea509',
  measurementId: envVar('REACT_APP_FIREBASE_MEASUREMENT_ID') || 'G-XJ7LPG0229',
};

const runtimeEnv =
  (typeof process !== 'undefined' && process.env && process.env.NODE_ENV) ||
  import.meta.env?.MODE ||
  '';
const isDev = runtimeEnv !== 'production';

const missingEnvKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingEnvKeys.length && isDev) {
  console.warn(
    '[firebaseConfig] Variáveis de ambiente ausentes, usando valores de fallback:',
    missingEnvKeys.join(', ')
  );
}

// Single source for the VAPID key so all modules read the same value.
// The fallback is the public Web Push key for the development Firebase project.
const DEFAULT_VAPID_KEY =
  'BLVVH0uQZCyvwD4IijHi76lEEXzTPrU4Mmw4YAoiv6FD8p03b-bfXx-HvNPTPhEpGiWte10JF4JNPIbHuETnU2k';

export const VAPID_KEY =
  process.env.REACT_APP_FIREBASE_VAPID_KEY ||
  process.env.REACT_APP_VAPID_KEY ||
  import.meta.env?.VITE_VAPID_KEY ||
  DEFAULT_VAPID_KEY;

// Initialise the Firebase app.  Use getApps() to avoid creating
// duplicate instances if this module is imported multiple times.
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Optionally enable Google Analytics (only works in browsers).  When
// running in Node or during SSR the analytics import will be unused.
let analytics;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

// --- Exported Firebase services ---
// Firestore for data storage, Auth for authentication, Storage for
// file uploads.
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Expose the underlying app and analytics for advanced use cases.
export { app, analytics };

// --- FCM / Notifications ---
// messagingPromise lazily initialises the Messaging service only if
// the browser supports it and the user grants permission for
// notifications.  Code that requires messaging should await this
// promise.


const FIRESTORE_LISTEN_CHANNEL_PATTERN = /firestore\.googleapis\.com\/.+\/listen\/channel/i;
const FIRESTORE_LISTENER_STATUS_EVENT = 'firestore:listener-status';
const DEFAULT_RETRY_DELAYS_MS = [400, 900, 1800];

let firestoreTelemetryContext = {
  route: null,
  uid: null,
};

export const setFirestoreTelemetryContext = (nextContext = {}) => {
  firestoreTelemetryContext = {
    ...firestoreTelemetryContext,
    route: nextContext.route || null,
    uid: nextContext.uid || null,
  };
};

const classifyFirestoreFailure = (error) => {
  const code = String(error?.code || '').toLowerCase();
  if (code.includes('permission-denied') || code.includes('unauthenticated')) return 'permission';
  if (code.includes('unavailable') || code.includes('deadline-exceeded') || code.includes('cancelled')) return 'network';

  const message = String(error?.message || '').toLowerCase();
  if (message.includes('network') || message.includes('fetch') || message.includes('offline') || message.includes('cors')) return 'network';
  if (message.includes('permission') || message.includes('insufficient')) return 'permission';
  return 'unknown';
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const extractCollectionFromRef = (refOrQuery) => {
  if (!refOrQuery) return null;

  if (typeof refOrQuery.path === 'string') {
    const segments = refOrQuery.path.split('/').filter(Boolean);
    if (segments.length >= 2) return segments[segments.length - 2];
  }

  const queryPath = refOrQuery?._query?.path?.segments || refOrQuery?._queryOptions?.parentPath?.segments;
  if (Array.isArray(queryPath) && queryPath.length) {
    return queryPath[queryPath.length - 1];
  }

  return null;
};

const emitListenerStatus = (detail) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FIRESTORE_LISTENER_STATUS_EVENT, { detail }));
};

const logFirestoreTelemetry = ({ operation, error, collection, route, uid, extra = {} }) => {
  const failureType = classifyFirestoreFailure(error);
  console.error('[Telemetry][Firestore] Falha detectada', {
    operation,
    failureType,
    route: route || firestoreTelemetryContext.route || null,
    uid: uid || firestoreTelemetryContext.uid || null,
    collection: collection || null,
    code: error?.code || null,
    message: error?.message || null,
    ...extra,
  });
};

const normalizeFirebaseError = (error) => {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  const lowerCode = code.toLowerCase();
  const lowerMessage = message.toLowerCase();

  const codeWithoutNamespace = lowerCode.startsWith('firestore/')
    ? lowerCode.replace('firestore/', '')
    : lowerCode;

  let friendlyMessage = '';
  if (codeWithoutNamespace === 'permission-denied') {
    friendlyMessage = 'Você não tem permissão para acessar estes dados.';
  } else if (codeWithoutNamespace === 'unauthenticated') {
    friendlyMessage = 'Sua sessão expirou. Faça login novamente para continuar.';
  } else if (codeWithoutNamespace === 'failed-precondition') {
    friendlyMessage = 'A operação não pode ser concluída agora. Atualize a página e tente novamente.';
  }

  const isListenChannelRequest = FIRESTORE_LISTEN_CHANNEL_PATTERN.test(lowerMessage);
  const hasFirebaseErrorCode = Boolean(codeWithoutNamespace);
  const looksLikeCorsOrNetwork = lowerMessage.includes('cors')
    || lowerMessage.includes('typeerror')
    || lowerMessage.includes('failed to fetch')
    || lowerMessage.includes('networkerror');

  const interpretedAsCors = isListenChannelRequest && !hasFirebaseErrorCode && looksLikeCorsOrNetwork;

  console.error('[Firebase][Firestore] Erro capturado:', {
    operation: null,
    code: code || null,
    message: message || null,
    interpretedAsCors
  });

  return {
    code,
    codeWithoutNamespace,
    message,
    friendlyMessage,
    interpretedAsCors
  };
};

const mapFirestoreErrorForUi = (operation, error) => {
  const normalized = normalizeFirebaseError(error);
  console.error('[Firebase][Firestore] Falha na operação:', {
    operation,
    code: normalized.code || null,
    message: normalized.message || null,
    interpretedAsCors: normalized.interpretedAsCors
  });

  const fallbackMessage = normalized.interpretedAsCors
    ? 'Não foi possível conectar ao Firestore agora. Verifique sua conexão e tente novamente.'
    : (normalized.message || 'Ocorreu um erro inesperado ao acessar o Firestore.');

  return {
    ...normalized,
    uiMessage: normalized.friendlyMessage || fallbackMessage
  };
};

const buildUiError = (operation, error) => {
  const mapped = mapFirestoreErrorForUi(operation, error);
  const uiError = new Error(mapped.uiMessage);
  uiError.name = 'FirestoreUiError';
  uiError.code = mapped.code;
  uiError.firebaseCode = mapped.codeWithoutNamespace || null;
  uiError.originalMessage = mapped.message;
  uiError.interpretedAsCors = mapped.interpretedAsCors;
  uiError.cause = error;
  return uiError;
};

export const getDoc = async (...args) => {
  try {
    return await firestoreGetDoc(...args);
  } catch (error) {
    throw buildUiError('getDoc', error);
  }
};

export const getDocs = async (...args) => {
  try {
    return await firestoreGetDocs(...args);
  } catch (error) {
    throw buildUiError('getDocs', error);
  }
};

export const runWithRetry = async (
  operationName,
  operationFn,
  { maxAttempts = 3, baseDelayMs = 400, route = null, uid = null, collection = null } = {}
) => {
  let attempt = 0;
  let lastError;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await operationFn(attempt);
    } catch (error) {
      lastError = error;
      const failureType = classifyFirestoreFailure(error);
      const shouldRetry = failureType === 'network' && attempt < maxAttempts;

      logFirestoreTelemetry({
        operation: operationName,
        error,
        route,
        uid,
        collection,
        extra: { attempt, maxAttempts, shouldRetry },
      });

      if (!shouldRetry) break;

      const delay = Math.round(baseDelayMs * (2 ** (attempt - 1)) + Math.random() * 120);
      await sleep(delay);
    }
  }

  throw lastError;
};

export const deleteDoc = async (...args) => {
  try {
    return await firestoreDeleteDoc(...args);
  } catch (error) {
    throw buildUiError('deleteDoc', error);
  }
};

export const onSnapshot = (...args) => {
  const refOrQuery = args[0];
  const collection = extractCollectionFromRef(refOrQuery);
  const hasObserverObject = typeof args[1] === 'object' && args[1] !== null;
  let listenerOptions = {};
  const maybeLastArg = args[args.length - 1];
  if (maybeLastArg && typeof maybeLastArg === 'object' && maybeLastArg.__listenerOptions === true) {
    listenerOptions = maybeLastArg;
    args = args.slice(0, -1);
  }

  const {
    maxRetryAttempts = 2,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
    route = null,
    uid = null,
    operation = 'onSnapshot',
  } = listenerOptions;

  const runFallbackFetch = async () => {
    try {
      if (typeof refOrQuery?.type === 'string' && refOrQuery.type === 'document') {
        const docSnap = await firestoreGetDoc(refOrQuery);
        return { docs: docSnap.exists() ? [docSnap] : [] };
      }

      const querySnap = await firestoreGetDocs(refOrQuery);
      return { docs: querySnap.docs };
    } catch (fallbackError) {
      logFirestoreTelemetry({
        operation: `${operation}:fallback`,
        error: fallbackError,
        route,
        uid,
        collection,
      });
      return null;
    }
  };

  let currentUnsubscribe = () => {};
  let stopped = false;
  let failureCount = 0;

  const subscribe = (nextCb, errorCb) => {
    currentUnsubscribe = firestoreOnSnapshot(
      refOrQuery,
      nextCb,
      async (error) => {
        const uiError = buildUiError('onSnapshot', error);
        failureCount += 1;
        const canRetry = failureCount <= maxRetryAttempts;

        logFirestoreTelemetry({
          operation,
          error: uiError,
          route,
          uid,
          collection,
          extra: { failureCount, maxRetryAttempts, canRetry },
        });

        if (canRetry && !stopped) {
          emitListenerStatus({ operation, collection, status: 'reconnecting', failureCount });
          const delay = retryDelaysMs[Math.min(failureCount - 1, retryDelaysMs.length - 1)] || DEFAULT_RETRY_DELAYS_MS[DEFAULT_RETRY_DELAYS_MS.length - 1];
          await sleep(delay);
          if (!stopped) {
            currentUnsubscribe();
            subscribe(nextCb, errorCb);
          }
          return;
        }

        emitListenerStatus({ operation, collection, status: 'offline', failureCount });
        const fallback = await runFallbackFetch();
        if (fallback?.docs && typeof nextCb === 'function') {
          nextCb(fallback);
        }
        if (typeof errorCb === 'function') {
          errorCb(uiError);
        } else {
          console.error('[Firebase][Firestore] onSnapshot sem callback de erro:', uiError);
        }
      }
    );
  };

  if (hasObserverObject) {
    const observer = args[1];
    subscribe(observer.next, observer.error);
    return () => {
      stopped = true;
      currentUnsubscribe();
    };
  }

  const errorCallbackIndex = typeof args[2] === 'function' ? 2 : -1;
  const nextCb = typeof args[1] === 'function' ? args[1] : undefined;
  const errorCb = errorCallbackIndex >= 0 ? args[errorCallbackIndex] : undefined;
  subscribe(nextCb, errorCb);
  return () => {
    stopped = true;
    currentUnsubscribe();
  };
};

export const messagingPromise = (async () => {
  if (typeof window === 'undefined') return null;
  try {
    const supported = await messagingIsSupported();
    if (!supported) return null;
    // A permissão precisa ser solicitada diretamente por uma ação do usuário
    // (especialmente no Safari/iOS). O registro do token fica em notifications.js.
    return getMessaging(app);
  } catch (err) {
    console.error('Failed to initialise Firebase Messaging:', err);
    return null;
  }
})();
