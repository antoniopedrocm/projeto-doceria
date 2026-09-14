import { httpsCallable } from 'firebase/functions';
import { fetchAuthorizedTransferDestinations } from './entreLojasService';

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn()
}));

beforeEach(() => {
  httpsCallable.mockReset();
});

test('consulta a mesma fonte de destinos autorizados usada pelas remessas', async () => {
  const invoke = jest.fn().mockResolvedValue({
    data: { destinations: [{ id: 'garavelo', nome: 'Garavelo' }] }
  });
  httpsCallable.mockReturnValue(invoke);
  const functionsInstance = {};

  await expect(fetchAuthorizedTransferDestinations(functionsInstance, 'matriz'))
    .resolves.toEqual([{ id: 'garavelo', nome: 'Garavelo' }]);
  expect(httpsCallable).toHaveBeenCalledWith(functionsInstance, 'listAuthorizedTransferDestinations');
  expect(invoke).toHaveBeenCalledWith({ originStoreId: 'matriz' });
});

test('resposta sem destinos produz uma lista segura vazia', async () => {
  httpsCallable.mockReturnValue(jest.fn().mockResolvedValue({ data: {} }));

  await expect(fetchAuthorizedTransferDestinations({}, 'matriz')).resolves.toEqual([]);
});
