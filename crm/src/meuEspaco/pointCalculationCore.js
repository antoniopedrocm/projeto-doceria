const DEFAULT_EXPECTED_MINUTES = 8 * 60;
const DAILY_BANK_LIMIT_MINUTES = 15;
const SATURDAY_BANK_LIMIT_MINUTES = 5 * 60;
const MISSING_LUNCH_BANK_MINUTES = 60;

export const POINT_SUPPLEMENTAL_TYPES = {
  abono_periodo: 'Abono de período',
  liberacao_chefia_periodo: 'Liberação Chefia por período',
  trabalho_externo: 'Trabalho externo',
  saida_particular: 'Saída particular / período a descontar'
};

const JUSTIFIED_PERIOD_TYPES = new Set(['abono_periodo', 'liberacao_chefia_periodo']);

export const canManagePointRecords = (role) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  return ['dono', 'owner', 'admin', 'adm', 'administrador', 'administradora', 'administrador_master', 'gerente', 'gestor', 'gestora']
    .includes(normalizedRole);
};

export const getPointRecordLogicalId = (employeeId, dayKey) => `${String(employeeId || '').trim()}_${String(dayKey || '').trim()}`;

export const buildPointAuditEntry = ({
  now,
  employeeId,
  employeeName,
  dayKey,
  previousValues,
  nextValues,
  correctionReason,
  observations,
  managerId,
  managerName
}) => ({
  data: (now instanceof Date ? now : new Date(now)).toISOString(),
  tipo: 'ajuste_administrativo_ponto',
  funcionarioId: employeeId,
  funcionarioNome: employeeName,
  dia: dayKey,
  tipoAnterior: previousValues.tipoLancamentoLabel,
  novoTipo: nextValues.tipoLancamentoLabel,
  horariosAnteriores: previousValues.horarios,
  novosHorarios: nextValues.horarios,
  justificativaAnterior: previousValues.justificativaGestor || previousValues.justificativa,
  novaJustificativa: nextValues.justificativaGestor || nextValues.justificativa,
  bancoHorasAnterior: previousValues.bancoHoras,
  bancoHorasAnteriorMinutes: previousValues.bancoHorasMinutes,
  novoBancoHoras: nextValues.bancoHoras,
  novoBancoHorasMinutes: nextValues.bancoHorasMinutes,
  horaExtraAnterior: previousValues.horaExtra,
  horaExtraAnteriorMinutes: previousValues.horaExtraMinutes,
  novaHoraExtra: nextValues.horaExtra,
  novaHoraExtraMinutes: nextValues.horaExtraMinutes,
  motivoCorrecao: String(correctionReason || '').trim(),
  observacoes: String(observations || '').trim(),
  gestorId: managerId,
  gestor: managerName,
  valorAnterior: previousValues,
  valorNovo: nextValues
});

export const buildSupplementalPeriodAuditEntry = ({
  now,
  action,
  employeeId,
  employeeName,
  dayKey,
  previousPeriod = null,
  nextPeriod = null,
  reason,
  managerId,
  managerName
}) => ({
  data: (now instanceof Date ? now : new Date(now)).toISOString(),
  tipo: `periodo_complementar_${action}`,
  acao: action,
  origem: 'gestor',
  funcionarioId: employeeId,
  funcionarioNome: employeeName,
  dia: dayKey,
  periodoId: nextPeriod?.id || previousPeriod?.id || '',
  tipoAnterior: previousPeriod?.tipo || '',
  novoTipo: nextPeriod?.tipo || '',
  valorAnterior: previousPeriod,
  valorNovo: nextPeriod,
  justificativa: nextPeriod?.justificativa || previousPeriod?.justificativa || '',
  motivoCorrecao: String(reason || '').trim(),
  gestorId: managerId,
  gestor: managerName
});

export const parsePointTimeToMinutes = (time) => {
  if (typeof time !== 'string') return null;
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return null;
  return (hours * 60) + minutes;
};

const hasTime = (value) => parsePointTimeToMinutes(value) !== null;
const normalizeTypeText = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\s-]+/g, '_');

const getActiveSupplementalPeriods = (record = {}) => (
  Array.isArray(record.periodosComplementares)
    ? record.periodosComplementares.filter((period) => period && period.ativo !== false)
    : []
);

