import React from 'react';
import {getOrderStatusClass, getOrderStatusLabel} from '../../utils/orderStatus';

export default function OrderStatusBadge({order, pendingSync = false, className = 'px-2 py-0.5'}) {
  const operational = order?.paymentId && order?.payment_status === 'PAID'
    && ['Em Produção', 'Pronto para Entrega', 'Finalizado', 'Cancelado'].includes(order.status)
    && order.status !== getOrderStatusLabel(order);
  const badge = <span className={`${className} rounded-full text-xs font-medium ${pendingSync ? 'bg-gray-100 text-gray-600' : getOrderStatusClass(order)}`}>
    {pendingSync ? 'Sincronizando...' : getOrderStatusLabel(order)}
  </span>;
  return operational && !pendingSync ? <span className="inline-flex flex-col items-start gap-1">{badge}<span className="text-xs text-gray-600">Operacional: {order.status}</span></span> : badge;
}
