import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getCanonicalAuth} from '../src/canonicalAuth.mjs';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
test('one initialization per app, explicit SDK migration hierarchy and popup/redirect support', () => {
  const app = {}, auth = {}, idb = {}, local = {}, resolver = {};
  let calls = 0;
  const sdk = {indexedDBLocalPersistence:idb, browserLocalPersistence:local,
    browserPopupRedirectResolver:resolver, initializeAuth:(actual, options) => {
      calls++;assert.equal(actual,app);
      assert.deepEqual(options,{persistence:[idb,local],popupRedirectResolver:resolver});return auth;
    }};
  assert.equal(getCanonicalAuth(app,sdk),auth);
  assert.equal(getCanonicalAuth(app,sdk),auth);
  assert.equal(calls,1);
});
test('incompatible existing initialization fails closed; no silent getAuth fallback', () => {
  const app={}, error=Object.assign(Error('different policy'),{code:'auth/already-initialized'});
  assert.throws(()=>getCanonicalAuth(app,{initializeAuth:()=>{throw error;}}),e=>e===error);
});
test('public helper is the exact generated source used by the CRM', () => {
  assert.equal(read('../src/canonicalAuth.mjs'),read('../public/canonical-auth.mjs'));
});
test('both entry points configure the canonical Auth before observing or exposing it', () => {
  for(const file of ['../src/firebaseConfig.js','../public/firebaseClientConfig.js']) {
    const source=read(file);
    assert.match(source,/const auth = getCanonicalAuth\(app,/);
    assert.doesNotMatch(source,/const auth = getAuth\(app\)/);
    assert.doesNotMatch(source,/setPersistence\(/);
  }
});
test('Staff and Customer login/restore never change persistence after initialization', () => {
  for(const file of ['../src/App.js','../public/customer-account-core.mjs']) {
    assert.doesNotMatch(read(file),/setPersistence|ensurePersistence|setPreferredAuthPersistence/);
  }
});
test('same release URLs in all menu and Customer entry points, including current controller', () => {
  for(const file of ['../public/customer-account.js','../public/cardapio-matriz.html',
    '../public/cardapio-garavelo.html','../public/cardapio-festa.html']) {
    const urls=[...read(file).matchAll(/(?:customer-account(?:-core\.mjs|\.js)|firebaseClientConfig\.js)\?v=([^'"\s]+)/g)];
    assert.ok(urls.length,file);
    assert.ok(urls.every(match=>match[1]==='20261015-persistence'),file);
  }
  assert.match(read('../src/customer/customerRuntime.js'),/customer-account-core\.mjs\?v=20261015-persistence/);
});
