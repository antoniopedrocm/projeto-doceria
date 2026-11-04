process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.GCLOUD_PROJECT='demo-doceria-checkout';process.env.FUNCTIONS_EMULATOR='true';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),admin=require('firebase-admin');
const handlers=require('./index'),db=admin.firestore(),server=http.createServer(handlers.api);
let base,token,customerId;
const send=async(method,path,body)=>{const r=await fetch(base+path+'?lojaId=registry-store',{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
before(async()=>{
  await db.doc('integrations/customerRegistry').set({state:'READY'});await db.doc('lojas/registry-store').set({nome:'Fixture'});
  const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'registry-'+Date.now()+'@example.test',password:'Emulator-only-credential-123!',returnSecureToken:true})});const user=await r.json();token=user.idToken;assert.ok(token);
  await db.doc('users/'+user.localId).set({role:'dono',ativo:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await admin.app().delete();});
test('CRM concorrente usa mesma chave, não aceita metadados de identidade nem troca telefone simples',async()=>{
  const results=await Promise.all(Array.from({length:6},()=>send('POST','/clientes',{nome:'Fixture',telefone:'62985550041',enderecos:[],authOwnerUids:['forged'],identityRegistryVersion:1,legacyOrderPaths:['pedidos/forged'],id:'forged'})));
  assert.ok(results.every(r=>[200,201].includes(r.status)));assert.equal(new Set(results.map(r=>r.data.id)).size,1);customerId=results[0].data.id;assert.notEqual(customerId,'forged');
  const customer=(await db.doc('clientes/'+customerId).get()).data();assert.equal(customer.authOwnerUid,undefined);assert.equal(customer.authOwnerUids,undefined);assert.deepEqual(customer.legacyCustomerIds,[]);assert.equal(customer.legacyOrderPaths,undefined);
  assert.equal((await send('PUT','/clientes/'+customerId,{telefone:'62985550042'})).status,409);
  assert.equal((await send('PUT','/clientes/'+customerId,{telefone:'+55 (62) 98555-0041',nome:'Atualizado'})).status,200);
  const key=require('./customer-phone').normalizeCustomerPhone('62985550041').key;assert.equal((await db.doc('integrations/customerRegistry/phones/'+key).get()).data().customerId,customerId);
});
test('excluir cadastro com história é bloqueado; cadastro vazio remove índice na mesma transação',async()=>{
  await db.doc('lojas/registry-store/pedidos/fixture').set({clienteId:customerId,total:1});assert.equal((await send('DELETE','/clientes/'+customerId)).status,409);assert.equal((await db.doc('clientes/'+customerId).get()).exists,true);
  const created=await send('POST','/clientes',{nome:'Vazio',telefone:'62985550043',enderecos:[]});assert.equal(created.status,201);assert.equal((await send('DELETE','/clientes/'+created.data.id)).status,200);
  const key=require('./customer-phone').normalizeCustomerPhone('62985550043').key;assert.equal((await db.doc('integrations/customerRegistry/phones/'+key).get()).exists,false);
});

async function fixtureIdentity(role='cliente',stores=[]) {
  const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'linked-'+Date.now()+'-'+Math.random().toString(16).slice(2)+'@example.test',password:'Emulator-only-credential-123!',returnSecureToken:true})});
  const user=await response.json();assert.ok(user.idToken);
  await db.doc('users/'+user.localId).set({role,ativo:true,lojaIds:stores});
  return {uid:user.localId,token:user.idToken};
}
async function requestAs(credential,method,id,body,store='registry-store') {
  const response=await fetch(base+'/clientes/'+id+'?lojaId='+store,{method,headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},body:JSON.stringify(body)});
  return {status:response.status,data:await response.json()};
}
let claimedId,linkedUser,protectedSnapshot;
test('reprodução real do 403: Dono edita cliente com login, CPF e CEP sem mudar ownership, telefone ou histórico',async()=>{
  const created=await send('POST','/clientes',{nome:'Cliente vinculado',telefone:'62985550045',enderecos:[]});assert.equal(created.status,201);claimedId=created.data.id;
  linkedUser=await fixtureIdentity();
  const registry=require('./customer-registry').createCustomerRegistry({db});
  await registry.identityRef({provider:'email_password',sub:linkedUser.uid}).set({customerId:claimedId,uid:linkedUser.uid});
  await registry.uidRef(linkedUser.uid).set({customerId:claimedId,uid:linkedUser.uid});
  protectedSnapshot={authOwnerUid:linkedUser.uid,authOwnerUids:[linkedUser.uid],identityRegistryVersion:1,phone_verified_at:'verified',phoneOwnership:'VERIFIED',phone_number:'+5562985550045',enderecos:[{id:'verified-address',isDefault:true,enderecoCompleto:'Endereco verificado'}],numeroDeCompras:5,valorEmCompras:50,lojasVisitadas:['registry-store'],legacyCustomerIds:['historical'],cuponsUsados:['used']};
  await db.doc('clientes/'+claimedId).set({...protectedSnapshot,address:{street:'Antiga',number:'123'}},{merge:true});
  const beforeAuth=await admin.auth().getUser(linkedUser.uid);
  const result=await send('PUT','/clientes/'+claimedId,{nome:'Nome revisado no CRM',cpf:'52998224725',documento:'52998224725',cep:'74477600',bairro:'Bairro revisado',cidade:'Goiania',uf:'GO',email:'contato@example.test',aniversario:'1994-03-21',telefone:'(62) 98555-0045',address:{street:'Nova',zip:'74477600'},authOwnerUid:'forged',authOwnerUids:['forged'],phone_verified_at:null,numeroDeCompras:999,valorEmCompras:999,enderecos:[],provider:'forged',saved_cards:['forged'],crmStaffUid:'forged',lojaId:'forged-store'});
  assert.equal(result.status,200,JSON.stringify(result.data));
  const saved=(await db.doc('clientes/'+claimedId).get()).data();assert.equal(saved.nome,'Nome revisado no CRM');assert.equal(saved.cpf,'52998224725');assert.equal(saved.cep,'74477600');assert.equal(saved.address.number,'123');assert.equal(saved.telefone,'62985550045');
  for(const [key,value]of Object.entries(protectedSnapshot))assert.deepEqual(saved[key],value,key);
  for(const key of ['provider','saved_cards','crmStaffUid'])assert.equal(saved[key],undefined,key);
  assert.equal((await admin.auth().getUser(linkedUser.uid)).email,beforeAuth.email);
  assert.equal((await registry.uidRef(linkedUser.uid).get()).data().customerId,claimedId);
  const events=(await db.collection('auditLogs').where('action','==','CRM_CLIENT_PROFILE_UPDATED').get()).docs.map(d=>d.data());assert.ok(events.some(e=>e.customerId===claimedId&&e.fields.includes('cpf')&&e.fields.includes('cep')&&e.adminUid&&e.storeId==='registry-store'));
});
test('cliente vinculado: gerente/atendente com acesso à loja editam; outra loja/cliente fora do escopo são bloqueados',async()=>{
  for(const role of ['gerente','atendente']) {
    const actor=await fixtureIdentity(role,['registry-store']);
    assert.equal((await requestAs(actor.token,'PUT',claimedId,{nome:'Atualizado por '+role})).status,200);
    assert.equal((await requestAs(actor.token,'PUT',claimedId,{nome:'Não gravar'},'other-store')).status,403);
    await db.doc('clientes/'+claimedId).update({lojasVisitadas:['other-store']});
    assert.equal((await requestAs(actor.token,'PUT',claimedId,{nome:'Não gravar'})).status,403);
    await db.doc('clientes/'+claimedId).update({lojasVisitadas:['registry-store']});
  }
});
test('login do cliente não concede poder de CRM; sessão ausente, perfil inativo e módulo negado não alteram cadastro',async()=>{
  const before=(await db.doc('clientes/'+claimedId).get()).data().nome;
  assert.equal((await requestAs(null,'PUT',claimedId,{nome:'Não gravar'})).status,401);
  assert.equal((await requestAs(linkedUser.token,'PUT',claimedId,{nome:'Não gravar',crmStaffUid:'forged',staff:true,role:'dono'})).status,403);
  const inactive=await fixtureIdentity('gerente',['registry-store']);await db.doc('users/'+inactive.uid).update({ativo:false});
  assert.equal((await requestAs(inactive.token,'PUT',claimedId,{nome:'Não gravar'})).status,403);
  const disabled=await fixtureIdentity('gerente',['registry-store']);await db.doc('customProfiles/'+disabled.uid).set({permissions:{clientes:false}});
  assert.equal((await requestAs(disabled.token,'PUT',claimedId,{nome:'Não gravar'})).status,403);
  assert.equal((await db.doc('clientes/'+claimedId).get()).data().nome,before);
});
test('trocar ou limpar telefone vinculado continua bloqueado e sem perda da comprovação',async()=>{
  assert.equal((await send('PUT','/clientes/'+claimedId,{telefone:'62985550046'})).status,409);
  assert.equal((await send('PUT','/clientes/'+claimedId,{telefone:''})).status,400);
  const saved=(await db.doc('clientes/'+claimedId).get()).data();assert.equal(saved.telefone,'62985550045');assert.equal(saved.phone_verified_at,'verified');
});
