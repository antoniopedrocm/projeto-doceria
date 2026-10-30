const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),React=require(root+'/node_modules/react'),{parse}=require(root+'/node_modules/@babel/parser'),{transformSync}=require(root+'/node_modules/@babel/core');
const source=fs.readFileSync(root+'/src/App.js','utf8'),ast=parse(source,{sourceType:'module',plugins:['jsx']});
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const v of Object.values(node))for(const child of Array.isArray(v)?v:[v]){const found=find(child,predicate);if(found)return found;}return null;}
const jsx=find(ast,n=>n.type==='JSXElement'&&n.openingElement.name.name==='Modal'&&source.slice(n.openingElement.start,n.openingElement.end).includes('Atualizar status do pedido'));
const compile=code=>transformSync(code,{babelrc:false,configFile:false,plugins:[require.resolve(root+'/node_modules/@babel/plugin-transform-react-jsx')]}).code;
function fixture({mode='FULL',paid=true}={}){
 const no=()=>{},order={id:'fixture',lojaId:'fixture-store',clienteId:'customer-fixture',clienteNome:'Cliente de demonstração',status:'Em Produção',categoria:'Delivery',formaPagamento:paid?'Pix online':'A combinar',observacao:'Observação de demonstração',itens:[{id:'brownie',produtoId:'brownie',nome:'Achadinho de brownie',preco:10,quantity:1}],subtotal:10,desconto:0,total:10,...(paid?{paymentId:'payment-fixture',payment_status:'PAID',ownerUid:'customer-fixture'}:{paymentMode:'AGREED_LATER'})};
 const context=vm.createContext({React,...require(root+'/node_modules/lucide-react'),showModal:true,isSavingOrder:false,editingOrder:order,orderEditMode:mode,formData:{...order},data:{clientes:[{id:order.clienteId,nome:order.clienteNome}]},clientSelectionError:'',filteredProducts:[{id:'cake',nome:'Bolo no pote',preco:16}],productSearchTerm:'',descontoValor:'',descontoPercentual:'',orderSyncNotice:'',saveOrderError:'',OPERATIONAL_ORDER_STATUSES:['Pendente','Em Produção','Pronto para Entrega','Finalizado','Cancelado'],ORDER_PAYMENT_OPTIONS:['Pix','Dinheiro','Cartão de Crédito','Cartão de Débito'],getTodayString:()=> '2026-10-30',getClientPrimaryAddressText:()=>'',SearchableClientSelect:props=>React.createElement('div',{className:'space-y-1'},React.createElement('label',{className:'text-sm font-medium'},'Cliente'),React.createElement('input',{value:props.clients[0].nome,readOnly:true,disabled:props.disabled,className:'w-full px-4 py-3 border rounded-xl'})),OrderAdminHistory:()=>React.createElement('section',{className:'rounded-xl border p-4'},React.createElement('h3',{className:'font-semibold'},'Histórico de alterações'),React.createElement('p',null,'Exemplo local — eventos validados nos testes de integração.')),OrderPaymentAdjustment:()=>null,
 setShowModal:no,resetForm:no,handleSubmit:no,handleAddItemToOrder:no,handleRemoveItemFromOrder:no,handleApplyDiscount:no,setProductSearchTerm:no,setDescontoValor:no,setDescontoPercentual:no,setFormData:no});
 for(const name of ['Modal','Button','Input','Textarea','Select']){const node=find(ast,n=>n.type==='VariableDeclarator'&&n.id.name===name);context[name]=vm.runInContext(compile('('+source.slice(node.init.start,node.init.end)+')'),context);}
 const element=vm.runInContext(compile('('+source.slice(jsx.start,jsx.end)+')'),context);
 return {element,order};
}
function paymentTotal(row) {
 const pedidos=find(ast,n=>n.type==='VariableDeclarator'&&n.id.name==='Pedidos');
 const columns=find(pedidos.init,n=>n.type==='VariableDeclarator'&&n.id.name==='columns').init;
 const total=columns.elements.find(n=>n.properties?.some(p=>p.key.name==='header'&&p.value.value==='Total'));
 const render=total.properties.find(p=>p.key.name==='render').value;
 return vm.runInNewContext(compile('('+source.slice(render.start,render.end)+')'),{React})(row);
}
module.exports={fixture,paymentTotal};
