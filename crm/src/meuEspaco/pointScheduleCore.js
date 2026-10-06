// Canonical source: functions/point-schedule-core.js. Generate its ESM browser copy with scripts/sync-point-schedule.cjs.
const POINT_WORK_SCHEDULE_TYPES = [
  { value: 'seg-sex', label: 'Segunda a sexta' },
  { value: 'seg-sab-folga', label: 'Segunda a sábado com uma folga semanal' },
  { value: 'personalizada', label: 'Personalizada' },
  { value: 'horista', label: 'Horista' },
];

const POINT_WEEK_DAYS = [
  { value: '1', label: 'Segunda' },
  { value: '2', label: 'Terça' },
  { value: '3', label: 'Quarta' },
  { value: '4', label: 'Quinta' },
  { value: '5', label: 'Sexta' },
  { value: '6', label: 'Sábado' },
  { value: '0', label: 'Domingo' },
];

const DEFAULT_POINT_DAILY_LOADS = {
  0: '00:00',
  1: '08:00',
  2: '08:00',
  3: '08:00',
  4: '08:00',
  5: '08:00',
  6: '05:00',
};

const DEFAULT_POINT_WORK_SCHEDULE = {
  tipoEscala: 'seg-sex',
  diasTrabalho: ['1', '2', '3', '4', '5'],
  cargaHorariaPorDia: DEFAULT_POINT_DAILY_LOADS,
  folgaSemanal: '',
  folgaVariavel: false,
  horarioPadrao: {
    entrada: '09:30',
    almocoSaida: '12:00',
    almocoRetorno: '13:00',
    saida: '18:30',
    intervaloMinutos: 60,
  },
};

const parsePointDurationToMinutes = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  if (!text) return fallback;
  const timeMatch = text.match(/^(\d{1,3}):(\d{2})$/);
  if (timeMatch) {
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) return (hours * 60) + minutes;
  }
  const numberMatch = text.replace(',', '.').match(/^(\d+(?:\.\d+)?)$/);
  if (numberMatch) {
    const hours = Number(numberMatch[1]);
    if (Number.isFinite(hours)) return Math.round(hours * 60);
  }
  return fallback;
};

const formatPointDurationInput = (minutes) => {
  const normalized = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const sanitizePointTimeInput = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return /^\d{1,2}:\d{2}$/.test(text) ? text : fallback;
};

const sanitizeEmployeeWorkSchedule = (input = null) => {
  const source = input && typeof input === 'object' ? input : {};
  const type = POINT_WORK_SCHEDULE_TYPES.some((item) => item.value === source.tipoEscala)
    ? source.tipoEscala
    : DEFAULT_POINT_WORK_SCHEDULE.tipoEscala;
  const defaultWorkdays = type === 'seg-sab-folga'
    ? ['1', '2', '3', '4', '5', '6']
    : [...DEFAULT_POINT_WORK_SCHEDULE.diasTrabalho];
  const rawWorkdays = Array.isArray(source.diasTrabalho) && source.diasTrabalho.length
    ? source.diasTrabalho
    : defaultWorkdays;
  const diasTrabalho = Array.from(new Set(
    rawWorkdays
      .map((day) => String(day))
      .filter((day) => POINT_WEEK_DAYS.some((option) => option.value === day))
  ));
  const rawLoads = source.cargaHorariaPorDia && typeof source.cargaHorariaPorDia === 'object'
    ? source.cargaHorariaPorDia
    : {};
  const cargaHorariaPorDia = POINT_WEEK_DAYS.reduce((acc, day) => {
    const fallbackMinutes = parsePointDurationToMinutes(DEFAULT_POINT_DAILY_LOADS[day.value], 0);
    acc[day.value] = formatPointDurationInput(parsePointDurationToMinutes(rawLoads[day.value], fallbackMinutes));
    return acc;
  }, {});
  const rawBreak = source.horarioPadrao?.intervaloMinutos;

  return {
    tipoEscala: type,
    ...(Array.isArray(source.historicoEscalas) && source.historicoEscalas.length ? {
      historicoEscalas: source.historicoEscalas
        .filter((entry) => entry && (entry.inicio === '' || /^\d{4}-\d{2}-\d{2}$/.test(entry.inicio)))
        .map((entry) => ({ inicio: entry.inicio, jornadaTrabalho: sanitizeEmployeeWorkSchedule({
          ...entry.jornadaTrabalho, historicoEscalas: undefined
        }) }))
    } : {}),
    diasTrabalho,
    cargaHorariaPorDia,
    folgaSemanal: POINT_WEEK_DAYS.some((day) => day.value === String(source.folgaSemanal)) ? String(source.folgaSemanal) : '',
    folgaVariavel: Boolean(source.folgaVariavel),
    horarioPadrao: {
      entrada: sanitizePointTimeInput(source.horarioPadrao?.entrada, DEFAULT_POINT_WORK_SCHEDULE.horarioPadrao.entrada),
      almocoSaida: sanitizePointTimeInput(source.horarioPadrao?.almocoSaida, DEFAULT_POINT_WORK_SCHEDULE.horarioPadrao.almocoSaida),
      almocoRetorno: sanitizePointTimeInput(source.horarioPadrao?.almocoRetorno, DEFAULT_POINT_WORK_SCHEDULE.horarioPadrao.almocoRetorno),
      saida: sanitizePointTimeInput(source.horarioPadrao?.saida, DEFAULT_POINT_WORK_SCHEDULE.horarioPadrao.saida),
      intervaloMinutos: Math.max(0, Math.round(Number(rawBreak) || DEFAULT_POINT_WORK_SCHEDULE.horarioPadrao.intervaloMinutos)),
    },
  };
};

