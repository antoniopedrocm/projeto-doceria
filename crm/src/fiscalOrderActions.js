// Actions for Nota Fiscal > Emitir. Saved order drafts reference the editable order.
export function findOrderDraft(invoices, orderId) {
  const time = (invoice) => {
    const value = invoice.updatedAt || invoice.createdAt;
    return value?.toMillis?.() || (value?.seconds ? value.seconds * 1000 : new Date(value || 0).getTime()) || 0;
  };
  return invoices.filter((invoice) => invoice.orderId === orderId && invoice.status === 'draft')
    .sort((a, b) => time(b) - time(a))[0] || null;
}

export async function validateFiscalOrder({order, draft, model, operationCfop, save, call}) {
  const selectedModel = [55, 65].includes(Number(model)) ? Number(model) : null;
  if (!save && !draft && !selectedModel) {
    throw new Error('Selecione NF-e ou NFC-e antes de checar os requisitos do pedido.');
  }
  if (draft?.model && Number(draft.model) !== selectedModel) {
    throw new Error('Este pedido já possui rascunho de outro modelo. Abra Editar para continuar nesse rascunho.');
  }
  let draftId = draft?.id;
  if (save) {
    const saved = await call('fiscalSaveDraft', {
      orderId: order.id, model: selectedModel, operationCfop,
      additionalInfo: order.observacao || order.additionalInfo || ''
    });
    draftId = saved.draftId;
  }
  const result = draftId
    ? await call('fiscalCheckDraft', {draftId})
    : await call('fiscalValidateOrder', {orderId: order.id, modelOverride: selectedModel, operationCfop});
  return {...result, draftId, model: !save && draft ? draft.model : selectedModel,
    operationCfop: !save && draft ? draft.operationCfop : operationCfop};
}

export function createFiscalOrderActions({readOnly, icons, edit, check, save, issue, locked, busy, validations, model, operationCfop}) {
  if (readOnly) return [];
  const available = (row) => !locked(row);
  return [
    {icon: icons.Edit, label: 'Editar pedido / rascunho', onClick: edit, isVisible: available, isDisabled: () => busy},
    {icon: icons.RefreshCw, label: 'Checar requisitos (sem salvar ou emitir)', onClick: check, isVisible: available, isDisabled: () => busy},
    {icon: icons.Save, label: 'Salvar e Validar', showLabel: true, onClick: save, isVisible: available, isDisabled: () => busy},
    {icon: icons.Printer, label: `Emitir Nota Fiscal — ${model === '55' ? 'NF-e' : model === '65' ? 'NFC-e' : 'selecione o modelo'}`,
      showLabel: true, onClick: issue, isVisible: available,
      isDisabled: (row) => busy || validations[row.id]?.ok !== true || !validations[row.id]?.draftId
        || validations[row.id]?.model !== Number(model) || validations[row.id]?.operationCfop !== operationCfop}
  ];
}
