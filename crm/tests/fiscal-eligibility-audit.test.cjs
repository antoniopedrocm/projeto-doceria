// Executes the real CRM selectors; no runtime rewrite, Firestore write or fiscal transmission.
process.env.TZ='America/Sao_Paulo';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parse}=require('../node_modules/@babel/parser');
const source=fs.readFileSync(path.join(__dirname,'../src/App.js'),'utf8'),ast=parse(source,{sourceType:'module',plugins:['jsx']}),nodes=new Map();
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'&&node.id?.type==='Identifier')nodes.set(node.id.name,node.init);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}}walk(ast);
function actual(name,bindings={}){let node=nodes.get(name);if(node?.type==='CallExpression'&&['useMemo','useCallback'].includes(node.callee.name))node=node.arguments[0];assert.ok(node,'Missing '+name);return vm.runInNewContext('('+source.slice(node.start,node.end)+')',{Date,Map,Set,...bindings});}
const getJSDate=actual('getJSDate'),parseDateInput=actual('parseDateInput'),isDateInRange=actual('isDateInRange',{getJSDate,parseDateInput});
const fixture=(extra={})=>({id:'fixture',status:'Finalizado',createdAt:'2026-10-30T02:04:19.115Z',formaPagamento:'A combinar',...extra});
const invoiceable=orders=>actual('invoiceableOrders',{orders})();
function listed(orders,filters={start:'2026-10-01',end:'2026-10-31',status:'all'}){
 const invoicesByOrderId=new Map(),matchesOrderInvoiceStatusFilter=actual('matchesOrderInvoiceStatusFilter',{orderFilters:filters,invoicesByOrderId});
 return actual('eligibleOrders',{invoiceableOrders:invoiceable(orders),orderSearch:'',normalizeSearchText:actual('normalizeSearchText'),onlyDigitsText:actual('onlyDigitsText'),isDateInRange,orderFilters:filters,matchesOrderInvoiceStatusFilter,invoicesByOrderId,getJSDate})();
}
test('pedido real e44896d8: Confirmado/Pago com status operacional Pendente não é fiscalmente elegível',()=>{
 const order=fixture({id:'e44896d85c33a815b9bd2a6d0f47fcfc762aff42fd97f0a30f9ec62e1c628268',status:'Pendente',order_status:'CONFIRMED',payment_status:'PAID',paymentMode:'ONLINE_NOW',paymentMethod:'PIX',formaPagamento:'Pix online'});
 assert.equal(invoiceable([order]).length,0);assert.equal(listed([order]).length,0);
 assert.equal(isDateInRange(order.createdAt,'2026-10-01','2026-10-31'),true);
 assert.equal(listed([{...order,status:'Finalizado'}]).length,1); // Local copy only; no update of the real order.
});
for(const [label,fields]of [['online Pix',{paymentMode:'ONLINE_NOW',paymentMethod:'PIX',payment_status:'PAID'}],['online cartão',{paymentMode:'ONLINE_NOW',paymentMethod:'CREDIT_CARD',payment_status:'PAID'}],['a combinar sem método',{paymentMode:'AGREED_LATER',paymentMethod:null,paymentStatus:'PENDING'}],['histórico Pix',{formaPagamento:'Pix'}],['histórico crédito',{formaPagamento:'Cartão de Crédito'}],['histórico dinheiro',{formaPagamento:'Dinheiro'}]])test(label+' entra na fila quando operacionalmente elegível, inclusive após refresh',()=>{
 const order=fixture(fields);assert.equal(listed([order]).length,1);assert.equal(listed(JSON.parse(JSON.stringify([order]))).length,1);
});
test('aprovação fiscal explícita e os status legados mantêm a mesma regra, independentemente de método',()=>{
 for(const status of ['Finalizado','Aprovado','ready_for_invoice','approved'])assert.equal(listed([fixture({status,paymentMode:'AGREED_LATER',paymentMethod:null})]).length,1);
 assert.equal(listed([fixture({status:'Pendente',approvedForInvoice:true,paymentMethod:null})]).length,1);
 assert.equal(listed([fixture({status:'Pendente',paymentMode:'AGREED_LATER',paymentMethod:null})]).length,0);
});
test('data Firestore válida é reconhecida no mês local; data inválida/fora do intervalo é excluída',()=>{
 const instant=new Date('2026-10-30T02:04:19.115Z');assert.equal(instant.getDate(),29);assert.equal(instant.getHours(),23);
 assert.equal(listed([fixture({createdAt:{toDate:()=>instant}})]).length,1);
 assert.equal(listed([fixture()],{start:'2026-11-01',end:'2026-11-30',status:'all'}).length,0);
 assert.equal(listed([fixture({createdAt:'invalid'})]).length,0);
});
test('escopo de coleção de pedidos mantém Matriz/Garavelo distintos, sem fallback',()=>{
 const buildStoreCollectionPath=actual('buildStoreCollectionPath',{CONFIG_COLLECTIONS:new Set(),CONFIG_DOC_ID:'config'});
 const getStoreCollectionRef=actual('getStoreCollectionRef',{db:{},collection:(_db,...segments)=>segments,buildStoreCollectionPath});
 for(const store of ['ana-guimaraes-doceria-matriz','ana-guimaraes-doceria-garavelo'])assert.deepEqual(Array.from(getStoreCollectionRef(store,'pedidos')),['lojas',store,'pedidos']);
});