const getPointScheduleDayInfo = (scheduleInput, date) => {
  const schedule = resolvePointWorkSchedule(scheduleInput, pointScheduleDateKey(date));
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return { isWorkday: false, expectedMinutes: 0, isWeeklyDayOff: false, schedule };
  }
  if (isHourlyWorkSchedule(schedule)) {
    return { isWorkday: false, expectedMinutes: 0, isWeeklyDayOff: false, schedule };
  }
  const dayKey = String(date.getDay());
  const isWeeklyDayOff = !schedule.folgaVariavel && schedule.folgaSemanal === dayKey;
  const isWorkday = schedule.diasTrabalho.includes(dayKey) && !isWeeklyDayOff;
  const expectedMinutes = isWorkday ? parsePointDurationToMinutes(schedule.cargaHorariaPorDia[dayKey], 0) : 0;
  return { isWorkday, expectedMinutes, isWeeklyDayOff, schedule };
};

// Horista is an explicit policy, never a clamp of a fixed-schedule balance.
const isHourlyWorkSchedule = (schedule) => schedule?.tipoEscala === 'horista';
const pointScheduleDateKey = (date) => date instanceof Date && !Number.isNaN(date.getTime())
  ? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
  : '';

const resolvePointWorkSchedule = (input, dayKey = '') => {
  const schedule = sanitizeEmployeeWorkSchedule(input);
  if (!dayKey || !schedule.historicoEscalas?.length) return schedule;
  const entries = [...schedule.historicoEscalas].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const entry = entries.filter((item) => item.inicio <= dayKey).pop();
  return entry ? sanitizeEmployeeWorkSchedule(entry.jornadaTrabalho) : schedule;
};

// A declared hourly effective date must not fall back to a legacy fixed
// snapshot when the employee registers another punch on that date.
const resolvePointRecordWorkSchedule = (employeeInput, recordInput, dayKey = '') => {
  const effective = resolvePointWorkSchedule(employeeInput, dayKey);
  return isHourlyWorkSchedule(effective)
    ? effective
    : recordInput ? sanitizeEmployeeWorkSchedule(recordInput) : effective;
};

// History is owned by the server. Client-supplied history must not replace it.
const isValidPointScheduleDate = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime())
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

const arePointWorkSchedulesEqual = (left, right) => {
  const withoutHistory = (input) => sanitizeEmployeeWorkSchedule({ ...input, historicoEscalas: undefined });
  return JSON.stringify(withoutHistory(left)) === JSON.stringify(withoutHistory(right));
};

