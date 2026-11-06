import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ApplicationGate from './ApplicationGate';
import {auth} from '../firebaseConfig';
import {legacyAuth,prepareCanonicalSession,logoutCanonicalSession,endPhoneSession} from './customerRuntime';
import {onIdTokenChanged} from 'firebase/auth';
import {staffStoreSelectionKey} from '../stores/staffDirectory';
import useStaffSection,{staffSectionKey} from '../stores/useStaffSection';
jest.mock('../firebaseConfig',()=>({auth:{currentUser:null}}));
jest.mock('./customerRuntime',()=>({legacyAuth:{currentUser:null},prepareCanonicalSession:jest.fn(async()=> 'READY'),syncSessionCart:jest.fn(async()=>{}),logoutCanonicalSession:jest.fn(async()=>{}),endPhoneSession:jest.fn(async()=>{})}));
jest.mock('firebase/auth',()=>({onIdTokenChanged:jest.fn()}));
jest.mock('./CustomerShell',()=>({__esModule:true,default:props=><div>Customer:{props.uid||'login'}{props.canOpenStaff && <button onClick={props.onStaffContext}>Ir para o CRM</button>}<button onClick={props.onLogout}>Sair Customer</button></div>}));
jest.mock('./LegacyCustomerShell',()=>({__esModule:true,default:props=><div>Temporary SMS:{props.session.storeId}<button onClick={props.onLogout}>Sair SMS</button></div>}));
const identity=uid=>({uid,providerData:[{providerId:'google.com'}]});
const caps=(uid='a',isStaff=true,isCustomer=true)=>({uid,isStaff,isCustomer,staff:isStaff?{role:'dono'}:null,customer:isCustomer?{customerId:'own'}:null,customerState:isCustomer?'CUSTOMER_RESOLVED':'NEEDS_PHONE'});
let host,root,listeners,resolver,staff;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);listeners=new Map();
  resolver=jest.fn(async u=>caps(u.uid));
  staff=jest.fn(props=><div>{props.staffUid?'CRM:'+props.staffUid:'Login único'}{props.canOpenCustomer && <button onClick={props.onCustomerContext}>Área do Cliente</button>}<button onClick={props.onLogout}>Sair Staff</button></div>);
  auth.currentUser=null;legacyAuth.currentUser=null;window.history.replaceState(null,'','/');sessionStorage.clear();
  prepareCanonicalSession.mockResolvedValue('READY');logoutCanonicalSession.mockImplementation(async()=>{auth.currentUser=null;for(const fn of listeners.get(auth)||[])fn(null);});
  endPhoneSession.mockImplementation(async()=>{sessionStorage.removeItem('customerPhoneSession_v1');});
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
test.each([false,true])('explicit /area-cliente entry preserves Customer context when isStaff=%s',async isStaff=>{
  window.history.replaceState(null,'','/area-cliente');resolver.mockImplementation(async u=>caps(u.uid,isStaff,true));
  const user=identity('a'),cart='{"storeId":"loja-futura-teste","cart":[{"id":"p","quantity":2}]}';sessionStorage.setItem('checkoutState_v1',cart);
  await mount();await emit(user);expect(host.textContent).toContain('Customer:a');expect(staff).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe('/area-cliente');expect(auth.currentUser).toBe(user);
  expect(host.textContent.includes('Ir para o CRM')).toBe(isStaff);expect(sessionStorage.getItem('checkoutState_v1')).toBe(cart);
  expect(logoutCanonicalSession).not.toHaveBeenCalled();
});
test('signed-out /area-cliente shows login and stays in Customer context after authentication',async()=>{
  window.history.replaceState(null,'','/area-cliente');await mount();await emit(null);
  expect(host.textContent).toContain('Customer:login');expect(staff).not.toHaveBeenCalled();expect(resolver).not.toHaveBeenCalled();
  await emit(identity('a'));expect(host.textContent).toContain('Customer:a');expect(staff).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe('/area-cliente');
});
test('temporary SMS context can reach its server-guarded shell with Auth null without resolving Staff or promoting Firebase',async()=>{
  window.history.replaceState(null,'','/minha-conta');
  sessionStorage.setItem('customerPhoneSession_v1',JSON.stringify({purpose:'CUSTOMER_PRIVATE_SESSION',storeId:'phone-store',checkoutIdentityToken:'a'.repeat(64),checkoutIdentityRevision:1,addressSessionToken:'b'.repeat(64),expiresAt:Date.now()+600000}));
  await mount();await emit(null);expect(host.textContent).toContain('Temporary SMS:phone-store');
  expect(auth.currentUser).toBeNull();expect(resolver).not.toHaveBeenCalled();expect(staff).not.toHaveBeenCalled();expect(prepareCanonicalSession).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe('/minha-conta');
});
test.each(['staff','customer',null])('ending temporary SMS access preserves underlying %s Auth and exits without global logout',async kind=>{
  window.history.replaceState(null,'','/minha-conta');
  sessionStorage.setItem('customerPhoneSession_v1',JSON.stringify({purpose:'CUSTOMER_PRIVATE_SESSION',storeId:'phone-store',checkoutIdentityToken:'a'.repeat(64),checkoutIdentityRevision:1,addressSessionToken:'b'.repeat(64),expiresAt:Date.now()+600000}));
  sessionStorage.setItem(staffStoreSelectionKey('a'),JSON.stringify('store-a'));
  const user=kind?identity('a'):null;
  resolver.mockImplementation(async u=>caps(u.uid,kind==='staff',kind==='customer'));
  await mount();await emit(user);expect(host.textContent).toContain('Temporary SMS');
  await click('Sair SMS');
  expect(endPhoneSession).toHaveBeenCalledTimes(1);expect(logoutCanonicalSession).not.toHaveBeenCalled();
  expect(auth.currentUser).toBe(user);expect(host.textContent).not.toContain('Temporary SMS');
  expect(host.textContent).not.toContain('Carregando acesso');expect(sessionStorage.getItem('customerPhoneSession_v1')).toBeNull();
  expect(host.textContent).toContain(kind==='staff'?'CRM:a':kind==='customer'?'Customer:a':'Customer:login');
  expect(JSON.parse(sessionStorage.getItem(staffStoreSelectionKey('a')))).toBe('store-a');
});

