// Canonical operational states; legacy labels remain unchanged when absent/unknown.
const labels = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Em Produção',
  READY: 'Pronto para Entrega',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
};

export const getOrderStatusLabel = order =>
  (Object.prototype.hasOwnProperty.call(labels, order?.order_status) ? labels[order.order_status] : null)
  || order?.status || order?.order_status || 'Não informado';

export const getOrderStatusClass = order => ({
  Pendente: 'bg-yellow-100 text-yellow-800',
  Confirmado: 'bg-blue-100 text-blue-800',
  'Em Produção': 'bg-blue-100 text-blue-800',
  'Pronto para Entrega': 'bg-green-100 text-green-800',
  Entregue: 'bg-green-100 text-green-800',
  Finalizado: 'bg-green-100 text-green-800',
  Cancelado: 'bg-red-100 text-red-800',
})[getOrderStatusLabel(order)] || 'bg-gray-100 text-gray-800';
