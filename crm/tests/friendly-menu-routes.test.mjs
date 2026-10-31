/* global globalThis */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {PUBLIC_MENU_ROUTES,storeMenuUrl,resolvePublicMenuRoute,customerMenuDestination,CUSTOMER_RETURN_PATH_KEY} from '../src/storefront/storeRoutes.mjs';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
globalThis.location={hostname:'127.0.0.1'};
const {bootstrapPublicStore}=await import('../public/store-public-config.mjs');
const fixture=route=>({storeId:route.storeId,active:true,catalog:{enabled:true},...(route.channelId?{channel:{id:route.channelId}}:{})});
const store=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
for(const [slug,identity] of Object.entries(PUBLIC_MENU_ROUTES)) {
 test(slug+': abertura direta/refresh resolve a mesma identidade pública e canonical, sem query store',async()=>{
  const dom=new JSDOM('<div id="loading-message"></div>',{url:'https://dev.test/'+slug});
  const calls=[],fetchImpl=async url=>{calls.push(new URL(url));return {ok:true,json:async()=>fixture(identity)};};
  for(let i=0;i<2;i++)assert.deepEqual(await bootstrapPublicStore({location:dom.window.location,history:dom.window.history,document:dom.window.document,fetchImpl}),fixture(identity));
  assert.equal(dom.window.location.pathname,'/'+slug);assert.equal(dom.window.location.search,'');assert.equal(dom.window.history.length,1);
  assert.equal(calls.length,2);for(const call of calls){assert.equal(call.searchParams.get('storeId'),identity.storeId);assert.equal(call.searchParams.get('channelId'),identity.channelId);assert.equal(call.searchParams.has('alias'),false);}
  assert.equal(dom.window.document.querySelectorAll('link[rel="canonical"]').length,1);assert.equal(dom.window.document.querySelector('[rel="canonical"]').href,'https://dev.test/'+slug);
  dom.window.close();
 });
 test(slug+': link antigo usa replace e não modifica carrinho/contexto',async()=>{
  const old='/cardapio?store='+identity.storeId+(identity.channelId?'&channel='+identity.channelId:'');
  const dom=new JSDOM('<div id="loading-message"></div>',{url:'https://dev.test'+old});
  const payload=JSON.stringify({storeId:identity.storeId,cart:[{id:'fixture',preco:1,quantity:1}],pendingOrderDetails:{}});dom.window.sessionStorage.setItem('checkoutState_v1',payload);
  dom.window.history.replaceState({keep:'existing-history-state'},'',old);
  await bootstrapPublicStore({location:dom.window.location,history:dom.window.history,document:dom.window.document,fetchImpl:async()=>({ok:true,json:async()=>fixture(identity)})});
  assert.equal(dom.window.location.pathname+dom.window.location.search,'/'+slug);assert.equal(dom.window.history.length,1);assert.deepEqual(dom.window.history.state,{keep:'existing-history-state'});
  assert.equal(dom.window.sessionStorage.getItem('checkoutState_v1'),payload);dom.window.close();
 });
}
test('slugs malformados, inexistentes e conflito slug/store falham antes de qualquer request',async()=>{
  for(const url of ['//evil.test/cardapio-matriz','/cardapio-matriz/../private','/cardapio-matriz?store=ana-guimaraes-doceria-garavelo','/cardapio?store=a&store=b','/cardapio?store=foo%0A','/cardapio-festa?channel=outro']){
  const [pathname,search='']=url.split('?'),dom=new JSDOM('<div id="loading-message"></div>');let count=0;
  const result=await bootstrapPublicStore({location:{pathname,search:'?'+search},document:dom.window.document,fetchImpl:async()=>{count++;throw Error('Must not fetch');}});
  assert.equal(result,null,url);assert.equal(count,0,url);assert.equal(dom.window.document.getElementById('loading-message').textContent,'Loja não encontrada.');dom.window.close();
 }
});
test('alias novo é resolvido no backend; alias inexistente não cai em Matriz',async()=>{
 for(const exists of [true,false]){const dom=new JSDOM('<div id="loading-message"></div>',{url:'https://dev.test/cardapio-loja-nova'});let count=0;
 const config={storeId:'future-store',active:true,catalog:{enabled:true},publicSlug:'cardapio-loja-renomeada'};
 const result=await bootstrapPublicStore({location:dom.window.location,history:dom.window.history,document:dom.window.document,fetchImpl:async url=>{count++;assert.equal(new URL(url).searchParams.get('alias'),'cardapio-loja-nova');return {ok:exists,json:async()=>exists?config:{code:'STORE_NOT_FOUND'}};}});
 assert.equal(count,1);if(exists){assert.equal(result.storeId,'future-store');assert.equal(dom.window.location.pathname,'/cardapio-loja-renomeada');assert.equal(customerMenuDestination(store(),'?returnTo='+encodeURIComponent('/cardapio-loja-renomeada')),'/cardapio-loja-renomeada');}else{assert.equal(result,null);assert.equal(dom.window.document.getElementById('loading-message').textContent,'Loja não encontrada.');}dom.window.close();}
});
test('diretório genérico continua disponível, com links amigáveis para lojas/canais aprovados',async()=>{
 const dom=new JSDOM('<div id="loading-message"></div>');
 const stores=Object.entries(PUBLIC_MENU_ROUTES).map(([slug,r])=>({...r,name:slug}));
 assert.equal(await bootstrapPublicStore({location:{pathname:'/cardapio',search:''},document:dom.window.document,fetchImpl:async()=>({ok:true,json:async()=>({stores,nextCursor:null})})}),null);
 assert.deepEqual([...dom.window.document.querySelectorAll('a')].map(a=>a.getAttribute('href')),Object.keys(PUBLIC_MENU_ROUTES).map(slug=>'/'+slug));dom.window.close();
});
test('mapping é explícito; loja futura/canal sem slug usa compatibilidade sem inventar ID',()=>{
 assert.equal(storeMenuUrl('future-store'),'/cardapio?store=future-store');
 assert.equal(storeMenuUrl('ana-guimaraes-doceria-garavelo','channel-new'),'/cardapio-garavelo?channel=channel-new');
 assert.equal(resolvePublicMenuRoute({pathname:'/cardapio-apfood'}).storeId,'apfood');
 for(const id of ['../private','foo\n','',null])assert.equal(storeMenuUrl(id),null);
});
test('origem antiga armazenada migra para amigável e continua independente por aba após logout',()=>{
 const a=store(),b=store();a.setItem(CUSTOMER_RETURN_PATH_KEY,'/cardapio?store=ana-guimaraes-doceria-matriz');b.setItem(CUSTOMER_RETURN_PATH_KEY,'/cardapio?store=ana-guimaraes-doceria-garavelo');
 assert.equal(customerMenuDestination(a),'/cardapio-matriz');assert.equal(customerMenuDestination(b),'/cardapio-garavelo');
 assert.equal(a.getItem(CUSTOMER_RETURN_PATH_KEY),'/cardapio-matriz');assert.equal(b.getItem(CUSTOMER_RETURN_PATH_KEY),'/cardapio-garavelo');
 const readOnly={getItem:()=>'/cardapio?store=ana-guimaraes-doceria-garavelo',setItem:()=>{throw Error('storage read-only');}};
 assert.equal(customerMenuDestination(readOnly),'/cardapio-garavelo');
});
test('identidade divergente ou loja inativa na projeção pública não libera catálogo nem canonical',async()=>{
 for(const config of [{...fixture(PUBLIC_MENU_ROUTES['cardapio-matriz']),storeId:'other'},{...fixture(PUBLIC_MENU_ROUTES['cardapio-matriz']),active:false}]){
  const dom=new JSDOM('<div id="loading-message"></div>',{url:'https://dev.test/cardapio-matriz'});
  assert.equal(await bootstrapPublicStore({location:dom.window.location,document:dom.window.document,fetchImpl:async()=>({ok:true,json:async()=>config})}),null);
  assert.equal(dom.window.document.querySelector('[rel="canonical"]'),null);dom.window.close();
 }
});
test('Hosting encaminha slugs novos/inválidos para o template único e mantém fallback SPA',()=>{
 const config=JSON.parse(fs.readFileSync(new URL('../../firebase.json',import.meta.url))).hosting;
 assert.equal(config.cleanUrls,true);assert.deepEqual(config.rewrites,[{source:'/cardapio-*',destination:'/cardapio.html'},{source:'**',destination:'/index.html'}]);
 assert.equal(fs.existsSync(new URL('../public/cardapio-apfood.html',import.meta.url)),false);
});
