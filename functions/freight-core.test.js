const {test} = require('node:test');
const assert = require('node:assert/strict');
const {quoteFreight, totalWithFreight} = require('./freight-core');

test('aplica o mínimo somente quando supera distância × valor por KM', () => {
  const config = {valorPorKm: 2, valorMinimoFrete: 8, freteACombinar: false};
  assert.equal(quoteFreight({config, distanceKm: 2.5}).valorFrete, 8);
  assert.equal(quoteFreight({config, distanceKm: 6}).valorFrete, 12);
});

test('frete a combinar não soma ao total após descontos', () => {
  const quote = quoteFreight({config: {freteACombinar: true, valorPorKm: 2, valorMinimoFrete: 8}});
  assert.deepEqual(quote, {freteACombinar: true, tipoFrete: 'a_combinar', valorFrete: 0});
  assert.equal(totalWithFreight(59.4, quote), 59.4);
});

test('frete calculado compõe o total', () => {
  const quote = quoteFreight({config: {valorPorKm: 2.26, valorMinimoFrete: 0}, distanceKm: 2});
  assert.equal(quote.valorFrete, 4.52);
  assert.equal(totalWithFreight(59.4, quote), 63.92);
});

test('configurações de Matriz e Garavelo não se misturam', () => {
  const matriz = {valorPorKm: 2, valorMinimoFrete: 8, freteACombinar: false};
  const garavelo = {valorPorKm: 2.5, valorMinimoFrete: 10, freteACombinar: true};
  assert.equal(quoteFreight({config: matriz, distanceKm: 3}).valorFrete, 8);
  assert.equal(quoteFreight({config: garavelo, distanceKm: 3}).tipoFrete, 'a_combinar');
  garavelo.freteACombinar = false;
  assert.equal(quoteFreight({config: garavelo, distanceKm: 3}).valorFrete, 10);
  assert.equal(quoteFreight({config: matriz, distanceKm: 3}).valorFrete, 8);
});

test('retirada não recebe mínimo nem frete a combinar', () => {
  assert.deepEqual(quoteFreight({config: {freteACombinar: true, valorMinimoFrete: 8}, pickup: true}),
    {freteACombinar: false, tipoFrete: 'retirada', valorFrete: 0});
});
