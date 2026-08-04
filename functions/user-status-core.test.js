const assert = require('node:assert/strict');
const {describe, test} = require('node:test');

const {
  countActiveOwners,
  getUserStatusPolicyViolation,
  isUserActive,
  managerHasUserStatusPermission,
  normalizeInactivationReason,
  storesAreWithinScope,
} = require('./user-status-core');

const normalizeRole = (role) => String(role || '').toLowerCase();

describe('politica de status de usuarios', () => {
  test('usuarios legados sem status continuam ativos', () => {
    assert.equal(isUserActive({nome: 'Legado'}), true);
  });

  test('campo interno ou Firebase Auth desabilitado tornam inativo', () => {
    assert.equal(isUserActive({ativo: false}), false);
    assert.equal(isUserActive({status: 'Inativo'}), false);
    assert.equal(isUserActive({}, {disabled: true}), false);
  });

  test('motivo e obrigatorio depois da normalizacao', () => {
    assert.equal(normalizeInactivationReason('   desligamento   '),
        'desligamento');
    assert.equal(normalizeInactivationReason('   '), '');
  });

  test('permissao de gerente nao e concedida por padrao', () => {
    assert.equal(managerHasUserStatusPermission({}), false);
    assert.equal(managerHasUserStatusPermission({
      configuracoes: {gerenciarStatusUsuarios: true},
    }), true);
  });

  test('gerente permanece limitado as proprias lojas', () => {
    assert.equal(storesAreWithinScope(['matriz'], ['matriz']), true);
    assert.equal(storesAreWithinScope(['matriz'], ['filial']), false);
    assert.equal(storesAreWithinScope([], ['matriz']), false);
    assert.equal(storesAreWithinScope(['matriz'], []), false);
  });

  test('contagem do ultimo dono ignora donos inativos', () => {
    const profiles = [
      {role: 'dono'},
      {role: 'dono', ativo: false},
      {role: 'gerente'},
    ];
    assert.equal(countActiveOwners(profiles, normalizeRole), 1);
  });

  test('bloqueia autoinativacao e o ultimo dono ativo', () => {
    assert.equal(getUserStatusPolicyViolation({
      requesterUid: 'owner-1',
      requesterRole: 'dono',
      requesterAllStores: true,
      targetUid: 'owner-1',
      targetRole: 'dono',
    }), 'self-management');
    assert.equal(getUserStatusPolicyViolation({
      requesterUid: 'owner-2',
      requesterRole: 'dono',
      requesterAllStores: true,
      targetUid: 'owner-1',
      targetRole: 'dono',
      targetActive: true,
      activeOwnerCount: 1,
    }), 'last-active-owner');
  });

  test('gerente exige permissao granular e escopo de loja', () => {
    const base = {
      requesterUid: 'manager',
      requesterRole: 'gerente',
      requesterStores: ['matriz'],
      targetUid: 'attendant',
      targetRole: 'atendente',
      targetStores: ['matriz'],
    };
    assert.equal(getUserStatusPolicyViolation(base), 'manager-permission');
    assert.equal(getUserStatusPolicyViolation({
      ...base,
      requesterPermissionDetails: {
        configuracoes: {gerenciarStatusUsuarios: true},
      },
      targetStores: ['filial'],
    }), 'store-scope');
  });
});
