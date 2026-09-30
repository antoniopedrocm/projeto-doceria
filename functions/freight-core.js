const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const totalWithFreight = (subtotalAfterDiscount, freightQuote) => {
  const subtotal = Number(subtotalAfterDiscount);
  if (!Number.isFinite(subtotal) || subtotal < 0) throw new Error('Subtotal inválido.');
  return money(subtotal + freightQuote.valorFrete);
};

// The distance is supplied by the existing Google Maps flow. This module owns
// only the pricing rule; it deliberately does not calculate or change distance.
const quoteFreight = ({config = {}, distanceKm = null, requestedFreight = 0, pickup = false} = {}) => {
  if (pickup) return {freteACombinar: false, tipoFrete: 'retirada', valorFrete: 0};
  if (config.freteACombinar === true) {
    return {freteACombinar: true, tipoFrete: 'a_combinar', valorFrete: 0};
  }

  const minimum = config.valorMinimoFrete == null
    ? 2 // Existing cardápio minimum for stores not yet configured.
    : Number(config.valorMinimoFrete);
  if (!Number.isFinite(minimum) || minimum < 0) throw new Error('Configuração de frete inválida.');

  let calculated;
  if (distanceKm !== null && distanceKm !== undefined) {
    const distance = Number(distanceKm);
    const rate = Number(config.valorPorKm);
    if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(rate) || rate < 0) {
      throw new Error('Distância ou valor por KM inválido.');
    }
    calculated = distance * rate;
  } else {
    // Compatibility with checkouts opened before this release.
    calculated = Number(requestedFreight);
    if (!Number.isFinite(calculated) || calculated < 0) throw new Error('Valor de frete inválido.');
  }

  if (!Number.isFinite(calculated) || !Number.isSafeInteger(Math.round(calculated * 100))) {
    throw new Error('Valor de frete inválido.');
  }
  return {freteACombinar: false, tipoFrete: 'calculado', valorFrete: money(Math.max(calculated, minimum))};
};

module.exports = {quoteFreight, totalWithFreight};
