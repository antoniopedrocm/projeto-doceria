import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import StorefrontLinks from './StorefrontLinks';
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
