/* eslint-disable testing-library/no-unnecessary-act -- Uses native React DOM, not Testing Library; act is required for root.render/unmount. */
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
import FiscalOrderPaymentField from './FiscalOrderPaymentField';
const Select=({label,...props})=><label>{label}<select {...props}/></label>;
let container,root;
global.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(()=>{container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('pedido a combinar exibe select obrigatório, label e opções; seleção chega ao handler',()=>{
  const onChange=jest.fn();
  act(()=>root.render(<FiscalOrderPaymentField order={{paymentMode:'AGREED_LATER',paymentMethod:null}} Select={Select} options={['Pix','Dinheiro']} onChange={onChange}/>));
  const select=container.querySelector('select');expect(select.required).toBe(true);expect(select.value).toBe('');
  expect([...select.options].map(o=>o.textContent)).toEqual(['Selecione...','Pix','Dinheiro']);
  act(()=>Simulate.change(select,{target:{value:'Dinheiro'}}));expect(onChange).toHaveBeenCalledTimes(1);
});
test.each([{paymentMode:'ONLINE_NOW',paymentMethod:'PIX',formaPagamento:'Pix online'}, {paymentMode:'AGREED_LATER',paymentMethod:'CASH',formaPagamento:'Dinheiro'}, {formaPagamento:'Cartão de Crédito'}])('método definido/histórico não oferece override: %o',order=>{
  act(()=>root.render(<FiscalOrderPaymentField order={order}/>));expect(container.querySelector('select')).toBeNull();expect(container.textContent).toBe(order.formaPagamento);
});
test('somente leitura não permite selecionar método',()=>{
  act(()=>root.render(<FiscalOrderPaymentField order={{paymentMode:'AGREED_LATER'}} Select={Select} options={['Pix']} disabled/>));expect(container.querySelector('select').disabled).toBe(true);
});
