import {
  getPointPunchEvents,
  parsePointTimeToMinutes,
  POINT_SUPPLEMENTAL_TYPES,
  resolvePointType
} from './pointCalculationCore';

const FULL_DAY_TYPE_LABELS = {
  falta: 'Falta',
  abono_falta: 'Falta abonada',
  folga_compensada: 'FOLGA COMPENSADA',
  liberacao_chefia: 'Liberação Chefia',
  ferias: 'Férias',
  folga: 'Folga',
  feriado: 'Feriado'
};

const SUPPLEMENTAL_ROW_LABELS = {
  abono_periodo: 'Abono de período',
  liberacao_chefia_periodo: 'Liberação Chefia',
  trabalho_externo: 'Trabalho externo',
  saida_particular: 'Saída particular'
};

const isManagerRecord = (record = {}) => Boolean(
  record.lancamentoManualGestor
  || record.manualPeloGestor
  || String(record.tipoLancamento || '').includes('gestor')
);

const getEventOrigin = (event = {}, record = {}) => (
  event.origem || (event.gestorId || isManagerRecord(record) ? 'gestor' : 'funcionaria')
);

const getWorkRowLabel = (origin, record = {}) => (
  origin === 'gestor' || isManagerRecord(record) ? 'Lançamento manual' : 'Período trabalhado'
);

const buildEventWorkRows = (record = {}) => {
  const rows = [];
  let current = null;
  getPointPunchEvents(record).forEach((event, eventIndex) => {
    if (event.tipo === 'entrada') {
      // Uma nova entrada só inicia outra jornada depois de uma saída final.
      // Entradas repetidas em uma jornada ainda aberta são dados redundantes
      // (ou uma correção antiga), não uma segunda linha.
      if (current) return;
      const origin = getEventOrigin(event, record);
      current = {
        id: `trabalho-${event.id || eventIndex}`,
        rowType: origin === 'gestor' ? 'manual' : 'work',
        typeLabel: getWorkRowLabel(origin, record),
        origin,
        originLabel: origin === 'gestor' ? 'Lançado pelo gestor' : 'Registrado pela funcionária',
        horaEntrada: event.hora || '',
        horaAlmocoSaida: '',
        horaAlmocoRetorno: '',
        horaSaida: '',
        startMinutes: parsePointTimeToMinutes(event.hora),
        endMinutes: null,
        entryEvent: event,
        exitEvent: null,
        source: event
      };
      return;
    }
    if (!current) return;
    if (event.tipo === 'almoco_inicio') {
      current.horaAlmocoSaida = event.hora || '';
      current.lunchStartEvent = event;
      return;
    }
    if (event.tipo === 'almoco_fim') {
      current.horaAlmocoRetorno = event.hora || '';
      current.lunchReturnEvent = event;
      return;
    }
    if (event.tipo === 'saida') {
      current.horaSaida = event.hora || '';
      current.endMinutes = parsePointTimeToMinutes(event.hora);
      current.exitEvent = event;
      rows.push(current);
      current = null;
    }
  });
  if (current) rows.push(current);
  return rows;
};

const isStoredPeriodCoveredByRow = (period = {}, row = {}) => {
  const start = parsePointTimeToMinutes(period.horaInicio || period.inicio);
  const end = parsePointTimeToMinutes(period.horaFim || period.fim);
  if (start === null || row.startMinutes === null) return false;

  const lunchStart = parsePointTimeToMinutes(row.horaAlmocoSaida);
  const lunchReturn = parsePointTimeToMinutes(row.horaAlmocoRetorno);
  const completedSegments = [
    lunchStart !== null ? [row.startMinutes, lunchStart] : null,
    lunchReturn !== null && row.endMinutes !== null ? [lunchReturn, row.endMinutes] : null,
    lunchStart === null && row.endMinutes !== null ? [row.startMinutes, row.endMinutes] : null
  ].filter(Boolean);

  if (end !== null && completedSegments.some(([segmentStart, segmentEnd]) => (
    start >= segmentStart && end <= segmentEnd
  ))) return true;

  // Registros consolidados representam a jornada inteira, inclusive quando
  // ainda está aberta e portanto não possuem horaFim.
  return start === row.startMinutes
    && (end === null || row.endMinutes === null || end === row.endMinutes)
    && (!period.horaAlmocoSaida || period.horaAlmocoSaida === row.horaAlmocoSaida)
    && (!period.horaAlmocoRetorno || period.horaAlmocoRetorno === row.horaAlmocoRetorno);
};

