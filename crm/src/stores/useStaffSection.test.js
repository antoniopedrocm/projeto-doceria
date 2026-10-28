import React,{act,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import useStaffSection,{staffSectionKey,reconcileStaffSection} from './useStaffSection';
import {staffStoreSelectionKey,reconcileStoreSelection} from './staffDirectory';
import {clearStaffUiState} from '../customer/staffUiState';

const sections=['pagina-inicial','nota-fiscal','clientes','financeiro','pedidos','produtos'];
let host,root;
function Screen({uid='a',ready=true,allowed=sections}) {
  const [section,setSection]=useStaffSection(uid);
  const effective=reconcileStaffSection(section,sections,id=>ready && allowed.includes(id));
  useEffect(()=>{if(ready && uid && section!==effective)setSection(effective);},[ready,uid,section,effective,setSection]);
  return <div><output>{effective}</output>{sections.map(id=><button key={id} onClick={()=>setSection(id)}>{id}</button>)}</div>;
}
// eslint-disable-next-line testing-library/no-unnecessary-act
const render=props=>act(async()=>root.render(<Screen {...props}/>));
const shown=()=>host.querySelector('output').textContent;
async function choose(id){await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===id).click());}
async function refresh(props){await act(async()=>root.unmount());clearStaffUiState();root=createRoot(host);await render(props);}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();sessionStorage.clear();});

test.each(sections)('%s survives the real gate cleanup and remount alongside the selected store',async section=>{
  sessionStorage.setItem(staffStoreSelectionKey('a'),JSON.stringify('store-a'));
  sessionStorage.setItem('financeiro_startDate','private-draft');
  await render();await choose(section);await refresh();
  expect(shown()).toBe(section);expect(JSON.parse(sessionStorage.getItem(staffSectionKey('a')))).toBe(section);
  const store=JSON.parse(sessionStorage.getItem(staffStoreSelectionKey('a')));
  expect(reconcileStoreSelection(store,['store-a'],{role:'dono'},'all')).toBe('store-a');
  expect(sessionStorage.getItem('financeiro_startDate')).toBeNull();
});
test('does not overwrite navigation before capability hydration or during unrelated store/Customer updates',async()=>{
  sessionStorage.setItem(staffSectionKey('a'),JSON.stringify('nota-fiscal'));
  await render({ready:false});expect(shown()).toBe('pagina-inicial');
  expect(JSON.parse(sessionStorage.getItem(staffSectionKey('a')))).toBe('nota-fiscal');
  await render({ready:true});expect(shown()).toBe('nota-fiscal');
  await render({ready:true});expect(shown()).toBe('nota-fiscal');
});
test.each(['not-a-section','/admin/customer-preview/target/orders','financeiro'])('invalid or revoked section %s fails closed and reconciles the preference',async section=>{
  sessionStorage.setItem(staffSectionKey('a'),JSON.stringify(section));
  await render({allowed:['pagina-inicial','clientes']});expect(shown()).toBe('pagina-inicial');
  expect(JSON.parse(sessionStorage.getItem(staffSectionKey('a')))).toBe('pagina-inicial');
});
test('permission revocation never mounts the protected section; reauthorization does not restore it silently',async()=>{
  await render();await choose('financeiro');expect(shown()).toBe('financeiro');
  await render({allowed:['pagina-inicial']});expect(shown()).toBe('pagina-inicial');
  await render();expect(shown()).toBe('pagina-inicial');
});
test('another UID and Guest never inherit navigation; the old global key is not migrated',async()=>{
  sessionStorage.setItem('currentPage',JSON.stringify('financeiro'));await render();expect(shown()).toBe('pagina-inicial');
  await choose('clientes');await render({uid:'b'});expect(shown()).toBe('pagina-inicial');
  await choose('pedidos');await render({uid:null});expect(shown()).toBe('pagina-inicial');
  await render({uid:'a'});expect(shown()).toBe('clientes');
  expect(JSON.parse(sessionStorage.getItem(staffSectionKey('b')))).toBe('pedidos');
});
test.each(['{broken','123','null','{"section":"financeiro"}'])('malformed storage %s safely falls back',async value=>{
  sessionStorage.setItem(staffSectionKey('a'),value);await render();expect(shown()).toBe('pagina-inicial');
});
test('blocked browser storage still allows navigation in memory',async()=>{
  const get=jest.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked');});
  const set=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked');});
  try {await render();await choose('nota-fiscal');expect(shown()).toBe('nota-fiscal');}
  finally {get.mockRestore();set.mockRestore();}
});
