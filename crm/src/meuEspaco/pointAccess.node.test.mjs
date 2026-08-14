import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {
  employeeBelongsToPointStore,
  getPointEmployeeOptionLabel,
  getPointEmployeeStoreIds,
} from './pointAccess.js';

describe('controle de acesso do ponto no frontend', () => {
  test('reconhece loja primaria e multiplas lojas', () => {
    assert.deepEqual(getPointEmployeeStoreIds({
      lojaId: 'matriz',
      lojaIds: ['matriz', 'garavelo'],
    }), ['matriz', 'garavelo']);
    assert.equal(
        employeeBelongsToPointStore({lojaId: 'garavelo'}, 'matriz'),
        false,
    );
  });

  test('identifica funcionario inativo sem remove-lo da consulta', () => {
    assert.equal(getPointEmployeeOptionLabel({
      nome: 'Funcionaria B',
      lojaId: 'matriz',
      status: 'Inativo',
    }), 'Funcionaria B (Inativo)');
  });

  test('bloqueia selecao de funcionario de outra loja para PDF', () => {
    const employee = {id: 'func-c', lojaId: 'garavelo'};
    assert.equal(employeeBelongsToPointStore(employee, 'matriz'), false);
  });
});
