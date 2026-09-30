import { matchesOrderDateFilter, parseLocalOrderFilterDate } from './orderDateFilter';

describe('filtro local de datas dos pedidos', () => {
  test('interpreta o início e o fim do dia no calendário local', () => {
    const start = parseLocalOrderFilterDate('2026-08-20');
    const end = parseLocalOrderFilterDate('2026-08-20', true);

    expect([
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      start.getHours(),
      start.getMinutes(),
      start.getSeconds(),
      start.getMilliseconds(),
    ]).toEqual([2026, 7, 20, 0, 0, 0, 0]);
    expect([
      end.getFullYear(),
      end.getMonth(),
      end.getDate(),
      end.getHours(),
      end.getMinutes(),
      end.getSeconds(),
      end.getMilliseconds(),
    ]).toEqual([2026, 7, 20, 23, 59, 59, 999]);
  });

  test('no mesmo dia inclui somente pedidos de 20/08/2026', () => {
    const filter = (date) => matchesOrderDateFilter(date, '2026-08-20', '2026-08-20');

    expect(filter(new Date(2026, 7, 19, 23, 59, 59, 999))).toBe(false);
    expect(filter(new Date(2026, 7, 20, 12, 0, 0, 0))).toBe(true);
    expect(filter(new Date(2026, 7, 21, 0, 0, 0, 0))).toBe(false);
  });

  test('inclui o primeiro e o último horário do dia final', () => {
    expect(matchesOrderDateFilter(new Date(2026, 7, 20, 0, 1), '2026-08-20', '2026-08-20')).toBe(true);
    expect(matchesOrderDateFilter(new Date(2026, 7, 20, 23, 59), '2026-08-20', '2026-08-20')).toBe(true);
    expect(matchesOrderDateFilter(new Date(2026, 7, 20, 23, 59, 59, 999), '', '2026-08-20')).toBe(true);
  });

  test('inclui 19/08 e 20/08 sem incluir os dias adjacentes', () => {
    const filter = (date) => matchesOrderDateFilter(date, '2026-08-19', '2026-08-20');

    expect(filter(new Date(2026, 7, 18, 23, 59, 59, 999))).toBe(false);
    expect(filter(new Date(2026, 7, 19, 0, 0, 0, 0))).toBe(true);
    expect(filter(new Date(2026, 7, 20, 23, 59, 59, 999))).toBe(true);
    expect(filter(new Date(2026, 7, 21, 0, 0, 0, 0))).toBe(false);
  });

  test('trata corretamente a virada do mês', () => {
    const filter = (date) => matchesOrderDateFilter(date, '2026-08-31', '2026-09-01');

    expect(filter(new Date(2026, 7, 30, 23, 59, 59, 999))).toBe(false);
    expect(filter(new Date(2026, 7, 31, 8, 0, 0, 0))).toBe(true);
    expect(filter(new Date(2026, 8, 1, 20, 0, 0, 0))).toBe(true);
    expect(filter(new Date(2026, 8, 2, 0, 0, 0, 0))).toBe(false);
  });

  test('sem datas mantém o comportamento padrão da listagem', () => {
    expect(matchesOrderDateFilter(null, '', '')).toBe(true);
  });
});
