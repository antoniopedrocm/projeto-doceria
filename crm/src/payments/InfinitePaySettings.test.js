/* eslint-disable testing-library/no-unnecessary-act -- Direct React DOM test; no Testing Library render helpers are used. */
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {httpsCallable} from 'firebase/functions';
import InfinitePaySettings from './InfinitePaySettings';
global.IS_REACT_ACT_ENVIRONMENT=true;
jest.mock('firebase/functions',()=>({httpsCallable:jest.fn()}));
let node,root;const functions={};
beforeEach(()=>{node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);});
afterEach(()=>{act(()=>root.unmount());node.remove();jest.clearAllMocks();});
const record={config:{enabled:true,handle:'original',sendCustomerData:true,sendDeliveryAddress:true},version:1,history:[],operationalReady:true};
test('default STORE, exact labels and honest pending status; unsupported CUSTOMER cannot be selected normally',async()=>{
 httpsCallable.mockReturnValue(()=>Promise.resolve({data:record}));
 await act(async()=>root.render(<InfinitePaySettings functions={functions} storeId="matriz"/>));
 const select=node.querySelector('#card-1x-fee-payer');expect(select.value).toBe('STORE');
 expect([...select.options].map(o=>o.textContent)).toEqual(['Loja assume a taxa — padrão','Cliente assume a taxa']);
 expect(select.options[1].disabled).toBe(true);expect(node.querySelector('#card-1x-fee-help').textContent).toContain('pendente de validação');
});
test('existing valid CUSTOMER preference is shown without claiming provider activation and may revert to STORE',async()=>{
 const save=jest.fn().mockResolvedValue({data:{}});
 httpsCallable.mockImplementation((f,name)=>name==='paymentSettingsSave'?save:()=>Promise.resolve({data:{...record,config:{...record.config,card1xFeePayer:'CUSTOMER'}}}));
 await act(async()=>root.render(<InfinitePaySettings functions={functions} storeId="garavelo"/>));
 expect(node.querySelector('select').value).toBe('CUSTOMER');
 const {Simulate}=require('react-dom/test-utils');act(()=>Simulate.change(node.querySelector('select'),{target:{value:'STORE'}}));
 act(()=>node.querySelector('button').click());await act(async()=>node.querySelector('[role="dialog"] button').click());
 expect(save).toHaveBeenCalledWith(expect.objectContaining({storeId:'garavelo',config:expect.objectContaining({card1xFeePayer:'STORE',handle:'original'})}));
});
test('late save/get for previous store cannot replace the new store form',async()=>{
 let complete;const save=jest.fn(()=>new Promise(resolve=>complete=resolve));
 const get=jest.fn(({storeId})=>Promise.resolve({data:{...record,config:{...record.config,handle:storeId,card1xFeePayer:'STORE'}}}));
 httpsCallable.mockImplementation((f,name)=>name==='paymentSettingsSave'?save:get);
 await act(async()=>root.render(<InfinitePaySettings functions={functions} storeId="matriz"/>));
 act(()=>node.querySelector('button').click());act(()=>node.querySelector('[role="dialog"] button').click());
 await act(async()=>root.render(<InfinitePaySettings functions={functions} storeId="garavelo"/>));
 await act(async()=>complete({data:{saved:true}}));
 expect(node.querySelector('input').value).toBe('garavelo');expect(get.mock.calls.filter(([q])=>q.storeId==='matriz')).toHaveLength(1);
});
test('troca de tag ativa mostra valores e só confirma ao digitar ALTERAR',async()=>{
 const save=jest.fn().mockResolvedValue({data:{}});httpsCallable.mockImplementation((f,name)=>name==='paymentSettingsSave'?save:()=>Promise.resolve({data:record}));
 await act(async()=>root.render(<InfinitePaySettings functions={functions} storeId="matriz"/>));
 const input=node.querySelector('input');
 // React uses change tracking; simulate the controlled input explicitly.
 const {Simulate}=require('react-dom/test-utils');act(()=>Simulate.change(input,{target:{value:'nova'}}));
 act(()=>node.querySelector('button').click());const modal=node.querySelector('[role="dialog"]');expect(modal.textContent).toContain('original');expect(modal.textContent).toContain('nova');
 const confirm=modal.querySelector('button');expect(confirm.disabled).toBe(true);act(()=>Simulate.change(modal.querySelector('input'),{target:{value:'ALTERAR'}}));expect(confirm.disabled).toBe(false);
 await act(async()=>confirm.click());expect(save).toHaveBeenCalledWith(expect.objectContaining({storeId:'matriz',expectedHandle:'original',expectedVersion:1,confirmChange:true,confirmation:'ALTERAR'}));
});
test('acesso negado não exibe formulário e sem loja solicita seleção',async()=>{
 httpsCallable.mockReturnValue(()=>Promise.reject(new Error('Permissão financeira necessária.')));
 await act(async()=>root.render(<InfinitePaySettings functions={functions} storeId="garavelo"/>));expect(node.querySelector('[role="alert"]').textContent).toContain('Permissão financeira');expect(node.querySelector('input')).toBeNull();
 await act(async()=>root.render(<InfinitePaySettings functions={functions} storeId={null}/>));expect(node.textContent).toContain('Selecione uma loja');
});
test('reviewed native binding enables preference while distinguishing validation without payment',async()=>{
 const save=jest.fn().mockResolvedValue({data:{}});httpsCallable.mockImplementation((f,name)=>name==='paymentSettingsSave'?save:()=>Promise.resolve({data:{...record,card1xFeePolicy:{application:'LINK_POLICY_VERIFIED_NO_PAYMENT',customerPassThroughAvailable:true,baselineAssuredInstallments:1}}}));
 await act(async()=>root.render(<InfinitePaySettings functions={functions} storeId="matriz"/>));expect(node.querySelector('select').options[1].disabled).toBe(false);expect(node.textContent).toContain('validada sem pagamento');
 const {Simulate}=require('react-dom/test-utils');act(()=>Simulate.change(node.querySelector('select'),{target:{value:'CUSTOMER'}}));act(()=>node.querySelector('button').click());await act(async()=>node.querySelector('[role="dialog"] button').click());expect(save).toHaveBeenCalledWith(expect.objectContaining({config:expect.objectContaining({card1xFeePayer:'CUSTOMER'})}));
});
test('merchant absorbs 2x+ and incompatible pass-through remains disabled with clear explanation',async()=>{
 httpsCallable.mockReturnValue(()=>Promise.resolve({data:{...record,card1xFeePolicy:{application:'PREPARED_NOT_HOMOLOGATED',customerPassThroughAvailable:false,baselineAssuredInstallments:3}}}));await act(async()=>root.render(<InfinitePaySettings functions={functions} storeId="matriz"/>));expect(node.querySelector('select').options[1].disabled).toBe(true);expect(node.textContent).toContain('assume taxas até 3x');expect(node.textContent).toContain('decisão específica do Dono');
});
