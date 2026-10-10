import {
  getPendingOrderIdsForStore,
  isPendingOrder,
  resolveOrderAlarmCondition,
} from './orderAlarmRules';

const order = (id, status = 'Pendente', lojaId = 'matriz', extra = {}) => ({
  id,
  status,
  lojaId,
  ...extra,
});

describe('orderAlarmRules', () => {
  test('considera o status canônico Pendente sem exigir marcador de pedido novo', () => {
    expect(isPendingOrder(order('A', 'Pendente', 'matriz', { isNew: false }))).toBe(true);
    expect(isPendingOrder(order('B', 'Em Produção'))).toBe(false);
    expect(isPendingOrder(order('C', 'Pronto para Entrega'))).toBe(false);
    expect(isPendingOrder(order('D', 'pendente'))).toBe(false);
  });

  test('mantém o alarme ativo no carregamento quando já existem pendentes', () => {
    const result = resolveOrderAlarmCondition({
      orders: [order('A'), order('B')],
      storeId: 'matriz',
    });

    expect(result.hasPendingOrders).toBe(true);
    expect(result.shouldPlay).toBe(true);
  });

  test('para somente quando não resta nenhum Pendente na loja', () => {
    const oneRemaining = resolveOrderAlarmCondition({
      orders: [order('A', 'Em Produção'), order('B')],
      storeId: 'matriz',
    });
    const noneRemaining = resolveOrderAlarmCondition({
      orders: [order('A', 'Em Produção'), order('B', 'Finalizado')],
      storeId: 'matriz',
    });

    expect(oneRemaining.shouldPlay).toBe(true);
    expect(noneRemaining.hasPendingOrders).toBe(false);
    expect(noneRemaining.shouldPlay).toBe(false);
  });

  test('respeita a pausa para as IDs que já estavam pendentes', () => {
    const result = resolveOrderAlarmCondition({
      orders: [order('A'), order('B')],
      storeId: 'matriz',
      isPaused: true,
      pausedPendingOrderIds: ['A', 'B'],
    });

    expect(result.hasNewPendingOrderDuringPause).toBe(false);
    expect(result.shouldPlay).toBe(false);
  });

  test('uma nova ID Pendente interrompe a pausa mesmo com a mesma contagem', () => {
    const result = resolveOrderAlarmCondition({
      orders: [order('B'), order('C')],
      storeId: 'matriz',
      isPaused: true,
      pausedPendingOrderIds: ['A', 'B'],
    });

    expect(result.pendingOrderIds).toEqual(['B', 'C']);
    expect(result.hasNewPendingOrderDuringPause).toBe(true);
    expect(result.shouldPlay).toBe(true);
  });

  test('isola os pedidos pela loja selecionada', () => {
    const orders = [order('A', 'Pendente', 'matriz'), order('B', 'Pendente', 'garavelo')];

    expect(getPendingOrderIdsForStore(orders, 'matriz')).toEqual(['A']);
    expect(getPendingOrderIdsForStore(orders, 'garavelo')).toEqual(['B']);
    expect(resolveOrderAlarmCondition({ orders, storeId: 'sem-pendentes' }).shouldPlay).toBe(false);
  });

  test('uma pausa legada sem baseline continua válida até surgir um evento novo', () => {
    const result = resolveOrderAlarmCondition({
      orders: [order('A')],
      storeId: 'matriz',
      isPaused: true,
      pausedPendingOrderIds: null,
    });

    expect(result.hasNewPendingOrderDuringPause).toBe(false);
    expect(result.shouldPlay).toBe(false);
  });
});