const buildStoredWorkRows = (record = {}, eventRows = []) => (
  (Array.isArray(record.periodosTrabalho) ? record.periodosTrabalho : [])
    .filter((period) => period && period.ativo !== false)
    .filter((period) => !eventRows.some((row) => isStoredPeriodCoveredByRow(period, row)))
    .map((period, index) => {
      const origin = period.origem || (period.gestorId ? 'gestor' : 'funcionaria');
      return {
        id: `periodo-trabalho-${period.id || index}`,
        rowType: origin === 'gestor' ? 'manual' : 'work',
        typeLabel: getWorkRowLabel(origin, record),
        origin,
        originLabel: origin === 'gestor' ? 'Lançado pelo gestor' : 'Registrado pela funcionária',
        horaEntrada: period.horaInicio || period.inicio || '',
        horaAlmocoSaida: period.horaAlmocoSaida || '',
        horaAlmocoRetorno: period.horaAlmocoRetorno || '',
        horaSaida: period.horaFim || period.fim || '',
        startMinutes: parsePointTimeToMinutes(period.horaInicio || period.inicio),
        endMinutes: parsePointTimeToMinutes(period.horaFim || period.fim),
        entryEvent: period.entryEvent || (period.localizacaoEntrada || period.enderecoEntrada ? {
          localizacao: period.localizacaoEntrada || null,
          endereco: period.enderecoEntrada || ''
        } : null),
        exitEvent: period.exitEvent || (period.localizacaoSaida || period.enderecoSaida ? {
          localizacao: period.localizacaoSaida || null,
          endereco: period.enderecoSaida || ''
        } : null),
        source: period,
        ownJustification: period.justificativa || ''
      };
    })
);

const buildSupplementalRows = (record = {}) => (
  (Array.isArray(record.periodosComplementares) ? record.periodosComplementares : [])
    .filter((period) => period && period.ativo !== false)
    .map((period, index) => {
      const typeLabel = SUPPLEMENTAL_ROW_LABELS[period.tipo]
        || POINT_SUPPLEMENTAL_TYPES[period.tipo]
        || period.tipo
        || 'Período complementar';
      const rawJustification = String(period.justificativa || '').trim();
      return {
        id: `complementar-${period.id || index}`,
        rowType: 'supplemental',
        supplementalType: period.tipo,
        typeLabel,
        origin: 'gestor',
        originLabel: 'Lançado pelo gestor',
        horaEntrada: period.horaInicio || '',
        horaAlmocoSaida: '',
        horaAlmocoRetorno: '',
        horaSaida: period.horaFim || '',
        startMinutes: parsePointTimeToMinutes(period.horaInicio),
        endMinutes: parsePointTimeToMinutes(period.horaFim),
        entryEvent: null,
        exitEvent: null,
        source: period,
        justification: typeLabel,
        justificationDetail: rawJustification && rawJustification.toLocaleLowerCase('pt-BR') !== typeLabel.toLocaleLowerCase('pt-BR')
          ? rawJustification
          : '',
        isAdministrative: true
      };
    })
);

const buildFullDayRow = (record = {}, baseJustification = '-') => {
  const type = resolvePointType(record);
  const typeLabel = FULL_DAY_TYPE_LABELS[type] || baseJustification || 'Registro do dia';
  const origin = isManagerRecord(record) ? 'gestor' : 'sistema';
  return {
    id: `dia-${record.id || record.dia || 'registro'}`,
    rowType: 'day',
    typeLabel,
    origin,
    originLabel: origin === 'gestor' ? 'Lançado pelo gestor' : 'Registro do dia',
    horaEntrada: record.horaEntrada || '',
    horaAlmocoSaida: record.horaAlmocoSaida || '',
    horaAlmocoRetorno: record.horaAlmocoRetorno || '',
    horaSaida: record.horaSaida || '',
    startMinutes: parsePointTimeToMinutes(record.horaEntrada) ?? -1,
    endMinutes: parsePointTimeToMinutes(record.horaSaida),
    entryEvent: null,
    exitEvent: null,
    source: record,
    justification: baseJustification || '-',
    isAdministrative: origin === 'gestor'
  };
};

export const buildPointPresentationRows = (record = {}, { baseJustification = '-' } = {}) => {
  const eventRows = buildEventWorkRows(record);
  const workRows = [...eventRows, ...buildStoredWorkRows(record, eventRows)];
  const supplementalRows = buildSupplementalRows(record);
  const resolvedType = resolvePointType(record);
  const needsFullDayRow = workRows.length === 0
    && (supplementalRows.length === 0 || resolvedType !== 'normal');
  const rows = [
    ...(needsFullDayRow ? [buildFullDayRow(record, baseJustification)] : []),
    ...workRows,
    ...supplementalRows
  ];

  const firstWorkRow = rows.find((row) => row.rowType === 'work' || row.rowType === 'manual');
  if (firstWorkRow) {
    firstWorkRow.justification = firstWorkRow.ownJustification
      || (baseJustification && baseJustification !== '-' ? baseJustification : '-');
  }
  rows.forEach((row) => {
    if (!row.justification) row.justification = row.ownJustification || row.typeLabel || '-';
  });

  return rows
    .sort((left, right) => {
      const leftStart = left.startMinutes ?? 24 * 60;
      const rightStart = right.startMinutes ?? 24 * 60;
      if (leftStart !== rightStart) return leftStart - rightStart;
      return String(left.typeLabel || '').localeCompare(String(right.typeLabel || ''), 'pt-BR');
    })
    .map((row, index, sortedRows) => ({
      ...row,
      dayKey: record.dia || '',
      employeeId: record.funcionarioId || '',
      employeeName: record.funcionarioNome || '',
      showDailyTotals: index === sortedRows.length - 1,
      isGroupEnd: index === sortedRows.length - 1,
      groupSize: sortedRows.length
    }));
};
