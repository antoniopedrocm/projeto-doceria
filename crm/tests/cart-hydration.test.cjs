const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../public/cardapio.html'),'utf8');
const KEY='checkoutState_v1',matriz='ana-guimaraes-doceria-matriz',garavelo='ana-guimaraes-doceria-garavelo';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function storageFor(state){const values=new Map(state===undefined?[]:[[KEY,typeof state==='string'?state:JSON.stringify(state)]]),writes=[];
  return {getItem:k=>values.get(k)??null,setItem:(k,v)=>{writes.push({key:k,value:v});values.set(k,v);},removeItem:k=>{writes.push({key:k,removed:true});values.delete(k);},writes};}
const saved=(storeId=matriz,uid='a')=>({storeId,reorderOwnerUid:uid,cart:[{id:'p',produtoId:'p',nome:'Atual',preco:12,quantity:2}],
  pendingOrderDetails:{cupom:{codigo:'CART-CURRENT'},context:'current-cart'},valorFrete:4,distanciaFreteKm:2,addressStep:2});
async function page({storage=storageFor(saved()),storeId=matriz,uid='a'}={}){
  const {createPageCartBridge}=await import('../public/reorder-cart.mjs');
  const {createCartOwnerObserver}=await import('../public/canonical-session.mjs');
  const {createCheckoutIdentity,CHECKOUT_MODES}=await import('../public/checkout-identity.mjs');
  let publish,finishProfile,finishAuth;const ready=new Promise(resolve=>{finishProfile=resolve;}),authReady=new Promise(resolve=>{finishAuth=resolve;});
  const auth={currentUser:uid?{uid,isAnonymous:false}:null,authStateReady:()=>authReady},trace=[];
  const context=vm.createContext({sessionStorage:storage,STORE_ID:storeId,API_BASE_URL:'http://fixture',CHECKOUT_MODES,createCheckoutIdentity,STORE_AVAILABILITY:{CONFIG_UNAVAILABLE:'CONFIG_UNAVAILABLE'},
    document:{getElementById:()=>null,querySelectorAll:()=>[]},
    fetch:async(_url,options)=>({ok:true,json:async()=>({...JSON.parse(options.body),token:'a'.repeat(64),revision:1})}),
    window:{addressFlowState:{currentStep:1},addEventListener:()=>{},location:{assign:()=>{}}},app:{},getAuth:()=>auth,
    createPageCartBridge,createCartOwnerObserver,onAuthStateChanged:()=>{},
    installCustomerAccount:options=>{publish=options;return {ready};},
    initApp:()=>{trace.push('catalog-start');},enableOnlinePayment:()=>{},syncOnlinePaymentOption:()=>{},
    renderCart:()=>{},updateAllSummaries:()=>{},reconcileCartWithLatestProducts:()=>{},applyReorderCart:()=>{},showToast:()=>{},
    cartModal:{classList:{remove:()=>{}}},console:{warn:()=>{}},selectedAddressText:{textContent:''}});
  const declarations=source.slice(source.indexOf('        let allProducts ='),source.indexOf('        // --- SELEÇÃO DE ELEMENTOS DOM ---'));
  const persistence=source.slice(source.indexOf('        function persistCheckoutState()'),source.indexOf('        // --- FUNÇÕES PRINCIPAIS ---'));
  const boot=source.slice(source.indexOf('        const reorderCart='),source.indexOf("        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startCheckout"));
  assert.ok(declarations && persistence && boot);
  vm.runInContext(declarations+persistence+boot+'\nglobalThis.start=startCheckout;',context);
  return {storage,context,auth,trace,finishAuth,finishProfile,start:()=>context.start(),publish:()=>{trace.push('session-publish');publish.onSession({id:'customer-'+uid,accountLinked:true});},
    async mount(){const pending=context.start();this.publish();finishAuth();finishProfile();await pending;await tick();},
    cart:()=>JSON.parse(vm.runInContext('JSON.stringify(cart)',context)),
    pending:()=>JSON.parse(vm.runInContext('JSON.stringify(pendingOrderDetails)',context)),
    setCart:items=>{context.newItems=items;vm.runInContext('cart=newItems;',context);},persist:()=>context.persistCheckoutState()};
}
test('mount/restauração real não permite publicação inicial de sessão sobrescrever carrinho',async()=>{
  const f=await page();await f.mount();
  assert.equal(f.cart().length,1,'cart inicial vazio sobrescreveu o snapshot antes da restauração');
  assert.equal(f.cart()[0].quantity,2);assert.deepEqual(f.pending(),saved().pendingOrderDetails);
  assert.ok(!f.storage.writes.some(w=>w.value && JSON.parse(w.value).cart?.length===0));
});
test('cancelar recompra cross-store é NO-OP; retorno ao cardápio restaura o mesmo carrinho',async t=>{
  const {createCustomerReorderView}=await import('../public/customer-reorder-view.mjs');
  const {createStoredCartBridge}=await import('../public/reorder-cart.mjs');
  const storage=storageFor(saved()),before=storage.getItem(KEY);
  const dom=new JSDOM('<main><section hidden></section></main>');t.after(()=>dom.window.close());const panel=dom.window.document.querySelector('section');
  const view=createCustomerReorderView({panel,call:async()=>({order:{id:'paid-own',storeId:garavelo,storeName:'Garavelo',itens:[{productId:'g',quantity:1,preco:1}]},products:[{id:'g',nome:'Atual G',preco:9.9,estoque:9,available:true}]}),
    snapshot:()=>({uid:'a'}),isCurrent:()=>true,cart:createStoredCartBridge({storage,getUid:()=>'a',navigate:()=>{throw Error('CANCEL_MUST_NOT_NAVIGATE');}})});
  await view.start({id:'paid-own',storeId:garavelo});assert.match(panel.textContent,/trocar de loja/);
  [...panel.querySelectorAll('button')].find(b=>b.textContent==='Cancelar').click();assert.equal(storage.getItem(KEY),before);assert.equal(storage.writes.length,0);
  const f=await page({storage});await f.mount();assert.deepEqual(f.cart().map(({id,quantity,preco})=>({id,quantity,preco})),[{id:'p',quantity:2,preco:12}]);
  assert.deepEqual(f.pending(),saved().pendingOrderDetails);assert.equal(JSON.parse(storage.getItem(KEY)).storeId,matriz);
});
test('estado inicial não hidratado não grava vazio; vazio real hidratado continua persistível',async()=>{
  const f=await page();const before=f.storage.getItem(KEY);f.persist();assert.equal(f.storage.getItem(KEY),before);
  await f.mount();f.setCart([]);f.persist();assert.deepEqual(JSON.parse(f.storage.getItem(KEY)).cart,[]);
});
test('hydration espera Auth real, mas não depende da resposta do perfil Customer',async()=>{
  const f=await page();const pending=f.start();f.publish();
  assert.equal(vm.runInContext('cartHydrated',f.context),false);assert.equal(f.storage.writes.length,0);assert.deepEqual(f.trace,['session-publish']);
  f.finishAuth();await pending;assert.equal(f.cart()[0].id,'p');assert.equal(vm.runInContext('cartHydrated',f.context),true);assert.deepEqual(f.trace,['session-publish','catalog-start']);
  f.finishProfile();
});
test('reload e loja futura restauram itens/contexto sem whitelist ou gravação vazia',async()=>{
  for(const storeId of [matriz,'loja-futura-teste']){
    const storage=storageFor(saved(storeId)),before=storage.getItem(KEY);
    for(let n=0;n<2;n++){const f=await page({storage,storeId});await f.mount();assert.equal(f.cart()[0].quantity,2);assert.deepEqual(f.pending(),saved().pendingOrderDetails);}
    assert.equal(storage.getItem(KEY),before);assert.equal(storage.writes.length,0);
  }
});
test('substituir cross-store só grava após confirmar e hidrata catálogo/preço/estoque atuais',async t=>{
  const {createCustomerReorderView}=await import('../public/customer-reorder-view.mjs'),{createStoredCartBridge}=await import('../public/reorder-cart.mjs');
  const storage=storageFor(saved()),before=storage.getItem(KEY);storage.setItem('doceria-payment-pending','previous-current-payment');storage.writes.length=0;
  const dom=new JSDOM('<main><section hidden></section></main>');t.after(()=>dom.window.close());const panel=dom.window.document.querySelector('section');let destination;
  const view=createCustomerReorderView({panel,call:async()=>({order:{id:'own',storeId:garavelo,storeName:'Garavelo',itens:[{productId:'g',quantity:3,preco:1,cupom:'HISTORIC'}]},products:[{id:'g',nome:'Atual G',preco:9.9,estoque:2,available:true}]}),
    snapshot:()=>({uid:'a'}),isCurrent:()=>true,cart:createStoredCartBridge({storage,getUid:()=>'a',navigate:url=>{destination=url;}})});
  await view.start({id:'own',storeId:garavelo});assert.equal(storage.getItem(KEY),before);assert.equal(storage.writes.length,0);
  const button=[...panel.querySelectorAll('button')].find(b=>b.textContent==='Substituir e continuar');assert.ok(button);await button.onclick();
  assert.equal(destination,'/cardapio?store='+garavelo);const state=JSON.parse(storage.getItem(KEY));assert.equal(state.storeId,garavelo);assert.deepEqual(state.pendingOrderDetails,{});assert.equal(storage.getItem('doceria-payment-pending'),null);
  assert.deepEqual(state.cart,[{id:'g',produtoId:'g',nome:'Atual G',preco:9.9,quantity:2}]);assert.doesNotMatch(JSON.stringify(state),/HISTORIC|receipt|transaction/);
  const f=await page({storage,storeId:garavelo});await f.mount();assert.equal(f.cart()[0].preco,9.9);assert.equal(f.cart()[0].quantity,2);
});
test('mesma loja adiciona/mescla com preço e limite atuais e restaura após navegação',async t=>{
  const {createCustomerReorderView}=await import('../public/customer-reorder-view.mjs'),{createStoredCartBridge}=await import('../public/reorder-cart.mjs');
  const storage=storageFor(saved()),dom=new JSDOM('<main><section hidden></section></main>');t.after(()=>dom.window.close());const panel=dom.window.document.querySelector('section');
  const view=createCustomerReorderView({panel,call:async()=>({order:{id:'own',storeId:matriz,itens:[{productId:'p',quantity:2,preco:1}]},products:[{id:'p',nome:'Atual',preco:16,estoque:3,available:true}]}),
    snapshot:()=>({uid:'a'}),isCurrent:()=>true,cart:createStoredCartBridge({storage,getUid:()=>'a',navigate:()=>{}})});
  const click=async label=>{const button=[...panel.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(button);await button.onclick();};
  await view.start({id:'own',storeId:matriz});await click('Adicionar ao carrinho');assert.equal(storage.writes.length,0);await click('Confirmar adição');
  const f=await page({storage});await f.mount();assert.equal(f.cart().length,1);assert.equal(f.cart()[0].quantity,3);assert.equal(f.cart()[0].preco,16);
});
test('logout A e login B não restauram carrinho privado; visitante continua separado',async()=>{
  const {syncPrivateCart,createCanonicalLogout}=await import('../public/canonical-session.mjs');
  const storage=storageFor(saved());syncPrivateCart(storage,'a');const auth={currentUser:{uid:'a'}};
  await createCanonicalLogout({auth,storage,signOut:async a=>{a.currentUser=null;}})();assert.equal(storage.getItem(KEY),null);
  const b=await page({storage,uid:'b'});await b.mount();assert.deepEqual(b.cart(),[]);
  const foreign=await page({storage:storageFor(saved()),uid:'b'});await foreign.mount();assert.deepEqual(foreign.cart(),[]);assert.equal(foreign.storage.getItem(KEY),null);
  const visitorState=saved(matriz,null),visitor=await page({storage:storageFor(visitorState),uid:null});await visitor.mount();assert.equal(visitor.cart()[0].id,'p');
});
test('aba nova não altera storage da outra aba; cópia inicial de sessão respeita ownership',async()=>{
  const a=storageFor(saved()),before=a.getItem(KEY),b=storageFor();const fresh=await page({storage:b});await fresh.mount();assert.deepEqual(fresh.cart(),[]);assert.equal(a.getItem(KEY),before);
  const cloned=await page({storage:storageFor(before)});await cloned.mount();assert.equal(cloned.cart()[0].id,'p');assert.equal(a.getItem(KEY),before);
});
test('storage corrompido/incompleto não quebra mount nem remove outras chaves ou itens válidos',async()=>{
  for(const state of ['{invalid',null,[],{cart:[{id:'p',quantity:1}]},{...saved(),schemaVersion:0},{...saved(),cart:[null,{},...saved().cart,{id:'bad',preco:'NaN',quantity:1},{id:'incomplete',quantity:1}]}]){
    const storage=storageFor(state);storage.setItem('unrelated-cart','preserve');const f=await page({storage});await assert.doesNotReject(()=>f.mount());assert.equal(storage.getItem('unrelated-cart'),'preserve');
    if(state?.storeId)assert.equal(f.cart().length,1);else assert.deepEqual(f.cart(),[]);
  }
});
test('abrir outro cardápio sem confirmar/editar preserva snapshot da loja original',async()=>{
  const storage=storageFor(saved()),before=storage.getItem(KEY),f=await page({storage,storeId:'loja-futura-teste'});await f.mount();f.publish();f.persist();
  assert.deepEqual(f.cart(),[]);assert.equal(storage.getItem(KEY),before);assert.equal(storage.writes.length,0);
});
test('troca de UID durante espera de hydration nunca restaura o carrinho privado anterior',async()=>{
  const f=await page();const pending=f.start();f.publish();f.auth.currentUser={uid:'b',isAnonymous:false};f.finishAuth();f.finishProfile();await pending;
  assert.deepEqual(f.cart(),[]);assert.equal(f.storage.getItem(KEY),null);assert.equal(vm.runInContext('reorderOwnerUid',f.context),'b');
});

test('seleção celular e visitante no script real preservam carrinho; sessão passiva não eleva checkout',async()=>{
  const f=await page();await f.mount();
  const before=f.cart();
  await vm.runInContext("selectWeakCheckout(CHECKOUT_MODES.PHONE)",f.context);
  f.publish();assert.equal(vm.runInContext('currentClient',f.context),null);
  assert.equal(vm.runInContext('checkoutIdentity.isStrong()',f.context),false);
  assert.deepEqual(f.cart(),before);assert.equal(JSON.parse(f.storage.getItem(KEY)).storeId,matriz);
  await vm.runInContext("selectWeakCheckout(CHECKOUT_MODES.GUEST)",f.context);
  f.publish();assert.equal(vm.runInContext('currentClient',f.context),null);
  assert.deepEqual(f.cart(),before);
});
