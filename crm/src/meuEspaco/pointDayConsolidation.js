import {
  buildPointPunchEventsFromTimes,
  parsePointTimeToMinutes,
  resolvePointType
} from './pointCalculationCore';
import { buildPointPresentationRows } from './pointPresentation';

const getDayKey = (record = {}) => String(record.dia || record.dayKey || '').trim();

const getEmployeeKey = (record = {}) => String(
  record.funcionarioId || record.employeeId || record.funcionarioEmail || ''
).trim();

const getStoreKey = (record = {}, fallbackStoreId = '') => String(
  record.empresaId || record.lojaId || record.storeId || fallbackStoreId || ''
).trim();

const getTimestampMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const getRecordOrder = (record = {}, index = 0) => Math.max(
  getTimestampMillis(record.updatedAt),
  getTimestampMillis(record.atualizadoEm),
  getTimestampMillis(record.createdAt),
  getTimestampMillis(record.data)
) || index;

const getRecordRows = (record = {}) => buildPointPresentationRows(record, {
  baseJustification: record.justificativaGestor || record.justificativa || '-'
});

const getRecordStartMinutes = (record = {}) => {
  const starts = getRecordRows(record)
    .flatMap((row) => [
      row.startMinutes,
      parsePointTimeToMinutes(row.horaAlmocoSaida),
      parsePointTimeToMinutes(row.horaAlmocoRetorno),
      row.endMinutes
    ])
    .filter((value) => Number.isFinite(value) && value >= 0);
  return starts.length ? Math.min(...starts) : 24 * 60;
};

const buildConsolidatedWorkPeriod = (row, record, recordIndex, rowIndex) => ({
  ...(row.source || {}),
  id: `${record.id || recordIndex}_${row.source?.id || row.id || rowIndex}`,
  horaInicio: row.horaEntrada || '',
  horaAlmocoSaida: row.horaAlmocoSaida || '',
  horaAlmocoRetorno: row.horaAlmocoRetorno || '',
  horaFim: row.horaSaida || '',
  origem: row.origin || row.source?.origem || 'funcionaria',
  justificativa: row.ownJustification
    || row.source?.justificativa
    || record.justificativaGestor
    || record.justificativa
    || '',
  entryEvent: row.entryEvent || null,
  exitEvent: row.exitEvent || null,
  sourceRecordId: record.id || '',
  ativo: row.source?.ativo !== false
});

const JOURNEY_TIME_FIELDS = ['horaInicio', 'horaAlmocoSaida', 'horaAlmocoRetorno', 'horaFim'];

const hasJourneyTime = (journey = {}) => JOURNEY_TIME_FIELDS.some((field) => (
  parsePointTimeToMinutes(journey[field]) !== null
));

const getJourneyBounds = (journey = {}) => {
  const values = JOURNEY_TIME_FIELDS
    .map((field) => parsePointTimeToMinutes(journey[field]))
    .filter((value) => value !== null);
  return values.length
    ? { start: Math.min(...values), end: Math.max(...values) }
    : { start: null, end: null };
};

const isChronologicalJourney = (journey = {}) => {
  const values = JOURNEY_TIME_FIELDS
    .map((field) => parsePointTimeToMinutes(journey[field]))
    .filter((value) => value !== null);
  return values.every((value, index) => index === 0 || value > values[index - 1]);
};

const getJourneySessionKey = (journey = {}) => String(
  journey.jornadaId
  || journey.sessionId
  || journey.shiftId
  || journey.workSessionId
  || journey.attendanceSessionId
  || ''
).trim();

const getMatchingTimeCount = (left = {}, right = {}) => JOURNEY_TIME_FIELDS.reduce((count, field) => (
  left[field] && right[field] && left[field] === right[field] ? count + 1 : count
), 0);

const canBelongToJourney = (journey, candidate) => {
  const journeySession = getJourneySessionKey(journey);
  const candidateSession = getJourneySessionKey(candidate);
  if (journeySession && candidateSession) return journeySession === candidateSession;
  if (getMatchingTimeCount(journey, candidate) > 0) return true;

  const journeyBounds = getJourneyBounds(journey);
  const candidateBounds = getJourneyBounds(candidate);
  if (journeyBounds.start === null || candidateBounds.start === null) return false;
  const overlaps = candidateBounds.start <= journeyBounds.end && candidateBounds.end >= journeyBounds.start;
  if (overlaps) return true;

  const journeyExit = parsePointTimeToMinutes(journey.horaFim);
  const candidateEntry = parsePointTimeToMinutes(candidate.horaInicio);
  if (journeyExit !== null && candidateEntry !== null && candidateEntry > journeyExit) return false;

  // Sem saída final, eventos posteriores ainda pertencem à jornada aberta.
  return journeyExit === null;
};

