import fs from 'fs';
import path from 'path';
import {parse} from '@babel/parser';
import {findOrderDraft} from './fiscalOrderActions';

// Exercise the actual App handlers with Firebase mocked, without transmitting a fiscal document.
const source = fs.readFileSync(path.join(__dirname, 'App.js'), 'utf8');
const ast = parse(source, {sourceType: 'module', plugins: ['jsx']});
function handler(name, bindings) {
  let expression;
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id.name === name) {
      expression = node.init.type === 'CallExpression' ? node.init.arguments[0] : node.init;
    }
    Object.values(node).forEach((value) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    });
  };
  walk(ast);
  if (!expression) throw new Error(`Handler missing: ${name}`);
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(bindings), `return (${source.slice(expression.start, expression.end)});`)(...Object.values(bindings));
}
const noop = () => {};
const order = {id: 'order-1', observacao: 'Pedido', clienteNome: 'Cliente', itens: [{productId: 'p1', nome: 'Bolo', quantity: 2, preco: 10}], total: 20};
const draft = {id: 'draft_order-1_55', orderId: order.id, status: 'draft', model: 55, operationCfop: '5101', additionalInfo: 'Observação do rascunho'};

test.each([null, draft])('Editar abre o pedido correto e reutiliza rascunho: %s', (savedDraft) => {
  const setOrder = jest.fn(), setDraft = jest.fn(), setForm = jest.fn(), setModel = jest.fn(), setCfop = jest.fn();
  handler('handleOpenPreInvoiceOrderEdit', {getPreInvoiceLockedReason: () => '', setMessage: noop,
    findOrderDraft, invoices: savedDraft ? [savedDraft] : [], setOrderDraftToEdit: setDraft,
    setModelOverride: setModel, setOperationCfop: setCfop, setOrderToEditBeforeInvoice: setOrder,
    normalizeOrderForPreInvoiceEdit: (value) => value, setOrderEditForm: setForm, setOrderEditProductSearch: noop, setOrderEditError: noop})(order);
  expect(setOrder).toHaveBeenCalledWith(order);
  expect(setDraft).toHaveBeenCalledWith(savedDraft);
  expect(setForm.mock.calls[0][0].id).toBe(order.id);
  expect(setModel.mock.calls).toEqual(savedDraft ? [['55']] : []);
  expect(setCfop.mock.calls).toEqual(savedDraft ? [['5101']] : []);
  expect(setForm.mock.calls[0][0].observacao).toBe(savedDraft ? savedDraft.additionalInfo : order.observacao);
});

test.each([null, draft])('Salvar editor atualiza pedido, invalida checagem e não duplica rascunho: %s', async (savedDraft) => {
  const updateItem = jest.fn(), save = jest.fn().mockResolvedValue({data: {draftId: draft.id}}), setValidation = jest.fn();
  const normalized = {...order, subtotal: 20, desconto: 0, valorFrete: 0, observacao: 'Editada'};
  await handler('handleSavePreInvoiceOrderEdit', {isReadOnly: false, orderToEditBeforeInvoice: order, effectiveStoreId: 'store-1',
    setOrderEditError: noop, getPreInvoiceLockedReason: () => '', buildOrderEditFormWithTotals: () => normalized, orderEditForm: normalized,
    getOrderItemProductId: (item) => item.productId, setOrderEditSaving: noop, setMessage: noop, DEFAULT_ORDER_PAYMENT_METHOD: 'Dinheiro',
    updateItem, setValidationByOrder: setValidation, orderDraftToEdit: savedDraft, functions: {}, httpsCallable: () => save,
    callablePayload: (value) => ({...value, lojaId: 'store-1'}), setOrderToEditBeforeInvoice: noop, setOrderDraftToEdit: noop, setOrderEditProductSearch: noop
  })({preventDefault: noop});
  expect(updateItem).toHaveBeenCalledWith('pedidos', order.id, expect.objectContaining({observacao: 'Editada', total: 20}), 'store-1');
  expect(setValidation.mock.calls[0][0]({[order.id]: {ok: true}})).toEqual({});
  expect(save.mock.calls).toEqual(savedDraft ? [[{orderId: order.id, model: 55, operationCfop: '5101', additionalInfo: 'Editada', lojaId: 'store-1'}]] : []);
});

test.each([55, 65])('Impressora revalida e abre confirmação do modelo %s sem emitir', async (model) => {
  const api = jest.fn().mockResolvedValue({data: {ok: true}}), open = jest.fn();
  await handler('handleIssueOrder', {isReadOnly: false, modelOverride: String(model), effectiveStoreId: 'store-1', operationCfop: '5101',
    setMessage: noop, setBusyOrderId: noop, validationByOrder: {[order.id]: {ok: true, draftId: draft.id, model, operationCfop: '5101'}},
    functions: {}, httpsCallable: (unused, name) => {expect(name).toBe('fiscalCheckDraft'); return api;}, callablePayload: (value) => value,
    setValidationByOrder: noop, setOrderToIssue: open, setOrderDraftId: noop, setIssueAdditionalInfo: noop, setIssueError: noop})(order);
  expect(open).toHaveBeenCalledWith(order);
  expect(api).toHaveBeenCalledTimes(1);
});

test.each(['authorized', 'rejected'])('Confirmação envia emissão; DANFE somente autorizado (%s)', async (status) => {
  const api = jest.fn().mockResolvedValue({data: {status, invoiceId: 'new-invoice', danfePdfReady: true}}), download = jest.fn();
  await handler('handleConfirmIssue', {isReadOnly: false, orderToIssue: order, modelOverride: '55', orderDraftId: draft.id,
    setBusyOrderId: noop, setIssueError: noop, functions: {},
    httpsCallable: (unused, name) => {expect(name).toBe('fiscalIssueDraft'); return api;}, callablePayload: (value) => value,
    setOrderToIssue: noop, setIssueAdditionalInfo: noop, setActiveTab: noop, setMessage: noop, downloadInvoiceArtifact: download})({preventDefault: noop});
  expect(api).toHaveBeenCalledWith({draftId: draft.id, model: 55});
  expect(download).toHaveBeenCalledTimes(status === 'authorized' ? 1 : 0);
});

test('Cancelar confirmação não executa emissão', async () => {
  const api = jest.fn();
  await handler('handleConfirmIssue', {isReadOnly: false, orderToIssue: null, httpsCallable: api})({preventDefault: noop});
  expect(api).not.toHaveBeenCalled();
});
