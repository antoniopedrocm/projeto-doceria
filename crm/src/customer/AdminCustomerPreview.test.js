import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import AdminCustomerPreview,{createAdminPreviewProvider} from './AdminCustomerPreview';
import {canPreviewCustomer,previewTarget} from './adminPreviewAccess';
let host,root,api,session,exit,reader,loadOrders;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);
  window.history.replaceState(null,'','/admin/customer-preview/alias');window.innerWidth=390;
  session={currentUser:{uid:'admin',getIdToken:jest.fn(async()=>'admin-fixture-token')}};exit=jest.fn();
  api={start:jest.fn(async()=>({customer:{id:'canonical',nome:'Cliente'}})),profile:jest.fn(async()=>({customer:{id:'canonical',nome:'Cliente',telefone:'fixture'}})),
    addresses:jest.fn(async()=>({addresses:[{id:'a',nomeEndereco:'Casa da minha Mãe',enderecoCompleto:'Endereço fixture',isDefault:true}]})),current:()=>true,call:jest.fn(),end:jest.fn(async()=>{})};
  reader={load:jest.fn(),clear:jest.fn()};loadOrders=jest.fn(async()=>({createCustomerOrderHistory:jest.fn(options=>{expect(options.onReorder).toBeNull();return reader;})}));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
// eslint-disable-next-line testing-library/no-unnecessary-act
const mount=()=>act(async()=>root.render(<AdminCustomerPreview sessionAuth={session} uid="admin" target="alias" onExit={exit} makeProvider={()=>api} loadOrders={loadOrders}/>));
const click=label=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===label).click());
test('home reutiliza frame, banner permanente e navegação; sem menu, logout Customer ou checkout executável',async()=>{
  await mount();expect(host.textContent).toContain('Olá, Cliente!');expect(host.textContent).toContain('Somente leitura. Nenhuma ação será realizada em nome do cliente.');
  expect(document.title).toContain('Visualizando como Cliente');expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Ir ao Cardápio').disabled).toBe(true);
  expect(host.textContent).not.toMatch(/Comprar Novamente|Ir para o CRM/);expect(host.querySelector('input')).toBeNull();expect(session.currentUser.uid).toBe('admin');
  await click('Minha Conta');expect(window.location.pathname).toBe('/admin/customer-preview/alias/profile');expect(host.textContent).toContain('Casa da minha Mãe');expect(host.textContent).toContain('Padrão');
  expect([...host.querySelectorAll('button')].find(b=>b.textContent.startsWith('Salvar dados')).disabled).toBe(true);
  await click('Meus Pedidos');expect(reader.load).toHaveBeenCalledTimes(1);expect(host.querySelector('[aria-label="Visualização administrativa"]')).not.toBeNull();
  await click('Sair da visualização');expect(api.end).toHaveBeenCalled();expect(exit).toHaveBeenCalled();expect(session.currentUser.uid).toBe('admin');
});
test('refresh em perfil reautoriza o alvo; drawer mobile fecha sem alterar sessão/carrinho',async()=>{
  sessionStorage.setItem('checkoutState_v1','preserved');window.history.replaceState(null,'','/admin/customer-preview/alias/profile');await mount();
  expect(api.start).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('Meu Perfil');await click('☰');expect(host.querySelector('aside').className).toBe('is-open');
  await act(async()=>host.querySelector('.customer-drawer-backdrop').click());expect(host.querySelector('aside').className).toBe('');expect(sessionStorage.getItem('checkoutState_v1')).toBe('preserved');
});
test('capability negada não renderiza dados privados; nenhuma instância Customer auth é criada',async()=>{
  api.start.mockRejectedValue(Error('denied'));await mount();expect(host.querySelector('[role="alert"]')).not.toBeNull();expect(api.profile).not.toHaveBeenCalled();expect(api.addresses).not.toHaveBeenCalled();expect(host.textContent).not.toContain('Endereço fixture');
});
test('provider envia UID/token do admin e token opaco somente às rotas admin; mutações não têm dispatch',async()=>{
  const fetcher=jest.fn(async url=>({ok:true,json:async()=>url.endsWith('/sessions')?{session:'opaque'}:{customer:{nome:'Cliente'}}}));
  const provider=createAdminPreviewProvider({sessionAuth:session,uid:'admin',target:'alias',fetcher});await provider.start();await provider.profile();
  expect(fetcher.mock.calls[0][1].body).toBe(JSON.stringify({targetCustomerId:'alias'}));expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer admin-fixture-token');
  expect(fetcher.mock.calls[1][1].headers['X-Customer-Preview']).toBe('opaque');
  for(const name of ['customerUpdate','customerAddAddress','customerReorderPreview','createPayment','sendSms'])await expect(provider.call(name,{})).rejects.toHaveProperty('code','permission-denied');
  expect(fetcher).toHaveBeenCalledTimes(2);session.currentUser={uid:'other'};await expect(provider.profile()).rejects.toHaveProperty('code','unauthenticated');
});
test('rota administrativa e capability não são inferidas de permissões genéricas ou query string',()=>{
  expect(previewTarget('/area-cliente?preview=canonical')).toBeNull();expect(previewTarget('/admin/customer-preview/alias/orders')).toBe('alias');
  expect(canPreviewCustomer('gerente',{clientes:true},null)).toBe(false);expect(canPreviewCustomer('atendente',{clientes:true},{clientes:{view_customer_as_readonly:true}})).toBe(false);
  expect(canPreviewCustomer('dono',{clientes:true},null)).toBe(true);expect(canPreviewCustomer('dono',{clientes:true},{clientes:{view_customer_as_readonly:false}})).toBe(false);
});
test('start atrasado após saída encerra sessão criada uma única vez sem renderizar Customer',async()=>{
  let finish;const fetcher=jest.fn(url=>url.endsWith('/sessions')?new Promise(resolve=>{finish=()=>resolve({ok:true,json:async()=>({session:'opaque'})});}):Promise.resolve({ok:true,json:async()=>({ended:true})}));
  const provider=createAdminPreviewProvider({sessionAuth:session,uid:'admin',target:'alias',fetcher});const started=provider.start();await Promise.resolve();await Promise.resolve();
  const ended=provider.end();finish();await started;await ended;await provider.end();expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[1][0]).toMatch(/\/end$/);expect(provider.current()).toBe(false);
});
test('falha ao encerrar mantém aviso e permite tentar novamente sem logout',async()=>{
  api.end.mockRejectedValueOnce(Error('network'));await mount();await click('Sair da visualização');expect(exit).not.toHaveBeenCalled();expect(host.textContent).toContain('Não foi possível encerrar a visualização.');
  await click('Sair da visualização');expect(exit).toHaveBeenCalledTimes(1);expect(session.currentUser.uid).toBe('admin');
});
