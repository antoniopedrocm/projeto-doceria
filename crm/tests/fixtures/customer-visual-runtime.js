// Local-only visual fixture. No Firebase initialization, credentials or remote data.
export const customer={id:'visual-customer',accountLinked:true,nome:'Ana Oliveira',telefone:'62900000000',aniversario:'1990-07-18',email:'cliente@example.test',emailVerified:true,
 enderecos:[{id:'visual-home',nickname:'Casa',nomeEndereco:'Casa',street:'Rua de Exemplo',number:'100',neighborhood:'Setor Central',city:'Goiânia',state:'GO',cep:'74000-000',enderecoCompleto:'Rua de Exemplo, 100',lat:-16,lng:-49,isDefault:true},
 {id:'visual-work',nickname:'Trabalho',nomeEndereco:'Trabalho',street:'Avenida de Exemplo',number:'200',neighborhood:'Setor Sul',city:'Goiânia',state:'GO',cep:'74000-000',enderecoCompleto:'Avenida de Exemplo, 200',lat:-16,lng:-49,isDefault:false}]};
export const order={id:'visual-order',number:'1042',storeId:'visual-store',storeName:'Loja de demonstração',createdAt:'2026-10-26T18:30:00Z',status:'CONFIRMED',payment_status:'PAID',formaPagamento:'Pagamento de demonstração',modalidade:'entrega',endereco:'Rua de Exemplo, 100 · Goiânia/GO',subtotal:89.8,desconto:5,frete:8,total:92.8,itens:[{productId:'visual-product',nome:'Bolo de chocolate',quantity:1,preco:64.9,total:64.9},{productId:'visual-product-2',nome:'Caixa de brigadeiros',quantity:1,preco:24.9,total:24.9}]};
export const sessionAuth={app:{name:'[DEFAULT]',options:{projectId:'demo-customer-visual'}},currentUser:{uid:'visual-user',isAnonymous:false,providerData:[{providerId:'password'}],getIdToken:async()=>{throw Error('No tokens in visual fixture');}}};
if(new URLSearchParams(window.location.search).has('login'))sessionAuth.currentUser=null;
export const calls=[];
export async function call(name){calls.push(name);if(name==='customerAccount')return {customer};if(name==='customerOrders')return {orders:[order],nextCursor:null};if(name==='customerOrderDetail')return {order};throw Error('Mutation blocked by local visual fixture');}
export const runtimeFor=()=>({auth:sessionAuth,functions:{},httpsCallable:(_functions,name)=>async()=>({data:await call(name)}),onAuthStateChanged:(_auth,listener)=>{queueMicrotask(()=>listener(sessionAuth.currentUser));return()=>{};},logout:logoutCanonicalSession});
export async function logoutCanonicalSession(){window.fixtureLogout=true;}
export const loadCustomerController=()=>import(/* webpackIgnore: true */ '/customer-account-core.mjs');
