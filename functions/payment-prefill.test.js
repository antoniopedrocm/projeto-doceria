const {test}=require('node:test'),assert=require('node:assert/strict');const {paymentPrefill}=require('./payment-prefill');
test('dados dinâmicos, flags, email opcional e endereço somente na entrega',()=>{const buyer={nome:'Ana',telefone:'62999998888'},address={cep:'74000-000',street:'Rua A',number:'10',neighborhood:'Centro',complement:''};const p=paymentPrefill({},buyer,{pickup:false,address},'ana@example.com');assert.equal(p.customer.email,'ana@example.com');assert.equal(p.customer.phone_number,'+5562999998888');assert.equal(p.address.cep,'74000000');assert.equal(paymentPrefill({},buyer,{pickup:true,address}).address,undefined);assert.equal(paymentPrefill({},buyer,{pickup:false}).address,undefined);assert.equal(paymentPrefill({},buyer,{}).customer.email,undefined);assert.deepEqual(paymentPrefill({sendCustomerData:false,sendDeliveryAddress:false},buyer,{pickup:false,address}),{});assert.equal(paymentPrefill({},{nome:'Bia',telefone:'11999999999'},{}).customer.name,'Bia');});
test('mesmo Customer mantém E.164 em formatos históricos e prioriza o telefone canônico normalizado',()=>{
  for(const value of ['62999998888','+5562999998888','5562999998888','(62) 99999-8888'])assert.equal(paymentPrefill({},{nome:'Ana',telefone:value},{}).customer.phone_number,'+5562999998888');
  assert.equal(paymentPrefill({},{nome:'Ana',normalizedPhone:'+5562999998888',phone_number:'+5562985007778',telefone:'62985007778'},{}).customer.phone_number,'+5562999998888');
  assert.equal(paymentPrefill({},{nome:'Ana',phone_number:'+5562999998888'},{}).customer.phone_number,'+5562999998888');
});
test('email de Auth válido prevalece e email canônico disponível é fallback sem aceitar campos PCI',()=>{
  const buyer={nome:'Ana',telefone:'62999998888',email:'canonical@example.test',PAN:'PCI_SENTINEL',CVV:'CVV_SENTINEL',cardToken:'TOKEN_SENTINEL'};
  assert.deepEqual(paymentPrefill({},buyer,{},'auth@example.test').customer,{name:'Ana',phone_number:'+5562999998888',email:'auth@example.test'});
  assert.equal(paymentPrefill({},buyer,{}).customer.email,'canonical@example.test');
  assert.equal(paymentPrefill({},{...buyer,email:'invalid'},{}).customer.email,undefined);
});
test('telefone inválido não produz prefill malformado; opt-out permanece sem dados de Customer',()=>{
  assert.throws(()=>paymentPrefill({},{nome:'Ana',telefone:'invalid'},{}),{code:'CUSTOMER_PHONE_INVALID'});
  assert.deepEqual(paymentPrefill({sendCustomerData:false},{nome:'Ana',telefone:'invalid'},{}),{});
});

const {assertFinancialPermissionGrant}=require('./payment-settings');
test('gerente não concede permissão financeira, mas mantém a já autorizada',()=>{for(const key of ['configuracoes','settings'])assert.throws(()=>assertFinancialPermissionGrant({role:'gerente'},{[key]:{manage_payment_settings:true}}));assert.doesNotThrow(()=>assertFinancialPermissionGrant({role:'gerente'},{configuracoes:{manage_payment_settings:true}},{configuracoes:{manage_payment_settings:true}}));assert.doesNotThrow(()=>assertFinancialPermissionGrant({role:'dono'},{configuracoes:{manage_payment_settings:true}}));});
