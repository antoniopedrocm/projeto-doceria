const money=value=>value!==null && value!==undefined && value!=='' && Number.isFinite(Number(value)) ? Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : 'Não informado';
const date=value=>value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('pt-BR') : 'Data não informada';
export const orderStatus=order=>({PENDING:order.payment_status==='PENDING'?'Aguardando pagamento':'Pendente',CONFIRMED:'Confirmado',PREPARING:'Em Produção',READY:'Pronto para Entrega',DELIVERED:'Entregue',CANCELLED:'Cancelado'})[order.status] || order.status || 'Não informado';
export const paymentStatus=order=>order.requiresReview ? 'Em revisão' : ({PENDING:'Aguardando pagamento',PAID:'Pago',FAILED:'Falhou',EXPIRED:'Expirado',REFUNDED:'Estornado'})[order.payment_status] || order.payment_status || 'Não informado';
export function createCustomerOrderHistory({panel,call,snapshot,isCurrent,onExpired,onReorder,onMenu=null,onClear=()=>{}}) {
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
    el('order-detail-heading').textContent='Detalhe do pedido';el('order-detail').setAttribute('aria-busy','false');el('orders-list').setAttribute('aria-busy','false');
  };
  const expired=error=>['functions/unauthenticated','functions/permission-denied','unauthenticated','permission-denied'].includes(error.code);
  const modality=order=>order.modalidade==='retirada'?'Retirada na loja':order.modalidade==='entrega'?'Entrega':'Modalidade não informada';
  const styled=(tag,text,className)=>{const element=node(tag,text);element.className=className;return element;};
  const badge=(text,value)=>styled('span',text,`customer-badge customer-badge-${['PAID','DELIVERED'].includes(value)?'success':['FAILED','CANCELLED','REFUNDED'].includes(value)?'danger':['PENDING','EXPIRED'].includes(value)?'warning':['CONFIRMED','PREPARING','READY'].includes(value)?'info':'neutral'}`);
  function summary(container,order) {
    const heading=styled('div','','customer-order-summary'),identity=node('div','');
    identity.append(node('h3',`Pedido #${order.number || order.id || 'Não informado'}`),styled('p',`${date(order.createdAt)} • ${order.storeName || order.storeId || order.lojaId || 'Loja não informada'}`,'customer-order-meta'));
    heading.append(identity,styled('p',money(order.total),'customer-order-amount'));
    const statuses=styled('div','','customer-order-badges');
    statuses.append(badge(`Pedido: ${orderStatus(order)}`,order.status),badge(`Pagamento: ${paymentStatus(order)}`,order.requiresReview?'REVIEW':order.payment_status));
    container.append(heading,statuses,styled('p',modality(order),'customer-order-meta'));
  }
  function renderList() {
    el('orders').replaceChildren();
    if(!orders.length){
      const empty=styled('li','','customer-empty-state');empty.append(node('h3','Seu próximo pedido começa aqui.'),node('p','Que tal escolher algo gostoso?'));
      if(onMenu){const menu=styled('button','Ver Cardápio','customer-button customer-button-primary');menu.type='button';menu.onclick=onMenu;empty.append(menu);}
      el('orders').append(empty);
    }
    for(const order of orders) {
      const item=node('li','');item.className='customer-order-card';summary(item,order);
      const count=order.itemCount ?? (Array.isArray(order.itens) && order.itens.every(i=>i.quantity!==null && i.quantity!==undefined) ? order.itens.reduce((sum,i)=>sum+(Number(i.quantity) || 0),0) : null);
      const products=styled('div','','customer-order-products');products.append(node('p',count===null?'Quantidade de itens não informada':`${count} item(ns)`),node('p',(order.itens || []).map(i=>i.nome).filter(Boolean).join(', ')));item.append(products);
      const actions=styled('div','','customer-actions');
      const button=styled('button','Ver pedido','customer-button customer-button-secondary');button.type='button';button.dataset.orderKey=`${order.storeId || order.lojaId}/${order.id}`;
      button.disabled=!order.id || !(order.storeId || order.lojaId || order.source==='legacy');button.onclick=()=>openDetail(order);actions.append(button);reorderButton(actions,order);item.append(actions);el('orders').append(item);
    }
    el('orders-more').hidden=!cursor;el('orders-more').disabled=loading;
  }
  function reorderButton(container,order) {
    if(!onReorder || !(order.storeId || order.lojaId) || !order.itens?.some(item=>item.productId)) return;
    const button=styled('button','Comprar Novamente','customer-button customer-button-primary');button.type='button';button.dataset.reorderButton='';
    button.onclick=()=>onReorder(order);container.append(button);
  }
  function renderDetail(order) {
    const content=el('order-detail-content');content.replaceChildren();
    const overview=styled('section','','customer-panel');summary(overview,order);content.append(overview);
    const grid=styled('div','','customer-detail-grid');content.append(grid);
    const itemPanel=styled('section','','customer-panel customer-detail-items');itemPanel.append(node('h2','Itens do pedido'));
    const items=node('ul','');
    for(const item of order.itens || []) {
      const row=styled('li','','customer-detail-item');row.append(node('h4',item.nome || 'Item não informado'),node('p',`${item.quantity ?? 'Quantidade não informada'} × Unitário: ${money(item.preco)}`),node('strong',money(item.total)));
      if(item.description) row.append(node('p',item.description));items.append(row);
    }
    itemPanel.append(items);grid.append(itemPanel);
    const delivery=styled('section','','customer-panel');delivery.append(node('h2','Entrega / Retirada'),styled('p',modality(order),'customer-order-meta'));
    if(order.modalidade==='entrega')delivery.append(node('p',order.endereco || 'Não informado'));grid.append(delivery);
    const payment=styled('section','','customer-panel');payment.append(node('h2','Pagamento'),styled('p',`Forma de pagamento: ${order.formaPagamento || 'Não informada'}`,'customer-order-meta'),badge(paymentStatus(order),order.requiresReview?'REVIEW':order.payment_status));grid.append(payment);
    const totalPanel=styled('section','','customer-panel');totalPanel.append(node('h2','Totais'));
    const totals=styled('dl','','customer-totals');
    for(const [label,value] of [['Subtotal',order.subtotal],['Desconto',order.desconto],['Frete',order.frete],['Total',order.total]]) {
      totals.append(node('dt',label),node('dd',label==='Frete' && order.freteACombinar ? 'A combinar' : money(value)));
    }
    totalPanel.append(totals);grid.append(totalPanel);
    const actions=styled('div','','customer-actions');reorderButton(actions,order);totalPanel.append(actions);
    try {
      const url=new URL(order.receipt_url);
      if(url.protocol==='https:' && !url.username && !url.password) {
        const link=styled('a','Ver comprovante','customer-button customer-button-secondary');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';payment.append(link);
      }
    } catch { /* Receipt is optional; never invent a link. */ }
  }
  async function load(more=false) {
    const session=snapshot();
    if(!isCurrent(session)) return;
    if(more && (loading || !cursor)) return;
    if(!more) clear();
    const revision=generation;loading=true;el('orders-more').disabled=true;
    el('orders-list').setAttribute('aria-busy','true');
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
      if(active(session,revision)) {loading=false;el('orders-more').disabled=false;el('orders-list').setAttribute('aria-busy','false');}
    }
  }
  async function openDetail(order) {
    const session=snapshot(),revision=generation,detailRevision=++detailGeneration;
    if(!isCurrent(session)) return;
    el('orders-list').hidden=true;el('order-detail').hidden=false;el('order-detail-content').replaceChildren();
    el('order-detail-heading').textContent='Detalhe do pedido';
    el('order-detail').setAttribute('aria-busy','true');
    el('order-detail-message').textContent='Carregando pedido...';
    try {
      const data=await call('customerOrderDetail',{...(order.source==='legacy'?{source:'legacy'}:{storeId:order.storeId || order.lojaId}),orderId:order.id});
      if(!active(session,revision) || detailRevision!==detailGeneration) return;
      if(!data.order) throw new Error('not-found');
      renderDetail(data.order);el('order-detail-message').textContent='';el('order-detail-heading').textContent=`Pedido #${data.order.number || data.order.id || 'Não informado'}`;el('order-detail-heading').focus();
    } catch(error) {
      if(!active(session,revision) || detailRevision!==detailGeneration) return;
      if(expired(error)) {onExpired();return;}
      el('order-detail-message').textContent=['functions/not-found','not-found'].includes(error.code) ? 'Pedido não encontrado.' : 'Não foi possível carregar o pedido. Tente novamente.';
    } finally {if(active(session,revision) && detailRevision===detailGeneration)el('order-detail').setAttribute('aria-busy','false');}
  }
  el('history').onclick=()=>load();el('orders-more').onclick=()=>load(true);
  el('order-back').onclick=()=>{detailGeneration++;el('order-detail').hidden=true;el('order-detail-content').replaceChildren();el('orders-list').hidden=false;el('orders-heading').focus();};
  return {load,clear,openDetail};
}
