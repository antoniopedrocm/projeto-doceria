import {
  applyPointJourneyTimeCorrection,
  buildPointAuditEntry,
  buildPointWorkPeriodsFromEvents,
  calculatePointDayCore,
  canManagePointRecords,
  getFirstPointJourneyTimes,
  getPointRecordLogicalId,
  getPointWorkIntervals,
  pointCurrentTimesMatch,
  resolvePointType,
  validateSupplementalPeriod
} from './pointCalculationCore';

const weekdayDate = new Date(2026, 6, 16);
const saturdayDate = new Date(2026, 6, 18);
const weekdaySchedule = { isWorkday: true, isWeeklyDayOff: false, expectedMinutes: 480, schedule: { tipoEscala: 'seg-sex' } };
const saturdaySegSex = { isWorkday: false, isWeeklyDayOff: true, expectedMinutes: 0, schedule: { tipoEscala: 'seg-sex' } };
const saturdaySegSab = { isWorkday: true, isWeeklyDayOff: false, expectedMinutes: 300, schedule: { tipoEscala: 'seg-sab-folga' } };

const calculate = (record, overrides = {}) => calculatePointDayCore({
  record: { dia: '2026-07-16', ...record },
  date: weekdayDate,
  scheduleDay: weekdaySchedule,
  ...overrides
});

