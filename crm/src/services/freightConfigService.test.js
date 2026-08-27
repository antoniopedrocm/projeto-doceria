import { loadStoreFreightConfig } from './freightConfigService';

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
      lng: '-49.3248949913069'
    });
    expect(readDoc).toHaveBeenCalledWith('lojas/matriz/configuracoes/config');
  });

  test('não mistura configurações entre lojas', async () => {
    const readDoc = createReader({
      'lojas/matriz/configuracoes/config': {
        frete: { enderecoLoja: 'Origem Matriz', lat: -16.6, lng: -49.2 }
      },
      'lojas/garavelo/configuracoes/config': {
        frete: { enderecoLoja: 'Origem Garavelo', lat: -16.7, lng: -49.3 }
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
