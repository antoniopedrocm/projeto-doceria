import React from 'react';
import TrendIndicator from './TrendIndicator.js';
import { formatCurrency } from './financialUtils.js';

const FinancialKpiCard = ({
  title,
  value,
  icon: Icon,
  iconClassName,
  previousValue,
  favorableIncrease = true,
  detail
}) => (
  <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
        <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(value)}</p>
      </div>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
        <Icon className="h-5 w-5" />
      </span>
    </div>
    <div className="mt-3 flex min-h-[18px] items-center justify-between gap-2">
      {previousValue !== undefined
        ? <TrendIndicator current={value} previous={previousValue} favorableIncrease={favorableIncrease} />
        : <span className="text-xs text-gray-500">{detail}</span>}
      {previousValue !== undefined && <span className="text-xs text-gray-400">vs. mês anterior</span>}
    </div>
  </section>
);

export default FinancialKpiCard;