describe('persistência estruturada de ajustes manuais de jornada', () => {
  const correctionMetadata = {
    corrigidoEm: '2026-08-12T21:45:00.000Z',
    gestorId: 'gestor-1',
    gestorNome: 'Gestora Teste',
    motivoCorrecao: 'Saída final informada incorretamente'
  };

  const marianaRecord = {
    funcionarioId: 'mariana',
    dia: '2026-08-12',
    horaEntrada: '09:34',
    horaAlmocoSaida: '14:00',
    horaAlmocoRetorno: '14:01',
    horaSaida: '14:10',
    batidasSincronizadasComAjuste: true,
    batidas: [
      { id: 'e1', tipo: 'entrada', hora: '09:34', origem: 'funcionaria', jornadaId: 'j1' },
      { id: 'a1', tipo: 'almoco_inicio', hora: '14:00', origem: 'funcionaria', jornadaId: 'j1' },
      { id: 'r1', tipo: 'almoco_fim', hora: '14:01', origem: 'funcionaria', jornadaId: 'j1' },
      { id: 's1', tipo: 'saida', hora: '14:10', origem: 'funcionaria', jornadaId: 'j1' }
    ]
  };

  const applyCorrection = (record, changedTimes) => {
    const nextTimes = {
      horaEntrada: record.horaEntrada || '',
      horaAlmocoSaida: record.horaAlmocoSaida || '',
      horaAlmocoRetorno: record.horaAlmocoRetorno || '',
      horaSaida: record.horaSaida || '',
      ...changedTimes
    };
    const batidas = applyPointJourneyTimeCorrection(record, nextTimes, correctionMetadata);
    return {
      ...record,
      ...nextTimes,
      batidas,
      periodosTrabalho: buildPointWorkPeriodsFromEvents(batidas),
      batidasSincronizadasComAjuste: true,
      lancamentoManualGestor: true
    };
  };

  test('Mariana — saída 14:10 corrigida para 18:30 vira o estado atual e recalculável', () => {
    const corrected = applyCorrection(marianaRecord, { horaSaida: '18:30' });

    expect(getFirstPointJourneyTimes(corrected)).toEqual({
      horaEntrada: '09:34',
      horaAlmocoSaida: '14:00',
      horaAlmocoRetorno: '14:01',
      horaSaida: '18:30'
    });
    expect(corrected.batidas.find((event) => event.tipo === 'saida')).toEqual(expect.objectContaining({
      id: 's1',
      hora: '18:30',
      origem: 'gestor',
      corrigido: true,
      motivoCorrecao: correctionMetadata.motivoCorrecao
    }));
    expect(corrected.periodosTrabalho).toEqual([
      expect.objectContaining({ horaInicio: '09:34', horaFim: '14:00', jornadaId: 'j1' }),
      expect.objectContaining({ horaInicio: '14:01', horaFim: '18:30', jornadaId: 'j1' })
    ]);
    expect(calculate(corrected).summary.workedMinutes).toBe(535);
    expect(pointCurrentTimesMatch(corrected, corrected)).toBe(true);
  });

  test.each([
    ['horaEntrada', '09:00', 'entrada'],
    ['horaAlmocoSaida', '13:30', 'almoco_inicio'],
    ['horaAlmocoRetorno', '14:15', 'almoco_fim'],
    ['horaSaida', '18:30', 'saida']
  ])('corrige e sincroniza o campo %s em sua batida correspondente', (field, time, eventType) => {
    const corrected = applyCorrection(marianaRecord, { [field]: time });
    expect(corrected.batidas.find((event) => event.tipo === eventType)?.hora).toBe(time);
    expect(getFirstPointJourneyTimes(corrected)[field]).toBe(time);
    expect(pointCurrentTimesMatch(corrected, corrected)).toBe(true);
  });

  test('correções sucessivas mantêm a última como vigente sem criar outra jornada', () => {
    const firstCorrection = applyCorrection(marianaRecord, { horaSaida: '18:00' });
    const latestCorrection = applyCorrection(firstCorrection, { horaSaida: '18:30' });

    expect(latestCorrection.batidas.filter((event) => event.tipo === 'entrada')).toHaveLength(1);
    expect(latestCorrection.batidas.filter((event) => event.tipo === 'saida')).toHaveLength(1);
    expect(getFirstPointJourneyTimes(latestCorrection).horaSaida).toBe('18:30');
    expect(latestCorrection.batidas.find((event) => event.tipo === 'saida')?.id).toBe('s1');
  });

  test('jornada incompleta continua única ao incluir a entrada esquecida', () => {
    const incomplete = {
      horaEntrada: '',
      horaAlmocoSaida: '12:04',
      horaAlmocoRetorno: '',
      horaSaida: '',
      batidasSincronizadasComAjuste: true,
      batidas: [{ id: 'a1', tipo: 'almoco_inicio', hora: '12:04', origem: 'funcionaria', jornadaId: 'j1' }]
    };
    const corrected = applyCorrection(incomplete, { horaEntrada: '09:30' });

    expect(corrected.batidas).toHaveLength(2);
    expect(getFirstPointJourneyTimes(corrected)).toEqual({
      horaEntrada: '09:30',
      horaAlmocoSaida: '12:04',
      horaAlmocoRetorno: '',
      horaSaida: ''
    });
    expect(corrected.periodosTrabalho).toEqual([
      expect.objectContaining({ horaInicio: '09:30', horaFim: '12:04' })
    ]);
  });

  test('preserva uma segunda jornada real após a saída final da primeira', () => {
    const twoJourneys = {
      ...marianaRecord,
      batidas: [
        ...marianaRecord.batidas,
        { id: 'e2', tipo: 'entrada', hora: '20:00', origem: 'funcionaria', jornadaId: 'j2' },
        { id: 's2', tipo: 'saida', hora: '22:00', origem: 'funcionaria', jornadaId: 'j2' }
      ]
    };
    const corrected = applyCorrection(twoJourneys, { horaSaida: '18:30' });

    expect(corrected.batidas.map(({ id, hora }) => ({ id, hora }))).toEqual([
      { id: 'e1', hora: '09:34' },
      { id: 'a1', hora: '14:00' },
      { id: 'r1', hora: '14:01' },
      { id: 's1', hora: '18:30' },
      { id: 'e2', hora: '20:00' },
      { id: 's2', hora: '22:00' }
    ]);
    expect(buildPointWorkPeriodsFromEvents(corrected.batidas)).toHaveLength(3);
  });

  test('validação pós-gravação rejeita divergência entre topo e estado estruturado', () => {
    const desynchronized = {
      ...marianaRecord,
      horaSaida: '18:30'
    };
    expect(pointCurrentTimesMatch(desynchronized, desynchronized)).toBe(false);
  });
});

