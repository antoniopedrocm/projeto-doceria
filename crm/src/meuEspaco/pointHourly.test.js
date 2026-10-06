/* eslint testing-library/no-unnecessary-act: off */
// Native React DOM requires act; no Testing Library rendering helper is used.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct, Simulate } from 'react-dom/test-utils';
import PointWorkScheduleFields from './PointWorkScheduleFields';
import { calculatePointDayCore } from './pointCalculationCore';
import { groupPointRecordsByDay } from './pointDayConsolidation';
import { buildPointPresentationRows } from './pointPresentation';
import fs from 'fs';
import path from 'path';
import {
  buildPointScheduleUpdate, sanitizeEmployeeWorkSchedule, getPointScheduleDayInfo,
  sumPointWorkedMinutes, formatPointWorkedMonth, resolvePointWorkSchedule, isHourlyWorkSchedule
} from './pointScheduleCore';

const act = React.act || legacyAct;
const hourly = sanitizeEmployeeWorkSchedule({ tipoEscala: 'horista' });
const calculate = (record = {}, schedule = hourly, date = new Date(2026, 9, 6)) => calculatePointDayCore({
  record: { dia: '2026-10-06', jornadaTrabalho: schedule, ...record },
  date, scheduleDay: getPointScheduleDayInfo(schedule, date)
});
const fiveHours = { horaEntrada: '08:00', horaAlmocoSaida: '11:00', horaAlmocoRetorno: '12:00', horaSaida: '14:00' };

test('5h worked and 8h old settings produce exactly 5h, with no bank deficit', () => {
  const result = calculate({ ...fiveHours, jornadaEsperadaMinutos: 480 });
  expect(result.summary.workedMinutes).toBe(300);
  expect(result.summary.expectedMinutes).toBe(0);
  expect(result.summary.irregularityMinutes).toBeNull();
  expect(result.balance.bancoHorasMinutes).toBe(0);
  expect(result.balance.bancoHoras).toBe('—');
  expect(formatPointWorkedMonth(sumPointWorkedMinutes([result]))).toBe('5h00');
});

test.each([new Date(2026, 9, 6), new Date(2026, 9, 10), new Date(2026, 9, 11)])('empty Horista day %s has no workday, virtual absence or debit', (date) => {
  const scheduleDay = getPointScheduleDayInfo(hourly, date);
  expect(scheduleDay.isWorkday).toBe(false);
  const result = calculate({}, hourly, date);
  expect(result.summary.workedMinutes).toBe(0);
  expect(result.balance.bancoHorasMinutes).toBe(0);
  expect(result.absenceDebitMinutes).toBe(0);
});

test('5h + 7h30 + 4h = 16h30; monthly totals use real minutes', () => {
  const days = [calculate(fiveHours), calculate({ horaEntrada: '08:00', horaSaida: '15:30' }), calculate({ horaEntrada: '08:00', horaSaida: '12:00' })];
  expect(formatPointWorkedMonth(sumPointWorkedMinutes(days))).toBe('16h30');
});

test('87h35 monthly presentation does not turn worked hours into credits', () => {
  const days = Array.from({ length: 17 }, () => calculate(fiveHours));
  days.push(calculate({ horaEntrada: '08:00', horaSaida: '10:35' }));
  expect(formatPointWorkedMonth(sumPointWorkedMinutes(days))).toBe('87h35');
  expect(days.every((day) => day.balance.bancoHoras === '—')).toBe(true);
  expect(days.every((day) => day.balance.horaExtraMinutes === 0)).toBe(true);
});

test('8–12 / 13–17 excludes one hour of lunch', () => {
  expect(calculate({ horaEntrada: '08:00', horaAlmocoSaida: '12:00', horaAlmocoRetorno: '13:00', horaSaida: '17:00' }).summary.workedMinutes).toBe(480);
});

test('incomplete punches count only closed intervals, and never assume an exit', () => {
  const entry = calculate({ horaEntrada: '08:00' });
  expect(entry.summary.workedMinutes).toBe(0);
  expect(entry.status.statusPonto).toBe('Em andamento');
  const lunch = calculate({ horaEntrada: '08:00', horaAlmocoSaida: '12:00' });
  expect(lunch.summary.workedMinutes).toBe(240);
  expect(lunch.status.statusPonto).toBe('Em andamento');
  const malformed = calculate({ horaEntrada: '08:00', horaAlmocoSaida: '12:00', horaSaida: '17:00' });
  expect(malformed.status.inconsistente).toBe(true);
  expect(malformed.summary.workedMinutes).toBeNull();
  expect(sumPointWorkedMinutes([malformed])).toBe(0);
  const period = calculate({ periodosTrabalho: [{ horaInicio: '08:00', horaFim: '17:00', horaAlmocoSaida: '12:00' }] });
  expect(period.summary.workedMinutes).toBeNull();
  expect(period.status.inconsistente).toBe(true);
});

