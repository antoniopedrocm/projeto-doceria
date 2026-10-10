/* eslint testing-library/no-unnecessary-act: off */
// Native React DOM requires act; no Testing Library rendering helper is used.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct, Simulate } from 'react-dom/test-utils';
import PointWorkScheduleFields from './PointWorkScheduleFields';
import { calculatePointDayCore } from './pointCalculationCore';
import { summarizePointMonth } from './pointMonthSummary';
import { groupPointRecordsByDay } from './pointDayConsolidation';
import { buildPointPresentationRows } from './pointPresentation';
import fs from 'fs';
import path from 'path';
import {
  buildPointScheduleUpdate, sanitizeEmployeeWorkSchedule, getPointScheduleDayInfo,
  sumPointWorkedMinutes, formatPointWorkedMonth, resolvePointWorkSchedule, isHourlyWorkSchedule,
  arePointWorkSchedulesEqual, getPointScheduleEffectiveDate, isValidPointScheduleDate, resolvePointRecordWorkSchedule
} from './pointScheduleCore';

const act = React.act || legacyAct;
const hourly = sanitizeEmployeeWorkSchedule({ tipoEscala: 'horista' });
const calculate = (record = {}, schedule = hourly, date = new Date(2026, 9, 6)) => calculatePointDayCore({
  record: { dia: '2026-10-06', jornadaTrabalho: schedule, ...record },
  date, scheduleDay: getPointScheduleDayInfo(schedule, date)
});
const fiveHours = { horaEntrada: '08:00', horaAlmocoSaida: '11:00', horaAlmocoRetorno: '12:00', horaSaida: '14:00' };

test.each([
  [240, '4h00'], [0, '0h00'], [5255, '87h35'], [600, '10h00']
])('monthly Horista policy: %i real minutes, no expected load, bank or overtime', (minutes, label) => {
  const summary = summarizePointMonth({schedule: hourly, previousBankMinutes: -213 * 60, calculations: [{
    summary: {workedMinutes: minutes, expectedMinutes: 480, irregularityMinutes: minutes - 480, calculable: true},
    balance: {bancoHorasMinutes: -480, horaExtraMinutes: 120}
  }]});
  expect(formatPointWorkedMonth(summary.workedMinutes)).toBe(label);
  expect(summary).toMatchObject({bankApplicable: false, expectedMinutes: 0, creditMinutes: 0,
    debitMinutes: 0, balanceMinutes: 0, previousBankMinutes: 0, bankMovementMinutes: 0,
    finalBankMinutes: 0, overtimePayMinutes: 0});
});

test('10h worked in one hourly day is never automatically 2h extra', () => {
  const result = calculate({horaEntrada: '08:00', horaSaida: '18:00'});
  expect(result.summary.workedMinutes).toBe(600);
  expect(result.summary.expectedMinutes).toBe(0);
  expect(result.balance.horaExtraMinutes).toBe(0);
  expect(result.balance.bancoHorasMinutes).toBe(0);
});

test('transition preserves fixed days and old negative balances without carrying them into hourly summary', () => {
  const fixed = sanitizeEmployeeWorkSchedule({tipoEscala: 'seg-sex'});
  const schedule = buildPointScheduleUpdate(fixed, hourly, '2026-10-06');
  const documents = [
    {dia: '2026-10-05', jornadaTrabalho: fixed, ...fiveHours},
    {dia: '2026-10-06', jornadaTrabalho: hourly, horaEntrada: '08:00', horaSaida: '12:00'}
  ];
  const storedBalance = {saldoBancoHorasFinalMinutes: -12780};
  const before = JSON.stringify({documents, storedBalance, schedule});
  const days = documents.map((record) => calculate(record, record.jornadaTrabalho, new Date(`${record.dia}T12:00:00`)));
  expect(days[0].balance.bancoHorasMinutes).toBe(-180);
  expect(days[1].balance.bancoHorasMinutes).toBe(0);
  const missingBefore = calculate({}, schedule, new Date(2026, 9, 1));
  const missingAfter = calculate({}, schedule, new Date(2026, 9, 7));
  expect(missingBefore.balance.bancoHorasMinutes).toBe(-480);
  expect(missingAfter.balance.bancoHorasMinutes).toBe(0);
  const hourlySummary = summarizePointMonth({schedule: resolvePointWorkSchedule(schedule, '2026-10-31'), calculations: days, previousBankMinutes: storedBalance.saldoBancoHorasFinalMinutes});
  expect(hourlySummary.workedMinutes).toBe(540);
  expect(hourlySummary.finalBankMinutes).toBe(0);
  expect(hourlySummary.overtimePayMinutes).toBe(0);
  const priorFixedSummary = summarizePointMonth({schedule: resolvePointWorkSchedule(schedule, '2026-09-30'), calculations: [days[0]], previousBankMinutes: storedBalance.saldoBancoHorasFinalMinutes});
  expect(priorFixedSummary.finalBankMinutes).toBe(-12960);
  expect(priorFixedSummary.bankApplicable).toBe(true);
  expect(JSON.stringify({documents, storedBalance, schedule})).toBe(before);
});

