const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require(require.resolve('jsdom', {paths: [path.join(__dirname, '../crm')]}));

const user = (uid = 'uid-a', provider = 'password') => ({uid, isAnonymous: false,
  providerData: [{providerId: provider}], displayName: uid});
const customer = (id = 'a') => ({id, accountLinked: true, nome: `Cliente ${id}`, telefone: '62999991234', enderecos: []});
const tick = () => new Promise(resolve => setImmediate(resolve));

async function fixture({embedded=false,initialUser = user(), sdk = {}, backend = async (name, auth) =>
  name === 'customerAccount' ? {customer: customer(auth.currentUser?.uid || 'a')} : {orders: []}} = {}) {
  const {isCustomerIdentity, createCustomerAreaNavigation} = await import('../crm/public/customer-area.mjs');
  const {createCustomerAuthState} = await import('../crm/public/customer-session.mjs');
  const {createCustomerProfileSecurity} = await import('../crm/public/customer-profile.mjs');
  const {createCustomerOrderHistory} = await import('../crm/public/customer-orders-view.mjs');
  const {createCustomerReorderView}=await import('../crm/public/customer-reorder-view.mjs');
  const {createStoredCartBridge}=await import('../crm/public/reorder-cart.mjs');
  const dom = new JSDOM('<button id="customer-account-button">Minha Conta</button><button id="continue-google-button">Google</button>', {url: 'https://example.test/cardapio-matriz?store=matriz'});
  const {window} = dom;
  window.HTMLDialogElement.prototype.showModal = function() {this.open = true;};
  window.HTMLDialogElement.prototype.close = function() {this.open = false;};
  const auth = {currentUser: initialUser};
  let listener;
  const calls = [], sessions = [], logouts = [], checkout = [],routes=[];
  const host=embedded?window.document.createElement('main'):null;
  if(host) window.document.body.append(host);
  const context = vm.createContext({document: window.document, window, URL, console,
    auth, functions: {}, isCustomerUser: isCustomerIdentity, createCustomerAreaNavigation, createCustomerAuthState, createCustomerProfileSecurity, createCustomerOrderHistory, createCustomerReorderView, createStoredCartBridge,
    EmailAuthProvider: {credential:()=>({})}, reauthenticateWithCredential:async()=>{}, verifyBeforeUpdateEmail:async()=>{}, updatePassword:async()=>{},
    sendEmailVerification:async()=>{}, sendPasswordResetEmail:async()=>{}, reload:async()=>{}, ...sdk,
    customerAuthErrorMessage: error => error.message,
    httpsCallable: (_functions, name) => async data => {calls.push({name, data}); return {data: await backend(name, auth, data)};},
    onAuthStateChanged: (_auth, fn) => {listener = fn;},
    signOut: async () => {auth.currentUser = null; listener(null);},
    setPersistence: async () => {}, browserLocalPersistence: {},
    GoogleAuthProvider: class {},
    signInWithPopup: async () => {auth.currentUser = user('google-a', 'google.com'); listener(auth.currentUser);},
  });
  const source = fs.readFileSync(path.join(__dirname, '../crm/public/customer-account-core.mjs'), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '')
    .replace('export function installCustomerAccount', 'function installCustomerAccount')
    .replace(/import\.meta\.url/g, "'https://example.test/customer-account.js'");
  vm.runInContext(source, context);
  const api = context.installCustomerAccount({runtime:context,host,onRoute:route=>routes.push(route),onSession: value => sessions.push(value),
    onLogout: () => logouts.push(true), onCustomer: value => checkout.push(value)});
  listener(initialUser); await api.ready;
  const dialog = host?host.querySelector('.customer-area-dialog'):window.document.querySelector('dialog');
  const el = name => dialog.querySelector(`[data-${name}]`);
  const navigate = route => dialog.querySelector(`[data-customer-route="${route}"]`).onclick({preventDefault() {}});
  return {api, auth, calls, sessions, logouts, checkout, routes,host,window, dialog, el, navigate,
    emit: next => {auth.currentUser = next; listener(next);}, close: () => window.close()};
}