const mergeJourneyCandidate = (journey, candidate) => {
  const shouldOverride = candidate.sourcePriority > journey.sourcePriority
    || (candidate.sourcePriority === journey.sourcePriority && candidate.sourceOrder >= journey.sourceOrder);
  const proposed = { ...journey };
  JOURNEY_TIME_FIELDS.forEach((field) => {
    if (!candidate[field]) return;
    if (!proposed[field] || shouldOverride) proposed[field] = candidate[field];
  });

  if (!isChronologicalJourney(proposed)) {
    JOURNEY_TIME_FIELDS.forEach((field) => {
      if (!journey[field] && candidate[field]) proposed[field] = candidate[field];
      else proposed[field] = journey[field] || '';
    });
  }

  const candidateIsManager = candidate.origem === 'gestor';
  return {
    ...proposed,
    origem: candidateIsManager ? 'gestor' : (journey.origem || candidate.origem),
    justificativa: candidate.justificativa || journey.justificativa || '',
    entryEvent: candidate.entryEvent || journey.entryEvent || null,
    exitEvent: candidate.exitEvent || journey.exitEvent || null,
    sourceRecordId: candidate.sourceRecordId || journey.sourceRecordId || '',
    sourceRecordIds: Array.from(new Set([
      ...(journey.sourceRecordIds || []),
      candidate.sourceRecordId
    ].filter(Boolean))),
    sourcePriority: Math.max(journey.sourcePriority, candidate.sourcePriority),
    sourceOrder: Math.max(journey.sourceOrder, candidate.sourceOrder)
  };
};

const consolidateWorkJourneys = (activeRecords = []) => {
  const candidates = activeRecords.flatMap(({ record, index, order }) => {
    const sourcePriority = record.manualPeloGestor || record.lancamentoManualGestor ? 1 : 0;
    return getRecordRows(record)
      .filter((row) => ['work', 'manual', 'day'].includes(row.rowType))
      .map((row, rowIndex) => ({
        ...buildConsolidatedWorkPeriod(row, record, index, rowIndex),
        jornadaId: getJourneySessionKey(row.source || record),
        sourcePriority,
        sourceOrder: order,
        sourceRowIndex: rowIndex
      }))
      .filter(hasJourneyTime);
  }).sort((left, right) => {
    const leftBounds = getJourneyBounds(left);
    const rightBounds = getJourneyBounds(right);
    return (leftBounds.start ?? 24 * 60) - (rightBounds.start ?? 24 * 60)
      || left.sourceOrder - right.sourceOrder
      || left.sourceRowIndex - right.sourceRowIndex;
  });

  const journeys = [];
  candidates.forEach((candidate) => {
    const matchingIndex = journeys.findIndex((journey) => canBelongToJourney(journey, candidate));
    if (matchingIndex === -1) {
      journeys.push({
        ...candidate,
        sourceRecordIds: candidate.sourceRecordId ? [candidate.sourceRecordId] : []
      });
      return;
    }
    journeys[matchingIndex] = mergeJourneyCandidate(journeys[matchingIndex], candidate);
  });

  return journeys
    .filter(hasJourneyTime)
    .sort((left, right) => (
      (getJourneyBounds(left).start ?? 24 * 60) - (getJourneyBounds(right).start ?? 24 * 60)
    ));
};

const getActiveSupplementalPeriods = (record = {}) => (
  Array.isArray(record.periodosComplementares)
    ? record.periodosComplementares.filter((period) => period && period.ativo !== false)
    : []
);

const getFullDayPriority = (record = {}) => {
  const type = resolvePointType(record);
  return ['ferias', 'abono_falta', 'folga_compensada', 'liberacao_chefia', 'folga', 'feriado', 'falta']
    .includes(type) ? 1 : 0;
};

