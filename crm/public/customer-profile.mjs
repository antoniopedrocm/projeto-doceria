// Security-sensitive identity changes belong to Firebase Auth, never Customer fields.
export function createCustomerProfileSecurity({auth, sdk, isAllowed}) {
  const requireUser = () => {
    const user = auth.currentUser;
    if (!isAllowed() || !user || user.isAnonymous) throw new Error('Entre novamente para acessar seu perfil.');
    return user;
  };
  const check = user => {
    if (requireUser().uid !== user.uid) throw new Error('Sua conta mudou. Entre novamente.');
  };
  async function reauthenticate(password) {
    const user = requireUser();
    if (!user.providerData.some(p => p.providerId === 'password') || user.providerData.some(p => p.providerId === 'google.com')) throw new Error('Gerencie a segurança desta conta pelo Google.');
    if (!password) throw new Error('Informe sua senha atual.');
    await sdk.reauthenticateWithCredential(user, sdk.EmailAuthProvider.credential(user.email, password));
    check(user);
    return user;
  }
  return {
    async changeEmail(email, password) {
      const value = String(email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Informe um e-mail válido.');
      const user = await reauthenticate(password);
      await sdk.verifyBeforeUpdateEmail(user, value); check(user);
      return 'Confirme o novo e-mail pelo link enviado. Seu e-mail atual permanece até a confirmação.';
    },
    async changePassword(password, nextPassword, confirmation) {
      if (!nextPassword || nextPassword.length < 6) throw new Error('Use uma senha com pelo menos 6 caracteres.');
      if (nextPassword !== confirmation) throw new Error('As senhas não conferem.');
      const user = await reauthenticate(password);
      await sdk.updatePassword(user, nextPassword); check(user);
      return 'Senha alterada.';
    },
    async verifyEmail() {
      const user = requireUser();
      if (!user.providerData.some(p => p.providerId === 'password')) throw new Error('O e-mail desta conta é gerenciado pelo Google.');
      await sdk.sendEmailVerification(user); check(user);
      return 'E-mail de verificação enviado.';
    },
    async resetPassword() {
      const user = requireUser();
      if (!user.providerData.some(p => p.providerId === 'password')) throw new Error('Gerencie a senha pelo Google.');
      await sdk.sendPasswordResetEmail(auth, user.email); check(user);
      return 'Enviamos as instruções para redefinir sua senha.';
    },
  };
}