describe('recálculo administrativo do Meu Espaço', () => {
  test('Liberação Chefia → Falta aplica somente o débito novo', () => {
    const previous = calculate({ tipoLancamento: 'liberacao_chefia', liberacaoChefia: true });
    const next = calculate({ tipoLancamento: 'falta', faltaSemAbono: true });
    expect(previous.balance.bancoHorasMinutes).toBe(0);
    expect(next.balance.bancoHorasMinutes).toBe(-480);
    expect(next.balance.horaExtraMinutes).toBe(0);
    expect(next.justification).toBe('Falta');
  });

  test('Falta → Abono de falta remove o débito anterior', () => {
    const result = calculate({ tipoLancamento: 'abono_falta', faltaAbonada: true, justificativa: 'Atestado' });
    expect(result.balance.bancoHorasMinutes).toBe(0);
    expect(result.balance.horaExtraMinutes).toBe(0);
    expect(result.justification).toBe('Falta abonada - Atestado');
  });

  test('Abono de falta → Falta volta a debitar a jornada', () => {
    expect(calculate({ tipoLancamento: 'falta' }).balance.bancoHorasMinutes).toBe(-480);
  });

  test('FOLGA COMPENSADA → ponto manual calcula jornada, irregularidade, banco e hora extra', () => {
    const result = calculate({
      tipoLancamento: 'manual_pelo_gestor',
      horaEntrada: '09:00',
      horaAlmocoSaida: '12:00',
      horaAlmocoRetorno: '13:00',
      horaSaida: '18:30'
    });
    expect(result.summary.workedMinutes).toBe(510);
    expect(result.summary.irregularityMinutes).toBe(30);
    expect(result.balance.bancoHorasMinutes).toBe(15);
    expect(result.balance.horaExtraMinutes).toBe(15);
  });

  test('ponto manual → FOLGA COMPENSADA zera todos os efeitos', () => {
    const result = calculate({ tipoLancamento: 'folga_compensada', folgaCompensada: true });
    expect(result.summary.calculable).toBe(false);
    expect(result.balance.bancoHorasMinutes).toBe(0);
    expect(result.balance.horaExtraMinutes).toBe(0);
    expect(result.justification).toBe('FOLGA COMPENSADA');
  });

  test('alteração de horários substitui o cálculo anterior', () => {
    const before = calculate({ tipoLancamento: 'manual_pelo_gestor', horaEntrada: '09:00', horaSaida: '17:00' });
    const after = calculate({ tipoLancamento: 'manual_pelo_gestor', horaEntrada: '09:00', horaSaida: '17:30' });
    expect(before.summary.irregularityMinutes).toBe(0);
    expect(after.summary.irregularityMinutes).toBe(30);
    expect(after.balance.bancoHorasMinutes).toBe(75);
    expect(after.balance.horaExtraMinutes).toBe(15);
  });

  test('ponto da funcionária corrigido pelo gestor usa a mesma regra do ponto normal', () => {
    const times = { horaEntrada: '08:00', horaAlmocoSaida: '12:00', horaAlmocoRetorno: '13:00', horaSaida: '17:10' };
    const employeePoint = calculate(times);
    const managerPoint = calculate({ ...times, tipoLancamento: 'manual_pelo_gestor', lancamentoManualGestor: true });
    expect(managerPoint.summary).toEqual(employeePoint.summary);
    expect(managerPoint.balance).toEqual(employeePoint.balance);
  });

  test('sábado de escala segunda a sexta separa 05:00 de banco e excedente de hora extra', () => {
    const result = calculatePointDayCore({
      record: { dia: '2026-07-18', horaEntrada: '08:00', horaSaida: '13:30' },
      date: saturdayDate,
      scheduleDay: saturdaySegSex
    });
    expect(result.balance.bancoHorasMinutes).toBe(300);
    expect(result.balance.horaExtraMinutes).toBe(30);
  });

  test('falta no sábado obrigatório usa a carga configurada do sábado', () => {
    const result = calculatePointDayCore({
      record: { dia: '2026-07-18', tipoLancamento: 'falta' },
      date: saturdayDate,
      scheduleDay: saturdaySegSab
    });
    expect(result.balance.bancoHorasMinutes).toBe(-300);
  });

  test('sábado obrigatório trabalhado acima da jornada manda somente o excedente para hora extra', () => {
    const result = calculatePointDayCore({
      record: { dia: '2026-07-18', horaEntrada: '08:00', horaSaida: '13:30' },
      date: saturdayDate,
      scheduleDay: saturdaySegSab
    });
    expect(result.balance.bancoHorasMinutes).toBe(0);
    expect(result.balance.horaExtraMinutes).toBe(30);
  });

  test.each([
    ['abono_falta', 'Falta abonada'],
    ['liberacao_chefia', 'Liberação Chefia'],
    ['folga_compensada', 'FOLGA COMPENSADA'],
    ['ferias', 'Férias'],
    ['folga', 'Folga'],
    ['feriado', 'Feriado']
  ])('%s não gera irregularidade, banco ou hora extra', (tipoLancamento) => {
    const result = calculate({ tipoLancamento });
    expect(result.summary.calculable).toBe(false);
    expect(result.balance.bancoHorasMinutes).toBe(0);
    expect(result.balance.horaExtraMinutes).toBe(0);
  });

  test('totais do resumo somam o estado atual, sem carregar efeitos substituídos', () => {
    const currentDays = [
      calculate({ tipoLancamento: 'falta' }),
      calculate({ tipoLancamento: 'abono_falta', justificativa: 'Atestado' }),
      calculate({ tipoLancamento: 'manual_pelo_gestor', horaEntrada: '08:00', horaAlmocoSaida: '12:00', horaAlmocoRetorno: '13:00', horaSaida: '17:30' })
    ];
    const bankMovement = currentDays.reduce((total, day) => total + day.balance.bancoHorasMinutes, 0);
    const overtime = currentDays.reduce((total, day) => total + day.balance.horaExtraMinutes, 0);
    expect(bankMovement).toBe(-465);
    expect(overtime).toBe(15);
  });
});

