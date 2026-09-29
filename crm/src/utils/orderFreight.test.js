import { getOrderFreight, getSavedOrderTotal } from './orderFreight';

test('histórico a combinar usa snapshot mesmo com configuração atual diferente', () => {
  const order = {freteACombinar: true, tipoFrete: 'a_combinar', valorFrete: 0, subtotal: 59.4, total: 59.4};
  expect(getOrderFreight(order)).toEqual({agreed: true, value: 0, label: 'A Combinar'});
  expect(getSavedOrderTotal(order)).toBe(59.4);
});

test('detalhes e WhatsApp não adicionam frete novamente ao total salvo', () => {
  const order = {subtotal: 59.4, valorFrete: 4.52, total: 63.92};
  expect(getOrderFreight(order).label).toBe('R$ 4,52');
  expect(getSavedOrderTotal(order)).toBe(63.92);
});

test('pedidos antigos sem modalidade preservam valor e total salvos', () => {
  expect(getOrderFreight({frete: 12}).label).toBe('R$ 12,00');
  expect(getSavedOrderTotal({total: 55, frete: 12})).toBe(55);
  expect(getSavedOrderTotal({subtotal: 59.4, desconto: 10, valorFrete: 4.52})).toBe(53.92);
});
