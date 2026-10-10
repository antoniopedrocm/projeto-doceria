const {test} = require('node:test');
const assert = require('node:assert/strict');
const {InfinitePayProvider} = require('./checkout-payment');

const payload = {
  handle: 'merchant-test', order_nsu: 'private-order-correlation-123',
  items: [{quantity: 1, price: 1200, description: 'private-order-description'}],
  customer: {name: 'Private Customer Fixture', email: 'private-fixture@example.test', phone_number: '+5562999991234'},
};
const secrets = ['private-order-correlation-123', 'private-order-description', 'Private Customer Fixture',
  'private-fixture@example.test', '+5562999991234', 'secret-fixture-token', 'cookie-fixture', 'password-fixture'];
const controlled = error => {
  assert.equal(error.httpStatus, 502);
  assert.equal(error.message, 'A InfinitePay não respondeu. Consulte o pedido antes de tentar novamente.');
  assert.deepEqual(Object.keys(error), ['httpStatus']);
  return true;
};
const privateBody = {
  error: {code: 'invalid_phone_number', message: 'Invalid phone format for Private Customer Fixture private-fixture@example.test',
    field: 'customer.phone_number', token: 'secret-fixture-token', cookie: 'cookie-fixture', password: 'password-fixture'},
  request: payload,
};

for (const status of [400, 500]) {
  test(`upstream ${status} registra diagnóstico seguro e mantém erro público genérico`, async () => {
    const entries = [];
    let calls = 0;
    const provider = new InfinitePayProvider({logError: entry => entries.push(entry), fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify(privateBody), {status, statusText: status === 400 ? 'Bad Request' : 'Internal Server Error',
        headers: {'Content-Type': 'application/json; charset=utf-8'}});
    }});
    await assert.rejects(provider.create(payload), controlled);
    assert.equal(calls, 1);
    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.equal(entry.upstreamStatus, status);
    assert.equal(entry.upstreamStatusText, status === 400 ? 'Bad Request' : 'Internal Server Error');
    assert.equal(entry.contentType, 'application/json');
    assert.equal(entry.endpoint, 'https://api.checkout.infinitepay.io/links');
    assert.equal(entry.kind, 'http_error');
    assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(entry.correlation, /^[a-f0-9]{12}$/);
    assert.deepEqual(entry.body.codes, ['invalid_phone_number']);
    assert.ok(entry.body.fields.includes('customer.phone_number'));
    assert.ok(entry.body.signals.includes('phone_invalid'));
    assert.equal(entry.body.rawOmitted, true);
    for (const secret of secrets) assert.ok(!JSON.stringify(entry).includes(secret), secret);
  });
}

test('timeout e DNS/TLS possuem classificação distinta sem expor mensagem/cause', async () => {
  for (const [error, kind, code] of [
    [Object.assign(new Error('secret-fixture-token'), {name: 'TimeoutError'}), 'timeout', null],
    [Object.assign(new Error(payload.customer.email), {cause: {code: 'ENOTFOUND'}}), 'network_error', 'ENOTFOUND'],
    [Object.assign(new Error(payload.customer.name), {cause: {code: 'ERR_TLS_CERT_ALTNAME_INVALID'}}), 'network_error', 'ERR_TLS_CERT_ALTNAME_INVALID'],
  ]) {
    const entries = [];
    const provider = new InfinitePayProvider({logError: entry => entries.push(entry), fetchImpl: async () => {throw error;}});
    await assert.rejects(provider.create(payload), controlled);
    assert.equal(entries[0].kind, kind);
    assert.equal(entries[0].errorCode, code);
    assert.equal(entries[0].upstreamStatus, null);
    for (const secret of secrets) assert.ok(!JSON.stringify(entries).includes(secret));
  }
});

test('corpo/headers desconhecidos não vazam PII ou secrets e amostra é limitada', async () => {
  for (const content of [JSON.stringify({error: {code: 'secret-fixture-token', message: 'Private Customer Fixture'},
    customer: payload.customer}), '<html>private-fixture@example.test secret-fixture-token</html>', 'x'.repeat(10000)]) {
    const entries = [];
    const provider = new InfinitePayProvider({logError: entry => entries.push(entry), fetchImpl: async () =>
      new Response(content, {status: 400, statusText: 'Private Customer Fixture',
        headers: {'Content-Type': 'text/html; secret=secret-fixture-token', 'Set-Cookie': 'cookie-fixture'}})});
    await assert.rejects(provider.create(payload), controlled);
    assert.equal(entries[0].upstreamStatusText, null);
    assert.equal(entries[0].contentType, 'text/html');
    assert.ok(entries[0].body.sampleBytes <= 4096);
    if (content.length > 4096) assert.equal(entries[0].body.truncated, true);
    for (const secret of secrets) assert.ok(!JSON.stringify(entries).includes(secret));
  }
});

test('falha ao ler erro preserva status; JSON inesperado permanece controlado', async () => {
  const entries = [];
  const response = new Response('{not-json', {status: 200});
  await assert.rejects(new InfinitePayProvider({logError: entry => entries.push(entry),
    fetchImpl: async () => response}).create(payload), controlled);
  assert.equal(entries[0].kind, 'invalid_response');
  assert.equal(entries[0].upstreamStatus, 200);
  const body = new ReadableStream({start(controller) {controller.error(new Error(payload.customer.email));}});
  await assert.rejects(new InfinitePayProvider({logError: entry => entries.push(entry),
    fetchImpl: async () => new Response(body, {status: 500})}).create(payload), controlled);
  assert.equal(entries[1].upstreamStatus, 500);
  for (const secret of secrets) assert.ok(!JSON.stringify(entries).includes(secret));
});

test('sucesso não registra dados, mantém payload/headers/prazo e falha de logger não repete', async () => {
  let calls = 0;
  let seen;
  const entries = [];
  const provider = new InfinitePayProvider({logError: entry => entries.push(entry), fetchImpl: async (url, options) => {
    calls++; seen = {url, options};
    return new Response(JSON.stringify({url: 'https://checkout.infinitepay.com.br/test-only'}));
  }});
  assert.deepEqual(await provider.create(payload), {url: 'https://checkout.infinitepay.com.br/test-only'});
  assert.equal(entries.length, 0);
  assert.equal(seen.url, 'https://api.checkout.infinitepay.io/links');
  assert.equal(seen.options.method, 'POST');
  assert.deepEqual(seen.options.headers, {'Content-Type': 'application/json'});
  assert.deepEqual(JSON.parse(seen.options.body), payload);
  assert.ok(seen.options.signal instanceof AbortSignal);
  assert.equal(calls, 1);
  const failingLogger = new InfinitePayProvider({logError: () => {throw new Error('secret-fixture-token');},
    fetchImpl: async () => {calls++; return new Response('{}', {status: 400});}});
  await assert.rejects(failingLogger.create(payload), controlled);
  assert.equal(calls, 2);
});
