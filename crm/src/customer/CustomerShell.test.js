import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import CustomerShell from './CustomerShell';
import {CUSTOMER_LINKS,customerRoute,menuDestination} from './customerContext';
import {logoutCanonicalSession} from './customerRuntime';
jest.mock('../firebaseConfig',()=>({auth:{app:{name:'[DEFAULT]'}}}));
jest.mock('./customerRuntime',()=>({logoutCanonicalSession:jest.fn(async()=>{}),runtimeFor:jest.fn(a=>({auth:a})),loadCustomerController:jest.fn()}));
jest.mock('firebase/auth',()=>({signOut:jest.fn(async()=>{})}));
let host,root,controller,install,session;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;Object.defineProperty(window,'innerWidth',{configurable:true,writable:true,value:320});host=document.createElement('div');document.body.append(host);root=createRoot(host);window.history.replaceState(null,'','/area-cliente');sessionStorage.clear();session={app:{name:'[DEFAULT]'},currentUser:{uid:'a'}};controller={ready:Promise.resolve(),openAccount:jest.fn(async()=>{}),openOrder:jest.fn(async()=>{}),dispose:jest.fn()};install=jest.fn(()=>controller);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
// Direct ReactDOM rendering needs act; this helper does not use Testing Library.
// eslint-disable-next-line testing-library/no-unnecessary-act
const mount=(props={})=>act(async()=>root.render(<CustomerShell uid="a" sessionAuth={session} loadController={async()=>({installCustomerAccount:install})} {...props}/>));
async function click(label){const aria={'☰':'Abrir menu do cliente','Minha conta ▾':'Abrir menu da conta'}[label];await act(async()=>[...host.querySelectorAll('button')].find(b=>aria?b.getAttribute('aria-label')===aria:b.textContent===label).click());}
test('sidebar e menu superior têm apenas opções Customer, incluindo drawer mobile',async()=>{await mount();expect(CUSTOMER_LINKS.map(x=>x.label)).toEqual(['Página Inicial','Minha Conta','Meus Pedidos']);expect(host.textContent).not.toMatch(/Dashboard|Configurações|Financeiro|Produtos|Clientes/);await click('Minha conta ▾');expect(host.querySelector('[aria-label="Menu do usuário Customer"]')).not.toBeNull();await click('☰');expect(host.querySelector('aside').className).toBe('is-open');});
test('URL administrativa é substituída e nunca vira painel Customer',async()=>{window.history.replaceState(null,'','/configuracoes');await mount();expect(window.location.pathname).toBe('/area-cliente');expect(controller.openAccount).not.toHaveBeenCalled();});
test('perfil, histórico e detalhe reutilizam controlador aprovado sem tocar carrinho',async()=>{sessionStorage.setItem('checkoutState_v1','{"storeId":"ana-guimaraes-doceria-garavelo","cart":[{"id":"x"}]}');await mount();await click('Minha Conta');expect(window.location.pathname).toBe('/minha-conta');expect(controller.openAccount).toHaveBeenCalledWith('profile');await click('Meus Pedidos');expect(controller.openAccount).toHaveBeenCalledWith('orders');expect(sessionStorage.getItem('checkoutState_v1')).toContain('"id":"x"');});
test('rota de detalhe passa IDs ao mesmo controlador com ownership server-side',async()=>{window.history.replaceState(null,'','/meus-pedidos/order-a?store=ana-guimaraes-doceria-garavelo');await mount();expect(controller.openOrder).toHaveBeenCalledWith(expect.objectContaining({orderId:'order-a',storeId:'ana-guimaraes-doceria-garavelo'}));});
test('logout remove controlador e encerra ambas as sessões, sem apagar carrinho',async()=>{sessionStorage.setItem('checkoutState_v1','cart');await mount();await click('Sair');expect(controller.dispose).toHaveBeenCalled();expect(logoutCanonicalSession).toHaveBeenCalledTimes(1);expect(sessionStorage.getItem('checkoutState_v1')).toBe('cart');});
test('montagem atrasada é descartada ao trocar Customer A por B',async()=>{let finish;await mount({loadController:()=>new Promise(resolve=>{finish=resolve;})});const load=jest.fn(async()=>({installCustomerAccount:install}));await mount({uid:'b',sessionAuth:{app:{name:'[DEFAULT]'},currentUser:{uid:'b'}},loadController:load});await act(async()=>finish({installCustomerAccount:jest.fn(()=>{throw Error('stale');})}));expect(install).toHaveBeenCalledTimes(1);});
test('desempate de rotas recusa URLs arbitrárias e retorno respeita loja/sessão',()=>{expect(customerRoute('/financeiro').screen).toBe('home');expect(customerRoute('/meus-pedidos/id','?store=../bad').screen).toBe('home');sessionStorage.setItem('checkoutState_v1',JSON.stringify({storeId:'ana-guimaraes-doceria-garavelo'}));expect(menuDestination(sessionStorage,true)).toBe('/cardapio?store=ana-guimaraes-doceria-garavelo');});

