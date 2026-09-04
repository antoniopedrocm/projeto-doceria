import { buildPointPresentationRows } from './pointPresentation';

const workEvents = (periods) => periods.flatMap(([start, end], index) => [
  { id: `e${index}`, tipo: 'entrada', hora: start, origem: 'funcionaria' },
  { id: `s${index}`, tipo: 'saida', hora: end, origem: 'funcionaria' }
]);

const baseRecord = {
  id: 'celeste_2026-07-26',
  funcionarioId: 'celeste',
  funcionarioNome: 'Celeste Souza da Silva',
  dia: '2026-07-26',
  tipoLancamento: 'normal'
};

describe('linhas de apresentação do Meu Espaço', () => {
  test('1 — um único período continua em uma única linha', () => {
    const rows = buildPointPresentationRows({
      ...baseRecord,
      horaEntrada: '10:00',
      horaSaida: '11:00'
    }, { baseJustification: 'teste' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      horaEntrada: '10:00',
      horaSaida: '11:00',
      justification: 'teste',
      showDailyTotals: true
    });
  });

  test('2 — dois períodos trabalhados viram duas linhas ordenadas', () => {
    const rows = buildPointPresentationRows({
      ...baseRecord,
      batidas: workEvents([['08:00', '10:00'], ['10:30', '14:00']])
    }, { baseJustification: 'Atividade interna' });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.horaEntrada, row.horaSaida])).toEqual([
      ['08:00', '10:00'],
      ['10:30', '14:00']
    ]);
    expect(rows.map((row) => row.showDailyTotals)).toEqual([false, true]);
  });

  test('lançamento manual é identificado como período do gestor', () => {
    const rows = buildPointPresentationRows({
      ...baseRecord,
      tipoLancamento: 'manual_pelo_gestor',
      lancamentoManualGestor: true,
      horaEntrada: '08:00',
      horaSaida: '10:00'
    }, { baseJustification: 'Correção autorizada' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rowType: 'manual',
      typeLabel: 'Lançamento manual',
      originLabel: 'Lançado pelo gestor'
    });
  });

  test('3 — trabalho e Liberação Chefia ficam separados sem duplicar a justificativa principal', () => {
    const rows = buildPointPresentationRows({
      ...baseRecord,
      batidas: workEvents([['10:00', '11:00']]),
      periodosComplementares: [{
        id: 'liberacao',
        tipo: 'liberacao_chefia_periodo',
        horaInicio: '09:30',
        horaFim: '10:00',
        justificativa: 'Consulta autorizada',
        gestorNome: 'Gestora',
        ativo: true
      }]
    }, { baseJustification: 'teste' });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      typeLabel: 'Liberação Chefia',
      justification: 'Liberação Chefia',
      justificationDetail: 'Consulta autorizada',
      origin: 'gestor'
    });
    expect(rows[1].justification).toBe('teste');
    expect(rows[1].justification).not.toMatch(/Liberação Chefia/i);
  });

  test('4 — trabalho externo aparece em linha administrativa própria', () => {
    const rows = buildPointPresentationRows({
      ...baseRecord,
      batidas: workEvents([['08:00', '17:00']]),
      periodosComplementares: [{
        id: 'externo',
        tipo: 'trabalho_externo',
        horaInicio: '18:00',
        horaFim: '19:00',
        justificativa: 'Visita externa',
        ativo: true
      }]
    }, { baseJustification: '-' });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      typeLabel: 'Trabalho externo',
      horaEntrada: '18:00',
      horaSaida: '19:00',
      showDailyTotals: true
    });
  });

  test('5 — saída particular aparece em linha não trabalhada própria', () => {
    const rows = buildPointPresentationRows({
      ...baseRecord,
      batidas: workEvents([['09:30', '18:30']]),
      periodosComplementares: [{
        id: 'particular',
        tipo: 'saida_particular',
        horaInicio: '10:00',
        horaFim: '12:00',
        justificativa: 'Assunto pessoal',
        ativo: true
      }]
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      supplementalType: 'saida_particular',
      typeLabel: 'Saída particular',
      originLabel: 'Lançado pelo gestor'
    });
  });

  test('6 — três períodos permanecem no mesmo grupo e só a última linha recebe totais', () => {
    const rows = buildPointPresentationRows({
      ...baseRecord,
      batidas: workEvents([['08:00', '10:00'], ['13:00', '15:00']]),
      periodosComplementares: [{
        id: 'abono',
        tipo: 'abono_periodo',
        horaInicio: '15:00',
        horaFim: '16:00',
        justificativa: 'Atestado',
        ativo: true
      }]
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.dayKey === '2026-07-26')).toBe(true);
    expect(rows.filter((row) => row.showDailyTotals)).toHaveLength(1);
    expect(rows[2].showDailyTotals).toBe(true);
  });

  test('7 — almoço permanece na mesma linha do período correspondente', () => {
    const rows = buildPointPresentationRows({
      ...baseRecord,
      batidas: [
        ...workEvents([['08:00', '10:00']]),
        { id: 'e2', tipo: 'entrada', hora: '10:30', origem: 'funcionaria' },
        { id: 'a2', tipo: 'almoco_inicio', hora: '11:00', origem: 'funcionaria' },
        { id: 'r2', tipo: 'almoco_fim', hora: '12:00', origem: 'funcionaria' },
        { id: 's2', tipo: 'saida', hora: '14:00', origem: 'funcionaria' }
      ]
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      horaEntrada: '10:30',
      horaAlmocoSaida: '11:00',
      horaAlmocoRetorno: '12:00',
      horaSaida: '14:00'
    });
  });

  test('8 — edição usa os horários estruturados atuais sem recriar o período', () => {
    const rows = buildPointPresentationRows({
      ...baseRecord,
      batidas: workEvents([['10:00', '11:00']]),
      periodosComplementares: [{
        id: 'liberacao-existente',
        tipo: 'liberacao_chefia_periodo',
        horaInicio: '09:45',
        horaFim: '10:00',
        justificativa: 'Horário corrigido',
        ativo: true
      }]
    });
    expect(rows[0].id).toBe('complementar-liberacao-existente');
    expect(rows[0].horaEntrada).toBe('09:45');
  });

  test('9 — período excluído logicamente não gera linha de apresentação', () => {
    const rows = buildPointPresentationRows({
      ...baseRecord,
      batidas: workEvents([['10:00', '11:00']]),
      periodosComplementares: [{
        id: 'removido',
        tipo: 'abono_periodo',
        horaInicio: '09:00',
        horaFim: '10:00',
        justificativa: 'Removido',
        ativo: false
      }]
    });
    expect(rows).toHaveLength(1);
    expect(rows.some((row) => row.id.includes('removido'))).toBe(false);
  });

  test('10 — as linhas usadas pelo PDF contêm um período por linha e totais somente na última', () => {
    const rows = buildPointPresentationRows({
      ...baseRecord,
      batidas: workEvents([['08:00', '10:00'], ['13:00', '15:00']]),
      periodosComplementares: [{
        id: 'externo-pdf',
        tipo: 'trabalho_externo',
        horaInicio: '18:00',
        horaFim: '19:00',
        justificativa: 'Entrega',
        ativo: true
      }]
    });
    expect(rows.map((row) => row.horaEntrada)).toEqual(['08:00', '13:00', '18:00']);
    expect(rows.map((row) => row.showDailyTotals)).toEqual([false, false, true]);
  });

  test('11 — consulta mensal mantém as linhas vinculadas às respectivas datas', () => {
    const records = [
      { ...baseRecord, dia: '2026-07-25', batidas: workEvents([['08:00', '10:00']]) },
      { ...baseRecord, id: 'celeste_2026-07-26', dia: '2026-07-26', batidas: workEvents([['09:00', '11:00'], ['13:00', '14:00']]) }
    ];
    const rows = records.flatMap((record) => buildPointPresentationRows(record));
    expect(rows.filter((row) => row.dayKey === '2026-07-25')).toHaveLength(1);
    expect(rows.filter((row) => row.dayKey === '2026-07-26')).toHaveLength(2);
  });

  test('12 — resumo mensal possui exatamente uma linha consolidada por funcionária e data', () => {
    const records = [
      { ...baseRecord, dia: '2026-07-25', batidas: workEvents([['08:00', '10:00'], ['11:00', '12:00']]) },
      {
        ...baseRecord,
        id: 'celeste_2026-07-26',
        dia: '2026-07-26',
        batidas: workEvents([['09:00', '11:00']]),
        periodosComplementares: [{
          id: 'abono-resumo',
          tipo: 'abono_periodo',
          horaInicio: '11:00',
          horaFim: '12:00',
          justificativa: 'Abono',
          ativo: true
        }]
      }
    ];
    const rows = records.flatMap((record) => buildPointPresentationRows(record));
    expect(rows.filter((row) => row.showDailyTotals)).toHaveLength(records.length);
  });

  test('13 — saída para almoço mantém uma única linha enquanto a jornada está aberta', () => {
    const rows = buildPointPresentationRows({
      ...baseRecord,
      batidas: [
        { id: 'entrada', tipo: 'entrada', hora: '09:30', origem: 'funcionaria' },
        { id: 'almoco', tipo: 'almoco_inicio', hora: '12:04', origem: 'funcionaria' }
      ],
      periodosTrabalho: [{
        id: 'segmento-antes-almoco',
        horaInicio: '09:30',
        horaFim: '12:04',
        origem: 'funcionaria',
        ativo: true
      }]
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      horaEntrada: '09:30',
      horaAlmocoSaida: '12:04',
      horaAlmocoRetorno: '',
      horaSaida: ''
    });
  });

  test('14 — horário corrigido pelo gestor prevalece sobre batidas antigas', () => {
    const rows = buildPointPresentationRows({
      ...baseRecord,
      tipoLancamento: 'manual_pelo_gestor',
      lancamentoManualGestor: true,
      manualPeloGestor: true,
      horaEntrada: '09:30',
      horaAlmocoSaida: '12:04',
      batidas: [{ id: 'antiga', tipo: 'almoco_inicio', hora: '12:04', origem: 'funcionaria' }]
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rowType: 'manual',
      horaEntrada: '09:30',
      horaAlmocoSaida: '12:04'
    });
  });

  test('15 — entrada repetida sem saída final não abre segunda jornada', () => {
    const rows = buildPointPresentationRows({
      ...baseRecord,
      batidas: [
        { id: 'e1', tipo: 'entrada', hora: '08:00' },
        { id: 'e2', tipo: 'entrada', hora: '09:00' },
        { id: 'a1', tipo: 'almoco_inicio', hora: '12:00' }
      ]
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ horaEntrada: '08:00', horaAlmocoSaida: '12:00' });
  });

  test('16 — saída final seguida de nova entrada abre uma segunda jornada', () => {
    const rows = buildPointPresentationRows({
      ...baseRecord,
      batidas: [
        { id: 'e1', tipo: 'entrada', hora: '08:00' },
        { id: 's1', tipo: 'saida', hora: '12:00' },
        { id: 'e2', tipo: 'entrada', hora: '15:00' },
        { id: 's2', tipo: 'saida', hora: '18:00' }
      ]
    });
    expect(rows.map((row) => [row.horaEntrada, row.horaSaida])).toEqual([
      ['08:00', '12:00'],
      ['15:00', '18:00']
    ]);
  });
});