const toInterval = (startValue, endValue, source = null) => {
  const start = typeof startValue === 'number' ? startValue : parsePointTimeToMinutes(startValue);
  const end = typeof endValue === 'number' ? endValue : parsePointTimeToMinutes(endValue);
  if (start === null || end === null || end <= start) return null;
  return { start, end, source };
};

const mergeIntervals = (intervals = []) => {
  const sorted = intervals
    .filter(Boolean)
    .map((interval) => ({ ...interval }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  sorted.forEach((interval) => {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end) {
      merged.push(interval);
      return;
    }
    previous.end = Math.max(previous.end, interval.end);
  });
  return merged;
};

const sumIntervals = (intervals = []) => intervals.reduce((total, interval) => total + (interval.end - interval.start), 0);

const getOverlapMinutes = (leftIntervals = [], rightIntervals = []) => {
  const left = mergeIntervals(leftIntervals);
  const right = mergeIntervals(rightIntervals);
  let total = 0;
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const start = Math.max(left[leftIndex].start, right[rightIndex].start);
    const end = Math.min(left[leftIndex].end, right[rightIndex].end);
    if (end > start) total += end - start;
    if (left[leftIndex].end <= right[rightIndex].end) leftIndex += 1;
    else rightIndex += 1;
  }
  return total;
};

const subtractIntervals = (baseIntervals = [], deductions = []) => {
  const base = mergeIntervals(baseIntervals);
  const cuts = mergeIntervals(deductions);
  return base.flatMap((interval) => {
    let fragments = [interval];
    cuts.forEach((cut) => {
      fragments = fragments.flatMap((fragment) => {
        if (cut.end <= fragment.start || cut.start >= fragment.end) return [fragment];
        const pieces = [];
        if (cut.start > fragment.start) pieces.push({ start: fragment.start, end: cut.start });
        if (cut.end < fragment.end) pieces.push({ start: cut.end, end: fragment.end });
        return pieces;
      });
    });
    return fragments;
  });
};

const formatMinutes = (minutes, signed = false) => {
  const normalized = Number(minutes) || 0;
  const sign = normalized < 0 ? '-' : signed && normalized > 0 ? '+' : '';
  const abs = Math.abs(normalized);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
};

const formatBalance = (minutes) => Number(minutes) === 0 ? '-' : formatMinutes(minutes, true);

export const formatSupplementalPeriodLabel = (period = {}) => {
  const compactLabels = {
    abono_periodo: 'Abono',
    liberacao_chefia_periodo: 'Liberação Chefia',
    trabalho_externo: 'Trabalho externo',
    saida_particular: 'Saída particular'
  };
  const label = compactLabels[period.tipo] || POINT_SUPPLEMENTAL_TYPES[period.tipo] || period.tipo || 'Ajuste';
  return `${label} ${period.horaInicio || '--:--'}–${period.horaFim || '--:--'}`;
};

export const buildPointPunchEventsFromTimes = (record = {}, metadata = {}) => {
  const origin = metadata.origem
    || (record.manualPeloGestor || record.lancamentoManualGestor ? 'gestor' : 'funcionaria');
  const managerId = metadata.gestorId || record.gestorId || '';
  const managerName = metadata.gestorNome || record.gestorNome || '';
  const recordedAt = metadata.registradoEm || '';
  const common = {
    origem: origin,
    ...(managerId ? { gestorId: managerId } : {}),
    ...(managerName ? { gestorNome: managerName } : {}),
    ...(recordedAt ? { registradoEm: recordedAt } : {})
  };
  const eventId = (type, time) => metadata.idPrefix
    ? `${metadata.idPrefix}_${type}`
    : `horario_${type}_${time}`;

  return [
    record.horaEntrada && {
      ...common,
      id: eventId('entrada', record.horaEntrada),
      tipo: 'entrada',
      hora: record.horaEntrada,
      localizacao: record.localizacaoEntrada || null,
      endereco: record.localizacaoEntradaEndereco || ''
    },
    record.horaAlmocoSaida && {
      ...common,
      id: eventId('almoco_inicio', record.horaAlmocoSaida),
      tipo: 'almoco_inicio',
      hora: record.horaAlmocoSaida
    },
    record.horaAlmocoRetorno && {
      ...common,
      id: eventId('almoco_fim', record.horaAlmocoRetorno),
      tipo: 'almoco_fim',
      hora: record.horaAlmocoRetorno
    },
    record.horaSaida && {
      ...common,
      id: eventId('saida', record.horaSaida),
      tipo: 'saida',
      hora: record.horaSaida,
      localizacao: record.localizacaoSaida || null,
      endereco: record.localizacaoSaidaEndereco || ''
    }
  ].filter(Boolean);
};

