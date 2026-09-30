import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import WhatsAppOrderStatus from './WhatsAppOrderStatus';
import {httpsCallable} from 'firebase/functions';
import {functions} from '../firebaseConfig';

jest.mock('../firebaseConfig', () => ({auth: {currentUser: {uid: 'operator'}}, functions: {app: {options: {projectId: 'crmdoceria-9959e'}}}}));
jest.mock('firebase/functions', () => ({getFunctions: jest.fn(() => ({})), httpsCallable: jest.fn()}));
let host, root, status, resend;
const click = async (label) => {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === label);
  await act(async () => {button.dispatchEvent(new MouseEvent('click', {bubbles: true}));});
};
const render = async (props = {}) => act(async () => {root.render(<WhatsAppOrderStatus storeId="matriz" orderId="pedido1" {...props} />);});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  sessionStorage.clear(); functions.app.options.projectId = 'crmdoceria-9959e';
  window.confirm = jest.fn(() => true);
  Object.defineProperty(window, 'crypto', {configurable: true, value: {randomUUID: jest.fn(() => '11111111-1111-4111-8111-111111111111')}});
  status = jest.fn(async () => ({data: {jobs: [], manualEnabled: true}}));
  resend = jest.fn(async () => ({data: {duplicate: false}}));
  httpsCallable.mockImplementation((_, name) => name === 'getWhatsAppOrderStatus' ? status : resend);
});
afterEach(async () => {await act(async () => root.unmount()); host.remove(); jest.clearAllMocks();});
test('mostra ausência de registro sem afirmar falha ou entrega e envia somente referência', async () => {
  await render(); expect(host.textContent).toContain('Sem registro de envio pela API');
  await click('Reenviar pelo WhatsApp oficial');
  expect(resend).toHaveBeenCalledWith({storeId: 'matriz', orderId: 'pedido1', requestId: '11111111-1111-4111-8111-111111111111', confirmResend: true});
  expect(host.textContent).toContain('Envio solicitado');
});
test('cancelar confirmação não envia e falha de rede reutiliza intenção', async () => {
  await render(); window.confirm.mockReturnValueOnce(false); await click('Reenviar pelo WhatsApp oficial');
  expect(resend).not.toHaveBeenCalled();
  resend.mockRejectedValueOnce({code: 'functions/unavailable'});
  await click('Reenviar pelo WhatsApp oficial');
  expect(host.textContent).toContain('mesma solicitação será reutilizada');
  const first = resend.mock.calls[0][0].requestId;
  await act(async () => root.unmount()); root = createRoot(host); await render();
  await click('Reenviar pelo WhatsApp oficial');
  expect(resend.mock.calls[1][0].requestId).toBe(first);
});
test('envio pendente bloqueia novo envio e histórico é consultado sob demanda', async () => {
  status.mockResolvedValue({data: {jobs: [{id: 'job', mode: 'manual', status: 'queued', history: []}], manualEnabled: true}});
  await render();
  expect([...host.querySelectorAll('button')].find(b => b.textContent === 'Reenviar pelo WhatsApp oficial').disabled).toBe(true);
  await click('Ver histórico'); expect(status).toHaveBeenLastCalledWith({storeId: 'matriz', orderId: 'pedido1', includeHistory: true});
});
test('erro de consulta não vira não enviado e produção não chama endpoints DEV', async () => {
  status.mockRejectedValueOnce(Error('offline')); await render();
  expect(host.textContent).toContain('O pedido permanece salvo');
  expect(host.textContent).not.toContain('Sem registro de envio pela API');
  functions.app.options.projectId = 'ana-guimaraes'; await render({orderId: 'pedido2'});
  expect(host.textContent).toBe(''); expect(status).toHaveBeenCalledTimes(1);
});
