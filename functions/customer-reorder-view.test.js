const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require(require.resolve('jsdom',{paths:[path.join(__dirname,'../crm')]}));
const store='ana-guimaraes-doceria-matriz',other='ana-guimaraes-doceria-garavelo';
const product=(id='p',extra={})=>({id,nome:id,preco:16,estoque:5,available:true,...extra});
const order=(items=[{productId:'p',nome:'antigo',preco:12,quantity:2}],storeId=store)=>({id:'old',storeId,storeName:storeId,itens:items});
const preview=()=>({order:order(),products:[product()]});
const cart=(items=[],storeId=store)=>({storeId,items});
const modules=()=>import('../crm/public/reorder-cart.mjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture({current=cart(),response=async()=>preview()}={}) {
  const {createCustomerReorderView}=await import('../crm/public/customer-reorder-view.mjs');
  const dom=new JSDOM('<main><button data-reorder-button>Comprar Novamente</button><section hidden></section></main>');
  const panel=dom.window.document.querySelector('section'),calls=[],applied=[];let uid='a',state=current;
  const view=createCustomerReorderView({panel,call:async(name,data)=>{calls.push({name,data});return response(calls.length,data);},
    snapshot:()=>({uid}),isCurrent:s=>s.uid===uid && !!uid,cart:{snapshot:()=>structuredClone(state),apply:p=>{applied.push(p);state=cart(p.items,p.storeId);},open:()=>{}},onExpired:()=>{uid=null;view.clear();},onCartOpen:()=>{}});
  return {view,panel,calls,applied,setCart:c=>{state=c;},logout:()=>{uid=null;view.clear();},swap:()=>{uid='b';view.clear();},
    click:async label=>{const button=[...panel.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(button,label);await button.onclick();},close:()=>dom.window.close()};
}
test('recompra usa IDs/preço atual e produz novo carrinho sem modificar snapshots',async()=>{
  const {prepareReorder}=await modules(),input={...preview(),cart:cart()},old=structuredClone(input);
  const result=prepareReorder(input);assert.equal(result.cartResult[0].preco,16);assert.equal(result.cartResult[0].quantity,2);
  assert.equal(result.priceChanged.length,1);assert.deepEqual(input,old);
  assert.deepEqual(Object.keys(result.cartResult[0]).sort(),['id','nome','preco','produtoId','quantity'].sort());
});
test('ID ausente não é associado por nome; produto removido/inativo/esgotado é explicado',async()=>{
  const {prepareReorder}=await modules();const result=prepareReorder({order:order([{nome:'p',quantity:1},{productId:'deleted',quantity:1},{productId:'inactive',quantity:1},{productId:'zero',quantity:1}]),
    products:[product('p'),product('inactive',{available:false}),product('zero',{estoque:0})]});
  assert.equal(result.cartResult,null);assert.equal(result.unavailable.length,4);
});
test('estoque parcial limita quantidade e informa ajuste; nulo/ausente mantém quantidade',async()=>{
  const {prepareReorder}=await modules();const partial=prepareReorder({...preview(),products:[product('p',{estoque:1})]});
  assert.equal(partial.cartResult[0].quantity,1);assert.equal(partial.adjusted[0].requested,2);
  for(const estoque of [null,undefined]) assert.equal(prepareReorder({...preview(),products:[product('p',{estoque})]}).cartResult[0].quantity,2);
});
test('adição consolida item duplicado e limita soma ao estoque corrente',async()=>{
  const {prepareReorder}=await modules();const result=prepareReorder({...preview(),cart:cart([{id:'p',quantity:4,preco:12}]),mode:'add'});
  assert.equal(result.cartResult.length,1);assert.equal(result.cartResult[0].quantity,5);assert.equal(result.cartResult[0].preco,16);assert.equal(result.added[0].quantity,1);
});
test('substituir usa somente itens elegíveis; soma cheia não destrói carrinho',async()=>{
  const {prepareReorder}=await modules(),existing=cart([{id:'q',quantity:1,preco:9}]);
  assert.deepEqual(prepareReorder({...preview(),cart:existing}).cartResult.map(i=>i.id),['p']);
  assert.equal(prepareReorder({...preview(),cart:cart([{id:'p',quantity:5,preco:16}]),mode:'add'}).cartResult,null);
  assert.deepEqual(existing.items,[{id:'q',quantity:1,preco:9}]);
});
test('nenhum item elegível preserva carrinho e impede confirmação',async t=>{
  const f=await fixture({current:cart([{id:'q',quantity:1}]),response:async()=>({...preview(),products:[]})});t.after(f.close);
  await f.view.start(order());assert.match(f.panel.textContent,/não estão disponíveis/);assert.equal(f.applied.length,0);
  assert.deepEqual([...f.panel.querySelectorAll('button')].map(b=>b.textContent),['Cancelar']);
});
test('lojas diferentes nunca são somadas',async()=>{
  const {prepareReorder}=await modules();assert.throws(()=>prepareReorder({...preview(),cart:cart([{id:'p',quantity:1}],other),mode:'add'}),/misturar lojas/);
});
test('estado fresco descarta dados financeiros/endereço/consentimento históricos',async()=>{
  const {freshCheckoutState}=await modules();const state=freshCheckoutState(store,[{id:'p',preco:16,quantity:1,nome:'atual',order_nsu:'old',cupom:'old',receipt_url:'old'}],'a');
  assert.deepEqual(state.pendingOrderDetails,{});assert.equal(state.valorFrete,0);assert.equal(state.guestCurrentLatLng,null);
  assert.equal(state.reorderOwnerUid,'a');assert.doesNotMatch(JSON.stringify(state),/order_nsu|receipt_url|cupom|old/);
});
test('transferência guarda contrato existente e só navega ao cardápio canônico correto',async()=>{
  const {createStoredCartBridge,CHECKOUT_STATE_KEY}=await modules(),dom=new JSDOM('',{url:'https://example.test'}),storage=dom.window.sessionStorage;
  storage.setItem('doceria-payment-pending','old-payment');let url;
  const bridge=createStoredCartBridge({storage,navigate:u=>{url=u;}});bridge.apply({storeId:other,items:[{id:'p',nome:'p',preco:16,quantity:1}],uid:'a'});
  assert.equal(url,'/cardapio-garavelo');assert.equal(JSON.parse(storage.getItem(CHECKOUT_STATE_KEY)).storeId,other);assert.equal(storage.getItem('doceria-payment-pending'),null);
  assert.throws(()=>bridge.apply({storeId:'unknown',items:[],uid:'a'}),/Não há cardápio/);dom.window.close();
});
test('falha na transferência restaura storage e tentativa de pagamento anterior',async()=>{
  const {createStoredCartBridge,CHECKOUT_STATE_KEY}=await modules(),dom=new JSDOM('',{url:'https://example.test'}),storage=dom.window.sessionStorage;
  storage.setItem(CHECKOUT_STATE_KEY,'{"cart":[{"id":"original"}]}');storage.setItem('doceria-payment-pending','old-payment');
  const bridge=createStoredCartBridge({storage,navigate:()=>{throw Error('navigation');}});
  assert.throws(()=>bridge.apply({storeId:store,items:[],uid:'a'}));assert.equal(storage.getItem(CHECKOUT_STATE_KEY),'{"cart":[{"id":"original"}]}');assert.equal(storage.getItem('doceria-payment-pending'),'old-payment');dom.window.close();
});
test('duplo clique gera uma preparação e uma aplicação; cancelar não altera carrinho',async t=>{
  const f=await fixture();t.after(f.close);await Promise.all([f.view.start(order()),f.view.start(order())]);assert.equal(f.calls.length,1);
  await f.click('Cancelar');assert.equal(f.applied.length,0);await f.view.start(order());
  await Promise.all([f.click('Preparar carrinho'),f.click('Preparar carrinho')]);assert.equal(f.applied.length,1);assert.equal(f.calls.length,3);
});
test('carrinho existente oferece adicionar/substituir/cancelar e revisa soma antes de aplicar',async t=>{
  const f=await fixture({current:cart([{id:'p',nome:'p',quantity:4,preco:16}])});t.after(f.close);await f.view.start(order());
  assert.deepEqual([...f.panel.querySelectorAll('button')].map(b=>b.textContent),['Adicionar ao carrinho','Substituir carrinho','Cancelar']);
  await f.click('Adicionar ao carrinho');assert.equal(f.applied.length,0);assert.match(f.panel.textContent,/quantidade ajustada/);
  await f.click('Confirmar adição');assert.equal(f.applied[0].items[0].quantity,5);
});
test('carrinho de outra loja exige confirmação explícita de substituição',async t=>{
  const f=await fixture({current:cart([{id:'q',quantity:1}],other)});t.after(f.close);await f.view.start(order());
  assert.match(f.panel.textContent,/trocar de loja/);assert.equal(f.applied.length,0);assert.doesNotMatch(f.panel.textContent,/Adicionar ao carrinho/);
  await f.click('Substituir e continuar');assert.equal(f.applied[0].storeId,store);
});
test('falha da Function mantém carrinho anterior e mostra mensagem segura',async t=>{
  const f=await fixture({response:async()=>{throw Error('private internal secret');}});t.after(f.close);
  await f.view.start(order());assert.equal(f.applied.length,0);assert.match(f.panel.textContent,/Não foi possível/);assert.doesNotMatch(f.panel.textContent,/secret/);
});
test('carrinho alterado enquanto aguarda invalida preparação/aplicação',async t=>{
  let release;const f=await fixture({response:()=>new Promise(resolve=>{release=resolve;})});t.after(f.close);
  const pending=f.view.start(order());f.setCart(cart([{id:'q',quantity:1}]));release(preview());await pending;assert.equal(f.applied.length,0);assert.match(f.panel.textContent,/Não foi possível/);
});
test('logout/troca Customer descarta resposta tardia e limpa estado privado',async t=>{
  for(const action of ['logout','swap']) {
    let release;const f=await fixture({response:()=>new Promise(resolve=>{release=resolve;})});t.after(f.close);
    const pending=f.view.start(order());f[action]();release(preview());await pending;
    assert.equal(f.panel.hidden,true);assert.equal(f.panel.textContent,'');assert.equal(f.applied.length,0);
  }
});
test('logout durante revalidação final não aplica carrinho preparado',async t=>{
  let release;const f=await fixture({response:async count=>count===1?preview():new Promise(resolve=>{release=resolve;})});t.after(f.close);
  await f.view.start(order());const pending=f.click('Preparar carrinho');f.logout();release(preview());await pending;assert.equal(f.applied.length,0);
});
test('preço/estoque mudaram entre preparação e confirmação: exige nova revisão',async t=>{
  const f=await fixture({response:async count=>({...preview(),products:[product('p',{preco:count===1?16:20,estoque:count===1?5:1})]})});t.after(f.close);
  await f.view.start(order());await f.click('Preparar carrinho');assert.equal(f.applied.length,0);assert.match(f.panel.textContent,/mudaram enquanto/);
  await f.click('Preparar carrinho');assert.equal(f.applied[0].items[0].preco,20);assert.equal(f.applied[0].items[0].quantity,1);
});
test('botões da lista e detalhe usam uma lógica compartilhada sem modificar carrinho na leitura',async t=>{
  const {createCustomerOrderHistory}=await import('../crm/public/customer-orders-view.mjs');
  const dom=new JSDOM('<section><h3 data-orders-heading></h3><button data-history></button><div data-orders-list><p data-orders-message></p><ul data-orders></ul><button data-orders-more></button></div><aside data-order-detail><h3 data-order-detail-heading></h3><p data-order-detail-message></p><button data-order-back></button><article data-order-detail-content></article></aside></section>');t.after(()=>dom.window.close());
  const root=dom.window.document.querySelector('section');let requested=[];
  const full={...order(),total:24,createdAt:null,payment_status:'PAID',order_status:'CONFIRMED'};
  const history=createCustomerOrderHistory({panel:root,
    snapshot:()=>({uid:'a'}),isCurrent:()=>true,call:async name=>name==='customerOrders'?{orders:[full],hasMore:false}:{order:full},
    onExpired:()=>{},onReorder:value=>{requested.push(value);}});
  await history.load();root.querySelector('[data-reorder-button]').click();await tick();
  await root.querySelector('[data-order-key]').onclick();root.querySelector('article [data-reorder-button]').click();await tick();assert.equal(requested.length,2);assert.ok(requested.every(o=>o.id==='old'));
});
test('adaptador de página atualiza sem navegação e reverte storage quando aplicação falha',async()=>{
  const {createPageCartBridge,CHECKOUT_STATE_KEY}=await modules(),dom=new JSDOM('',{url:'https://example.test'}),storage=dom.window.sessionStorage;
  storage.setItem(CHECKOUT_STATE_KEY,'original');let state=[];
  const bridge=createPageCartBridge({storeId:store,storage,navigate:()=>{throw Error('unexpected');},readCart:()=>state,applyCart:p=>{state=p.items;},open:()=>{}});
  assert.equal(bridge.apply({storeId:store,items:[{id:'p',preco:16,quantity:1,nome:'p'}],uid:'a'}).redirected,false);assert.equal(bridge.snapshot().items[0].id,'p');
  const before=storage.getItem(CHECKOUT_STATE_KEY);const failure=createPageCartBridge({storeId:store,storage,readCart:()=>state,applyCart:()=>{throw Error('render failure');}});
  assert.throws(()=>failure.apply({storeId:store,items:[],uid:'a'}));assert.equal(storage.getItem(CHECKOUT_STATE_KEY),before);dom.window.close();
});
test('integração real dos três cardápios limpa estado anterior e restaura memória em falha',()=>{
  for(const name of ['matriz','garavelo','festa']) {
    const source=fs.readFileSync(path.join(__dirname,`../crm/public/cardapio-${name}.html`),'utf8');
    const code=source.slice(source.indexOf('        function applyReorderCart('),source.indexOf('        const reorderCart='));
    assert.ok(code);const window={addressFlowState:{formData:{old:true}},valorFrete:4};let fail=false;
    const context=vm.createContext({window,cart:[{id:'old'}],allProducts:[],pendingOrderDetails:{order_nsu:'old'},appliedCupom:{codigo:'OLD'},addressStep:3,checkoutBlockingIssue:{type:'frete'},reorderOwnerUid:null,
      createInitialGuestAddressFlowState:()=>({currentStep:1,formData:{}}),renderCart:()=>{if(fail){fail=false;throw Error('render');}},updateAllSummaries:()=>{},resetWhatsAppConsent:()=>{},
      selectedAddressText:{textContent:'old'},paymentMethodSelect:{value:'old'},guestPaymentMethodSelect:{value:'old'},paymentCupomInput:{value:'OLD'},paymentCupomMessage:{textContent:'old'},paymentError:{textContent:'old'},paymentVerifyCupomButton:{classList:{replace:()=>{}}}});
    vm.runInContext(code,context);const payload={items:[{id:'p',preco:16,quantity:1}],products:[product()],uid:'a'};
    fail=true;assert.throws(()=>context.applyReorderCart(payload));assert.equal(context.cart[0].id,'old');assert.equal(context.window.valorFrete,4);
    context.applyReorderCart(payload);assert.equal(context.cart[0].id,'p');assert.equal(context.reorderOwnerUid,'a');assert.equal(context.window.valorFrete,0);
    assert.equal(JSON.stringify(context.pendingOrderDetails),'{}');assert.equal(context.appliedCupom,null);assert.equal(context.paymentMethodSelect.value,'');assert.equal(context.selectedAddressText.textContent,'');
  }
});
test('carrinho transferido não é herdado por outro Customer ou por visitante',async()=>{
  const {createStoredCartBridge,CHECKOUT_STATE_KEY,freshCheckoutState}=await modules();
  const dom=new JSDOM('',{url:'https://example.test'}),storage=dom.window.sessionStorage;
  storage.setItem(CHECKOUT_STATE_KEY,JSON.stringify(freshCheckoutState(store,[{id:'p',nome:'p',preco:16,quantity:1}],'a')));
  for(const uid of [null,'b']) assert.deepEqual(createStoredCartBridge({storage,getUid:()=>uid}).snapshot(),{storeId:null,items:[]});
  assert.equal(createStoredCartBridge({storage,getUid:()=>'a'}).snapshot().items[0].id,'p');dom.window.close();
});
test('restauração real do cardápio aceita mesma sessão e descarta transferência de outra conta',async()=>{
  const {freshCheckoutState,CHECKOUT_STATE_KEY}=await modules();
  for(const name of ['matriz','garavelo','festa']) {
    const source=fs.readFileSync(path.join(__dirname,`../crm/public/cardapio-${name}.html`),'utf8');
    const code=source.slice(source.indexOf('        function restoreCheckoutState()'),source.indexOf('        function clearCheckoutState()'));
    for(const uid of ['a','b',null]) {
      const context=vm.createContext({cart:[],pendingOrderDetails:{},reorderOwnerUid:null,STORE_ID:store,CHECKOUT_STORAGE_KEY:CHECKOUT_STATE_KEY,
        sessionStorage:{getItem:()=>JSON.stringify(freshCheckoutState(store,[{id:'p',nome:'p',preco:16,quantity:1}],'a'))},getAuth:()=>({currentUser:uid?{uid}:null}),app:{},
        window:{addressFlowState:{}},addressStep:1,selectedAddressText:{textContent:''},renderCart:()=>{},updateAllSummaries:()=>{},clearCheckoutState:()=>{},console,
        createInitialGuestAddressFlowState:()=>({currentStep:1,formData:{}})});
      vm.runInContext(code,context);context.restoreCheckoutState();assert.equal(context.cart.length,uid==='a'?1:0);
    }
  }
});
