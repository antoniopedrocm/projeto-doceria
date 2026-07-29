import {
  formatCentsBRL,
  getDocumentCents,
  getDefaultCaixaPermissionsForRole,
  parseCurrencyToCents,
  sanitizeCaixaPermissions,
} from './caixaCore';

describe('permissões do caixa', () => {
  test('atendente recebe somente as três permissões operacionais', () => {
    expect(getDefaultCaixaPermissionsForRole('atendente')).toEqual({
      registrarInicio: true,
      registrarEncerramento: true,
      registrarRetiradaDespesa: true,
      registrarSangria: false,
      visualizarSangrias: false,
      visualizarConferencia: false,
      visualizarValoresCalculados: false,
      visualizarDivergencias: false,
    });
  });

  test.each(['gerente', 'dono'])('%s recebe todas as permissões gerenciais', (role) => {
    expect(Object.values(getDefaultCaixaPermissionsForRole(role)).every(Boolean)).toBe(true);
  });

  test('permissões personalizadas preservam defaults de campos novos', () => {
    expect(sanitizeCaixaPermissions({ registrarSangria: false }, 'gerente')).toMatchObject({
      registrarInicio: true,
      registrarSangria: false,
      visualizarConferencia: true,
    });
  });

  test('flags forjadas não elevam atendente nem contador', () => {
    expect(sanitizeCaixaPermissions({ visualizarDivergencias: true }, 'atendente').visualizarDivergencias).toBe(false);
    expect(Object.values(sanitizeCaixaPermissions({ registrarInicio: true }, 'contador')).every((value) => value === false)).toBe(true);
  });

  test('dono mantém todas as permissões mesmo com perfil legado restritivo', () => {
    expect(Object.values(sanitizeCaixaPermissions({ registrarSangria: false }, 'dono')).every(Boolean)).toBe(true);
  });
});

describe('valores monetários do caixa', () => {
  test.each([
    ['200,00', 20000],
    ['R$ 1.234,56', 123456],
    ['10.5', 1050],
  ])('converte %s para centavos inteiros', (input, expected) => {
    expect(parseCurrencyToCents(input)).toBe(expected);
  });

  test('distingue zero válido de conteúdo monetário inválido', () => {
    expect(parseCurrencyToCents('0,00')).toBe(0);
    expect(parseCurrencyToCents('valor inválido')).toBeNull();
    expect(parseCurrencyToCents('')).toBeNull();
  });

  test('formata centavos sem usar ponto flutuante como fonte', () => {
    expect(formatCentsBRL(-2000)).toContain('20,00');
  });

  test('mantém valor ausente como não informado sem confundir com zero válido', () => {
    expect(getDocumentCents({ valorEncerramentoCentavos: null }, 'valorEncerramentoCentavos', 'valorEncerramento')).toBeNull();
    expect(getDocumentCents({ valorEncerramentoCentavos: 0 }, 'valorEncerramentoCentavos', 'valorEncerramento')).toBe(0);
  });
});
