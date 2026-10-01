const {DEV_PROJECT_ID, STORE_ID_PATTERN, getRuntimeProjectId} = require('./whatsapp-config');
const {CONSENT_VERSION, normalizeBrazilPhone} = require('./whatsapp-checkout');

const TEMPLATE = Object.freeze({
  name: 'confirmacao_pedido_v1', language: 'pt_BR', version: 'order-summary-v1', category: 'UTILITY',
  body: 'Olá! Recebemos seu pedido {{1}} na Ana Guimarães Doceria.\n\nResumo do pedido: {{2}}\n\nTotal: {{3}}\n\nAgradecemos a sua preferência!',
});
const invalid = (code) => ({status: 'failed', code});
const cleanText = (value) => {
  if (typeof value !== 'string') throw new Error('invalid_order_data');
  // Whitespace adaptation for positional template parameters; no content truncation.
  return value.replace(/[\s\x00-\x1f\x7f]+/g, ' ').trim();
};
const money = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
      !Number.isSafeInteger(Math.round(value * 100))) throw new Error('invalid_order_data');
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
};
const has = (value) => value !== undefined && value !== null;

// Pure formatter: callers must provide a saved order, not a cart or customer profile.
const buildOrderSummary = ({orderId, order}) => {
  try {
    if (!order || !Array.isArray(order.itens) || !order.itens.length) return invalid('invalid_order_data');
    const code = order.numeroPedido ?? order.codigo ?? order.numero ?? orderId;
    const orderCode = typeof code === 'number' && Number.isSafeInteger(code) ? String(code) : cleanText(code);
    if (!orderCode) return invalid('invalid_order_data');
    const details = [];
    const add = (label, value) => {
      if (!has(value) || value === '') return;
      const text = cleanText(value);
      if (text) details.push(`${label}: ${text}`);
    };
    add('Cliente', order.clienteNome);
    const items = order.itens.map((item) => {
      const name = cleanText(item.nome);
      const quantity = item.quantity ?? item.quantidade;
      if (!name || typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('invalid_order_data');
      }
      // These structures are absent from the current checkout schema. Never drop
      // unknown option details silently if another source adds them in the future.
      if (['opcoes', 'adicionais', 'complementos', 'variacao'].some((key) =>
        has(item[key]) && item[key] !== '' && !(Array.isArray(item[key]) && !item[key].length))) {
        throw new Error('unsupported_item_options');
      }
      let line = `${String(quantity).replace('.', ',')}x ${name}`;
      if (has(item.preco)) line += ` (${money(item.preco)} un.)`;
      if (item.observacao) line += ` — ${cleanText(item.observacao)}`;
      return line;
    });
    details.push(`Itens: ${items.join('; ')}`);
    if (has(order.subtotal)) details.push(`Subtotal: ${money(order.subtotal)}`);
    const discount = order.cupom?.valorDesconto ?? order.desconto;
    if (has(discount)) {
      const amount = money(discount);
      if (discount > 0) {
        const coupon = order.cupom?.codigo ? ` (${cleanText(order.cupom.codigo)})` : '';
        details.push(`Desconto${coupon}: ${amount}`);
      }
    }
    const freight = order.valorFrete ?? order.frete;
    if (order.freteACombinar === true || order.tipoFrete === 'a_combinar') {
      details.push('Frete: A Combinar');
    } else if (has(freight)) details.push(`Frete: ${money(freight)}`);
    if (order.clienteEndereco === 'Retirar na Loja') details.push('Retirada na loja');
    else add('Endereço', order.clienteEndereco);
    add('Pagamento', order.formaPagamento);
    add('Status', order.status);
    add('Observações', order.observacao);
    const bodyParameters = [orderCode, details.join(' | '), money(order.total)];
    const preview = TEMPLATE.body.replace(/\{\{([1-3])\}\}/g, (_, index) => bodyParameters[Number(index) - 1]);
    // Conservative application ceiling for the entire rendered body, not per item.
    if (preview.length > 1024 || bodyParameters.some((value) => value.length > 1024)) {
      return invalid('summary_too_long');
    }
    return {status: 'ready', template: TEMPLATE, bodyParameters, preview};
  } catch (error) {
    return invalid(error.message === 'unsupported_item_options' ? error.message : 'invalid_order_data');
  }
};

// Preparation only: does not send, write, schedule, or read a customer/catalog.
const createOrderConfirmationPreparer = ({db, getProjectId = getRuntimeProjectId} = {}) => ({
  async prepare({storeId, orderStoreId = storeId, orderId} = {}) {
    try {
      if (getProjectId() !== DEV_PROJECT_ID) return invalid('environment_blocked');
      if (typeof storeId !== 'string' || !STORE_ID_PATTERN.test(storeId) ||
          typeof orderStoreId !== 'string' || !STORE_ID_PATTERN.test(orderStoreId) ||
          typeof orderId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(orderId)) {
        return invalid('invalid_order_reference');
      }
      const snapshot = await db.doc(`lojas/${orderStoreId}/pedidos/${orderId}`).get();
      if (!snapshot.exists) return invalid('order_not_found');
      const order = snapshot.data();
      if (order.lojaId && order.lojaId !== orderStoreId) return invalid('store_mismatch');
      if (order.payment_status && (order.payment_status !== 'PAID' || order.requiresReview)) {
        return {status: 'skipped', code: 'payment_not_confirmed'};
      }
      const metadata = order.whatsappConfirmation;
      if (metadata?.consent?.granted !== true || metadata.consent.version !== CONSENT_VERSION ||
          metadata.consent.status !== 'granted') {
        return {status: 'skipped', code: 'consent_missing'};
      }
      const phone = normalizeBrazilPhone(order.telefone);
      if (phone.status !== 'valid' || metadata.phoneStatus !== 'valid' || phone.e164 !== metadata.phoneE164) {
        return invalid('invalid_recipient');
      }
      const summary = buildOrderSummary({orderId, order});
      if (summary.status !== 'ready') return summary;
      return {...summary, storeId, orderId, recipient: phone.e164.slice(1),
        expectedTemplate: {name: TEMPLATE.name, language: TEMPLATE.language}};
    } catch (_) {
      return invalid('order_unavailable');
    }
  },
});

module.exports = {TEMPLATE, buildOrderSummary, createOrderConfirmationPreparer};
