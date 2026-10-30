import {test} from 'node:test';
import assert from 'node:assert/strict';
import {saveOnlineOrderStatus} from '../src/utils/onlineOrderStatus.mjs';

const fixture = () => ({lojaId:'matriz', paymentId:'payment-fixture', payment_status:'PAID',
  order_status:'CONFIRMED', requiresReview:false, status:'Pendente', paymentMode:'ONLINE_NOW',
  paymentMethod:'PIX', total:1, itens:[{id:'product', preco:1, quantity:1}]});
function setup(order=fixture()) {
  const writes=[], reads=[];
  const tx={get:async ref=>{reads.push(ref.path);return {exists:()=>!!order,data:()=>order};},
    update:(ref,data)=>writes.push({path:ref.path,data}),set:(ref,data)=>writes.push({path:ref.path,data})};
  const args={db:{},runTransaction:async(_db,callback)=>callback(tx),
    orderRef:{id:'order',path:'lojas/matriz/pedidos/order'},logRef:{path:'lojas/matriz/logs/audit'},
    storeId:'matriz',status:'Finalizado',expectedStatus:'Pendente',adminUid:'staff-fixture',timestamp:()=>123};
  return {args,writes,reads};
}
test('pedido pago atualiza apenas status/updatedAt e audita IDs sem refazer estoque/cupom/pagamento',async()=>{
  const {args,writes,reads}=setup();assert.equal(await saveOnlineOrderStatus(args),true);
  assert.deepEqual(reads,['lojas/matriz/pedidos/order']);
  assert.deepEqual(writes,[{path:'lojas/matriz/pedidos/order',data:{status:'Finalizado',updatedAt:123}},
    {path:'lojas/matriz/logs/audit',data:{action:'Status operacional de pedido online atualizado',orderId:'order',lojaId:'matriz',adminUid:'staff-fixture',previousStatus:'Pendente',status:'Finalizado',timestamp:123}}]);
});
test('repetição da mesma atualização é no-op sem auditoria duplicada',async()=>{
  const {args,writes}=setup({...fixture(),status:'Finalizado'});assert.equal(await saveOnlineOrderStatus(args),false);assert.equal(writes.length,0);
});
test('sessão concorrente alterou status: não sobrescreve',async()=>{
  const {args,writes}=setup({...fixture(),status:'Em Produção'});await assert.rejects(saveOnlineOrderStatus(args),/outra sessão/);assert.equal(writes.length,0);
});
test('não converte pendente, cancelado canônico ou revisão em finalizado',async()=>{
  for(const order of [null,{...fixture(),payment_status:'PENDING'},{...fixture(),requiresReview:true},{...fixture(),order_status:'CANCELLED'},{...fixture(),paymentId:null},{...fixture(),lojaId:'garavelo'}]){
    const {args,writes}=setup(order);await assert.rejects(saveOnlineOrderStatus(args));assert.equal(writes.length,0);
  }
});
test('destino forjado, status inválido ou sessão ausente bloqueiam antes de ler/gravar',async()=>{
  for(const patch of [{storeId:'garavelo'},{status:'PAID'},{adminUid:null}]){
    const {args,writes,reads}=setup();await assert.rejects(saveOnlineOrderStatus({...args,...patch}));assert.equal(writes.length,0);assert.equal(reads.length,0);
  }
});
