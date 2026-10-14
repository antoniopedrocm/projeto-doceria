import { getToken } from 'firebase/messaging';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { deleteDoc, runTransaction, setDoc } from 'firebase/firestore';
import { auth } from '../firebaseConfig';
import { registerDeviceForPush, unregisterDeviceForPush } from './notifications';

jest.mock('@capacitor/core', () => {
  const native = {getToken: jest.fn(), checkPermissions: jest.fn()};
  return {Capacitor: {isNativePlatform: jest.fn(), getPlatform: jest.fn()}, registerPlugin: () => native};
});
jest.mock('firebase/messaging', () => ({ getToken: jest.fn(), onMessage: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  deleteDoc: jest.fn(), runTransaction: jest.fn(), setDoc: jest.fn(), serverTimestamp: () => 'server-time',
  doc: (_db, collection, id) => ({ collection, id }),
}));
jest.mock('/staff-push-cleanup.mjs?v=20261014-logout', () => jest.requireActual('../../public/staff-push-cleanup.mjs'), {virtual: true});
jest.mock('../firebaseConfig', () => ({
  auth: { currentUser: { uid: 'staff-a' }, app: { options: { projectId: 'crmdoceria-9959e' } } }, db: {}, VAPID_KEY: '',
  // Messaging is opaque and has no public .app property in Firebase 10.14.1.
  messagingPromise: Promise.resolve({}),
}));

const origin = window.location.origin;
const canonical = {
  scope: `${origin}/firebase-cloud-messaging-push-scope`,
  active: { scriptURL: `${origin}/firebase-messaging-sw.js`, state: 'activated' },
  pushManager: {getSubscription: jest.fn(async () => ({options: {applicationServerKey: new Uint8Array([1, 2, 3]).buffer}}))},
};
const pageWorker = { ...canonical, scope: `${origin}/` };
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
let associations;
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();sessionStorage.clear();
  Capacitor.isNativePlatform.mockReturnValue(false);Capacitor.getPlatform.mockReturnValue('web');
  registerPlugin().getToken.mockResolvedValue({token: 'fixture-token'});
  registerPlugin().checkPermissions.mockResolvedValue({notifications: 'granted'});
  associations = new Map([['fixture-token', {uid: 'staff-a'}], ['another-device', {uid: 'staff-a'}]]);
  canonical.pushManager.getSubscription.mockResolvedValue({options: {applicationServerKey: new Uint8Array([1, 2, 3]).buffer}});
  auth.currentUser = { uid: 'staff-a' };
  Object.defineProperty(window, 'Notification', {
    configurable: true, value: { permission: 'granted', requestPermission: jest.fn() },
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistrations: jest.fn().mockResolvedValue([pageWorker, canonical]),
      register: jest.fn().mockResolvedValue(canonical),
      // A different registration becoming ready must not select its subscription.
      ready: Promise.resolve(pageWorker),
    },
  });
  let lock = Promise.resolve();
  Object.defineProperty(navigator, 'locks', {configurable: true, value: {
    request: jest.fn((_name, _options, callback) => {
      const next = lock.then(callback);lock = next.catch(() => {});return next;
    }),
  }});
  getToken.mockResolvedValue('fixture-token');
  setDoc.mockResolvedValue(undefined);
  deleteDoc.mockResolvedValue(undefined);
  runTransaction.mockImplementation(async (_db, callback) => callback({
    get: async ref => ({exists: () => associations.has(ref.id), data: () => associations.get(ref.id)}),
    delete: ref => {associations.delete(ref.id);deleteDoc(ref);},
  }));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('selects the SDK default FCM scope regardless of enumeration order', async () => {
  await registerDeviceForPush('staff-a');
  expect(getToken).toHaveBeenCalledWith(expect.anything(), { serviceWorkerRegistration: canonical });
  expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
});

test('Staff registration matches the implicit token scope used by the installed Functions SDK', async () => {
  const fs = require('fs');
  const messagingSDK = fs.readFileSync(require.resolve('@firebase/messaging'), 'utf8');
  const functionsSDK = fs.readFileSync(require.resolve('@firebase/functions'), 'utf8');
  const defaultScope = messagingSDK.match(/DEFAULT_SW_SCOPE\s*=\s*['"]([^'"]+)['"]/)[1];
  expect(functionsSDK).toMatch(/this\.messaging\.getToken\(\)/);
  await registerDeviceForPush('staff-a');
  expect(getToken.mock.calls[0][1].serviceWorkerRegistration.scope).toBe(`${origin}${defaultScope}`);
});

