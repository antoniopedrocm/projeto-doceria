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
