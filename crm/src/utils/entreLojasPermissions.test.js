import {
  ENTRE_LOJAS_RELATION,
  canViewEntreLojasClosing,
  canViewEntreLojasTransfer,
  deduplicateEntreLojasTransfers,
  filterEntreLojasTransfers,
  getClosingActionPermissions,
  getEntreLojasStoreRelation,
  getEntreLojasVisibleTransferStatuses,
  getTransferActionPermissions,
  summarizeEntreLojasTransfers
} from './entreLojasPermissions';

const transfer = {
  lojaOrigemId: 'matriz',
  lojaDestinoId: 'garavelo',
  status: 'aguardando_conferencia'
};

const closing = {
  lojaOrigemId: 'matriz',
  lojaDestinoId: 'garavelo',
  status: 'aberto'
};

const manager = (...lojaIds) => ({ role: 'gerente', lojaIds });
const allStatuses = [
  'rascunho',
  'aguardando_conferencia',
  'conferencia_sem_divergencia',
  'conferencia_com_divergencia',
  'pagamento_informado',
  'pagamento_confirmado',
  'pagamento_contestado',
  'cancelado',
  'cancelada'
];

describe('visibilidade de remessas em Entre Lojas', () => {
  test('dono, origem e destino visualizam aguardando conferencia; terceira loja nao', () => {
    expect(canViewEntreLojasTransfer({ user: { role: 'dono' }, transfer, allowedStatuses: [] })).toBe(true);
    expect(canViewEntreLojasTransfer({ user: manager('matriz'), transfer, allowedStatuses: allStatuses })).toBe(true);
    expect(canViewEntreLojasTransfer({ user: manager('garavelo'), transfer, allowedStatuses: allStatuses })).toBe(true);
    expect(canViewEntreLojasTransfer({ user: manager('outra-loja'), transfer, allowedStatuses: allStatuses })).toBe(false);
  });

  test('rascunho fica visivel somente pela relacao de origem', () => {
    const draft = { ...transfer, status: 'rascunho' };
    expect(canViewEntreLojasTransfer({ user: manager('matriz'), transfer: draft, allowedStatuses: allStatuses })).toBe(true);
    expect(canViewEntreLojasTransfer({ user: manager('garavelo'), transfer: draft, allowedStatuses: allStatuses })).toBe(false);
    expect(canViewEntreLojasTransfer({ user: manager('garavelo', 'matriz'), transfer: draft, allowedStatuses: allStatuses })).toBe(true);
  });

  test('status personalizado continua limitando a visibilidade', () => {
    expect(canViewEntreLojasTransfer({
      user: manager('garavelo'),
      transfer,
      allowedStatuses: ['pagamento_informado']
    })).toBe(false);
  });

  test('pagamento confirmado permanece visivel para gerentes relacionados com perfil personalizado antigo', () => {
    const confirmedTransfer = { ...transfer, status: 'pagamento_confirmado' };
    const legacyStatuses = ['aguardando_conferencia', 'pagamento_informado'];

    expect(getEntreLojasVisibleTransferStatuses({
      user: manager('matriz'),
      allowedStatuses: legacyStatuses
    })).toContain('pagamento_confirmado');
    expect(canViewEntreLojasTransfer({ user: { role: 'dono' }, transfer: confirmedTransfer, allowedStatuses: [] })).toBe(true);
    expect(canViewEntreLojasTransfer({ user: manager('matriz'), transfer: confirmedTransfer, allowedStatuses: legacyStatuses })).toBe(true);
    expect(canViewEntreLojasTransfer({ user: manager('garavelo'), transfer: confirmedTransfer, allowedStatuses: legacyStatuses })).toBe(true);
    expect(canViewEntreLojasTransfer({ user: manager('outra-loja'), transfer: confirmedTransfer, allowedStatuses: legacyStatuses })).toBe(false);
  });

  test('abas e filtros usam os vinculos reais do gerente destino', () => {
    const visibleTransfers = [
      { ...transfer, id: 'aguardando', totalRepasse: 10, totalRevenda: 20, dataCriacao: new Date('2026-08-01T12:00:00') },
      { ...transfer, id: 'pagamento', status: 'pagamento_informado', totalRepasse: 15, totalRevenda: 30, dataCriacao: new Date('2026-08-02T12:00:00') },
      { ...transfer, id: 'historico', status: 'pagamento_confirmado', totalRepasse: 20, totalRevenda: 40, dataCriacao: new Date('2026-08-03T12:00:00') },
      { ...transfer, id: 'rascunho', status: 'rascunho', dataCriacao: new Date('2026-08-04T12:00:00') },
      { ...transfer, id: 'terceira', lojaDestinoId: 'outra-loja', dataCriacao: new Date('2026-08-05T12:00:00') }
    ];
    const baseOptions = {
      transfers: visibleTransfers,
      user: manager('garavelo'),
      allowedStatuses: allStatuses.filter((status) => status !== 'pagamento_confirmado'),
      selectedStoreId: 'garavelo',
      paymentStatuses: ['pagamento_informado', 'conferencia_sem_divergencia', 'conferencia_com_divergencia'],
      historyStatuses: ['pagamento_confirmado', 'pagamento_contestado', 'cancelado', 'cancelada']
    };

    expect(filterEntreLojasTransfers({ ...baseOptions, activeTab: 'todas' }).map((item) => item.id)).toEqual([
      'aguardando', 'pagamento', 'historico'
    ]);
    expect(filterEntreLojasTransfers({ ...baseOptions, activeTab: 'enviadas' })).toHaveLength(0);
    expect(filterEntreLojasTransfers({ ...baseOptions, activeTab: 'recebidas' }).map((item) => item.id)).toEqual([
      'aguardando', 'pagamento', 'historico'
    ]);
    expect(filterEntreLojasTransfers({ ...baseOptions, activeTab: 'aguardando_conferencia' }).map((item) => item.id)).toEqual(['aguardando']);
    expect(filterEntreLojasTransfers({ ...baseOptions, activeTab: 'aguardando_pagamento' }).map((item) => item.id)).toEqual(['pagamento']);
    expect(filterEntreLojasTransfers({ ...baseOptions, activeTab: 'historico' }).map((item) => item.id)).toEqual(['historico']);
    expect(filterEntreLojasTransfers({ ...baseOptions, statusFilter: 'pagamento_confirmado' }).map((item) => item.id)).toEqual(['historico']);
    expect(filterEntreLojasTransfers({ ...baseOptions, statusFilter: 'pagamento_informado' }).map((item) => item.id)).toEqual(['pagamento']);
    expect(filterEntreLojasTransfers({ ...baseOptions, originFilter: 'outra-origem' })).toHaveLength(0);
    expect(filterEntreLojasTransfers({ ...baseOptions, destinationFilter: 'garavelo' })).toHaveLength(3);
    expect(filterEntreLojasTransfers({ ...baseOptions, startDateFilter: '2026-08-02', endDateFilter: '2026-08-02' }).map((item) => item.id)).toEqual(['pagamento']);

    const originOptions = { ...baseOptions, user: manager('matriz'), selectedStoreId: 'matriz' };
    expect(filterEntreLojasTransfers({ ...originOptions, activeTab: 'todas' }).map((item) => item.id)).toEqual([
      'aguardando', 'pagamento', 'historico', 'rascunho', 'terceira'
    ]);
    expect(filterEntreLojasTransfers({ ...originOptions, activeTab: 'enviadas' }).map((item) => item.id)).toEqual([
      'aguardando', 'pagamento', 'historico', 'rascunho', 'terceira'
    ]);
    expect(filterEntreLojasTransfers({ ...originOptions, activeTab: 'historico' }).map((item) => item.id)).toEqual(['historico']);
  });

  test('vinculo duplo nao duplica remessa nem totais dos cards', () => {
    const repeatedTransfer = { ...transfer, id: 'unica', totalRepasse: 10, totalRevenda: 20 };
    const deduplicated = deduplicateEntreLojasTransfers([repeatedTransfer, { ...repeatedTransfer }]);
    const filtered = filterEntreLojasTransfers({
      transfers: deduplicated,
      user: manager('matriz', 'garavelo'),
      allowedStatuses: allStatuses
    });
    expect(filtered).toHaveLength(1);
    expect(summarizeEntreLojasTransfers(filtered)).toEqual({
      total: 1,
      totalRepasse: 10,
      totalRevenda: 20,
      aguardandoConferencia: 1,
      aguardandoConfirmacao: 0
    });
  });

  test('fechamentos permanecem visiveis somente para dono, origem ou destino', () => {
    expect(canViewEntreLojasClosing({ user: { role: 'dono' }, closing })).toBe(true);
    expect(canViewEntreLojasClosing({ user: manager('matriz'), closing })).toBe(true);
    expect(canViewEntreLojasClosing({ user: manager('garavelo'), closing })).toBe(true);
    expect(canViewEntreLojasClosing({ user: manager('outra-loja'), closing })).toBe(false);
  });
});

