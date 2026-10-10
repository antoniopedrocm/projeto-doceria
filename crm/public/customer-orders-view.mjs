const money=value=>value!==null && value!==undefined && value!=='' && Number.isFinite(Number(value)) ? Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : 'Não informado';
const date=value=>value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('pt-BR') : 'Data não informada';
export const orderStatus=order=>({PENDING:order.payment_status==='PENDING'?'Aguardando pagamento':'Pendente',CONFIRMED:'Confirmado',PREPARING:'Em Produção',READY:'Pronto para Entrega',DELIVERED:'Entregue',CANCELLED:'Cancelado'})[order.status] || order.status || 'Não informado';
export const paymentStatus=order=>order.requiresReview ? 'Em revisão' : ({PENDING:'Aguardando pagamento',PAID:'Pago',FAILED:'Falhou',EXPIRED:'Expirado',REFUNDED:'Estornado'})[order.payment_status] || order.payment_status || 'Não informado';
export function createCustomerOrderHistory({panel,call,snapshot,isCurrent,onExpired,onReorder,onClear=()=>{}}) {
  const el=name=>panel.querySelector(`[data-${name}]`);
  const doc=panel.ownerDocument;
  let orders=[],cursor=null,generation=0,detailGeneration=0,loading=false;
  const active=(session,revision)=>revision===generation && isCurrent(session);
  const node=(tag,content)=>{const element=doc.createElement(tag);element.textContent=content;return element;};
  const clear=()=>{
    onClear();
    generation++;detailGeneration++;orders=[];cursor=null;loading=false;
    el('orders').replaceChildren();el('order-detail-content').replaceChildren();el('orders-message').textContent='';el('order-detail-message').textContent='';
    el('order-detail').hidden=true;el('orders-list').hidden=false;el('orders-more').hidden=true;el('orders-more').disabled=false;
  };
  const expired=error=>['functions/unauthenticated','functions/permission-denied','unauthenticated','permission-denied'].includes(error.code);
  const modality=order=>order.modalidade==='retirada'?'Retirada na loja':order.modalidade==='entrega'?'Entrega':'Modalidade não informada';
  function summary(container,order) {
    container.append(node('h4',`Pedido #${order.number || order.id || 'Não informado'}`),
      node('p',`${date(order.createdAt)} • ${order.storeName || order.storeId || order.lojaId || 'Loja não informada'}`),
      node('p',`${money(order.total)} • ${modality(order)}`),
      node('p',`Pedido: ${orderStatus(order)}`),node('p',`Pagamento: ${paymentStatus(order)}`));
  }
  function renderList() {
    el('orders').replaceChildren();
    for(const order of orders) {
      const item=node('li','');item.className='customer-order-card';summary(item,order);
      const count=order.itemCount ?? (Array.isArray(order.itens) && order.itens.every(i=>i.quantity!==null && i.quantity!==undefined) ? order.itens.reduce((sum,i)=>sum+(Number(i.quantity) || 0),0) : null);
      item.append(node('p',count===null?'Quantidade de itens não informada':`${count} item(ns)`),node('p',(order.itens || []).map(i=>i.nome).filter(Boolean).join(', ')));
      const button=node('button','Ver pedido');button.type='button';button.dataset.orderKey=`${order.storeId || order.lojaId}/${order.id}`;
      button.disabled=!order.id || !(order.storeId || order.lojaId);button.onclick=()=>openDetail(order);item.append(button);reorderButton(item,order);el('orders').append(item);
    }
    el('orders-more').hidden=!cursor;el('orders-more').disabled=loading;
  }
  function reorderButton(container,order) {
    if(!onReorder || !order.itens?.some(item=>item.productId)) return;
    const button=node('button','Comprar Novamente');button.type='button';button.dataset.reorderButton='';
    button.onclick=()=>onReorder(order);container.append(button);
  }
  function renderDetail(order) {
    const content=el('order-detail-content');content.replaceChildren();summary(content,order);
    const items=node('ul','');
    for(const item of order.itens || []) {
      const row=node('li',`${item.quantity ?? 'Quantidade não informada'} × ${item.nome || 'Item não informado'} • Unitário: ${money(item.preco)} • Subtotal: ${money(item.total)}`);
      if(item.description) row.append(node('p',item.description));items.append(row);
    }
    content.append(node('h4','Itens do pedido'),items);
    const totals=node('dl','');
    for(const [label,value] of [['Subtotal',order.subtotal],['Desconto',order.desconto],['Frete',order.frete],['Total',order.total]]) {
      totals.append(node('dt',label),node('dd',label==='Frete' && order.freteACombinar ? 'A combinar' : money(value)));
    }
    content.append(totals,node('p',`Forma de pagamento: ${order.formaPagamento || 'Não informada'}`));reorderButton(content,order);
    if(order.modalidade==='entrega') content.append(node('h4','Endereço utilizado no pedido'),node('p',order.endereco || 'Não informado'));
    try {
      const url=new URL(order.receipt_url);
      if(url.protocol==='https:' && !url.username && !url.password) {
        const link=node('a','Ver comprovante');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';content.append(link);
      }
    } catch { /* Receipt is optional; never invent a link. */ }
  }
  async function load(more=false) {
    const session=snapshot();
    if(!isCurrent(session)) return;
    if(more && (loading || !cursor)) return;
    if(!more) clear();
    const revision=generation;loading=true;el('orders-more').disabled=true;
    el('orders-message').textContent='Carregando seus pedidos...';
    try {
      const data=await call('customerOrders',more?{cursor}:{});
      if(!active(session,revision)) return;
      const seen=new Set(orders.map(o=>`${o.storeId || o.lojaId}/${o.id}`));
      for(const order of data.orders || []) {
        const key=`${order.storeId || order.lojaId}/${order.id}`;
        if(!order.id || !seen.has(key)) {orders.push(order);seen.add(key);}
      }
      cursor=data.nextCursor || null;
      el('orders-message').textContent=orders.length?'':'Você ainda não realizou nenhum pedido.';
      renderList();
    } catch(error) {
      if(!active(session,revision)) return;
      if(expired(error)) {onExpired();return;}
      el('orders-message').textContent='Não foi possível carregar seus pedidos. Tente novamente.';
    } finally {
      if(active(session,revision)) {loading=false;el('orders-more').disabled=false;}
    }
  }
  async function openDetail(order) {
    const session=snapshot(),revision=generation,detailRevision=++detailGeneration;
    if(!isCurrent(session)) return;
    el('orders-list').hidden=true;el('order-detail').hidden=false;el('order-detail-content').replaceChildren();
    el('order-detail-message').textContent='Carregando pedido...';
    try {
      const data=await call('customerOrderDetail',{storeId:order.storeId || order.lojaId,orderId:order.id});
      if(!active(session,revision) || detailRevision!==detailGeneration) return;
      if(!data.order) throw new Error('not-found');
      renderDetail(data.order);el('order-detail-message').textContent='';el('order-detail-heading').focus();
    } catch(error) {
      if(!active(session,revision) || detailRevision!==detailGeneration) return;
      if(expired(error)) {onExpired();return;}
      el('order-detail-message').textContent=['functions/not-found','not-found'].includes(error.code) ? 'Pedido não encontrado.' : 'Não foi possível carregar o pedido. Tente novamente.';
    }
  }
  el('history').onclick=()=>load();el('orders-more').onclick=()=>load(true);
  el('order-back').onclick=()=>{detailGeneration++;el('order-detail').hidden=true;el('order-detail-content').replaceChildren();el('orders-list').hidden=false;el('orders-heading').focus();};
  return {load,clear,openDetail};
}
