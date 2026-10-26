import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import StoreSelector from './StoreSelector';
let host,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
// eslint-disable-next-line testing-library/no-unnecessary-act
const render=props=>act(async()=>root.render(<StoreSelector owner allKey="all" stores={[]} names={{}} status="loading" onChange={()=>{}} {...props}/>));
test('create-store is independent of loading and respects its resolved permission',async()=>{
  const create=jest.fn();await render({canCreate:true,onCreate:create});
  expect(host.querySelector('select').disabled).toBe(true);await act(async()=>host.querySelector('button').click());expect(create).toHaveBeenCalledTimes(1);
  await render({canCreate:false});expect(host.querySelector('button')).toBeNull();
});
test.each([[[]],[['a']],[['a','b','c']]])('zero/one/many stores have coherent selection and names: %j',async stores=>{
  await render({stores,status:'ready',names:{a:'Loja A',b:'Loja B'},selected:'a'});
  expect(host.querySelector('select').disabled).toBe(!stores.length);
  if(stores.length){expect(host.querySelector('select').value).toBe('a');expect(host.textContent).toContain('Loja A');expect(host.querySelector('option[value="all"]')).not.toBeNull();}
  else expect(host.textContent).toContain('Nenhuma loja cadastrada');
});
test('scoped Staff cannot select General; error retains create and enables retry',async()=>{
  const retry=jest.fn(),change=jest.fn();
  await render({owner:false,stores:['a'],selected:'a',status:'ready',onChange:change});expect(host.querySelector('option[value="all"]')).toBeNull();
  await act(async()=>host.querySelector('select').dispatchEvent(new Event('change',{bubbles:true})));expect(change).toHaveBeenCalledTimes(1);
  await render({status:'error',onRetry:retry,canCreate:true});expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Tentar novamente').click());expect(retry).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('Adicionar Loja');
});