test.each([
  ['seg-sex', {}, new Date(2026, 9, 6), -180],
  ['personalizada', {cargaHorariaPorDia: {2: '06:00'}}, new Date(2026, 9, 6), -60],
  ['seg-sab-folga', {}, new Date(2026, 9, 10), 0]
])('monthly %s keeps previous bank and daily movements', (tipoEscala, fields, date, bank) => {
  const schedule = sanitizeEmployeeWorkSchedule({tipoEscala, ...fields});
  const day = calculate(fiveHours, schedule, date);
  const monthly = summarizePointMonth({schedule, calculations: [day], previousBankMinutes: -12780});
  expect(monthly.bankApplicable).toBe(true);
  expect(monthly.finalBankMinutes).toBe(-12780 + bank);
  expect(monthly.bankMovementMinutes).toBe(bank);
  expect(monthly.overtimePayMinutes).toBe(day.balance.horaExtraMinutes);
  expect(monthly.expectedMinutes).toBe(day.summary.expectedMinutes);
  expect(monthly.creditMinutes - monthly.debitMinutes).toBe(day.summary.irregularityMinutes || 0);
});

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

test.each([
  ['87h35', 5255, false, false],
  ['4h00 with historical -213h bank', 240, true, false],
  ['0h00 with historical -213h bank', 0, true, false],
  ['10h00 with historical bank', 600, true, false],
  ['9h00 including a preserved 5h fixed day', 540, true, true]
])('actual PDF exporter: %s, bank and overtime do not apply', async (_, workedMinutes, transition, historicalDay) => {
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
  const fixed = sanitizeEmployeeWorkSchedule({tipoEscala: 'seg-sex'});
  const employeeSchedule = transition ? buildPointScheduleUpdate(fixed, hourly, '2026-10-06') : hourly;
  const records = workedMinutes === 5255
    ? [...Array.from({length: 17}, (_, index) => ({id: `day-${index}`, funcionarioId: 'employee', dia: `2026-10-${String(index + 1).padStart(2, '0')}`, competencia: '2026-10', jornadaTrabalho: hourly, ...fiveHours})),
      {id: 'last', funcionarioId: 'employee', dia: '2026-10-18', jornadaTrabalho: hourly, horaEntrada: '08:00', horaSaida: '10:35'}]
    : workedMinutes ? [{id: 'day', funcionarioId: 'employee', dia: '2026-10-06', jornadaTrabalho: hourly, horaEntrada: '08:00', horaSaida: workedMinutes === 600 ? '18:00' : '12:00'}] : [];
  if (historicalDay) records.push({id: 'old', funcionarioId: 'employee', dia: '2026-10-05', jornadaTrabalho: fixed, ...fiveHours});
  const originalRecords = JSON.stringify(records);
  const messages = [];
  const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const previousBank = jest.fn(async () => -213 * 60);
  const monthlySummary = jest.fn(summarizePointMonth);
  const dependencies = {
    window: {jspdf: {jsPDF: PDF}}, records, recordsQueryMonth: '2026-10',
    getSelectedEmployeeIdForExport: () => 'employee', setRegisterMessage: (message) => messages.push(message),
    groupPointRecordsByDay, currentStoreIdForDisplay: 'dev',
    getRecordDateTime: (record) => new Date(`${record.dia}T12:00:00`), getRecordDayKey: (record) => record.dia,
    getPointSheetEmployee: () => ({name: 'Horista', category: 'Funcionária'}),
    getScheduleForEmployeeId: () => employeeSchedule, getPointBankStartDateForEmployeeId: () => historicalDay ? '' : '2026-11-01',
    getBrazilNationalHolidays: () => new Set(), toDateInputValue: dateKey,
    getRecordWorkSchedule: (record) => record.jornadaTrabalho,
    isPointBankDateBeforeStart: (day, firstDay) => day < firstDay,
    calculatePointDay: (record, options) => calculatePointDayCore({record, date: options.date, scheduleDay: getPointScheduleDayInfo(options.schedule, options.date), bankCalculationEnabled: options.bankCalculationEnabled}),
    buildPointPresentationRows, formatTime: (time) => time || '--:--',
    formatMinutesForPointSheet: (minutes) => formatPointWorkedMonth(minutes),
    getPreviousBankHoursBalance: previousBank, companyInfo: {nome: 'DEV'}, activeStoreInfo: {},
    getPointSheetMonthLabel: () => 'Outubro de 2026', formatCompanyAddressForPointSheet: () => '-',
    formatPointBankStartDateLabel: () => '01/11/2026', normalizeSearchText: (value) => value.toLowerCase(),
    isHourlyWorkSchedule, resolvePointWorkSchedule, getPointScheduleDayInfo, formatPointWorkedMonth, summarizePointMonth: monthlySummary,
    console, Date
  };
  // Execute the actual local exporter while replacing browser/PDF I/O only.
  // eslint-disable-next-line no-new-func
  const exportSheet = new Function(...Object.keys(dependencies), `${source.slice(start, end)}\nreturn handleExportPointSheet;`)(...Object.values(dependencies));
  await exportSheet();
  expect(messages[messages.length - 1].type).toBe('success');
  expect(printed).toContain('HORAS TRABALHADAS NO MÊS');
  expect(printed).toContain(formatPointWorkedMonth(workedMinutes));
  const summaryStart = printed.indexOf('Resumo do mês');
  const summaryEnd = printed.indexOf('CONFIRMO A FREQUÊNCIA ACIMA');
  const summary = printed.slice(summaryStart, summaryEnd);
  expect(summary).toContain('—');
  expect(summary).toContain('HORAS EXTRAS');
  expect(summary.some((value) => /^-\d/.test(value))).toBe(false);
  expect(summary.some((value) => /DÉBITOS MÊS|^-\d+h/.test(value))).toBe(false);
  expect(printed.includes('-03:00')).toBe(Boolean(historicalDay));
  expect(previousBank).not.toHaveBeenCalled();
  expect(monthlySummary.mock.results[0].value).toMatchObject({workedMinutes, finalBankMinutes: 0, expectedMinutes: 0, overtimePayMinutes: 0});
  expect(JSON.stringify(records)).toBe(originalRecords);
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

test('chosen effective date applies to frontend day/month calculation inclusively and preserves earlier fixed rules', () => {
  const fixed = sanitizeEmployeeWorkSchedule({tipoEscala: 'seg-sex'});
  const schedule = buildPointScheduleUpdate(fixed, hourly, '2026-11-01');
  const original = JSON.stringify(schedule);
  const before = calculate({...fiveHours, dia: '2026-10-30'}, schedule, new Date(2026, 9, 30));
  const after = calculate({...fiveHours, dia: '2026-11-02'}, schedule, new Date(2026, 10, 2));
  expect(before.summary.expectedMinutes).toBe(480);
  expect(before.balance.bancoHorasMinutes).toBe(-180);
  expect(after.summary.expectedMinutes).toBe(0);
  expect(after.balance).toMatchObject({bancoHoras: '—', horaExtra: '—', bancoHorasMinutes: 0, horaExtraMinutes: 0});
  expect(resolvePointWorkSchedule(schedule, '2026-11-01').tipoEscala).toBe('horista');
  expect(getPointScheduleEffectiveDate(schedule)).toBe('2026-11-01');
  expect(summarizePointMonth({schedule: resolvePointWorkSchedule(schedule, '2026-10-31'), calculations: [before], previousBankMinutes: -100}).finalBankMinutes).toBe(-280);
  expect(summarizePointMonth({schedule: resolvePointWorkSchedule(schedule, '2026-11-30'), calculations: [after], previousBankMinutes: -100}).finalBankMinutes).toBe(0);
  expect(buildPointScheduleUpdate(schedule, schedule, '2026-10-06')).toEqual(schedule);
  expect(arePointWorkSchedulesEqual(schedule, {...hourly, historicoEscalas: undefined})).toBe(true);
  expect(JSON.stringify(schedule)).toBe(original);
  expect(isValidPointScheduleDate('2026-02-30')).toBe(false);
  expect(isValidPointScheduleDate('2028-02-29')).toBe(true);
});

test('date field accepts and retains the selected transition date; reopening shows the saved effective date', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const Input = ({label, ...props}) => <label>{label}<input {...props} /></label>;
  const Select = ({label, children, ...props}) => <label>{label}<select {...props}>{children}</select></label>;
  let submitted;
  function Form() {
    const [date, setDate] = useState('2026-10-06');
    return <>
      <PointWorkScheduleFields schedule={hourly} bankStartDate="" onBankStartDateChange={() => {}} onScheduleChange={() => {}}
        effectiveDate={date} onEffectiveDateChange={setDate} showEffectiveDate Input={Input} Select={Select} />
      <button onClick={() => {submitted = date;}}>Salvar</button>
    </>;
  }
  const root = createRoot(container);
  try {
    act(() => root.render(<Form />));
    const field = container.querySelector('input[type="date"]');
    expect(field.required).toBe(true);
    expect(container.textContent).toContain('Aplicar nova jornada a partir de');
    act(() => Simulate.change(field, {target: {value: '2026-11-01'}}));
    act(() => Simulate.click(container.querySelector('button')));
    expect(submitted).toBe('2026-11-01');
    act(() => root.render(<PointWorkScheduleFields schedule={hourly} bankStartDate="" onBankStartDateChange={() => {}} onScheduleChange={() => {}}
      savedEffectiveDate={submitted} Input={Input} Select={Select} />));
    expect(container.textContent).toContain('Vigência registrada da jornada: 01/11/2026');
    expect(container.querySelector('input[type="date"]')).toBeNull();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

test.each([true, false])('actual profile submit sends the selected date only when changing the point schedule (%s)', async (changingSchedule) => {
  const source = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
  const from = source.indexOf('const handleUserSubmit = async');
  const to = source.indexOf('    const deleteUserAccount =', from);
  const payloads = [];
  const alerts = [];
  const dependencies = {
    userFormData: {email: 'employee@example.test', nome: 'Employee', role: 'atendente', lojaId: 'store', lojaIds: ['store'],
      applyCustomProfile: true, permissions: {}, permissionDetails: {}, jornadaTrabalho: hourly, dataInicioBancoHoras: ''},
    editingUser: {uid: 'employee'}, pointScheduleNeedsEffectiveDate: changingSchedule, pointScheduleEffectiveDate: '2026-11-01',
    isValidPointScheduleDate, sanitizeEmployeeWorkSchedule,
    normalizeRole: (role) => role, normalizePointBankStartDate: (value) => value,
    sanitizePermissions: (permissions) => permissions, sanitizePermissionDetails: (details) => details,
    effectiveStoreId: 'store', ROLE_OWNER: 'dono', user: {role: 'dono', auth: {uid: 'owner'}},
    functions: {}, setShowUserModal: jest.fn(), setUsuarios: jest.fn(),
    httpsCallable: (_functions, name) => async (payload) => {
      if (name === 'updateUser') { payloads.push(payload); return {data: {jornadaTrabalho: hourly}}; }
      return {data: {users: []}};
    },
    alert: (message) => alerts.push(message), console,
  };
  // eslint-disable-next-line no-new-func
  const submit = new Function(...Object.keys(dependencies), `${source.slice(from, to)}\nreturn handleUserSubmit;`)(...Object.values(dependencies));
  await submit({preventDefault: jest.fn()});
  expect(alerts).toEqual(['Usuário atualizado com sucesso!']);
  expect(payloads).toHaveLength(1);
  expect(Object.prototype.hasOwnProperty.call(payloads[0], 'dataInicioJornada')).toBe(changingSchedule);
  expect(payloads[0].dataInicioJornada).toBe(changingSchedule ? '2026-11-01' : undefined);
});


test('past chosen date overrides legacy fixed snapshots only in the hourly period without mutating history', () => {
  const fixed = sanitizeEmployeeWorkSchedule({tipoEscala: 'seg-sex'});
  const schedule = buildPointScheduleUpdate(fixed, hourly, '2026-09-01');
  const record = {dia: '2026-09-15', jornadaTrabalho: fixed, bancoHorasMinutes: -2464, horaExtraMinutes: 207, ...fiveHours};
  const original = JSON.stringify({schedule, record});
  const effective = resolvePointRecordWorkSchedule(schedule, record.jornadaTrabalho, record.dia);
  const result = calculate(record, effective, new Date(2026, 8, 15));
  expect(result.summary).toMatchObject({workedMinutes: 300, expectedMinutes: 0});
  expect(result.balance).toMatchObject({bancoHorasMinutes: 0, horaExtraMinutes: 0});
  expect(resolvePointRecordWorkSchedule(schedule, fixed, '2026-08-31').tipoEscala).toBe('seg-sex');
  const back = buildPointScheduleUpdate(schedule, fixed, '2026-11-01');
  expect(resolvePointRecordWorkSchedule(back, fixed, '2026-11-01').tipoEscala).toBe('seg-sex');
  expect(JSON.stringify({schedule, record})).toBe(original);
});
