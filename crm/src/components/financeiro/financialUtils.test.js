import { moneyToCents, rollDueDate, shiftMonthKey, sumMoneyCents } from './financialUtils.js';

test('navega competências entre anos sem depender de fuso horário', () => {
  expect(shiftMonthKey('2026-06', 1)).toBe('2026-07');
  expect(shiftMonthKey('2026-08', -1)).toBe('2026-07');
  expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
});

test('adapta vencimento para o último dia da próxima competência', () => {
  expect(rollDueDate('2026-01-31', '2026-02')).toBe('2026-02-28');
  expect(rollDueDate('2026-08-15', '2026-09')).toBe('2026-09-15');
});

test('soma valores em centavos sem divergência de ponto flutuante', () => {
  expect(sumMoneyCents([{ valor: 0.1 }, { valor: 0.2 }])).toBe(30);
  expect(moneyToCents('1.234,56')).toBe(123456);
});
