const AUTH_ERROR_MESSAGES = Object.freeze({
  'auth/email-already-in-use': 'Este e-mail já possui uma conta. Use “Já tenho uma conta” para entrar ou recuperar sua senha.',
  'auth/invalid-email': 'Informe um e-mail válido.',
  'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/user-disabled': 'Esta conta está desativada. Entre em contato com a loja.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  'auth/network-request-failed': 'Não foi possível conectar. Verifique sua internet e tente novamente.',
  'auth/operation-not-allowed': 'Este tipo de acesso está indisponível no momento.',
  'auth/popup-closed-by-user': 'A entrada com Google foi cancelada.',
});

export function customerAuthErrorMessage(error) {
  if (error?.code && AUTH_ERROR_MESSAGES[error.code]) return AUTH_ERROR_MESSAGES[error.code];
  const message = typeof error?.message === 'string' ? error.message.trim() : '';
  if (message && !/^Firebase:\s*Error\b/i.test(message)) return message;
  return 'Não foi possível concluir. Tente novamente.';
}
