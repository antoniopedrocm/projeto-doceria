/* global globalThis */
// Both entry points use the existing browser subscription, never a new worker or
// a permission prompt. No token is registered to a Customer by this module.
const logoutKey = uid => `doceria-staff-push-logout:${uid}`;
const sessionTime = user => String(user?.metadata?.toJSON?.()?.lastLoginAt || user?.metadata?.lastSignInTime || 'unknown');
const browserStorage = () => {try {return globalThis.localStorage;} catch {return null;}};
export function markStaffPushLogout(user, storage = browserStorage()) {
  if (!user?.uid || !storage) return false;
  try { storage.setItem(logoutKey(user.uid), sessionTime(user)); return true; }
  catch { return false; }
}
export function staffPushRegistrationAllowed(user, storage = browserStorage()) {
  if (!user?.uid || !storage) return false;
  try { return storage.getItem(logoutKey(user.uid)) !== sessionTime(user); }
  catch { return false; }
}
export function withStaffPushLock(task, {signal, locks = globalThis.navigator?.locks} = {}) {
  if (signal?.aborted) return Promise.resolve('cancelled');
  return locks?.request ? locks.request('doceria-staff-push-device', signal ? {signal} : {}, task) : task();
}

export async function existingBrowserPushToken({app, loadMessaging,
  serviceWorker = globalThis.navigator?.serviceWorker,
  getPermission = () => globalThis.Notification?.permission,
  origin = globalThis.location?.origin, isCurrent = () => true}) {
  if (!isCurrent() || getPermission() !== 'granted' || !serviceWorker?.getRegistrations || !origin) return null;
  if (app?.options?.projectId !== 'crmdoceria-9959e') throw new Error('push/project-mismatch');
  const scope = new URL('/firebase-cloud-messaging-push-scope', origin).href;
  const script = new URL('/firebase-messaging-sw.js', origin).href;
  const registrations = await serviceWorker.getRegistrations();
  const registration = registrations.find(item => item.scope === scope &&
    item.active?.scriptURL === script && item.active.state === 'activated');
  const subscription = await registration?.pushManager?.getSubscription();
  const key = subscription?.options?.applicationServerKey;
  if (!key) return null;
  // Recover the public key already used by this subscription. This also keeps
  // the public CDN entry and the CRM build on the same VAPID configuration.
  const vapidKey = btoa(String.fromCharCode(...new Uint8Array(key)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const messaging = await loadMessaging();
  if (!messaging || !isCurrent() || getPermission() !== 'granted') return null;
  return messaging.getToken(messaging.instance, {serviceWorkerRegistration: registration, vapidKey});
}

export async function cleanupStaffDevice({auth, uid, fallbackToken, pendingRegistration,
  resolveToken, removeAssociation, signal, warn = () => {}}) {
  const current = () => !signal?.aborted && auth.currentUser?.uid === uid;
  if (!uid || !current()) return 'uid-changed';
  const pendingToken = pendingRegistration ? await pendingRegistration.catch(() => null) : null;
  if (!current()) return 'uid-changed';
  return withStaffPushLock(async () => {
    if (!current()) return 'uid-changed';
    let token = pendingToken;
    if (!token) {
      try { token = await resolveToken(); }
      catch { warn('token-unavailable'); }
    }
    if (!current()) return 'uid-changed';
    token ||= fallbackToken;
    if (!token) { warn('device-unresolved'); return 'unresolved'; }
    // The adapter must atomically verify document.uid before deleting this exact
    // token. It must not query/delete all tokens for a UID.
    return removeAssociation(token, current);
  }, {signal});
}