test('rotas privadas rejeitam visitante, anônimo, celular legado e UID sem vínculo', async () => {
  const {canEnterCustomerArea, createCustomerAreaNavigation} = await import('../crm/public/customer-area.mjs');
  for (const session of [{}, {user: {...user(), isAnonymous: true}, customer: customer(), ownerUid: 'uid-a'},
    {user: user('uid-a', 'phone'), customer: customer(), ownerUid: 'uid-a'},
    {user: user(), customer: {id: 'legacy'}, ownerUid: 'uid-a'},
    {user: user('uid-b'), customer: customer(), ownerUid: 'uid-a'}]) {
    assert.equal(canEnterCustomerArea(session), false);
    const router = createCustomerAreaNavigation({getSession: () => session});
    assert.equal(router.navigate('profile'), 'login');
    assert.equal(router.navigate('orders'), 'login');
  }
  assert.equal(canEnterCustomerArea({user: user(), customer: customer(), ownerUid: 'uid-a'}), true);
});

test('Meu Perfil e Meus Pedidos são telas distintas; voltar à compra mantém sessão e contexto', async t => {
  const f = await fixture(); t.after(f.close);
  f.window.sessionStorage.setItem('cart', 'carrinho-preservado');
  await f.api.openAccount();
  assert.equal(f.el('profile').hidden, false);
  assert.equal(f.el('orders-panel').hidden, true);
  await f.navigate('orders');
  assert.equal(f.el('profile').hidden, true);
  assert.equal(f.el('orders-panel').hidden, false);
  assert.equal(f.el('orders-message').textContent, 'Você ainda não realizou nenhum pedido.');
  assert.ok(f.calls.some(call => call.name === 'customerOrders' && Object.keys(call.data).length === 0));
  await f.navigate('home');
  assert.equal(f.dialog.open, false);
  assert.equal(f.api.getCustomer().accountLinked, true);
  assert.equal(f.logouts.length, 0);
  assert.equal(f.window.sessionStorage.getItem('cart'), 'carrinho-preservado');
  assert.equal(f.window.location.search, '?store=matriz');
});

test('logout remove dados privados e reentrada privada apresenta login sem consulta de pedidos', async t => {
  const f = await fixture(); t.after(f.close);
  await f.api.openAccount();
  assert.ok(f.el('name').value);
  await f.el('area-logout').onclick({preventDefault() {}});
  assert.equal(f.api.getCustomer(), null);
  assert.equal(f.el('area').hidden, true);
  assert.equal(f.el('name').value, '');
  assert.equal(f.el('email-state').textContent, '');
  assert.equal(f.logouts.length, 1);
  const calls = f.calls.length;
  await f.api.openAccount('orders');
  assert.equal(f.el('signed-out').hidden, false);
  assert.equal(f.el('area').hidden, true);
  assert.equal(f.calls.length, calls);
});

test('resposta de pedidos atrasada após logout não restaura dados privados', async t => {
  let resolveOrders;
  const f = await fixture({backend: async name => name === 'customerAccount' ? {customer: customer()} :
    new Promise(resolve => {resolveOrders = resolve;})}); t.after(f.close);
  await f.api.openAccount();
  const pending = f.navigate('orders');
  await tick(); f.emit(null);
  resolveOrders({orders: [{id: 'old', total: 12, itens: [{nome: 'Privado', quantity: 1}]}]});
  await pending;
  assert.equal(f.el('orders').textContent, '');
  assert.equal(f.el('area').hidden, true);
  assert.equal(f.logouts.length, 1);
});

