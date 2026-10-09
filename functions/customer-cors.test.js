const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const http = require('node:http');
const {onCall} = require('firebase-functions/v2/https');

test('Customer callables preserve allowed origins and reject unrelated origins on real CORS preflight', async () => {
  const source = fs.readFileSync(require.resolve('./index'), 'utf8');
  const policy = source.match(/const LOOKUP_CLIENT_ALLOWED_ORIGINS = \[[\s\S]*?\];/)[0];
  const declarations = source.match(/^exports\.customer\w+ = onCall\([^\n]+/gm);
  assert.equal(declarations.length, 10);
  let calls = 0;
  const context = {exports: {}, onCall, customerAccounts: new Proxy({}, {get: () => () => {calls++;}})};
  vm.runInNewContext(policy + '\n' + declarations.join('\n'), context);
  const server = http.createServer((req, res) => context.exports[req.url.slice(1)](req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const name of Object.keys(context.exports)) {
      for (const origin of ['https://crmdoceria-9959e.web.app', 'https://crmdoceria-9959e.firebaseapp.com',
        'https://anaguimaraesdoceria.com.br', 'https://www.anaguimaraesdoceria.com.br',
        'http://localhost:5000', 'http://127.0.0.1:5000', 'https://untrusted.example']) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/${name}`, {
          method: 'OPTIONS', headers: {Origin: origin, 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type,authorization'},
        });
        assert.equal(response.status, 204);
        assert.equal(response.headers.get('access-control-allow-origin'),
            origin === 'https://untrusted.example' ? null : origin, `${name}: ${origin}`);
      }
    }
    assert.equal(calls, 0, 'preflight must not execute Customer mutations');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
