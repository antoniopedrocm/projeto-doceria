/* eslint-disable no-undef */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const GOOGLE_API_KEY = 'AIzaSyCNU5ZEl60OcW5eZyL_ZoD0tFKpweQvhwU';

const firebaseConfig = {
  apiKey: GOOGLE_API_KEY,
  authDomain: 'crmdoceria-9959e.firebaseapp.com',
  projectId: 'crmdoceria-9959e',
  storageBucket: 'crmdoceria-9959e.firebasestorage.app',
  messagingSenderId: '389481198252',
  appId: '1:389481198252:web:429bff3cc5d4f353bea509',
  measurementId: 'G-XJ7LPG0229'
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const messaging = firebase.messaging();
const PUSH_EVENT_TYPE = 'NEW_ORDER_PUSH';
const DEFAULT_AUDIO_URL = '/audio/alarm.mp3';

async function getWindowClients() {
  try {
    return await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  } catch (error) {
    console.error('[service-worker] Falha ao consultar clientes da aplicação:', error);
    return [];
  }
}

function buildNotificationPayload(payload, { silent = false } = {}) {
  const data = payload?.data || {};
  const title = payload?.notification?.title || data.title || 'Novo pedido recebido';
  const body = payload?.notification?.body || data.body || 'Um novo pedido acabou de chegar.';
  const url = data.url || '/';

  return {
    title,
    options: {
      body,
      icon: payload?.notification?.icon || '/logo192.png',
      badge: '/logo192.png',
      tag: `new-order-${data.orderId}`,
      renotify: false,
      requireInteraction: true,
      // Uma página visível toca o MP3 oficial. Sem página visível, o sistema
      // operacional fornece o único som permitido a um Service Worker.
      silent,
      vibrate: [300, 120, 300, 120, 500],
      data: {
        ...data,
        url,
        receivedAt: Date.now(),
        audioUrl: data.audioUrl || DEFAULT_AUDIO_URL
      }
    }
  };
}

async function showOrderNotification(payload) {
  const data = payload?.data || {};
  if (data.type !== 'new_order' || !data.orderId || !data.storeId) {
    return;
  }
  const clientsList = await getWindowClients();
  const hasVisibleClient = clientsList.some(
    (client) => client.visibilityState === 'visible'
  );
  const notificationPayload = buildNotificationPayload(payload, { silent: hasVisibleClient });
  await self.registration.showNotification(notificationPayload.title, notificationPayload.options);
  clientsList.forEach((client) => client.postMessage({ type: PUSH_EVENT_TYPE, payload }));
}

messaging.onBackgroundMessage((payload) => showOrderNotification(payload));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destinationUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            await client.focus();
            if ('navigate' in client) {
              return client.navigate(destinationUrl);
            }
            return client;
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(destinationUrl);
        }

        return null;
      })
  );
});
