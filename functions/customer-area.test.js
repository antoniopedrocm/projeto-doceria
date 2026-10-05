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

async function fixture({initialUser = user(), sdk = {}, backend = async (name, auth) =>
  name === 'customerAccount' ? {customer: customer(auth.currentUser?.uid || 'a')} : {orders: []}} = {}) {
  const {isCustomerIdentity, createCustomerAreaNavigation} = await import('../crm/public/customer-area.mjs');
  const {createCustomerAuthState} = await import('../crm/public/customer-session.mjs');
  const {createCustomerProfileSecurity} = await import('../crm/public/customer-profile.mjs');
  const dom = new JSDOM('<button id="customer-account-button">Minha Conta</button><button id="continue-google-button">Google</button>', {url: 'https://example.test/cardapio-matriz?store=matriz'});
  const {window} = dom;
  window.HTMLDialogElement.prototype.showModal = function() {this.open = true;};
  window.HTMLDialogElement.prototype.close = function() {this.open = false;};
  const auth = {currentUser: initialUser};
  let listener;
  const calls = [], sessions = [], logouts = [], checkout = [];
  const context = vm.createContext({document: window.document, window, URL, console,
    auth, functions: {}, isCustomerUser: isCustomerIdentity, createCustomerAreaNavigation, createCustomerAuthState, createCustomerProfileSecurity,
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
  const source = fs.readFileSync(path.join(__dirname, '../crm/public/customer-account.js'), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '')
    .replace('export function installCustomerAccount', 'function installCustomerAccount')
    .replace(/import\.meta\.url/g, "'https://example.test/customer-account.js'");
  vm.runInContext(source, context);
  const api = context.installCustomerAccount({onSession: value => sessions.push(value),
    onLogout: () => logouts.push(true), onCustomer: value => checkout.push(value)});
  listener(initialUser); await api.ready;
  const dialog = window.document.querySelector('dialog');
  const el = name => dialog.querySelector(`[data-${name}]`);
  const navigate = route => dialog.querySelector(`[data-customer-route="${route}"]`).onclick({preventDefault() {}});
  return {api, auth, calls, sessions, logouts, checkout, window, dialog, el, navigate,
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
  assert.equal(f.el('orders-message').textContent, 'Nenhum pedido encontrado.');
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
