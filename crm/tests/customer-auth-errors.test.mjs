import test from 'node:test';
import assert from 'node:assert/strict';
import {customerAuthErrorMessage} from '../public/customer-auth-errors.mjs';

test('orienta o cliente quando o e-mail já possui conta', () => {
  assert.equal(
    customerAuthErrorMessage({code:'auth/email-already-in-use',message:'Firebase: Error (auth/email-already-in-use).'}),
    'Este e-mail já possui uma conta. Use “Já tenho uma conta” para entrar ou recuperar sua senha.',
  );
});

test('não expõe mensagens técnicas do Firebase', () => {
  assert.equal(
    customerAuthErrorMessage({code:'auth/unknown',message:'Firebase: Error (auth/unknown).'}),
    'Não foi possível concluir. Tente novamente.',
  );
});

test('preserva validações de negócio já apresentadas ao cliente', () => {
  assert.equal(customerAuthErrorMessage(new Error('As senhas não conferem.')), 'As senhas não conferem.');
});

test('traduz falhas comuns de login e conexão', () => {
  assert.equal(customerAuthErrorMessage({code:'auth/invalid-credential'}), 'E-mail ou senha incorretos.');
  assert.equal(customerAuthErrorMessage({code:'auth/network-request-failed'}), 'Não foi possível conectar. Verifique sua internet e tente novamente.');
});