test('troca de UID invalida imediatamente o perfil e descarta histórico da conta anterior', async t => {
  const resolves = [];
  const f = await fixture({backend: async (name, auth) => name === 'customerAccount' ?
    {customer: customer(auth.currentUser.uid)} : new Promise(resolve => {resolves.push(resolve);})}); t.after(f.close);
  await f.api.openAccount();
  const pending = f.navigate('orders'); await tick();
  f.emit(user('uid-b'));
  assert.equal(f.el('area').hidden, true);
  assert.equal(f.el('name').value, '');
  await tick();
  resolves[0]({orders: [{total: 12, itens: [{nome: 'Privado A', quantity: 1}]}]});
  await pending;
  assert.equal(f.el('orders').textContent, '');
  resolves[1]({orders: [{total: 16, itens: [{nome: 'Privado B', quantity: 1}]}]});
  await tick();
  assert.match(f.el('orders').textContent, /Privado B/);
  assert.doesNotMatch(f.el('orders').textContent, /Privado A/);
  assert.equal(f.api.getCustomer().id, 'uid-b');
  assert.equal(f.logouts.length, 1);
});

test('falha ao validar conta esconde perfil e nenhuma rota autoriza dados em cache', async t => {
  let failing = false;
  const f = await fixture({backend: async () => {if (failing) throw Error('network');return {customer: customer()};}}); t.after(f.close);
  await f.api.openAccount(); failing = true;
  await assert.rejects(f.api.openAccount(), /Não foi possível carregar/);
  assert.equal(f.el('area').hidden, true);
  assert.equal(f.el('name').value, '');
  await f.navigate('orders');
  assert.equal(f.calls.filter(c => c.name === 'customerOrders').length, 0);
});

test('conta Google incompleta mantém conclusão do telefone sem liberar navegação', async t => {
  const f = await fixture({initialUser: user('google-a', 'google.com'), backend: async () => ({customer: null, nome: 'Google'})}); t.after(f.close);
  await f.api.openAccount('orders');
  assert.equal(f.el('phone').hidden, false);
  assert.equal(f.el('area').hidden, true);
  assert.equal(f.el('logout').hidden, false);
  assert.equal(f.calls.filter(c => c.name === 'customerOrders').length, 0);
});

test('shell usa rotas internas sem alterar URL/loja e carrega estilo responsivo', async t => {
  const f = await fixture(); t.after(f.close);
  await f.api.openAccount('orders');
  assert.equal(f.el('orders-panel').hidden, false);
  await f.navigate('profile');
  assert.equal(f.window.document.activeElement, f.el('profile-heading'));
  const css = fs.readFileSync(path.join(__dirname, '../crm/public/customer-area.css'), 'utf8');
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /repeat\(2, minmax\(0, 1fr\)\)/);
  assert.ok(f.window.document.querySelector('[data-customer-area-style]'));
  assert.equal(f.window.location.pathname, '/cardapio-matriz');
});

test('login Google iniciado pelo checkout retoma a compra uma vez com Customer vinculado', async t => {
  const f = await fixture({initialUser: null}); t.after(f.close);
  f.window.document.getElementById('continue-google-button').click();
  await tick(); await tick();
  assert.equal(f.checkout.length, 1);
  assert.equal(f.checkout[0].id, 'google-a');
  assert.equal(f.dialog.open, false);
  assert.equal(f.api.getCustomer().accountLinked, true);
  await f.api.openAccount();
  assert.equal(f.el('profile').hidden, false);
  assert.equal(f.checkout.length, 1);
});

test('falha no histórico permite tentar novamente sem perder a sessão autenticada', async t => {
  let failed = true;
  const f = await fixture({backend: async name => {
    if (name === 'customerAccount') return {customer: customer()};
    if (failed) throw Error('unavailable');
    return {orders: [{total: 16, itens: [{nome: 'Pedido recuperado', quantity: 1}]}]};
  }}); t.after(f.close);
  await f.api.openAccount('orders');
  assert.match(f.el('orders-message').textContent, /Não foi possível carregar/);
  assert.equal(f.el('orders-panel').hidden, false);
  assert.equal(f.logouts.length, 0);
  failed = false;
  await f.el('history').onclick({preventDefault() {}});
  assert.match(f.el('orders').textContent, /Pedido recuperado/);
  assert.equal(f.el('orders-message').textContent, '');
});