const legacyPunchEvents = (record = {}) => buildPointPunchEventsFromTimes(record);

const hasManagerTimeCorrection = (record = {}) => Boolean(
  (record.manualPeloGestor || record.lancamentoManualGestor)
  && [record.horaEntrada, record.horaAlmocoSaida, record.horaAlmocoRetorno, record.horaSaida].some(hasTime)
);

export const getPointPunchEvents = (record = {}) => {
  const storedEvents = Array.isArray(record.batidas) ? record.batidas.filter(Boolean) : [];
  // Ajustes antigos atualizaram os quatro campos consolidados, mas deixaram
  // `batidas` com o estado anterior. Até esses documentos serem novamente
  // salvos, os horários corrigidos são a fonte vigente da jornada.
  const shouldUseCorrectedTimes = hasManagerTimeCorrection(record)
    && record.batidasSincronizadasComAjuste !== true;
  const events = shouldUseCorrectedTimes || !storedEvents.length
    ? legacyPunchEvents(record)
    : storedEvents;
  return events
    .map((event, index) => ({
      ...event,
      id: event.id || `batida-${index}-${event.tipo || 'evento'}-${event.hora || ''}`,
      origem: event.origem || (event.gestorId ? 'gestor' : 'funcionaria')
    }))
    .filter((event) => hasTime(event.hora));
};


const getEventWorkIntervals = (record = {}) => {
  const events = getPointPunchEvents(record);
  const intervals = [];
  let openStart = null;
  events.forEach((event) => {
    const minute = parsePointTimeToMinutes(event.hora);
    if (minute === null) return;
    if (event.tipo === 'entrada' || event.tipo === 'almoco_fim') {
      if (openStart === null) openStart = minute;
      return;
    }
    if ((event.tipo === 'saida' || event.tipo === 'almoco_inicio') && openStart !== null) {
      const interval = toInterval(openStart, minute, event);
      if (interval) intervals.push(interval);
      openStart = null;
    }
  });
  return intervals;
};

const getLegacyWorkIntervals = (record = {}) => {
  const entry = parsePointTimeToMinutes(record.horaEntrada);
  const exit = parsePointTimeToMinutes(record.horaSaida);
  const lunchStart = parsePointTimeToMinutes(record.horaAlmocoSaida);
  const lunchReturn = parsePointTimeToMinutes(record.horaAlmocoRetorno);
  if (entry === null || exit === null) return [];
  if (lunchStart !== null && lunchReturn !== null) {
    return [
      toInterval(entry, lunchStart, { origem: 'legado' }),
      toInterval(lunchReturn, exit, { origem: 'legado' })
    ].filter(Boolean);
  }
  if (lunchStart === null && lunchReturn === null) {
    return [toInterval(entry, exit, { origem: 'legado' })].filter(Boolean);
  }
  return [];
};

export const getPointWorkIntervals = (record = {}) => {
  const storedPeriods = Array.isArray(record.periodosTrabalho)
    ? record.periodosTrabalho
      .filter((period) => period && period.ativo !== false)
      .flatMap((period) => {
        const start = period.horaInicio || period.inicio;
        const end = period.horaFim || period.fim;
        const lunchStart = parsePointTimeToMinutes(period.horaAlmocoSaida);
        const lunchReturn = parsePointTimeToMinutes(period.horaAlmocoRetorno);
        const startMinutes = parsePointTimeToMinutes(start);
        const endMinutes = parsePointTimeToMinutes(end);
        const hasValidLunch = startMinutes !== null
          && endMinutes !== null
          && lunchStart !== null
          && lunchReturn !== null
          && lunchStart > startMinutes
          && lunchReturn > lunchStart
          && lunchReturn < endMinutes;
        if (!hasValidLunch) return [toInterval(start, end, period)].filter(Boolean);
        return [
          toInterval(startMinutes, lunchStart, period),
          toInterval(lunchReturn, endMinutes, period)
        ].filter(Boolean);
      })
      .filter(Boolean)
    : [];
  return mergeIntervals([
    ...getLegacyWorkIntervals(record),
    ...getEventWorkIntervals(record),
    ...storedPeriods
  ]);
};

