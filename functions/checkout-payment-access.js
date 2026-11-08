// InfinitePay's documented Checkout contract keeps credit_card enabled even
// with options.payment_methods_enabled=['pix']. An API key cannot enforce
// Pix-only. Fail closed for new guest charges; never trust browser options.
// Historical links/status/reconciliation retain their existing contracts.
function assertOnlinePaymentAccess(mode) {
  if(mode==='guest') throw Object.assign(new Error('Pagamento Pix online indisponível para visitantes. Escolha Combinar Pagamento.'),
    {httpStatus:403,code:'GUEST_PIX_ONLY_UNAVAILABLE'});
}
module.exports={assertOnlinePaymentAccess};
