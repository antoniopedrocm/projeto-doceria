/* eslint-disable no-undef */

const CACHE_NAME = 'doceria-crm-cache-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo192.png',
  '/logo512.png',
  '/mixkit-vintage-warning-alarm-990.wav'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch((error) => {
      console.error('[service-worker] Falha ao pré-carregar assets:', error);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET' || request.url.startsWith('chrome-extension')) {
    return;
  }

  const requestUrl = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clonedResponse));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match('/index.html');
        })
    );
    return;
  }

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }

          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clonedResponse));
          return response;
        })
        .catch((error) => {
          if (!cachedResponse) {
            console.warn('[service-worker] Falha na requisição:', error);
          }
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: 'AIzaSyCNU5ZEl60OcW5eZyL_ZoD0tFKpweQvhwU',
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
const DEFAULT_AUDIO_URL = '/mixkit-vintage-warning-alarm-990.wav';

async function notifyClients(message) {
  try {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clientsList.forEach((client) => client.postMessage(message));
  } catch (error) {
    console.error('[service-worker] Falha ao enviar mensagem aos clientes:', error);
  }
}

function buildNotificationPayload(payload) {
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
      tag: 'new-order',
      renotify: true,
      requireInteraction: true,
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
  const notificationPayload = buildNotificationPayload(payload);
  await self.registration.showNotification(notificationPayload.title, notificationPayload.options);
  await notifyClients({ type: PUSH_EVENT_TYPE, payload });
}

messaging.onBackgroundMessage((payload) => {
  const task = showOrderNotification(payload);
  if (payload?.data?.playAlarm === 'true') {
    task.finally(() => {
      notifyClients({ type: 'PLAY_ORDER_SOUND', payload });
    });
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  const payload = event.data.json();
  event.waitUntil(showOrderNotification(payload));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destinationUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({ type: PUSH_EVENT_TYPE, payload: { data: event.notification.data || {} } });
            client.postMessage({ type: 'PLAY_ORDER_SOUND', payload: { data: event.notification.data || {} } });
            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(destinationUrl);
        }

        return null;
      })
  );
});