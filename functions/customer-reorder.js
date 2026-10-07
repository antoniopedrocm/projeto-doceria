const {HttpsError}=require('firebase-functions/v2/https');
const validId=value=>typeof value==='string' && /^[a-zA-Z0-9_-]{1,150}$/.test(value);
// Read-only preview: the normal checkout remains the financial authority.
function createCustomerReorder({db,readOrder,getStoreAvailability}) {
  return async request=>{
    const {order}=await readOrder(request); // Resolves UID/Customer and checks order ownership first.
    const storeId=order.storeId;
    const [store,config]=await db.getAll(db.doc(`lojas/${storeId}`),db.doc(`lojas/${storeId}/configuracoes/config`));
    const data=store.data() || {};
    if(!store.exists || data.ativo===false || data.ativa===false || String(data.status || '').toLowerCase()==='inativo')
      throw new HttpsError('failed-precondition','Esta loja não está disponível para comprar novamente.');
    const availability=getStoreAvailability(config.exists?config.data():null);
    if(availability!=='OPEN') throw new HttpsError('failed-precondition',availability==='CLOSED'?
      'Esta loja está fechada no momento. Tente comprar novamente mais tarde.':'Não foi possível verificar a disponibilidade desta loja.');
    const extra=request.data?.cartProductIds || [];
    if(!Array.isArray(extra) || extra.length>100 || extra.some(id=>!validId(id)) || order.itens.length>100)
      throw new HttpsError('invalid-argument','Não foi possível preparar estes itens.');
    const ids=[...new Set([...order.itens.map(i=>i.productId).filter(validId),...extra])];
    const snapshots=ids.length?await db.getAll(...ids.map(id=>db.doc(`lojas/${storeId}/produtos/${id}`))):[];
    const products=snapshots.filter(s=>s.exists).map(s=>{
      const p=s.data(),price=(typeof p.preco==='number' || (typeof p.preco==='string' && p.preco.trim()!==''))?Number(p.preco):NaN;
      const stock=p.estoque===null || p.estoque===undefined || p.estoque===''?null:Number(p.estoque);
      return {id:s.id,nome:String(p.nome || s.id).slice(0,160),preco:Number.isFinite(price)?price:null,
        estoque:stock===null?null:Number.isFinite(stock)?stock:0,
        available:p.ativo!==false && (p.status || 'Ativo')==='Ativo' && p.categoria==='Delivery' && Number.isFinite(price) && price>=0 &&
          (!p.lojaId || p.lojaId===storeId) && (!p.storeId || p.storeId===storeId)};
    });
    return {order:{id:order.id,storeId,storeName:order.storeName,itens:order.itens},products};
  };
}
module.exports={createCustomerReorder};