const getPointScheduleEffectiveDate = (input) => {
  const history = sanitizeEmployeeWorkSchedule(input).historicoEscalas || [];
  return history.map((entry) => entry.inicio).filter(isValidPointScheduleDate).sort().pop() || '';
};

const buildPointScheduleUpdate = (previousInput, nextInput, dayKey) => {
  const previous = sanitizeEmployeeWorkSchedule(previousInput);
  const next = sanitizeEmployeeWorkSchedule({ ...nextInput, historicoEscalas: undefined });
  const involvesHourly = isHourlyWorkSchedule(previous) || isHourlyWorkSchedule(next);
  const history = previous.historicoEscalas || [];
  // Editing name/permissions must not bring a scheduled future change forward.
  if (arePointWorkSchedulesEqual(previous, next)) return previous;
  if (previous.tipoEscala === next.tipoEscala && !history.length) return next;
  if (!involvesHourly && !history.length) return next;
  if (!isValidPointScheduleDate(dayKey)) throw new Error('Data de vigência inválida.');
  const previousSnapshot = { ...previous };
  delete previousSnapshot.historicoEscalas;
  const baseline = history.length ? history : [{ inicio: '', jornadaTrabalho: previousSnapshot }];
  return { ...next, historicoEscalas: [
    ...baseline.filter((entry) => entry.inicio !== dayKey),
    { inicio: dayKey, jornadaTrabalho: next }
  ] };
};

const hasIncompletePointLunch = (period = {}) => Boolean(period.horaAlmocoSaida) !== Boolean(period.horaAlmocoRetorno);
const hasIncompletePointPeriodLunch = (record = {}) => (Array.isArray(record.periodosTrabalho) ? record.periodosTrabalho : [])
  .some((period) => period && period.ativo !== false && hasIncompletePointLunch(period));
const isPointJourneyPending = (events = []) => ['entrada', 'almoco_inicio', 'almoco_fim'].includes(events[events.length - 1]?.tipo);

const getHourlyPointSummary = (workedMinutes, invalid = false) => ({
  workedMinutes: invalid ? null : workedMinutes,
  workedLabel: invalid ? '-' : formatPointDurationInput(workedMinutes),
  expectedMinutes: 0,
  irregularityMinutes: null,
  irregularidade: '—',
  justifiedAppliedMinutes: 0,
  consideredMinutes: invalid ? 0 : workedMinutes,
  calculable: !invalid
});
const getHourlyPointBalance = () => ({
  bancoHorasMinutes: 0, horaExtraMinutes: 0,
  bancoHoras: '—', horaExtra: '—',
  almocoNaoRegistradoBancoHoras: 0, faltaSemAbonoBancoHoras: 0,
  calculable: false, bancoHorasAplicavel: false
});
const formatPointWorkedMonth = (minutes) => {
  const total = Number(minutes) || 0;
  return Math.floor(total / 60) + 'h' + String(total % 60).padStart(2, '0');
};
const sumPointWorkedMinutes = (calculations = []) => calculations.reduce((total, calculation) => (
  total + (calculation.status?.inconsistente ? 0 : Number(calculation.summary?.workedMinutes) || 0)
), 0);

export {
  POINT_WORK_SCHEDULE_TYPES, POINT_WEEK_DAYS, DEFAULT_POINT_DAILY_LOADS,
  sanitizeEmployeeWorkSchedule, getPointScheduleDayInfo,
  parsePointDurationToMinutes, formatPointDurationInput,
  isHourlyWorkSchedule, resolvePointWorkSchedule, resolvePointRecordWorkSchedule, buildPointScheduleUpdate,
  isValidPointScheduleDate, arePointWorkSchedulesEqual, getPointScheduleEffectiveDate,
  getHourlyPointSummary, getHourlyPointBalance, formatPointWorkedMonth, sumPointWorkedMinutes,
  hasIncompletePointLunch, hasIncompletePointPeriodLunch, isPointJourneyPending
};
