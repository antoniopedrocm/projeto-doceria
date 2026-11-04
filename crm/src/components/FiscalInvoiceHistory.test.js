import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import FiscalInvoiceHistory from './FiscalInvoiceHistory';

let container;
let root;
const statusLabel = {draft: 'Rascunho', validating: 'Validando', rejected: 'Rejeitada', authorized: 'Autorizada', cancelled: 'Cancelada', pending_return: 'Aguardando retorno'};
const formatDateTime = (date) => date || '-';
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { delete global.IS_REACT_ACT_ENVIRONMENT; });
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
// Exercise the rendered history, including legacy records and consultation feedback.
// eslint-disable-next-line testing-library/no-unnecessary-act
const renderHistory = (history) => act(() => root.render(<FiscalInvoiceHistory history={history} statusLabel={statusLabel} formatDateTime={formatDateTime} />));

test('clone fiscal history omits preparation, retains fiscal events and does not mutate audit', () => {
  const history = [
    {action: 'cloned', status: 'draft', message: 'Rascunho criado por clonagem da NF-e 7'},
    {action: 'edited', status: 'draft'}, {action: 'validated', status: 'draft'},
    {status: 'draft', message: 'Rascunho legado'},
    {action: 'issued', status: 'validating', at: '13/10/2026 22:11', by: 'owner', message: 'Transmissão iniciada'},
    {status: 'rejected', cStat: 539, message: 'Duplicidade de NF-e'},
    {action: 'consultation', status: 'rejected', cStat: 217, xMotivo: 'NF-e não consta na base de dados da SEFAZ'},
  ];
  const before = JSON.stringify(history);
  renderHistory(history);
  expect(container.textContent).not.toMatch(/Rascunho|clonagem/);
  expect(container.querySelectorAll('strong')).toHaveLength(3);
  expect(container.textContent).toContain('Emissão iniciada');
  expect(container.textContent).toContain('13/10/2026 22:11 · owner');
  expect(container.textContent).toContain('Rejeitada · - · - · código 539 · Duplicidade de NF-e');
  expect(container.textContent).toContain('Consulta SEFAZ · - · - · código 217 · NF-e não consta');
  expect(JSON.stringify(history)).toBe(before);
});

test.each(['authorized', 'cancelled', 'pending_return', 'validating'])('legacy fiscal events and protocols remain visible: %s', (status) => {
  renderHistory([{status, at: 'data fiscal', by: 'responsável', message: 'Resultado fiscal', protocol: 'protocolo-123'}]);
  expect(container.textContent).toContain(statusLabel[status]);
  expect(container.textContent).toContain('Resultado fiscal · protocolo protocolo-123');
});

test.each([undefined, null, {}, [], [{status: 'draft'}], [{action: 'created'}, {action: 'edited'}, {action: 'validated'}]])('no fiscal events does not imply authorization: %p', (history) => {
  renderHistory(history);
  expect(container.textContent).toBe('Nenhum evento fiscal registrado.');
});
