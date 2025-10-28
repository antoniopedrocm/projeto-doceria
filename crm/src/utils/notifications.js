diff --git a/crm/src/utils/notifications.js b/crm/src/utils/notifications.js
new file mode 100644
index 0000000000000000000000000000000000000000..42a39459860ca05e9dc9efd44e1adecfc00a0adb
--- /dev/null
+++ b/crm/src/utils/notifications.js
@@ -0,0 +1,115 @@
+// src/utils/notifications.js
+import { getToken, onMessage } from 'firebase/messaging';
+import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
+import { db, messagingPromise } from '../firebaseConfig.js';
+
+const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY;
+
+const isBrowser = typeof window !== 'undefined';
+
+async function ensureServiceWorkerRegistration() {
+  if (!isBrowser || !('serviceWorker' in navigator)) {
+    throw new Error('Service workers não são suportados neste ambiente.');
+  }
+
+  const registrations = await navigator.serviceWorker.getRegistrations();
+  const existing = registrations.find((registration) => {
+    const scriptURL = registration.active?.scriptURL || registration.installing?.scriptURL || registration.waiting?.scriptURL;
+    return scriptURL?.includes('firebase-messaging-sw.js');
+  });
+
+  if (existing) {
+    return existing;
+  }
+
+  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
+  return registration;
+}
+
+export async function registerDeviceForPush(uid) {
+  if (!isBrowser) {
+    return null;
+  }
+
+  const messaging = await messagingPromise;
+  if (!messaging) {
+    return null;
+  }
+
+  if (!('Notification' in window)) {
+    console.warn('API de notificações não suportada neste navegador.');
+    return null;
+  }
+
+  let permission = Notification.permission;
+  if (permission === 'default') {
+    permission = await Notification.requestPermission();
+  }
+
+  if (permission !== 'granted') {
+    console.warn('Permissão para notificações não concedida.');
+    return null;
+  }
+
+  if (!VAPID_KEY) {
+    throw new Error('A variável REACT_APP_FIREBASE_VAPID_KEY não está configurada.');
+  }
+
+  try {
+    const registration = await ensureServiceWorkerRegistration();
+    const token = await getToken(messaging, {
+      vapidKey: VAPID_KEY,
+      serviceWorkerRegistration: registration,
+    });
+
+    if (!token) {
+      console.warn('Não foi possível obter o token de push.');
+      return null;
+    }
+
+    await setDoc(
+      doc(db, 'notificationTokens', token),
+      {
+        uid: uid || null,
+        platform: navigator.platform || 'web',
+        userAgent: navigator.userAgent,
+        updatedAt: serverTimestamp(),
+      },
+      { merge: true }
+    );
+
+    return token;
+  } catch (error) {
+    console.error('Falha ao registrar notificações push:', error);
+    throw error;
+  }
+}
+
+export async function listenForForegroundMessages(callback) {
+  if (!isBrowser) {
+    return () => {};
+  }
+
+  const messaging = await messagingPromise;
+  if (!messaging) {
+    return () => {};
+  }
+
+  return onMessage(messaging, callback);
+}
+
+export function subscribeToServiceWorkerMessages(callback) {
+  if (!isBrowser || !('serviceWorker' in navigator)) {
+    return () => {};
+  }
+
+  const handler = (event) => {
+    callback(event);
+  };
+
+  navigator.serviceWorker.addEventListener('message', handler);
+
+  return () => {
+    navigator.serviceWorker.removeEventListener('message', handler);
+  };
+}