export const getPointOpenPeriod = (record = {}) => {
  let openEvent = null;
  getPointPunchEvents(record).forEach((event) => {
    if (event.tipo === 'entrada' || event.tipo === 'almoco_fim') openEvent = event;
    if (event.tipo === 'saida' || event.tipo === 'almoco_inicio') openEvent = null;
  });
  return openEvent;
};

const hasAnyTime = (record = {}) => Boolean(
  record.horaEntrada
  || record.horaAlmocoSaida
  || record.horaAlmocoRetorno
  || record.horaSaida
  || getPointPunchEvents(record).length
  || getPointWorkIntervals(record).length
);

export const resolvePointType = (record = {}) => {
  const launchType = normalizeTypeText(record.tipoLancamento);
  const legacyText = [record.tipoLancamento, record.statusPonto, record.justificativa]
    .map(normalizeTypeText)
    .filter(Boolean);
  if (
    launchType === 'ferias'
    || record.ferias === true
    || record.lancamentoFerias === true
    || (!launchType && legacyText.includes('ferias'))
  ) return 'ferias';
  if (['abono_falta', 'falta_abonada'].some((value) => legacyText.includes(value)) || record.faltaAbonada === true || record.abonoFalta === true) return 'abono_falta';
  if (legacyText.includes('folga_compensada') || record.folgaCompensada === true) return 'folga_compensada';
  if (legacyText.includes('liberacao_chefia') || record.liberacaoChefia === true) return 'liberacao_chefia';
  if (launchType === 'folga' || record.folga === true) return 'folga';
  if (launchType === 'feriado' || record.feriado === true) return 'feriado';
  if (legacyText.includes('falta') || record.faltaSemAbono === true || record.virtualAbsence === true) return 'falta';
  if (['manual_pelo_gestor', 'manual', 'lancamento_manual_de_ponto'].includes(launchType)) return 'manual';
  return launchType || 'normal';
};

const getPointInconsistencies = (record = {}) => {
  const issues = [];
  const storedEvents = Array.isArray(record.batidas) ? record.batidas.filter(Boolean) : [];
  if (storedEvents.length) {
    let state = 'sem_periodo';
    storedEvents.forEach((event) => {
      if (event.tipo === 'entrada') {
        if (state !== 'sem_periodo') issues.push('Entrada registrada enquanto já existia um período aberto.');
        state = 'trabalhando';
      } else if (event.tipo === 'almoco_inicio') {
        if (state !== 'trabalhando') issues.push('Início do almoço sem período de trabalho aberto.');
        state = 'almoco';
      } else if (event.tipo === 'almoco_fim') {
        if (state !== 'almoco') issues.push('Retorno do almoço sem início de almoço correspondente.');
        state = 'trabalhando';
      } else if (event.tipo === 'saida') {
        if (state !== 'trabalhando') issues.push('Saída registrada sem entrada correspondente.');
        state = 'sem_periodo';
      }
    });
  } else {
    if (record.horaSaida && !record.horaEntrada) issues.push('Saída registrada sem entrada correspondente.');
    if (record.horaAlmocoSaida && !record.horaEntrada) issues.push('Início do almoço registrado sem entrada correspondente.');
    if (record.horaAlmocoRetorno && !record.horaAlmocoSaida) issues.push('Retorno do almoço registrado sem início de almoço correspondente.');
    if (record.horaAlmocoSaida && !record.horaAlmocoRetorno && record.horaSaida) issues.push('Saída final registrada sem retorno do almoço.');
  }
  return [...new Set(issues)];
};

