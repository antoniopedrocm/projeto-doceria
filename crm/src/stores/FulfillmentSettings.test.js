import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {httpsCallable} from 'firebase/functions';
import FulfillmentSettings from './FulfillmentSettings';
jest.mock('firebase/functions',()=>({httpsCallable:jest.fn()}));
jest.mock('../firebaseConfig',()=>({functions:{}}));
let host,root;const initial={storeId:'a',deliveryEnabled:false,pickupEnabled:true,deliveryReady:false,revision:0,editable:true};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=> 'fixture-request-123456'}});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
// Actual ReactDOM renderer; no Testing Library rendering helper.
// eslint-disable-next-line testing-library/no-unnecessary-act
const draw=async element=>act(async()=>root.render(element));
test('flags independentes, readiness e payload mínimo não alteram preço/coordenadas',async()=>{
  const save=jest.fn(async data=>({data:{...initial,...data,revision:1}}));httpsCallable.mockImplementation((_f,name)=>name==='staffGetFulfillment'?async()=>({data:initial}):save);
  await draw(<FulfillmentSettings storeId="a"/>);const inputs=host.querySelectorAll('input');expect(inputs).toHaveLength(2);expect(inputs[0].checked).toBe(false);expect(inputs[1].checked).toBe(true);expect(host.querySelector('[type=submit]').disabled).toBe(true);
  await act(async()=>inputs[0].click());expect(host.textContent).toContain('Entrega habilitada, porém');await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(save).toHaveBeenCalledWith({storeId:'a',deliveryEnabled:true,pickupEnabled:true,expectedRevision:0,requestId:'fixture-request-123456'});expect(host.textContent).toContain('Disponibilidade salva.');
});
test('troca de loja não recebe resposta atrasada da loja anterior',async()=>{
  let resolveA;httpsCallable.mockReturnValue(({storeId})=>storeId==='a'?new Promise(resolve=>{resolveA=resolve;}):Promise.resolve({data:{...initial,storeId:'b',deliveryEnabled:true,pickupEnabled:false,deliveryReady:true}}));
  await draw(<FulfillmentSettings key="a" storeId="a"/>);await draw(<FulfillmentSettings key="b" storeId="b"/>);await act(async()=>resolveA({data:initial}));expect(host.querySelectorAll('input')[0].checked).toBe(true);expect(host.querySelectorAll('input')[1].checked).toBe(false);
});
test('erro de leitura permite retry; campos indisponíveis antes da autorização',async()=>{
  const get=jest.fn().mockRejectedValueOnce(Error('private credentials')).mockResolvedValueOnce({data:initial});httpsCallable.mockReturnValue(get);await draw(<FulfillmentSettings storeId="a"/>);expect(host.textContent).toContain('Não foi possível carregar');expect(host.textContent).not.toContain('private credentials');await act(async()=>host.querySelector('button').click());expect(host.querySelectorAll('input')).toHaveLength(2);
});
test('duplo submit em voo cria uma operação; erro permite retry com mesmo requestId',async()=>{
  let reject;const save=jest.fn().mockImplementationOnce(()=>new Promise((_resolve,r)=>{reject=r;})).mockResolvedValueOnce({data:{...initial,deliveryEnabled:true,revision:1}});httpsCallable.mockImplementation((_f,name)=>name==='staffGetFulfillment'?async()=>({data:initial}):save);await draw(<FulfillmentSettings storeId="a"/>);await act(async()=>host.querySelector('input').click());
  await act(async()=>{host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});expect(save).toHaveBeenCalledTimes(1);await act(async()=>reject(Error('network')));await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(save).toHaveBeenCalledTimes(2);expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
});
