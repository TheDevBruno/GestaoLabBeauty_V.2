import { describe, expect, it } from 'vitest';
import { createQueryClient, shouldRetry } from './query-client';

describe('shouldRetry', () => {
  it('repete falha de rede (sem status) até 2 vezes', () => {
    expect(shouldRetry(0, new Error('rede'))).toBe(true);
    expect(shouldRetry(1, new Error('rede'))).toBe(true);
    expect(shouldRetry(2, new Error('rede'))).toBe(false);
  });

  it('repete 5xx', () => {
    expect(shouldRetry(0, { status: 500 })).toBe(true);
    expect(shouldRetry(1, { status: 503 })).toBe(true);
  });

  it.each([400, 401, 403, 404, 409, 499])('não repete %i', (status) => {
    expect(shouldRetry(0, { status })).toBe(false);
  });

  it('ignora status que não é número', () => {
    expect(shouldRetry(0, { status: '404' })).toBe(true);
  });

  it('aceita erro nulo ou primitivo', () => {
    expect(shouldRetry(0, null)).toBe(true);
    expect(shouldRetry(0, 'falhou')).toBe(true);
  });
});

describe('createQueryClient', () => {
  it('cria um cliente novo a cada chamada, com a política de retry', () => {
    const a = createQueryClient();
    const b = createQueryClient();
    expect(a).not.toBe(b);
    expect(a.getDefaultOptions().queries?.retry).toBe(shouldRetry);
    expect(a.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });
});
