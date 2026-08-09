import React from 'react';
import { formatCurrency } from './financialUtils.js';

const AnnualCashFlowChart = ({ data, year }) => {
  const highest = Math.max(...data.flatMap((row) => [row.receita, row.despesa]), 1);
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Entradas x despesas em {year}</h2>
          <p className="text-sm text-gray-500">Valores realizados com os mesmos filtros da tela</p>
        </div>
        <div className="flex gap-4 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Entradas</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Despesas</span>
        </div>
      </div>
      <div className="grid min-h-[240px] grid-cols-12 items-end gap-2" role="img" aria-label={`Gráfico financeiro anual de ${year}`}>
        {data.map((row) => (
          <div key={row.month} className="group flex h-56 min-w-0 flex-col justify-end">
            <div className="relative flex flex-1 items-end justify-center gap-1">
              <div title={`Entradas: ${formatCurrency(row.receita)}`} className="w-2/5 rounded-t bg-emerald-500 transition-opacity group-hover:opacity-80" style={{ height: `${Math.max((row.receita / highest) * 100, row.receita ? 2 : 0)}%` }} />
              <div title={`Despesas: ${formatCurrency(row.despesa)}`} className="w-2/5 rounded-t bg-rose-500 transition-opacity group-hover:opacity-80" style={{ height: `${Math.max((row.despesa / highest) * 100, row.despesa ? 2 : 0)}%` }} />
            </div>
            <span className="mt-2 truncate text-center text-[11px] text-gray-500">{row.month}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default AnnualCashFlowChart;
