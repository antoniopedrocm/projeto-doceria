import { loadStoreFreightConfig, validateFreightCoordinates } from './freightConfigService';

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  setDoc: jest.fn()
}));

jest.mock('../firebaseConfig', () => ({
  db: {},
  getDoc: jest.fn()
}));

const createSnapshot = (data = null) => ({
  exists: () => data !== null,
  data: () => data
});

const createReader = (documents) => jest.fn(async (path) => (
  createSnapshot(Object.prototype.hasOwnProperty.call(documents, path) ? documents[path] : null)
));

const createDocRef = (_firestore, ...segments) => segments.join('/');

test('rejeita longitude fora do intervalo antes de salvar frete', () => {
  expect(() => validateFreightCoordinates({lat: '-16.64464130924753', lng: '-4932489499913069'}))
    .toThrow('Informe uma longitude válida entre -180 e 180.');
  expect(validateFreightCoordinates({lat: '-16.64464130924753', lng: '-49.3248949913069'}))
    .toEqual({lat: -16.64464130924753, lng: -49.3248949913069});
});

describe('loadStoreFreightConfig', () => {
  test('lê a configuração principal da loja solicitada', async () => {
    const readDoc = createReader({
      'lojas/matriz/configuracoes/config': {
        frete: {
          enderecoLoja: 'Av. Comercial, 433 - Jardim Nova Esperança, Goiânia - GO',
          lat: '-16.64464130924753',
          lng: '-49.3248949913069',
          valorPorKm: 1.5
        }
      }
    });

    const result = await loadStoreFreightConfig('matriz', {
      firestore: {},
      readDoc,
      writeDoc: jest.fn(),
      createDocRef
    });

    expect(result).toMatchObject({
      enderecoLoja: 'Av. Comercial, 433 - Jardim Nova Esperança, Goiânia - GO',
      lat: '-16.64464130924753',
      lng: '-49.3248949913069',
      valorMinimoFrete: 2,
      freteACombinar: false
    });
    expect(readDoc).toHaveBeenCalledWith('lojas/matriz/configuracoes/config');
  });

  test('não mistura configurações entre lojas', async () => {
    const readDoc = createReader({
      'lojas/matriz/configuracoes/config': {
        frete: { enderecoLoja: 'Origem Matriz', lat: -16.6, lng: -49.2, valorPorKm: 2, valorMinimoFrete: 8, freteACombinar: false }
      },
      'lojas/garavelo/configuracoes/config': {
        frete: { enderecoLoja: 'Origem Garavelo', lat: -16.7, lng: -49.3, valorPorKm: 2.5, valorMinimoFrete: 10, freteACombinar: true }
      }
    });
    const dependencies = {
      firestore: {},
      readDoc,
      writeDoc: jest.fn(),
      createDocRef
    };

    const matriz = await loadStoreFreightConfig('matriz', dependencies);
    const garavelo = await loadStoreFreightConfig('garavelo', dependencies);

    expect(matriz.enderecoLoja).toBe('Origem Matriz');
    expect(garavelo.enderecoLoja).toBe('Origem Garavelo');
    expect(matriz).toMatchObject({valorPorKm: 2, valorMinimoFrete: 8, freteACombinar: false});
    expect(garavelo).toMatchObject({valorPorKm: 2.5, valorMinimoFrete: 10, freteACombinar: true});
  });

  test('reaproveita configuração legada e a migra para config.frete', async () => {
    const readDoc = createReader({
      'lojas/matriz/configuracoes/frete': {
        enderecoLoja: 'Origem Legada',
        lat: -16.6,
        lng: -49.2
      }
    });
    const writeDoc = jest.fn(async () => undefined);

    const result = await loadStoreFreightConfig('matriz', {
      firestore: {},
      readDoc,
      writeDoc,
      createDocRef
    });

    expect(result.enderecoLoja).toBe('Origem Legada');
    expect(writeDoc).toHaveBeenCalledWith(
      'lojas/matriz/configuracoes/config',
      { frete: expect.objectContaining({ enderecoLoja: 'Origem Legada' }) },
      { merge: true }
    );
  });
});
