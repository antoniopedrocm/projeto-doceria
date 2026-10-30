import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {httpsCallable} from 'firebase/functions';
import OrderAdminHistory,{OrderPaymentAdjustment} from './OrderAdminHistory';
jest.mock('firebase/functions',()=>({httpsCallable:jest.fn()}));
jest.mock('../../firebaseConfig',()=>({functions:{}}));
let host,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
// Actual ReactDOM renderer: no Testing Library render helper.
// eslint-disable-next-line testing-library/no-unnecessary-act
const draw=async element=>act(async()=>root.render(element));
test('histórico mostra data, dois autores, antes/depois, inclusão/remoção/quantidade em ordem cronológica',async()=>{
 const event=(revision,actorName,changes)=>({id:String(revision),revision,actorName,createdAt:'2026-10-30T13:32:00Z',source:'CRM_EDIT_ORDER',changes});
 httpsCallable.mockReturnValue(async()=>({data:{events:[event(2,'Staff B',[{field:'itens',before:[{produtoId:'a',nome:'Brownie',quantity:1},{produtoId:'b',nome:'Bolo',quantity:1}],after:[{produtoId:'a',nome:'Brownie',quantity:3},{produtoId:'c',nome:'Doce',quantity:1}]}]),event(1,'Staff A',[{field:'status',before:'Pendente',after:'Em Produção'},{field:'desconto',before:0,after:10}])],nextCursor:null}}));
 await draw(<OrderAdminHistory order={{id:'fixture',lojaId:'store'}}/>);
 expect(host.textContent).toContain('Histórico de alterações');expect(host.textContent.indexOf('Staff A')).toBeLessThan(host.textContent.indexOf('Staff B'));
 for(const text of ['Pendente → Em Produção','Brownie: 1 → 3','Produto removido: − 1x Bolo','Produto adicionado: + 1x Doce'])expect(host.textContent).toContain(text);
 expect(host.querySelectorAll('input,select,textarea')).toHaveLength(0);
});
test('divergência exibe valor original, total e diferença; não oferece cobrança/estorno',async()=>{
 await draw(<OrderPaymentAdjustment order={{paymentId:'p',payment_status:'PAID',total:12,adminPaymentAdjustment:{paidCents:1000}}}/>);
 expect(host.textContent).toContain('Pedido alterado após pagamento confirmado');expect(host.textContent).toContain('Valor pago');expect(host.textContent).toContain('Novo total');expect(host.textContent).toContain('Diferença');expect(host.querySelectorAll('button,a')).toHaveLength(0);
 await draw(<OrderPaymentAdjustment order={{paymentId:'p',payment_status:'PAID',total:10}}/>);expect(host.textContent).toBe('');
});
test('falha de leitura permite retry e não apresenta detalhes internos',async()=>{
 httpsCallable.mockReturnValue(jest.fn().mockRejectedValueOnce(Error('private stack')).mockResolvedValueOnce({data:{events:[],nextCursor:null}}));await draw(<OrderAdminHistory order={{id:'fixture',lojaId:'store'}}/>);expect(host.textContent).toContain('Não foi possível');expect(host.textContent).not.toContain('private stack');await act(async()=>host.querySelector('button').click());expect(host.textContent).toContain('Nenhuma alteração registrada');
});
