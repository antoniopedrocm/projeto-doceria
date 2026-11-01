import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import LegacyCustomerShell from './LegacyCustomerShell';
import {readPhoneSession,clearPhoneSession} from './legacyPhoneSession';
let host,root;
const session={purpose:'CUSTOMER_PRIVATE_SESSION',storeId:'fixture-store',checkoutIdentityToken:'a'.repeat(64),checkoutIdentityRevision:1,addressSessionToken:'b'.repeat(64),expiresAt:Date.now()+600000};
const customer={id:'canonical-fixture',nome:'Nome Fixture',telefone:'62982345678',aniversario:'',enderecos:[{id:'address-opaque',nickname:'Casa da família',enderecoCompleto:'Rua fictícia',isDefault:true}]};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
// eslint-disable-next-line testing-library/no-unnecessary-act
const render=props=>act(async()=>root.render(<LegacyCustomerShell session={session} apiBase="http://fixture.invalid" onLogout={jest.fn()} {...props}/>));
test('cached phone grant is UX only: private frame waits for server authorization; failure terminates session',async()=>{
 window.history.replaceState(null,'','/minha-conta');let reject;
 const request=jest.fn(()=>new Promise((resolve,r)=>{reject=r;})),logout=jest.fn();
 await render({request,onLogout:logout});expect(host.querySelector('aside')).toBeNull();expect(host.textContent).toContain('Verificando');
 await act(async()=>reject(Object.assign(new Error('Confirme novamente'),{code:'PHONE_SESSION_REQUIRED'})));
 expect(logout).toHaveBeenCalledTimes(1);expect(host.querySelector('aside')).toBeNull();expect(host.textContent).not.toContain(customer.nome);
});
test('SMS account reuses profile cards, readonly phone and scoped save/address handlers',async()=>{
 window.history.replaceState(null,'','/minha-conta');const request=jest.fn(async()=>({customer}));
 await render({request});expect(host.textContent).toContain('Minha Conta');expect(host.textContent).toContain('Casa da família');
 const inputs=host.querySelectorAll('input');expect([...inputs].find(i=>i.value===customer.telefone).readOnly).toBe(true);
 const form=host.querySelector('form');await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(request).toHaveBeenCalledWith('http://fixture.invalid',session,'update',{nome:customer.nome,aniversario:''});
 expect(host.textContent).toContain('Alterações salvas.');
});
test('phone session cache rejects expired/malformed data and is confined to supplied tab storage',()=>{
 const a=new Map(),b=new Map(),storage=m=>({getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
 const first=storage(a),second=storage(b);first.setItem('customerPhoneSession_v1',JSON.stringify(session));
 expect(readPhoneSession(first)).toEqual(session);expect(readPhoneSession(second)).toBeNull();
 expect(readPhoneSession(first,session.expiresAt)).toBeNull();first.setItem('customerPhoneSession_v1','invalid');expect(readPhoneSession(first)).toBeNull();
 first.setItem('customerPhoneSession_v1',JSON.stringify(session));clearPhoneSession(first);expect(readPhoneSession(first)).toBeNull();
});
