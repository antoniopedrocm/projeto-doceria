import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

// Run the native ESM linker, not a transpiled/mock copy of public modules.
// Only the external CDN SDK boundary is synthetic; local modules and inline
// menu entry points are compiled and recursively linked from their real bytes.
if (!process.env.PUBLIC_AUTH_ESM_WORKER) {
  test('real public ESM graph links, evaluates auth entry, and rejects missing exports', () => {
    const child = spawnSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(import.meta.url)], {
      env: {...process.env, PUBLIC_AUTH_ESM_WORKER: '1'}, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(child.status, 0, child.stdout + child.stderr);
    assert.match(child.stdout, /PUBLIC_AUTH_ESM_PASS entries=5 negativeControls=2/);
  });
} else {
  const vm = await import('node:vm');
  const {createRequire} = await import('node:module');
  const require = createRequire(import.meta.url);
  const {parse} = require('@babel/parser');
  const root = path.resolve(process.env.PUBLIC_AUTH_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
  const storage = () => {const values = new Map();return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};};
  async function graph(entry, {html = false, missing} = {}) {
    const local = storage(), session = storage();
    const context = vm.createContext({console, URL, Uint8Array, AbortController, setTimeout, clearTimeout,
      location: {hostname: '127.0.0.1', origin: 'http://127.0.0.1:5000'},
      window: {localStorage: local, sessionStorage: session}, localStorage: local, sessionStorage: session});
    const cache = new Map();
    const apps = [];
    const states = new Map();
    const authFor = app => {
      if (!states.has(app)) states.set(app, {app, currentUser: null, authStateReady: async () => {}});
      return states.get(app);
    };
    const overrides = {
      getApps: () => apps,
      initializeApp: (options, name = '[DEFAULT]') => {const app = {options, name};apps.push(app);return app;},
      getAuth: authFor, initializeAuth: authFor, getFirestore: () => ({}), getFunctions: () => ({}),
      httpsCallable: () => async () => {throw Error('Unexpected callable execution');},
      onAuthStateChanged: () => () => {},
      connectAuthEmulator: () => {}, connectFirestoreEmulator: () => {}, connectFunctionsEmulator: () => {},
    };
    const sdk = new Map();
    function compile(source, identifier) {
      for (const node of parse(source, {sourceType: 'module'}).program.body) {
        if (node.type !== 'ImportDeclaration' || !node.source.value.startsWith('https:')) continue;
        const url = node.source.value;
        assert.match(url, /^https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/firebase-[\w-]+\.js$/);
        const service = url.match(/firebase-([\w-]+)\.js$/)[1];
        const actualExports = Object.keys(require('firebase/' + service));
        if (!sdk.has(url)) sdk.set(url, new vm.SyntheticModule(actualExports, function () {
          for (const name of actualExports) this.setExport(name, overrides[name] || (() => {}));
        }, {context, identifier: url}));
      }
      return new vm.SourceTextModule(source, {context, identifier,
        initializeImportMeta: meta => {meta.url = identifier;}});
    }
    async function linker(specifier, parent) {
      if (specifier.startsWith('https:')) return sdk.get(specifier);
      assert.ok(specifier.startsWith('.'), 'Unexpected external import ' + specifier);
      const absolute = new URL(specifier, parent.identifier);
      absolute.search = '';absolute.hash = '';
      const filename = fileURLToPath(absolute);
      assert.ok(path.relative(root, filename) && !path.relative(root, filename).startsWith('..'), 'Import escaped public root');
      if (!cache.has(filename)) {
        let source = fs.readFileSync(filename, 'utf8');
        if (missing && filename === path.join(root, 'firebaseClientConfig.js')) {
          source = source.replace(new RegExp('^  ' + missing + ',\\r?$', 'm'), '');
        }
        cache.set(filename, compile(source, absolute.href));
      }
      return cache.get(filename);
    }
    const filename = path.join(root, entry);
    const source = fs.readFileSync(filename, 'utf8');
    // A valid export alone is insufficient when the old URL is immutable.
    assert.equal(source.includes('20261014-single-session'), false, entry + ' retains a cached broken entry URL');
    assert.equal(source.includes('20261014-auth-logout-fix'), false, entry + ' retains the cached read-before-delete entry URL');
    if (!html) {
      const module = compile(source, new URL('file:///' + filename.replace(/\\/g, '/')).href);
      cache.set(filename, module);
      await module.link(linker);
      await module.evaluate(); // Real config TLA + real local dependency graph.
      return module;
    }
    const scripts = [...source.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length > 0, entry + ' must contain the real module entry');
    assert.ok(scripts.some(match => match[1].includes('customer-account.js')), entry + ' must load Customer auth');
    for (const [index, match] of scripts.entries()) {
      const module = compile(match[1], new URL('file:///' + filename.replace(/\\/g, '/') + '?inline=' + index).href);
      await module.link(linker); // Do not execute cart/DOM/business operations.
    }
  }
  await graph('firebaseClientConfig.js');
  await graph('customer-account.js');
  for (const entry of ['cardapio-matriz.html', 'cardapio-garavelo.html', 'cardapio-festa.html']) await graph(entry, {html: true});
  for (const missing of ['logout', 'sessionTransition']) {
    await assert.rejects(() => graph('customer-account.js', {missing}), error =>
      error.name === 'SyntaxError' && error.message.includes("does not provide an export named '" + missing + "'"));
  }
  console.log('PUBLIC_AUTH_ESM_PASS entries=5 negativeControls=2');
}
