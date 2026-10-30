const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parse}=require('../node_modules/@babel/parser');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/App.js'),'utf8');
const ast=parse(source,{sourceType:'module',plugins:['jsx']});
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const v of Object.values(node)){for(const child of Array.isArray(v)?v:[v]){if(child&&typeof child==='object'){const found=find(child,predicate);if(found)return found;}}}return null;}
const pedidos=find(ast,n=>n.type==='VariableDeclarator'&&n.id.name==='Pedidos');
const handler=find(pedidos.init,n=>n.type==='VariableDeclarator'&&n.id.name==='handleSubmit').init;
function setup(overrides={}){
 const calls=[],state={};const bindings={isSavingOrder:false,orderEditFlight:{current:false},orderEditMode:'FULL',orderEditRequestId:{current:'request-fixture'},editingOrder:{id:'order',lojaId:'matriz',paymentId:'payment',status:'Pendente'},formData:{status:'Finalizado'},
 setIsSavingOrder:value=>state.saving=value,setSaveOrderError:value=>state.error=value,assertWritableRole:()=>{},ensureAuthenticatedUserForWrite:async()=>({uid:'staff'}),resolveStoreIdsForView:()=>['matriz'],userHasPermission:()=>true,
 functions:{},httpsCallable:(_functions,name)=>async payload=>calls.push({name,payload}),adminOrderRequest:args=>args,
 setShowModal:value=>state.open=value,resetForm:()=>state.reset=true,mapCriticalWriteErrorMessage:e=>e.message,...overrides};
 return {calls,state,run:()=>vm.runInNewContext('('+source.slice(handler.start,handler.end)+')',bindings)({preventDefault(){}})};
}
test('submit real do CRM usa endpoint administrativo para edição completa ou atalho sem reprecificar no navegador',async()=>{
 for(const mode of ['FULL','STATUS']){const {calls,state,run}=setup({orderEditMode:mode});await run();assert.equal(calls.length,1);assert.equal(calls[0].name,'adminOrderSave');assert.equal(calls[0].payload.mode,mode);assert.equal(calls[0].payload.form.status,'Finalizado');assert.equal(state.open,false);assert.equal(state.saving,false);assert.equal(state.reset,true);}
 // No data.clientes/reloadOrderCriticalData/persistOrderWithTransaction bindings:
 // falling into the historical repricing flow would fail this test.
});
test('escopo de loja, capability e erro remoto mantêm formulário aberto e liberam loading',async()=>{
 for(const overrides of [{resolveStoreIdsForView:()=>['garavelo']},{userHasPermission:()=>false},{httpsCallable:()=>async()=>{throw Error('conflito');}}]){
 const {state,run}=setup(overrides);await run();assert.ok(state.error);assert.equal(state.open,undefined);assert.equal(state.saving,false);
 }
});
test('segundo submit enquanto salva não inicia outra operação',async()=>{for(const patch of [{isSavingOrder:true},{orderEditFlight:{current:true}}]){const {calls,run}=setup(patch);await run();assert.equal(calls.length,0);}});
test('abrir atalho é explícito; paymentId sozinho não substitui o formulário completo',()=>{
 const edit=find(pedidos.init,n=>n.type==='VariableDeclarator'&&n.id.name==='handleEdit').init;
 const order={paymentId:'payment',status:'Pendente',total:1,itens:[{preco:1,quantity:1}]},state={};
 vm.runInNewContext('('+source.slice(edit.start,edit.end)+')',{setEditingOrder:()=>{},setOrderEditMode:mode=>state.mode=mode,orderEditRequestId:{},window:{crypto:{randomUUID:()=> 'test-request'}},setClientSelectionError:()=>{},setSaveOrderError:()=>{},setOrderSyncNotice:()=>{},setFormData:value=>state.form=value,setShowModal:value=>state.open=value})(order,'STATUS');
 assert.equal(state.mode,'STATUS');
 assert.equal(state.form.total,1);assert.equal(state.form.itens,order.itens);assert.equal(state.open,true);
});
