const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validateDevClientConfig} = require('./assert-dev-client-config.cjs');
const valid = () => ({REACT_APP_FIREBASE_API_KEY:'test-web-key',REACT_APP_FIREBASE_AUTH_DOMAIN:'crmdoceria-9959e.firebaseapp.com',REACT_APP_FIREBASE_PROJECT_ID:'crmdoceria-9959e',REACT_APP_FIREBASE_STORAGE_BUCKET:'crmdoceria-9959e.firebasestorage.app',REACT_APP_FIREBASE_MESSAGING_SENDER_ID:'123456',REACT_APP_FIREBASE_APP_ID:'1:123456:web:abcdef'});
test('accepts complete DEV public config without requiring optional measurement/VAPID', () => assert.deepEqual(validateDevClientConfig(valid()), []));
test('missing config blocks the build before generating a blank application', () => {
  for (const key of Object.keys(valid())) {const env=valid(); delete env[key]; assert.ok(validateDevClientConfig(env).length>0,key);}
});
test('production, demo and other project configurations are blocked', () => {
  for (const project of ['ana-guimaraes','demo-doceria-checkout','other']) assert.ok(validateDevClientConfig({...valid(),REACT_APP_FIREBASE_PROJECT_ID:project}).length>0);
});
test('other project auth/bucket and conflicting app identity are blocked', () => {
  for (const patch of [{REACT_APP_FIREBASE_AUTH_DOMAIN:'ana-guimaraes.firebaseapp.com'},{REACT_APP_FIREBASE_STORAGE_BUCKET:'ana-guimaraes.appspot.com'},{REACT_APP_FIREBASE_APP_ID:'1:999:web:abcdef'}]) assert.ok(validateDevClientConfig({...valid(),...patch}).length>0);
});
test('placeholder keys fail and gs bucket prefix remains supported by the runtime', () => {
  assert.ok(validateDevClientConfig({...valid(),REACT_APP_FIREBASE_API_KEY:'SUBSTITUA_PELA_CHAVE_WEB_DO_DEV'}).length>0);
  assert.deepEqual(validateDevClientConfig({...valid(),REACT_APP_FIREBASE_STORAGE_BUCKET:'gs://crmdoceria-9959e.appspot.com'}),[]);
});
