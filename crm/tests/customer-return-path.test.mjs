import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CUSTOMER_RETURN_PATH_KEY,PUBLIC_HOME_PATH,isPublicHomeLocation,safeCustomerReturnPath,customerAreaEntryPath,customerMenuDestination} from '../src/storefront/storeRoutes.mjs';
import {createCanonicalLogout} from '../public/canonical-session.mjs';
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
const origin=store=>'/cardapio-'+store;
const incoming=path=>'?returnTo='+encodeURIComponent(path);
test('origem recuperada do checkout permanece disponível depois de logout remover o contexto privado',()=>{
  const tab=storage();tab.setItem('checkoutState_v1',JSON.stringify({storeId:'ana-guimaraes-doceria-garavelo'}));
  assert.equal(customerMenuDestination(tab),'/cardapio-garavelo');
  tab.removeItem('checkoutState_v1');
  assert.equal(customerMenuDestination(tab),'/cardapio-garavelo');
});
for(const store of ['matriz','garavelo'])test(store+' → entrada → refresh/login → logout canônico → mesma origem, sem dados privados',async()=>{
  const path=origin(store),tab=storage(),entry=customerAreaEntryPath({pathname:path,search:''});
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
  for(const name of ['matriz','garavelo','festa','apfood'])for(const ext of ['', '.html'])assert.equal(safeCustomerReturnPath('/cardapio-'+name+ext),'/cardapio-'+name);
  const path='/cardapio?store=loja-futura&channel=festas';assert.equal(safeCustomerReturnPath(path),path);
  assert.equal(customerMenuDestination(storage(),incoming(path)),path);
});
test('returnTo externo, ambíguo, privado ou malformado nunca é aceito',()=>{
  for(const path of ['https://evil.test','//evil.test','javascript:alert(1)','data:text/html,x','/\\evil.test','/cardapio/../admin','/admin/customer-preview/id','/minha-conta','/cardapio?store=../private','/cardapio?store=foo%0A','/cardapio?store=a&store=b','/cardapio?channel=festas','/cardapio?store=a&next=https://evil.test','/cardapio?store=a&token=private','/cardapio?store=a#outside','/cardapio?store=a?store=b','/%2f/evil.test','/cardapio?store=']) {
    assert.equal(safeCustomerReturnPath(path),null,path);const tab=storage();assert.equal(customerMenuDestination(tab,incoming(path)),PUBLIC_HOME_PATH,path);assert.equal(tab.getItem(CUSTOMER_RETURN_PATH_KEY),null,path);
  }
  assert.equal(customerMenuDestination(storage(),incoming(origin('matriz'))+'&returnTo='+encodeURIComponent(origin('garavelo'))),PUBLIC_HOME_PATH);
});
test('slug público futuro é navegação interna; resolução canônica continua no backend, sem fallback Matriz',()=>{
  assert.equal(safeCustomerReturnPath('/cardapio-futuro'),'/cardapio-futuro');
  assert.equal(customerMenuDestination(storage(),incoming('/cardapio-futuro')),'/cardapio-futuro');
});
test('entrada transporta só pathname/search público; nunca credenciais, hash ou URL externa',()=>{
  const entry=customerAreaEntryPath({pathname:'/cardapio',search:'?store=garavelo&channel=festas&id_token=private&email=private&returnTo=https://evil.test',hash:'#private'});
  assert.equal(entry,'/area-cliente'+incoming('/cardapio?store=garavelo&channel=festas'));assert.doesNotMatch(entry,/private|token|email|evil/);
});
test('acesso direto usa home pública; contexto público legado válido continua útil; storage corrompido falha seguro',()=>{
  assert.equal(customerMenuDestination(storage()),PUBLIC_HOME_PATH);assert.equal(customerAreaEntryPath({pathname:'/cardapio',search:''}),'/area-cliente');
  const tab=storage();tab.setItem(CUSTOMER_RETURN_PATH_KEY,'https://evil.test');tab.setItem('checkoutState_v1',JSON.stringify({storeId:'loja-futura'}));
  assert.equal(customerMenuDestination(tab),'/cardapio?store=loja-futura');assert.equal(tab.getItem(CUSTOMER_RETURN_PATH_KEY),'/cardapio?store=loja-futura');
  tab.removeItem(CUSTOMER_RETURN_PATH_KEY);tab.setItem('checkoutState_v1','corrupt');assert.equal(customerMenuDestination(tab),PUBLIC_HOME_PATH);
  const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  assert.equal(customerMenuDestination(blocked),PUBLIC_HOME_PATH);assert.equal(customerMenuDestination(blocked,incoming(origin('garavelo'))),origin('garavelo'));
});
test('fallback explícito seleciona a home pública sem aceitar contexto privado como retorno',()=>{
  const destination=customerMenuDestination(storage()),url=new URL(destination,'https://example.test');
  assert.equal(isPublicHomeLocation(url),true);
  for(const path of ['/','/?public=0','/?public=1&public=0','/area-cliente?public=1','/admin?public=1'])assert.equal(isPublicHomeLocation(new URL(path,url)),false,path);
  assert.equal(safeCustomerReturnPath(PUBLIC_HOME_PATH),null);
});
test('referrer público de mesma origem recupera a loja quando returnTo/storage não chegaram',()=>{
 const tab=storage(),origin='https://dev.test';
 assert.equal(customerMenuDestination(tab,'',{origin,referrer:origin+'/cardapio-garavelo'}),'/cardapio-garavelo');
 assert.equal(tab.getItem(CUSTOMER_RETURN_PATH_KEY),'/cardapio-garavelo');
 assert.equal(customerMenuDestination(tab,incoming('/cardapio-matriz'),{origin,referrer:origin+'/cardapio-garavelo'}),'/cardapio-matriz');
 for(const referrer of ['https://evil.test/cardapio-matriz',origin+'/minha-conta',origin+'/admin/customer-preview/id',origin+'/cardapio-matriz?token=private','javascript:alert(1)'])assert.equal(customerMenuDestination(storage(),'',{origin,referrer}),PUBLIC_HOME_PATH,referrer);
});