test('does not reuse the page subscription when the default FCM worker is missing', async () => {
  navigator.serviceWorker.getRegistrations.mockResolvedValue([pageWorker]);
  await registerDeviceForPush('staff-a');
  expect(navigator.serviceWorker.register).toHaveBeenCalledWith(
    `${origin}/firebase-messaging-sw.js`, { scope: canonical.scope },
  );
  expect(getToken).toHaveBeenCalledWith(expect.anything(), { serviceWorkerRegistration: canonical });
});

test('concurrent Staff effects share one SDK registration and one Firestore write', async () => {
  const pending = deferred();
  getToken.mockReturnValue(pending.promise);
  const first = registerDeviceForPush('staff-a');
  const second = registerDeviceForPush('staff-a');
  await flush();
  expect(getToken).toHaveBeenCalledTimes(1);
  pending.resolve('fixture-token');
  expect(await Promise.all([first, second])).toEqual(['fixture-token', 'fixture-token']);
  expect(setDoc).toHaveBeenCalledTimes(1);
});

test('refreshing registration reuses the SDK token without creating a different document', async () => {
  await registerDeviceForPush('staff-a');
  await registerDeviceForPush('staff-a');
  expect(setDoc.mock.calls.map(([ref]) => ref.id)).toEqual(['fixture-token', 'fixture-token']);
});

test('session change while token acquisition is pending prevents persistence for the previous UID', async () => {
  const pending = deferred();
  getToken.mockReturnValue(pending.promise);
  const first = registerDeviceForPush('staff-a');
  await flush();
  auth.currentUser = { uid: 'staff-b' };
  const second = registerDeviceForPush('staff-b');
  await flush();
  expect(getToken).toHaveBeenCalledTimes(1);
  pending.resolve('fixture-token');
  expect(await first).toBeNull();
  expect(await second).toBe('fixture-token');
  expect(setDoc).toHaveBeenCalledTimes(1);
  expect(setDoc.mock.calls[0][1].uid).toBe('staff-b');
});

test('unauthenticated or arbitrary UID does not start token registration', async () => {
  expect(await registerDeviceForPush('someone-else')).toBeNull();
  auth.currentUser = null;
  expect(await registerDeviceForPush('staff-a')).toBeNull();
  expect(getToken).not.toHaveBeenCalled();
  expect(setDoc).not.toHaveBeenCalled();
});

test('logout waits for the pending association write and removes exactly that browser token', async () => {
  const tokenPending = deferred();
  const writePending = deferred();
  getToken.mockReturnValue(tokenPending.promise);
  setDoc.mockReturnValue(writePending.promise);
  const registration = registerDeviceForPush('staff-a');
  await flush();
  const logout = unregisterDeviceForPush('staff-a', 'previous-token');
  tokenPending.resolve('fixture-token');
  await flush();
  expect(deleteDoc).not.toHaveBeenCalled();
  writePending.resolve();
  await registration;
  await logout;
  expect(deleteDoc).toHaveBeenCalledTimes(1);
  expect(deleteDoc).toHaveBeenCalledWith({ collection: 'notificationTokens', id: 'fixture-token' });
});

test('logout does not remove an association after the active UID changes', async () => {
  auth.currentUser = { uid: 'staff-b' };
  await unregisterDeviceForPush('staff-a', 'fixture-token');
  expect(deleteDoc).not.toHaveBeenCalled();
});

test('waits for its installing worker instead of a different ready registration', async () => {
  let onStateChange;
  const worker = {
    scriptURL: canonical.active.scriptURL, state: 'installing',
    addEventListener: jest.fn((_event, callback) => { onStateChange = callback; }),
    removeEventListener: jest.fn(),
  };
  const registration = { scope: canonical.scope, installing: worker, active: null };
  navigator.serviceWorker.getRegistrations.mockResolvedValue([registration, pageWorker]);
  const pending = registerDeviceForPush('staff-a');
  await flush();
  expect(getToken).not.toHaveBeenCalled();
  registration.active = worker;
  worker.state = 'activated';
  onStateChange();
  await pending;
  expect(getToken).toHaveBeenCalledWith(expect.anything(), { serviceWorkerRegistration: registration });
});

test('rejects a Staff Firebase app from another project before requesting a token', async () => {
  auth.app.options.projectId = 'other-project';
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(registerDeviceForPush('staff-a')).rejects.toThrow('projeto Firebase incorreto');
    expect(getToken).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  } finally {
    auth.app.options.projectId = 'crmdoceria-9959e';
    errorLog.mockRestore();
  }
});