test.each(['matriz','garavelo'])('origem %s sobrevive à saída, descarte privado e remontagem desautenticada',async store=>{
  const destination='/cardapio?store=ana-guimaraes-doceria-'+store;
  const assign=jest.fn(),location={pathname:'/area-cliente',search:'?returnTo='+encodeURIComponent(destination),origin:'http://localhost',assign};
  const navigation=jest.spyOn(window,'location','get').mockReturnValue(location);
  try {
    sessionStorage.setItem('checkoutState_v1',JSON.stringify({storeId:'outra-loja',cart:[{id:'private'}]}));
    await mount({onLogout:async()=>{sessionStorage.removeItem('checkoutState_v1');session.currentUser=null;}});
    await click('Sair');expect(sessionStorage.getItem('checkoutState_v1')).toBeNull();
    location.search='';
    // Native ReactDOM unmount is intentional, not a Testing Library render.
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async()=>root.render(null));await mount({uid:null});
    expect(host.querySelector('aside')).toBeNull();await click('Voltar ao Cardápio');expect(assign).toHaveBeenLastCalledWith(destination);
  } finally {navigation.mockRestore();}
});
test.each(['google.com','password'])('entrada/login %s e refresh conservam retorno público sem depender do Customer',async provider=>{
  const destination='/cardapio?store=ana-guimaraes-doceria-garavelo&channel=festas';
  const assign=jest.fn(),location={pathname:'/area-cliente',search:'?returnTo='+encodeURIComponent(destination),origin:'http://localhost',assign};
  const navigation=jest.spyOn(window,'location','get').mockReturnValue(location);
  try {
    session.currentUser=null;await mount({uid:null});
    session.currentUser={uid:'a',providerData:[{providerId:provider}]};await mount();
    location.search='';
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async()=>root.render(null));await mount();
    await click('Voltar ao Cardápio');expect(assign).toHaveBeenLastCalledWith(destination);
    expect(logoutCanonicalSession).not.toHaveBeenCalled();
  } finally {navigation.mockRestore();}
});
test('acesso direto sem origem retorna à home pública e não ao diretório genérico',async()=>{
  const assign=jest.fn(),navigation=jest.spyOn(window,'location','get').mockReturnValue({pathname:'/area-cliente',search:'',origin:'http://localhost',assign});
  try {session.currentUser=null;await mount({uid:null});await click('Voltar ao Cardápio');expect(assign).toHaveBeenCalledWith('/');}
  finally {navigation.mockRestore();}
});

