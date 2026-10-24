const {test}=require('node:test');
const assert=require('node:assert/strict');
const {addressOptions}=require('./checkout-addresses');
test('projeção weak usa allowlist, mascara texto livre e não retorna destino, CEP, referência, coordenadas ou IDs privados',()=>{
  const addresses=[{id:'private-id',nickname:'Casa',street:'Av. T-63',number:'123',neighborhood:'Setor Bueno',
    enderecoCompleto:'Av. T-63, 123, apto 401',cep:'74230100',complemento:'apto 401',referencia:'portão azul',lat:-16,lng:-49,isDefault:true},
  'Rua privada 42, casa 150, CEP 12345678', {nickname:'Casa da minha Mãe',enderecoCompleto:'Destino privado'}];
  const options=addressOptions('a'.repeat(64),'private-customer',addresses);
  assert.deepEqual(Object.keys(options[0]).sort(),['id','isDefault','neighborhoodMasked','nickname','numberMasked','protected','saved','streetMasked','summary']);
  assert.equal(options[0].summary,'Av. T***, nº *** · Setor B*** · Endereço protegido');assert.equal(options[0].protected,true);
  assert.equal(options[0].nickname,'Casa');assert.equal(options[2].nickname,'Casa da minha Mãe');
  for(const secret of ['private-id','private-customer','T-63','123','74230100','apto','portão','-16','-49','150','12345678','Destino privado']) assert.equal(JSON.stringify(options.map(({id,...display})=>display)).includes(secret),false,secret);
  assert.deepEqual(addressOptions('a'.repeat(64),'private-customer',addresses),options);
  assert.notEqual(addressOptions('b'.repeat(64),'private-customer',addresses)[0].id,options[0].id);
  assert.notEqual(addressOptions('a'.repeat(64),'other-customer',addresses)[0].id,options[0].id);
});

test('fallback apenas sem nickname válido; não adivinha campos históricos nem interpreta HTML',()=>{
  const labels=[undefined,null,42,'','  ','x'.repeat(61),'nome\ninválido'];
  for(const label of labels){const [option]=addressOptions('a'.repeat(64),'owner',[{nickname:label,enderecoCompleto:'Destino privado',name:'Campo não canônico'}]);assert.equal(option.nickname,'Endereço 1');}
  const [trimmed]=addressOptions('a'.repeat(64),'owner',[{nickname:'  Casa da minha Mãe  ',enderecoCompleto:'Destino privado'}]);assert.equal(trimmed.nickname,'Casa da minha Mãe');
});
test('projeção anterior ao SMS permite distinguir rua/bairro mascarados sem expor os dados completos',()=>{
  const [value]=addressOptions('a'.repeat(64),'id',[{id:'one',nickname:'Casa',city:'Goiânia',state:'GO',street:'Rua privada',number:'123',neighborhood:'Setor Bueno',enderecoCompleto:'Rua privada 123'}]);
  assert.equal(value.city,'Goiânia');assert.equal(value.state,'GO');assert.equal(value.streetMasked,'Rua p***');assert.equal(value.neighborhoodMasked,'Setor B***');assert.doesNotMatch(JSON.stringify(value),/Rua privada|123|Bueno/);
});
test('padrão vem primeiro, demais mantêm ordem; vazios e formatos antigos não quebram',()=>{
  const options=addressOptions('a'.repeat(64),'id',[null,{},'', {id:'a',enderecoCompleto:'A'}, {id:'b',enderecoCompleto:'B',isDefault:true},{id:'c',enderecoCompleto:'C'}]);
  assert.equal(options.length,3);assert.equal(options[0].isDefault,true);
  assert.deepEqual(options.map(a=>a.nickname),['Endereço 2','Endereço 1','Endereço 3']);
  assert.deepEqual(addressOptions('a'.repeat(64),'id',undefined),[]);
});

test('apelido canônico personalizado sobrevive à projeção/reload/novo contexto sem alterar o registro',()=>{
  const original={id:'named-stable',nickname:'Casa da minha Mãe',street:'Rua particular',number:'123',neighborhood:'Bairro privado',enderecoCompleto:'Destino completo privado',isDefault:true};
  const before=JSON.stringify(original);
  for(const token of ['a'.repeat(64),'b'.repeat(64)]) {
    const [option]=addressOptions(token,'owner',[JSON.parse(before)]);
    assert.equal(option.nickname,'Casa da minha Mãe');assert.equal(option.isDefault,true);assert.equal(option.saved,true);
    for(const key of ['street','number','enderecoCompleto','complement','cep','lat','lng'])assert.equal(Object.hasOwn(option,key),false);
  }
  assert.equal(JSON.stringify(original),before);
});
