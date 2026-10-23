import { describe, expect, it } from 'vitest';
import { parseSupabaseEnv } from './env';

describe('parseSupabaseEnv', () => {
  const valid = {
    VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
    VITE_SUPABASE_ANON_KEY: 'chave-anonima',
  };

  it('devolve URL e chave anônima', () => {
    expect(parseSupabaseEnv(valid)).toEqual({
      url: 'http://127.0.0.1:54321',
      anonKey: 'chave-anonima',
    });
  });

  it('ignora variáveis que não são do Supabase', () => {
    expect(parseSupabaseEnv({ ...valid, MODE: 'test' }).url).toBe(valid.VITE_SUPABASE_URL);
  });

  it('falha se a URL faltar ou for inválida', () => {
    expect(() => parseSupabaseEnv({ VITE_SUPABASE_ANON_KEY: 'k' })).toThrow('VITE_SUPABASE_URL');
    expect(() => parseSupabaseEnv({ ...valid, VITE_SUPABASE_URL: 'nao-e-url' })).toThrow(
      'VITE_SUPABASE_URL',
    );
  });

  it('falha se a chave anônima faltar ou estiver vazia', () => {
    expect(() => parseSupabaseEnv({ VITE_SUPABASE_URL: valid.VITE_SUPABASE_URL })).toThrow(
      'VITE_SUPABASE_ANON_KEY',
    );
    expect(() => parseSupabaseEnv({ ...valid, VITE_SUPABASE_ANON_KEY: '' })).toThrow(
      'VITE_SUPABASE_ANON_KEY',
    );
  });

  it('a mensagem de erro não vaza os valores recebidos', () => {
    let message = '';
    try {
      parseSupabaseEnv({ VITE_SUPABASE_URL: 'segredo-que-nao-e-url', VITE_SUPABASE_ANON_KEY: '' });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).not.toContain('segredo-que-nao-e-url');
  });
});
