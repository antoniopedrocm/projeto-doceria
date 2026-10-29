const {test}=require('node:test'),assert=require('node:assert/strict');
const {explicitFiscalPayment,manualPaymentPatch,fiscalChoices}=require('./order-payment-method');
test('sem método real AGREED_LATER não usa fallback fiscal',()=>{
  for(const formaPagamento of ['A combinar','Online','']) assert.throws(()=>explicitFiscalPayment({paymentMode:'AGREED_LATER',formaPagamento,paymentMethod:null}),/Selecione/);
});
test('opções reutilizam mappings existentes e não mudam status financeiro',()=>{
  for(const label of Object.keys(fiscalChoices)) {
    const patch=manualPaymentPatch({paymentMode:'AGREED_LATER',paymentMethod:null,payment_status:'PENDING'},label);
    assert.equal(patch.payment_status,undefined);
    assert.equal(explicitFiscalPayment({paymentMode:'AGREED_LATER',...patch}).methodCode,fiscalChoices[label].code);
  }
});
test('provider confirmado é autoridade mesmo com formaPagamento conflitante; online pendente bloqueia NF',()=>{
  for(const [method,code] of [['PIX','17'],['CREDIT_CARD','03']]) {
    const order={paymentMode:'ONLINE_NOW',payment_status:'PAID',paymentMethod:method,paymentMethodSource:'provider/infinitepay',formaPagamento:'Dinheiro'};
    assert.equal(explicitFiscalPayment(order).methodCode,code);
    assert.throws(()=>manualPaymentPatch(order,'Dinheiro'),/não pode/);
  }
  assert.throws(()=>explicitFiscalPayment({paymentMode:'ONLINE_NOW',payment_status:'PENDING'}),/Aguarde/);
  assert.equal(explicitFiscalPayment({formaPagamento:'Dinheiro'}),null);
  assert.throws(()=>manualPaymentPatch({paymentMode:'AGREED_LATER'},'99'),/válida/);
  assert.throws(()=>manualPaymentPatch({paymentMode:'AGREED_LATER',paymentId:'online'},'Dinheiro'),/não pode/);
  assert.throws(()=>explicitFiscalPayment({paymentMode:'AGREED_LATER',formaPagamento:'__proto__'}),/Selecione/);
  const received={paymentMode:'AGREED_LATER',paymentMethod:null,paymentStatus:'PAID'};
  const patch=manualPaymentPatch(received,'Dinheiro');assert.equal({...received,...patch}.paymentStatus,'PAID');
});
