// Existing fiscal mappings (fiscal.js / CRM ORDER_PAYMENT_OPTIONS), not new tax codes.
const fiscalChoices = Object.freeze({
  'Pix dinâmico / link gerado': {method:'PIX', code:'17'},
  'Pix fixo / QR Code fixo': {method:'PIX', code:'20'},
  'Link de cartão de crédito': {method:'CREDIT_CARD', code:'03'},
  'Link de cartão de débito': {method:'DEBIT_CARD', code:'04'},
  'Cartão de Crédito': {method:'CREDIT_CARD', code:'03'},
  'Cartão de Débito': {method:'DEBIT_CARD', code:'04'},
  Dinheiro: {method:'CASH', code:'01'},
  'Link de Pagamento': {method:'CREDIT_CARD', code:'03'},
  Pix: {method:'PIX', code:'20'},
});
function paymentFailure(message) {return Object.assign(new Error(message),{code:'failed-precondition'});}
function explicitFiscalPayment(order) {
  if (order.adminPaymentAdjustment?.state === 'REVIEW_REQUIRED' && order.adminPaymentAdjustment.differenceCents !== 0) {
    throw paymentFailure('Pedido alterado após pagamento confirmado. Concilie a diferença de valor antes de emitir a nota.');
  }
  if (order.paymentMethodSource?.startsWith('provider/') && (order.payment_status || order.paymentStatus) === 'PAID') {
    const code = {PIX:'17',CREDIT_CARD:'03',DEBIT_CARD:'04'}[order.paymentMethod];
    if (!code) throw paymentFailure('Método confirmado pelo provedor indisponível. Concilie o pagamento antes de emitir.');
    return {methodCode:code,method:order.paymentMethod,source:order.paymentMethodSource};
  }
  if (order.paymentMode === 'ONLINE_NOW') throw paymentFailure('Aguarde a confirmação do método de pagamento pelo provedor antes de emitir.');
  if (order.paymentMode !== 'AGREED_LATER') return null;
  const selected = Object.hasOwn(fiscalChoices,order.formaPagamento) && fiscalChoices[order.formaPagamento];
  if (!selected || selected.method !== order.paymentMethod || selected.code !== order.fiscalPaymentCode) {
    throw paymentFailure('Selecione a Forma de pagamento real em Salvar e Validar antes de emitir a nota.');
  }
  return {methodCode:selected.code,method:order.paymentMethod,source:order.paymentMethodSource};
}
function manualPaymentPatch(order, label) {
  const choice = Object.hasOwn(fiscalChoices,label) && fiscalChoices[label];
  if (!choice) throw paymentFailure('Selecione uma Forma de pagamento fiscal válida.');
  if (order.paymentMode !== 'AGREED_LATER' || order.paymentId || order.paymentMethodSource?.startsWith('provider/')) {
    throw paymentFailure('O método confirmado pelo provedor não pode ser alterado neste fluxo.');
  }
  if (order.paymentMethod) {
    if (order.paymentMethod !== choice.method || order.fiscalPaymentCode !== choice.code) throw paymentFailure('O método já foi definido. Revise o registro de pagamento fora da emissão.');
    return null;
  }
  return {paymentMethod:choice.method,formaPagamento:label,fiscalPaymentCode:choice.code,paymentMethodSource:'invoice/manual'};
}
module.exports = {fiscalChoices,explicitFiscalPayment,manualPaymentPatch};
