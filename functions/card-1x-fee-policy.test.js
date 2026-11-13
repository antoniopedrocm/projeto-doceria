const {test}=require('node:test');
const assert=require('node:assert/strict');
const {STORE,CUSTOMER,card1xFeePayer,validateCard1xPreference,card1xFeeStatus}=require('./card-1x-fee-policy');
test('stores without a preference default to STORE, without writes or migration',()=>{
  for(const config of [undefined,{}, {card1xFeePayer:null},{card1xFeePayer:'invalid'}])assert.equal(card1xFeePayer(config),STORE);
  const config={handle:'merchant',options:{assured_installments:4}};const before=structuredClone(config);
  assert.equal(validateCard1xPreference({},config),STORE);assert.deepEqual(config,before);
});
test('valid existing preferences are preserved; old UI payload does not reset them',()=>{
  for(const payer of [STORE,CUSTOMER]){
    const c={card1xFeePayer:payer};assert.equal(card1xFeePayer(c),payer);
    assert.equal(validateCard1xPreference({},c),payer);
    assert.equal(validateCard1xPreference({card1xFeePayer:payer},c),payer);
  }
  assert.equal(validateCard1xPreference({card1xFeePayer:STORE},{card1xFeePayer:CUSTOMER}),STORE);
});
test('new customer pass-through is rejected even if frontend forges readiness or native options',()=>{
  for(const forged of [{},{customerPassThroughAvailable:true},{options:{assured_installments:0}},{apiKey:'inchk_synthetic_not_real'}]){
    assert.throws(()=>validateCard1xPreference({card1xFeePayer:CUSTOMER,...forged},{}),e=>e.code==='failed-precondition');
  }
});
test('invalid new enum values fail explicitly instead of changing amounts or coercing booleans',()=>{
  for(const value of [null,false,0,1,'CLIENT','store','assume',{},[]])assert.throws(()=>validateCard1xPreference({card1xFeePayer:value},{}),e=>e.code==='invalid-argument');
});
test('readiness is honest: desired STORE/legacy CUSTOMER is not a confirmed provider fee policy',()=>{
  for(const payer of [STORE,CUSTOMER])assert.deepEqual(card1xFeeStatus({card1xFeePayer:payer}),{payer,application:'PENDING_PROVIDER_VALIDATION',reason:'CREDENTIAL_AND_MERCHANT_POLICY_REQUIRED',baselineAssuredInstallments:null,customerPassThroughAvailable:false});
});
