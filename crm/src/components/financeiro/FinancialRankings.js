import React from 'react';
import TrendIndicator from './TrendIndicator.js';
import { formatCurrency } from './financialUtils.js';

const RankingPanel = ({ title, rows, favorableIncrease, emptyText, showTrend = true }) => {
  const highest = Math.max(...rows.map((row) => row.value), 1);
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-500">{emptyText}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {rows.slice(0, 6).map((row, index) => (
            <div key={row.id || row.label}>
              <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-gray-700">{index + 1}. {row.label}</span>
                <div className="shrink-0 text-right">
                  <span className="font-semibold text-gray-900">{formatCurrency(row.value)}</span>
                  <div className="mt-0.5 flex justify-end gap-2">
                    <span className="text-xs text-gray-400">{Number(row.participation || 0).toFixed(1)}%</span>
                    {showTrend && <TrendIndicator current={row.value} previous={row.previousValue} favorableIncrease={favorableIncrease} />}
                  </div>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100">
                <div
                  className={`h-1.5 rounded-full ${favorableIncrease ? 'bg-emerald-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.max((row.value / highest) * 100, 3)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const FinancialRankings = ({ largestExpenses, expenseRanking, incomeSources }) => (
  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
    <RankingPanel
      title="Maiores gastos"
      rows={largestExpenses}
      favorableIncrease={false}
      showTrend={false}
      emptyText="Nenhuma despesa registrada no período."
    />
    <RankingPanel
      title="Maiores categorias de gastos"
      rows={expenseRanking}
      favorableIncrease={false}
      emptyText="Nenhuma categoria de despesa no período."
    />
    <RankingPanel
      title="Fontes de entrada"
      rows={incomeSources}
      favorableIncrease
      emptyText="Nenhuma entrada realizada no período."
    />
  </div>
);

export default FinancialRankings;