describe('permissoes de gerente em Entre Lojas', () => {
  test('gerente da origem pode conferir, pagar e cancelar remessa', () => {
    const permissions = getTransferActionPermissions({ user: manager('matriz'), transfer });
    expect(permissions.relation).toBe(ENTRE_LOJAS_RELATION.ORIGIN);
    expect(permissions.canConfirmWithoutDivergence).toBe(true);
    expect(permissions.canConfirmWithDivergence).toBe(true);
    expect(permissions.canMarkAsPaid).toBe(true);
    expect(permissions.canCancel).toBe(true);
  });

  test('gerente somente do destino confere e paga, mas nao cancela remessa', () => {
    const permissions = getTransferActionPermissions({ user: manager('garavelo'), transfer });
    expect(permissions.relation).toBe(ENTRE_LOJAS_RELATION.DESTINATION);
    expect(permissions.canConfirmWithoutDivergence).toBe(true);
    expect(permissions.canConfirmWithDivergence).toBe(true);
    expect(permissions.canMarkAsPaid).toBe(true);
    expect(permissions.canCancel).toBe(false);
  });

  test('gerente de terceira loja nao recebe acoes administrativas', () => {
    const permissions = getTransferActionPermissions({ user: manager('outra-loja'), transfer });
    expect(permissions.relation).toBe(ENTRE_LOJAS_RELATION.NONE);
    expect(permissions.canConfirmWithoutDivergence).toBe(false);
    expect(permissions.canConfirmWithDivergence).toBe(false);
    expect(permissions.canMarkAsPaid).toBe(false);
    expect(permissions.canCancel).toBe(false);
  });

  test('vinculo simultaneo prioriza a origem', () => {
    expect(getEntreLojasStoreRelation({
      user: manager('garavelo', 'matriz'),
      record: closing
    })).toBe(ENTRE_LOJAS_RELATION.ORIGIN);
  });

  test('gerente somente do destino nao edita nem cancela fechamento', () => {
    const permissions = getClosingActionPermissions({ user: manager('garavelo'), closing });
    expect(permissions.canConfirmWithoutDivergence).toBe(true);
    expect(permissions.canConfirmWithDivergence).toBe(true);
    expect(permissions.canEdit).toBe(false);
    expect(permissions.canCancel).toBe(false);
  });

  test('gerente da origem mantem edicao e cancelamento do fechamento aberto', () => {
    const permissions = getClosingActionPermissions({ user: manager('matriz'), closing });
    expect(permissions.canEdit).toBe(true);
    expect(permissions.canCancel).toBe(true);
  });

  test('gerente de terceira loja nao recebe acoes no fechamento', () => {
    const permissions = getClosingActionPermissions({
      user: manager('outra-loja'),
      closing
    });
    expect(permissions.canConfirmWithoutDivergence).toBe(false);
    expect(permissions.canMarkAsPaid).toBe(false);
    expect(permissions.canEdit).toBe(false);
    expect(permissions.canCancel).toBe(false);
  });

  test('origem e destino podem marcar fechamento como pago no status valido', () => {
    const payableClosing = { ...closing, status: 'fechado' };
    expect(getClosingActionPermissions({ user: manager('matriz'), closing: payableClosing }).canMarkAsPaid).toBe(true);
    expect(getClosingActionPermissions({ user: manager('garavelo'), closing: payableClosing }).canMarkAsPaid).toBe(true);
  });

  test('dono preserva as acoes sem depender de vinculo de loja', () => {
    const owner = { role: 'dono', lojaIds: [] };
    const transferPermissions = getTransferActionPermissions({ user: owner, transfer });
    const closingPermissions = getClosingActionPermissions({ user: owner, closing });
    expect(transferPermissions.canConfirmWithoutDivergence).toBe(true);
    expect(transferPermissions.canMarkAsPaid).toBe(true);
    expect(transferPermissions.canCancel).toBe(true);
    expect(closingPermissions.canEdit).toBe(true);
    expect(closingPermissions.canCancel).toBe(true);
  });

  test('status continua bloqueando acoes mesmo para gerente relacionado', () => {
    const permissions = getTransferActionPermissions({
      user: manager('matriz'),
      transfer: { ...transfer, status: 'pagamento_confirmado' }
    });
    expect(permissions.canConfirmWithoutDivergence).toBe(false);
    expect(permissions.canMarkAsPaid).toBe(false);
    expect(permissions.canCancel).toBe(false);
  });

  test('atendente nao recebe acoes administrativas novas', () => {
    const permissions = getTransferActionPermissions({
      user: { role: 'atendente', lojaIds: ['matriz'] },
      transfer
    });
    expect(permissions.canConfirmWithoutDivergence).toBe(false);
    expect(permissions.canMarkAsPaid).toBe(false);
    expect(permissions.canCancel).toBe(false);
  });
});