test('erro tardio da rota anterior não altera a sessão Customer seguinte',async()=>{let reject;controller.openAccount.mockImplementation(()=>new Promise((_,no)=>{reject=no;}));await mount();await click('Meus Pedidos');const rejectA=reject;await mount({uid:'b',sessionAuth:{app:{name:'[DEFAULT]'},currentUser:{uid:'b'}}});await act(async()=>rejectA(Error('private-a')));expect(host.textContent).not.toContain('Não foi possível carregar esta página.');expect(host.textContent).not.toContain('private-a');});

test('dual-role gets CRM action in drawer and account menu; Customer-only never does',async()=>{const open=jest.fn();await mount({canOpenStaff:true,onStaffContext:open});await click('☰');expect(host.querySelector('aside').textContent).toContain('Ir para o CRM');await click('Minha conta ▾');expect(host.querySelector('[aria-label="Menu do usuário Customer"]').textContent).toContain('Ir para o CRM');await click('Ir para o CRM');expect(open).toHaveBeenCalledTimes(1);await mount({canOpenStaff:false});expect(host.textContent).not.toContain('Ir para o CRM');});

test('mobile hamburger toggles drawer with accurate aria state and controls',async()=>{
  await mount();const toggle=host.querySelector('[aria-label="Abrir menu do cliente"]');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(document.getElementById(toggle.getAttribute('aria-controls'))).toBe(host.querySelector('aside'));
  await click('☰');expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelector('aside')).toHaveProperty('className','is-open');
  await click('☰');expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector('aside')).toHaveProperty('className','');
  expect(host.querySelector('.customer-drawer-backdrop')).toBeNull();
});

test('outside click is intercepted by a separate backdrop without activating content behind it',async()=>{
  await mount();await click('☰');
  const backdrop=host.querySelector('.customer-drawer-backdrop');expect(backdrop).not.toBeNull();
  expect(backdrop.closest('main')).toBeNull();expect(backdrop.closest('aside')).toBeNull();
  await act(async()=>backdrop.click());
  expect(host.querySelector('aside').className).toBe('');
  expect(host.querySelector('.customer-drawer-backdrop')).toBeNull();
  expect(window.location.pathname).toBe('/area-cliente');
  expect(controller.openAccount).not.toHaveBeenCalled();expect(controller.openOrder).not.toHaveBeenCalled();
  expect(logoutCanonicalSession).not.toHaveBeenCalled();
});

test('clicking panel space keeps drawer open',async()=>{
  await mount();await click('☰');await act(async()=>host.querySelector('aside').click());
  expect(host.querySelector('aside').className).toBe('is-open');
});

test('Escape closes open drawer, restores toggle focus and is inert when closed',async()=>{
  await mount();await click('☰');
  await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',cancelable:true})));
  expect(host.querySelector('aside').className).toBe('');
  expect(host.querySelector('.customer-drawer-backdrop')).toBeNull();
  expect(document.activeElement).toBe(host.querySelector('[aria-label="Abrir menu do cliente"]'));
  await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));
  expect(window.location.pathname).toBe('/area-cliente');
  expect(host.querySelector('aside').className).toBe('');
});

test('selecting Customer page navigates and removes drawer and backdrop',async()=>{
  await mount();await click('☰');await click('Meus Pedidos');
  expect(window.location.pathname).toBe('/meus-pedidos');
  expect(controller.openAccount).toHaveBeenCalledWith('orders');
  expect(host.querySelector('aside').className).toBe('');
  expect(host.querySelector('.customer-drawer-backdrop')).toBeNull();
});

test('dual-role CRM action closes drawer without logout',async()=>{
  const staff=jest.fn();await mount({canOpenStaff:true,onStaffContext:staff});await click('☰');await click('Ir para o CRM');
  expect(staff).toHaveBeenCalledTimes(1);expect(host.querySelector('aside').className).toBe('');
  expect(host.querySelector('.customer-drawer-backdrop')).toBeNull();expect(logoutCanonicalSession).not.toHaveBeenCalled();
});

