const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred() {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function fixture(menu,{transferred=false,source}={}) {
  source=source || fs.readFileSync(path.join(__dirname,`../crm/public/cardapio-${menu}.html`),'utf8');
  const flow=source.slice(source.indexOf('        async function startAppFlow('),source.indexOf('        function mapCriticalCheckoutError'));
  const start=source.match(/ {8}const startCheckout = (?:async )?\(\) => \{[\s\S]*?\n {8}\};/)[0];
  const restore=source.slice(source.indexOf('        function restoreCheckoutState()'),source.indexOf('        function clearCheckoutState()'));
  const storeId=menu==='garavelo'?'ana-guimaraes-doceria-garavelo':'ana-guimaraes-doceria-matriz';
  const product={id:'brownie',produtoId:'brownie',nome:'Brownie',preco:12,quantity:1};
  const state={storeId,cart:[product],...(transferred?{reorderOwnerUid:'customer-a'}:{})};
  const storage=new Map([['checkoutState_v1',JSON.stringify(state)]]),events=[],account=deferred(),products=deferred();
  const auth={currentUser:null};
  const context=vm.createContext({console:{log:()=>{},warn:()=>{},error:()=>{}},window:{addressFlowState:{}},
    STORE_ID:storeId,CHECKOUT_STORAGE_KEY:'checkoutState_v1',cart:[],allProducts:[],pendingOrderDetails:{},reorderOwnerUid:null,addressStep:1,
    sessionStorage:{getItem:key=>storage.get(key) ?? null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    customerAccount:{ready:account.promise},currentClient:null,app:{},getAuth:()=>auth,
    onAuthStateChanged:()=>{},signInAnonymously:()=>new Promise(()=>{}),
    fetchStoreConfig:async()=>events.push(`config:${storeId}`),listenToStoreConfig:async()=>{},
    listenToProducts:async()=>{events.push(`products:${storeId}`);await products.promise;context.allProducts=[product];events.push('catalog-visible');},
    setupEventListeners:()=>events.push('listeners'),renderCart:()=>{},updateAllSummaries:()=>{},showToast:()=>{},
    selectedAddressText:{textContent:''},createInitialGuestAddressFlowState:()=>({currentStep:1,formData:{}}),
    clearCheckoutState:()=>storage.delete('checkoutState_v1'),
    reconcileCartWithLatestProducts:()=>events.push('reconcile'),enableOnlinePayment:id=>events.push(`payment:${id}`)});
  vm.runInContext(restore+flow+start+';globalThis.start=startCheckout;',context);
  return {context,storage,events,account,products,auth,storeId,source};
}
for(const menu of ['matriz','garavelo','festa']) {
  test(`${menu}: conta pendente e Auth sem callback não impedem configuração/produtos/carrinho público`,async()=>{
    const f=fixture(menu);f.context.start();await tick();
    assert.ok(f.events.includes(`products:${f.storeId}`));
    f.products.resolve();await tick();assert.ok(f.events.includes('catalog-visible'));
    assert.equal(f.context.cart[0].id,'brownie');assert.equal(f.context.reorderOwnerUid,null);
    assert.equal(f.context.STORE_ID,f.storeId);
  });
  test(`${menu}: conta rápida, visitante e celular legado mantêm catálogo e carrinho`,async()=>{
    for(const user of [null,{uid:'legacy',providerData:[{providerId:'phone'}]},{uid:'customer-a',providerData:[{providerId:'password'}]}]) {
      const f=fixture(menu);f.auth.currentUser=user;f.account.resolve();f.context.start();await tick();
      assert.ok(f.events.includes(`products:${f.storeId}`));f.products.resolve();await tick();
      assert.equal(f.context.cart.length,1);assert.ok(f.events.includes('catalog-visible'));
    }
  });
  test(`${menu}: transferência aguarda sessão, mas catálogo termina primeiro`,async()=>{
    const f=fixture(menu,{transferred:true});f.context.start();f.products.resolve();await tick();
    assert.ok(f.events.includes('catalog-visible'));assert.equal(f.context.cart.length,0);
    f.auth.currentUser={uid:'customer-a'};f.account.resolve();await tick();
    assert.equal(f.context.cart[0].id,'brownie');assert.equal(f.context.reorderOwnerUid,'customer-a');
    assert.ok(f.events.includes('reconcile'));
  });
  test(`${menu}: sessão termina antes do catálogo e transferência mantém ownership`,async()=>{
    const f=fixture(menu,{transferred:true});f.auth.currentUser={uid:'customer-a'};
    f.account.resolve();f.context.start();await tick();assert.equal(f.context.cart.length,1);
    f.products.resolve();await tick();assert.ok(f.events.includes('catalog-visible'));assert.equal(f.context.STORE_ID,f.storeId);
    for(const uid of [null,'customer-b']) {
      const other=fixture(menu,{transferred:true});other.auth.currentUser=uid?{uid}:null;
      other.context.start();other.products.resolve();other.account.resolve();await tick();
      assert.equal(other.context.cart.length,0);assert.equal(other.storage.has('checkoutState_v1'),false);
    }
  });
  test(`${menu}: falha da conta não bloqueia produtos nem apaga carrinho público editado`,async()=>{
    const f=fixture(menu,{transferred:true});f.context.start();f.products.resolve();await tick();
    f.context.cart=[{id:'public-new',quantity:2}];f.storage.set('checkoutState_v1',JSON.stringify({storeId:f.storeId,cart:f.context.cart}));
    f.account.reject(Error('Customer unavailable'));await tick();
    assert.ok(f.events.includes('catalog-visible'));assert.equal(f.context.cart[0].id,'public-new');
    assert.equal(JSON.parse(f.storage.get('checkoutState_v1')).cart[0].id,'public-new');
  });
  test(`${menu}: resposta tardia da conta não substitui um carrinho público novo`,async()=>{
    const f=fixture(menu,{transferred:true});f.context.start();f.products.resolve();await tick();
    f.context.cart=[{id:'public-new',quantity:2}];f.storage.set('checkoutState_v1',JSON.stringify({storeId:f.storeId,cart:f.context.cart}));
    f.auth.currentUser={uid:'customer-a'};f.account.resolve();await tick();
    assert.equal(f.context.cart[0].id,'public-new');assert.equal(f.context.reorderOwnerUid,null);
  });
  test(`${menu}: login/logout depois do catálogo preservam produtos, loja e carrinho público`,async()=>{
    const f=fixture(menu);f.context.start();f.products.resolve();await tick();
    const products=f.context.allProducts,cart=f.context.cart;let callbacks;
    Object.assign(f.context,{installCustomerAccount:options=>{callbacks=options;return {ready:Promise.resolve()};},
      reorderCart:{},syncOnlinePaymentOption:()=>{},persistCheckoutState:()=>{},notify:()=>{},
      identificationModal:{classList:{add:()=>{}}},openAddressManagementModal:()=>{}});
    const code=f.source.match(/ {8}const customerAccount=installCustomerAccount\([^\n]+/)[0];
    vm.runInContext(code,f.context);
    f.auth.currentUser={uid:'customer-a'};callbacks.onSession({id:'own',accountLinked:true});
    assert.equal(f.context.currentClient.id,'own');assert.equal(f.context.cart,cart);
    f.auth.currentUser=null;callbacks.onSession(null);callbacks.onLogout();
    assert.equal(f.context.currentClient,null);assert.equal(f.context.cart,cart);
    assert.equal(f.context.allProducts,products);assert.equal(f.context.STORE_ID,f.storeId);
    assert.ok(f.events.includes('catalog-visible'));
  });
  test(`${menu}: erro de restauração privada preserva catálogo e descarta somente transferência pendente`,async()=>{
    const f=fixture(menu,{transferred:true});f.context.start();f.products.resolve();await tick();f.account.reject(Error('Customer unavailable'));await tick();
    assert.ok(f.events.includes('catalog-visible'));assert.equal(f.context.cart.length,0);assert.equal(f.storage.size,0);
  });
  test(`${menu}: identificação no checkout continua aguardando sessão`,async()=>{
    const f=fixture(menu);const begin=f.source.indexOf("            checkoutButton.addEventListener('click', async () => {");
    const end=f.source.indexOf("            closeIdentificationModal.addEventListener",begin);const code=f.source.slice(begin,end);
    let handler,opened=false;Object.assign(f.context,{checkoutButton:{addEventListener:(_,fn)=>{handler=fn;}},
      storeIsOpenNow:true,cart:[{id:'public'}],resetWhatsAppConsent:()=>{},cartModal:{classList:{add:()=>{}}},persistCheckoutState:()=>{},
      isLinkedCustomer:c=>!!c?.accountLinked,openAddressManagementModal:()=>{opened=true;},identificationModal:{classList:{remove:()=>{opened=true;}}}});
    vm.runInContext(code,f.context);const pending=handler();await tick();assert.equal(opened,false);
    f.context.currentClient={id:'own',accountLinked:true};f.account.resolve();await pending;assert.equal(opened,true);
  });
}
