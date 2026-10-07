export const CHECKOUT_STATE_KEY='checkoutState_v1';
export function stockLimit(product) {
  const value=product?.estoque;
  if(value===null || value===undefined || value==='') return null;
  const number=Number(value);
  return Number.isFinite(number)?Math.max(0,Math.floor(number)):0;
}
const idOf=item=>item?.productId || item?.produtoId || item?.id;
const validQuantity=value=>Number.isSafeInteger(Number(value)) && Number(value)>0 && Number(value)<=1000;
const priceValid=p=>p && p.available===true && p.preco!==null && p.preco!=='' && Number.isFinite(Number(p.preco)) && Number(p.preco)>=0;
const line=(p,quantity)=>({id:p.id,produtoId:p.id,nome:p.nome,preco:Number(p.preco),quantity});
export function prepareReorder({order,products,cart={items:[]},mode='replace'}) {
  if(!order?.storeId || !Array.isArray(order.itens) || !['replace','add'].includes(mode)) throw Error('Pedido inválido para nova compra.');
  if(mode==='add' && cart.items?.length && cart.storeId!==order.storeId) throw Error('Não é possível misturar lojas no carrinho.');
  const catalog=new Map((products || []).map(p=>[p.id,p]));
  const unavailable=[],adjusted=[],priceChanged=[],added=[],requested=new Map(),result=new Map();
  for(const item of order.itens) {
    const id=idOf(item),p=catalog.get(id),name=item.nome || 'Item antigo';
    if(!id) {unavailable.push({nome:name,reason:'não possui identificação recuperável'});continue;}
    if(!p) {unavailable.push({nome:name,reason:'não está mais disponível'});continue;}
    if(!priceValid(p)) {unavailable.push({nome:name,reason:'não está disponível no cardápio'});continue;}
    if(stockLimit(p)===0) {unavailable.push({nome:p.nome,reason:'está esgotado'});continue;}
    if(!validQuantity(item.quantity)) {unavailable.push({nome:name,reason:'quantidade antiga não recuperável'});continue;}
    requested.set(id,(requested.get(id) || 0)+Number(item.quantity));
    if(item.preco!==null && item.preco!==undefined && Number.isFinite(Number(item.preco)) && Math.abs(Number(item.preco)-Number(p.preco))>0.009 && !priceChanged.some(i=>i.id===id))
      priceChanged.push({id,nome:p.nome,oldPrice:Number(item.preco),price:Number(p.preco)});
  }
  if(!requested.size) return {cartResult:null,added,unavailable,adjusted,priceChanged};
  if(mode==='add') {
    for(const item of cart.items || []) {
      const p=catalog.get(idOf(item));
      if(!priceValid(p) || !validQuantity(item.quantity) || stockLimit(p)===0) {
        unavailable.push({nome:item.nome || 'Item do carrinho',reason:'item do carrinho não está disponível'});continue;
      }
      const quantity=Math.min((result.get(p.id)?.quantity || 0)+Number(item.quantity),stockLimit(p) ?? 1000);
      if(quantity<Number(item.quantity)) adjusted.push({nome:p.nome,requested:Number(item.quantity),quantity});
      if(Math.abs(Number(item.preco)-Number(p.preco))>0.009 && !priceChanged.some(i=>i.id===p.id)) priceChanged.push({id:p.id,nome:p.nome,oldPrice:Number(item.preco),price:Number(p.preco)});
      result.set(p.id,line(p,quantity));
    }
  }
  for(const [id,quantity] of requested) {
    const p=catalog.get(id),existing=result.get(id)?.quantity || 0;
    const available=Math.max(0,(stockLimit(p) ?? 1000)-existing),increase=Math.min(quantity,available);
    if(increase<quantity) adjusted.push({nome:p.nome,requested:quantity,quantity:increase});
    if(increase>0) {result.set(id,line(p,existing+increase));added.push({nome:p.nome,quantity:increase});}
  }
  return {cartResult:added.length?[...result.values()]:null,added,unavailable,adjusted,priceChanged};
}
export function createPageCartBridge({storeId,storage,navigate,readCart,applyCart,open}) {
  const stored=createStoredCartBridge({storage,navigate});
  return {snapshot:()=>({storeId,items:readCart().map(i=>({...i}))}),open,
    apply:payload=>{
      if(payload.storeId!==storeId) return stored.apply(payload);
      const previous=storage.getItem(CHECKOUT_STATE_KEY),payment=storage.getItem('doceria-payment-pending');
      try {
        storage.setItem(CHECKOUT_STATE_KEY,JSON.stringify(freshCheckoutState(storeId,payload.items,payload.uid)));
        storage.removeItem('doceria-payment-pending');applyCart(payload);return {redirected:false};
      } catch(error) {
        if(previous===null) storage.removeItem(CHECKOUT_STATE_KEY);else storage.setItem(CHECKOUT_STATE_KEY,previous);
        if(payment!==null) storage.setItem('doceria-payment-pending',payment);throw error;
      }
    }};
}
export function storeMenuUrl(storeId) {
  return {'ana-guimaraes-doceria-matriz':'/cardapio-matriz','ana-guimaraes-doceria-garavelo':'/cardapio-garavelo'}[storeId] || null;
}
// The existing checkout storage contract, containing only a fresh cart and no historical checkout state.
export function freshCheckoutState(storeId,items,uid) {
  return {storeId,cart:items.map(i=>({id:i.id,produtoId:i.id,nome:i.nome,preco:i.preco,quantity:i.quantity})),
    pendingOrderDetails:{},valorFrete:0,distanciaFreteKm:null,guestCurrentLatLng:null,
    guestAddressFlowState:{currentStep:1,locationConfirmed:false,formData:{},autocompleteSelection:''},
    guestManualAddressLocationConfirmed:false,addressStep:1,reorderOwnerUid:uid};
}
export function createStoredCartBridge({storage,navigate,getUid=()=>null}) {
  return {
    snapshot:()=>{const raw=storage.getItem(CHECKOUT_STATE_KEY);const state=raw?JSON.parse(raw):{};
      if(state.reorderOwnerUid && state.reorderOwnerUid!==getUid()) return {storeId:null,items:[]};
      return {storeId:state.storeId || null,items:state.cart || []};},
    apply:({storeId,items,uid})=>{
      const target=storeMenuUrl(storeId);if(!target) throw Error('Não há cardápio disponível para esta loja.');
      const previous=storage.getItem(CHECKOUT_STATE_KEY),payment=storage.getItem('doceria-payment-pending');
      try {storage.setItem(CHECKOUT_STATE_KEY,JSON.stringify(freshCheckoutState(storeId,items,uid)));
        storage.removeItem('doceria-payment-pending');navigate(target);return {redirected:true};
      } catch(error) {
        if(previous===null) storage.removeItem(CHECKOUT_STATE_KEY);else storage.setItem(CHECKOUT_STATE_KEY,previous);
        if(payment!==null) storage.setItem('doceria-payment-pending',payment);throw error;
      }
    },
  };
}