const getStatus = (record, type) => {
  const neutralLabels = {
    ferias: 'Férias',
    abono_falta: 'Falta abonada',
    folga_compensada: 'FOLGA COMPENSADA',
    liberacao_chefia: 'Liberação Chefia',
    folga: 'Folga',
    feriado: 'Feriado',
    falta: 'Falta'
  };
  if (neutralLabels[type]) {
    return { inconsistente: false, necessitaAjuste: false, statusPonto: neutralLabels[type], inconsistencias: [] };
  }
  const issues = getPointInconsistencies(record);
  if (issues.length) return { inconsistente: true, necessitaAjuste: true, statusPonto: 'Pendente de ajuste', inconsistencias: issues };
  const hasOpenPeriod = Boolean(getPointOpenPeriod(record));
  const hasClosedPeriod = getPointWorkIntervals(record).length > 0;
  const supplementalPeriods = getActiveSupplementalPeriods(record);
  const hasExternalWork = supplementalPeriods.some((period) => period.tipo === 'trabalho_externo');
  const hasJustifiedPeriod = supplementalPeriods.some((period) => JUSTIFIED_PERIOD_TYPES.has(period.tipo));
  return {
    inconsistente: false,
    necessitaAjuste: false,
    statusPonto: hasOpenPeriod
      ? 'Em andamento'
      : hasClosedPeriod || hasExternalWork || record.horaSaida
        ? 'Completo'
        : hasJustifiedPeriod
          ? 'Justificado'
          : 'Sem registro',
    inconsistencias: []
  };
};

const getBaseJustification = ({ record, type, dayOfWeek, isHoliday, scheduleDay, summary }) => {
  const rawReason = String(record.justificativaGestor || '').trim();
  if (type === 'ferias') return 'Férias';
  if (type === 'falta') return 'Falta';
  if (type === 'folga_compensada') return 'FOLGA COMPENSADA';
  if (type === 'liberacao_chefia') return rawReason ? `Liberação Chefia - ${rawReason}` : 'Liberação Chefia';
  if (type === 'folga') return 'Folga';
  if (type === 'feriado') return 'Feriado';
  if (type === 'abono_falta') {
    const reason = String(record.justificativa || '').trim();
    if (!reason) return 'Falta abonada';
    return /^falta abonada/i.test(reason) ? reason : `Falta abonada - ${reason}`;
  }
  if (dayOfWeek >= 1 && dayOfWeek <= 5 && isHoliday) return hasAnyTime(record) ? 'Hora Extra' : 'Feriado';
  if (scheduleDay.isWorkday && !isHoliday && !hasAnyTime(record) && !getActiveSupplementalPeriods(record).length) return 'Falta';
  if (record.justificativa) return record.justificativa;
  if (dayOfWeek === 6 && hasAnyTime(record) && scheduleDay.schedule?.tipoEscala !== 'seg-sab-folga') return 'Sábado trabalhado';
  if (summary.calculable && summary.irregularityMinutes !== 0) return summary.irregularidade;
  if (!hasAnyTime(record)) {
    if (scheduleDay.isWeeklyDayOff) return 'FOLGA SEMANAL';
    return dayOfWeek === 0 ? 'FOLGA' : dayOfWeek === 6 ? 'FOLGA COMPENSADA' : 'Sem registro';
  }
  return '-';
};

export const validateSupplementalPeriod = ({
  period = {},
  existingPeriods = [],
  record = {},
  ignoreId = ''
} = {}) => {
  const errors = [];
  if (!POINT_SUPPLEMENTAL_TYPES[period.tipo]) errors.push('Selecione um tipo de ajuste válido.');
  const interval = toInterval(period.horaInicio, period.horaFim, period);
  if (!interval) errors.push('O horário final deve ser posterior ao horário inicial.');
  if (!String(period.justificativa || '').trim()) errors.push('A justificativa é obrigatória.');
  const comparablePeriods = existingPeriods.filter((item) => item && item.ativo !== false && item.id !== ignoreId);
  if (interval) {
    const duplicate = comparablePeriods.some((item) => (
      item.tipo === period.tipo
      && item.horaInicio === period.horaInicio
      && item.horaFim === period.horaFim
    ));
    if (duplicate) errors.push('Já existe um ajuste idêntico para este dia.');
    const overlapsAnotherAdjustment = comparablePeriods.some((item) => {
      const other = toInterval(item.horaInicio, item.horaFim, item);
      return other && Math.max(interval.start, other.start) < Math.min(interval.end, other.end);
    });
    if (overlapsAnotherAdjustment) errors.push('O período se sobrepõe a outro ajuste e pode gerar dupla contabilização.');

    const actualWorkIntervals = getPointWorkIntervals(record);
    const overlapWithWork = getOverlapMinutes([interval], actualWorkIntervals);
    if (['trabalho_externo', 'abono_periodo', 'liberacao_chefia_periodo'].includes(period.tipo) && overlapWithWork > 0) {
      errors.push('Este tipo de ajuste não pode coincidir com uma batida já contabilizada.');
    }
    if (period.tipo === 'saida_particular' && overlapWithWork === 0) {
      errors.push('A saída particular precisa alcançar um período atualmente computado como trabalho.');
    }
  }
  return { valid: errors.length === 0, errors };
};

