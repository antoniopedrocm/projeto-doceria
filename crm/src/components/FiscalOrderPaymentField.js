import React from 'react';

export default function FiscalOrderPaymentField({order, Select, options, value, onChange, disabled}) {
  if (order.paymentMode !== 'AGREED_LATER' || order.paymentMethod) return <span>{order.formaPagamento || 'Não informado'}</span>;
  return <div className="min-w-[210px] max-w-xs space-y-2">
    <Select label="Forma de pagamento" aria-label="Forma de pagamento" value={value || ''} required disabled={disabled} onChange={onChange}>
      <option value="">Selecione...</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </Select>
    <p className="text-xs text-gray-500">Informe o método real e use Salvar e Validar. Esta ação não registra recebimento.</p>
  </div>;
}
