import {
  clearAlarmPause,
  getAlarmPauseStorageKey,
  isAlarmPausedForContext,
  readAlarmPause,
  readAlarmPauseUntil,
  saveAlarmPauseUntil,
} from './alarmPauseStorage';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

describe('alarmPauseStorage', () => {
  test('isola a pausa por usuário e loja', () => {
    const storage = createStorage();
    const now = 1_000;
    saveAlarmPauseUntil({ uid: 'celeste', storeId: 'matriz', pausedUntil: 10_000, storage });

    expect(isAlarmPausedForContext({ uid: 'celeste', storeId: 'matriz', storage, now })).toBe(true);
    expect(isAlarmPausedForContext({ uid: 'celeste', storeId: 'garavelo', storage, now })).toBe(false);
    expect(isAlarmPausedForContext({ uid: 'mariana', storeId: 'matriz', storage, now })).toBe(false);
  });

  test('mantém pausas independentes em duas lojas e reativa somente a selecionada', () => {
    const storage = createStorage();
    const now = 1_000;
    saveAlarmPauseUntil({ uid: 'celeste', storeId: 'matriz', pausedUntil: 10_000, storage });
    saveAlarmPauseUntil({ uid: 'celeste', storeId: 'garavelo', pausedUntil: 20_000, storage });

    clearAlarmPause({ uid: 'celeste', storeId: 'matriz', storage });

    expect(readAlarmPauseUntil({ uid: 'celeste', storeId: 'matriz', storage, now })).toBeNull();
    expect(readAlarmPauseUntil({ uid: 'celeste', storeId: 'garavelo', storage, now })).toBe(20_000);
  });

  test('considera automaticamente expirada uma pausa vencida', () => {
    const storage = createStorage();
    saveAlarmPauseUntil({ uid: 'celeste', storeId: 'matriz', pausedUntil: 999, storage });

    expect(readAlarmPauseUntil({ uid: 'celeste', storeId: 'matriz', storage, now: 1_000 })).toBeNull();
  });

  test('restaura a pausa após uma nova leitura do mesmo armazenamento', () => {
    const storage = createStorage();
    saveAlarmPauseUntil({
      uid: 'celeste',
      storeId: 'matriz',
      pausedUntil: 30_000,
      pendingOrderIds: ['pedido-a', 'pedido-b', 'pedido-a'],
      storage,
    });

    expect(readAlarmPauseUntil({ uid: 'celeste', storeId: 'matriz', storage, now: 5_000 })).toBe(30_000);
    expect(readAlarmPause({ uid: 'celeste', storeId: 'matriz', storage, now: 5_000 })).toEqual({
      pausedUntil: 30_000,
      pendingOrderIds: ['pedido-a', 'pedido-b'],
    });
  });

  test('mantém compatibilidade com pausas antigas sem lista de pedidos', () => {
    const storage = createStorage();
    const key = getAlarmPauseStorageKey('celeste', 'matriz');
    storage.setItem(key, JSON.stringify({ pausedUntil: 30_000 }));

    expect(readAlarmPause({ uid: 'celeste', storeId: 'matriz', storage, now: 5_000 })).toEqual({
      pausedUntil: 30_000,
      pendingOrderIds: null,
    });
  });

  test('codifica identificadores na chave sem perder o isolamento', () => {
    expect(getAlarmPauseStorageKey('user:1', 'loja/matriz')).toBe(
      'orderAlarmPause:user%3A1:loja%2Fmatriz'
    );
  });
});
