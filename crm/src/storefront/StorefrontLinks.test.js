import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import StorefrontLinks from './StorefrontLinks';
import CrmHome from './CrmHome';
jest.mock('../firebaseConfig',()=>({app:{options:{projectId:'demo-doceria-checkout'}}}));
test('home descobre loja/canal por dados e monta destino genérico',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const original=global.fetch;
  global.fetch=jest.fn(async()=>({ok:true,json:async()=>({stores:[{storeId:'loja-futura-teste',name:'Loja futura'},{storeId:'loja-futura-teste',channelId:'festas',name:'Canal futuro'}],nextCursor:null})}));
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try {
    // ReactDOM rendering uses act; this is not a Testing Library render helper.
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async()=>root.render(<StorefrontLinks/>));
    expect(host.querySelector('a[href="/cardapio?store=loja-futura-teste"]')).not.toBeNull();
    expect(host.querySelector('a[href="/cardapio?store=loja-futura-teste&channel=festas"]')).not.toBeNull();
    expect(host.textContent).not.toMatch(/Matriz|Garavelo/);
  } finally {await act(async()=>root.unmount());host.remove();global.fetch=original;}
});

test('home parent updates do not remount links; slow directory keeps independent navigation usable',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;const original=global.fetch;let finish;
  global.fetch=jest.fn(()=>new Promise(done=>{finish=done;}));
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const draw=async n=>{
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async()=>root.render(<div data-revision={n}><CrmHome onImageClick={()=>{}}/></div>));
  };
  try {
    await draw(0);expect(host.querySelector('a[href="/cardapio"]')).not.toBeNull();expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    for(let i=1;i<=4;i++)await draw(i);expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async()=>finish({ok:true,json:async()=>({stores:[{storeId:'a',name:'Loja A'}]})}));
    const link=host.querySelector('a[href="/cardapio?store=a"]');expect(link).not.toBeNull();
    await draw(5);expect(host.querySelector('a[href="/cardapio?store=a"]')).toBe(link);expect(global.fetch).toHaveBeenCalledTimes(1);
  } finally {await act(async()=>root.unmount());host.remove();global.fetch=original;}
});
test('directory failure offers retry without blocking choose-store; empty result is not an error',async()=>{
  const original=global.fetch;global.fetch=jest.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({ok:true,json:async()=>({stores:[],nextCursor:null})});
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try {
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async()=>root.render(<StorefrontLinks/>));
    expect(host.textContent).toContain('Não foi possível carregar as lojas.');expect(host.querySelector('a[href="/cardapio"]')).not.toBeNull();
    await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Tentar novamente').click());
    expect(host.textContent).toContain('Nenhuma loja disponível.');expect(global.fetch).toHaveBeenCalledTimes(2);
  } finally {await act(async()=>root.unmount());host.remove();global.fetch=original;}
});
