import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ApplicationGate from './ApplicationGate';
import {auth,getDoc} from '../firebaseConfig';
import {customerAuth,runtimeFor} from './customerRuntime';
import {onIdTokenChanged} from 'firebase/auth';
jest.mock('../firebaseConfig',()=>({auth:{currentUser:null},db:{},getDoc:jest.fn()}));
jest.mock('./customerRuntime',()=>({customerAuth:{currentUser:null},runtimeFor:jest.fn(()=>({functions:{},httpsCallable:()=>jest.fn(async()=>({data:{customer:{id:'own'}}}))}))}));
jest.mock('firebase/firestore',()=>({doc:jest.fn((_,...path)=>path.join('/'))}));
jest.mock('firebase/auth',()=>({onIdTokenChanged:jest.fn(),signOut:jest.fn()}));
jest.mock('./CustomerShell',()=>({__esModule:true,default:({uid})=><div>Customer:{uid||'login'}</div>}));
const identity=(uid,provider='google.com')=>({uid,providerData:[{providerId:provider}],isAnonymous:false});
let host,root,listeners,staff;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);listeners=new Map();runtimeFor.mockImplementation(()=>({functions:{},httpsCallable:()=>async()=>({data:{customer:{id:'own'}}})}));staff=jest.fn(()=><div>Staff administrativo</div>);auth.currentUser=null;customerAuth.currentUser=null;window.history.replaceState(null,'','/');getDoc.mockResolvedValue({exists:()=>false});onIdTokenChanged.mockImplementation((a,fn)=>{listeners.set(a,fn);return jest.fn();});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
// Direct ReactDOM rendering needs act; this helper does not use Testing Library.
// eslint-disable-next-line testing-library/no-unnecessary-act
const mount=()=>act(async()=>root.render(<ApplicationGate StaffApplication={staff}/>));
async function emit(a,u){a.currentUser=u;await act(async()=>listeners.get(a)(u));}
test('Staff existente conserva aplicação administrativa; UID com ambos os contextos prioriza Staff',async()=>{getDoc.mockResolvedValue({exists:()=>true,data:()=>({role:'gerente',ativo:true})});await mount();await emit(auth,identity('staff'));await emit(customerAuth,identity('staff'));expect(host.textContent).toContain('Staff administrativo');expect(staff.mock.calls.at(-1)[0].staffUid).toBe('staff');});
test.each(['/configuracoes','/financeiro','/clientes','/produtos','/pedidos','/usuarios','/dashboard'])('Customer não monta CRM em %s',async path=>{window.history.replaceState(null,'',path);await mount();await emit(auth,null);await emit(customerAuth,identity('customer'));expect(host.textContent).toBe('Customer:customer');expect(staff).not.toHaveBeenCalled();});
test.each(['google.com','password'])('Customer %s na sessão principal também não ganha Staff',async provider=>{await mount();await emit(customerAuth,null);await emit(auth,identity('customer',provider));expect(host.textContent).toBe('Customer:customer');expect(staff).not.toHaveBeenCalled();});
test('perfil administrativo inativo não cai em permissões de Customer ou cache Staff',async()=>{getDoc.mockResolvedValue({exists:()=>true,data:()=>({role:'dono',ativo:false})});await mount();await emit(auth,identity('staff'));await emit(customerAuth,null);expect(host.textContent).toContain('Não foi possível autorizar');expect(staff).not.toHaveBeenCalled();});
test('leitura Staff tardia de A é ignorada após troca para Customer B',async()=>{let finish;getDoc.mockReturnValue(new Promise(resolve=>{finish=resolve;}));await mount();await emit(customerAuth,null);await emit(auth,identity('staff-a'));await emit(auth,null);await emit(customerAuth,identity('b'));await act(async()=>finish({exists:()=>true,data:()=>({role:'dono'})}));expect(host.textContent).toBe('Customer:b');expect(staff.mock.calls.some(([props])=>props.staffUid)).toBe(false);});
test('logout remove contexto privado; visitante/celular não liberam rotas Customer',async()=>{window.history.replaceState(null,'','/minha-conta');await mount();await emit(auth,null);await emit(customerAuth,identity('a'));expect(host.textContent).toBe('Customer:a');await emit(customerAuth,null);expect(host.textContent).toBe('Customer:login');await emit(customerAuth,identity('phone','phone'));expect(host.textContent).toBe('Customer:login');});

test.each(['phone','anonymous'])('identidade %s não recebe área privada nem Staff',async provider=>{window.history.replaceState(null,'','/minha-conta');await mount();await emit(auth,null);await emit(customerAuth,{...identity('legacy',provider),isAnonymous:provider==='anonymous'});expect(host.textContent).toBe('Customer:login');expect(staff).not.toHaveBeenCalled();});
test('falha de validação server-side fecha acesso, sem fallback administrativo',async()=>{runtimeFor.mockImplementation(()=>({functions:{},httpsCallable:()=>async()=>{throw Error('unavailable');}}));await mount();await emit(auth,null);await emit(customerAuth,identity('customer'));expect(host.querySelector('[role="alert"]')).not.toBeNull();expect(staff).not.toHaveBeenCalled();expect(host.textContent).not.toContain('Customer:customer');});
test('Staff que também é Customer pode abrir rota Customer sem herdar permissões',async()=>{window.history.replaceState(null,'','/minha-conta');getDoc.mockResolvedValue({exists:()=>true,data:()=>({role:'admin',ativo:true})});await mount();await emit(auth,identity('both'));await emit(customerAuth,null);expect(host.textContent).toBe('Customer:both');expect(staff).not.toHaveBeenCalled();});

test('renovação de token do mesmo Staff preserva a tela enquanto revalida autorização',async()=>{getDoc.mockResolvedValue({exists:()=>true,data:()=>({role:'admin',ativo:true})});await mount();await emit(auth,identity('staff'));await emit(customerAuth,null);let finish;getDoc.mockReturnValue(new Promise(resolve=>{finish=resolve;}));await emit(auth,identity('staff'));expect(host.textContent).toContain('Staff administrativo');await act(async()=>finish({exists:()=>true,data:()=>({role:'admin',ativo:true})}));expect(host.textContent).toContain('Staff administrativo');});
