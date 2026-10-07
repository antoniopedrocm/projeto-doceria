import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import FiscalCloneConfirmation from './FiscalCloneConfirmation';

const Modal = ({isOpen, title, children}) => isOpen ? <section role="dialog"><h2>{title}</h2>{children}</section> : null;
const Button = ({children, variant, ...props}) => <button {...props}>{children}</button>;
let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { delete global.IS_REACT_ACT_ENVIRONMENT; });
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
// ReactDOM root.render needs act; this is not Testing Library's render helper.
// eslint-disable-next-line testing-library/no-unnecessary-act
const mountConfirmation = (props) => act(() => root.render(<FiscalCloneConfirmation Modal={Modal} Button={Button} invoice={{model: 55}} {...props} />));
const button = (text) => [...container.querySelectorAll('button')].find((element) => element.textContent.includes(text));

test.each([55, 65])('confirmation identifies model %s and cancellation creates no clone', (model) => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  mountConfirmation({invoice: {model}, onConfirm, onCancel});
  expect(container.querySelector('h2').textContent).toBe(`Clonar esta ${model === 55 ? 'NF-e' : 'NFC-e'}?`);
  expect(container.textContent).toContain('ainda não será emitida');
  act(() => button('Cancelar').click());
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

test('double click runs a single confirmed clone while its response is pending', async () => {
  let resolve;
  const onConfirm = jest.fn(() => new Promise((done) => { resolve = done; }));
  mountConfirmation({onConfirm, onCancel: jest.fn()});
  act(() => { button('Clonar nota').click(); button('Clonar nota').click(); });
  expect(onConfirm).toHaveBeenCalledTimes(1);
  await act(async () => resolve());
});

test('busy confirmation disables actions and displays an actionable error without issuing', () => {
  const onConfirm = jest.fn();
  mountConfirmation({busy: true, error: 'Nota original não encontrada nesta loja.', onConfirm, onCancel: jest.fn()});
  expect(button('Cancelar').disabled).toBe(true);
  expect(button('Clonando').disabled).toBe(true);
  expect(container.querySelector('[role="alert"]').textContent).toContain('nesta loja');
  act(() => button('Clonando').click());
  expect(onConfirm).not.toHaveBeenCalled();
});
