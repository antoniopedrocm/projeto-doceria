import {
  ENTRE_LOJAS_RELATION,
  getClosingActionPermissions,
  getEntreLojasStoreRelation,
  getTransferActionPermissions
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

describe('permissoes de gerente em Entre Lojas', () => {
  test('gerente da origem pode conferir, pagar e cancelar remessa', () => {
    const permissions = getTransferActionPermissions({
      user: manager('matriz'),
      transfer
    });

    expect(permissions.relation).toBe(ENTRE_LOJAS_RELATION.ORIGIN);
    expect(permissions.canConfirmWithoutDivergence).toBe(true);
    expect(permissions.canConfirmWithDivergence).toBe(true);
    expect(permissions.canMarkAsPaid).toBe(true);
    expect(permissions.canCancel).toBe(true);
  });

  test('gerente somente do destino confere e paga, mas nao cancela remessa', () => {
    const permissions = getTransferActionPermissions({
      user: manager('garavelo'),
      transfer
    });

    expect(permissions.relation).toBe(ENTRE_LOJAS_RELATION.DESTINATION);
    expect(permissions.canConfirmWithoutDivergence).toBe(true);
    expect(permissions.canConfirmWithDivergence).toBe(true);
    expect(permissions.canMarkAsPaid).toBe(true);
    expect(permissions.canCancel).toBe(false);
  });

  test('gerente de terceira loja nao recebe acoes administrativas', () => {
    const permissions = getTransferActionPermissions({
      user: manager('outra-loja'),
      transfer
    });

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
    const permissions = getClosingActionPermissions({
      user: manager('garavelo'),
      closing
    });

    expect(permissions.canConfirmWithoutDivergence).toBe(true);
    expect(permissions.canConfirmWithDivergence).toBe(true);
    expect(permissions.canEdit).toBe(false);
    expect(permissions.canCancel).toBe(false);
  });

  test('gerente da origem mantem edicao e cancelamento do fechamento aberto', () => {
    const permissions = getClosingActionPermissions({
      user: manager('matriz'),
      closing
    });

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

    expect(getClosingActionPermissions({
      user: manager('matriz'),
      closing: payableClosing
    }).canMarkAsPaid).toBe(true);
    expect(getClosingActionPermissions({
      user: manager('garavelo'),
      closing: payableClosing
    }).canMarkAsPaid).toBe(true);
  });

  test('dono preserva as acoes sem depender de vinculo de loja', () => {
    const owner = { role: 'dono', lojaIds: [] };
    const transferPermissions = getTransferActionPermissions({ owner, user: owner, transfer });
    const closingPermissions = getClosingActionPermissions({ user: owner, closing });

    expect(transferPermissions.canConfirmWithoutDivergence).toBe(true);
    expect(transferPermissions.canMarkAsPaid).toBe(true);
    expect(transferPermissions.canCancel).toBe(true);
    expect(closingPermissions.canEdit).toBe(true);
    expect(closingPermissions.canCancel).toBe(true);
  });

  test('status continua bloqueando acoes mesmo para gerente relacionado', () => {
    const paidTransfer = { ...transfer, status: 'pagamento_confirmado' };
    const permissions = getTransferActionPermissions({
      user: manager('matriz'),
      transfer: paidTransfer
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
