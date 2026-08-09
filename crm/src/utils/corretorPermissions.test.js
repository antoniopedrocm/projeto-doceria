import {
  CORRETOR_ROLE,
  getCorretorDefaultPermissions,
  isCorretorMutationControl,
  isCorretorReadControl,
  isCorretorRole,
  sanitizeCorretorPermissions,
} from './corretorPermissions';

describe('permissões do Corretor', () => {
  const modules = ['produtos', 'financeiro', 'nota-fiscal', 'configuracoes', 'ifood', 'food99'];

  test('normaliza o identificador técnico sem afetar outros perfis', () => {
    expect(isCorretorRole(CORRETOR_ROLE)).toBe(true);
    expect(isCorretorRole(' Corretor ')).toBe(true);
    expect(isCorretorRole('gerente')).toBe(false);
  });

  test('inicia sem módulos por menor privilégio', () => {
    expect(getCorretorDefaultPermissions(modules)).toEqual({
      produtos: false,
      financeiro: false,
      'nota-fiscal': false,
      configuracoes: false,
      ifood: false,
      food99: false,
    });
  });

  test('preserva apenas módulos autorizados e bloqueia integrações/administração', () => {
    expect(sanitizeCorretorPermissions({
      produtos: true,
      financeiro: true,
      'nota-fiscal': true,
      configuracoes: true,
      ifood: true,
      food99: true,
    }, modules)).toEqual({
      produtos: true,
      financeiro: true,
      'nota-fiscal': true,
      configuracoes: false,
      ifood: false,
      food99: false,
    });
  });

  test('distingue ações de consulta de mutações operacionais', () => {
    const exportButton = document.createElement('button');
    exportButton.textContent = 'Exportar relatório';
    const paymentButton = document.createElement('button');
    paymentButton.textContent = 'Marcar como pago';
    expect(isCorretorReadControl(exportButton)).toBe(true);
    expect(isCorretorMutationControl(exportButton)).toBe(false);
    expect(isCorretorReadControl(paymentButton)).toBe(false);
    expect(isCorretorMutationControl(paymentButton)).toBe(true);
  });
});
