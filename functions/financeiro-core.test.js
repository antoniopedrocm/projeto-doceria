const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildTargetExpense,
  expenseLogicalKey,
  recurrenceTargetId,
  rollFinancialDueDate,
  shiftFinancialMonth
} = require('./financeiro-core');

test('copia somente dados aplicáveis e remove estado de pagamento e conciliação', () => {
  const source = {
    lojaId: 'loja-a', descricao: 'Aluguel', categoria: 'Aluguel', fornecedorId: 'forn-1',
    fornecedorNome: 'Imobiliária', observacao: 'Contrato vigente', valor: 1000,
    dataVencimento: '2026-08-31', competencia: '2026-08', status: 'Pago', tipoRecorrencia: 'fixa',
    dataPagamento: '2026-08-05', pagoEm: 'timestamp', comprovanteUrl: 'arquivo.pdf',
    conciliacao: { id: 'conc-1' }, conciliadoEm: 'timestamp'
  };
  const target = buildTargetExpense(source, {
    expenseId: 'aluguel', storeId: 'loja-a', sourceMonth: '2026-08', targetMonth: '2026-09',
    valueCents: 105050, dueDate: '2026-09-30', serverTimestamp: 'SERVER_TIMESTAMP', requesterUid: 'gestor-1'
  });
  assert.equal(target.valor, 1050.5);
  assert.equal(target.dataVencimento, '2026-09-30');
  assert.equal(target.status, 'Pendente');
  assert.equal(target.lojaId, 'loja-a');
  assert.equal(target.fornecedorId, 'forn-1');
  assert.equal(target.observacao, 'Contrato vigente');
  assert.equal(target.dataPagamento, undefined);
  assert.equal(target.pagoEm, undefined);
  assert.equal(target.comprovanteUrl, undefined);
  assert.equal(target.conciliacao, undefined);
  assert.equal(target.conciliadoEm, undefined);
});

test('despesa variável nasce pendente, zerada e aguardando fatura', () => {
  const target = buildTargetExpense({ lojaId: 'loja-a', valor: 300, dataVencimento: '2026-08-15', tipoRecorrencia: 'variavel' }, {
    expenseId: 'energia', storeId: 'loja-a', sourceMonth: '2026-08', targetMonth: '2026-09',
    valueCents: 0, dueDate: '2026-09-15', serverTimestamp: 'SERVER_TIMESTAMP', requesterUid: 'gestor-1'
  });
  assert.equal(target.valor, 0);
  assert.equal(target.status, 'Pendente');
  assert.equal(target.aguardandoFatura, true);
});

test('gera alvo idempotente e adapta competências e datas', () => {
  const source = { serieRecorrenciaId: 'serie-aluguel' };
  assert.equal(recurrenceTargetId(source, 'origem', '2026-09'), 'serie-aluguel__2026-09');
  assert.equal(shiftFinancialMonth('2026-12', 1), '2027-01');
  assert.equal(rollFinancialDueDate('2026-01-31', '2026-02'), '2026-02-28');
  const sourceExpense = { lojaId: 'loja-a', descricao: 'Aluguel', categoria: 'Aluguel', dataVencimento: '2026-08-31', tipoRecorrencia: 'fixa' };
  const legacyTarget = { ...sourceExpense, dataVencimento: '2026-09-30', competencia: '2026-09' };
  assert.equal(
    expenseLogicalKey(sourceExpense, 'loja-a', '2026-09'),
    expenseLogicalKey(legacyTarget, 'loja-a', '2026-09', legacyTarget.dataVencimento)
  );
});
