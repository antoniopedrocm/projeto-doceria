/* eslint-env es2020 */
const {HttpsError} = require('firebase-functions/v2/https');
const {FieldPath} = require('firebase-admin/firestore');
const PAGE_SIZE = 20;
const SCAN_BATCH_SIZE = 100;
const MAX_SCAN_CANDIDATES = 1000;
const orderPathPattern = /^lojas\/([a-zA-Z0-9_-]{1,150})\/pedidos\/([a-zA-Z0-9_-]{1,150})$/;
const text = (value, max=300) => typeof value==='string' || typeof value==='number' ? String(value).slice(0,max) : '';
const number = value => (typeof value==='number' || (typeof value==='string' && value.trim()!=='')) && Number.isFinite(Number(value)) ? Number(value) : null;
const missing = () => {throw new HttpsError('not-found','Pedido não encontrado.');};
function date(value) {
  try {
    const parsed=value?.toDate?.() || (value instanceof Date ? value : typeof value==='number' && Number.isFinite(value) ? new Date(value) :
      typeof value==='string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) ? new Date(value) : null);
    return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  } catch {return null;}
}
// These historical aliases already belonged to the read contract; never use delivery dates.
function normalizedOrderDate(order) {
  for(const field of ['createdAt','dataPedido','data']) {
    const value=order[field],normalized=date(value);
    if(normalized!==null) {
      // Preserve Firestore sub-millisecond order while displaying the existing ISO snapshot.
      const sortTime=Number.isSafeInteger(value?.seconds) && Number.isInteger(value?.nanoseconds) ?
        BigInt(value.seconds)*1000000000n+BigInt(value.nanoseconds) : BigInt(Date.parse(normalized))*1000000n;
      return {createdAt:normalized,sortTime};
    }
  }
  return null;
}
function getOrderCreatedAt(order) {return normalizedOrderDate(order)?.createdAt ?? null;}
function compareOrders(a,b) {
  const left=normalizedOrderDate(a.data())?.sortTime ?? null,right=normalizedOrderDate(b.data())?.sortTime ?? null;
  if(left!==right) {
    if(left===null) return 1;
    if(right===null) return -1;
    return left>right ? -1 : 1;
  }
  // Full document path disambiguates identical IDs in different stores, as Firestore does.
  return a.ref.path===b.ref.path ? 0 : a.ref.path>b.ref.path ? -1 : 1;
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
    createdAt:getOrderCreatedAt(d),
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
    const query=db.collectionGroup('pedidos').where('clienteId','==',identity.customerId).orderBy(FieldPath.documentId());
    let previous=null;
    const cursor=request.data?.cursor;
    if(cursor!==undefined && cursor!==null) {
      if(typeof cursor!=='string' || !orderPathPattern.test(cursor)) missing();
      previous=await db.doc(cursor).get();
      if(!owns(previous,identity)) missing();
    }
    // Missing fields cannot be queried with orderBy(createdAt). Scan only this Customer's
    // candidates in bounded physical batches, retaining the next logical page, never all data.
    // The physical cursor advances through rejected candidates; the public cursor is the
    // authorized boundary in normalized date/path order (not the physical document order).
    const eligible=[];let scanned=0,physicalCursor=null,exhausted=false;
    for(let batch=0;batch<=MAX_SCAN_CANDIDATES/SCAN_BATCH_SIZE;batch++) {
      const remaining=MAX_SCAN_CANDIDATES-scanned;
      const size=Math.min(SCAN_BATCH_SIZE,remaining+1);
      const result=await (physicalCursor?query.startAfter(physicalCursor):query).limit(size).get();
      for(const candidate of result.docs) {
        if(physicalCursor && candidate.ref.path<=physicalCursor.ref.path)
          throw new HttpsError('internal','Não foi possível avançar o histórico.');
        physicalCursor=candidate;scanned++;
        if(scanned>MAX_SCAN_CANDIDATES)
          throw new HttpsError('resource-exhausted','Histórico excede o limite seguro de consulta.');
        if(!owns(candidate,identity) || (previous && compareOrders(candidate,previous)<=0)) continue;
        eligible.push(candidate);eligible.sort(compareOrders);
        if(eligible.length>PAGE_SIZE+1) eligible.pop();
      }
      if(result.docs.length<size) {exhausted=true;break;}
    }
    if(!exhausted) throw new HttpsError('resource-exhausted','Histórico excede o limite seguro de consulta.');
    const own=eligible.slice(0,PAGE_SIZE);
    const names=await storeNames(own);
    const last=own.at(-1), hasMore=eligible.length>PAGE_SIZE;
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
module.exports={createCustomerOrders,serializeOrder,receiptUrl,getOrderCreatedAt,PAGE_SIZE,SCAN_BATCH_SIZE,MAX_SCAN_CANDIDATES};
