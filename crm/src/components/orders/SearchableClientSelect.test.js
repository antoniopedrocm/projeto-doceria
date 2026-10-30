import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import SearchableClientSelect from './SearchableClientSelect';
test('cliente vinculado fica visível e bloqueado; seletor legado continua permitindo seleção',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host),change=jest.fn();
 try{
  // Real ReactDOM rendering requires act.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async()=>root.render(<SearchableClientSelect clients={[{id:'a',nome:'Cliente A'}]} value="a" onChange={change} disabled/>));
  expect(host.querySelector('input').value).toBe('Cliente A');expect(host.querySelector('input').disabled).toBe(true);expect(host.querySelector('button').disabled).toBe(true);
  await act(async()=>host.querySelector('button').click());expect(host.querySelector('[role="listbox"]')).toBeNull();expect(change).not.toHaveBeenCalled();
  // This rerender is ReactDOM, not a Testing Library util.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async()=>root.render(<SearchableClientSelect clients={[{id:'a',nome:'Cliente A'},{id:'b',nome:'Cliente B'}]} value="a" onChange={change}/>));
  await act(async()=>host.querySelector('button').click());await act(async()=>host.querySelectorAll('[role="option"]')[1].click());expect(change).toHaveBeenCalledWith({id:'b',nome:'Cliente B'});
 }finally{await act(async()=>root.unmount());host.remove();}
});
