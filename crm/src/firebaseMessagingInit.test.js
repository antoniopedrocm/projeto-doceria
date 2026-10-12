const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Exercise the actual bootstrap expression without evaluating this module's
// CRA/Vite import.meta configuration in Jest's CommonJS environment.
const source = fs.readFileSync(path.join(__dirname, 'firebaseConfig.js'), 'utf8');
const marker = 'export const messagingPromise =';
const expression = source.slice(source.indexOf(marker) + marker.length).trim().replace(/;$/, '');

test('bootstrap with VAPID does not request permission or acquire an implicit-scope token', async () => {
  const app = { options: { projectId: 'crmdoceria-9959e' } };
  const getMessaging = jest.fn(() => ({ app }));
  const getToken = jest.fn();
  const requestPermission = jest.fn().mockResolvedValue('granted');
  const result = await vm.runInNewContext(expression, {
    app, window: {}, isLocalPreview: false,
    messagingIsSupported: async () => true,
    getMessaging, getToken, Notification: { requestPermission },
    VAPID_KEY: 'fixture-public-vapid', console,
  });
  expect(result.app.options.projectId).toBe('crmdoceria-9959e');
  expect(getMessaging).toHaveBeenCalledTimes(1);
  expect(getToken).not.toHaveBeenCalled();
  expect(requestPermission).not.toHaveBeenCalled();
});

test('unsupported Messaging leaves bootstrap inactive', async () => {
  const getMessaging = jest.fn();
  expect(await vm.runInNewContext(expression, {
    window: {}, isLocalPreview: false,
    messagingIsSupported: async () => false, getMessaging, console,
  })).toBeNull();
  expect(getMessaging).not.toHaveBeenCalled();
});
