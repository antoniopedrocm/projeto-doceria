// Read the saved order only. A later store configuration never changes history.
export const getOrderFreight = (order = {}) => {
  const agreed = order.freteACombinar === true || order.tipoFrete === 'a_combinar';
  const value = agreed ? 0 : Number(order.valorFrete ?? order.frete ?? 0) || 0;
  return { value, agreed, label: agreed ? 'A Combinar' : `R$ ${value.toFixed(2).replace('.', ',')}` };
};

export const getSavedOrderTotal = (order = {}) => {
  if (order.total != null && Number.isFinite(Number(order.total))) return Number(order.total);
  const subtotal = Number(order.subtotal ?? (order.itens || []).reduce(
    (sum, item) => sum + Number(item.preco || 0) * Number(item.quantity ?? item.quantidade ?? 1), 0));
  return Math.round((subtotal - Number(order.cupom?.valorDesconto ?? order.desconto ?? 0) + getOrderFreight(order).value) * 100) / 100;
};
