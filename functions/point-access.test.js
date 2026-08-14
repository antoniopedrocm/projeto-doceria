const assert = require('node:assert/strict');
const {describe, test} = require('node:test');
const {
  canModifyPointStore,
  canViewEmployeePoint,
  canViewPointStore,
  employeeBelongsToStore,
  filterPointEmployeesByStore,
  sanitizePointEmployee,
} = require('./point-access');

describe('autorizacao de ponto do contador', () => {
  test('permite leitura apenas nas lojas vinculadas', () => {
    const context = {
      role: 'contador',
      allowedStoreIds: ['matriz', 'garavelo'],
    };

    assert.equal(canViewPointStore({
      ...context,
      requestedStoreId: 'matriz',
    }), true);
    assert.equal(canViewPointStore({
      ...context,
      requestedStoreId: 'garavelo',
    }), true);
    assert.equal(canViewPointStore({
      ...context,
      requestedStoreId: 'terceira-loja',
    }), false);
  });

  test('nega toda escrita ao contador mesmo na loja autorizada', () => {
    assert.equal(canModifyPointStore({
      role: 'contador',
      allowedStoreIds: ['matriz'],
      requestedStoreId: 'matriz',
    }), false);
  });

  test('nega PDF de funcionario pertencente a outra loja', () => {
    const access = {
      role: 'contador',
      allowedStoreIds: ['matriz'],
      requestedStoreId: 'matriz',
    };

    assert.equal(canViewEmployeePoint({
      ...access,
      employee: {id: 'a', lojaId: 'matriz'},
    }), true);
    assert.equal(canViewEmployeePoint({
      ...access,
      employee: {id: 'c', lojaId: 'garavelo'},
    }), false);
  });

  test('filtra funcionarios ativos e inativos pela loja solicitada', () => {
    const employees = [
      {id: 'a', lojaId: 'matriz', status: 'Ativo'},
      {id: 'b', lojaIds: ['matriz'], status: 'Inativo'},
      {id: 'c', lojaId: 'garavelo', status: 'Ativo'},
    ];

    assert.deepEqual(
        filterPointEmployeesByStore(employees, 'matriz').map(({id}) => id),
        ['a', 'b'],
    );
    assert.equal(employeeBelongsToStore(employees[2], 'matriz'), false);
    assert.equal(sanitizePointEmployee(employees[1], 'b').ativo, false);
  });

  test('remove campos sensiveis da resposta de colaboradores', () => {
    const sanitized = sanitizePointEmployee({
      nome: 'Funcionaria A',
      email: 'a@example.com',
      lojaId: 'matriz',
      senha: 'segredo',
      permissions: {configuracoes: true},
    }, 'func-a');

    assert.equal(sanitized.id, 'func-a');
    assert.equal(sanitized.lojaIds[0], 'matriz');
    assert.equal(Object.hasOwn(sanitized, 'senha'), false);
    assert.equal(Object.hasOwn(sanitized, 'permissions'), false);
  });
});
