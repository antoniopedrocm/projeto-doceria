import { getToken } from 'firebase/messaging';
import { deleteDoc, setDoc } from 'firebase/firestore';
import { auth, messagingPromise } from '../firebaseConfig';
import { registerDeviceForPush, unregisterDeviceForPush } from './notifications';

jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
  registerPlugin: () => ({}),
}));
jest.mock('firebase/messaging', () => ({ getToken: jest.fn(), onMessage: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  deleteDoc: jest.fn(), setDoc: jest.fn(), serverTimestamp: () => 'server-time',
  doc: (_db, collection, id) => ({ collection, id }),
}));
jest.mock('../firebaseConfig', () => ({
  auth: { currentUser: { uid: 'staff-a' } }, db: {}, VAPID_KEY: '',
  messagingPromise: Promise.resolve({ app: { options: { projectId: 'crmdoceria-9959e' } } }),
}));

const origin = window.location.origin;
const canonical = {
  scope: `${origin}/`,
  active: { scriptURL: `${origin}/firebase-messaging-sw.js`, state: 'activated' },
};
const legacy = { ...canonical, scope: `${origin}/firebase-cloud-messaging-push-scope` };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  jest.clearAllMocks();
  auth.currentUser = { uid: 'staff-a' };
  Object.defineProperty(window, 'Notification', {
    configurable: true, value: { permission: 'granted', requestPermission: jest.fn() },
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistrations: jest.fn().mockResolvedValue([legacy, canonical]),
      register: jest.fn().mockResolvedValue(canonical),
      // A different registration becoming ready must not select its subscription.
      ready: Promise.resolve(legacy),
    },
  });
  getToken.mockResolvedValue('fixture-token');
  setDoc.mockResolvedValue(undefined);
  deleteDoc.mockResolvedValue(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('selects the canonical root worker regardless of enumeration order', async () => {
  await registerDeviceForPush('staff-a');
  expect(getToken).toHaveBeenCalledWith(expect.anything(), { serviceWorkerRegistration: canonical });
  expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
});

test('does not reuse the legacy subscription when the canonical worker is missing', async () => {
  navigator.serviceWorker.getRegistrations.mockResolvedValue([legacy]);
  await registerDeviceForPush('staff-a');
  expect(navigator.serviceWorker.register).toHaveBeenCalledWith(
    `${origin}/firebase-messaging-sw.js`, { scope: `${origin}/` },
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
  navigator.serviceWorker.getRegistrations.mockResolvedValue([registration, legacy]);
  const pending = registerDeviceForPush('staff-a');
  await flush();
  expect(getToken).not.toHaveBeenCalled();
  registration.active = worker;
  worker.state = 'activated';
  onStateChange();
  await pending;
  expect(getToken).toHaveBeenCalledWith(expect.anything(), { serviceWorkerRegistration: registration });
});

test('rejects a Messaging instance from another project before requesting a token', async () => {
  const messaging = await messagingPromise;
  messaging.app.options.projectId = 'other-project';
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(registerDeviceForPush('staff-a')).rejects.toThrow('projeto Firebase incorreto');
    expect(getToken).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  } finally {
    messaging.app.options.projectId = 'crmdoceria-9959e';
    errorLog.mockRestore();
  }
});
