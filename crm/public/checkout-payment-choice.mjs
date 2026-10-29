export const PAYMENT_CHOICES = Object.freeze({
  ONLINE_NOW: {label: 'Pagar Agora — Pix ou Cartão', forma: 'Online', helper: 'Você será direcionado ao ambiente seguro de pagamento após confirmar o pedido.'},
  AGREED_LATER: {label: 'Combinar Pagamento', forma: 'A combinar', helper: 'Combine a forma de pagamento diretamente com a loja. O método será informado posteriormente.'},
});

export function paymentSelection(value, strong) {
  const choice = PAYMENT_CHOICES[value];
  if (!choice) return {forma: value}; // Historical guest/phone checkout contract.
  if (!strong) throw new Error('Entre com Google ou e-mail para continuar com esta identificação.');
  return {forma: choice.forma, mode: value};
}

export function resetPaymentChoice(select) {
  if (select?.dataset.paymentChoices !== 'authenticated-v1') return;
  select.value = 'ONLINE_NOW';
  select.dispatchEvent(new select.ownerDocument.defaultView.Event('change'));
}

export function syncPaymentChoices(select, strong, onlineEnabled) {
  if (!select) return;
  if (!select.legacyPaymentOptions) select.legacyPaymentOptions = select.innerHTML;
  if (strong && select.dataset.paymentChoices !== 'authenticated-v1') {
    select.replaceChildren(...Object.entries(PAYMENT_CHOICES).map(([value, choice]) => {
      const option = select.ownerDocument.createElement('option');
      option.value = value; option.textContent = choice.label; return option;
    }));
    select.value = 'ONLINE_NOW';
    select.dataset.paymentChoices = 'authenticated-v1';
  } else if (!strong && select.dataset.paymentChoices) {
    select.innerHTML = select.legacyPaymentOptions;
    delete select.dataset.paymentChoices;
  }
  const online = select.querySelector('option[value="ONLINE_NOW"]');
  if (online) online.disabled = !onlineEnabled;
  const helper = select.ownerDocument.getElementById('payment-choice-help');
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