test('markerless Customer tab finds this browser token; another device survives; repeated deletion is safe', async () => {
  await registerDeviceForPush('staff-a');
  sessionStorage.clear(); // New tab, no remembered device and no in-flight registration.
  await unregisterDeviceForPush('staff-a');
  expect(getToken).toHaveBeenLastCalledWith(expect.anything(), {
    serviceWorkerRegistration: canonical, vapidKey: 'AQID',
  });
  expect(associations.has('fixture-token')).toBe(false);
  expect(associations.has('another-device')).toBe(true);
  await unregisterDeviceForPush('staff-a');
  expect(deleteDoc).toHaveBeenCalledTimes(1);
});

test('browser token owned by a different UID is never deleted', async () => {
  associations.set('fixture-token', {uid: 'staff-b'});
  expect(await unregisterDeviceForPush('staff-a')).toBe('different-owner');
  expect(deleteDoc).not.toHaveBeenCalled();
});

test.each(['default', 'denied'])('logout never requests permission when %s', async permission => {
  Notification.permission = permission;
  await unregisterDeviceForPush('staff-a');
  expect(getToken).not.toHaveBeenCalled();
  expect(Notification.requestPermission).not.toHaveBeenCalled();
  expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
  expect(runTransaction).not.toHaveBeenCalled();
});

test('logout without the canonical subscribed worker does not create one', async () => {
  navigator.serviceWorker.getRegistrations.mockResolvedValue([pageWorker]);
  await unregisterDeviceForPush('staff-a');
  expect(getToken).not.toHaveBeenCalled();
  expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
});

test('logout fence prevents a registration waiting on its token from recreating the deleted association', async () => {
  const pending = deferred();getToken.mockReturnValue(pending.promise);
  const registration = registerDeviceForPush('staff-a');await flush();
  const {markStaffPushLogout} = jest.requireActual('../../public/staff-push-cleanup.mjs');
  markStaffPushLogout(auth.currentUser);
  pending.resolve('fixture-token');
  expect(await registration).toBeNull();
  await unregisterDeviceForPush('staff-a');
  expect(setDoc).not.toHaveBeenCalled();
  expect(associations.has('fixture-token')).toBe(false);
});

test('an aborted cleanup cannot remove a token after a late resolution', async () => {
  const pending = deferred();getToken.mockReturnValue(pending.promise);
  const controller = new AbortController();
  const cleanup = unregisterDeviceForPush('staff-a', null, controller.signal);await flush();
  controller.abort();pending.resolve('fixture-token');await cleanup;
  expect(runTransaction).not.toHaveBeenCalled();
});

test('fresh explicit sign-in can register after logout; same session/context cannot', async () => {
  const {markStaffPushLogout} = jest.requireActual('../../public/staff-push-cleanup.mjs');
  auth.currentUser.metadata = {lastSignInTime: 'same-second', toJSON: () => ({lastLoginAt: '1001'})};
  markStaffPushLogout(auth.currentUser);
  expect(await registerDeviceForPush('staff-a')).toBeNull();
  auth.currentUser.metadata = {lastSignInTime: 'same-second', toJSON: () => ({lastLoginAt: '1002'})};
  expect(await registerDeviceForPush('staff-a')).toBe('fixture-token');
});

test('native cleanup recovers only its device token and preserves web/other devices', async () => {
  Capacitor.isNativePlatform.mockReturnValue(true);Capacitor.getPlatform.mockReturnValue('android');
  await unregisterDeviceForPush('staff-a');
  expect(associations.has('fixture-token')).toBe(false);
  expect(associations.has('another-device')).toBe(true);
  expect(getToken).not.toHaveBeenCalled();
  expect(navigator.serviceWorker.getRegistrations).not.toHaveBeenCalled();
});

test('native token lookup failure still uses the UID-bound current device hint', async () => {
  Capacitor.isNativePlatform.mockReturnValue(true);Capacitor.getPlatform.mockReturnValue('android');
  registerPlugin().getToken.mockRejectedValue(Error('fixture-private-error'));
  await unregisterDeviceForPush('staff-a', 'fixture-token');
  expect(associations.has('fixture-token')).toBe(false);
  expect(associations.has('another-device')).toBe(true);
  expect(JSON.stringify(console.warn.mock.calls)).not.toContain('fixture-private-error');
});

test('explicit permission activation runs synchronously before any dynamic helper import', async () => {
  Notification.permission = 'default';
  Notification.requestPermission.mockImplementation(() => {
    Notification.permission = 'granted';return Promise.resolve('granted');
  });
  const registration = registerDeviceForPush('staff-a', {requestPermission: true});
  expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
  await registration;
});
