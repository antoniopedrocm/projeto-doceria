import React from 'react';
import {getOrderStatusClass, getOrderStatusLabel} from '../../utils/orderStatus';

export default function OrderStatusBadge({order, pendingSync = false, className = 'px-2 py-0.5'}) {
  return <span className={`${className} rounded-full text-xs font-medium ${pendingSync ? 'bg-gray-100 text-gray-600' : getOrderStatusClass(order)}`}>
    {pendingSync ? 'Sincronizando...' : getOrderStatusLabel(order)}
  </span>;
}
