import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ApplicationGate from './ApplicationGate';
import {auth} from '../firebaseConfig';
import {legacyAuth,prepareCanonicalSession,logoutCanonicalSession} from './customerRuntime';
import {onIdTokenChanged} from 'firebase/auth';
jest.mock('../firebaseConfig',()=>({auth:{currentUser:null}}));
jest.mock('./customerRuntime',()=>({legacyAuth:{currentUser:null},prepareCanonicalSession:jest.fn(async()=> 'READY'),syncSessionCart:jest.fn(async()=>{}),logoutCanonicalSession:jest.fn(async()=>{})}));
jest.mock('firebase/auth',()=>({onIdTokenChanged:jest.fn()}));
jest.mock('./CustomerShell',()=>({__esModule:true,default:props=><div>Customer:{props.uid||'login'}{props.canOpenStaff && <button onClick={props.onStaffContext}>Ir para o CRM</button>}<button onClick={props.onLogout}>Sair Customer</button></div>}));
const identity=uid=>({uid,providerData:[{providerId:'google.com'}]});
const caps=(uid='a',isStaff=true,isCustomer=true)=>({uid,isStaff,isCustomer,staff:isStaff?{role:'dono'}:null,customer:isCustomer?{customerId:'own'}:null,customerState:isCustomer?'CUSTOMER_RESOLVED':'NEEDS_PHONE'});
let host,root,listeners,resolver,staff;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);listeners=new Map();
  resolver=jest.fn(async u=>caps(u.uid));
  staff=jest.fn(props=><div>{props.staffUid?'CRM:'+props.staffUid:'Login único'}{props.canOpenCustomer && <button onClick={props.onCustomerContext}>Área do Cliente</button>}<button onClick={props.onLogout}>Sair Staff</button></div>);
  auth.currentUser=null;legacyAuth.currentUser=null;window.history.replaceState(null,'','/');sessionStorage.clear();
  prepareCanonicalSession.mockResolvedValue('READY');logoutCanonicalSession.mockImplementation(async()=>{auth.currentUser=null;for(const fn of listeners.get(auth)||[])fn(null);});
  onIdTokenChanged.mockImplementation((a,fn)=>{const callbacks=listeners.get(a)||new Set();callbacks.add(fn);listeners.set(a,callbacks);return ()=>callbacks.delete(fn);});
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
// eslint-disable-next-line testing-library/no-unnecessary-act
const mount=()=>act(async()=>root.render(<ApplicationGate StaffApplication={staff} resolveCapabilities={resolver}/>));
async function emit(u){auth.currentUser=u;await act(async()=>{for(const fn of listeners.get(auth)||[])fn(u);});}
async function click(label){await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===label).click());}
test('dual-role enters CRM and switches both ways with same Auth and fresh resolution',async()=>{
  const cart=JSON.stringify({storeId:'loja-futura-teste',reorderOwnerUid:'a',cart:[{id:'p',quantity:2,preco:7}],pendingOrderDetails:{context:'keep'}});sessionStorage.setItem('checkoutState_v1',cart);
  await mount();await emit(identity('a'));expect(host.textContent).toContain('CRM:a');await click('Área do Cliente');expect(host.textContent).toContain('Customer:a');expect(window.location.pathname).toBe('/area-cliente');
  expect(sessionStorage.getItem('checkoutState_v1')).toBe(cart);
  await click('Ir para o CRM');expect(host.textContent).toContain('CRM:a');expect(auth.currentUser.uid).toBe('a');expect(resolver).toHaveBeenCalledTimes(3);expect(logoutCanonicalSession).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('checkoutState_v1')).toBe(cart);
});
test('Staff only cannot enter Customer or create a Customer',async()=>{
  window.history.replaceState(null,'','/minha-conta');resolver.mockImplementation(async u=>caps(u.uid,true,false));await mount();await emit(identity('staff'));expect(host.textContent).toContain('CRM:staff');expect(host.textContent).not.toContain('Área do Cliente');expect(window.location.pathname).toBe('/');
});
test.each(['/','/configuracoes','/financeiro','/clientes','/produtos','/pedidos','/dashboard'])('Customer only never mounts Staff in %s',async path=>{
  window.history.replaceState(null,'',path);resolver.mockImplementation(async u=>caps(u.uid,false,true));await mount();await emit(identity('customer'));expect(host.textContent).toContain('Customer:customer');expect(host.textContent).not.toContain('Ir para o CRM');expect(staff).not.toHaveBeenCalled();expect(window.location.pathname).toBe('/area-cliente');
});
test.each(['/meus-pedidos','/minha-conta','/area-cliente'])('dual refresh restores Customer route %s',async path=>{
  window.history.replaceState(null,'',path);await mount();await emit(identity('a'));expect(host.textContent).toContain('Customer:a');
});
test('inactive Staff cannot be restored from cache; Customer stays valid',async()=>{
  await mount();await emit(identity('a'));await click('Área do Cliente');resolver.mockResolvedValue(caps('a',false,true));await click('Ir para o CRM');expect(host.textContent).toContain('Customer:a');expect(host.textContent).not.toContain('CRM:a');expect(host.textContent).not.toContain('Ir para o CRM');
});
test('needsPhone is onboarding, not a Customer capability',async()=>{
  resolver.mockResolvedValue(caps('a',false,false));await mount();await emit(identity('a'));expect(host.textContent).toContain('Customer:a');expect(host.textContent).not.toContain('Ir para o CRM');expect(staff).not.toHaveBeenCalled();
});
test.each(['Sair Staff','Sair Customer'])('same logout from %s; Back cannot show private data',async button=>{
  await mount();await emit(identity('a'));if(button==='Sair Customer')await click('Área do Cliente');await click(button);expect(logoutCanonicalSession).toHaveBeenCalledTimes(1);expect(host.textContent).not.toContain('CRM:a');expect(host.textContent).not.toContain('Customer:a');
  window.history.replaceState(null,'','/meus-pedidos');await act(async()=>window.dispatchEvent(new PopStateEvent('popstate')));expect(host.textContent).toContain('Customer:login');
});
test('old UID response after logout/login B is discarded',async()=>{
  let finish;resolver.mockImplementation(u=>u.uid==='a'?new Promise(done=>{finish=done;}):Promise.resolve(caps('b',false,true)));await mount();await emit(identity('a'));await emit(null);await emit(identity('b'));await act(async()=>finish(caps('a')));expect(host.textContent).toContain('Customer:b');expect(host.textContent).not.toContain('CRM:a');
});
test('old context response for SAME UID cannot replace newer route',async()=>{
  await mount();await emit(identity('a'));let finish;resolver.mockImplementationOnce(()=>new Promise(done=>{finish=done;}));await click('Área do Cliente');window.history.replaceState(null,'','/');await act(async()=>window.dispatchEvent(new PopStateEvent('popstate')));await act(async()=>finish(caps('a')));expect(host.textContent).toContain('CRM:a');expect(host.textContent).not.toContain('Customer:a');
});
test('legacy conflict asks explicit reentry with no private shell',async()=>{
  prepareCanonicalSession.mockResolvedValue('CONFLICT');await mount();await emit(identity('a'));expect(host.textContent).toContain('Sessões diferentes');expect(host.textContent).not.toContain('CRM:a');expect(resolver).not.toHaveBeenCalled();
});
test('capability error fails closed',async()=>{
  resolver.mockRejectedValue(Error('offline'));await mount();await emit(identity('a'));expect(host.textContent).toContain('Não foi possível autorizar');expect(host.textContent).not.toContain('CRM:a');
});

test('two tabs may keep different contexts; canonical logout invalidates both',async()=>{
  await mount();await emit(identity('a'));await click('Área do Cliente');expect(host.textContent).toContain('Customer:a');
  const otherHost=document.createElement('div');document.body.append(otherHost);const otherRoot=createRoot(otherHost);
  try {
    window.history.replaceState(null,'','/');
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async()=>otherRoot.render(<ApplicationGate StaffApplication={staff} resolveCapabilities={resolver}/>));
    await emit(identity('a'));expect(otherHost.textContent).toContain('CRM:a');expect(host.textContent).toContain('Customer:a');
    await click('Sair Customer');
    expect(host.textContent).not.toContain('Customer:a');expect(otherHost.textContent).not.toContain('CRM:a');
  } finally {await act(async()=>otherRoot.unmount());otherHost.remove();}
});
