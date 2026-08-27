import {
  build99OpenUrl,
  buildRideAddresses,
  buildUberRideUrl,
  formatRideAddress,
  getOrderStoreId,
  isDeliveryOrder
} from './rideService';

describe('rideService', () => {
  test('monta origem da loja e preserva o endereço gravado no pedido', () => {
    const addresses = buildRideAddresses({
      lojaId: 'matriz',
      clienteNome: 'Yasmin Martins',
      clienteEndereco: {
        rua: 'Rua Nova',
        numero: '11098',
        complemento: 'Apto 1304',
        bairro: 'Jardim Nova Esperança',
        cidade: 'Goiânia',
        uf: 'GO',
        cep: '74000-000',
        lat: -16.68,
        lng: -49.25
      }
    }, {
      nome: 'ANA GUIMARAES DOCERIA LTDA - Matriz',
    }, {
      enderecoLoja: 'Rua da Loja, 100, Goiânia, GO',
      lat: -16.67,
      lng: -49.26
    });

    expect(addresses.origin).toEqual({
      name: 'ANA GUIMARAES DOCERIA LTDA - Matriz',
      address: 'Rua da Loja, 100, Goiânia, GO',
      coordinates: { latitude: -16.67, longitude: -49.26 }
    });
    expect(addresses.destination.address).toBe(
      'Rua Nova, 11098, Apto 1304, Jardim Nova Esperança, Goiânia - GO, CEP 74000-000'
    );
    expect(addresses.destination.coordinates).toEqual({ latitude: -16.68, longitude: -49.25 });
  });

  test('não busca endereço no cadastro do cliente quando o pedido não tem snapshot', () => {
    const addresses = buildRideAddresses({
      clienteNome: 'Cliente',
      cliente: { endereco: 'Não deve ser usado' }
    }, { nome: 'Matriz' }, { enderecoLoja: 'Rua da Loja, 1' });

    expect(addresses.destination.address).toBe('');
  });

  test('gera universal link da Uber com JSON codificado uma única vez', () => {
    const url = buildUberRideUrl({
      clientId: 'uber-client',
      origin: {
        name: 'Matriz #1',
        address: 'Rua A/B, 10',
        coordinates: { latitude: -16.1, longitude: -49.2 }
      },
      destination: {
        name: 'João',
        address: 'Rua São José, 20',
        coordinates: null
      }
    });
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe('https://m.uber.com/looking');
    expect(parsed.searchParams.get('client_id')).toBe('uber-client');
    expect(JSON.parse(parsed.searchParams.get('pickup'))).toEqual({
      addressLine1: 'Matriz #1',
      addressLine2: 'Rua A/B, 10',
      latitude: -16.1,
      longitude: -49.2
    });
    expect(JSON.parse(parsed.searchParams.get('drop[0]'))).toEqual({
      addressLine1: 'João',
      addressLine2: 'Rua São José, 20'
    });
  });

  test('usa somente o OneLink oficial da 99 e reconhece pedidos Delivery', () => {
    expect(build99OpenUrl()).toBe('https://99.onelink.me/Mayr');
    expect(isDeliveryOrder({ categoria: 'Delivery' })).toBe(true);
    expect(isDeliveryOrder({ categoria: 'Retirada' })).toBe(false);
    expect(formatRideAddress(null)).toBe('');
  });

  test('usa a configuração de frete da loja vinculada ao pedido em cenário multiloja', () => {
    const stores = {
      matriz: { nome: 'Matriz' },
      garavelo: { nome: 'Garavelo' }
    };
    const freightByStore = {
      matriz: { enderecoLoja: 'Av. Matriz, 100', lat: '-16.60', lng: '-49.20' },
      garavelo: { enderecoLoja: 'Av. Garavelo, 200', lat: '-16.70', lng: '-49.30' }
    };
    const selectedStoreId = 'matriz';
    const order = {
      lojaId: 'garavelo',
      clienteEndereco: 'Rua do Cliente, 300'
    };
    const orderStoreId = getOrderStoreId(order);
    const addresses = buildRideAddresses(
      order,
      stores[orderStoreId],
      freightByStore[orderStoreId]
    );

    expect(selectedStoreId).not.toBe(orderStoreId);
    expect(addresses.origin.address).toBe('Av. Garavelo, 200');
    expect(addresses.origin.coordinates).toEqual({ latitude: -16.7, longitude: -49.3 });
  });

  test('aceita origem apenas por coordenadas válidas e rejeita coordenadas vazias', () => {
    const withCoordinates = buildRideAddresses(
      { lojaId: 'matriz', clienteEndereco: 'Rua do Cliente, 1' },
      { nome: 'Matriz' },
      { enderecoLoja: '', lat: '-16.64464130924753', lng: '-49.3248949913069' }
    );
    const withoutCoordinates = buildRideAddresses(
      { lojaId: 'matriz', clienteEndereco: 'Rua do Cliente, 1' },
      { nome: 'Matriz' },
      { enderecoLoja: '', lat: '', lng: '' }
    );

    expect(withCoordinates.origin.coordinates).toEqual({
      latitude: -16.64464130924753,
      longitude: -49.3248949913069
    });
    expect(withoutCoordinates.origin.coordinates).toBeNull();
  });
});
