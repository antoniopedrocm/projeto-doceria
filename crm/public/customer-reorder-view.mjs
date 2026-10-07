import {prepareReorder} from './reorder-cart.mjs';
export function createCustomerReorderView({panel,call,snapshot,isCurrent,cart,onExpired,onCartOpen}) {
  const doc=panel.ownerDocument,node=(tag,text)=>{const element=doc.createElement(tag);element.textContent=text;return element;};
  let revision=0,busy=false,prepared=null;
  const alive=(session,version)=>version===revision && isCurrent(session);
  function lock(value) {busy=value;panel.parentElement.querySelectorAll('[data-reorder-button]').forEach(b=>{b.disabled=value;});
    panel.querySelectorAll('button').forEach(b=>{b.disabled=value;});}
  function clear() {revision++;prepared=null;panel.replaceChildren();panel.hidden=true;lock(false);}
  function show(result,message) {
    panel.hidden=false;panel.replaceChildren(node('h4','Comprar Novamente'),node('p',message));
    const list=node('ul','');
    for(const item of result?.added || []) list.append(node('li',`${item.nome}: ${item.quantity} unidade(s).`));
    for(const item of result?.unavailable || []) list.append(node('li',`${item.nome}: ${item.reason}.`));
    for(const item of result?.adjusted || []) list.append(node('li',`${item.nome}: quantidade ajustada de ${item.requested} para ${item.quantity} pelo estoque atual.`));
    for(const item of result?.priceChanged || []) list.append(node('li',`${item.nome}: preço atualizado para ${item.price.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}.`));
    panel.append(list);panel.setAttribute('tabindex','-1');panel.focus();
  }
  function action(label,fn) {const button=node('button',label);button.type='button';button.onclick=fn;panel.append(button);}
  const cartKey=value=>JSON.stringify(value);
  const extraIds=(order,current)=>current.storeId===order.storeId?[...new Set((current.items || []).map(i=>i.id || i.produtoId))]:[];
  function options(message) {
    const {preview,current}=prepared,result=prepareReorder({...preview,cart:current});
    show(result,message || (result.cartResult?'Os valores foram atualizados conforme o cardápio atual. Revise os itens.':'Os itens deste pedido não estão disponíveis para compra no momento.'));
    if(result.cartResult) {
      if(current.items?.length) {
        if(current.storeId===preview.order.storeId) {
          panel.append(node('p','Você já possui itens no carrinho.'));
          action('Adicionar ao carrinho',()=>{
            show(prepareReorder({...preview,cart:current,mode:'add'}),'Revise a combinação com os itens atuais do carrinho.');
            action('Confirmar adição',()=>apply('add'));action('Cancelar',clear);
          });
          action('Substituir carrinho',()=>apply('replace'));
        } else {
          panel.append(node('p',`Este pedido pertence à loja ${preview.order.storeName}. Será necessário substituir o carrinho atual e trocar de loja.`));
          action('Substituir e continuar',()=>apply('replace'));
        }
      } else {
        if(current.storeId && current.storeId!==preview.order.storeId) panel.append(node('p',`Você continuará no cardápio da loja ${preview.order.storeName}.`));
        action('Preparar carrinho',()=>apply('replace'));
      }
    }
    action('Cancelar',clear);
  }
  async function start(order) {
    if(busy || prepared) return;
    const session=snapshot(),version=++revision;if(!isCurrent(session)) return;
    lock(true);show(null,'Preparando pedido...');
    try {
      const current=cart.snapshot();
      const preview=await call('customerReorderPreview',{storeId:order.storeId,orderId:order.id,cartProductIds:extraIds(order,current)});
      if(!alive(session,version)) return;
      if(cartKey(current)!==cartKey(cart.snapshot())) throw Error('Seu carrinho mudou. Tente novamente.');
      prepared={session,version,current,preview};options();
    } catch(error) {
      if(!alive(session,version)) return;
      if(['functions/unauthenticated','functions/permission-denied'].includes(error.code)) {onExpired();return;}
      show(null,['functions/failed-precondition','functions/not-found'].includes(error.code)?error.message:'Não foi possível preparar a nova compra. Tente novamente.');action('Voltar',clear);
    } finally {if(alive(session,version)) lock(false);}
  }
  async function apply(mode) {
    if(busy || !prepared) return;
    const {session,version,current,preview}=prepared;if(!alive(session,version)) return;
    lock(true);
    try {
      if(cartKey(current)!==cartKey(cart.snapshot())) throw Error('Seu carrinho mudou. Tente novamente.');
      const fresh=await call('customerReorderPreview',{storeId:preview.order.storeId,orderId:preview.order.id,cartProductIds:extraIds(preview.order,current)});
      if(!alive(session,version)) return;
      if(cartKey(current)!==cartKey(cart.snapshot())) throw Error('Seu carrinho mudou. Tente novamente.');
      const before=prepareReorder({...preview,cart:current,mode}),result=prepareReorder({...fresh,cart:current,mode});
      if(JSON.stringify(before)!==JSON.stringify(result)) {prepared.preview=fresh;options('Os itens mudaram enquanto você decidia. Revise e confirme novamente.');return;}
      if(!result.cartResult) {prepared.preview=fresh;options('Nenhum item pôde ser adicionado. Seu carrinho foi preservado.');return;}
      // Application is synchronous after the final session check; never mutate after an awaited UI callback.
      const applied=cart.apply({storeId:fresh.order.storeId,items:result.cartResult,products:fresh.products,uid:session.uid});
      prepared=null;show(result,'Pedido preparado para uma nova compra. Revise o carrinho antes de pagar.');
      if(!applied?.redirected) action('Ver carrinho',()=>{if(alive(session,version)) {clear();onCartOpen();cart.open();}});
      action('Voltar aos pedidos',clear);
    } catch(error) {
      if(!alive(session,version)) return;
      if(['functions/unauthenticated','functions/permission-denied'].includes(error.code)) {onExpired();return;}
      prepared=null;show(null,'Não foi possível atualizar o carrinho. Seu carrinho anterior foi preservado. Tente novamente.');action('Voltar',clear);
    } finally {if(alive(session,version)) lock(false);}
  }
  return {start,clear};
}