export const consolidatePointDayRecords = (records = [], { storeId = '' } = {}) => {
  const activeRecords = records
    .filter((record) => record && record.ativo !== false && record.duplicadoArquivado !== true)
    .map((record, index) => ({ record, index, order: getRecordOrder(record, index) }));
  if (!activeRecords.length) return null;

  const orderedByPeriod = [...activeRecords].sort((left, right) => (
    getRecordStartMinutes(left.record) - getRecordStartMinutes(right.record)
    || left.order - right.order
  ));
  const primary = [...activeRecords]
    .sort((left, right) => left.order - right.order || left.index - right.index)
    .pop().record;
  const workPeriods = consolidateWorkJourneys(activeRecords);
  const supplementalPeriods = [];
  const supplementalPeriodKeys = new Set();

  orderedByPeriod.forEach(({ record, index }) => {
    getActiveSupplementalPeriods(record).forEach((period) => {
      const periodKey = [period.tipo, period.horaInicio, period.horaFim].join('|');
      if (supplementalPeriodKeys.has(periodKey)) return;
      supplementalPeriodKeys.add(periodKey);
      supplementalPeriods.push({ ...period, sourceRecordId: record.id || '' });
    });
  });

  const hasPeriodContent = workPeriods.length > 0 || supplementalPeriods.length > 0;
  const fullDaySource = [...activeRecords]
    .sort((left, right) => (
      getFullDayPriority(left.record) - getFullDayPriority(right.record)
      || left.order - right.order
    ))
    .pop()?.record || primary;
  const metadataSource = hasPeriodContent ? primary : fullDaySource;
  const employeeId = getEmployeeKey(metadataSource);
  const dayKey = getDayKey(metadataSource);
  const resolvedStoreId = getStoreKey(metadataSource, storeId);
  const firstJourney = workPeriods[0] || {};
  const canonicalPunches = workPeriods.flatMap((journey, index) => buildPointPunchEventsFromTimes({
    horaEntrada: journey.horaInicio,
    horaAlmocoSaida: journey.horaAlmocoSaida,
    horaAlmocoRetorno: journey.horaAlmocoRetorno,
    horaSaida: journey.horaFim,
    localizacaoEntrada: journey.entryEvent?.localizacao || null,
    localizacaoEntradaEndereco: journey.entryEvent?.endereco || '',
    localizacaoSaida: journey.exitEvent?.localizacao || null,
    localizacaoSaidaEndereco: journey.exitEvent?.endereco || ''
  }, {
    origem: journey.origem,
    idPrefix: `jornada_${index + 1}`
  }).map((event) => ({ ...event, jornadaId: journey.jornadaId || `jornada_${index + 1}` })));

  return {
    ...metadataSource,
    id: metadataSource.id || `${employeeId}_${dayKey}`,
    empresaId: metadataSource.empresaId || resolvedStoreId,
    funcionarioId: employeeId,
    dia: dayKey,
    competencia: metadataSource.competencia || dayKey.slice(0, 7),
    tipoLancamento: hasPeriodContent ? 'normal' : metadataSource.tipoLancamento,
    faltaSemAbono: hasPeriodContent ? false : metadataSource.faltaSemAbono,
    faltaAbonada: hasPeriodContent ? false : metadataSource.faltaAbonada,
    abonoFalta: hasPeriodContent ? false : metadataSource.abonoFalta,
    folgaCompensada: hasPeriodContent ? false : metadataSource.folgaCompensada,
    liberacaoChefia: hasPeriodContent ? false : metadataSource.liberacaoChefia,
    ferias: hasPeriodContent ? false : metadataSource.ferias,
    lancamentoFerias: hasPeriodContent ? false : metadataSource.lancamentoFerias,
    folga: hasPeriodContent ? false : metadataSource.folga,
    feriado: hasPeriodContent ? false : metadataSource.feriado,
    horaEntrada: workPeriods.length ? (firstJourney.horaInicio || '') : (metadataSource.horaEntrada || ''),
    horaAlmocoSaida: workPeriods.length ? (firstJourney.horaAlmocoSaida || '') : (metadataSource.horaAlmocoSaida || ''),
    horaAlmocoRetorno: workPeriods.length ? (firstJourney.horaAlmocoRetorno || '') : (metadataSource.horaAlmocoRetorno || ''),
    horaSaida: workPeriods.length ? (firstJourney.horaFim || '') : (metadataSource.horaSaida || ''),
    batidas: canonicalPunches,
    batidasSincronizadasComAjuste: true,
    periodosTrabalho: workPeriods,
    periodosComplementares: supplementalPeriods,
    sourceRecordIds: activeRecords.map(({ record }) => record.id).filter(Boolean),
    sourceRecords: activeRecords.map(({ record }) => record),
    consolidatedRecordCount: activeRecords.length,
    consolidated: activeRecords.length > 1
  };
};

export const groupPointRecordsByDay = (records = [], { storeId = '' } = {}) => {
  const groups = new Map();
  records.forEach((record) => {
    if (!record || record.ativo === false || record.duplicadoArquivado === true) return;
    const dayKey = getDayKey(record);
    const employeeKey = getEmployeeKey(record);
    if (!dayKey || !employeeKey) return;
    const groupKey = `${getStoreKey(record, storeId)}::${employeeKey}::${dayKey}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(record);
  });
  return Array.from(groups.values())
    .map((group) => consolidatePointDayRecords(group, { storeId }))
    .filter(Boolean)
    .sort((left, right) => {
      const dayDiff = getDayKey(left).localeCompare(getDayKey(right));
      if (dayDiff !== 0) return dayDiff;
      const employeeDiff = getEmployeeKey(left).localeCompare(getEmployeeKey(right), 'pt-BR');
      if (employeeDiff !== 0) return employeeDiff;
      return (parsePointTimeToMinutes(left.horaEntrada) ?? 24 * 60)
        - (parsePointTimeToMinutes(right.horaEntrada) ?? 24 * 60);
    });
};
