import { runTransaction } from 'firebase/firestore';
import { updateStock } from './stockService';

const mockTransaction = {
  get: jest.fn(),
  update: jest.fn(),
  set: jest.fn()
};

jest.mock('../firebaseConfig.js', () => ({ db: { name: 'db' } }));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...parts) => ({ path: parts.slice(1).join('/') })),
  doc: jest.fn((...parts) => {
    const normalizedParts = parts[0]?.path
      ? [parts[0].path, ...parts.slice(1)]
      : parts.slice(1);
    return { path: normalizedParts.join('/') };
  }),
  increment: jest.fn((value) => ({ increment: value })),
  runTransaction: jest.fn(async (_db, callback) => callback(mockTransaction)),
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP')
}));

const snapshot = (exists, data = {}) => ({
  exists: () => exists,
  data: () => data
});

describe('stockService purchase-order idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runTransaction.mockImplementation(async (_db, callback) => callback(mockTransaction));
  });

  test('não movimenta estoque novamente quando o kardex idempotente já existe', async () => {
    let readIndex = 0;
    mockTransaction.get.mockImplementation(() => {
      readIndex += 1;
      if (readIndex === 1) return Promise.resolve(snapshot(true, { estoque: 10 }));
      if (readIndex === 2) return Promise.resolve(snapshot(true, { quantidade: 10 }));
      return Promise.resolve(snapshot(true, { pedidoCompraId: 'PC1' }));
    });

    await updateStock('produto-1', 'entrada', 2, 'Recebimento', { uid: 'user-1' }, 'loja-1', {
      idempotencyKey: 'pedidoCompra_PC1_item_produto-1',
      pedidoCompraId: 'PC1',
      origem: 'pedido_compra'
    });

    expect(mockTransaction.update).not.toHaveBeenCalled();
    expect(mockTransaction.set).not.toHaveBeenCalled();
  });

  test('movimenta uma vez e grava origem e pedido no kardex', async () => {
    let readIndex = 0;
    mockTransaction.get.mockImplementation(() => {
      readIndex += 1;
      if (readIndex === 1) return Promise.resolve(snapshot(true, { estoque: 10 }));
      if (readIndex === 2) return Promise.resolve(snapshot(true, { quantidade: 10 }));
      return Promise.resolve(snapshot(false));
    });

    await updateStock('produto-1', 'entrada', 2, 'Recebimento', { uid: 'user-1' }, 'loja-1', {
      idempotencyKey: 'pedidoCompra_PC1_item_produto-1',
      pedidoCompraId: 'PC1',
      origem: 'pedido_compra'
    });

    expect(mockTransaction.update).toHaveBeenCalledTimes(2);
    expect(mockTransaction.set.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        pedidoId: 'PC1',
        pedidoCompraId: 'PC1',
        origem: 'pedido_compra',
        idempotencyKey: 'pedidoCompra_PC1_item_produto-1',
        estoqueAnterior: 10,
        estoquePosterior: 12
      })
    );
  });
});
