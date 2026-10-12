import { Capacitor, registerPlugin } from '@capacitor/core';
import { getToken, onMessage } from 'firebase/messaging';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, messagingPromise, VAPID_KEY } from '../firebaseConfig.js';
import { claimOrderAlert } from './orderAlertDeduper.js';

const isBrowser = typeof window !== 'undefined';
const OrderPush = registerPlugin('OrderPush');
const registrationFlights = new Map();
let webTokenFlight = null;

export const PUSH_PERMISSION_STATUS = Object.freeze({
  GRANTED: 'granted',
  PROMPT: 'prompt',
  DENIED: 'denied',
  UNSUPPORTED: 'unsupported',
});

export const isNativeAndroidPushRuntime = () => (
  isBrowser && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
);

export async function claimOrderAlertForRuntime({ uid, storeId, orderId } = {}) {
  if (!isNativeAndroidPushRuntime()) {
    return claimOrderAlert({ uid, storeId, orderId });
  }

  try {
    const result = await OrderPush.claimAlert({ uid, storeId, orderId });
    return Boolean(result?.claimed);
  } catch (error) {
    console.error('[notifications] Não foi possível deduplicar o alerta no Android:', error);
    return false;
  }
}

const normalizePermissionStatus = (status) => {
  if (status === 'granted') return PUSH_PERMISSION_STATUS.GRANTED;
  if (status === 'denied') return PUSH_PERMISSION_STATUS.DENIED;
  if (status === 'prompt' || status === 'prompt-with-rationale' || status === 'default') {
    return PUSH_PERMISSION_STATUS.PROMPT;
  }
  return PUSH_PERMISSION_STATUS.UNSUPPORTED;
};

export async function getPushPermissionStatus() {
  if (!isBrowser) return PUSH_PERMISSION_STATUS.UNSUPPORTED;

  if (isNativeAndroidPushRuntime()) {
    try {
      const result = await OrderPush.checkPermissions();
      return normalizePermissionStatus(result?.notifications);
    } catch (error) {
      console.warn('[notifications] Não foi possível consultar a permissão nativa:', error);
      return PUSH_PERMISSION_STATUS.UNSUPPORTED;
    }
  }

  if (!('Notification' in window)) return PUSH_PERMISSION_STATUS.UNSUPPORTED;
  return normalizePermissionStatus(Notification.permission);
}

async function ensureServiceWorkerRegistration() {
  if (!isBrowser || !('serviceWorker' in navigator)) {
    throw new Error('Service workers não são suportados neste ambiente.');
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  const scriptURL = new URL('/firebase-messaging-sw.js', window.location.origin).href;
  const scope = new URL('/', window.location.origin).href;
  const existing = registrations.find((registration) => {
    const workerURL =
      registration.active?.scriptURL ||
      registration.installing?.scriptURL ||
      registration.waiting?.scriptURL;
    return registration.scope === scope && workerURL === scriptURL;
  });

  const registration = existing || await navigator.serviceWorker.register(scriptURL, { scope });
  const worker = registration.active || registration.installing || registration.waiting;
  if (!worker) throw new Error('O worker de notificações não está disponível.');
  if (worker.state !== 'activated') {
    await new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer);
        worker.removeEventListener('statechange', onStateChange);
        if (error) reject(error); else resolve();
      };
      const onStateChange = () => {
        if (worker.state === 'activated') finish();
        else if (worker.state === 'redundant') finish(new Error('O worker de notificações foi substituído.'));
      };
      const timer = setTimeout(() => finish(new Error('O worker de notificações não iniciou.')), 10000);
      worker.addEventListener('statechange', onStateChange);
      onStateChange();
    });
  }
  if (registration.active?.scriptURL !== scriptURL) {
    throw new Error('O worker de notificações ativo não corresponde à aplicação.');
  }
  return registration;
}

function getStaffWebToken(messaging) {
  if (!webTokenFlight) {
    webTokenFlight = (async () => {
      // Auth and Messaging are created from the same app in firebaseConfig.
      // Messaging has no public .app property in this SDK version.
      if (auth.app?.options?.projectId !== 'crmdoceria-9959e') {
        throw new Error('Notificações vinculadas ao projeto Firebase incorreto.');
      }
      const registration = await ensureServiceWorkerRegistration();
      const tokenOptions = { serviceWorkerRegistration: registration };
      if (VAPID_KEY) tokenOptions.vapidKey = VAPID_KEY;
      else console.warn('[notifications] Chave VAPID própria ausente; usando a chave padrão do FCM quando suportada.');
      return getToken(messaging, tokenOptions);
    })().finally(() => { webTokenFlight = null; });
  }
  return webTokenFlight;
}

