import { Capacitor, registerPlugin } from '@capacitor/core';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, messagingPromise, VAPID_KEY } from '../firebaseConfig.js';
import { claimOrderAlert } from './orderAlertDeduper.js';

const isBrowser = typeof window !== 'undefined';
const OrderPush = registerPlugin('OrderPush');

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
  const existing = registrations.find((registration) => {
    const scriptURL =
      registration.active?.scriptURL ||
      registration.installing?.scriptURL ||
      registration.waiting?.scriptURL;
    return scriptURL?.includes('firebase-messaging-sw.js');
  });

  if (existing?.active) return existing;
  if (existing) {
    await navigator.serviceWorker.ready;
    return existing;
  }

  await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  return navigator.serviceWorker.ready;
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

export async function registerDeviceForPush(uid, { requestPermission = false } = {}) {
  if (!isBrowser || !uid) return null;

  const permissionStatus = await requestPushPermissionIfNeeded({ requestPermission });
  if (permissionStatus !== PUSH_PERMISSION_STATUS.GRANTED) {
    return null;
  }

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

      const registration = await ensureServiceWorkerRegistration();
      const tokenOptions = { serviceWorkerRegistration: registration };
      if (VAPID_KEY) {
        tokenOptions.vapidKey = VAPID_KEY;
      } else {
        console.warn('[notifications] Chave VAPID própria ausente; usando a chave padrão do FCM quando suportada.');
      }
      token = await getToken(messaging, tokenOptions);
    }

    if (!token) {
      console.warn('Não foi possível obter o token de push.');
      return null;
    }

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