export const calculatePointDayCore = ({
  record = {},
  date = null,
  scheduleDay = {},
  bankCalculationEnabled = true,
  isHoliday = false
} = {}) => {
  const type = resolvePointType(record);
  const dayOfWeek = date instanceof Date && !Number.isNaN(date.getTime()) ? date.getDay() : null;
  const isNeutral = ['ferias', 'abono_falta', 'folga_compensada', 'liberacao_chefia', 'folga', 'feriado'].includes(type);
  const isAbsence = type === 'falta';
  const expectedMinutes = scheduleDay.isWorkday && !isHoliday
    ? (Number(scheduleDay.expectedMinutes) || DEFAULT_EXPECTED_MINUTES)
    : 0;
  const supplementalPeriods = getActiveSupplementalPeriods(record);
  const actualIntervals = getPointWorkIntervals(record);
  const externalIntervals = supplementalPeriods
    .filter((period) => period.tipo === 'trabalho_externo')
    .map((period) => toInterval(period.horaInicio, period.horaFim, period))
    .filter(Boolean);
  const privateIntervals = supplementalPeriods
    .filter((period) => period.tipo === 'saida_particular')
    .map((period) => toInterval(period.horaInicio, period.horaFim, period))
    .filter(Boolean);
  const justifiedIntervals = supplementalPeriods
    .filter((period) => JUSTIFIED_PERIOD_TYPES.has(period.tipo))
    .map((period) => toInterval(period.horaInicio, period.horaFim, period))
    .filter(Boolean);

  const workBeforeDeductions = mergeIntervals([...actualIntervals, ...externalIntervals]);
  const effectiveIntervals = subtractIntervals(workBeforeDeductions, privateIntervals);
  const realWorkedMinutes = sumIntervals(actualIntervals);
  const combinedBeforePrivateMinutes = sumIntervals(workBeforeDeductions);
  const effectiveWorkedMinutes = sumIntervals(effectiveIntervals);
  const externalWorkedMinutes = combinedBeforePrivateMinutes - realWorkedMinutes;
  const privateDeductedMinutes = combinedBeforePrivateMinutes - effectiveWorkedMinutes;
  const justifiedRegisteredMinutes = sumIntervals(mergeIntervals(justifiedIntervals));
  const deficitBeforeJustification = Math.max(expectedMinutes - effectiveWorkedMinutes, 0);
  const justifiedAppliedMinutes = Math.min(justifiedRegisteredMinutes, deficitBeforeJustification);
  const consideredMinutes = effectiveWorkedMinutes + justifiedAppliedMinutes;
  const hasOpenPeriod = Boolean(getPointOpenPeriod(record));
  const hasCalculableContent = effectiveWorkedMinutes > 0
    || justifiedRegisteredMinutes > 0
    || isAbsence
    || (!hasOpenPeriod && scheduleDay.isWorkday && !isHoliday && !hasAnyTime(record));
  const calculable = !isNeutral && dayOfWeek !== null && hasCalculableContent;
  const irregularityMinutes = calculable ? consideredMinutes - expectedMinutes : null;
  const summary = {
    workedLabel: calculable || effectiveWorkedMinutes > 0 ? formatMinutes(effectiveWorkedMinutes) : '-',
    irregularidade: irregularityMinutes === null ? '-' : (irregularityMinutes === 0 ? '00:00' : formatMinutes(irregularityMinutes, true)),
    workedMinutes: calculable || effectiveWorkedMinutes > 0 ? effectiveWorkedMinutes : null,
    realWorkedMinutes,
    externalWorkedMinutes,
    privateDeductedMinutes,
    justifiedRegisteredMinutes,
    justifiedAppliedMinutes,
    consideredMinutes,
    expectedMinutes,
    irregularityMinutes,
    calculable
  };

  let bancoHorasMinutes = 0;
  let horaExtraMinutes = 0;
  let missingLunchMinutes = 0;
  const absenceDebitMinutes = calculable && irregularityMinutes < 0 && effectiveWorkedMinutes === 0 && justifiedAppliedMinutes === 0
    ? Math.abs(irregularityMinutes)
    : 0;

  if (!isNeutral && bankCalculationEnabled && calculable) {
    const scheduledSaturday = dayOfWeek === 6 && scheduleDay.schedule?.tipoEscala === 'seg-sab-folga' && scheduleDay.isWorkday;
    const saturdayOutsideSchedule = dayOfWeek === 6 && !scheduledSaturday && effectiveWorkedMinutes > 0;
    if (saturdayOutsideSchedule) {
      bancoHorasMinutes = Math.min(effectiveWorkedMinutes, SATURDAY_BANK_LIMIT_MINUTES);
      horaExtraMinutes = Math.max(effectiveWorkedMinutes - SATURDAY_BANK_LIMIT_MINUTES, 0);
    } else if (scheduledSaturday) {
      if (irregularityMinutes > 0) horaExtraMinutes = irregularityMinutes;
      if (irregularityMinutes < 0) bancoHorasMinutes = irregularityMinutes;
    } else if (irregularityMinutes > 0) {
      bancoHorasMinutes = Math.min(irregularityMinutes, DAILY_BANK_LIMIT_MINUTES);
      horaExtraMinutes = Math.max(irregularityMinutes - DAILY_BANK_LIMIT_MINUTES, 0);
    } else if (irregularityMinutes < 0) {
      bancoHorasMinutes = irregularityMinutes;
    }

    const naturalGaps = workBeforeDeductions.slice(1).map((interval, index) => ({
      start: workBeforeDeductions[index].end,
      end: interval.start
    })).filter((interval) => interval.end > interval.start);
    const hasRegisteredNonWorkingBreak = privateDeductedMinutes >= MISSING_LUNCH_BANK_MINUTES
      || naturalGaps.some((interval) => interval.end - interval.start >= MISSING_LUNCH_BANK_MINUTES);
    const hasLegacyFullDay = hasTime(record.horaEntrada) && hasTime(record.horaSaida);
    if (
      hasLegacyFullDay
      && !hasTime(record.horaAlmocoSaida)
      && !hasTime(record.horaAlmocoRetorno)
      && dayOfWeek !== 6
      && !hasRegisteredNonWorkingBreak
      && supplementalPeriods.length === 0
    ) {
      missingLunchMinutes = MISSING_LUNCH_BANK_MINUTES;
      bancoHorasMinutes += missingLunchMinutes;
    }
  }

  const balance = {
    bancoHorasMinutes,
    horaExtraMinutes,
    bancoHoras: isNeutral || !bankCalculationEnabled ? '-' : formatBalance(bancoHorasMinutes),
    horaExtra: isNeutral || !bankCalculationEnabled ? '-' : formatBalance(horaExtraMinutes),
    almocoNaoRegistradoBancoHoras: missingLunchMinutes,
    faltaSemAbonoBancoHoras: absenceDebitMinutes,
    calculable: !isNeutral && calculable
  };
  const status = getStatus(record, type);
  const baseJustification = dayOfWeek === null
    ? (record.justificativa || '-')
    : getBaseJustification({ record, type, dayOfWeek, isHoliday, scheduleDay, summary });
  const supplementalLabels = supplementalPeriods.map(formatSupplementalPeriodLabel);
  const justification = [
    baseJustification && baseJustification !== '-' ? baseJustification : '',
    ...supplementalLabels
  ].filter(Boolean).join(' · ') || '-';
  return {
    type,
    summary,
    balance,
    status,
    baseJustification,
    justification,
    supplementalPeriods,
    workIntervals: actualIntervals,
    effectiveWorkIntervals: effectiveIntervals,
    absenceDebitMinutes
  };
};
