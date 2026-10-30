const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parse}=require('../node_modules/@babel/parser');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/App.js'),'utf8');
const ast=parse(source,{sourceType:'module',plugins:['jsx']});
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const v of Object.values(node)){for(const child of Array.isArray(v)?v:[v]){if(child&&typeof child==='object'){const found=find(child,predicate);if(found)return found;}}}return null;}
const pedidos=find(ast,n=>n.type==='VariableDeclarator'&&n.id.name==='Pedidos');
const handler=find(pedidos.init,n=>n.type==='VariableDeclarator'&&n.id.name==='handleSubmit').init;
function setup(overrides={}){
 const calls=[],state={};const bindings={isSavingOrder:false,editingOrder:{id:'order',lojaId:'matriz',paymentId:'payment',status:'Pendente'},formData:{status:'Finalizado'},
 setIsSavingOrder:value=>state.saving=value,setSaveOrderError:value=>state.error=value,assertWritableRole:()=>{},ensureAuthenticatedUserForWrite:async()=>({uid:'staff'}),resolveStoreIdsForView:()=>['matriz'],userHasPermission:()=>true,
 saveOnlineOrderStatus:async args=>calls.push(args),db:{},runTransaction:()=>{},getStoreDocRef:(store,section,id)=>({path:`lojas/${store}/${section}/${id}`}),getStoreCollectionRef:()=>({}),doc:()=>({}),serverTimestamp:()=>{},
 setShowModal:value=>state.open=value,resetForm:()=>state.reset=true,mapCriticalWriteErrorMessage:e=>e.message,...overrides};
 return {calls,state,run:()=>vm.runInNewContext('('+source.slice(handler.start,handler.end)+')',bindings)({preventDefault(){}})};
}
test('submit real do CRM usa status isolado antes de revalidar cliente/catálogo/estoque',async()=>{
 const {calls,state,run}=setup();await run();assert.equal(calls.length,1);assert.equal(calls[0].status,'Finalizado');assert.equal(calls[0].storeId,'matriz');assert.equal(state.open,false);assert.equal(state.saving,false);assert.equal(state.reset,true);
 // No data.clientes/reloadOrderCriticalData/persistOrderWithTransaction bindings:
 // falling into the historical repricing flow would fail this test.
});
test('escopo de loja, capability e erro remoto mantêm formulário aberto e liberam loading',async()=>{
 for(const overrides of [{resolveStoreIdsForView:()=>['garavelo']},{userHasPermission:()=>false},{saveOnlineOrderStatus:async()=>{throw Error('conflito');}}]){
 const {state,run}=setup(overrides);await run();assert.ok(state.error);assert.equal(state.open,undefined);assert.equal(state.saving,false);
 }
});
test('segundo submit enquanto salva não inicia outra operação',async()=>{const {calls,run}=setup({isSavingOrder:true});await run();assert.equal(calls.length,0);});
test('abrir edição de pedido online preserva snapshot e não recalcula totais',()=>{
 const edit=find(pedidos.init,n=>n.type==='VariableDeclarator'&&n.id.name==='handleEdit').init;
 const order={paymentId:'payment',status:'Pendente',total:1,itens:[{preco:1,quantity:1}]},state={};
 vm.runInNewContext('('+source.slice(edit.start,edit.end)+')',{setEditingOrder:()=>{},setClientSelectionError:()=>{},setSaveOrderError:()=>{},setOrderSyncNotice:()=>{},setFormData:value=>state.form=value,setShowModal:value=>state.open=value})(order);
 assert.equal(state.form.total,1);assert.equal(state.form.itens,order.itens);assert.equal(state.open,true);
});