test('logout action closes the drawer while retaining the canonical logout contract',async()=>{
  await mount();await click('☰');await click('Sair');
  expect(host.querySelector('aside')).toBeNull();expect(host.querySelector('.customer-drawer-backdrop')).toBeNull();
  expect(logoutCanonicalSession).toHaveBeenCalledTimes(1);expect(controller.dispose).toHaveBeenCalled();
});

test.each(['/area-cliente','/minha-conta','/meus-pedidos'])('signed out %s has no private shell or indefinite loading',async path=>{
  session.currentUser=null;window.history.replaceState(null,'',path);await mount({uid:null});
  expect(host.querySelector('aside')).toBeNull();
  expect(host.textContent).toContain('Acesse sua conta');
  expect(install.mock.calls[0][0].inlineLogin).toBe(true);
  expect(host.textContent).not.toMatch(/Carregando sua conta|Meus Pedidos|Minha Conta|Sair/);
  expect(controller.openAccount).not.toHaveBeenCalled();expect(controller.openOrder).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe(path);
});

test('pending logout removes private actions immediately, deduplicates and reports failure without a spinner',async()=>{
  let fail;const out=jest.fn(()=>new Promise((_,reject)=>{fail=reject;}));
  await mount({onLogout:out});const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='Sair');
  await act(async()=>{button.click();button.click();});
  expect(out).toHaveBeenCalledTimes(1);expect(host.querySelector('aside')).toBeNull();
  expect(host.textContent).toContain('Saindo da sua conta');
  await act(async()=>fail(Error('offline')));
  expect(host.textContent).toContain('Tentar sair novamente');expect(host.textContent).not.toContain('Saindo da sua conta');
});

test('late controller import cannot install private data after logout starts',async()=>{
  let load,finish;const out=()=>new Promise(resolve=>{finish=resolve;});
  await mount({loadController:()=>new Promise(resolve=>{load=resolve;}),onLogout:out});
  await click('Sair');await act(async()=>load({installCustomerAccount:install}));
  expect(install).not.toHaveBeenCalled();await act(async()=>finish());
  expect(host.querySelector('aside')).toBeNull();expect(host.textContent).not.toContain('Carregando sua conta');
});

test('repeated open and close removes Escape and resize listeners, including unmount',async()=>{
  const add=jest.spyOn(window,'addEventListener'),remove=jest.spyOn(window,'removeEventListener');
  try {
    await mount();
    for(let i=0;i<3;i++){await click('☰');await click('☰');}
    for(const event of ['keydown','resize']) {
      const listeners=add.mock.calls.filter(([name])=>name===event).map(([,listener])=>listener);
      expect(listeners).toHaveLength(3);
      for(const listener of listeners) expect(remove.mock.calls.filter(([name,fn])=>name===event && fn===listener)).toHaveLength(1);
    }
    await click('☰');
    // Direct ReactDOM unmount must flush effect cleanup before assertions.
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async()=>root.render(null));
    for(const event of ['keydown','resize']) {
      const listeners=add.mock.calls.filter(([name])=>name===event).map(([,listener])=>listener);
      expect(listeners).toHaveLength(4);
      for(const listener of listeners) expect(remove.mock.calls.filter(([name,fn])=>name===event && fn===listener)).toHaveLength(1);
    }
  } finally {add.mockRestore();remove.mockRestore();}
});

test('Customer-only drawer never receives Staff action after outside or Escape dismissals',async()=>{
  await mount();await click('☰');expect(host.querySelector('aside').textContent).not.toContain('Ir para o CRM');
  await act(async()=>host.querySelector('.customer-drawer-backdrop').click());
  await click('☰');expect(host.textContent).not.toMatch(/Ir para o CRM|Dashboard|Configurações/);
  await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));
  expect(logoutCanonicalSession).not.toHaveBeenCalled();
});

