// Pricing only: distance comes from the existing Google Maps Distance Matrix.
const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const amount = (value, label) => {
  const number = Number(value);
  if (value == null || String(value).trim() === '' || !Number.isFinite(number) ||
      number < 0 || !Number.isSafeInteger(Math.round(number * 100))) {
    throw new Error(`${label} inválido.`);
  }
  return number;
};

const validateFreightCoordinates = ({lat, lng} = {}) => {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (lat == null || lng == null || String(lat).trim() === '' || String(lng).trim() === '' ||
      !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new Error('Coordenadas da loja inválidas. Corrija latitude e longitude em Configurações → Frete.');
  }
  return {lat: latitude, lng: longitude};
};

const quoteFreight = ({config = {}, distanceKm = null, requestedFreight = 0, pickup = false} = {}) => {
  if (pickup) return {freteACombinar: false, tipoFrete: 'retirada', valorFrete: 0};
  if (config.freteACombinar === true) {
    return {freteACombinar: true, tipoFrete: 'a_combinar', valorFrete: 0};
  }
  // Preserve the production cardápio's previous minimum until explicitly configured.
  const minimum = amount(config.valorMinimoFrete ?? 2, 'Valor mínimo de frete');
  const calculated = distanceKm == null ? amount(requestedFreight, 'Valor de frete') :
    amount(distanceKm, 'Distância') * amount(config.valorPorKm, 'Valor por KM');
  return {freteACombinar: false, tipoFrete: 'calculado',
    valorFrete: money(amount(Math.max(calculated, minimum), 'Valor de frete'))};
};

const totalWithFreight = (subtotalAfterDiscount, quote) => money(
    amount(subtotalAfterDiscount, 'Subtotal') + (quote.freteACombinar ? 0 : amount(quote.valorFrete, 'Valor de frete')),
);

const extractFreightConfig = (data = {}) => {
  const candidate = data.frete || data;
  return ['lat', 'lng', 'valorPorKm', 'valorMinimoFrete', 'freteACombinar']
      .some((field) => Object.prototype.hasOwnProperty.call(candidate, field)) ? candidate : null;
};

// Read-only, including legacy locations, always within the requested store.
const loadStoreFreightConfig = async ({db, storeId, read = (ref) => ref.get(), primaryData}) => {
  if (!storeId) throw new Error('Loja obrigatória para calcular o frete.');
  if (primaryData === undefined) {
    const snapshot = await read(db.doc(`lojas/${storeId}/configuracoes/config`));
    primaryData = snapshot.exists ? snapshot.data() : {};
  }
  let config = extractFreightConfig(primaryData);
  if (config) return config;
  for (const path of ['configuracoes/frete', 'info/dados']) {
    const snapshot = await read(db.doc(`lojas/${storeId}/${path}`));
    if (snapshot.exists) config = extractFreightConfig(path === 'info/dados' ? {frete: snapshot.data()?.frete || {}} : snapshot.data());
    if (config) return config;
  }
  throw new Error('Configuração de frete não encontrada para esta loja.');
};

const orderFreightSnapshot = ({config, quote, storeId, distanceKm}) => ({
  ...quote,
  frete: quote.valorFrete,
  distanciaFreteKm: quote.tipoFrete === 'calculado' && distanceKm != null ? Number(distanceKm) : null,
  freteConfiguracao: {
    lojaId: storeId,
    valorPorKm: quote.tipoFrete === 'calculado' && Number.isFinite(Number(config.valorPorKm)) ? Number(config.valorPorKm) : null,
    valorMinimoFrete: quote.tipoFrete === 'calculado' ? Number(config.valorMinimoFrete ?? 2) : null,
    origem: config.lat != null && config.lng != null ? {lat: config.lat, lng: config.lng} : null,
  },
});

module.exports = {quoteFreight, totalWithFreight, validateFreightCoordinates,
  extractFreightConfig, loadStoreFreightConfig, orderFreightSnapshot};
