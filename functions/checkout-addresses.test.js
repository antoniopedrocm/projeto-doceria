const {test}=require('node:test');
const assert=require('node:assert/strict');
const {addressOptions}=require('./checkout-addresses');
test('projeção weak usa allowlist, mascara texto livre e não retorna destino, CEP, referência, coordenadas ou IDs privados',()=>{
  const addresses=[{id:'private-id',nickname:'Casa',street:'Av. T-63',number:'123',neighborhood:'Setor Bueno',
    enderecoCompleto:'Av. T-63, 123, apto 401',cep:'74230100',complemento:'apto 401',referencia:'portão azul',lat:-16,lng:-49,isDefault:true},
  'Rua privada 42, casa 150, CEP 12345678', {nickname:'Rua particular 123',enderecoCompleto:'Destino privado'}];
  const options=addressOptions('a'.repeat(64),'private-customer',addresses);
  assert.deepEqual(Object.keys(options[0]).sort(),['id','isDefault','nickname','saved','summary']);
  assert.equal(options[0].summary,'Av. T-••, nº •• · Setor Bueno');
  assert.equal(options[0].nickname,'Casa');assert.equal(options[2].nickname,'Endereço 3');
  for(const secret of ['private-id','private-customer','T-63','123','74230100','apto','portão','-16','-49','150','12345678','Destino privado']) assert.equal(JSON.stringify(options.map(({id,...display})=>display)).includes(secret),false,secret);
  assert.deepEqual(addressOptions('a'.repeat(64),'private-customer',addresses),options);
  assert.notEqual(addressOptions('b'.repeat(64),'private-customer',addresses)[0].id,options[0].id);
  assert.notEqual(addressOptions('a'.repeat(64),'other-customer',addresses)[0].id,options[0].id);
});
test('padrão vem primeiro, demais mantêm ordem; vazios e formatos antigos não quebram',()=>{
  const options=addressOptions('a'.repeat(64),'id',[null,{},'', {id:'a',enderecoCompleto:'A'}, {id:'b',enderecoCompleto:'B',isDefault:true},{id:'c',enderecoCompleto:'C'}]);
  assert.equal(options.length,3);assert.equal(options[0].isDefault,true);
  assert.deepEqual(options.map(a=>a.nickname),['Endereço 2','Endereço 1','Endereço 3']);
  assert.deepEqual(addressOptions('a'.repeat(64),'id',undefined),[]);
});