test('perfil salva nome/telefone sem customerId e exibe e-mail, provider e verificação', async t => {
  const data={...customer(),email:'a@example.com',emailVerified:false,createdAt:'2026-10-01T12:00:00Z'};
  const f=await fixture({backend:async(name,_auth,fields)=>{
    if(name==='customerUpdate') Object.assign(data,fields);
    return {customer:{...data}};
  }});t.after(f.close);await f.api.openAccount();
  assert.match(f.el('email-state').textContent,/Não verificado/);assert.match(f.el('provider-state').textContent,/e-mail e senha/);
  f.el('name').value='Novo nome';f.el('profile-phone').value='62999990000';
  await f.el('save').onclick({preventDefault(){}});
  const saved=f.calls.find(c=>c.name==='customerUpdate').data;
  assert.equal(saved.nome,'Novo nome');assert.equal(saved.telefone,'62999990000');assert.equal(saved.customerId,undefined);
  assert.equal(f.el('profile-phone').value,'62999990000');assert.match(f.el('created-state').textContent,/Conta criada/);
});

test('perfil completo oferece CRUD/padrão por ID estável e persiste após reabrir', async t => {
  const data={...customer(),enderecos:[{id:'address-a',nickname:'Casa',enderecoCompleto:'Rua A',lat:-16,lng:-49,isDefault:false}]};
  const f=await fixture({backend:async(name,_auth,fields)=>{
    if(name==='customerAddAddress') data.enderecos.push({...fields.address,id:'address-new'});
    if(name==='customerUpdateAddress') data.enderecos=data.enderecos.map(a=>a.id===fields.addressId?{...a,...fields.address}:a);
    if(name==='customerSetDefaultAddress') data.enderecos=data.enderecos.map(a=>({...a,isDefault:a.id===fields.addressId}));
    if(name==='customerDeleteAddress') data.enderecos=data.enderecos.filter(a=>a.id!==fields.addressId);
    return {customer:structuredClone(data)};
  }});t.after(f.close);await f.api.openAccount();
  const action=text=>[...f.el('addresses').querySelectorAll('button')].find(b=>b.textContent===text);
  await action('Editar').onclick({preventDefault(){}});f.el('address-nickname').value='Novo apelido';
  await f.el('address-form').onsubmit({preventDefault(){}});
  assert.equal(f.calls.find(c=>c.name==='customerUpdateAddress').data.addressId,'address-a');
  await action('Definir como padrão').onclick({preventDefault(){}});assert.match(f.el('addresses').textContent,/Padrão/);
  f.el('address-add').onclick();f.el('address-nickname').value='Trabalho';f.el('address-enderecoCompleto').value='Rua B';f.el('address-lat').value='-16';f.el('address-lng').value='-49';
  await f.el('address-form').onsubmit({preventDefault(){}});assert.equal(data.enderecos.length,2);
  f.dialog.close();await f.api.openAccount();assert.match(f.el('addresses').textContent,/Novo apelido/);
  await action('Excluir').onclick({preventDefault(){}});assert.equal(data.enderecos.length,1);
  const mutations=f.calls.filter(c=>c.name.startsWith('customer') && c.name!=='customerAccount');
  assert.ok(mutations.every(c=>c.data.customerId===undefined && c.data.index===undefined));
});

test('Google oculta alterações locais de senha/e-mail e política InfinitePay não lista cartões', async t => {
  const f=await fixture({initialUser:user('google-a','google.com'),backend:async()=>({customer:{...customer(),authProvider:'google',email:'google@example.com',emailVerified:true}})});t.after(f.close);await f.api.openAccount();
  assert.equal(f.el('password-security').hidden,true);assert.equal(f.el('verify-email').hidden,true);
  assert.match(f.el('provider-state').textContent,/Google vinculada/);
  assert.match(f.el('profile').textContent,/Gerenciado pela InfinitePay/);
  assert.equal(f.el('profile').querySelector('input[name="card"], input[name="cvv"]'),null);
});