test('desktop sidebar is retained without mobile backdrop or Escape subscription',async()=>{
  window.innerWidth=768;const add=jest.spyOn(window,'addEventListener');
  try {await mount();await click('☰');expect(host.querySelector('aside nav').textContent).toContain('Meus Pedidos');
    expect(host.querySelector('.customer-drawer-backdrop')).toBeNull();
    expect(host.querySelector('aside').className).toBe('');
    expect(add.mock.calls.filter(([name])=>name==='keydown')).toHaveLength(0);
    await click('Meus Pedidos');expect(controller.openAccount).toHaveBeenCalledWith('orders');
  } finally {add.mockRestore();}
});

test('resizing from mobile to desktop dismisses transient drawer without touching body scroll',async()=>{
  const overflow=document.body.style.overflow,position=document.body.style.position;
  await mount();await click('☰');window.innerWidth=768;
  await act(async()=>window.dispatchEvent(new Event('resize')));
  expect(host.querySelector('aside nav')).not.toBeNull();expect(host.querySelector('aside').className).toBe('');
  expect(host.querySelector('.customer-drawer-backdrop')).toBeNull();
  expect(document.body.style.overflow).toBe(overflow);expect(document.body.style.position).toBe(position);
});

test.each(['/area-cliente','/minha-conta','/meus-pedidos','/meus-pedidos/order-a?store=store-a'])('refresh keeps Customer route %s with the redesigned frame',async path=>{
  window.history.replaceState(null,'',path);await mount();
  await act(async()=>root.unmount());root=createRoot(host);await mount();
  expect(window.location.pathname+window.location.search).toBe(path);
  expect(host.querySelector('.customer-brand img').getAttribute('src')).toBe('/logotipo.png');
  expect(host.querySelector('a.customer-skip-link').getAttribute('href')).toBe('#customer-main');
});
test('account menu uses Customer identity and dismisses with Escape while restoring keyboard focus',async()=>{
  await mount();await act(async()=>install.mock.calls[0][0].onSession({nome:'Ana Oliveira',accountLinked:true}));
  expect(host.querySelector('.customer-avatar').textContent).toBe('AO');await click('Minha conta ▾');
  expect(host.querySelector('[aria-label="Menu do usuário Customer"]').textContent).toContain('Ana Oliveira');
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));
  expect(host.querySelector('[aria-label="Menu do usuário Customer"]')).toBeNull();
  expect(document.activeElement).toBe(host.querySelector('[aria-label="Abrir menu da conta"]'));
});
test('mobile drawer cycles keyboard focus without exposing Staff actions to Customer-only',async()=>{
  await mount();await click('☰');const toggle=host.querySelector('[aria-label="Abrir menu do cliente"]');
  const last=[...host.querySelectorAll('aside button')].at(-1);last.focus();
  await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',cancelable:true})));
  expect(document.activeElement).toBe(toggle);
  await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,cancelable:true})));
  expect(document.activeElement).toBe(last);expect(host.textContent).not.toContain('Ir para o CRM');
});
test('order detail keeps Meus Pedidos highlighted without changing the detail URL',async()=>{
  window.history.replaceState(null,'','/meus-pedidos/order-a?store=store-a');await mount();
  expect([...host.querySelectorAll('aside button')].find(button=>button.textContent==='Meus Pedidos').getAttribute('aria-current')).toBe('page');
  expect(window.location.pathname).toBe('/meus-pedidos/order-a');
});
test('account presentation scope exists only on Minha Conta and never changes controller identity or URL restoration',async()=>{
  await mount();expect(host.querySelector('.customer-self-account')).toBeNull();
  await click('Minha Conta');expect(host.querySelector('.customer-self-account')).not.toBeNull();
  expect(window.location.pathname).toBe('/minha-conta');const installed=install.mock.calls.length;
  await click('Meus Pedidos');expect(host.querySelector('.customer-self-account')).toBeNull();
  expect(install).toHaveBeenCalledTimes(installed);expect(logoutCanonicalSession).not.toHaveBeenCalled();
});
