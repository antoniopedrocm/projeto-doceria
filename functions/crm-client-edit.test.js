const {test} = require('node:test');
const assert = require('node:assert/strict');
const {claimedClientPatch,isClientStaffProfile} = require('./crm-client-edit');
const customer = {authOwnerUid:'customer',authOwnerUids:['customer','second'],identityRegistryVersion:1,phone_verified_at:'verified',telefone:'62985550045',lojaId:'loja-a',lojasVisitadas:['loja-a'],address:{street:'Anterior',number:'123'},enderecos:[{id:'saved'}],numeroDeCompras:5,valorEmCompras:50};
const owner = {role:'dono',ativo:true};
const patch = (options={}) => claimedClientPatch({customer,input:{nome:'Revisado',cpf:'52998224725',cep:'74477600',address:{street:'Nova',zip:'74477600'}},profile:owner,lojaId:'loja-a',...options});
test('CRM allows linked-customer contact/fiscal data without identity/phone/history mutation', () => {
  const before=JSON.stringify(customer);
  const result=patch({input:{...customer,nome:'Revisado',authOwnerUid:'forged',role:'dono',phone_verified_at:null,telefone:'62985550045',numeroDeCompras:999,valorEmCompras:999,enderecos:[],saved_cards:['forged'],provider:'forged',address:{street:'Nova',phoneVerified:true}}});
  assert.equal(result.nome,'Revisado');assert.deepEqual(result.address,{street:'Nova',number:'123'});
  for(const field of ['authOwnerUid','authOwnerUids','identityRegistryVersion','telefone','phone_verified_at','role','numeroDeCompras','valorEmCompras','enderecos','saved_cards','provider','lojasVisitadas','lojaId']) assert.equal(Object.hasOwn(result,field),false,field);
  assert.equal(JSON.stringify(customer),before);
});
test('same-store manager/attendant permitted by existing staff policy; cross-store targets denied', () => {
  for(const role of ['gerente','atendente']) {
    assert.ok(patch({profile:{role,lojaIds:['loja-a']}}).nome);
    assert.throws(()=>patch({profile:{role,lojaIds:['loja-b']}}),e=>e.httpStatus===403);
    assert.throws(()=>patch({profile:{role,lojaIds:['loja-a']},customer:{...customer,lojaId:'loja-b',lojasVisitadas:['loja-b']}}),e=>e.httpStatus===403);
  }
});
test('inactive, nonstaff, module-disabled and missing/general-store contexts denied', () => {
  for(const profile of [null,{role:'cliente'},{role:'contador'},{role:'dono',ativo:false},{role:'dono',status:'inativo'},{role:'dono',permissions:{clientes:false}}]) assert.throws(()=>patch({profile}),e=>e.httpStatus===403);
  assert.throws(()=>patch({customProfile:{permissions:{clientes:false}}}),e=>e.httpStatus===403);
  for(const lojaId of ['',null,'__all__'])assert.throws(()=>patch({lojaId}),e=>e.httpStatus===403);
});
test('owner scope preserves existing access to stores and safe text/empty fields', () => {
  assert.ok(patch({lojaId:'loja-b'}));assert.deepEqual(patch({input:{cpf:'',email:null}}),{cpf:'',email:null});
  for(const input of [{nome:{}},{address:[]},{address:{street:{}}}])assert.throws(()=>patch({input}),e=>e.httpStatus===400);
});
test('shared store policy keeps public/nonstaff and other-store requests out', () => {
  assert.equal(isClientStaffProfile({role:'cliente',lojaId:'loja-a'},'loja-a'),false);
  assert.equal(isClientStaffProfile({role:'gerente',lojaId:'loja-a'},'loja-b'),false);
  assert.equal(isClientStaffProfile({role:'dono'},'loja-b'),true);
});
