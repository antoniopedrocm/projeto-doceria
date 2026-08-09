export const CORRETOR_ROLE = 'corretor';

// Integrações e a administração de usuários continuam fora do perfil de consulta.
// Elas não fazem parte da allowlist operacional solicitada para o Corretor.
export const CORRETOR_RESTRICTED_MODULES = new Set([
  'configuracoes',
  'ifood',
  'food99',
]);

export const isCorretorRole = (role) => String(role || '').trim().toLowerCase() === CORRETOR_ROLE;

export const getCorretorDefaultPermissions = (moduleKeys = []) => moduleKeys.reduce((result, moduleKey) => ({
  ...result,
  [moduleKey]: false,
}), {});

export const sanitizeCorretorPermissions = (permissions, moduleKeys = []) => {
  const source = permissions && typeof permissions === 'object' ? permissions : {};
  return moduleKeys.reduce((result, moduleKey) => ({
    ...result,
    [moduleKey]: CORRETOR_RESTRICTED_MODULES.has(moduleKey) ? false : source[moduleKey] === true,
  }), {});
};

export const CORRETOR_MUTATION_LABEL = /\b(novo|nova|adicionar|criar|salvar|editar|excluir|cancelar|aprovar|rejeitar|conferir|estornar|alterar|registrar|finalizar|movimentar|ajustar|abonar|inativar|reativar|importar|duplicar|transferir|liquidar|lan[cç]ar|desativar)\b|dar baixa|marcar como pag[oa]|(informar|confirmar|contestar|registrar) pagamento|registrar (retirada|sangria|perda|ponto|f[eé]rias)|criar (remessa|fechamento)|fechar caixa/i;

export const CORRETOR_READ_LABEL = /\b(consultar|buscar|pesquisar|filtrar|visualizar|detalhes|hist[oó]rico|exportar|baixar|imprimir|voltar|fechar)\b/i;

export const isCorretorMutationControl = (element) => {
  if (!element || typeof element.closest !== 'function') return false;
  const control = element.closest('button, a, [role="button"], input[type="submit"], input[type="button"]');
  if (!control) return false;
  if (control.dataset?.corretorReadAction === 'true') return false;
  if (control.dataset?.corretorMutation === 'true') return true;
  const label = [
    control.textContent,
    control.getAttribute?.('aria-label'),
    control.getAttribute?.('title'),
    control.getAttribute?.('value'),
  ].filter(Boolean).join(' ');
  return CORRETOR_MUTATION_LABEL.test(label);
};

export const isCorretorReadControl = (element) => {
  if (!element || typeof element.closest !== 'function') return false;
  const control = element.closest('button, a, [role="button"], input[type="submit"], input[type="button"]');
  if (!control) return false;
  if (control.dataset?.corretorReadAction === 'true') return true;
  const label = [
    control.textContent,
    control.getAttribute?.('aria-label'),
    control.getAttribute?.('title'),
    control.getAttribute?.('value'),
  ].filter(Boolean).join(' ');
  return CORRETOR_READ_LABEL.test(label) && !CORRETOR_MUTATION_LABEL.test(label);
};
