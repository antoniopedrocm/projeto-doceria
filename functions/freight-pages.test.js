const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {quoteFreight} = require('./freight-core');

for (const page of ['matriz', 'garavelo', 'festa']) {
  const html = fs.readFileSync(path.join(__dirname, `../crm/public/cardapio-${page}.html`), 'utf8');
  test(`${page}: scripts clássicos permanecem válidos`, () => {
    for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/\bsrc=|\btype="module"/.test(match[1]) || !match[2].trim()) continue;
      assert.doesNotThrow(() => new vm.Script(match[2]));
    }
  });

  test(`${page}: mantém a distância do Google e solicita cotação da loja ao backend`, async () => {
    const start = html.indexOf('async function calcularFreteParaEndereco(destinoLatLng)');
    const end = html.indexOf('window.calcularFreteParaEndereco = calcularFreteParaEndereco;', start);
    assert.ok(start > 0 && end > start);
    const calls = [];
    const config = {lat: -16.6, lng: -49.3, valorPorKm: 2, valorMinimoFrete: 8};
    const context = {
      window: {
        dadosFrete: config, freteACombinar: false,
        API_BASE_URL: 'https://example.invalid', STORE_ID: `${page}-store`,
      },
      google: {maps: {
        DistanceMatrixService: class {getDistanceMatrix(_options, callback) {
          callback({rows: [{elements: [{status: 'OK', distance: {value: 2500}}]}]}, 'OK');
        }},
        TravelMode: {DRIVING: 'DRIVING'}, UnitSystem: {METRIC: 'METRIC'},
      }},
      fetch: async (url, options) => {
        calls.push({url, body: JSON.parse(options.body)});
        return {ok: true, json: async () => quoteFreight({config, distanceKm: JSON.parse(options.body).distanciaKm})};
      },
    };
    context.window.google = context.google;
    vm.runInNewContext(html.slice(start, end), context);
    const result = await context.calcularFreteParaEndereco({lat: -16.7, lng: -49.4});
    assert.equal(result.distanciaKm, 2.5);
    assert.equal(result.valorFrete, 8);
    assert.deepEqual(calls[0].body, {distanciaKm: 2.5});
    assert.ok(calls[0].url.includes(`lojaId=${page}-store`));
    assert.ok(html.includes('window.API_BASE_URL = API_BASE_URL;'));
  });

  test(`${page}: bloqueia origem inválida antes da chamada ao Google`, async () => {
    const start = html.indexOf('async function calcularFreteParaEndereco(destinoLatLng)');
    const end = html.indexOf('window.calcularFreteParaEndereco = calcularFreteParaEndereco;', start);
    const context = {
      window: {dadosFrete: {lat: '-16.64464130924753', lng: '-4932489499913069'}, freteACombinar: false},
      google: {maps: {}},
    };
    context.window.google = context.google;
    vm.runInNewContext(html.slice(start, end), context);
    await assert.rejects(context.calcularFreteParaEndereco({lat: -16.64, lng: -49.32}),
      /Coordenadas da loja inválidas/);
  });

  test(`${page}: visitante recebe cotação entre scripts sem variáveis globais implícitas`, async () => {
    const start = html.indexOf('async function updateGuestShippingAndSummary(latlng)');
    const end = html.indexOf('window.updateGuestShippingAndSummary = updateGuestShippingAndSummary;', start);
    const messages = [];
    const window = {
      freteACombinar: false,
      aguardarGoogleMaps: async () => undefined,
      calcularFreteParaEndereco: async () => ({valorFrete: 8, freteACombinar: false, distanciaKm: 2.5}),
      persistCheckoutState: () => undefined,
      updateGuestSummary: () => undefined,
      freightDisplayValue: () => 'R$ 8.00',
      showToast: (message) => messages.push(message),
      clearCheckoutBlockingIssue: () => undefined,
    };
    const context = {
      window,
      normalizeGuestLatLng: (value) => value,
      document: {getElementById: () => ({textContent: ''})},
      console,
    };
    vm.runInNewContext(html.slice(start, end), context);
    await context.updateGuestShippingAndSummary({lat: -16.64, lng: -49.32});
    assert.equal(window.valorFrete, 8);
    assert.equal(window.distanciaFreteKm, 2.5);
    assert.deepEqual(messages, ['Frete: R$ 8.00']);
    assert.ok(html.includes('window.freightDisplayValue = freightDisplayValue;'));
  });

  test(`${page}: a combinar dispensa cálculo e apresenta o texto correto`, async () => {
    const start = html.indexOf('async function calcularFreteParaEndereco(destinoLatLng)');
    const end = html.indexOf('window.calcularFreteParaEndereco = calcularFreteParaEndereco;', start);
    const context = {window: {dadosFrete: {freteACombinar: true}, freteACombinar: true}};
    vm.runInNewContext(html.slice(start, end), context);
    assert.equal((await context.calcularFreteParaEndereco(null)).freteACombinar, true);
    assert.ok(html.includes("cartShipping.textContent = 'A Combinar'"));
    assert.ok(html.includes("shippingValuePayment.textContent = 'A Combinar'"));
    assert.ok(html.includes("shippingValue.textContent = 'A Combinar'"));
    assert.ok(html.includes('message += `Frete: A Combinar\\n`'));
  });
}
