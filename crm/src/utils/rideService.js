const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

const firstText = (...values) => values.map(cleanText).find(Boolean) || '';

const parseCoordinate = (value, min, max) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

export const formatRideAddress = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value !== 'object') return '';

  const formatted = firstText(
    value.enderecoCompleto,
    value.formattedAddress,
    value.formatted_address,
    value.fullAddress,
    value.texto
  );
  if (formatted) return formatted;

  const street = firstText(value.rua, value.logradouro, value.street, value.addressLine1);
  const number = firstText(value.numero, value.number);
  const complement = firstText(value.complemento, value.complement, value.addressLine2);
  const neighborhood = firstText(value.bairro, value.district, value.neighborhood);
  const city = firstText(value.cidade, value.city, value.municipio);
  const state = firstText(value.uf, value.estado, value.state);
  const zip = firstText(value.cep, value.zip, value.postalCode);

  return [
    [street, number].filter(Boolean).join(', '),
    complement,
    neighborhood,
    [city, state].filter(Boolean).join(' - '),
    zip ? `CEP ${zip}` : ''
  ].filter(Boolean).join(', ');
};

const getCoordinates = (...sources) => {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;

    const candidates = [
      source,
      source.location,
      source.localizacao,
      source.coordinates,
      source.coordenadas,
      source.geolocation,
      source.geo
    ].filter((item) => item && typeof item === 'object');

    for (const candidate of candidates) {
      const latitude = parseCoordinate(
        candidate.latitude ?? candidate.lat ?? candidate._lat,
        -90,
        90
      );
      const longitude = parseCoordinate(
        candidate.longitude ?? candidate.lng ?? candidate.lon ?? candidate._long,
        -180,
        180
      );
      if (latitude !== null && longitude !== null) return { latitude, longitude };
    }
  }

  return null;
};

const getStoreFreightAddressSource = (freightConfig = {}) => (
  freightConfig.enderecoLoja
  || freightConfig.endereco
  || freightConfig.address
  || freightConfig
);

const getOrderDeliveryAddressSource = (order = {}) => (
  order.enderecoEntrega
  || order.deliveryAddress
  || order.clienteEndereco
  || order.enderecoDelivery
  || order.delivery?.address
  || null
);

export const isDeliveryOrder = (order = {}) => {
  const category = String(order.categoria || order.tipoEntrega || order.tipo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  return category === 'delivery' || category === 'entrega';
};

export const getOrderStoreId = (order = {}) => cleanText(order.lojaId);

export const buildRideAddresses = (order = {}, store = {}, freightConfig = {}) => {
  const storeAddressSource = getStoreFreightAddressSource(freightConfig);
  const deliveryAddressSource = getOrderDeliveryAddressSource(order);

  return {
    origin: {
      name: firstText(
        store.razaoSocial,
        store.nomeFantasia,
        store.nome,
        store.name,
        order.lojaNome,
        getOrderStoreId(order)
      ) || 'Loja',
      address: formatRideAddress(storeAddressSource),
      coordinates: getCoordinates(freightConfig, storeAddressSource)
    },
    destination: {
      name: firstText(order.clienteNome, order.customerName) || 'Cliente',
      address: formatRideAddress(deliveryAddressSource),
      coordinates: getCoordinates(deliveryAddressSource, order)
    }
  };
};

const toUberLocation = ({ name, address, coordinates }) => {
  const location = {
    addressLine1: name,
    addressLine2: address
  };

  if (coordinates) {
    location.latitude = coordinates.latitude;
    location.longitude = coordinates.longitude;
  }

  return location;
};

export const buildUberRideUrl = ({ origin, destination, clientId = '' }) => {
  const params = new URLSearchParams();
  if (cleanText(clientId)) params.set('client_id', clientId.trim());
  params.set('pickup', JSON.stringify(toUberLocation(origin)));
  params.set('drop[0]', JSON.stringify(toUberLocation(destination)));
  return `https://m.uber.com/looking?${params.toString()}`;
};

// Link publicado pela própria 99 na página oficial de download do passageiro.
// A 99 não documenta atualmente parâmetros públicos para preencher uma corrida.
export const build99OpenUrl = () => 'https://99.onelink.me/Mayr';
