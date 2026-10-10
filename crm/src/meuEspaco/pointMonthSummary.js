import { getHourlyPointBalance, isHourlyWorkSchedule, sumPointWorkedMinutes } from './pointScheduleCore';

// The schedule at the end of the selected month determines its operational
// summary. Historical daily calculations remain intact for transition months.
export const summarizePointMonth = ({ schedule, calculations = [], previousBankMinutes = 0 }) => {
  const workedMinutes = sumPointWorkedMinutes(calculations);
  if (isHourlyWorkSchedule(schedule)) {
    const balance = getHourlyPointBalance();
    return {
      workedMinutes, bankApplicable: false, expectedMinutes: 0,
      creditMinutes: 0, debitMinutes: 0, balanceMinutes: 0,
      previousBankMinutes: 0, bankMovementMinutes: balance.bancoHorasMinutes,
      finalBankMinutes: balance.bancoHorasMinutes, overtimePayMinutes: balance.horaExtraMinutes
    };
  }
  const totals = calculations.reduce((result, { summary, balance }) => {
    const irregularity = summary.calculable && Number.isFinite(summary.irregularityMinutes)
      ? summary.irregularityMinutes : 0;
    if (irregularity > 0) result.creditMinutes += irregularity;
    if (irregularity < 0) result.debitMinutes += Math.abs(irregularity);
    result.expectedMinutes += Number(summary.expectedMinutes) || 0;
    result.bankMovementMinutes += balance.bancoHorasMinutes;
    result.overtimePayMinutes += balance.horaExtraMinutes;
    return result;
  }, { expectedMinutes: 0, creditMinutes: 0, debitMinutes: 0, bankMovementMinutes: 0, overtimePayMinutes: 0 });
  return {
    ...totals, workedMinutes, bankApplicable: true, previousBankMinutes,
    balanceMinutes: totals.creditMinutes - totals.debitMinutes,
    finalBankMinutes: previousBankMinutes + totals.bankMovementMinutes
  };
};
