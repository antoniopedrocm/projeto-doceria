import {
  claimOrderAlert,
  clearOrderAlertClaims,
  getOrderAlertStorageKey,
} from './orderAlertDeduper';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

describe('orderAlertDeduper', () => {
  test('aceita o pedido apenas uma vez mesmo após reconstruir o estado da tela', () => {
    const storage = createStorage();
    const context = { uid: 'celeste', storeId: 'matriz', orderId: 'pedido-1', now: 1_000, storage };

    expect(claimOrderAlert(context)).toBe(true);
    expect(claimOrderAlert({ ...context, now: 1_100 })).toBe(false);
  });

  test('mantém isolamento por usuário e loja', () => {
    const storage = createStorage();
    const base = { orderId: 'pedido-1', now: 1_000, storage };

    expect(claimOrderAlert({ ...base, uid: 'celeste', storeId: 'matriz' })).toBe(true);
    expect(claimOrderAlert({ ...base, uid: 'celeste', storeId: 'garavelo' })).toBe(true);
    expect(claimOrderAlert({ ...base, uid: 'yasmin', storeId: 'matriz' })).toBe(true);
  });

  test('aceita dois pedidos diferentes e expira registros antigos', () => {
    const storage = createStorage();
    const base = { uid: 'celeste', storeId: 'matriz', storage, ttlMs: 500 };

    expect(claimOrderAlert({ ...base, orderId: 'pedido-1', now: 1_000 })).toBe(true);
    expect(claimOrderAlert({ ...base, orderId: 'pedido-2', now: 1_100 })).toBe(true);
    expect(claimOrderAlert({ ...base, orderId: 'pedido-1', now: 1_600 })).toBe(true);
  });

  test('não cria uma reivindicação sem os identificadores obrigatórios', () => {
    const storage = createStorage();

    expect(claimOrderAlert({ uid: 'celeste', storeId: 'matriz', orderId: '', storage })).toBe(false);
    expect(getOrderAlertStorageKey('', 'matriz')).toBeNull();
    expect(() => clearOrderAlertClaims({ uid: '', storeId: 'matriz', storage })).not.toThrow();
  });
});