test('e-mail/senha usam SDK seguro, limpam senhas e atualizam status verificado', async t => {
  const sdkCalls=[];const currentUser={...user(),email:'a@example.com',getIdToken:async()=>{sdkCalls.push('token');}};
  let verified=false;
  const f=await fixture({initialUser:currentUser,sdk:{
    reauthenticateWithCredential:async()=>{sdkCalls.push('reauth');},
    verifyBeforeUpdateEmail:async(_user,email)=>{sdkCalls.push(email);},updatePassword:async()=>{sdkCalls.push('password');},
    sendEmailVerification:async()=>{sdkCalls.push('verify');},reload:async()=>{verified=true;},
  },backend:async()=>({customer:{...customer(),email:'a@example.com',emailVerified:verified}})});t.after(f.close);await f.api.openAccount();
  f.el('new-email').value='new@example.com';f.el('email-current-password').value='old-secret';
  await f.el('change-email').onsubmit({preventDefault(){}});assert.deepEqual(sdkCalls,['reauth','new@example.com']);assert.equal(f.el('email-current-password').value,'');
  f.el('current-password').value='old';f.el('new-password').value='abcdef';f.el('confirm-password').value='abcdef';
  await f.el('change-password').onsubmit({preventDefault(){}});assert.equal(sdkCalls.at(-1),'password');assert.equal(f.el('new-password').value,'');
  await f.el('verify-email').onclick({preventDefault(){}});assert.equal(sdkCalls.at(-1),'verify');
  await f.el('refresh-email').onclick({preventDefault(){}});assert.match(f.el('email-state').textContent,/— Verificado/);assert.equal(f.el('verify-email').hidden,true);
});

test('logout limpa formulário de endereço e credenciais; resposta de atualização antiga é descartada', async t => {
  let finish;
  const f=await fixture({backend:async name=>name==='customerUpdate'?new Promise(resolve=>{finish=resolve;}):{customer:customer()}});t.after(f.close);await f.api.openAccount();
  f.el('address-add').onclick();f.el('address-enderecoCompleto').value='Endereço privado';f.el('current-password').value='secret';
  const pending=f.el('save').onclick({preventDefault(){}});await tick();f.emit(null);
  finish({customer:{...customer(),nome:'Resposta antiga'}});await pending;
  assert.equal(f.api.getCustomer(),null);assert.equal(f.el('name').value,'');assert.equal(f.el('current-password').value,'');assert.equal(f.el('address-enderecoCompleto').value,'');assert.equal(f.el('address-form').hidden,true);
});

const historicalOrder=(id='historic',storeId='matriz')=>({id,storeId,number:1048,storeName:'Loja histórica',createdAt:'2026-10-01T17:00:00Z',total:14,
  subtotal:12,desconto:2,frete:4,status:'DELIVERED',payment_status:'PAID',modalidade:'entrega',endereco:'Rua histórica, 20',formaPagamento:'Pix',
  itemCount:1,itens:[{nome:'Brownie antigo',quantity:1,preco:12,total:12}],receipt_url:'https://receipt.example.com/order'});

test('histórico mostra campos completos e pagina sem duplicar pedidos de lojas distintas',async t=>{
  const first=historicalOrder(),second=historicalOrder('historic','garavelo');
  const f=await fixture({backend:async(name,_auth,data)=>name==='customerAccount'?{customer:customer()}:data.cursor?
    {orders:[first,second],nextCursor:null}:{orders:[first],nextCursor:'lojas/matriz/pedidos/historic'}});t.after(f.close);
  await f.api.openAccount('orders');
  assert.match(f.el('orders').textContent,/1048|Loja histórica/);assert.match(f.el('orders').textContent,/Pedido: Entregue/);assert.match(f.el('orders').textContent,/Pagamento: Pago/);
  assert.equal(f.el('orders-more').hidden,false);await f.el('orders-more').onclick();
  assert.equal(f.el('orders').children.length,2);assert.equal(f.el('orders-more').hidden,true);
  assert.equal(f.calls.filter(c=>c.name==='customerOrders')[1].data.cursor,'lojas/matriz/pedidos/historic');
});

