const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createCustomerAccount, digest, normalizeName, addressRecords} = require('./checkout-auth');

const address = (nickname='Casa', isDefault=false) => ({nickname,enderecoCompleto:`Rua ${nickname}, 10`,lat:-16,lng:-49,isDefault});
function fixture(provider='email_password') {
  const email='a@example.com', uid='uid-a', sub=provider==='google'?'google-a':uid;
  const user={uid,email,emailVerified:false,providerData:[{providerId:provider==='google'?'google.com':'password',uid:sub}]};
  const request={auth:{uid,token:{email,firebase:{identities:provider==='google'?{'google.com':[sub]}:{email:[email]}}}},data:{}};
  const rows=new Map([
    [`customerAuthIdentities/${digest(provider,sub)}`,{customerId:'a',uid}],
    ['clientes/a',{authOwnerUid:uid,nome:'Ana',telefone:'62999991234',phone_verified_at:'verified',aniversario:'1990-05-20',enderecos:[]}],
    ['clientes/b',{authOwnerUid:'uid-b',nome:'B',telefone:'62999990000',enderecos:[{...address('B'),id:'b-address'}]}],
    ['clientes/legacy',{nome:'Legado',telefone:'62999990000',enderecos:[]}],
  ]);
  const reads=[], writes=[];
  const db={collection:name=>({doc:id=>db.doc(`${name}/${id || 'new-customer'}`)}),
    doc:path=>({path,id:path.split('/').at(-1),get:async()=>{reads.push(path);return {exists:rows.has(path),data:()=>rows.get(path),id:path.split('/').at(-1)};}}),
    runTransaction:async fn=>{const pending=[];await fn({get:ref=>ref.get(),
      update:(ref,patch)=>pending.push(()=>{rows.set(ref.path,{...rows.get(ref.path),...patch});writes.push(ref.path);}),
      set:(ref,data)=>pending.push(()=>{rows.set(ref.path,data);writes.push(ref.path);})});pending.forEach(apply=>apply());},
  };
  const api=createCustomerAccount({db,admin:{auth:()=>({getUser:async()=>user})}});
  const call=(name,data={})=>api[name]({...request,data});
  return {api,call,rows,reads,writes,user,request};
}

