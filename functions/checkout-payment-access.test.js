const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assertOnlinePaymentAccess}=require('./checkout-payment-access');
test('guest cannot be upgraded by a requested method, options, key or merchant flag',()=>{
  for(const forged of [{},{payment_methods_enabled:['pix']},{mode:'strong_auth'},{apiKey:'inchk_synthetic_only',pixOnly:true}]) {
    assert.throws(()=>assertOnlinePaymentAccess('guest',forged),e=>e.httpStatus===403 && e.code==='GUEST_PIX_ONLY_UNAVAILABLE');
  }
});
test('strong Google/password and legacy phone keep current payment permissions',()=>{
  for(const mode of ['strong_auth','legacy_phone'])assert.doesNotThrow(()=>assertOnlinePaymentAccess(mode));
});
