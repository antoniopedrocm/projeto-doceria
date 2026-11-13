/* eslint-disable testing-library/no-unnecessary-act -- Native React DOM roots require act. */
import React,{act,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import {parse} from '@babel/parser';
import {transformSync} from '@babel/core';
import ReceiveOrderPayment from './components/orders/ReceiveOrderPayment';
import {httpsCallable} from 'firebase/functions';
jest.mock('firebase/functions',()=>({httpsCallable:jest.fn()}));
const source=fs.readFileSync(path.join(__dirname,'App.js'),'utf8');
const ast=parse(source,{sourceType:'module',plugins:['jsx']});
let staff,pedidos,modal,state;
function visit(n){if(!n||typeof n!=='object')return;
 if(n.type==='FunctionDeclaration'&&n.id?.name==='StaffApplication')staff=n;
 if(n.type==='VariableDeclarator'&&n.id?.name==='Pedidos')pedidos=n;
 if(n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.type==='ArrayPattern'&&d.id.elements[0]?.name==='receivingOrder'))state=n;
 if(n.type==='JSXElement'&&n.openingElement.name.name==='Modal'&&source.slice(n.start,n.openingElement.end).includes('isOpen={!!receivingOrder}'))modal=n;
 Object.values(n).forEach(v=>Array.isArray(v)?v.forEach(visit):visit(v));
}visit(ast);
const clear=staff.body.body.find(n=>n.type==='ExpressionStatement'&&source.slice(n.start,n.end).includes('useEffect(()=>setReceivingOrder(null)'));
if(!state||!modal||!clear||(state.start>pedidos.start&&state.end<pedidos.end)||(modal.start>pedidos.start&&modal.end<pedidos.end))throw Error('Receipt dialog must belong to stable Staff root, not the remounting Pedidos component.');
const compiled=transformSync('const View=({tick=0,selectedStoreId="matriz",staffUid="staff",currentPage="pedidos"})=>{'+source.slice(state.start,state.end)+source.slice(clear.start,clear.end)+';const UnstableTable=()=> <button onClick={()=>setReceivingOrder(order)}>Abrir</button>;return <><UnstableTable/>'+source.slice(modal.start,modal.end)+'</>}',{babelrc:false,configFile:false,presets:[require.resolve('@babel/preset-react')]}).code;
const order={id:'synthetic',lojaId:'matriz',status:'Finalizado',paymentMode:'AGREED_LATER',paymentStatus:'PENDING',total:14.78,formaPagamento:'Cartão de Crédito'};
const Modal=({isOpen,children})=>isOpen?<div role="dialog">{children}</div>:null;
// Evaluate the actual root hooks/modal, with the same unstable table lifetime as the CRM.
// eslint-disable-next-line no-new-func
const View=new Function('React','useState','useEffect','ReceiveOrderPayment','Modal','functions','refreshCustomersRef','order',compiled+';return View;')(React,useState,useEffect,ReceiveOrderPayment,Modal,{}, {current:jest.fn()},order);
let container,root;const prior=global.IS_REACT_ACT_ENVIRONMENT;
beforeAll(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;});afterAll(()=>{global.IS_REACT_ACT_ENVIRONMENT=prior;});
beforeEach(()=>{container=document.createElement('div');document.body.append(container);root=createRoot(container);jest.clearAllMocks();});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('directory/order polling does not close the receipt dialog or reset its explicit confirmation',()=>{
 act(()=>root.render(<View/>));act(()=>container.querySelector('button').click());act(()=>container.querySelector('input[type="checkbox"]').click());
 [1,2,3].forEach(tick=>act(()=>root.render(<View tick={tick}/>)));
 expect(container.querySelector('[role="dialog"]')).not.toBeNull();expect(container.querySelector('input[type="checkbox"]').checked).toBe(true);expect(container.querySelector('select').value).toBe('Cartão de Crédito');expect(httpsCallable).not.toHaveBeenCalled();
});
test.each([{selectedStoreId:'garavelo'},{staffUid:'other-staff'},{currentPage:'clientes'}])('changing the authorized navigation context closes the receipt dialog (%j)',context=>{
 act(()=>root.render(<View/>));act(()=>container.querySelector('button').click());expect(container.querySelector('[role="dialog"]')).not.toBeNull();act(()=>root.render(<View {...context}/>));expect(container.querySelector('[role="dialog"]')).toBeNull();expect(httpsCallable).not.toHaveBeenCalled();
});
