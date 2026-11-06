import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ApplicationEntry from './ApplicationEntry';
jest.mock('./CrmHome',()=>function PublicHome({onImageClick}){return <section>Home pública existente<button onClick={()=>onImageClick('/slide/slide1.png')}>Ampliar</button><a href="/cardapio-garavelo">Cardápio Garavelo</a></section>;});
let host,root,privateApplication;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);privateApplication=jest.fn(()=><div>Gate autenticado</div>);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
// eslint-disable-next-line testing-library/no-unnecessary-act
const mount=()=>act(async()=>root.render(<ApplicationEntry Application={privateApplication}/>));
test('fallback público não monta o gate mesmo com sessão já existente e sobrevive ao refresh',async()=>{
  window.history.replaceState(null,'','/?public=1');await mount();
  expect(host.textContent).toContain('Home pública existente');expect(privateApplication).not.toHaveBeenCalled();
  expect(host.querySelector('a[href="/area-cliente"]')).not.toBeNull();expect(host.querySelector('a[href="/"]')).not.toBeNull();
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async()=>{root.unmount();root=createRoot(host);});await mount();
  expect(window.location.search).toBe('?public=1');expect(privateApplication).not.toHaveBeenCalled();
});
test.each(['/','/area-cliente','/minha-conta','/meus-pedidos','/admin/customer-preview/customer-a','/?public=0'])('rota normal %s conserva o gate atual',async path=>{
  window.history.replaceState(null,'',path);await mount();expect(privateApplication).toHaveBeenCalled();expect(host.textContent).toBe('Gate autenticado');
});
test('home pública mantém ampliação das imagens existentes',async()=>{
  window.history.replaceState(null,'','/?public=1');await mount();await act(async()=>host.querySelector('button').click());
  expect(host.querySelector('[role="dialog"] img').getAttribute('src')).toBe('/slide/slide1.png');
  await act(async()=>host.querySelector('[role="dialog"] button').click());expect(host.querySelector('[role="dialog"]')).toBeNull();
});