async function requestPushPermissionIfNeeded({ requestPermission }) {
  if (isNativeAndroidPushRuntime()) {
    const permissionStatus = await getPushPermissionStatus();
    if (permissionStatus !== PUSH_PERMISSION_STATUS.PROMPT || !requestPermission) {
      return permissionStatus;
    }
    const result = await OrderPush.requestPermissions();
    return normalizePermissionStatus(result?.notifications);
  }

  if (!('Notification' in window)) return PUSH_PERMISSION_STATUS.UNSUPPORTED;
  const permissionStatus = normalizePermissionStatus(Notification.permission);
  if (permissionStatus !== PUSH_PERMISSION_STATUS.PROMPT || !requestPermission) {
    return permissionStatus;
  }

  // Esta chamada precisa continuar no encadeamento direto do clique/toque.
  const result = await Notification.requestPermission();
  return normalizePermissionStatus(result);
}

export function registerDeviceForPush(uid, options = {}) {
  if (registrationFlights.has(uid)) return registrationFlights.get(uid);
  const flight = registerStaffDevice(uid, options).finally(() => {
    if (registrationFlights.get(uid) === flight) registrationFlights.delete(uid);
  });
  registrationFlights.set(uid, flight);
  return flight;
}

async function registerStaffDevice(uid, { requestPermission = false } = {}) {
  if (!isBrowser || !uid) return null;
  if (auth.currentUser?.uid !== uid) return null;

  const permissionStatus = await requestPushPermissionIfNeeded({ requestPermission });
  if (permissionStatus !== PUSH_PERMISSION_STATUS.GRANTED) {
    return null;
  }
  if (auth.currentUser?.uid !== uid) return null;

  try {
    let token = null;
    let platform = 'web';

    if (isNativeAndroidPushRuntime()) {
      const result = await OrderPush.getToken();
      token = String(result?.token || '').trim();
      platform = 'android';
    } else {
      const messaging = await messagingPromise;
      if (!messaging) return null;

      token = await getStaffWebToken(messaging);
    }

    if (!token) {
      console.warn('Não foi possível obter o token de push.');
      return null;
    }
    if (auth.currentUser?.uid !== uid) return null;

    await setDoc(
      doc(db, 'notificationTokens', token),
      {
        uid,
        platform,
        devicePlatform: navigator.platform || platform,
        userAgent: navigator.userAgent || '',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    if (platform === 'android') {
      window.__anaAndroidPushTokenSync = token;
    }
    return token;
  } catch (error) {
    const errorCode = error?.code || '';
    const errorMessage = String(error?.message || '');
    const isForbiddenTokenError =
      errorCode.includes('messaging/token-subscribe-failed') ||
      errorMessage.includes('registrations.googleapis.com') ||
      errorMessage.includes('403');

    if (isForbiddenTokenError) {
      console.warn('Falha ao obter token de push (FCM 403). O alerta em tempo real continuará disponível.');
      return null;
    }

    console.error('Falha ao registrar notificações push:', error);
    throw error;
  }
}

export async function unregisterDeviceForPush(uid, fallbackToken = null) {
  // Await this browser's pending write before removing its association. Do not
  // enumerate/delete tokens of other devices or invalidate their subscriptions.
  const pending = registrationFlights.get(uid);
  const pendingToken = pending ? await pending.catch(() => null) : null;
  const token = pendingToken || fallbackToken;
  if (token && auth.currentUser?.uid === uid) {
    await deleteDoc(doc(db, 'notificationTokens', token));
  }
}

export async function listenForForegroundMessages(callback) {
  if (!isBrowser || isNativeAndroidPushRuntime()) return () => {};

  const messaging = await messagingPromise;
  if (!messaging) return () => {};

  return onMessage(messaging, callback);
}

export function subscribeToServiceWorkerMessages(callback) {
  if (!isBrowser || isNativeAndroidPushRuntime() || !('serviceWorker' in navigator)) {
    return () => {};
  }

  const handler = (event) => callback(event);
  navigator.serviceWorker.addEventListener('message', handler);

  return () => {
    navigator.serviceWorker.removeEventListener('message', handler);
  };
}
