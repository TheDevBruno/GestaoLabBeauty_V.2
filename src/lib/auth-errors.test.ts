import { describe, expect, it } from 'vitest';
import {
  invitationErrorMessage,
  invitationFailure,
  loginErrorMessage,
  signupErrorMessage,
} from './auth-errors';

describe('loginErrorMessage', () => {
  it('credenciais inválidas não dizem qual dos dois está errado', () => {
    expect(loginErrorMessage({ code: 'invalid_credentials' })).toBe('E-mail ou senha incorretos.');
  });

  it('falha de rede tem mensagem própria', () => {
    expect(loginErrorMessage({ name: 'AuthRetryableFetchError' })).toContain('conexão');
    expect(loginErrorMessage({ status: 0 })).toContain('conexão');
  });

  it('código desconhecido cai na mensagem genérica', () => {
    expect(loginErrorMessage({ code: 'qualquer' })).toContain('Tente de novo');
  });

  it('limite de tentativas', () => {
    expect(loginErrorMessage({ code: 'over_request_rate_limit' })).toContain('Muitas tentativas');
  });
});

describe('signupErrorMessage', () => {
  it.each(['user_already_exists', 'email_exists'])('%s orienta a entrar', (code) => {
    expect(signupErrorMessage({ code })).toContain('entre');
  });

  it.each([
    ['weak_password', 'senha'],
    ['email_address_invalid', 'e-mail'],
    ['signup_disabled', 'fechado'],
    ['over_email_send_rate_limit', 'Muitas tentativas'],
  ])('%s', (code, trecho) => {
    expect(signupErrorMessage({ code })).toContain(trecho);
  });
});

describe('invitationFailure e invitationErrorMessage', () => {
  it.each([
    ['23514', 'invalid'],
    ['23505', 'already-member'],
    ['42501', 'unauthenticated'],
    [undefined, 'unknown'],
  ] as const)('SQLSTATE %s vira %s', (code, failure) => {
    expect(invitationFailure({ code })).toBe(failure);
    expect(invitationErrorMessage(failure).length).toBeGreaterThan(10);
  });
});
