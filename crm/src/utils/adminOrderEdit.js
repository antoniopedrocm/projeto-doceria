export function adminOrderRequest({order,form,mode,requestId}) {
  const patch={status:form.status};
  if(mode==='FULL')Object.assign(patch,{clienteId:form.clienteId,status:form.status,categoria:form.categoria || 'Delivery',formaPagamento:form.formaPagamento || '',observacao:form.observacao || '',
    itens:(form.itens || []).map(i=>({produtoId:i.produtoId || i.productId || i.id,quantity:Number(i.quantity ?? i.quantidade ?? 1)})),desconto:Number(form.desconto || 0),cupom:form.cupom || null,dataEntrega:form.dataEntrega || ''});
  return {storeId:order.lojaId,orderId:order.id,requestId,mode,patch,expectedRevision:Number(order.adminRevision || 0),expectedStatus:order.status,expectedUpdatedAt:order.updatedAt?.toMillis?.() || 0};
}
