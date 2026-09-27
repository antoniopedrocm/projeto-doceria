import {auth, functions, httpsCallable} from './firebaseClientConfig.js';
import {GoogleAuthProvider, createUserWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, onAuthStateChanged,
  signOut, updateProfile, setPersistence, browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

const isCustomerUser = user => !!user && !user.isAnonymous && user.providerData.some(provider =>
  provider.providerId === 'google.com' || provider.providerId === 'password');

export function installCustomerAccount({onCustomer=()=>{}, onSession=()=>{}, onLogout=()=>{}, notify=()=>{}, createAccountButton=true, showCheckoutAddressAction=true}) {
  const call = async (name, data = {}) => (await httpsCallable(functions, name)(data)).data;
  let current = null;
  let checkoutIntent = false;
  let markReady;
  const ready = new Promise(resolve => {markReady=resolve;});
  const dialog = document.createElement('dialog');
  dialog.className = 'rounded-lg shadow-xl p-6 w-full max-w-lg';
  dialog.setAttribute('aria-label', 'Minha Conta');
  dialog.innerHTML = `<form method="dialog" class="flex justify-between items-center"><h2 class="text-xl font-bold text-pink-600">Minha Conta</h2><button aria-label="Fechar minha conta">✕</button></form>
    <p data-message role="status" class="my-4 text-gray-700"></p>
    <section data-signed-out hidden class="space-y-3"><button type="button" data-account-google class="w-full border rounded p-3 font-bold"><span aria-hidden="true">G</span> Entrar com Google</button><button type="button" data-account-email class="w-full border rounded p-3 font-bold">✉ Entrar com e-mail</button></section>
    <section data-phone hidden><label class="block">Nome<input data-new-name autocomplete="name" maxlength="120" class="border rounded p-2 w-full"></label><label class="block mt-2">Celular com DDD<input data-number type="tel" autocomplete="tel" class="border rounded p-2 w-full" placeholder="(62) 99999-9999"></label>
    <p class="text-sm text-gray-600 my-2">Usaremos este número para contato sobre pedidos, entrega e WhatsApp. Não enviaremos código nesta etapa.</p>
    <button type="button" data-complete class="bg-pink-600 text-white rounded p-3 my-2">Salvar e continuar</button></section>
    <section data-profile hidden><label class="block">Meu nome<input data-name autocomplete="name" maxlength="120" class="border rounded p-2 w-full"></label><label class="block mt-2">Data de nascimento<input data-birthdate type="date" autocomplete="bday" class="border rounded p-2 w-full"></label><p data-phone-state class="text-sm text-gray-700 mt-2"></p><button data-save type="button" class="border rounded p-2 my-2">Salvar dados</button>
    <h3 class="font-bold mt-4">Segurança da Conta</h3><p data-email-state class="text-sm text-gray-700"></p><button data-verify-email type="button" class="text-pink-700 underline" hidden>Reenviar verificação de e-mail</button>
    <h3 class="font-bold mt-4">Meus Endereços</h3><ul data-addresses class="space-y-2 my-2"></ul><button data-address type="button" class="text-pink-700 underline">Gerenciar endereços / continuar pedido</button>
    <h3 class="font-bold mt-4">Meus Pedidos</h3><button data-history type="button" class="underline">Carregar pedidos recentes</button><ul data-orders class="space-y-3 my-2"></ul>
    <h3 class="font-bold mt-4">Formas de Pagamento</h3><p>Pix e cartão são informados no checkout seguro da InfinitePay. A Ana Guimarães não armazena os dados completos do seu cartão.</p></section>
    <button data-logout type="button" class="text-gray-600 underline mt-5" hidden>Sair</button>`;
  document.body.append(dialog);

  const emailDialog = document.createElement('dialog');
  emailDialog.className = 'rounded-lg shadow-xl p-6 w-full max-w-md';
  emailDialog.setAttribute('aria-label', 'Entrar com e-mail');
  emailDialog.innerHTML = `<form method="dialog" class="flex justify-between items-center"><h2 data-email-title class="text-xl font-bold text-pink-600">Entrar com e-mail</h2><button aria-label="Fechar">✕</button></form>
    <p data-email-message role="status" class="my-3 text-gray-700"></p>
    <form data-login-form class="space-y-3"><label class="block">E-mail<input data-login-email type="email" autocomplete="email" required class="border rounded p-2 w-full"></label><label class="block">Senha<input data-login-password type="password" autocomplete="current-password" required class="border rounded p-2 w-full"></label><button class="w-full bg-pink-600 text-white rounded p-3 font-bold">Entrar</button><button data-forgot type="button" class="text-pink-700 underline">Esqueci minha senha</button><button data-show-register type="button" class="block text-pink-700 underline">Criar conta</button></form>
    <form data-register-form class="space-y-3" hidden><label class="block">Nome<input data-register-name autocomplete="name" maxlength="120" required class="border rounded p-2 w-full"></label><label class="block">E-mail<input data-register-email type="email" autocomplete="email" required class="border rounded p-2 w-full"></label><label class="block">Celular com DDD<input data-register-phone type="tel" autocomplete="tel" required class="border rounded p-2 w-full"></label><label class="block">Senha<input data-register-password type="password" autocomplete="new-password" minlength="6" required class="border rounded p-2 w-full"></label><label class="block">Confirmar senha<input data-register-confirm type="password" autocomplete="new-password" minlength="6" required class="border rounded p-2 w-full"></label><button class="w-full bg-pink-600 text-white rounded p-3 font-bold">Criar conta</button><button data-show-login type="button" class="text-pink-700 underline">Já tenho uma conta</button></form>`;
  document.body.append(emailDialog);

  const el = name => dialog.querySelector(`[data-${name}]`);
  const emailEl = name => emailDialog.querySelector(`[data-${name}]`);
  const message = text => {el('message').textContent = text;};
  const emailMessage = text => {emailEl('email-message').textContent = text;};
  const busy = (button, fn) => async event => {event?.preventDefault();button.disabled=true;try {await fn();} catch(e) {message(e.message || 'Não foi possível concluir. Tente novamente.');} finally {button.disabled=false;}};
  const emailButtonBusy = (button, fn) => async event => {event?.preventDefault();button.disabled=true;try {await fn();} catch(e) {emailMessage(e.message || 'Não foi possível concluir. Tente novamente.');} finally {button.disabled=false;}};
  const emailBusy = (form, fn) => async event => {event.preventDefault();const button=form.querySelector('button:not([type])');button.disabled=true;try {await fn();} catch(e) {emailMessage(e.message || 'Não foi possível concluir. Tente novamente.');} finally {button.disabled=false;}};
  const ensurePersistence = () => setPersistence(auth,browserLocalPersistence);
  function showEmail(mode='login') {const registering=mode==='register';emailEl('login-form').hidden=registering;emailEl('register-form').hidden=!registering;emailEl('email-title').textContent=registering?'Criar conta':'Entrar com e-mail';emailMessage('');if(!emailDialog.open) emailDialog.showModal();}
  async function refresh() {
    if (!isCustomerUser(auth.currentUser)) {current=null;el('signed-out').hidden=false;el('phone').hidden=true;el('profile').hidden=true;el('logout').hidden=true;message('Entre com Google ou e-mail para acessar sua conta.');return;}
    const data=await call('customerAccount');current=data.customer || null;el('signed-out').hidden=true;el('phone').hidden=!!current;el('profile').hidden=!current;el('logout').hidden=false;
    if (!current) {el('new-name').value=data.nome || auth.currentUser.displayName || '';message('Informe seu celular de contato para concluir seu cadastro.');return;}
    onSession(current);message(`Olá, ${current.nome}.`);el('name').value=current.nome;el('birthdate').value=current.aniversario || '';el('phone-state').textContent=`Telefone de contato: ${current.telefone || 'não informado'} (não verificado)`;el('email-state').textContent=current.email?`${current.email} — ${current.emailVerified?'e-mail verificado':'e-mail ainda não verificado'}`:'Conta Google ativa.';el('verify-email').hidden=!current.email || current.emailVerified || !auth.currentUser.providerData.some(p=>p.providerId==='password');el('address').hidden=!showCheckoutAddressAction;el('addresses').replaceChildren();
    current.enderecos.forEach((address,index)=>{const item=document.createElement('li');item.className='flex items-start justify-between gap-3 border rounded p-2';const text=document.createElement('span');text.textContent=`${address.nickname || 'Endereço'}: ${address.enderecoCompleto || address}`;const remove=document.createElement('button');remove.type='button';remove.className='text-red-600 underline';remove.textContent='Excluir';remove.onclick=busy(remove,async()=>{const result=await call('customerDeleteAddress',{index,expectedAddress:typeof address==='string'?address:address.enderecoCompleto});current=result.customer;await refresh();message('Endereço excluído.');});item.append(text,remove);el('addresses').append(item);});if(!current.enderecos.length)el('addresses').textContent='Você ainda não tem endereços salvos.';if(checkoutIntent){checkoutIntent=false;dialog.close();onCustomer(current);}
  }
  async function googleSignIn(){if(!auth.currentUser?.providerData.some(p=>p.providerId==='google.com')){await ensurePersistence();await signInWithPopup(auth,new GoogleAuthProvider());}if(!dialog.open)dialog.showModal();await refresh();}
  async function finishEmailAuth(){emailDialog.close();if(!dialog.open)dialog.showModal();await refresh();}
  const google=document.getElementById('continue-google-button');if(google)google.addEventListener('click',busy(google,async()=>{checkoutIntent=true;await googleSignIn();}));
  const emailButton=document.getElementById('continue-email-button');if(emailButton)emailButton.addEventListener('click',()=>{checkoutIntent=true;showEmail();});
  let accountButton=document.getElementById('customer-account-button');const cartButton=document.getElementById('cart-button');if(!accountButton && createAccountButton && cartButton){accountButton=document.createElement('button');accountButton.type='button';accountButton.textContent='Minha Conta';accountButton.className='text-pink-700 border border-pink-200 rounded-lg px-3 py-2';cartButton.before(accountButton);}const openAccount=async()=>{checkoutIntent=false;if(!dialog.open)dialog.showModal();await refresh();};if(accountButton)accountButton.addEventListener('click',busy(accountButton,openAccount));
  el('account-google').onclick=busy(el('account-google'),googleSignIn);el('account-email').onclick=()=>showEmail();
  el('complete').onclick=busy(el('complete'),async()=>{let digits=el('number').value.replace(/\D/g,'');if(digits.length<=11)digits='55'+digits;if(!/^55\d{10,11}$/.test(digits))throw new Error('Informe o celular com DDD.');await call('customerCompleteProfile',{phone:'+'+digits,nome:el('new-name').value});await refresh();});
  el('save').onclick=busy(el('save'),async()=>{await call('customerUpdate',{nome:el('name').value,aniversario:el('birthdate').value});await refresh();message('Dados salvos.');});
  el('verify-email').onclick=busy(el('verify-email'),async()=>{await sendEmailVerification(auth.currentUser);message('E-mail de verificação enviado.');});
  el('address').onclick=()=>{if(current){dialog.close();onCustomer(current);}};
  el('history').onclick=busy(el('history'),async()=>{const data=await call('customerOrders');el('orders').replaceChildren();for(const o of data.orders){const item=document.createElement('li');item.className='border rounded p-2';const date=o.createdAt?new Date(o.createdAt).toLocaleDateString('pt-BR'):'data indisponível';const items=o.itens.map(i=>`${i.quantity}× ${i.nome}`).join(', ');item.textContent=`${o.lojaId || 'Loja'} • ${date} • ${Number(o.total || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} • ${o.status || 'Sem status'}${o.payment_status?' / '+o.payment_status:''}${o.formaPagamento?' • '+o.formaPagamento:''}${items?' — '+items:''}`;el('orders').append(item);}if(!data.orders.length)el('orders').textContent='Nenhum pedido encontrado.';});
  el('logout').onclick=busy(el('logout'),async()=>{await signOut(auth);current=null;checkoutIntent=false;el('orders').replaceChildren();dialog.close();onLogout();notify('Você saiu da sua conta.');});
  emailEl('show-register').onclick=()=>showEmail('register');emailEl('show-login').onclick=()=>showEmail('login');
  emailEl('forgot').onclick=emailButtonBusy(emailEl('forgot'),async()=>{const email=emailEl('login-email').value.trim();if(!email)throw new Error('Informe seu e-mail.');await sendPasswordResetEmail(auth,email);emailMessage('Enviamos as instruções para redefinir sua senha.');});
  emailEl('login-form').onsubmit=emailBusy(emailEl('login-form'),async()=>{await ensurePersistence();await signInWithEmailAndPassword(auth,emailEl('login-email').value.trim(),emailEl('login-password').value);await finishEmailAuth();});
  emailEl('register-form').onsubmit=emailBusy(emailEl('register-form'),async()=>{const name=emailEl('register-name').value.trim();const phone=emailEl('register-phone').value;const password=emailEl('register-password').value;if(password!==emailEl('register-confirm').value)throw new Error('As senhas não conferem.');await ensurePersistence();const credential=await createUserWithEmailAndPassword(auth,emailEl('register-email').value.trim(),password);await updateProfile(credential.user,{displayName:name});sendEmailVerification(credential.user).catch(()=>{});await call('customerCompleteProfile',{nome:name,phone});await finishEmailAuth();});
  onAuthStateChanged(auth,user=>{if(!isCustomerUser(user)){current=null;markReady();return;}refresh().catch(()=>{}).finally(markReady);});
  return {getCustomer:()=>current,openAccount,ready};
}
