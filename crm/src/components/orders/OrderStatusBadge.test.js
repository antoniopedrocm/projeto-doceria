import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import OrderStatusBadge from './OrderStatusBadge';
import OrderPaymentStatus from './OrderPaymentStatus';
import {getOrderStatusLabel} from '../../utils/orderStatus';

test('status operacional fiscal é visível sem trocar o estado canônico confirmado', () => {
  render({paymentId:'fixture',payment_status:'PAID',order_status:'CONFIRMED',status:'Finalizado'});
  expect(container.textContent).toContain('Confirmado');
  expect(container.textContent).toContain('Operacional: Finalizado');
});

let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { delete global.IS_REACT_ACT_ENVIRONMENT; });
beforeEach(() => { container = document.createElement('div'); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); });
// These components use ReactDOM directly, not Testing Library's render helper.
// eslint-disable-next-line testing-library/no-unnecessary-act
const render = (order, pendingSync = false) => act(() => root.render(<>
  <p>Status do Pedido: <OrderStatusBadge order={order} pendingSync={pendingSync} /></p>
  <OrderPaymentStatus order={order} />
</>));

test.each([
  ['CONFIRMED', 'PAID', 'Confirmado', 'Pago'],
  ['PENDING', 'PENDING', 'Pendente', 'Pendente'],
  ['CANCELLED', 'EXPIRED', 'Cancelado', 'Expirado'],
  ['CANCELLED', 'PENDING', 'Cancelado', 'Pendente'],
  ['DELIVERED', undefined, 'Entregue', 'Pendente'],
])('order %s and payment %s remain independent in list/detail badges', (order_status, payment_status, operational, financial) => {
  const order = Object.freeze({order_status, payment_status, status: 'Pendente', formaPagamento: 'Pix online'});
  render(order);
  expect(Array.from(container.querySelectorAll('span'), node => node.textContent)).toEqual([operational, financial]);
  expect(order.status).toBe('Pendente');
});

test.each([
  ['PENDING', 'Pendente'], ['CONFIRMED', 'Confirmado'], ['PREPARING', 'Em Produção'],
  ['READY', 'Pronto para Entrega'], ['DELIVERED', 'Entregue'], ['CANCELLED', 'Cancelado'],
])('canonical operational %s overrides the legacy label regardless of payment', (order_status, expected) => {
  expect(getOrderStatusLabel({order_status, status: 'Finalizado', payment_status: 'PAID'})).toBe(expected);
  expect(getOrderStatusLabel({order_status, status: 'Finalizado', payment_status: 'PENDING'})).toBe(expected);
});

test.each(['Pendente', 'Em Produção', 'Pronto para Entrega', 'Finalizado', 'Cancelado', 'Reserva expirada'])('legacy label %s is preserved without a canonical state', status => {
  expect(getOrderStatusLabel({status, payment_status: 'PAID'})).toBe(status);
});

test('unknown canonical states preserve historical compatibility without inferring payment', () => {
  expect(getOrderStatusLabel({order_status: 'LEGACY', status: 'Histórico'})).toBe('Histórico');
  expect(getOrderStatusLabel({order_status: 'constructor', status: 'Histórico'})).toBe('Histórico');
  expect(getOrderStatusLabel({order_status: 'FUTURE_STATE'})).toBe('FUTURE_STATE');
  expect(getOrderStatusLabel({payment_status: 'PAID'})).toBe('Não informado');
});

test('a refreshed canonical snapshot updates presentation without editing the legacy field', () => {
  render({order_status: 'PENDING', status: 'Pendente', payment_status: 'PENDING'});
  expect(container.querySelector('span').textContent).toBe('Pendente');
  render({order_status: 'CONFIRMED', status: 'Pendente', payment_status: 'PAID'});
  expect(container.querySelector('span').textContent).toBe('Confirmado');
});

test('pending local sync keeps its existing placeholder without treating it as payment', () => {
  render({order_status: 'CONFIRMED', payment_status: 'PENDING'}, true);
  expect(container.querySelector('span').textContent).toBe('Sincronizando...');
  expect(container.textContent).toContain('Status do Pagamento: Pendente');
});
