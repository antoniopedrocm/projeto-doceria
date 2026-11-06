import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ApplicationGate from './ApplicationGate';
import {auth} from '../firebaseConfig';
import {onIdTokenChanged} from 'firebase/auth';
import {loadCustomerController,logoutCanonicalSession,prepareCanonicalSession} from './customerRuntime';
jest.mock('../firebaseConfig',()=>({auth:{app:{name:'[DEFAULT]'},currentUser:null}}));
jest.mock('firebase/auth',()=>({onIdTokenChanged:jest.fn()}));
jest.mock('./customerRuntime',()=>({legacyAuth:{currentUser:null},runtimeFor:()=>({}),loadCustomerController:jest.fn(),prepareCanonicalSession:jest.fn(async()=>'READY'),syncSessionCart:jest.fn(async()=>{}),logoutCanonicalSession:jest.fn()}));
let host,root,observers,controllers;
const caps=async user=>({uid:user.uid,isCustomer:true,isStaff:true,customerState:'CUSTOMER_RESOLVED',staff:{role:'dono'}});
const staff=()=> <div>Staff shell</div>;
beforeEach(()=>{
  sessionStorage.clear();
  global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);observers=new Set();controllers=[];
  auth.currentUser={uid:'fixture-customer',providerData:[{providerId:'google.com'}]};
  prepareCanonicalSession.mockResolvedValue('READY');
  onIdTokenChanged.mockImplementation((session,fn)=>{if(session===auth)observers.add(fn);return()=>observers.delete(fn);});
  loadCustomerController.mockResolvedValue({installCustomerAccount:options=>{
    const node=document.createElement('section');options.host.append(node);
    if(auth.currentUser){node.textContent='Private fixture profile';options.onSession({nome:'Customer fixture',accountLinked:true});}
    else {node.innerHTML='<button>Entrar com Google</button><button>Entrar com e-mail</button>';}
    const controller={ready:Promise.resolve(),openAccount:jest.fn(async()=>{}),openOrder:jest.fn(async()=>{}),dispose:jest.fn(()=>node.remove())};controllers.push(controller);return controller;
  }});
  logoutCanonicalSession.mockImplementation(async()=>{auth.currentUser=null;for(const fn of observers)fn(null);});
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
// This integration uses the real gate and shell; Firebase/controller IO are boundaries.
// eslint-disable-next-line testing-library/no-unnecessary-act
const mount=(resolveCapabilities=caps)=>act(async()=>root.render(<ApplicationGate StaffApplication={staff} resolveCapabilities={resolveCapabilities}/>));
async function observe(){await act(async()=>{for(const fn of observers)fn(auth.currentUser);});}
async function clickCustomerButton(label){await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent===label).click());}
test.each(['/area-cliente','/minha-conta','/meus-pedidos'])('real gate + shell: logout %s, refresh and browser Back never restore private UI',async path=>{
  window.history.replaceState(null,'',path);await mount();await observe();
  expect(host.querySelector('aside')).not.toBeNull();expect(host.textContent).toContain('Private fixture profile');
  prepareCanonicalSession.mockImplementation(()=>new Promise(()=>{}));
  await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Sair').click());
  expect(auth.currentUser).toBeNull();expect(window.location.pathname).toBe('/area-cliente');
  expect(host.querySelector('aside')).toBeNull();expect(host.textContent).not.toMatch(/Private fixture|Carregando|Meus Pedidos|Ir para o CRM|Sair/);
  expect(host.textContent).toContain('Entrar com Google');expect(host.textContent).toContain('Entrar com e-mail');
  expect(controllers[0].dispose).toHaveBeenCalled();
  window.history.replaceState(null,'',path);await act(async()=>window.dispatchEvent(new PopStateEvent('popstate')));
  expect(host.textContent).not.toMatch(/Private fixture|Carregando/);
  await act(async()=>root.unmount());root=createRoot(host);await mount();await observe();
  expect(host.querySelector('aside')).toBeNull();expect(host.textContent).toContain('Entrar com Google');
  expect(host.textContent).not.toMatch(/Private fixture|Carregando/);
});

test.each([['password','matriz'],['password','garavelo'],['google.com','matriz'],['google.com','garavelo']])('Customer-only %s/%s conserva origem por perfil, pedidos, refresh e logout/login com gate e shell reais',async(provider,store)=>{
  const customerOnly=async user=>({uid:user.uid,isCustomer:true,isStaff:false,customerState:'CUSTOMER_RESOLVED'});
  const identity={uid:'fixture-customer',providerData:[{providerId:provider}]},destination='/cardapio-'+store;
  auth.currentUser=identity;window.history.replaceState(null,'','/area-cliente?returnTo='+encodeURIComponent(destination));
  await mount(customerOnly);await observe();expect(host.textContent).not.toContain('Staff shell');
  for(const label of ['Minha Conta','Meus Pedidos']){
    await clickCustomerButton(label);
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe(destination);
  }
  sessionStorage.clear();
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async()=>{root.unmount();root=createRoot(host);});await mount(customerOnly);await observe();
  expect(window.location.pathname).toBe('/meus-pedidos');
  await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Sair').click());
  expect(auth.currentUser).toBeNull();expect(host.querySelector('aside')).toBeNull();
  expect(new URLSearchParams(window.location.search).get('returnTo')).toBe(destination);
  sessionStorage.clear();auth.currentUser=identity;await observe();expect(host.textContent).not.toContain('Staff shell');
  const assign=jest.fn(),navigation=jest.spyOn(window,'location','get').mockReturnValue({pathname:window.location.pathname,search:window.location.search,origin:window.location.origin,assign});
  try {await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Voltar ao Cardápio').click());expect(assign).toHaveBeenCalledWith(destination);}
  finally {navigation.mockRestore();}
});
