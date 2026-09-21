const {test} = require('node:test');
const assert = require('node:assert/strict');
const {verifiedIdentity, normalizeContactPhone, normalizeAddress, normalizeBirthdate, digest} = require('./checkout-auth');
const user = {uid:'u', providerData:[{providerId:'google.com',uid:'stable-sub'}]};
const token = {uid:'u',firebase:{sign_in_provider:'google.com',identities:{'google.com':['stable-sub']}}};
test('conta depende da identidade Google estável e não exige Firebase Phone Auth',()=>{
  assert.equal(verifiedIdentity(token,user).sub,'stable-sub');
  assert.equal(verifiedIdentity(token,user).provider,'google');
  assert.equal(verifiedIdentity({...token,phone_number:undefined},{...user,phoneNumber:null}).sub,'stable-sub');
  for(const changed of [{...token,firebase:{identities:{'google.com':['other']}}},{...token,uid:'other'}]) assert.throws(()=>verifiedIdentity(changed,user));
});
test('e-mail e senha usam o UID estável do Firebase, sem usar e-mail como chave',()=>{
  const emailUser={uid:'email-uid',email:'cliente@example.com',providerData:[{providerId:'password',uid:'cliente@example.com'}]};
  const emailToken={uid:'email-uid',email:'cliente@example.com',firebase:{sign_in_provider:'password',identities:{email:['cliente@example.com']}}};
  assert.deepEqual(verifiedIdentity(emailToken,emailUser),{provider:'email_password',sub:'email-uid'});
  assert.equal(verifiedIdentity({...emailToken,email:'cliente@example.com'},{...emailUser,emailVerified:false}).sub,'email-uid');
  assert.throws(()=>verifiedIdentity({...emailToken,email:'outro@example.com'},emailUser));
});
test('identidades não usam email e providers têm namespaces distintos',()=>{
  assert.notEqual(digest('google','123'),digest('phone','123'));
  assert.equal(verifiedIdentity(token,{...user,email:'changed@example.com'}).sub,'stable-sub');
  assert.throws(()=>verifiedIdentity(token,{...user,disabled:true}));
});
test('telefone é normalizado como contato brasileiro sem declarar verificação',()=>{
  assert.equal(normalizeContactPhone('(62) 99999-1234'),'62999991234');
  assert.equal(normalizeContactPhone('+55 62 99999-1234'),'62999991234');
  assert.throws(()=>normalizeContactPhone('9999-1234'));
});
test('endereço da conta aceita somente campos e coordenadas válidos',()=>{
  const address=normalizeAddress({enderecoCompleto:' Rua 1, 20 ',nickname:' Casa ',lat:-16.67,lng:-49.27,isDefault:true,extra:'não salvar'});
  assert.deepEqual(address,{enderecoCompleto:'Rua 1, 20',nickname:'Casa',referencia:'',complemento:'',semNumero:false,isDefault:true,localizacaoFrequente:false,lat:-16.67,lng:-49.27});
  assert.equal('extra' in address,false);
  assert.throws(()=>normalizeAddress({enderecoCompleto:'Rua',nickname:'Casa',lat:200,lng:0}));
});
test('data de nascimento rejeita datas impossíveis ou futuras',()=>{
  assert.equal(normalizeBirthdate('1990-05-20'),'1990-05-20');
  assert.equal(normalizeBirthdate(''),'');
  assert.throws(()=>normalizeBirthdate('2020-02-31'));
  assert.throws(()=>normalizeBirthdate('2999-01-01'));
});
