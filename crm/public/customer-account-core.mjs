import {createCustomerPhoneClaimView} from './customer-phone-claim.mjs';
import {customerAuthErrorMessage} from './customer-auth-errors.mjs';
import {createCustomerAuthState} from './customer-session.mjs';
import {isCustomerIdentity as isCustomerUser, createCustomerAreaNavigation} from './customer-area.mjs';
import {createCustomerProfileSecurity} from './customer-profile.mjs';
import {createCustomerOrderHistory} from './customer-orders-view.mjs?v=20261015-fcm-delete';
import {createCustomerReorderView} from './customer-reorder-view.mjs';
import {createStoredCartBridge} from './reorder-cart.mjs';

export function installCustomerAccount({onCustomer=()=>{}, onSession=()=>{}, onLogout=()=>{}, notify=()=>{}, createAccountButton=true, showCheckoutAddressAction=true,reorderCart=null,host=null,inlineLogin=false,onRoute=()=>{},onMenu=null,navigateToMenu=url=>window.location.assign(url),runtime}) {
  const {auth,functions,httpsCallable,GoogleAuthProvider,createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,signInWithEmailAndPassword,signInWithPopup,onAuthStateChanged,signOut,updateProfile,EmailAuthProvider,reauthenticateWithCredential,verifyBeforeUpdateEmail,updatePassword,reload,logout=()=>signOut(auth)}=runtime;
  let disposed=false;
  const closeAccount=()=>{if(host) onRoute('home');else dialog.close();};
  const showAccount=()=>{if(!host && !dialog.open) dialog.showModal();};
  const call = async (name, data = {}) => (await httpsCallable(functions, name)(data)).data;
  let current = null;
  let currentUid = null;
  let requestedRoute = 'profile';
  let checkoutIntent = false;
  let markReady;
  const ready = new Promise(resolve => {markReady=resolve;});
  const dialog = document.createElement(host?'section':'dialog');
  dialog.className = 'customer-area-dialog rounded-lg shadow-xl p-6';
  if (!document.querySelector('[data-customer-area-style]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet'; style.href = new URL('./customer-area.css?v=20261006-customer-reorder', import.meta.url).href;
    style.setAttribute('data-customer-area-style', ''); document.head.append(style);
  }
  dialog.setAttribute('aria-label', 'Minha Conta');
  dialog.innerHTML = `<form method="dialog" class="flex justify-between items-center"><h2 class="text-xl font-bold text-pink-600">Minha Conta</h2><button aria-label="Fechar minha conta">✕</button></form>
    <p data-message role="status" class="my-4 text-gray-700"></p>
    <section data-signed-out hidden class="space-y-3"><button type="button" data-account-google class="w-full border rounded p-3 font-bold"><span aria-hidden="true">G</span> Entrar com Google</button><button type="button" data-account-email class="w-full border rounded p-3 font-bold">✉ Entrar com e-mail</button></section>
    <section data-phone hidden><label class="block">Nome<input data-new-name autocomplete="name" maxlength="120" class="border rounded p-2 w-full"></label><label class="block mt-2">Celular com DDD<input data-number type="tel" autocomplete="tel" class="border rounded p-2 w-full" placeholder="(62) 99999-9999"></label>
    <p class="text-sm text-gray-600 my-2">Usaremos este número para contato sobre pedidos, entrega e WhatsApp. Não enviaremos código nesta etapa.</p>
    <button type="button" data-complete class="bg-pink-600 text-white rounded p-3 my-2">Salvar e continuar</button></section>
    <section data-area hidden>
    <nav aria-label="Área do Cliente" class="customer-area-nav">
      <button type="button" data-customer-route="home">Página Inicial</button>
      <button type="button" data-customer-route="orders">Meus Pedidos</button>
      <button type="button" data-customer-route="profile">Meu Perfil</button>
      <button type="button" data-area-logout>Sair</button>
    </nav>
    <section data-profile hidden aria-labelledby="customer-profile-heading"><div class="customer-page-heading"><span class="customer-eyebrow">SUA CONTA</span><h1 id="customer-profile-heading" data-profile-heading tabindex="-1">Minha Conta</h1><p>Gerencie seus dados pessoais e endereços.</p></div>
    <div class="customer-account-grid"><section class="customer-panel customer-profile-card"><div class="customer-panel-heading"><h2>Meu Perfil</h2><p>Seus dados para um atendimento com carinho.</p></div><div class="customer-fields"><label>Nome<input data-name autocomplete="name" maxlength="120" required></label><label>Telefone<input data-profile-phone type="tel" autocomplete="tel" required readonly></label><p data-phone-state class="customer-security-note"></p><label>Data de nascimento<input data-birthdate type="date" autocomplete="bday"></label></div><p data-created-state class="customer-muted"></p><button data-save type="button" class="customer-button customer-button-primary">Salvar alterações</button></section>
    <section class="customer-panel customer-addresses-panel"><div class="customer-section-heading"><div><h2>Meus Endereços</h2><p>Os lugares onde nossas delícias chegam até você.</p></div><button data-address-add type="button" class="customer-button customer-button-secondary">+ Novo endereço</button></div><ul data-addresses class="customer-address-list"></ul>
    <form data-address-form hidden class="space-y-2 mt-3"><h5 data-address-title class="font-bold">Adicionar endereço</h5>
      <label class="block">Apelido<input data-address-nickname required maxlength="60" autocomplete="off"></label>
      <label class="block">Endereço completo<input data-address-enderecoCompleto required maxlength="300" autocomplete="street-address"></label>
      <label class="block">CEP<input data-address-cep maxlength="9" autocomplete="postal-code"></label>
      <label class="block">Rua<input data-address-street maxlength="160" autocomplete="address-line1"></label>
      <label class="block">Número<input data-address-number maxlength="160"></label>
      <label><input data-address-semNumero type="checkbox"> Sem número</label>
      <label class="block">Bairro<input data-address-neighborhood maxlength="160"></label>
      <label class="block">Complemento<input data-address-complement maxlength="120" autocomplete="address-line2"></label>
      <label class="block">Referência<input data-address-referencia maxlength="160"></label>
      <div class="customer-profile-grid"><label>Latitude<input data-address-lat type="number" step="any" min="-90" max="90" required></label><label>Longitude<input data-address-lng type="number" step="any" min="-180" max="180" required></label></div>
      <label><input data-address-isDefault type="checkbox"> Endereço padrão</label>
      <button type="submit" class="border rounded p-2">Salvar endereço</button><button data-address-cancel type="button" class="underline">Cancelar</button>
    </form><button data-address type="button" class="customer-button customer-button-secondary">Usar endereço no pedido</button></section>
    <section class="customer-panel customer-security-card"><div class="customer-panel-heading"><h2>Segurança da Conta</h2><p>Informações de acesso e verificação.</p></div><p data-provider-state></p><p data-email-state class="customer-muted"></p><div class="customer-actions"><button data-verify-email type="button" class="customer-button customer-button-secondary" hidden>Reenviar verificação de e-mail</button><button data-refresh-email type="button" class="customer-button customer-button-secondary">Atualizar verificação</button></div>
    <section data-password-security hidden><form data-change-email class="space-y-2 mt-3"><label class="block">Novo e-mail<input data-new-email type="email" required autocomplete="email"></label><label class="block">Senha atual<input data-email-current-password type="password" required autocomplete="current-password"></label><button type="submit" class="border rounded p-2">Alterar e-mail</button></form>
    <form data-change-password class="space-y-2 mt-3"><label class="block">Senha atual<input data-current-password type="password" required autocomplete="current-password"></label><label class="block">Nova senha<input data-new-password type="password" minlength="6" required autocomplete="new-password"></label><label class="block">Confirmar nova senha<input data-confirm-password type="password" minlength="6" required autocomplete="new-password"></label><button type="submit" class="border rounded p-2">Alterar senha</button></form><button data-profile-reset type="button" class="underline">Esqueci minha senha</button></section>
    </section><section class="customer-panel customer-payment-info"><div class="customer-panel-heading"><h2>Formas de Pagamento</h2></div><p>Seus cartões são armazenados com segurança pela InfinitePay. Você poderá salvar, selecionar, adicionar ou remover cartões durante o pagamento.</p><p class="customer-security-note">Gerenciado pela InfinitePay</p></section></div></section>
    <section data-orders-panel hidden aria-labelledby="customer-orders-heading"><div class="customer-page-heading"><span class="customer-eyebrow">SEU HISTÓRICO</span><h1 id="customer-orders-heading" data-orders-heading tabindex="-1">Meus Pedidos</h1><p>Acompanhe seus pedidos e consulte seu histórico.</p></div>
    <section data-reorder-panel hidden aria-live="polite"></section><div data-orders-list><button data-history type="button" class="customer-button customer-button-secondary">Atualizar pedidos</button><p data-orders-message role="status" aria-live="polite" class="customer-order-message"></p><ul data-orders class="customer-orders-list"></ul><button data-orders-more type="button" class="customer-button customer-button-secondary" hidden>Carregar mais</button></div>
    <section data-order-detail hidden><button data-order-back type="button" class="customer-button customer-button-secondary">← Voltar para Meus Pedidos</button><h2 data-order-detail-heading tabindex="-1" class="customer-detail-title">Detalhe do pedido</h2><p data-order-detail-message role="status" aria-live="polite" class="customer-order-message"></p><div data-order-detail-content></div></section></section>
    </section>
    <button data-logout type="button" class="text-gray-600 underline mt-5" hidden>Sair</button>`;
  if(host){dialog.querySelector('form[method=dialog]').remove();host.append(dialog);}else document.body.append(dialog);

  const embeddedLogin=Boolean(host && inlineLogin);
  const emailDialog = document.createElement(embeddedLogin?'section':'dialog');
  emailDialog.className = 'rounded-lg shadow-xl p-6 w-full max-w-md';
  emailDialog.setAttribute('aria-label', 'Entrar com e-mail');
  emailDialog.innerHTML = `<form method="dialog" class="flex justify-between items-center"><h2 data-email-title class="text-xl font-bold text-pink-600">Entrar com e-mail</h2><button aria-label="Fechar">✕</button></form>
    <p data-email-message role="status" aria-live="polite" class="my-3 text-gray-700"></p>
    <form data-login-form class="space-y-3"><label class="block">E-mail<input data-login-email type="email" autocomplete="email" required class="border rounded p-2 w-full"></label><label class="block">Senha<input data-login-password type="password" autocomplete="current-password" required class="border rounded p-2 w-full"></label><button class="w-full bg-pink-600 text-white rounded p-3 font-bold">Entrar</button><button data-forgot type="button" class="text-pink-700 underline">Esqueci minha senha</button><button data-show-register type="button" class="block text-pink-700 underline">Criar conta</button></form>
    <form data-register-form class="space-y-3" hidden><label class="block">Nome<input data-register-name autocomplete="name" maxlength="120" required class="border rounded p-2 w-full"></label><label class="block">E-mail<input data-register-email type="email" autocomplete="email" required class="border rounded p-2 w-full"></label><label class="block">Celular com DDD<input data-register-phone type="tel" autocomplete="tel" required class="border rounded p-2 w-full"></label><label class="block">Senha<input data-register-password type="password" autocomplete="new-password" minlength="6" required class="border rounded p-2 w-full"></label><label class="block">Confirmar senha<input data-register-confirm type="password" autocomplete="new-password" minlength="6" required class="border rounded p-2 w-full"></label><button class="w-full bg-pink-600 text-white rounded p-3 font-bold">Criar conta</button><button data-show-login type="button" class="text-pink-700 underline">Já tenho uma conta</button></form>`;
  if(!embeddedLogin) document.body.append(emailDialog);

  const el = name => dialog.querySelector(`[data-${name}]`);
  const emailEl = name => emailDialog.querySelector(`[data-${name}]`);
  let loginDivider;
  if(embeddedLogin) {
    emailDialog.className='customer-inline-login';
    const heading=emailEl('email-title');
    emailDialog.prepend(heading);emailDialog.querySelector('form[method=dialog]').remove();
    heading.hidden=true;
    const form=emailEl('login-form'),submit=form.querySelector('button:not([type])');
    form.className='customer-login-form';emailEl('register-form').className='customer-register-form';
    form.insertBefore(emailEl('forgot'),submit);
    submit.textContent='Entrar com email';submit.className='customer-login-primary';
    emailEl('forgot').textContent='Esqueci a senha';
    emailEl('login-email').previousSibling.textContent='Email';
    emailEl('login-email').placeholder='seu@email.com';
    emailEl('login-password').placeholder='••••••••';
    loginDivider=document.createElement('div');loginDivider.className='customer-login-divider';loginDivider.textContent='ou';
    emailDialog.append(loginDivider);
    const googleButton=el('account-google');
    googleButton.innerHTML='<svg aria-hidden="true" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg><span>Entrar com Google</span>';
    emailDialog.append(googleButton,emailEl('show-register'));
    el('account-email').hidden=true;
    el('signed-out').prepend(emailDialog);
  }
  const closeEmail=()=>{if(embeddedLogin) emailDialog.hidden=true;else emailDialog.close();};
  const message = text => {el('message').textContent = text;if(host){el('message').className='customer-feedback';el('message').classList.toggle('is-loading',text.startsWith('Carregando'));}};
  const emailMessage = (text, isError=false) => {const target=emailEl('email-message');target.textContent=text;target.classList.toggle('text-red-600',isError);target.classList.toggle('text-gray-700',!isError);};
  const navigation = createCustomerAreaNavigation({
    getSession: () => ({user: auth.currentUser, customer: current, ownerUid: currentUid}),
    onChange: route => {
      onRoute(route);
      el('area').hidden = route === 'login';
      el('profile').hidden = route !== 'profile';
      el('orders-panel').hidden = route !== 'orders';
      dialog.querySelectorAll('[data-customer-route]').forEach(button => {
        if (button.dataset.customerRoute === route) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      });
      if (route === 'home') {if (dialog.open) closeAccount();}
      else if ((host || dialog.open) && ['profile', 'orders'].includes(route)) el(`${route}-heading`).focus();
    },
  });
  const security = createCustomerProfileSecurity({auth, isAllowed: () => navigation.isAllowed(),
    sdk: {EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail, updatePassword, sendEmailVerification, sendPasswordResetEmail}});
  let editingAddressId = null;
  let orderHistory;
  const clearPrivateView = () => {
    orderHistory?.clear();
    ['name', 'birthdate', 'new-name', 'number', 'profile-phone'].forEach(name => {el(name).value = '';});
    ['phone-state', 'email-state', 'orders-message', 'provider-state', 'created-state'].forEach(name => {el(name).textContent = '';});
    dialog.querySelectorAll('[data-profile] input').forEach(input => {input.value = '';if(input.type==='checkbox') input.checked=false;});
    editingAddressId=null;el('address-form').hidden=true;el('password-security').hidden=true;
    el('orders').replaceChildren(); el('addresses').replaceChildren();
    emailDialog.querySelectorAll('input').forEach(input => {input.value = '';});
  };
  const renderSignedOut = () => {currentUid=null;navigation.invalidate();clearPrivateView();el('signed-out').hidden=false;if(embeddedLogin) emailDialog.hidden=false;el('phone').hidden=true;el('logout').hidden=true;message(embeddedLogin?'':'Entre com Google ou e-mail para acessar sua conta.');};
  const clearPublishedSession = () => {current=null;checkoutIntent=false;renderSignedOut();onSession(null);onLogout();};
  const authState = createCustomerAuthState({onInvalidate:clearPublishedSession});
  const orderSession=()=>({...authState.observe(auth.currentUser?.uid),customerId:current?.id});
  const orderSessionCurrent=snapshot=>!disposed && authState.isCurrent(snapshot) && navigation.isAllowed() && navigation.getRoute()==='orders' && current?.id===snapshot.customerId;
  const reorder=createCustomerReorderView({panel:el('reorder-panel'),call,snapshot:orderSession,isCurrent:orderSessionCurrent,
    cart:reorderCart || createStoredCartBridge({storage:window.sessionStorage,navigate:navigateToMenu,getUid:()=>auth.currentUser?.uid}),
    onExpired:()=>authState.invalidate(),onCartOpen:()=>closeAccount()});
  orderHistory=createCustomerOrderHistory({panel:el('orders-panel'),call,
    onMenu,
    snapshot:orderSession,isCurrent:orderSessionCurrent,onReorder:reorder.start,onClear:reorder.clear,
    onExpired:()=>authState.invalidate()});
  const busy = (button, fn) => async event => {event?.preventDefault();button.disabled=true;try {await fn();} catch(e) {message(customerAuthErrorMessage(e));} finally {button.disabled=false;}};
  const phoneClaim=createCustomerPhoneClaimView({document,window,call,auth,onLinked:async()=>{await refresh();}});
  let claimUid=auth.currentUser?.uid || null;
  async function completeWithPhone(data){const result=await call('customerCompleteProfile',data);if(result.claimRequired){closeEmail();await phoneClaim.open({...result,phone:data.phone});return false;}return true;}
  const emailButtonBusy = (button, fn) => async event => {event?.preventDefault();button.disabled=true;try {await fn();} catch(e) {emailMessage(customerAuthErrorMessage(e),true);} finally {button.disabled=false;}};
  const emailBusy = (form, fn) => async event => {event.preventDefault();const button=form.querySelector('button:not([type])');button.disabled=true;try {await fn();} catch(e) {emailMessage(customerAuthErrorMessage(e),true);} finally {button.disabled=false;}};
  function showEmail(mode='login') {const registering=mode==='register';emailEl('login-form').hidden=registering;emailEl('register-form').hidden=!registering;emailEl('email-title').textContent=registering?'Criar conta':'Entrar com e-mail';emailMessage('');if(embeddedLogin){emailDialog.hidden=false;emailEl('email-title').hidden=!registering;el('account-google').hidden=registering;loginDivider.hidden=registering;emailEl('show-register').hidden=registering;}else if(!emailDialog.open) emailDialog.showModal();}
  async function refresh() {
    if(disposed) return;
    const user=auth.currentUser;
    if (!isCustomerUser(user)) {authState.observe(null);current=null;renderSignedOut();return;}
    const snapshot=authState.observe(user.uid);
    let data;
    try {data=await call('customerAccount');}
    catch (_) {
      if (authState.isCurrent(snapshot)) {authState.invalidate();current=null;renderSignedOut();}
      throw new Error('Não foi possível carregar sua conta. Tente novamente.');
    }
    if(disposed) return;
    const activeUser=auth.currentUser;
    if (!isCustomerUser(activeUser) || activeUser.uid!==snapshot.uid) {authState.observe(isCustomerUser(activeUser)?activeUser.uid:null);return;}
    if (!authState.isCurrent(snapshot)) return;
    const nextCustomer=data.customer || null;
    if (!nextCustomer) authState.invalidate();
    if (nextCustomer && !authState.publish(snapshot)) return;
    current=nextCustomer;currentUid=current ? snapshot.uid : null;navigation.navigate(current ? requestedRoute : 'login');el('signed-out').hidden=true;el('phone').hidden=!!current;el('logout').hidden=!!current;
    if (!current) {el('new-name').value=data.nome || auth.currentUser.displayName || '';message('Informe seu celular de contato para concluir seu cadastro.');return;}
    onSession(current);message(host?'':`Olá, ${current.nome}.`);el('name').value=current.nome;el('profile-phone').value=current.telefone || '';el('birthdate').value=current.aniversario || '';
    el('profile-phone').readOnly=true;el('phone-state').textContent='A troca do telefone exige um fluxo próprio de verificação para proteger seu cadastro.';
    el('created-state').textContent=current.createdAt ? `Conta criada em ${new Date(current.createdAt).toLocaleDateString('pt-BR')}` : '';
    el('email-state').textContent=current.email?`${current.email} — ${current.emailVerified?'Verificado':'Não verificado'}`:'E-mail não informado.';
    const passwordAccount=auth.currentUser.providerData.some(p=>p.providerId==='password') && !auth.currentUser.providerData.some(p=>p.providerId==='google.com');
    el('provider-state').textContent=passwordAccount ? 'Conta com e-mail e senha.' : 'Conta Google vinculada. Gerencie seu e-mail e senha no Google.';
    el('password-security').hidden=!passwordAccount;
    el('verify-email').hidden=!current.email || current.emailVerified || !passwordAccount;
    el('address').hidden=!showCheckoutAddressAction;renderAddresses();
    if(!checkoutIntent && navigation.getRoute()==='orders') await loadOrders();if(checkoutIntent){checkoutIntent=false;closeAccount();await onCustomer(current);}
  }
  async function googleSignIn(){if(!auth.currentUser?.providerData.some(p=>p.providerId==='google.com')){await signInWithPopup(auth,new GoogleAuthProvider());}showAccount();await refresh();}
  async function finishEmailAuth(){closeEmail();showAccount();await refresh();}
  const google=document.getElementById('continue-google-button');const googleHandler=google?busy(google,async()=>{checkoutIntent=true;await googleSignIn();}):null;if(google)google.addEventListener('click',googleHandler);
  const emailButton=document.getElementById('continue-email-button');const emailHandler=()=>{checkoutIntent=true;showEmail();};if(emailButton)emailButton.addEventListener('click',emailHandler);
  let accountEntry=document.getElementById('customer-account-button');
  const cartButton=document.getElementById('cart-button');
  if(createAccountButton && (accountEntry || cartButton)) {
    if(accountEntry?.tagName!=='A') {
      const link=document.createElement('a');
      link.id='customer-account-button';link.textContent='Minha Conta';
      link.className=accountEntry?.className || 'text-pink-700 border border-pink-200 rounded-lg px-3 py-2';
      if(accountEntry) accountEntry.replaceWith(link);else cartButton.before(link);
      accountEntry=link;
    }
    // Header entry is navigation. Auth/onboarding stay with the canonical gate.
    accountEntry.href='/area-cliente';
    accountEntry.removeAttribute('aria-haspopup');accountEntry.removeAttribute('aria-expanded');
  }
  // Embedded profile/history and checkout authentication still use this API.
  const openAccount=async(route='profile')=>{checkoutIntent=false;requestedRoute=route;showAccount();message('Carregando sua conta…');await refresh();};
  el('account-google').onclick=busy(el('account-google'),googleSignIn);el('account-email').onclick=()=>showEmail();
  el('complete').onclick=busy(el('complete'),async()=>{let digits=el('number').value.replace(/\D/g,'');if(digits.length<=11)digits='55'+digits;if(!/^55\d{10,11}$/.test(digits))throw new Error('Informe o celular com DDD.');if(await completeWithPhone({phone:'+'+digits,nome:el('new-name').value}))await refresh();});
  async function profileCall(name,data) {
    if(!navigation.isAllowed()) throw new Error('Entre novamente para acessar seu perfil.');
    const snapshot=authState.observe(auth.currentUser.uid);const customerId=current.id;
    await call(name,data);
    if(!authState.isCurrent(snapshot) || !navigation.isAllowed() || current.id!==customerId) return false;
    await refresh();return authState.isCurrent(snapshot) && navigation.isAllowed();
  }
  el('save').onclick=busy(el('save'),async()=>{if(await profileCall('customerUpdate',{nome:el('name').value,telefone:el('profile-phone').value,aniversario:el('birthdate').value})) message('Dados salvos.');});
  el('verify-email').onclick=busy(el('verify-email'),async()=>message(await security.verifyEmail()));
  el('profile-reset').onclick=busy(el('profile-reset'),async()=>message(await security.resetPassword()));
  el('refresh-email').onclick=busy(el('refresh-email'),async()=>{const user=auth.currentUser;if(!navigation.isAllowed()) return;await reload(user);if(auth.currentUser?.uid===user.uid && navigation.isAllowed()){await user.getIdToken(true);await refresh();}});
  function securityForm(formName, fn) {
    const form=el(formName);
    form.onsubmit=busy(form.querySelector('button'),async()=>{try {message(await fn());} finally {form.querySelectorAll('input[type="password"]').forEach(input=>{input.value='';});}});
  }
  securityForm('change-email',()=>security.changeEmail(el('new-email').value,el('email-current-password').value));
  securityForm('change-password',()=>security.changePassword(el('current-password').value,el('new-password').value,el('confirm-password').value));
  const addressFields=['nickname','enderecoCompleto','cep','street','number','semNumero','neighborhood','complement','referencia','lat','lng','isDefault'];
  function editAddress(address=null) {
    if(!navigation.isAllowed()) throw new Error('Entre novamente para acessar seu perfil.');
    editingAddressId=address?.id || null;el('address-title').textContent=address?'Editar endereço':'Adicionar endereço';
    for(const name of addressFields){const input=el(`address-${name}`);if(input.type==='checkbox') input.checked=address?.[name]===true;else input.value=address?.[name] ?? (name==='complement' ? address?.complemento : '') ?? '';}
    el('address-form').hidden=false;el('address-nickname').focus();
  }
  function renderAddresses() {
    el('addresses').replaceChildren();
    for(const [index,address] of (current.enderecos || []).entries()) {
      const item=document.createElement('li');item.className='customer-address-card';
      const heading=document.createElement('div');heading.className='customer-address-heading';
      const title=document.createElement('h3');title.textContent=address.nickname || address.nomeEndereco || `Endereço ${index+1}`;heading.append(title);
      if(address.isDefault){const badge=document.createElement('span');badge.className='customer-badge customer-badge-success';badge.textContent='Padrão';heading.append(badge);}item.append(heading);
      const lines=[address.street?[address.street,address.semNumero?'S/N':address.number].filter(Boolean).join(', '):address.enderecoCompleto || (typeof address==='string'?address:''),address.neighborhood,[address.city,address.state].filter(Boolean).join(' - '),address.cep?`CEP ${address.cep}`:''];
      for(const line of lines.filter(Boolean)){const text=document.createElement('p');text.textContent=line;item.append(text);}
      const actions=document.createElement('div');actions.className='customer-actions';item.append(actions);
      const action=(label,fn)=>{const button=document.createElement('button');button.type='button';button.className=`customer-button ${label==='Excluir'?'customer-button-danger':'customer-button-secondary'}`;button.textContent=label;button.onclick=busy(button,fn);actions.append(button);};
      action('Editar',()=>editAddress(address));
      action('Excluir',async()=>{if(await profileCall('customerDeleteAddress',{addressId:address.id})){el('address-form').hidden=true;editingAddressId=null;message('Endereço excluído.');}});
      if(!address.isDefault) action('Definir como padrão',async()=>{if(await profileCall('customerSetDefaultAddress',{addressId:address.id})) message('Endereço padrão atualizado.');});
      el('addresses').append(item);
    }
    if(!current.enderecos?.length) el('addresses').textContent='Você ainda não tem endereços salvos.';
  }
  el('address-add').onclick=()=>{if(navigation.isAllowed()) editAddress();};
  el('address-cancel').onclick=()=>{el('address-form').hidden=true;editingAddressId=null;};
  el('address-form').onsubmit=busy(el('address-form').querySelector('button[type="submit"]'),async()=>{
    if(!el('address-form').reportValidity()) return;
    const address=Object.fromEntries(addressFields.map(name=>{const input=el(`address-${name}`);return [name,input.type==='checkbox'?input.checked:input.value];}));
    address.complemento=address.complement;
    const name=editingAddressId?'customerUpdateAddress':'customerAddAddress';
    if(await profileCall(name,{addressId:editingAddressId,address})){el('address-form').hidden=true;editingAddressId=null;message('Endereço salvo.');}
  });
  el('address').onclick=()=>{if(current){closeAccount();onCustomer(current);}};
  async function loadOrders() {
    if (!navigation.isAllowed()) {navigation.invalidate();renderSignedOut();return;}
    await orderHistory.load();
  }
  dialog.querySelectorAll('[data-customer-route]').forEach(button => {
    button.onclick = busy(button, async () => {
      requestedRoute = button.dataset.customerRoute;
      const route = navigation.navigate(requestedRoute);
      if (route === 'login') {renderSignedOut();return;}
      if (route === 'orders') await loadOrders();
    });
  });
  el('logout').onclick=busy(el('logout'),async()=>{authState.observe(null);authState.invalidate();current=null;checkoutIntent=false;el('orders').replaceChildren();renderSignedOut();await logout();closeAccount();notify('Você saiu da sua conta.');});
  el('area-logout').onclick = el('logout').onclick;
  emailEl('show-register').onclick=()=>showEmail('register');emailEl('show-login').onclick=()=>showEmail('login');
  emailEl('forgot').onclick=emailButtonBusy(emailEl('forgot'),async()=>{const email=emailEl('login-email').value.trim();if(!email)throw new Error('Informe seu e-mail.');await sendPasswordResetEmail(auth,email);emailMessage('Enviamos as instruções para redefinir sua senha.');});
  emailEl('login-form').onsubmit=emailBusy(emailEl('login-form'),async()=>{await signInWithEmailAndPassword(auth,emailEl('login-email').value.trim(),emailEl('login-password').value);await finishEmailAuth();});
  emailEl('register-form').onsubmit=emailBusy(emailEl('register-form'),async()=>{const name=emailEl('register-name').value.trim();const phone=emailEl('register-phone').value;const password=emailEl('register-password').value;if(password!==emailEl('register-confirm').value)throw new Error('As senhas não conferem.');const credential=await createUserWithEmailAndPassword(auth,emailEl('register-email').value.trim(),password);await updateProfile(credential.user,{displayName:name});sendEmailVerification(credential.user).catch(()=>{});if(await completeWithPhone({nome:name,phone}))await finishEmailAuth();});
  if(embeddedLogin) showEmail();
  const unsubscribe=onAuthStateChanged(auth,user=>{if((user?.uid || null)!==claimUid){claimUid=user?.uid || null;phoneClaim.clear();}const customerUser=isCustomerUser(user);authState.observe(customerUser?user.uid:null);if(!customerUser){current=null;renderSignedOut();markReady();return;}refresh().catch(()=>{}).finally(markReady);});
  return {getCustomer:()=>current,openAccount,ready,
    openOrder:async({storeId,orderId})=>{await openAccount('orders');if(navigation.isAllowed()) await orderHistory.openDetail({storeId,id:orderId});},
    dispose:()=>{disposed=true;navigation.invalidate();authState.observe(null);if(typeof unsubscribe==='function')unsubscribe();authState.invalidate();orderHistory.clear();google?.removeEventListener('click',googleHandler);emailButton?.removeEventListener('click',emailHandler);phoneClaim.dispose();dialog.remove();emailDialog.remove();}};
}