test('detalhe mostra snapshot e comprovante seguro sem alterar carrinho ou endereço atual',async t=>{
  const order=historicalOrder();const f=await fixture({backend:async name=>name==='customerAccount'?{customer:{...customer(),enderecos:[{id:'now',enderecoCompleto:'Endereço atual'}]}}:
    name==='customerOrderDetail'?{order}:{orders:[order]}});t.after(f.close);
  f.window.sessionStorage.setItem('cart','carrinho atual');await f.api.openAccount('orders');
  await f.el('orders').querySelector('button').onclick();
  assert.equal(f.el('orders-list').hidden,true);assert.equal(f.el('order-detail').hidden,false);
  const text=f.el('order-detail-content').textContent;
  assert.match(text,/Brownie antigo/);assert.match(text,/12,00/);assert.match(text,/14,00/);assert.match(text,/4,00/);assert.match(text,/2,00/);
  assert.match(text,/Rua histórica/);assert.doesNotMatch(text,/Endereço atual/);assert.match(text,/Pix/);
  const link=f.el('order-detail-content').querySelector('a');assert.equal(link.href,order.receipt_url);assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
  assert.deepEqual(f.calls.find(c=>c.name==='customerOrderDetail').data,{storeId:'matriz',orderId:'historic'});
  f.el('order-back').onclick();assert.equal(f.el('orders-list').hidden,false);
  await f.navigate('home');assert.equal(f.window.sessionStorage.getItem('cart'),'carrinho atual');assert.equal(f.checkout.length,0);
});

test('pedido antigo sem comprovante/campos opcionais não quebra e status de pagamento é independente',async t=>{
  // eslint-disable-next-line no-script-url -- Unsafe backend link must not reach the DOM.
  const order={id:'old',storeId:'matriz',total:7,status:'Finalizado',itens:[{nome:'Antigo'}],receipt_url:'javascript:alert(1)'};
  const f=await fixture({backend:async name=>name==='customerAccount'?{customer:customer()}:name==='customerOrderDetail'?{order}:{orders:[order]}});t.after(f.close);
  await f.api.openAccount('orders');await f.el('orders').querySelector('button').onclick();
  const text=f.el('order-detail-content').textContent;assert.match(text,/Data não informada/);assert.match(text,/Pagamento: Não informado/);
  assert.match(text,/SubtotalNão informado/);assert.equal(f.el('order-detail-content').querySelector('a'),null);
  assert.doesNotMatch(text,/Comprar Novamente/);
});

test('detalhe não encontrado não mostra dados e sessão expirada limpa a área',async t=>{
  let expired=false;
  const f=await fixture({backend:async name=>{
    if(name==='customerAccount') return {customer:customer()};
    if(name==='customerOrderDetail') throw Object.assign(Error('backend private detail'),{code:expired?'functions/unauthenticated':'functions/not-found'});
    return {orders:[historicalOrder()]};
  }});t.after(f.close);await f.api.openAccount('orders');await f.el('orders').querySelector('button').onclick();
  assert.equal(f.el('order-detail-message').textContent,'Pedido não encontrado.');assert.equal(f.el('order-detail-content').textContent,'');
  f.el('order-back').onclick();expired=true;await f.el('orders').querySelector('button').onclick();
  assert.equal(f.el('area').hidden,true);assert.equal(f.el('orders').textContent,'');assert.equal(f.api.getCustomer(),null);
});

test('logout durante consulta de detalhe descarta endereço/comprovante privados',async t=>{
  let finish;
  const f=await fixture({backend:async name=>name==='customerAccount'?{customer:customer()}:name==='customerOrderDetail'?
    new Promise(resolve=>{finish=resolve;}):{orders:[historicalOrder()]}});t.after(f.close);
  await f.api.openAccount('orders');const pending=f.el('orders').querySelector('button').onclick();await tick();f.emit(null);
  finish({order:historicalOrder()});await pending;
  assert.equal(f.el('order-detail-content').textContent,'');assert.equal(f.el('order-detail').hidden,true);assert.equal(f.el('orders').textContent,'');
});

