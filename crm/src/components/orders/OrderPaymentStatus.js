import React from 'react';

const labels = {
  PAID: 'Pago',
  PENDING: 'Pendente',
  FAILED: 'Falhou',
  EXPIRED: 'Expirado',
  REFUNDED: 'Estornado',
};

export default function OrderPaymentStatus({order}) {
  const label = labels[order?.payment_status] || 'Pendente';
  const color = order?.payment_status === 'PAID'
    ? 'bg-green-100 text-green-800'
    : label === 'Pendente' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-700';

  return <p><strong>Status do Pagamento:</strong>{' '}
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span>
  </p>;
}