test('temporary logout without Auth completes even if canonical preparation would never finish',async()=>{
  window.history.replaceState(null,'','/area-cliente');
  sessionStorage.setItem('customerPhoneSession_v1',JSON.stringify({purpose:'CUSTOMER_PRIVATE_SESSION',storeId:'phone-store',checkoutIdentityToken:'a'.repeat(64),checkoutIdentityRevision:1,addressSessionToken:'b'.repeat(64),expiresAt:Date.now()+600000}));
  prepareCanonicalSession.mockImplementation(()=>new Promise(()=>{}));
  await mount();await emit(null);await click('Sair SMS');
  expect(host.textContent).toContain('Customer:login');expect(prepareCanonicalSession).not.toHaveBeenCalled();
  expect(logoutCanonicalSession).not.toHaveBeenCalled();
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

test('Auth null removes private UI before pending legacy hydration completes',async()=>{
  window.history.replaceState(null,'','/minha-conta');await mount();await emit(identity('a'));
  prepareCanonicalSession.mockImplementation(()=>new Promise(()=>{}));
  await emit(null);expect(host.textContent).toContain('Customer:login');
  expect(host.textContent).not.toContain('Carregando acesso');expect(host.textContent).not.toContain('Customer:a');
});

test('logout preserva a origem pública na URL mesmo se o cleanup remover todo storage da aba',async()=>{
  window.history.replaceState(null,'','/minha-conta?returnTo=%2Fcardapio-garavelo');
  resolver.mockImplementation(async u=>caps(u.uid,false,true));
  await mount();await emit(identity('customer'));
  logoutCanonicalSession.mockImplementationOnce(async()=>{sessionStorage.clear();auth.currentUser=null;for(const fn of listeners.get(auth)||[])fn(null);});
  await click('Sair Customer');expect(window.location.pathname).toBe('/area-cliente');
  expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/cardapio-garavelo');
  expect(host.textContent).toContain('Customer:login');
});

test.each(['/area-cliente','/minha-conta','/meus-pedidos'])('logout from %s finishes at public Customer entry without rehydration',async path=>{
  window.history.replaceState(null,'',path);await mount();await emit(identity('a'));
  prepareCanonicalSession.mockImplementation(()=>new Promise(()=>{}));
  await click('Sair Customer');expect(window.location.pathname).toBe('/area-cliente');
  expect(host.textContent).toContain('Customer:login');expect(host.textContent).not.toContain('Carregando acesso');
  await act(async()=>root.unmount());root=createRoot(host);await mount();await emit(null);
  expect(host.textContent).toContain('Customer:login');expect(staff).not.toHaveBeenCalled();
});

test('signOut error keeps private UI removed and offers retry; null Auth still completes',async()=>{
  window.history.replaceState(null,'','/meus-pedidos');await mount();await emit(identity('a'));
  logoutCanonicalSession.mockRejectedValueOnce(Error('offline'));await click('Sair Customer');
  expect(host.textContent).toContain('Não foi possível sair');expect(host.textContent).not.toContain('Customer:a');
  logoutCanonicalSession.mockImplementationOnce(async()=>{auth.currentUser=null;throw Error('legacy cleanup');});
  await click('Sair');expect(host.textContent).toContain('Customer:login');expect(window.location.pathname).toBe('/area-cliente');
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

test('Staff mounts before Customer lookup finishes, using gate profile; final dual-role does not remount',async()=>{
  const profile={role:'dono'};let finish;
  resolver.mockImplementation(async(u,{onStaffResolved})=>{
    onStaffResolved({...caps(u.uid,true,false),staff:profile,customerState:'PENDING'});
    return new Promise(done=>{finish=()=>done({...caps(u.uid),staff:profile});});
  });
  await mount();await emit(identity('a'));
  expect(host.textContent).toContain('CRM:a');expect(host.textContent).not.toContain('Área do Cliente');
  expect(staff.mock.calls.at(-1)[0].staffProfile).toBe(profile);
  const shell=host.firstChild;
  await act(async()=>finish());
  expect(host.firstChild).toBe(shell);expect(host.textContent).toContain('Área do Cliente');
});
test('same-UID refresh keeps scoped store preference; UID switch clears drafts and never adopts another Staff preference',async()=>{
  sessionStorage.setItem(staffStoreSelectionKey('a'),JSON.stringify('loja-a'));
  sessionStorage.setItem(staffStoreSelectionKey('b'),JSON.stringify('loja-b'));
  sessionStorage.setItem('selectedStoreId',JSON.stringify('foreign-global'));
  sessionStorage.setItem('financeiro_startDate','private-a');
  staff.mockImplementation(props=><div>CRM:{props.staffUid};Store:{props.staffUid?JSON.parse(sessionStorage.getItem(staffStoreSelectionKey(props.staffUid))):'none'}</div>);
  await mount();await emit(identity('a'));expect(host.textContent).toContain('Store:loja-a');
  expect(sessionStorage.getItem('selectedStoreId')).toBeNull();expect(sessionStorage.getItem('financeiro_startDate')).toBeNull();
  await emit(null);await emit(identity('b'));expect(host.textContent).toContain('Store:loja-b');expect(host.textContent).not.toContain('loja-a');
});
test('provisional Staff cannot redirect a Customer route or restore an old UID after logout',async()=>{
  let late,finish;
  resolver.mockImplementation(async(u,{onStaffResolved})=>{
    late=()=>onStaffResolved(caps(u.uid,true,false));
    return new Promise(done=>{finish=()=>done(caps(u.uid));});
  });
  window.history.replaceState(null,'','/area-cliente');await mount();await emit(identity('a'));
  await act(async()=>late());expect(staff).not.toHaveBeenCalled();
  await emit(null);await act(async()=>{late();finish();});
  expect(host.textContent).toContain('Customer:login');expect(staff).not.toHaveBeenCalled();
});

test.each(['nota-fiscal','clientes','financeiro','pagina-inicial'])('canonical gate restoration keeps section %s through Customer completion, token renewal and refresh',async section=>{
  sessionStorage.setItem(staffSectionKey('a'),JSON.stringify(section));
  sessionStorage.setItem(staffStoreSelectionKey('a'),JSON.stringify('store-a'));
  sessionStorage.setItem('currentPage',JSON.stringify('foreign-global'));
  function Navigation(props){const [page]=useStaffSection(props.staffUid);return <div>CRM:{props.staffUid};Section:{page}</div>;}
  staff.mockImplementation(props=><Navigation {...props}/>);
  let finish;
  resolver.mockImplementation(async(u,{onStaffResolved})=>{
    onStaffResolved(caps(u.uid,true,false));
    return new Promise(done=>{finish=()=>done(caps(u.uid));});
  });
  await mount();await emit(identity('a'));expect(host.textContent).toContain(`Section:${section}`);
  await act(async()=>finish());expect(host.textContent).toContain(`Section:${section}`);
  await emit(identity('a'));expect(host.textContent).toContain(`Section:${section}`);await act(async()=>finish());
  await act(async()=>root.unmount());root=createRoot(host);await mount();await emit(identity('a'));
  expect(host.textContent).toContain(`Section:${section}`);await act(async()=>finish());
  expect(sessionStorage.getItem('currentPage')).toBeNull();
  expect(JSON.parse(sessionStorage.getItem(staffStoreSelectionKey('a')))).toBe('store-a');
  expect(auth.currentUser.uid).toBe('a');expect(logoutCanonicalSession).not.toHaveBeenCalled();
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