test('falha de paginação permite retry e troca de Customer descarta cursor anterior',async t=>{
  let failing=true;
  const f=await fixture({backend:async(name,auth,data)=>{
    if(name==='customerAccount') return {customer:customer(auth.currentUser.uid)};
    if(data.cursor && failing) throw Error('network');
    return {orders:[historicalOrder(auth.currentUser.uid)],nextCursor:data.cursor?null:`lojas/matriz/pedidos/${auth.currentUser.uid}`};
  }});t.after(f.close);await f.api.openAccount('orders');await f.el('orders-more').onclick();
  assert.equal(f.el('orders').children.length,1);assert.match(f.el('orders-message').textContent,/Não foi possível/);assert.equal(f.el('orders-more').disabled,false);
  failing=false;await f.el('orders-more').onclick();assert.equal(f.el('orders').children.length,1);
  f.emit(user('uid-b'));await tick();await tick();
  const last=f.calls.filter(c=>c.name==='customerOrders').at(-1);assert.deepEqual(last.data,{});
  assert.equal(f.el('orders').children.length,1);assert.equal(f.el('orders').querySelector('button').dataset.orderKey,'matriz/uid-b');
});

test('estados financeiros não dependem do estado operacional do pedido',async()=>{
  const {paymentStatus,orderStatus}=await import('../crm/public/customer-orders-view.mjs');
  for(const [status,label] of [['PENDING','Aguardando pagamento'],['PAID','Pago'],['FAILED','Falhou'],['EXPIRED','Expirado'],['REFUNDED','Estornado']])
    assert.equal(paymentStatus({status:'CONFIRMED',payment_status:status}),label);
  assert.equal(paymentStatus({status:'CONFIRMED'}),'Não informado');assert.equal(paymentStatus({payment_status:'PAID',requiresReview:true}),'Em revisão');
  assert.equal(orderStatus({status:'CANCELLED',payment_status:'REFUNDED'}),'Cancelado');
});

test('CRM embute o mesmo perfil aprovado, sem modal ou segundo modelo',async t=>{
  const f=await fixture({embedded:true});t.after(f.close);
  assert.equal(f.dialog.tagName,'SECTION');
  assert.equal(f.dialog.querySelector('form[method="dialog"]'),null);
  await f.api.openAccount('profile');
  assert.equal(f.el('profile').hidden,false);
  assert.equal(f.el('name').value,'Cliente uid-a');
  assert.equal(f.calls.filter(c=>c.name==='customerAccount').length,2);
  assert.doesNotMatch(f.dialog.textContent,/PAN|CVV|Gerenciar cartões/);
});

test('CRM abre detalhe e recompra pelo mesmo backend, sem tocar snapshot/carrinho',async t=>{
  const snapshot={id:'order-a',storeId:'matriz',itens:[{productId:'x',nome:'Nome histórico',quantity:1,preco:12,total:12}],total:16,frete:4};
  const f=await fixture({embedded:true,backend:async(name,auth)=>name==='customerAccount'?{customer:customer(auth.currentUser.uid)}:name==='customerOrderDetail'?{order:snapshot}:{orders:[snapshot]}});t.after(f.close);
  f.window.sessionStorage.setItem('checkoutState_v1','carrinho público');
  await f.api.openOrder({storeId:'matriz',orderId:'order-a'});
  assert.equal(f.el('order-detail').hidden,false);
  assert.match(f.el('order-detail-content').textContent,/Nome histórico/);
  assert.match(f.el('order-detail-content').textContent,/Comprar Novamente/);
  assert.deepEqual(f.calls.find(c=>c.name==='customerOrderDetail').data,{storeId:'matriz',orderId:'order-a'});
  assert.equal(f.window.sessionStorage.getItem('checkoutState_v1'),'carrinho público');
});

test('desmontar área Customer descarta resposta tardia e remove UI privada',async t=>{
  let finish;
  const f=await fixture({embedded:true,backend:async(name,auth)=>name==='customerAccount'?{customer:customer(auth.currentUser.uid)}:new Promise(resolve=>{finish=resolve;})});t.after(f.close);
  const pending=f.api.openAccount('orders');await tick();
  f.api.dispose();finish({orders:[{id:'private-a',storeId:'matriz',itens:[{nome:'Privado A'}]}]});await pending;
  assert.equal(f.api.getCustomer(),null);
  assert.equal(f.host.textContent,'');
  assert.equal(f.window.document.querySelector('dialog'),null);
});
