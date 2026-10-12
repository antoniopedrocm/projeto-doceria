import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import OrderPaymentStatus from './OrderPaymentStatus';

let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { delete global.IS_REACT_ACT_ENVIRONMENT; });
beforeEach(() => { container = document.createElement('div'); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); });
// ReactDOM rendering needs act; this is not Testing Library's render helper.
// eslint-disable-next-line testing-library/no-unnecessary-act
const renderOrder = (order) => act(() => root.render(<OrderPaymentStatus order={order} />));
const paymentLabel = () => container.querySelector('span').textContent;

test('confirmed Pix is paid while the operational order remains pending', () => {
  renderOrder({status: 'Pendente', order_status: 'CONFIRMED', formaPagamento: 'Pix online', payment_status: 'PAID'});
  expect(container.textContent).toContain('Status do Pagamento:');
  expect(paymentLabel()).toBe('Pago');
});

test.each(['Pix online', 'Cartão online', 'Pix', 'Dinheiro'])('method %s and delivery alone never prove payment', (formaPagamento) => {
  renderOrder({formaPagamento, status: 'Finalizado', order_status: 'DELIVERED'});
  expect(paymentLabel()).toBe('Pendente');
});

test.each([
  ['PENDING', 'Pendente'],
  ['FAILED', 'Falhou'],
  ['EXPIRED', 'Expirado'],
  ['REFUNDED', 'Estornado'],
])('financial state %s remains distinct from paid', (payment_status, expected) => {
  renderOrder({formaPagamento: 'Pix online', payment_status});
  expect(paymentLabel()).toBe(expected);
});

test('a new financial snapshot changes the label without changing operational status', () => {
  const order = {status: 'Pendente', payment_status: 'PENDING'};
  renderOrder(order);
  expect(paymentLabel()).toBe('Pendente');
  renderOrder({...order, payment_status: 'PAID'});
  expect(paymentLabel()).toBe('Pago');
  expect(order).toEqual({status: 'Pendente', payment_status: 'PENDING'});
});