test('perfil normaliza nome, preserva nascimento omitido e ignora campos de identidade/cartão',async()=>{
  const f=fixture();await f.call('update',{nome:'  Ana   Guimarães ',customerId:'b',email:'other@example.com',authOwnerUid:'uid-b',saved_cards:['bad']});
  const d=f.rows.get('clientes/a');assert.equal(d.nome,'Ana Guimarães');assert.equal(d.aniversario,'1990-05-20');
  assert.equal(d.authOwnerUid,'uid-a');assert.equal(d.email,undefined);assert.equal(d.saved_cards,undefined);
  assert.equal(f.rows.get('clientes/b').nome,'B');
  for(const name of ['', ' '.repeat(4), 'a'.repeat(121), 'Ana\u0000']) assert.throws(()=>normalizeName(name));
  assert.equal(normalizeName(' Jose\u0301 '),'José');
});
test('troca de telefone reseta verificação e não faz merge, inclusive com telefone legado',async()=>{
  const f=fixture();await f.call('update',{nome:'Ana',telefone:'(62) 99999-0000'});
  const d=f.rows.get('clientes/a');assert.equal(d.telefone,'62999990000');assert.equal(d.phone_number,'+5562999990000');assert.equal(d.phone_verified_at,null);
  assert.equal(f.rows.get('clientes/legacy').authOwnerUid,undefined);assert.ok(f.writes.every(p=>p==='clientes/a'));
  assert.ok(!f.reads.includes('clientes/legacy'));
  await assert.rejects(f.call('update',{nome:'Ana',telefone:'123'}),e=>e.code==='invalid-argument');
});
test('sem alteração de telefone, verificação existente não é apagada',async()=>{
  const f=fixture();await f.call('update',{nome:'Ana',telefone:'62999991234'});
  assert.equal(f.rows.get('clientes/a').phone_verified_at,'verified');
});
test('IDs legados são estáveis, leitura não escreve e edição preserva ID',async()=>{
  const f=fixture();f.rows.get('clientes/a').enderecos=[address('Casa',true),{...address('Trabalho'),localizacaoFrequente:true}];
  const first=(await f.call('account')).customer.enderecos;assert.equal(f.writes.length,0);
  await f.call('deleteAddress',{addressId:first[0].id});
  const remaining=(await f.call('account')).customer.enderecos[0];assert.equal(remaining.id,first[1].id);assert.equal(remaining.isDefault,true);
  await f.call('updateAddress',{addressId:remaining.id,address:address('Novo',true)});
  assert.equal((await f.call('account')).customer.enderecos[0].id,remaining.id);
  assert.equal(f.rows.get('clientes/a').enderecos[0].nickname,'Novo');
  assert.equal(f.rows.get('clientes/a').enderecos[0].localizacaoFrequente,true);
});
test('CRUD completo e padrão conservam no máximo um padrão; exclusão promove remanescente',async()=>{
  const f=fixture();await f.call('addAddress',{address:{...address('Casa'),id:'forged',saved_cards:[]}});
  await f.call('addAddress',{address:address('Trabalho',true)});
  let saved=f.rows.get('clientes/a').enderecos;
  assert.notEqual(saved[0].id,'forged');assert.equal(saved[0].saved_cards,undefined);assert.equal(saved.filter(a=>a.isDefault).length,1);
  await f.call('setDefaultAddress',{addressId:saved[0].id});
  saved=f.rows.get('clientes/a').enderecos;assert.equal(saved[0].isDefault,true);assert.equal(saved[1].isDefault,false);
  await f.call('deleteAddress',{addressId:saved[0].id});assert.equal(f.rows.get('clientes/a').enderecos[0].isDefault,true);
  await f.call('deleteAddress',{addressId:saved[1].id});assert.deepEqual(f.rows.get('clientes/a').enderecos,[]);
});
test('IDOR não autoriza perfil/endereço de B e vínculo adulterado é recusado',async()=>{
  const f=fixture();const before=JSON.stringify(f.rows.get('clientes/b'));
  for(const method of ['updateAddress','deleteAddress','setDefaultAddress']) {
    await assert.rejects(f.call(method,{customerId:'b',addressId:'b-address',address:address()}));
  }
  assert.equal(JSON.stringify(f.rows.get('clientes/b')),before);
  f.rows.get(`customerAuthIdentities/${digest('email_password','uid-a')}`).customerId='b';
  for(const [method,data] of [['account',{}],['update',{nome:'Invader'}],['addAddress',{address:address()}],
    ['updateAddress',{addressId:'b-address',address:address()}],['deleteAddress',{addressId:'b-address'}],['setDefaultAddress',{addressId:'b-address'}]]) {
    await assert.rejects(f.call(method,data),e=>['permission-denied','not-found'].includes(e.code));
  }
  assert.equal(f.writes.length,0);
});
test('sem Auth, identidade inválida/desativada e endereço inválido são recusados',async()=>{
  const f=fixture();await assert.rejects(f.api.account({data:{customerId:'a'}}),e=>e.code==='unauthenticated');
  f.user.disabled=true;await assert.rejects(f.call('account'),e=>e.code==='unauthenticated');f.user.disabled=false;
  for(const bad of [{lat:null},{lat:''},{lat:false},{lat:[]},{lat:91},{lng:181},{nickname:''},{enderecoCompleto:''}]) {
    await assert.rejects(f.call('addAddress',{address:{...address(),...bad}}),e=>e.code==='invalid-argument');
  }
  assert.equal(f.writes.length,0);
});
test('Google mantém e-mail do provider e operações de endereço limitam quantidade e campos',async()=>{
  const f=fixture('google');await f.call('update',{nome:'Google',email:'forged@example.com',telefone:'62999991234'});
  const profile=(await f.call('account')).customer;assert.equal(profile.email,'a@example.com');assert.equal(profile.authProvider,'google');assert.equal(profile.emailVerified,false);
  f.rows.get('clientes/a').enderecos=Array.from({length:20},(_,i)=>address(String(i)));
  await assert.rejects(f.call('addAddress',{address:address()}),e=>e.code==='resource-exhausted');
  const repaired=addressRecords('a',[{...address('1',true),id:'duplicate'},{...address('2',true),id:'duplicate'}]);
  assert.equal(new Set(repaired.map(a=>a.id)).size,2);assert.equal(repaired.filter(a=>a.isDefault).length,1);
});
