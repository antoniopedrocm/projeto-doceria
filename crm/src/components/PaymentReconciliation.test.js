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

const buttonNamed=name=>[...host.querySelectorAll('button')].find(b=>b.textContent===name);
const scopeSelect=()=>[...host.querySelectorAll('label')].find(label=>label.textContent.startsWith('Escopo do estorno'))?.querySelector('select');
const operationForm=()=>[...host.querySelectorAll('form')].find(form=>form.textContent.includes('Registrar operação já realizada'));
const setScope=value=>act(async()=>{const select=scopeSelect();select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});
const setReference=()=>act(async()=>{const input=[...host.querySelectorAll('label')].find(label=>label.textContent.startsWith('Referência da execução externa')).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'external-operation-fixture');input.dispatchEvent(new Event('input',{bubbles:true}));});

test('partial and unconfirmed refund scopes keep administrative reconciliation pending without any registration',async()=>{
 const request=jest.fn(async(store,method)=>method==='list'?{events:[event]}:{payment:{paymentId,payment_status:'PAID',amount:1000,transactionNsu:'transaction-fixture',slug:'slug-fixture'}});
 await render({request});await act(async()=>buttonNamed('Consultar pagamento').click());
 expect(scopeSelect().value).toBe('');
 for(const scope of ['', 'PARTIAL','UNKNOWN']){
  await setScope(scope);expect(buttonNamed('Registrar execução externa').disabled).toBe(true);
  expect(operationForm().querySelector('input[type="checkbox"]').disabled).toBe(true);
  await act(async()=>operationForm().dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 }
 expect(request.mock.calls.some(c=>c[1]==='register'||c[1]==='reconcile')).toBe(false);
 expect(host.textContent).toContain('deve permanecer em conciliação administrativa');
});

test('full refund requires its own explicit attestation and sends FULL only for the selected store',async()=>{
 const original=Object.getOwnPropertyDescriptor(global,'crypto');Object.defineProperty(global,'crypto',{configurable:true,value:{randomUUID:()=> 'fixture-full-refund-request'}});
 try {
  const request=jest.fn(async(store,method)=>method==='list'?{events:[event]}:method==='register'?{ok:true}:{payment:{paymentId,payment_status:'PAID',amount:1000,transactionNsu:'transaction-fixture',slug:'slug-fixture'}});
  await render({request});await act(async()=>buttonNamed('Consultar pagamento').click());await setReference();await setScope('FULL');
  expect(host.textContent).toContain('Confirmo que o estorno INTEGRAL foi concluído');
  expect(buttonNamed('Registrar execução externa').disabled).toBe(true);
  await act(async()=>operationForm().querySelector('input[type="checkbox"]').click());
  expect(buttonNamed('Registrar execução externa').disabled).toBe(false);
  await act(async()=>{const form=operationForm();form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  const calls=request.mock.calls.filter(c=>c[1]==='register');expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual(['store-a','register',expect.objectContaining({paymentId,refundScope:'FULL',type:'REFUND_EXPECTED',executionConfirmed:true,executionReference:'external-operation-fixture'})]);
 } finally {if(original)Object.defineProperty(global,'crypto',original);else delete global.crypto;}
});

test('changing refund scope resets prior confirmation so partial cannot reuse full attestation',async()=>{
 const request=jest.fn(async(store,method)=>method==='list'?{events:[event]}:{payment:{paymentId,payment_status:'PAID',amount:1000,transactionNsu:'transaction-fixture',slug:'slug-fixture'}});
 await render({request});await act(async()=>buttonNamed('Consultar pagamento').click());await setScope('FULL');
 await act(async()=>operationForm().querySelector('input[type="checkbox"]').click());expect(buttonNamed('Registrar execução externa').disabled).toBe(false);
 await setScope('PARTIAL');expect(operationForm().querySelector('input[type="checkbox"]').checked).toBe(false);expect(buttonNamed('Registrar execução externa').disabled).toBe(true);
 await setScope('FULL');expect(operationForm().querySelector('input[type="checkbox"]').checked).toBe(false);expect(buttonNamed('Registrar execução externa').disabled).toBe(true);
 expect(request.mock.calls.some(c=>c[1]==='register')).toBe(false);
});

test('cancellation keeps its existing attestation and does not send a refund scope',async()=>{
 const original=Object.getOwnPropertyDescriptor(global,'crypto');Object.defineProperty(global,'crypto',{configurable:true,value:{randomUUID:()=> 'fixture-cancellation-request'}});
 try {
  const request=jest.fn(async(store,method)=>method==='list'?{events:[event]}:method==='register'?{ok:true}:{payment:{paymentId,payment_status:'PENDING',amount:1000,transactionNsu:'transaction-fixture',slug:'slug-fixture'}});
  await render({request});await act(async()=>buttonNamed('Consultar pagamento').click());expect(scopeSelect()).toBeUndefined();await setReference();
  await act(async()=>operationForm().querySelector('input[type="checkbox"]').click());await act(async()=>operationForm().dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  const calls=request.mock.calls.filter(c=>c[1]==='register');expect(calls).toHaveLength(1);expect(calls[0][2].type).toBe('CANCEL_EXPECTED');expect(calls[0][2].refundScope).toBeUndefined();
 } finally {if(original)Object.defineProperty(global,'crypto',original);else delete global.crypto;}
});
