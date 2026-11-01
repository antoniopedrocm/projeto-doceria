import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import PaymentReconciliation from './PaymentReconciliation';
jest.mock('../firebaseConfig',()=>({auth:{currentUser:null}}));
jest.mock('../customer/customerRuntime',()=>({customerApiBase:'http://fixture.invalid'}));
let host,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const paymentId='a'.repeat(64);
const event={id:'b'.repeat(64),paymentId,orderId:'order-fixture',eventType:'refunded',disposition:'PENDING_RECONCILIATION',createdAt:'2026-11-01T10:00:00Z'};
// eslint-disable-next-line testing-library/no-unnecessary-act
const render=props=>act(async()=>root.render(<PaymentReconciliation storeId="store-a" {...props}/>));
test('general view cannot query or register an arbitrary fallback store',async()=>{
 const request=jest.fn();await render({storeId:'__all__',request});expect(host.textContent).toContain('Selecione uma loja');expect(request).not.toHaveBeenCalled();
});
test('external execution UI never claims to refund provider; requires confirmation and preserves store scope',async()=>{
 const request=jest.fn(async(store,method)=>method==='list'?{events:[event]}:{payment:{paymentId,orderId:'order-fixture',payment_status:'PAID',amount:1000,transactionNsu:'transaction-fixture',slug:'slug-fixture'}});
 await render({request});expect(request).toHaveBeenCalledWith('store-a','list',{});
 const buttons=()=>[...host.querySelectorAll('button')];
 await act(async()=>buttons().find(b=>b.textContent==='Consultar pagamento').click());
 expect(host.textContent).toContain('Registrar operação já realizada');expect(host.textContent).not.toContain('Estornar na InfinitePay');
 expect(buttons().find(b=>b.textContent==='Registrar execução externa').disabled).toBe(true);
 const form=[...host.querySelectorAll('form')].find(f=>f.textContent.includes('Registrar operação já realizada'));
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(request.mock.calls.some(c=>c[1]==='register')).toBe(false);
 await act(async()=>buttons().find(b=>b.textContent==='Cancelar').click());expect(host.textContent).not.toContain('Registrar execução externa');
});
test('unverified notification review is a separate action without financial transition',async()=>{
 const request=jest.fn(async()=>({events:[event]}));await render({request});
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Revisar notificação sem comprovação').click());
 expect(host.textContent).toContain('não muda o pagamento');expect(request.mock.calls.some(c=>c[1]==='register'||c[1]==='reconcile')).toBe(false);
});
