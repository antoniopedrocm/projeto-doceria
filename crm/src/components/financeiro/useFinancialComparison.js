import { useMemo } from 'react';
import { buildFinancialInsights } from './financialAnalysis.js';

export const useFinancialComparison = ({ data, selectedMonth, selectedCenter, filters, today }) => useMemo(
  () => buildFinancialInsights({ data, selectedMonth, selectedCenter, filters, today }),
  [data, selectedMonth, selectedCenter, filters, today]
);
