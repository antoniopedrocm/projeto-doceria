import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
global.IS_REACT_ACT_ENVIRONMENT=true;
import {httpsCallable} from 'firebase/functions';
import InfinitePaySettings from './InfinitePaySettings';
jest.mock('firebase/functions',()=>({httpsCallable:jest.fn()}));
let node,root;const functions={};
beforeEach(()=>{node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);});
afterEach(()=>{act(()=>root.unmount());node.remove();jest.clearAllMocks();});
const record={config:{enabled:true,handle:'original',sendCustomerData:true,sendDeliveryAddress:true},version:1,history:[],operationalReady:true};
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
