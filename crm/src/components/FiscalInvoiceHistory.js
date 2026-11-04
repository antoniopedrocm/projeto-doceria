import React from 'react';

const preparationActions = new Set(['created', 'cloned', 'edited', 'validated']);

export default function FiscalInvoiceHistory({history, statusLabel, formatDateTime}) {
  // Keep the stored audit intact; the fiscal view starts with transmission.
  const events = (Array.isArray(history) ? history : []).filter((entry) => entry &&
    entry.status !== 'draft' && !preparationActions.has(entry.action));

  return <div className="space-y-2 text-sm">
    {events.length === 0 && <p className="text-gray-500">Nenhum evento fiscal registrado.</p>}
    {events.map((entry, index) => {
      const label = entry.action === 'consultation' ? 'Consulta SEFAZ' :
        entry.action === 'issued' ? 'Emissão iniciada' : statusLabel[entry.status] || entry.action || entry.status || 'Evento fiscal';
      const message = entry.message || entry.xMotivo;
      return <div key={index} className="rounded-lg border border-gray-100 bg-white p-2">
        <strong>{label}</strong> · {formatDateTime(entry.at)} · {entry.by || '-'}
        {entry.cStat != null ? ` · código ${entry.cStat}` : ''}
        {message ? ` · ${message}` : ''}
        {entry.protocol ? ` · protocolo ${entry.protocol}` : ''}
      </div>;
    })}
  </div>;
}
