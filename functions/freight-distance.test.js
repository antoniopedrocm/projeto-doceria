const {test} = require('node:test');
const assert = require('node:assert/strict');
const {URL} = require('node:url');
const {resolveFreightDistance} = require('./freight-distance');
const config = {lat: -16, lng: -49};
const success = meters => ({ok: true, json: async () => ({status: 'OK',
  rows: [{elements: [{status: 'OK', distance: {value: meters}}]}]})});

test('segredo do runtime é lido na chamada sem precisar fornecer chave pelo payload', async () => {
  const previous = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  try {
    process.env.GOOGLE_MAPS_SERVER_API_KEY = 'runtime-test-only';
    const distance = await resolveFreightDistance({config, address: 'Rua de teste',
      fetch: async url => {
        assert.equal(new URL(url).searchParams.get('key'), 'runtime-test-only');
        return success(2000);
      }});
    assert.equal(distance, 2);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
    else process.env.GOOGLE_MAPS_SERVER_API_KEY = previous;
  }
});

test('distância oficial usa origem da loja e endereço do pedido, sem distância/coordenadas do cliente', async () => {
  const requests = [];
  const distance = await resolveFreightDistance({config, address: 'Rua X, 1 &origins=outro',
    apiKey: 'fake', distanceKm: 0, lat: 0, lng: 0,
    fetch: async url => {requests.push(new URL(url));return success(2000);}});
  assert.equal(distance, 2);
  assert.equal(requests[0].origin, 'https://maps.googleapis.com');
  assert.equal(requests[0].searchParams.get('origins'), '-16,-49');
  assert.equal(requests[0].searchParams.get('destinations'), 'Rua X, 1 &origins=outro');
  assert.equal(requests[0].searchParams.get('mode'), 'driving');
});

test('zero oficial é válido; não há fallback para valor ou distância do cliente', async () => {
  assert.equal(await resolveFreightDistance({config, address: 'Rua X', apiKey: 'fake', fetch: async () => success(0)}), 0);
  for (const apiKey of [undefined, '']) {
    await assert.rejects(resolveFreightDistance({config, address: 'Rua X', apiKey, fetch: async () => {throw Error('must not call');}}),
      error => error.httpStatus === 503);
  }
});

test('erro/timeout/provedor inválido falham fechados e não expõem chave ou URL', async () => {
  for (const response of [success(-1), success('2000'), {ok: false, json: async () => ({})},
    {ok: true, json: async () => ({status: 'REQUEST_DENIED'})}]) {
    await assert.rejects(resolveFreightDistance({config, address: 'Rua X', apiKey: 'secret', fetch: async () => response}),
      error => error.httpStatus === 503 && !error.message.includes('secret'));
  }
  await assert.rejects(resolveFreightDistance({config, address: 'Rua X', apiKey: 'secret',
    fetch: async () => {throw Error('https://example.test?key=secret');}}),
  error => error.httpStatus === 503 && !error.message.includes('secret'));
});

test('endereço ausente/múltiplos destinos e rota inexistente são rejeitados', async () => {
  for (const address of ['', null, 'Rua X|Rua Y', 'Rua X\nRua Y']) {
    await assert.rejects(resolveFreightDistance({config, address, apiKey: 'fake'}), error => error.httpStatus === 409);
  }
  await assert.rejects(resolveFreightDistance({config, address: 'Rua X', apiKey: 'fake',
    fetch: async () => ({ok: true, json: async () => ({status: 'OK', rows: [{elements: [{status: 'ZERO_RESULTS'}]}]})})}),
  error => error.httpStatus === 409);
});