test('abono is not actual work and bank start does not exclude real hours', () => {
  const result = calculate({ ...fiveHours, dataInicioBancoHoras: '2026-11-01', periodosComplementares: [{ tipo: 'abono_periodo', horaInicio: '14:00', horaFim: '18:00' }] });
  expect(result.summary.workedMinutes).toBe(300);
  expect(result.summary.justifiedAppliedMinutes).toBe(0);
  const noBank = calculatePointDayCore({record: fiveHours, date: new Date(2026, 9, 6), scheduleDay: getPointScheduleDayInfo(hourly, new Date(2026, 9, 6)), bankCalculationEnabled: false});
  expect(noBank.summary.workedMinutes).toBe(300);
});

test.each([
  ['seg-sex', {}, new Date(2026, 9, 6), -180],
  ['personalizada', { cargaHorariaPorDia: { 2: '06:00' } }, new Date(2026, 9, 6), -60],
  ['seg-sab-folga', {}, new Date(2026, 9, 10), 0]
])('%s still calculates its configured expected hours and bank', (tipoEscala, fields, date, bank) => {
  const schedule = sanitizeEmployeeWorkSchedule({ tipoEscala, ...fields });
  expect(calculate(fiveHours, schedule, date).balance.bancoHorasMinutes).toBe(bank);
});

test('change midmonth preserves historical snapshots and missing days before effective date', () => {
  const fixed = sanitizeEmployeeWorkSchedule({ tipoEscala: 'seg-sex' });
  const record = { dia: '2026-09-15', jornadaTrabalho: fixed, ...fiveHours, bancoHorasMinutes: -180 };
  const original = JSON.stringify(record);
  const current = buildPointScheduleUpdate(fixed, hourly, '2026-10-16');
  expect(calculate(record, record.jornadaTrabalho).balance.bancoHorasMinutes).toBe(-180);
  expect(getPointScheduleDayInfo(current, new Date(2026, 9, 15)).expectedMinutes).toBe(480);
  expect(getPointScheduleDayInfo(current, new Date(2026, 9, 16)).expectedMinutes).toBe(0);
  expect(resolvePointWorkSchedule(current, '2026-09-01').tipoEscala).toBe('seg-sex');
  expect(JSON.stringify(record)).toBe(original);
});

test('consolidation counts duplicate and complementary point documents only once', () => {
  const record = {id: 'first', funcionarioId: 'employee', dia: '2026-10-06', jornadaTrabalho: hourly, ...fiveHours};
  const records = groupPointRecordsByDay([record, {...record, id: 'duplicate'}]);
  const total = sumPointWorkedMinutes(records.map((item) => calculate(item)));
  expect(total).toBe(300);
});

