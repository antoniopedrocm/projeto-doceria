const {test}=require('node:test');
const assert=require('node:assert/strict');
async function fixture(provider='password') {
  const {createCustomerProfileSecurity}=await import('../crm/public/customer-profile.mjs');
  const calls=[];const auth={currentUser:{uid:'a',email:'old@example.com',providerData:[{providerId:provider}]}};
  let allowed=true;
  const sdk={EmailAuthProvider:{credential:(email,password)=>({email,password})},
    reauthenticateWithCredential:async(user,credential)=>{calls.push(['reauth',user.uid,credential]);},
    verifyBeforeUpdateEmail:async(user,email)=>{calls.push(['email',user.uid,email]);},
    updatePassword:async(user,password)=>{calls.push(['password',user.uid,password]);},
    sendEmailVerification:async user=>{calls.push(['verify',user.uid]);},
    sendPasswordResetEmail:async(_auth,email)=>{calls.push(['reset',email]);}};
  const api=createCustomerProfileSecurity({auth,sdk,isAllowed:()=>allowed});
  return {api,auth,sdk,calls,deny:()=>{allowed=false;}};
}
test('e-mail de login usa reautenticação e confirmação Firebase; não altera Customer',async()=>{
  const f=await fixture();assert.match(await f.api.changeEmail(' new@example.com ','current-secret'),/Confirme/);
  assert.deepEqual(f.calls,[['reauth','a',{email:'old@example.com',password:'current-secret'}],['email','a','new@example.com']]);
  assert.equal(f.auth.currentUser.email,'old@example.com');
});
test('senha usa reautenticação antes da atualização e valida confirmação',async()=>{
  const f=await fixture();await assert.rejects(f.api.changePassword('old','abcdef','different'));assert.equal(f.calls.length,0);
  await f.api.changePassword('old','abcdef','abcdef');assert.equal(f.calls[0][0],'reauth');assert.deepEqual(f.calls[1],['password','a','abcdef']);
});
test('senha atual inválida impede mudança de e-mail/senha',async()=>{
  const f=await fixture();f.sdk.reauthenticateWithCredential=async()=>{throw Error('invalid-credential');};
  await assert.rejects(f.api.changeEmail('new@example.com','wrong'));await assert.rejects(f.api.changePassword('wrong','abcdef','abcdef'));
  assert.equal(f.calls.length,0);
});
test('Google não oferece mutação local de senha, e-mail ou verificação do provider',async()=>{
  const f=await fixture('google.com');
  for(const run of [()=>f.api.changeEmail('new@example.com','old'),()=>f.api.changePassword('old','abcdef','abcdef'),()=>f.api.verifyEmail(),()=>f.api.resetPassword()]) await assert.rejects(run(),/Google/);
  assert.equal(f.calls.length,0);
  f.auth.currentUser.providerData.push({providerId:'password'});
  await assert.rejects(f.api.changeEmail('new@example.com','old'),/Google/);
});
test('sessão ausente e logout/troca de conta durante reauth impedem alteração',async()=>{
  const f=await fixture();f.deny();await assert.rejects(f.api.changeEmail('new@example.com','old'));assert.equal(f.calls.length,0);
  const g=await fixture();g.sdk.reauthenticateWithCredential=async()=>{g.auth.currentUser={...g.auth.currentUser,uid:'b'};};
  await assert.rejects(g.api.changePassword('old','abcdef','abcdef'),/conta mudou/);assert.equal(g.calls.length,0);
});
test('reenvio de verificação e recuperação usam somente o usuário atual',async()=>{
  const f=await fixture();await f.api.verifyEmail();await f.api.resetPassword();assert.deepEqual(f.calls,[['verify','a'],['reset','old@example.com']]);
});
