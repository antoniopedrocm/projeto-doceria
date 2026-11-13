/* eslint-disable testing-library/no-unnecessary-act -- Native React DOM roots require act. */
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {httpsCallable} from 'firebase/functions';
import ReceiveOrderPayment,{canReceiveOrderPayment} from './ReceiveOrderPayment';
jest.mock('firebase/functions',()=>({httpsCallable:jest.fn()}));
global.IS_REACT_ACT_ENVIRONMENT=true;
const priorCrypto=global.crypto;beforeAll(()=>{global.crypto=require('crypto').webcrypto;});afterAll(()=>{global.crypto=priorCrypto;});
const order={id:'synthetic',lojaId:'matriz',status:'Finalizado',paymentMode:'AGREED_LATER',paymentStatus:'PENDING',total:14.78,formaPagamento:'Cartão de Crédito',adminRevision:2};
let container,root;beforeEach(()=>{container=document.createElement('div');document.body.append(container);root=createRoot(container);jest.clearAllMocks();});afterEach(()=>{act(()=>root.unmount());container.remove();});
test('button is offered only for a pending agreed receipt with both existing permissions',()=>{
 expect(canReceiveOrderPayment(order,{pedidos:true,financeiro:true})).toBe(true);
 for(const patch of [{paymentId:'provider'},{paymentMode:'ONLINE_NOW'},{paymentStatus:'PAID'},{requiresReview:true},{status:'Cancelado'},{manualPaymentReceipt:{}}])expect(canReceiveOrderPayment({...order,...patch},{pedidos:true,financeiro:true})).toBe(false);
 expect(canReceiveOrderPayment(order,{pedidos:true})).toBe(false);
});
test('existing method/amount and explicit confirmation are required; double click sends one request',async()=>{
 let finish;const submit=jest.fn(()=>new Promise(resolve=>finish=resolve)),recorded=jest.fn();httpsCallable.mockReturnValue(submit);
 act(()=>root.render(<ReceiveOrderPayment order={order} functions={{}} onRecorded={recorded}/>));
 const confirm=container.querySelector('button[type="submit"]');expect(confirm.disabled).toBe(true);expect(container.textContent).toContain('14,78');
 act(()=>container.querySelector('input[type="checkbox"]').click());expect(confirm.disabled).toBe(false);
 await act(async()=>{confirm.click();confirm.click();});expect(submit).toHaveBeenCalledTimes(1);expect(confirm.disabled).toBe(true);expect(submit.mock.calls[0][0]).toMatchObject({storeId:'matriz',orderId:'synthetic',expectedTotalCents:1478,methodLabel:'Cartão de Crédito',confirmed:true,expectedRevision:2});
 await act(async()=>finish({data:{ok:true}}));expect(recorded).toHaveBeenCalledTimes(1);expect(container.textContent).toContain('Recebimento registrado');expect(confirm.disabled).toBe(true);
});
test('server rejection is readable, preserves the form and does not pretend payment was received',async()=>{
 const submit=jest.fn().mockRejectedValue(new Error('O pedido mudou em outra sessão.')),recorded=jest.fn();httpsCallable.mockReturnValue(submit);
 act(()=>root.render(<ReceiveOrderPayment order={order} functions={{}} onRecorded={recorded}/>));act(()=>container.querySelector('input[type="checkbox"]').click());await act(async()=>container.querySelector('button[type="submit"]').click());
 expect(container.querySelector('[role="alert"]').textContent).toContain('pedido mudou');expect(recorded).not.toHaveBeenCalled();expect(container.querySelector('select').value).toBe('Cartão de Crédito');
});
