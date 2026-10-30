import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CUSTOMER_RETURN_PATH_KEY,safeCustomerReturnPath,customerAreaEntryPath,customerMenuDestination} from '../src/storefront/storeRoutes.mjs';
import {createCanonicalLogout} from '../public/canonical-session.mjs';
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
const origin=store=>'/cardapio?store=ana-guimaraes-doceria-'+store;
const incoming=path=>'?returnTo='+encodeURIComponent(path);
for(const store of ['matriz','garavelo'])test(store+' → entrada → refresh/login → logout canônico → mesma origem, sem dados privados',async()=>{
  const path=origin(store),tab=storage(),entry=customerAreaEntryPath({pathname:'/cardapio',search:path.slice(path.indexOf('?'))});
  assert.equal(entry,'/area-cliente'+incoming(path));
  assert.equal(customerMenuDestination(tab,entry.slice(entry.indexOf('?'))),path);
  tab.setItem('checkoutState_v1',JSON.stringify({storeId:'outra-loja',reorderOwnerUid:'customer-a',cart:[{id:'private-item'}]}));
  tab.setItem('doceria-auth-cart-owner','customer-a');tab.setItem('doceria-payment-pending','private');
  const auth={currentUser:{uid:'customer-a'}},legacyAuth={currentUser:null},signedOut=[];
  await createCanonicalLogout({auth,legacyAuth,storage:tab,signOut:async app=>{signedOut.push(app);app.currentUser=null;},beforeSignOut:async()=>{throw Error('fixture network failure');}})();
  assert.equal(auth.currentUser,null);assert.equal(signedOut.length,2);
  assert.equal(tab.getItem('checkoutState_v1'),null);assert.equal(tab.getItem('doceria-payment-pending'),null);
  assert.equal(tab.getItem(CUSTOMER_RETURN_PATH_KEY),path);
  assert.equal(customerMenuDestination(tab),path);assert.equal(customerMenuDestination(tab),path);
});
test('abas Matriz e Garavelo são independentes e origem vence checkout antigo de outra loja',()=>{
  const a=storage(),b=storage();customerMenuDestination(a,incoming(origin('matriz')));customerMenuDestination(b,incoming(origin('garavelo')));
  a.setItem('checkoutState_v1',JSON.stringify({storeId:'garavelo'}));
  assert.equal(customerMenuDestination(a),origin('matriz'));assert.equal(customerMenuDestination(b),origin('garavelo'));
});
test('aliases auditados e canais existentes são preservados sem inventar associação',()=>{
  for(const name of ['matriz','garavelo','festa'])for(const ext of ['', '.html'])assert.equal(safeCustomerReturnPath('/cardapio-'+name+ext),'/cardapio-'+name+ext);
  const path='/cardapio?store=loja-futura&channel=festas';assert.equal(safeCustomerReturnPath(path),path);
  assert.equal(customerMenuDestination(storage(),incoming(path)),path);
});
test('returnTo externo, ambíguo, privado ou malformado nunca é aceito',()=>{
  for(const path of ['https://evil.test','//evil.test','javascript:alert(1)','data:text/html,x','/\\evil.test','/cardapio/../admin','/admin/customer-preview/id','/minha-conta','/cardapio?store=../private','/cardapio?store=foo%0A','/cardapio?store=a&store=b','/cardapio?channel=festas','/cardapio?store=a&next=https://evil.test','/cardapio?store=a&token=private','/cardapio?store=a#outside','/cardapio?store=a?store=b','/%2f/evil.test','/cardapio?store=','/cardapio-futuro']) {
    assert.equal(safeCustomerReturnPath(path),null,path);const tab=storage();assert.equal(customerMenuDestination(tab,incoming(path)),'/',path);assert.equal(tab.getItem(CUSTOMER_RETURN_PATH_KEY),null,path);
  }
  assert.equal(customerMenuDestination(storage(),incoming(origin('matriz'))+'&returnTo='+encodeURIComponent(origin('garavelo'))),'/');
});
test('entrada transporta só pathname/search público; nunca credenciais, hash ou URL externa',()=>{
  const entry=customerAreaEntryPath({pathname:'/cardapio',search:'?store=garavelo&channel=festas&id_token=private&email=private&returnTo=https://evil.test',hash:'#private'});
  assert.equal(entry,'/area-cliente'+incoming('/cardapio?store=garavelo&channel=festas'));assert.doesNotMatch(entry,/private|token|email|evil/);
});
test('acesso direto usa home pública; contexto público legado válido continua útil; storage corrompido falha seguro',()=>{
  assert.equal(customerMenuDestination(storage()),'/');assert.equal(customerAreaEntryPath({pathname:'/cardapio',search:''}),'/area-cliente');
  const tab=storage();tab.setItem(CUSTOMER_RETURN_PATH_KEY,'https://evil.test');tab.setItem('checkoutState_v1',JSON.stringify({storeId:'loja-futura'}));
  assert.equal(customerMenuDestination(tab),'/cardapio?store=loja-futura');assert.equal(tab.getItem(CUSTOMER_RETURN_PATH_KEY),null);
  tab.setItem('checkoutState_v1','corrupt');assert.equal(customerMenuDestination(tab),'/');
  const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  assert.equal(customerMenuDestination(blocked),'/');assert.equal(customerMenuDestination(blocked,incoming(origin('garavelo'))),origin('garavelo'));
});
