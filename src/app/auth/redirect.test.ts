import { describe, expect, it } from 'vitest';
import { DEFAULT_AFTER_LOGIN, loginPath, safeNextPath, signupPath } from './redirect';

describe('safeNextPath', () => {
  it.each(['/app', '/convite', '/app/agenda?dia=2026-10-23', '/app#topo'])(
    'aceita caminho interno %j',
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    null,
    undefined,
    '',
    'app',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    ' /app',
  ])('cai no padrão para %j (sem open redirect)', (raw) => {
    expect(safeNextPath(raw)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it('normaliza caminhos com ponto sem sair da origem', () => {
    expect(safeNextPath('/app/../convite')).toBe('/convite');
  });
});

describe('loginPath e signupPath', () => {
  it('codificam o destino em ?next=', () => {
    expect(loginPath('/convite')).toBe('/entrar?next=%2Fconvite');
    expect(signupPath('/app?x=1')).toBe('/cadastro?next=%2Fapp%3Fx%3D1');
  });

  it('sem destino, não põem ?next=', () => {
    expect(loginPath()).toBe('/entrar');
    expect(signupPath()).toBe('/cadastro');
  });
});
