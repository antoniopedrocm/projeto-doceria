import React from 'react';
import {createRoot} from 'react-dom/client';
import {act as legacyAct} from 'react-dom/test-utils';
import fs from 'fs';
import path from 'path';
import {parse} from '@babel/parser';
import {transformSync} from '@babel/core';
const source=fs.readFileSync(path.join(__dirname,'App.js'),'utf8');
const act=React.act || legacyAct;
const priorActEnvironment=global.IS_REACT_ACT_ENVIRONMENT;
beforeAll(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;});
afterAll(()=>{global.IS_REACT_ACT_ENVIRONMENT=priorActEnvironment;});
const ast=parse(source,{sourceType:'module',plugins:['jsx']});let node;
function walk(n){if(!n || typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id.name==='Clientes')node=n.init;Object.values(n).forEach(v=>Array.isArray(v)?v.forEach(walk):walk(v));}walk(ast);
const compiled=transformSync('const View='+source.slice(node.start,node.end),{babelrc:false,configFile:false,presets:[require.resolve('@babel/preset-react')]}).code;
function view(clients,general,store,{diagnostics=false,issues=[],operational=[],operationalStore=store}={}){
  const icon=()=>null,stub=()=>null;
  const bindings={React,useState:React.useState,useMemo:React.useMemo,usePersistentState:(_,value)=>React.useState(value),
    data:{clientes:clients},isGeneralViewSelected:general,selectedStoreIdForAlarm:store,
    user:{role:'dono',permissions:{}},customerDirectoryDiagnosticsAllowed:diagnostics,customerDirectoryIssues:issues,customerDirectoryError:'',refreshCustomersRef:{current:jest.fn()},
    canPreviewCustomer:()=>false,setConfirmDelete:jest.fn(),Button:({children,...props})=><button {...props}>{children}</button>,
    Modal:stub,Input:stub,Select:stub,Search:icon,Plus:icon,Edit:icon,Trash2:icon,Eye:icon,Save:icon,
    getJSDate:value=>new Date(value),Table:({columns,data,actions})=><table><tbody>{data.map(row=><tr key={row.id} data-customer={row.id}>{columns.map((col,i)=><td key={i}>{col.render?col.render(row):row[col.key]}</td>)}<td>{actions.filter(action=>!action.isVisible || action.isVisible(row)).map(action=><button key={action.label}>{action.label}</button>)}</td></tr>)}</tbody></table>};
  // Exercise the existing Clientes component, not a duplicate rendering implementation.
  // eslint-disable-next-line no-new-func
  const View=new Function(...Object.keys(bindings),compiled+';return View;')(...Object.values(bindings));
  return ()=> <View userId="tester" selectedStoreId={store}
    operationalDirectory={{userId:'tester',selectedStoreId:operationalStore,clients:operational}} />;
}
const rows=[{id:'both',nome:'Ambas',hasStorePurchases:true,valorEmCompras:70,ultimaCompra:'2026-11-02T12:00:00Z',metricasComprasPorLoja:{matriz:{valorEmCompras:30,ultimaCompra:'2026-11-01T12:00:00Z'},garavelo:{valorEmCompras:40,ultimaCompra:'2026-11-02T12:00:00Z'}}},
  {id:'noOrders',nome:'Sem compras',hasStorePurchases:false,valorEmCompras:0}];
let container,root;
beforeEach(()=>{container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test.each([['matriz','30.00','01/11/2026'],['garavelo','40.00','02/11/2026']])('actual table uses only %s metrics and excludes registration without purchases',(store,total,date)=>{
  // Native ReactDOM roots require act; this is not a Testing Library render helper.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  const View=view(rows,false,store);act(()=>root.render(<View/>));
  expect(container.querySelectorAll('[data-customer]')).toHaveLength(1);
  expect(container.querySelector('[data-customer="both"]').textContent).toContain('R$ '+total);
  expect(container.querySelector('[data-customer="both"]').textContent).toContain(date);
});
test('Visão Geral retains canonical Customer without orders and consolidated amount once',()=>{
  // Native ReactDOM roots require act; this is not a Testing Library render helper.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  const View=view(rows,true,null);act(()=>root.render(<View/>));
  expect(container.querySelectorAll('[data-customer]')).toHaveLength(2);
  expect(container.querySelector('[data-customer="both"]').textContent).toContain('R$ 70.00');
  expect(container.querySelector('[data-customer="noOrders"]').textContent).toContain('R$ 0.00');
});
test('store history and new Staff registration are visible without global profile actions',()=>{
  const operational=[
    {id:'historico:1',nome:'Compra legada',operationalOnly:true,hasStoreHistory:true},
    {id:'historico:2',nome:'Registro novo',operationalOnly:true,staffRegistered:true},
  ];
  // eslint-disable-next-line testing-library/no-unnecessary-act
  const View=view(rows,false,'matriz',{operational});act(()=>root.render(<View/>));
  expect(container.querySelector('[data-customer="historico:1"]').textContent).toContain('Histórico da loja');
  expect(container.querySelector('[data-customer="historico:2"]').textContent).toContain('Cadastro da loja');
  expect(container.querySelector('[data-customer="historico:1"] button')).toBeNull();
  expect(container.querySelector('[data-customer="historico:2"] button')).toBeNull();
});
test('previous store operational data is never rendered after a store switch',()=>{
  const operational=[{id:'historico:1',nome:'Compra legada',operationalOnly:true,hasStoreHistory:true}];
  // eslint-disable-next-line testing-library/no-unnecessary-act
  const View=view(rows,false,'garavelo',{operational,operationalStore:'matriz'});act(()=>root.render(<View/>));
  expect(container.querySelector('[data-customer="historico:1"]')).toBeNull();
});
test('completed agreed-later Customer appears with separate pending amount/date and no blank status',()=>{
  const row={id:'agreed',nome:'Cliente sintético',hasStoreHistory:true,hasStorePurchases:false,metricasComprasPorLoja:{matriz:{valorEmCompras:0,ultimaCompra:null,valorPendente:29.56,pedidosPendentes:2,ultimoPedidoPendente:'2026-11-08T20:00:00Z'}}};
  // eslint-disable-next-line testing-library/no-unnecessary-act
  const View=view([row],false,'matriz');act(()=>root.render(<View/>));
  const text=container.querySelector('[data-customer="agreed"]').textContent;
  expect(text).toContain('R$ 0.00');expect(text).toContain('Acumulado confirmado');expect(text).toContain('R$ 29.56 pendentes');expect(text).toContain('pagamento pendente');expect(text).toContain('08/11/2026');expect(text).toContain('Não informado');
});
test.each([false,true])('technical diagnostics require the server-authorized flag (%s)',diagnostics=>{
  // eslint-disable-next-line testing-library/no-unnecessary-act
  const View=view(rows,true,null,{diagnostics,issues:[{orderPath:'pedidos/synthetic',reason:'STORE_UNRESOLVED_OR_CONFLICTING'}]});act(()=>root.render(<View/>));
  expect(container.textContent.includes('pedidos/synthetic')).toBe(diagnostics);
});
