export const PAYMENT_CHOICES = Object.freeze({
  ONLINE_NOW: {label: 'Pagar Agora — Pix ou Cartão', forma: 'Online', helper: 'Você será direcionado ao ambiente seguro de pagamento após confirmar o pedido.'},
  AGREED_LATER: {label: 'Combinar Pagamento', forma: 'A combinar', helper: 'Combine a forma de pagamento diretamente com a loja. O método será informado posteriormente.'},
});

export function paymentSelection(value, eligible) {
  const choice = PAYMENT_CHOICES[value];
  if (!choice) return {forma: value}; // Historical guest/phone checkout contract.
  if (!eligible) throw new Error('Selecione novamente como continuar.');
  return {forma: choice.forma, mode: value};
}

export function resetPaymentChoice(select) {
  if (!['authenticated-v1','guest-v1'].includes(select?.dataset.paymentChoices)) return;
  select.value = select.dataset.paymentChoices==='guest-v1' ? 'AGREED_LATER' : 'ONLINE_NOW';
  select.dispatchEvent(new select.ownerDocument.defaultView.Event('change'));
}

export function syncPaymentChoices(select, strong, onlineEnabled, variant='authenticated-v1') {
  if (!select) return;
  if (!select.legacyPaymentOptions) select.legacyPaymentOptions = select.innerHTML;
  if (strong && select.dataset.paymentChoices !== variant) {
    select.replaceChildren(...Object.entries(PAYMENT_CHOICES).map(([value, choice]) => {
      const option = select.ownerDocument.createElement('option');
      option.value = value; option.textContent = variant==='guest-v1' && value==='ONLINE_NOW' ? 'Pagar Agora — Pix' : choice.label; return option;
    }));
    select.value = variant==='guest-v1' ? 'AGREED_LATER' : 'ONLINE_NOW';
    select.dataset.paymentChoices = variant;
  } else if (!strong && select.dataset.paymentChoices) {
    select.innerHTML = select.legacyPaymentOptions;
    delete select.dataset.paymentChoices;
  }
  const online = select.querySelector('option[value="ONLINE_NOW"]');
  if (online) online.disabled = variant==='guest-v1' || !onlineEnabled;
  const helper = select.ownerDocument.getElementById(select.getAttribute('aria-describedby') || 'payment-choice-help');
  const update = () => {
    if (!helper) return;
    helper.hidden = !select.dataset.paymentChoices;
    helper.textContent = select.dataset.paymentChoices ? PAYMENT_CHOICES[select.value]?.helper || '' : '';
  };
  if (!select.paymentChoiceListener) {
    select.addEventListener('change', update); select.paymentChoiceListener = true;
  }
  update();
}
