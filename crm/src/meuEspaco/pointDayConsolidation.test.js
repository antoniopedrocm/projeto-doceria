import { calculatePointDayCore } from './pointCalculationCore';
import { consolidatePointDayRecords, groupPointRecordsByDay } from './pointDayConsolidation';
import { buildPointPresentationRows } from './pointPresentation';

const date = new Date(2026, 6, 16);
const scheduleDay = {
  isWorkday: true,
  isWeeklyDayOff: false,
  expectedMinutes: 480,
  schedule: { tipoEscala: 'seg-sex' }
};

const base = {
  empresaId: 'loja-1',
  funcionarioId: 'funcionaria-1',
  funcionarioNome: 'Funcionária',
  dia: '2026-07-16',
  competencia: '2026-07',
  tipoLancamento: 'normal',
  ativo: true
};

const workRecord = (id, horaEntrada, horaSaida, extra = {}) => ({
  ...base,
  id,
  horaEntrada,
  horaSaida,
  ...extra
});
const supplementalRecord = (id, period) => ({
  ...base,
  id,
  periodosComplementares: [{ id: `${id}-periodo`, ativo: true, justificativa: 'Teste', ...period }]
});

const calculateGroup = (records) => {
  const record = consolidatePointDayRecords(records, { storeId: 'loja-1' });
  return {
    record,
    result: calculatePointDayCore({ record, date, scheduleDay })
  };
};

describe('consolidação diária de múltiplos documentos do Meu Espaço', () => {
  test('1 — dois períodos trabalhados entram na Qtde consolidada', () => {
    const { result } = calculateGroup([
      workRecord('ponto-1', '08:00', '10:00'),
      workRecord('ponto-2', '11:00', '14:00')
    ]);
    expect(result.summary.workedMinutes).toBe(300);
    expect(result.summary.workedLabel).toBe('05:00');
    expect(result.summary.irregularityMinutes).toBe(-180);
  });

  test('2 — trabalho mais Liberação Chefia cumpre a jornada sem aumentar Qtde', () => {
    const { result } = calculateGroup([
      workRecord('ponto-1', '08:00', '14:00'),
      supplementalRecord('ponto-2', {
        tipo: 'liberacao_chefia_periodo',
        horaInicio: '14:00',
        horaFim: '16:00'
      })
    ]);
    expect(result.summary.workedMinutes).toBe(360);
    expect(result.summary.justifiedAppliedMinutes).toBe(120);
    expect(result.summary.irregularityMinutes).toBe(0);
    expect(result.balance.bancoHorasMinutes).toBe(0);
    expect(result.balance.horaExtraMinutes).toBe(0);
  });

  test('3 — liberação maior que o déficit aplica somente o necessário', () => {
    const { result } = calculateGroup([
      workRecord('ponto-1', '08:00', '15:30'),
      supplementalRecord('ponto-2', {
        tipo: 'liberacao_chefia_periodo',
        horaInicio: '15:30',
        horaFim: '17:30'
      })
    ]);
    expect(result.summary.workedMinutes).toBe(450);
    expect(result.summary.justifiedRegisteredMinutes).toBe(120);
    expect(result.summary.justifiedAppliedMinutes).toBe(30);
    expect(result.summary.irregularityMinutes).toBe(0);
    expect(result.balance.bancoHorasMinutes).toBe(0);
    expect(result.balance.horaExtraMinutes).toBe(0);
  });

  test('4 — trabalho externo de outro documento soma como trabalho efetivo', () => {
    const { result } = calculateGroup([
      workRecord('ponto-1', '08:00', '15:00'),
      supplementalRecord('ponto-2', {
        tipo: 'trabalho_externo',
        horaInicio: '16:00',
        horaFim: '17:00'
      })
    ]);
    expect(result.summary.realWorkedMinutes).toBe(420);
    expect(result.summary.externalWorkedMinutes).toBe(60);
    expect(result.summary.workedMinutes).toBe(480);
    expect(result.summary.irregularityMinutes).toBe(0);
  });

  test('5 — saída particular desconta uma única vez do trabalho consolidado', () => {
    const { result } = calculateGroup([
      workRecord('ponto-1', '09:30', '18:30'),
      supplementalRecord('ponto-2', {
        tipo: 'saida_particular',
        horaInicio: '10:00',
        horaFim: '12:00'
      })
    ]);
    expect(result.summary.privateDeductedMinutes).toBe(120);
    expect(result.summary.workedMinutes).toBe(420);
    expect(result.summary.irregularityMinutes).toBe(-60);
    expect(result.balance.bancoHorasMinutes).toBe(-60);
  });

  test('6 — três documentos geram um único dia e totais somente na última linha', () => {
    const grouped = groupPointRecordsByDay([
      workRecord('ponto-1', '10:00', '11:00'),
      supplementalRecord('ponto-2', {
        tipo: 'liberacao_chefia_periodo',
        horaInicio: '09:30',
        horaFim: '10:00'
      }),
      supplementalRecord('ponto-3', {
        tipo: 'trabalho_externo',
        horaInicio: '16:00',
        horaFim: '17:00'
      })
    ], { storeId: 'loja-1' });
    expect(grouped).toHaveLength(1);
    expect(grouped[0].consolidatedRecordCount).toBe(3);
    const rows = buildPointPresentationRows(grouped[0]);
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.showDailyTotals)).toHaveLength(1);
    expect(rows[2].showDailyTotals).toBe(true);
  });

  test('7 — editar Liberação Chefia para Trabalho externo refaz todo o resultado', () => {
    const work = workRecord('ponto-1', '08:00', '15:30');
    const release = supplementalRecord('ponto-2', {
      tipo: 'liberacao_chefia_periodo',
      horaInicio: '15:30',
      horaFim: '17:30'
    });
    const before = calculateGroup([work, release]).result;
    const external = {
      ...release,
      periodosComplementares: release.periodosComplementares.map((period) => ({
        ...period,
        tipo: 'trabalho_externo'
      }))
    };
    const after = calculateGroup([work, external]).result;
    expect(before.summary.workedMinutes).toBe(450);
    expect(before.summary.justifiedAppliedMinutes).toBe(30);
    expect(before.summary.irregularityMinutes).toBe(0);
    expect(after.summary.workedMinutes).toBe(570);
    expect(after.summary.justifiedAppliedMinutes).toBe(0);
    expect(after.summary.irregularityMinutes).toBe(90);
    expect(after.balance.bancoHorasMinutes).toBe(15);
    expect(after.balance.horaExtraMinutes).toBe(75);
  });

  test('intervalo de almoço do segundo período não entra na Qtde', () => {
    const { result } = calculateGroup([
      workRecord('ponto-1', '08:00', '10:00'),
      workRecord('ponto-2', '10:30', '14:00', {
        horaAlmocoSaida: '11:00',
        horaAlmocoRetorno: '12:00'
      })
    ]);
    expect(result.summary.workedMinutes).toBe(270);
    expect(result.summary.workedLabel).toBe('04:30');
  });

  test('período manual do gestor usa a mesma rotina do período da funcionária', () => {
    const { result } = calculateGroup([
      workRecord('ponto-1', '08:00', '10:00'),
      workRecord('ponto-2', '14:00', '17:00', {
        tipoLancamento: 'manual_pelo_gestor',
        lancamentoManualGestor: true,
        manualPeloGestor: true
      })
    ]);
    expect(result.summary.workedMinutes).toBe(300);
    expect(result.summary.workedLabel).toBe('05:00');
  });
});
