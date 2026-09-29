import { loadStoreFreightConfig, validateFreightCoordinates } from './freightConfigService';
jest.mock('../firebaseConfig', () => ({db: {}, getDoc: jest.fn()}));

test.each([['', 0], [0, ''], [91, 0], [-91, 0], [0, 181], [0, -181], [-16, '-4932489499913069'], ['NaN', 0]])(
  'bloqueia coordenadas inválidas %s / %s', (lat, lng) => {
    expect(() => validateFreightCoordinates({lat, lng})).toThrow();
  }
);

test('aceita limites válidos e normaliza strings', () => {
  expect(validateFreightCoordinates({lat: '-90', lng: '180'})).toEqual({lat: -90, lng: 180});
  expect(validateFreightCoordinates({lat: 0, lng: 0})).toEqual({lat: 0, lng: 0});
});

test('configurações são independentes por loja e leitura não grava dados', async () => {
  const configs = {
    'lojas/matriz/configuracoes/config': {frete: {lat: -16, lng: -49, valorPorKm: 2, valorMinimoFrete: 8}},
    'lojas/garavelo/configuracoes/config': {frete: {lat: -17, lng: -48, valorPorKm: 3, freteACombinar: true}},
  };
  const options = {firestore: {}, createDocRef: (_, ...segments) => segments.join('/'),
    readDoc: jest.fn(async (key) => ({exists: () => !!configs[key], data: () => configs[key]}))};
  expect(await loadStoreFreightConfig('matriz', options)).toMatchObject({valorMinimoFrete: 8, freteACombinar: false});
  expect(await loadStoreFreightConfig('garavelo', options)).toMatchObject({valorPorKm: 3, freteACombinar: true});
  const empty = await loadStoreFreightConfig('festa', options);
  expect(empty.lat).toBe('');
  expect(empty.valorPorKm).toBe('');
  expect(options.readDoc.mock.calls.every(([p]) => p.startsWith('lojas/'))).toBe(true);
});
