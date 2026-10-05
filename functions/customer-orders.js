const {HttpsError} = require('firebase-functions/v2/https');
const PAGE_SIZE = 20;
const orderPathPattern = /^lojas\/([a-zA-Z0-9_-]{1,150})\/pedidos\/([a-zA-Z0-9_-]{1,150})$/;
const text = (value, max=300) => typeof value==='string' || typeof value==='number' ? String(value).slice(0,max) : '';
const number = value => (typeof value==='number' || (typeof value==='string' && value.trim()!=='')) && Number.isFinite(Number(value)) ? Number(value) : null;
const missing = () => {throw new HttpsError('not-found','Pedido não encontrado.');};
function date(value) {
  try {
    const parsed=value?.toDate?.() || (value ? new Date(value) : null);
    return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  } catch {return null;}
}
function receiptUrl(value) {
  if(typeof value!=='string' || value.length>2048) return null;
  try {
    const url=new URL(value);
    return url.protocol==='https:' && !url.username && !url.password ? url.href : null;
  } catch {return null;}
}
function historicalAddress(value) {
  if(typeof value==='string') return text(value,600);
  if(!value || typeof value!=='object') return '';
  return text(value.enderecoCompleto || value.texto,600) ||
    ['street','number','neighborhood','complement','complemento','cep'].map(k=>text(value[k],160)).filter(Boolean).join(', ');
}
function paymentMethod(value) {
  const methods=['Pix','Pix online','Cartão','Cartão online','Cartão de Crédito','Cartão de Débito','Dinheiro','Boleto','Online','InfinitePay'];
  return methods.find(method=>method.toLocaleLowerCase('pt-BR')===text(value,80).toLocaleLowerCase('pt-BR')) || '';
}
function serializeOrder(snapshot, storeName='') {
  const d=snapshot.data() || {}, path=snapshot.ref.path;
  const [,storeId]=path.match(orderPathPattern);
  const rawItems=Array.isArray(d.itens) ? d.itens : [];
  const itens=rawItems.map(value=>{
    const item=value && typeof value==='object' ? value : {};
    const quantity=number(item.quantity ?? item.quantidade), preco=number(item.preco ?? item.unitValue ?? item.valorUnitario);
    const lineTotal=number(item.total ?? item.valorTotal ?? item.subtotal);
    return {nome:text(item.nome || item.description || item.descricao || item.produto,160),
      description:text(item.descricao || item.description,300),
      quantity,preco,total:lineTotal ?? (quantity!==null && preco!==null ? number(quantity*preco) : null)};
  });
  const address=historicalAddress(d.clienteEndereco);
  const pickup=d.tipoFrete==='retirada' || address==='Retirar na Loja';
  return {id:snapshot.id,storeId,lojaId:storeId,number:text(d.numeroPedido || d.numero || snapshot.id,150),
    storeName:text(d.lojaNome || d.storeName || storeName || storeId,160),
    createdAt:date(d.createdAt ?? d.dataPedido ?? d.data),
    status:text(d.order_status || d.status,80), payment_status:text(d.payment_status,80) || null,
    requiresReview:d.requiresReview===true, formaPagamento:paymentMethod(d.formaPagamento || d.pagamento?.forma),
    modalidade:pickup?'retirada':address || d.tipoFrete==='calculado' || d.freteACombinar===true ? 'entrega' : null,
    endereco:pickup?'':address,freteACombinar:d.freteACombinar===true,
    subtotal:number(d.subtotal),desconto:number(d.desconto),frete:number(d.valorFrete ?? d.frete),total:number(d.total),
    itemCount:Array.isArray(d.itens) && itens.every(item=>item.quantity!==null) ? itens.reduce((sum,item)=>sum+item.quantity,0) : null,itens,
    receipt_url:receiptUrl(d.receipt_url || d.receiptUrl || d.comprovanteUrl)};
}
function createCustomerOrders({db,resolve}) {
  async function authorized(request) {
    const identity=await resolve(request);
    if(!identity.customerId) throw new HttpsError('failed-precondition','Conclua seu cadastro de cliente.');
    const customer=await db.collection('clientes').doc(identity.customerId).get();
    if(!customer.exists || customer.data().authOwnerUid!==identity.user.uid) throw new HttpsError('permission-denied','Cadastro não autorizado.');
    return identity;
  }
  const owns=(snapshot,identity)=>snapshot.exists && orderPathPattern.test(snapshot.ref.path) &&
    snapshot.data().clienteId===identity.customerId && (!snapshot.data().ownerUid || snapshot.data().ownerUid===identity.user.uid);
  async function storeNames(snapshots) {
    const ids=[...new Set(snapshots.map(s=>s.ref.path.match(orderPathPattern)[1]))];
    if(!ids.length) return new Map();
    const stores=await db.getAll(...ids.map(id=>db.doc(`lojas/${id}`)));
    return new Map(stores.map(s=>[s.id,text(s.data()?.nome,160)]));
  }
  async function list(request) {
    const identity=await authorized(request);
    let query=db.collectionGroup('pedidos').where('clienteId','==',identity.customerId).orderBy('createdAt','desc');
    const cursor=request.data?.cursor;
    if(cursor!==undefined && cursor!==null) {
      if(typeof cursor!=='string' || !orderPathPattern.test(cursor)) missing();
      const previous=await db.doc(cursor).get();
      if(!owns(previous,identity) || !previous.data().createdAt) missing();
      query=query.startAfter(previous);
    }
    const result=await query.limit(PAGE_SIZE+1).get();
    const page=result.docs.slice(0,PAGE_SIZE), own=page.filter(s=>owns(s,identity));
    const names=await storeNames(own);
    const last=own.at(-1), hasMore=result.docs.length>PAGE_SIZE && Boolean(last);
    return {orders:own.map(s=>serializeOrder(s,names.get(s.ref.path.match(orderPathPattern)[1]))),
      nextCursor:hasMore?last.ref.path:null,hasMore};
  }
  async function detail(request) {
    const identity=await authorized(request);
    if(typeof request.data?.storeId!=='string' || typeof request.data?.orderId!=='string') missing();
    const path=`lojas/${request.data?.storeId}/pedidos/${request.data?.orderId}`;
    if(!orderPathPattern.test(path)) missing();
    const snapshot=await db.doc(path).get();
    if(!owns(snapshot,identity)) missing();
    const names=await storeNames([snapshot]);
    return {order:serializeOrder(snapshot,names.get(request.data.storeId))};
  }
  return {list,detail};
}
module.exports={createCustomerOrders,serializeOrder,receiptUrl,PAGE_SIZE};
