import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

if (!process.env.STAFF_PUSH_VM_WORKER) {
  test('real public logout and Staff registration coordinate across separate tab modules/stores', () => {
    const child = spawnSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(import.meta.url)], {
      env: {...process.env, STAFF_PUSH_VM_WORKER: '1'}, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(child.status, 0, child.stdout + child.stderr);
    assert.match(child.stdout, /STAFF_PUSH_CROSS_TAB_PASS scenarios=7/);
  });
} else {
  const vm = await import('node:vm');
  const {createRequire} = await import('node:module');
  const require = createRequire(import.meta.url);
  const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const origin = 'https://crmdoceria-9959e.web.app';
  const user = (uid, time = '1001') => ({uid, metadata: {toJSON: () => ({lastLoginAt: time})}});
  const storage = () => {const values = new Map();return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};};
  const tick = async () => {for (let i = 0; i < 50; i++) await Promise.resolve();};
  const deferred = () => {let resolve;const promise = new Promise(done => {resolve = done;});return {promise, resolve};};
  function environment() {
    let lock = Promise.resolve();
    const env = {user: user('staff-a'), local: storage(), rows: new Map([['T2-other-device', {uid: 'staff-a'}]]), events: [], getTokenCalls: 0};
    env.locks = {request: (_name, options, callback) => {
      const next = lock.then(() => options.signal?.aborted ? 'cancelled' : callback());
      lock = next.catch(() => {});return next;
    }};
    return env;
  }
  async function tab(env) {
    const session = storage(), cache = new Map(), apps = [], authStates = new Map();
    const registration = {scope: origin + '/firebase-cloud-messaging-push-scope',
      active: {scriptURL: origin + '/firebase-messaging-sw.js', state: 'activated'},
      pushManager: {getSubscription: async () => ({options: {applicationServerKey: new Uint8Array([1, 2, 3]).buffer}})}};
    const context = vm.createContext({console: {info: () => {}, warn: (...args) => env.events.push(['warning', ...args]), error: () => {}},
      URL, Uint8Array, AbortController, setTimeout, clearTimeout, btoa: value => Buffer.from(value, 'binary').toString('base64'),
      location: {hostname: 'crmdoceria-9959e.web.app', origin},
      window: {location: {origin}, localStorage: env.local, sessionStorage: session, Notification: {}},
      localStorage: env.local, sessionStorage: session, Notification: {permission: 'granted'},
      navigator: {platform: 'fixture', userAgent: 'fixture', locks: env.locks, serviceWorker: {
        getRegistrations: async () => [registration], register: () => {throw Error('Unexpected worker registration');},
      }},
      fetch: async () => ({ok: true, json: async () => ({projectId: 'crmdoceria-9959e', appId: 'fixture', apiKey: 'fixture'})}),
    });
    const sdk = {
      getApps: () => apps,
      initializeApp: (options, name = '[DEFAULT]') => {const app = {options, name};apps.push(app);return app;},
      getAuth: app => {
        if (!authStates.has(app)) authStates.set(app, {app, get currentUser() {return app.name === '[DEFAULT]' ? env.user : null;}, authStateReady: async () => {}});
        return authStates.get(app);
      },
      getFirestore: () => ({}), getFunctions: () => ({}), onAuthStateChanged: () => () => {},
      httpsCallable: () => async () => {throw Error('Unexpected callable');},
      signOut: async auth => {if (auth.app.name === '[DEFAULT]') {env.events.push(['signOut', env.user?.uid]);env.user = null;}},
      isSupported: async () => true, getMessaging: () => ({}),
      getToken: async () => {env.getTokenCalls++;return 'T1-current-browser';},
      doc: (_db, collection, id) => ({collection, id}), serverTimestamp: () => 0,
      setDoc: async (ref, data) => {
        env.events.push(['write-start', ref.id]);
        if (env.writeGate) await env.writeGate.promise;
        env.rows.set(ref.id, data);env.events.push(['write-end', ref.id]);
      },
      runTransaction: async (_db, callback) => {
        const deleted = [];
        const result = await callback({
          get: async ref => ({exists: () => env.rows.has(ref.id), data: () => env.rows.get(ref.id)}),
          delete: ref => deleted.push(ref.id),
        });
        for (const id of deleted) {env.rows.delete(id);env.events.push(['delete', id]);}
        return result;
      },
    };
    function synthetic(id, values) {
      if (!cache.has(id)) cache.set(id, new vm.SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, {context, identifier: id}));
      return cache.get(id);
    }
    async function load(specifier, parent) {
      if (specifier.startsWith('https:')) {
        const service = specifier.match(/firebase-([\w-]+)\.js$/)?.[1];assert.ok(service, specifier);
        return synthetic(specifier, Object.fromEntries(Object.keys(require('firebase/' + service)).map(key => [key, sdk[key] || (() => {})])));
      }
      if (specifier === '@capacitor/core') return synthetic(specifier, {Capacitor: {isNativePlatform: () => false}, registerPlugin: () => ({})});
      if (specifier === 'firebase/messaging') return synthetic(specifier, {getToken: sdk.getToken, onMessage: () => () => {}});
      if (specifier === 'firebase/firestore') return synthetic(specifier, sdk);
      if (specifier === '../firebaseConfig.js') return synthetic(specifier, {auth: sdk.getAuth(apps[0]), db: {}, messagingPromise: Promise.resolve({}), VAPID_KEY: ''});
      if (specifier === './orderAlertDeduper.js') return synthetic(specifier, {claimOrderAlert: async () => true});
      const url = specifier.startsWith('/') ? pathToFileURL(path.join(root, 'crm/public', specifier.split('?')[0])) : new URL(specifier, parent.identifier);
      url.search = '';const filename = fileURLToPath(url);
      if (!cache.has(filename)) cache.set(filename, new vm.SourceTextModule(fs.readFileSync(filename, 'utf8'), {
        context, identifier: url.href, importModuleDynamically: async (target, module) => {
          const dependency = await load(target, module);
          if (dependency.status === 'unlinked') await dependency.link(load);
          if (dependency.status === 'linked') await dependency.evaluate();
          return dependency;
        },
      }));
      return cache.get(filename);
    }
    async function module(filename) {
      const entry = await load('./' + filename, {identifier: pathToFileURL(root + '/').href});
      await entry.link(load);await entry.evaluate();return entry.namespace;
    }
    const config = await module('crm/public/firebaseClientConfig.js');
    const notifications = await module('crm/src/utils/notifications.js');
    return {session, config, notifications};
  }

  // Actual registration in A, actual public logout in an independent B tab.
  {
    const env = environment(), a = await tab(env), b = await tab(env);
    await a.notifications.registerDeviceForPush('staff-a');
    assert.ok(a.session.getItem('doceria-staff-push-device'));
    assert.equal(b.session.getItem('doceria-staff-push-device'), null);
    await Promise.all([b.config.logout(), b.config.logout()]);
    assert.equal(env.user, null);assert.equal(env.rows.has('T1-current-browser'), false);
    assert.equal(env.rows.has('T2-other-device'), true);
    assert.equal(env.events.filter(event => event[0] === 'delete').length, 1);
    await a.config.logout(); // Propagated logout/repeated cleanup is harmless.
    env.user = user('customer-b', '1002');
    assert.equal(env.rows.has('T1-current-browser'), false);
    assert.equal(a.config.auth.currentUser.uid, 'customer-b');
    assert.equal(b.config.auth.currentUser.uid, 'customer-b');
  }
  // Cross-tab deletion waits for an already-issued Staff write under the lock.
  {
    const env = environment(), a = await tab(env), b = await tab(env);
    env.writeGate = deferred();const registration = a.notifications.registerDeviceForPush('staff-a');
    for (let i = 0; i < 100 && !env.events.some(event => event[0] === 'write-start'); i++) await tick();
    assert.ok(env.events.some(event => event[0] === 'write-start'));
    const logout = b.config.logout();await tick();
    assert.notEqual(env.user, null);assert.equal(env.events.some(event => event[0] === 'delete'), false);
    env.writeGate.resolve();await registration;await logout;
    assert.equal(env.rows.has('T1-current-browser'), false);assert.equal(env.rows.has('T2-other-device'), true);
    assert.ok(env.events.findIndex(event => event[0] === 'write-end') < env.events.findIndex(event => event[0] === 'delete'));
    assert.equal(await a.notifications.registerDeviceForPush('staff-a'), null);
  }
  // A stale marker may not remove another UID's current browser association.
  {
    const env = environment(), b = await tab(env);
    env.rows.set('T1-current-browser', {uid: 'staff-b'});
    await b.config.logout();assert.equal(env.rows.get('T1-current-browser').uid, 'staff-b');
  }
  // Permission/error fallback never causes a broad deletion or blocks Auth logout.
  {
    const env = environment(), b = await tab(env);
    env.rows.set('T1-current-browser', {uid: 'staff-a'});
    env.rows.get = () => {throw Object.assign(new Error('fixture-private-error'), {code: 'fixture'});};
    await b.config.logout();assert.equal(env.user, null);assert.equal(env.rows.has('T2-other-device'), true);
    assert.ok(env.events.some(event => event.includes('cleanup-incomplete')));
    assert.equal(JSON.stringify(env.events).includes('fixture-private-error'), false);
  }
  // Same UID/context/token renewal keeps registration; a new explicit sign-in is allowed.
  {
    const env = environment(), a = await tab(env), b = await tab(env);
    await a.notifications.registerDeviceForPush('staff-a');
    await a.notifications.registerDeviceForPush('staff-a');assert.equal(env.events.some(event => event[0] === 'delete'), false);
    await b.config.logout();env.user = user('staff-a', '1002');
    assert.equal(await a.notifications.registerDeviceForPush('staff-a'), 'T1-current-browser');
    assert.equal(env.rows.get('T1-current-browser').uid, 'staff-a');
  }
  // Without coordination primitives do not introduce an uncoordinated new web association.
  {
    const env = environment();env.locks = undefined;const a = await tab(env);
    assert.equal(await a.notifications.registerDeviceForPush('staff-a'), null);
    assert.equal(env.events.some(event => event[0] === 'write-start'), false);
  }
  // Both tabs initiate logout while still observing the same UID.
  {
    const env = environment(), a = await tab(env), b = await tab(env);
    await a.notifications.registerDeviceForPush('staff-a');
    await Promise.all([a.config.logout(), b.config.logout()]);
    assert.equal(env.user, null);assert.equal(env.rows.has('T1-current-browser'), false);
    assert.equal(env.rows.has('T2-other-device'), true);
    assert.equal(env.events.filter(event => event[0] === 'delete').length, 1);
  }
  console.log('STAFF_PUSH_CROSS_TAB_PASS scenarios=7');
}
