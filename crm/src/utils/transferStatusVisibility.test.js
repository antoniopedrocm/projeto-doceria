import { getExplicitTransferStatuses } from './transferStatusVisibility';
const statuses = ['rascunho', 'aguardando_conferencia', 'conferencia_sem_divergencia', 'conferencia_com_divergencia', 'pagamento_informado', 'pagamento_confirmado', 'pagamento_contestado', 'cancelado', 'cancelada'];
test.each(statuses)('allowlist explícita para %s', (status) => {
  expect(getExplicitTransferStatuses({'entre-lojas': {statuses: [status]}}, statuses)).toEqual([status]);
  expect(getExplicitTransferStatuses({'entre-lojas': {statuses: statuses.filter(s => s !== status)}}, statuses)).not.toContain(status);
});
test.each([undefined, {}, {'entre-lojas': {}}, {'entre-lojas': {statuses: []}}, {'entre-lojas': {statuses: 'pagamento_confirmado'}}])('configuração incompleta nega acesso %#', details => {
  expect(getExplicitTransferStatuses(details, statuses)).toEqual([]);
});
test('legado preserva cancelado e cancelada separadamente', () => {
  expect(getExplicitTransferStatuses({entreLojas: {status: ['cancelada']}}, statuses)).toEqual(['cancelada']);
});
test('revogação e transição removem registros e seus totais', () => {
  const rows = [{status: 'aguardando_conferencia', total: 10}, {status: 'pagamento_confirmado', total: 90}];
  const visible = details => rows.filter(r => getExplicitTransferStatuses(details, statuses).includes(r.status));
  const details = {'entre-lojas': {statuses: ['aguardando_conferencia']}};
  expect(visible(details).reduce((sum, r) => sum + r.total, 0)).toBe(10);
  rows[0].status = 'pagamento_confirmado';
  expect(visible(details)).toEqual([]);
  details['entre-lojas'].statuses.push('pagamento_confirmado');
  expect(visible(details)).toHaveLength(2);
  details['entre-lojas'].statuses = [];
  expect(visible(details)).toEqual([]);
});
