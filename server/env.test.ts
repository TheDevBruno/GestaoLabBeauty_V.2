import { describe, expect, it } from 'vitest';
import { parseServerEnv } from './env';

const VALID = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'anon-sintetica',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-sintetica',
};

describe('parseServerEnv', () => {
  it('lê as três variáveis do servidor', () => {
    expect(parseServerEnv(VALID)).toEqual({
      supabaseUrl: VALID.SUPABASE_URL,
      anonKey: VALID.SUPABASE_ANON_KEY,
      serviceRoleKey: VALID.SUPABASE_SERVICE_ROLE_KEY,
    });
  });

  it('não aceita as variáveis VITE_ no lugar das do servidor', () => {
    expect(() =>
      parseServerEnv({
        VITE_SUPABASE_URL: VALID.SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: VALID.SUPABASE_ANON_KEY,
      }),
    ).toThrow(/SUPABASE_URL/);
  });

  it('erro cita a variável e nunca o valor', () => {
    const run = () => parseServerEnv({ ...VALID, SUPABASE_URL: 'valor-secreto-invalido' });
    expect(run).toThrow(/SUPABASE_URL/);
    expect(run).not.toThrow(/valor-secreto-invalido/);
  });

  it('service role vazia é recusada', () => {
    expect(() => parseServerEnv({ ...VALID, SUPABASE_SERVICE_ROLE_KEY: '' })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });
});
