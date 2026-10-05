/* global globalThis:readonly */
const {URL, URLSearchParams} = require('node:url');
const {validateFreightCoordinates} = require('./freight-core');

const freightError = (httpStatus, code, message) => Object.assign(new Error(message), {httpStatus, code});

// The destination is the address persisted on the order, never a caller's distance
// or coordinates. Google resolves the address and measures the driving route.
// https://developers.google.com/maps/documentation/distance-matrix/distance-matrix
async function resolveFreightDistance({config, address, apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY,
  fetch = (...args) => globalThis.fetch(...args)} = {}) {
  if (typeof address !== 'string' || !address.trim() || address.length > 1000 || /[|\r\n]/.test(address)) {
    throw freightError(409, 'FREIGHT_INVALID', 'Confirme novamente o endereço de entrega.');
  }
  const origin = validateFreightCoordinates(config);
  if (!apiKey) throw freightError(503, 'FREIGHT_UNAVAILABLE', 'Não foi possível verificar o frete. Tente novamente.');
  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.search = new URLSearchParams({origins: `${origin.lat},${origin.lng}`, destinations: address.trim(),
    mode: 'driving', units: 'metric', language: 'pt-BR', region: 'br', key: apiKey}).toString();
  try {
    const response = await fetch(url.href, {signal: globalThis.AbortSignal.timeout(8000)});
    const data = await response.json();
    const element = data.rows?.[0]?.elements?.[0];
    if (response.ok && data.status === 'OK' && ['ZERO_RESULTS', 'NOT_FOUND'].includes(element?.status)) {
      throw freightError(409, 'FREIGHT_INVALID', 'Confirme novamente o endereço de entrega.');
    }
    const meters = element?.distance?.value;
    if (!response.ok || data.status !== 'OK' || data.rows?.length !== 1 ||
        data.rows[0].elements?.length !== 1 || element?.status !== 'OK' ||
        typeof meters !== 'number' || !Number.isSafeInteger(meters) || meters < 0) {
      throw freightError(503, 'FREIGHT_UNAVAILABLE', 'Não foi possível verificar o frete. Tente novamente.');
    }
    return meters / 1000;
  } catch (error) {
    if (error.code === 'FREIGHT_INVALID' || error.code === 'FREIGHT_UNAVAILABLE') throw error;
    // Do not propagate provider URLs, credentials, destination or raw errors to logs.
    throw freightError(503, 'FREIGHT_UNAVAILABLE', 'Não foi possível verificar o frete. Tente novamente.');
  }
}

module.exports = {resolveFreightDistance};
