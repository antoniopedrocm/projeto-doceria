export const parseLocalOrderFilterDate = (value, endOfDay = false) => {
  if (!value) return null;

  const [year, month, day] = value.split('-').map(Number);

  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
};

export const matchesOrderDateFilter = (orderDate, startDateValue, endDateValue) => {
  if (!startDateValue && !endDateValue) return true;
  if (!(orderDate instanceof Date) || Number.isNaN(orderDate.getTime())) return false;

  const startDate = parseLocalOrderFilterDate(startDateValue);
  const endDate = parseLocalOrderFilterDate(endDateValue, true);

  if (startDate && orderDate < startDate) return false;
  if (endDate && orderDate > endDate) return false;

  return true;
};
