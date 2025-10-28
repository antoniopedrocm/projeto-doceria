diff --git a/crm/public/firebase-messaging-sw.js b/crm/public/firebase-messaging-sw.js
new file mode 100644
index 0000000000000000000000000000000000000000..69aa642db5cc78615a7b695aa60fc42ea23b16dd
--- /dev/null
+++ b/crm/public/firebase-messaging-sw.js
@@ -0,0 +1,71 @@
+/* eslint-disable no-undef */
+importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
+importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');
+
+const firebaseConfig = {
+  apiKey: 'AIzaSyCNU5ZEl60OcW5eZyL_ZoD0tFKpweQvhwU',
+  authDomain: 'crmdoceria-9959e.firebaseapp.com',
+  projectId: 'crmdoceria-9959e',
+  storageBucket: 'crmdoceria-9959e.firebasestorage.app',
+  messagingSenderId: '389481198252',
+  appId: '1:389481198252:web:429bff3cc5d4f353bea509',
+  measurementId: 'G-XJ7LPG0229',
+};
+
+firebase.initializeApp(firebaseConfig);
+const messaging = firebase.messaging();
+
+function notifyClients(message) {
+  self.clients
+    .matchAll({ type: 'window', includeUncontrolled: true })
+    .then((clients) => {
+      clients.forEach((client) => {
+        client.postMessage(message);
+      });
+    })
+    .catch((error) => {
+      console.error('[firebase-messaging-sw.js] Falha ao enviar mensagem aos clientes:', error);
+    });
+}
+
+messaging.onBackgroundMessage((payload) => {
+  const notificationTitle = payload.notification?.title || 'Novo pedido recebido';
+  const notificationOptions = {
+    body: payload.notification?.body || 'Um novo pedido acabou de chegar.',
+    icon: '/logo192.png',
+    badge: '/logo192.png',
+    tag: 'new-order',
+    renotify: true,
+    vibrate: [200, 100, 200],
+    data: {
+      ...payload.data,
+      url: payload.data?.url || '/',
+      receivedAt: Date.now().toString(),
+    },
+  };
+
+  self.registration.showNotification(notificationTitle, notificationOptions);
+  notifyClients({ type: 'NEW_ORDER_PUSH', payload });
+});
+
+self.addEventListener('notificationclick', (event) => {
+  event.notification.close();
+  const destinationUrl = event.notification.data?.url || '/';
+
+  event.waitUntil(
+    self.clients
+      .matchAll({ type: 'window', includeUncontrolled: true })
+      .then((clientList) => {
+        for (const client of clientList) {
+          if ('focus' in client) {
+            client.postMessage({ type: 'NEW_ORDER_PUSH', payload: { data: event.notification.data || {} } });
+            return client.focus();
+          }
+        }
+        if (self.clients.openWindow) {
+          return self.clients.openWindow(destinationUrl);
+        }
+        return null;
+      })
+  );
+});