describe('unicidade, auditoria e permissão', () => {
  test('a chave lógica é estável por colaboradora e data', () => {
    expect(getPointRecordLogicalId('celeste', '2026-07-16')).toBe('celeste_2026-07-16');
    expect(getPointRecordLogicalId('celeste', '2026-07-16')).toBe(getPointRecordLogicalId('celeste', '2026-07-16'));
  });

  test('Dono e Gestor podem editar; funcionária comum não pode', () => {
    expect(canManagePointRecords('dono')).toBe(true);
    expect(canManagePointRecords('administrador')).toBe(true);
    expect(canManagePointRecords('gerente')).toBe(true);
    expect(canManagePointRecords('atendente')).toBe(false);
    expect(canManagePointRecords('cliente')).toBe(false);
  });

  test('auditoria preserva tipos, horários, justificativas e valores anteriores e novos', () => {
    const previousValues = { tipoLancamentoLabel: 'Liberação Chefia', horarios: {}, justificativa: 'Liberação Chefia', bancoHoras: '-', bancoHorasMinutes: 0, horaExtra: '-', horaExtraMinutes: 0 };
    const nextValues = { tipoLancamentoLabel: 'Falta', horarios: {}, justificativa: 'Falta', bancoHoras: '-08:00', bancoHorasMinutes: -480, horaExtra: '-', horaExtraMinutes: 0 };
    const audit = buildPointAuditEntry({
      now: new Date('2026-07-17T12:00:00.000Z'),
      employeeId: 'celeste',
      employeeName: 'Celeste',
      dayKey: '2026-07-16',
      previousValues,
      nextValues,
      correctionReason: 'Lançamento realizado incorretamente',
      managerId: 'dono-1',
      managerName: 'Gestor'
    });
    expect(audit.tipoAnterior).toBe('Liberação Chefia');
    expect(audit.novoTipo).toBe('Falta');
    expect(audit.bancoHorasAnteriorMinutes).toBe(0);
    expect(audit.novoBancoHorasMinutes).toBe(-480);
    expect(audit.motivoCorrecao).toBe('Lançamento realizado incorretamente');
  });

  test('tipos antigos são reconhecidos para preencher o modal corretamente', () => {
    expect(resolvePointType({ faltaAbonada: true })).toBe('abono_falta');
    expect(resolvePointType({ folgaCompensada: true })).toBe('folga_compensada');
    expect(resolvePointType({ justificativa: 'Férias' })).toBe('ferias');
    expect(resolvePointType({ tipoLancamento: 'Liberação Chefia' })).toBe('liberacao_chefia');
    expect(resolvePointType({ tipoLancamento: 'FOLGA COMPENSADA' })).toBe('folga_compensada');
  });
});

