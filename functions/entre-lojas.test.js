const assert = require('node:assert/strict');
const {describe, test} = require('node:test');
const {
  calculateClosingTotals,
  isAuthorizedTransferRoute,
  isStoreActive,
  resolveEntreLojasRelation,
} = require('./entre-lojas');

describe('autorizacao de Entre Lojas no backend', () => {
  const record = {lojaOrigemId: 'matriz', lojaDestinoId: 'garavelo'};

  test('prioriza origem quando gerente possui as duas lojas', () => {
    assert.equal(resolveEntreLojasRelation({
      role: 'gerente',
      lojaIds: ['garavelo', 'matriz'],
    }, record), 'origem');
  });

  test('identifica gerente somente do destino e gerente sem vinculo', () => {
    assert.equal(resolveEntreLojasRelation({
      role: 'gerente',
      lojaIds: ['garavelo'],
    }, record), 'destino');
    assert.equal(resolveEntreLojasRelation({
      role: 'gerente',
      lojaIds: ['terceira'],
    }, record), 'sem_vinculo');
  });

  test('dono nao depende de vinculo de loja', () => {
    assert.equal(resolveEntreLojasRelation({role: 'dono'}, record), 'dono');
  });

  test('recalcula somente remessas ativas sem alterar formulas financeiras', () => {
    const totals = calculateClosingTotals([
      {
        status: 'pagamento_informado',
        quantidadeTotalItens: 2,
        totalRepasse: 10.5,
        totalRevenda: 20,
      },
      {
        status: 'aguardando_conferencia',
        quantidadeTotalItens: 3,
        totalRepasse: 7,
        totalRevenda: 12,
      },
      {
        status: 'cancelado',
        quantidadeTotalItens: 100,
        totalRepasse: 999,
        totalRevenda: 999,
      },
    ]);

    assert.deepEqual(totals, {
      quantidadeRemessas: 2,
      quantidadeRemessasPagas: 1,
      quantidadeTotalItens: 5,
      totalRepasse: 17.5,
      totalRevenda: 32,
      totalPagoRepasse: 10.5,
      totalPagoRevenda: 20,
    });
  });

  test('autoriza rota direcional sem exigir acesso do usuario ao destino', () => {
    assert.equal(isAuthorizedTransferRoute({
      originStoreId: 'matriz',
      destinationStoreId: 'garavelo',
      authorizedDestinationStoreIds: ['garavelo'],
    }), true);
    assert.equal(isAuthorizedTransferRoute({
      originStoreId: 'garavelo',
      destinationStoreId: 'matriz',
      authorizedDestinationStoreIds: ['garavelo'],
    }), false);
  });

  test('bloqueia rota nao autorizada, mesma loja e destino inativo', () => {
    assert.equal(isAuthorizedTransferRoute({
      originStoreId: 'matriz',
      destinationStoreId: 'loja-x',
      authorizedDestinationStoreIds: ['garavelo'],
    }), false);
    assert.equal(isAuthorizedTransferRoute({
      originStoreId: 'matriz',
      destinationStoreId: 'matriz',
      authorizedDestinationStoreIds: ['matriz'],
    }), false);
    assert.equal(isAuthorizedTransferRoute({
      originStoreId: 'matriz',
      destinationStoreId: 'garavelo',
      authorizedDestinationStoreIds: ['garavelo'],
      destinationActive: false,
    }), false);
  });

  test('considera flags e status da loja ao validar atividade', () => {
    assert.equal(isStoreActive({}), true);
    assert.equal(isStoreActive({ativo: false}), false);
    assert.equal(isStoreActive({status: 'Inativa'}), false);
  });
});