test('actual PDF exporter presents 87h35, no bank debit, and ignores bank start for actual work', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
  const start = source.indexOf('    const handleExportPointSheet = async () => {');
  const end = source.indexOf('    const filteredRecords = useMemo', start);
  expect(start).toBeGreaterThan(0);
  const printed = [];
  const saved = [];
  class PDF {
    constructor() {
      this.internal = {pageSize: {getWidth: () => 210, getHeight: () => 297}, getNumberOfPages: () => 1};
    }
    text(value) { printed.push(Array.isArray(value) ? value.join(' ') : value); }
    splitTextToSize(value) { return [value]; }
    save(filename) { saved.push(filename); }
    setFont() {} setFontSize() {} setTextColor() {} setLineWidth() {}
    setDrawColor() {} setFillColor() {} line() {} rect() {} addPage() {} setPage() {}
  }
  const records = Array.from({length: 17}, (_, index) => ({id: `day-${index}`, funcionarioId: 'employee', dia: `2026-10-${String(index + 1).padStart(2, '0')}`, competencia: '2026-10', jornadaTrabalho: hourly, ...fiveHours}));
  records.push({id: 'last', funcionarioId: 'employee', dia: '2026-10-18', jornadaTrabalho: hourly, horaEntrada: '08:00', horaSaida: '10:35'});
  const messages = [];
  const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const previousBank = jest.fn(async () => -8888);
  const dependencies = {
    window: {jspdf: {jsPDF: PDF}}, records, recordsQueryMonth: '2026-10',
    getSelectedEmployeeIdForExport: () => 'employee', setRegisterMessage: (message) => messages.push(message),
    groupPointRecordsByDay, currentStoreIdForDisplay: 'dev',
    getRecordDateTime: (record) => new Date(`${record.dia}T12:00:00`), getRecordDayKey: (record) => record.dia,
    getPointSheetEmployee: () => ({name: 'Horista', category: 'Funcionária'}),
    getScheduleForEmployeeId: () => hourly, getPointBankStartDateForEmployeeId: () => '2026-11-01',
    getBrazilNationalHolidays: () => new Set(), toDateInputValue: dateKey,
    getRecordWorkSchedule: (record) => record.jornadaTrabalho,
    isPointBankDateBeforeStart: (day, firstDay) => day < firstDay,
    calculatePointDay: (record, options) => calculatePointDayCore({record, date: options.date, scheduleDay: getPointScheduleDayInfo(options.schedule, options.date), bankCalculationEnabled: options.bankCalculationEnabled}),
    buildPointPresentationRows, formatTime: (time) => time || '--:--',
    formatMinutesForPointSheet: (minutes) => formatPointWorkedMonth(minutes),
    getPreviousBankHoursBalance: previousBank, companyInfo: {nome: 'DEV'}, activeStoreInfo: {},
    getPointSheetMonthLabel: () => 'Outubro de 2026', formatCompanyAddressForPointSheet: () => '-',
    formatPointBankStartDateLabel: () => '01/11/2026', normalizeSearchText: (value) => value.toLowerCase(),
    isHourlyWorkSchedule, resolvePointWorkSchedule, getPointScheduleDayInfo, formatPointWorkedMonth, sumPointWorkedMinutes,
    console, Date
  };
  // Execute the actual local exporter while replacing browser/PDF I/O only.
  // eslint-disable-next-line no-new-func
  const exportSheet = new Function(...Object.keys(dependencies), `${source.slice(start, end)}\nreturn handleExportPointSheet;`)(...Object.values(dependencies));
  await exportSheet();
  expect(messages[messages.length - 1].type).toBe('success');
  expect(printed).toContain('HORAS TRABALHADAS NO MÊS');
  expect(printed).toContain('87h35');
  expect(printed).toContain('Não se aplica');
  expect(printed.some((value) => /DÉBITOS MÊS|^-\d+h/.test(value))).toBe(false);
  expect(previousBank).not.toHaveBeenCalled();
  expect(saved).toHaveLength(1);
});

test('user form offers Horista, preserves fixed settings, saves and reopens across a new session', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const Input = ({label, ...props}) => <label>{label}<input {...props} /></label>;
  const Select = ({label, children, ...props}) => <label>{label}<select {...props}>{children}</select></label>;
  const persistedKey = 'point-hourly-test';
  localStorage.removeItem(persistedKey);
  let saved;
  function Form() {
    const [schedule, setSchedule] = useState(() => sanitizeEmployeeWorkSchedule(JSON.parse(localStorage.getItem(persistedKey) || 'null')));
    return <>
      <PointWorkScheduleFields schedule={schedule} bankStartDate="2026-01-01" onBankStartDateChange={() => {}} onScheduleChange={(patch) => setSchedule((previous) => sanitizeEmployeeWorkSchedule(typeof patch === 'function' ? patch(previous) : {...previous, ...patch}))} Input={Input} Select={Select} />
      <button onClick={() => {saved = schedule; localStorage.setItem(persistedKey, JSON.stringify(schedule));}}>Salvar</button>
    </>;
  }
  let root = createRoot(container);
  try {
    act(() => root.render(<Form />));
    const initialTimes = [...container.querySelectorAll('input[type="time"]')].map((input) => input.value);
    expect(initialTimes).toHaveLength(4);
    const select = container.querySelector('select');
    expect([...select.options].map((option) => option.textContent)).toContain('Horista');
    act(() => Simulate.change(select, {target: {value: 'horista'}}));
    expect(container.querySelector('input[type="time"]')).toBeNull();
    expect(container.querySelector('input[type="date"]')).toBeNull();
    act(() => Simulate.click(container.querySelector('button')));
    expect(saved.tipoEscala).toBe('horista');
    expect([saved.horarioPadrao.entrada, saved.horarioPadrao.almocoSaida, saved.horarioPadrao.almocoRetorno, saved.horarioPadrao.saida]).toEqual(initialTimes);
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<Form />));
    expect(container.querySelector('select').value).toBe('horista');
    expect(container.textContent).toContain('somente horas efetivamente trabalhadas');
    act(() => Simulate.change(container.querySelector('select'), {target: {value: 'seg-sex'}}));
    expect([...container.querySelectorAll('input[type="time"]')].map((input) => input.value)).toEqual(initialTimes);
    expect(container.querySelector('input[type="date"]').value).toBe('2026-01-01');
  } finally {
    act(() => root.unmount());
    container.remove();
    localStorage.removeItem(persistedKey);
  }
});
