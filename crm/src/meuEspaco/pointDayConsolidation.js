import { parsePointTimeToMinutes, resolvePointType } from './pointCalculationCore';
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
    .map((row) => row.startMinutes)
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
  const primary = orderedByPeriod[orderedByPeriod.length - 1].record;
  const workPeriods = [];
  const supplementalPeriods = [];
  const workPeriodKeys = new Set();
  const supplementalPeriodKeys = new Set();

  orderedByPeriod.forEach(({ record, index }) => {
    getRecordRows(record)
      .filter((row) => row.rowType === 'work' || row.rowType === 'manual')
      .forEach((row, rowIndex) => {
        const periodKey = [
          row.horaEntrada,
          row.horaAlmocoSaida,
          row.horaAlmocoRetorno,
          row.horaSaida,
          row.origin,
          row.ownJustification || row.source?.justificativa || ''
        ].join('|');
        if (workPeriodKeys.has(periodKey)) return;
        workPeriodKeys.add(periodKey);
        workPeriods.push(buildConsolidatedWorkPeriod(row, record, index, rowIndex));
      });
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
