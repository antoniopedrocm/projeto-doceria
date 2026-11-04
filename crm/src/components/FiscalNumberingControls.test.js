import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import FiscalNumberingControls from './FiscalNumberingControls';

const Modal = ({isOpen, title, children}) => isOpen ? <section role="dialog"><h2>{title}</h2>{children}</section> : null;
const Button = ({variant, children, ...props}) => <button {...props}>{children}</button>;
let container, root, call, sequences;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { delete global.IS_REACT_ACT_ENVIRONMENT; });
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  sequences = [55, 65].map((model) => ({model, series: 1, environment: 'production', issuerCnpj: '37185245000140', nextNumber: model === 55 ? 67 : 27, revision: `revision-${model}`}));
  call = jest.fn(async (name, payload) => {
    if (name === 'fiscalGetNumbering') return {canManage: true, sequences};
    if (name === 'fiscalSetNextNumber') {
      sequences = sequences.map((row) => row.model === payload.model ? {...row, nextNumber: payload.nextNumber, revision: 'updated'} : row);
      return payload;
    }
    throw new Error(`Unexpected fiscal operation: ${name}`);
  });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
// ReactDOM root.render requires act; no Testing Library render helper is used.
// eslint-disable-next-line testing-library/no-unnecessary-act
const mount = async (props = {}) => act(async () => root.render(<FiscalNumberingControls call={call} canManage Modal={Modal} Button={Button} {...props} />));
const button = (text) => [...container.querySelectorAll('button')].find((element) => element.textContent === text);
const saves = () => call.mock.calls.filter(([name]) => name === 'fiscalSetNextNumber');
const edit = (model, value) => act(() => {
  const input = container.querySelector(`#fiscal-number-${model}`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', {bubbles: true}));
});

test.each([55, 65])('editing and cancelling model %s never save numbering', async (model) => {
  await mount();
  const name = model === 55 ? 'NF-e' : 'NFC-e';
  edit(model, '1000');
  expect(saves()).toHaveLength(0);
  act(() => button(`Salvar numeração ${name}`).click());
  expect(container.querySelector('h2').textContent).toContain(name);
  expect(container.querySelector('[role="dialog"]').textContent).toContain('Série: 001');
  expect(container.querySelector('[role="dialog"]').textContent).toContain('Produção (tpAmb=1)');
  expect(container.querySelector('[role="alert"]').textContent).toContain('lacuna fiscal');
  act(() => button('Cancelar').click());
  expect(saves()).toHaveLength(0);
});

test.each([55, 65])('confirmation saves only model %s and leaves the other model intact', async (model) => {
  await mount();
  const other = model === 55 ? 65 : 55;
  const otherBefore = container.querySelector(`#fiscal-number-${other}`).value;
  edit(model, '1000');
  act(() => button(`Salvar numeração ${model === 55 ? 'NF-e' : 'NFC-e'}`).click());
  await act(async () => button('Confirmar alteração').click());
  expect(saves()).toHaveLength(1);
  expect(saves()[0][1]).toMatchObject({model, series: 1, environment: 'production', issuerCnpj: '37185245000140', nextNumber: 1000, expectedNextNumber: model === 55 ? 67 : 27, expectedRevision: `revision-${model}`, confirmed: true});
  expect(container.querySelector(`#fiscal-number-${other}`).value).toBe(otherBefore);
  expect(container.querySelector('[role="status"]').textContent).toContain('alterado para 1000');
  expect(call.mock.calls.every(([name]) => ['fiscalGetNumbering', 'fiscalSetNextNumber'].includes(name))).toBe(true);
});

test('decrease has a strong warning and does not claim SEFAZ availability', async () => {
  await mount(); edit(55, '10');
  act(() => button('Salvar numeração NF-e').click());
  expect(container.querySelector('[role="alert"]').textContent).toContain('redução de numeração');
  expect(container.textContent).toContain('não comprova disponibilidade na SEFAZ');
  expect(saves()).toHaveLength(0);
});

test.each(['', '-1', '1.5', '1e3', '1000000000'])('invalid input cannot reach confirmation or backend: %s', async (value) => {
  await mount(); edit(55, value);
  act(() => button('Salvar numeração NF-e').click());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('[role="alert"]').textContent).toContain('inteiro');
  expect(saves()).toHaveLength(0);
});

test('double click confirms once while request is pending', async () => {
  let resolve;
  const initialCall = call;
  call = jest.fn((name, payload) => name === 'fiscalSetNextNumber' ? new Promise((done) => { resolve = () => done(payload); }) : initialCall(name, payload));
  await mount(); edit(55, '1000');
  act(() => button('Salvar numeração NF-e').click());
  act(() => { const confirm = button('Confirmar alteração'); confirm.click(); confirm.click(); });
  expect(saves()).toHaveLength(1);
  expect(button('Cancelar').disabled).toBe(true);
  await act(async () => resolve());
});

test.each([false, true])('frontend and backend permissions both protect editing: %s', async (backendAllowed) => {
  const initialCall = call;
  call = jest.fn(async (name, payload) => name === 'fiscalGetNumbering' ? {canManage: backendAllowed, sequences} : initialCall(name, payload));
  await mount({canManage: !backendAllowed});
  expect(container.querySelector('#fiscal-number-55').disabled).toBe(true);
  expect(button('Salvar numeração NF-e')).toBeUndefined();
});

test('stale confirmation shows backend failure, closes and reloads the actual sequence', async () => {
  const initialCall = call;
  call = jest.fn(async (name, payload) => {
    if (name === 'fiscalSetNextNumber') { sequences = sequences.map((row) => row.model === 55 ? {...row, nextNumber: 68} : row); throw new Error('A numeração mudou. Atualize e confirme novamente.'); }
    return initialCall(name, payload);
  });
  await mount(); edit(55, '1000');
  act(() => button('Salvar numeração NF-e').click());
  await act(async () => button('Confirmar alteração').click());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('[role="alert"]').textContent).toContain('numeração mudou');
  expect(container.querySelector('#fiscal-number-55').value).toBe('68');
});

test('configuration reload displays persisted environment and series, and clears an old confirmation', async () => {
  await mount({reloadKey: 0}); edit(55, '1000');
  act(() => button('Salvar numeração NF-e').click());
  sequences = sequences.map((row) => ({...row, series: 2, environment: 'homologation', nextNumber: 1}));
  await mount({reloadKey: 1});
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.textContent).toContain('Homologação (tpAmb=2)');
  expect(container.textContent).toContain('Série: 002');
  expect(saves()).toHaveLength(0);
});
