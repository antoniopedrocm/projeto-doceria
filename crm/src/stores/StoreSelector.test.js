import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import StoreSelector from './StoreSelector';
let host,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
// eslint-disable-next-line testing-library/no-unnecessary-act
const render=props=>act(async()=>root.render(<StoreSelector owner allKey="all" stores={[]} names={{}} status="loading" onChange={()=>{}} {...props}/>));
test('quick selector keeps Ver lojas available while loading and never exposes store mutations',async()=>{
  const manage=jest.fn(),create=jest.fn();await render({canCreate:true,onCreate:create,onManage:manage});
  expect(host.querySelector('select').disabled).toBe(true);expect(host.textContent).toContain('Ver lojas');
  await act(async()=>host.querySelector('button').click());expect(manage).toHaveBeenCalledTimes(1);expect(create).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('Adicionar Loja');expect(host.textContent).not.toContain('Nova Loja');
});
test.each([
  {stores:[],disabled:true,value:'',options:['']},
  {stores:['a'],disabled:false,value:'a',options:['all','a']},
  {stores:['a','b','c'],disabled:false,value:'a',options:['all','a','b','c']},
])('zero/one/many stores have coherent selection and names: $stores',async({stores,disabled,value,options})=>{
  await render({stores,status:'ready',names:{a:'Loja A',b:'Loja B'},selected:'a'});
  expect(host.querySelector('select').disabled).toBe(disabled);
  expect(host.querySelector('select').value).toBe(value);
  expect([...host.querySelectorAll('option')].map(option=>option.value)).toEqual(options);
  expect(host.textContent.includes('Nenhuma loja cadastrada')).toBe(disabled);
  expect(host.textContent.includes('Loja A')).toBe(!disabled);
});
test('scoped Staff cannot select General; error retains quick list and enables retry',async()=>{
  const retry=jest.fn(),change=jest.fn();
  await render({owner:false,stores:['a'],selected:'a',status:'ready',onChange:change});expect(host.querySelector('option[value="all"]')).toBeNull();
  await act(async()=>host.querySelector('select').dispatchEvent(new Event('change',{bubbles:true})));expect(change).toHaveBeenCalledTimes(1);
  await render({status:'error',onRetry:retry,onManage:()=>{}});expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Tentar novamente').click());expect(retry).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('Ver lojas');
});
