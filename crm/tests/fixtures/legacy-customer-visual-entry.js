// Local-only read-only fixture. No Firebase, OTP, real customer or payment call.
import React from 'react';
import {createRoot} from 'react-dom/client';
import LegacyCustomerShell from '../../src/customer/LegacyCustomerShell';
import '../../src/index.css';
const id='abcdef0123456789'.repeat(4);
const customer={id:'fictional-customer',nome:'Cliente Fictício',telefone:'62999990000',aniversario:'',enderecos:[{id:'fake-address',nickname:'Casa fictícia',enderecoCompleto:'Rua fictícia,100 · Bairro de testes',isDefault:true}]};
const orders=Array.from({length:3},(_,i)=>({id:id.slice(0,63)+i,number:id.slice(0,63)+i,storeId:'fixture-store',storeName:'Loja fictícia',createdAt:'2026-11-04T12:00:00Z',status:'Confirmado',total:12.5}));
const request=async(_base,_session,method)=>{
  if(method==='account')return {customer};
  if(method==='orders')return {orders,hasMore:false};
  if(method==='orderDetail')return {order:{...orders[0],payment_status:'Pendente',itens:[{nome:'Produto fictício com referência '+id,quantity:1,total:12.5}],endereco:'Endereço fictício',modalidade:'retirada',subtotal:12.5,desconto:0,frete:0}};
  throw Error('Fixture prohibits mutations');
};
const session={purpose:'CUSTOMER_PRIVATE_SESSION',storeId:'fixture-store',expiresAt:Date.now()+3600000};
const before=new URLSearchParams(window.location.search).has('before');
createRoot(document.getElementById('root')).render(<>
  <p style={{margin:0,padding:8,fontSize:12}}>FIXTURE LOCAL · Dados fictícios · sem Firebase/SMS/pagamento</p>
  {before && <style>{'.customer-phone-orders [data-profile] .customer-panel{overflow-wrap:normal}'}</style>}
  <LegacyCustomerShell session={session} apiBase="/fixture-no-api" request={request} onLogout={()=>window.location.assign('/area-cliente')}/>
</>);
