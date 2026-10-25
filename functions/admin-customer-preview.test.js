const {test}=require('node:test'),assert=require('node:assert/strict');
const {previewAllowed,previewDetails,addressProjection,profileProjection}=require('./admin-customer-preview');
test('capability tem default apenas Dono, revogável; gerente requer concessão e módulo Clientes',()=>{
  const permissions={clientes:true};
  assert.equal(previewAllowed('dono',permissions,null),true);
  assert.equal(previewAllowed('dono',permissions,{clientes:{view_customer_as_readonly:false}}),false);
  assert.equal(previewAllowed('gerente',permissions,null),false);
  assert.equal(previewAllowed('gerente',permissions,{clientes:{view_customer_as_readonly:true}}),true);
  for(const role of ['atendente','cliente','contador',null])assert.equal(previewAllowed(role,permissions,{clientes:{view_customer_as_readonly:true}}),false);
  assert.equal(previewAllowed('dono',{clientes:false},null),false);
  assert.deepEqual(previewDetails('gerente',permissions,null),{view_customer_as_readonly:false});
});
test('projeções explícitas não incluem UIDs, flags, órfãos, coordenadas ou metadados de segurança',()=>{
  const data={nome:'Cliente',authOwnerUid:'never',roles:['staff'],telefone:'fixture',email:'test@example.test',endereco:'orphan',
    enderecos:[{id:'a',nomeEndereco:'Casa da minha Mãe',enderecoCompleto:'Endereço de teste',isDefault:true,latitude:1,grant:'never'}]};
  assert.deepEqual(Object.keys(profileProjection('c',data)).sort(),['aniversario','email','id','nome','telefone']);
  const address=addressProjection('c',data)[0];assert.equal(address.nomeEndereco,'Casa da minha Mãe');assert.equal(address.isDefault,true);
  assert.equal(address.latitude,undefined);assert.equal(address.grant,undefined);assert.equal(JSON.stringify(address).includes('orphan'),false);
});
