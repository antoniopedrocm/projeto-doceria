import {findOrderDraft, validateFiscalOrder, createFiscalOrderActions} from './fiscalOrderActions';

const order = {id: 'order-1', observacao: 'Sem açúcar'};
const draft = {id: 'draft_order-1_55', orderId: order.id, status: 'draft', model: 55, operationCfop: '5101'};
const call = jest.fn();
const validate = (options = {}) => validateFiscalOrder({order, model: '55', operationCfop: '5101', call, ...options});
beforeEach(() => call.mockReset());

test('setas checam pedido sem criar rascunho nem emitir', async () => {
  call.mockResolvedValue({ok: true});
  const result = await validate({save: false});
  expect(call.mock.calls).toEqual([['fiscalValidateOrder', {orderId: order.id, modelOverride: 55, operationCfop: '5101'}]]);
  expect(result.draftId).toBeUndefined();
});

test('setas checam o ID do rascunho existente sem salvá-lo', async () => {
  call.mockResolvedValue({ok: true});
  expect((await validate({draft, save: false})).draftId).toBe(draft.id);
  expect(call.mock.calls).toEqual([['fiscalCheckDraft', {draftId: draft.id}]]);
});

test('checagem de pedido exige modelo explícito, sem escolher NF-e/NFC-e automaticamente', async () => {
  await expect(validate({model: '', save: false})).rejects.toThrow('Selecione NF-e ou NFC-e');
  expect(call).not.toHaveBeenCalled();
});

test.each([55, 65])('Salvar e Validar preserva modelo %s e só verifica o rascunho retornado', async (model) => {
  call.mockResolvedValueOnce({draftId: `draft_order-1_${model}`}).mockResolvedValueOnce({ok: true});
  const result = await validate({save: true, model: String(model), draft: {...draft, model}});
  expect(call.mock.calls).toEqual([
    ['fiscalSaveDraft', {orderId: order.id, model, operationCfop: '5101', additionalInfo: 'Sem açúcar'}],
    ['fiscalCheckDraft', {draftId: `draft_order-1_${model}`}]
  ]);
  expect(result.model).toBe(model);
});

test('pendências continuam salvas e bloqueiam emissão', async () => {
  call.mockResolvedValueOnce({draftId: draft.id}).mockResolvedValueOnce({ok: false, errors: ['NCM não informado']});
  const result = await validate({save: true});
  expect(result).toMatchObject({draftId: draft.id, ok: false, errors: ['NCM não informado']});
});

test('modelo diferente ou não selecionado não cria segundo rascunho', async () => {
  await expect(validate({draft, model: '65', save: true})).rejects.toThrow('outro modelo');
  await expect(validate({draft, model: '', save: true})).rejects.toThrow('outro modelo');
  expect(call).not.toHaveBeenCalled();
});

test('checagem não atribui CFOP novo a rascunho ainda não atualizado', async () => {
  call.mockResolvedValue({ok: true});
  const result = await validate({draft, save: false, operationCfop: '6101'});
  expect(result.operationCfop).toBe('5101');
});

test('editar seleciona apenas rascunho do mesmo pedido, sem modificar as notas', () => {
  const invoices = [draft, {...draft, id: 'other', orderId: 'other'}, {...draft, id: 'authorized', status: 'authorized'}];
  const snapshot = JSON.stringify(invoices);
  expect(findOrderDraft(invoices, order.id)).toBe(draft);
  expect(findOrderDraft(invoices, 'missing')).toBeNull();
  expect(JSON.stringify(invoices)).toBe(snapshot);
});

const edit = jest.fn(), check = jest.fn(), save = jest.fn(), issue = jest.fn();
const actions = (options = {}) => createFiscalOrderActions({icons: {Edit: 'edit', RefreshCw: 'check', Save: 'save', Printer: 'issue'},
  edit, check, save, issue, locked: () => '', busy: false, validations: {}, model: '55', operationCfop: '5101', ...options});

test('ações coexistem e recebem exatamente o pedido selecionado', () => {
  const buttons = actions();
  expect(buttons.map((button) => button.icon)).toEqual(['edit', 'check', 'save', 'issue']);
  buttons.forEach((button) => button.onClick(order));
  [edit, check, save, issue].forEach((handler) => expect(handler).toHaveBeenLastCalledWith(order));
  expect(buttons[3].isDisabled(order)).toBe(true);
});

test('somente rascunho validado do modelo e CFOP escolhidos habilita confirmação', () => {
  const validations = {[order.id]: {ok: true, draftId: draft.id, model: 55, operationCfop: '5101'}};
  expect(actions({validations})[3].isDisabled(order)).toBe(false);
  expect(actions({validations, model: '65'})[3].isDisabled(order)).toBe(true);
  expect(actions({validations, operationCfop: '6101'})[3].isDisabled(order)).toBe(true);
  expect(actions({validations, busy: true}).every((button) => button.isDisabled(order))).toBe(true);
});

test('autorizada, cancelada ou em processamento não oferecem alteração nem emissão', () => {
  ['authorized', 'cancelled', 'pending_return'].forEach((status) => {
    expect(actions({locked: () => status}).every((button) => !button.isVisible(order))).toBe(true);
  });
  expect(actions({readOnly: true})).toEqual([]);
});