describe('períodos complementares e múltiplas jornadas', () => {
  test('caso 1 — abono parcial neutraliza apenas o déficit', () => {
    const result = calculate({
      periodosTrabalho: [{ id: 'real-1', horaInicio: '08:00', horaFim: '14:00', ativo: true }],
      periodosComplementares: [{
        id: 'abono-1',
        tipo: 'abono_periodo',
        horaInicio: '14:00',
        horaFim: '16:00',
        justificativa: 'Consulta autorizada',
        ativo: true
      }]
    });
    expect(result.summary.realWorkedMinutes).toBe(360);
    expect(result.summary.justifiedAppliedMinutes).toBe(120);
    expect(result.summary.consideredMinutes).toBe(480);
    expect(result.summary.irregularityMinutes).toBe(0);
    expect(result.balance.bancoHorasMinutes).toBe(0);
    expect(result.balance.horaExtraMinutes).toBe(0);
  });

  test('caso 2 — abono maior que o déficit não gera crédito', () => {
    const result = calculate({
      periodosTrabalho: [{ id: 'real-1', horaInicio: '08:00', horaFim: '15:00', ativo: true }],
      periodosComplementares: [{
        id: 'abono-1',
        tipo: 'abono_periodo',
        horaInicio: '15:00',
        horaFim: '17:00',
        justificativa: 'Liberação autorizada',
        ativo: true
      }]
    });
    expect(result.summary.justifiedRegisteredMinutes).toBe(120);
    expect(result.summary.justifiedAppliedMinutes).toBe(60);
    expect(result.summary.irregularityMinutes).toBe(0);
    expect(result.balance.bancoHorasMinutes).toBe(0);
    expect(result.balance.horaExtraMinutes).toBe(0);
  });

  test('caso 3 — trabalho externo soma somente o intervalo exato', () => {
    const result = calculate({
      periodosTrabalho: [
        { id: 'real-1', horaInicio: '08:00', horaFim: '12:00', ativo: true },
        { id: 'real-2', horaInicio: '13:00', horaFim: '17:00', ativo: true }
      ],
      periodosComplementares: [{
        id: 'externo-1',
        tipo: 'trabalho_externo',
        horaInicio: '18:00',
        horaFim: '19:00',
        justificativa: 'Visita a fornecedor',
        ativo: true
      }]
    });
    expect(result.summary.realWorkedMinutes).toBe(480);
    expect(result.summary.externalWorkedMinutes).toBe(60);
    expect(result.summary.workedMinutes).toBe(540);
    expect(result.balance.bancoHorasMinutes).toBe(15);
    expect(result.balance.horaExtraMinutes).toBe(45);
    expect(result.status.statusPonto).toBe('Completo');
  });

  test('caso 4 — novo período da funcionária é pareado sem contabilizar o intervalo', () => {
    const record = {
      batidas: [
        { id: 'e1', tipo: 'entrada', hora: '09:30', origem: 'funcionaria' },
        { id: 's1', tipo: 'saida', hora: '17:30', origem: 'funcionaria' },
        { id: 'e2', tipo: 'entrada', hora: '19:00', origem: 'funcionaria' },
        { id: 's2', tipo: 'saida', hora: '21:00', origem: 'funcionaria' }
      ]
    };
    expect(getPointWorkIntervals(record)).toEqual([
      expect.objectContaining({ start: 570, end: 1050 }),
      expect.objectContaining({ start: 1140, end: 1260 })
    ]);
    expect(calculate(record).summary.workedMinutes).toBe(600);
  });

  test('caso 5 — saída particular subtrai uma vez e desativa crédito de almoço ausente', () => {
    const result = calculate({
      horaEntrada: '09:30',
      horaSaida: '18:30',
      periodosComplementares: [{
        id: 'particular-1',
        tipo: 'saida_particular',
        horaInicio: '10:00',
        horaFim: '12:00',
        justificativa: 'Assunto pessoal',
        ativo: true
      }]
    });
    expect(result.summary.privateDeductedMinutes).toBe(120);
    expect(result.summary.workedMinutes).toBe(420);
    expect(result.summary.irregularityMinutes).toBe(-60);
    expect(result.balance.bancoHorasMinutes).toBe(-60);
    expect(result.balance.almocoNaoRegistradoBancoHoras).toBe(0);
  });

  test('caso 6 — trabalho externo sobre batida é rejeitado antes de salvar', () => {
    const record = {
      periodosTrabalho: [{ id: 'real-1', horaInicio: '08:00', horaFim: '17:00', ativo: true }]
    };
    const validation = validateSupplementalPeriod({
      record,
      existingPeriods: [],
      period: {
        tipo: 'trabalho_externo',
        horaInicio: '16:00',
        horaFim: '18:00',
        justificativa: 'Atividade externa'
      }
    });
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/coincidir com uma batida/i);
  });

  test('caso 7 — trocar liberação por saída particular remove o efeito anterior', () => {
    const baseRecord = {
      periodosTrabalho: [{ id: 'real-1', horaInicio: '08:00', horaFim: '14:00', ativo: true }]
    };
    const before = calculate({
      ...baseRecord,
      periodosComplementares: [{
        id: 'ajuste-1',
        tipo: 'liberacao_chefia_periodo',
        horaInicio: '14:00',
        horaFim: '16:00',
        justificativa: 'Liberação',
        ativo: true
      }]
    });
    const after = calculate({
      ...baseRecord,
      periodosComplementares: [{
        id: 'ajuste-1',
        tipo: 'saida_particular',
        horaInicio: '10:00',
        horaFim: '12:00',
        justificativa: 'Correção administrativa',
        ativo: true
      }]
    });
    expect(before.summary.irregularityMinutes).toBe(0);
    expect(before.balance.bancoHorasMinutes).toBe(0);
    expect(after.summary.irregularityMinutes).toBe(-240);
    expect(after.balance.bancoHorasMinutes).toBe(-240);
  });

});
