import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAuthApi } from './auth-api';
import { loginErrorMessage, signupErrorMessage } from './auth-errors';

// Cliente falso com só o que o adaptador usa. O cast é restrito ao teste.
function fakeClient(overrides: Record<string, unknown> = {}) {
  const unsubscribe = vi.fn();
  const auth = {
    getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })),
    signInWithPassword: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    signUp: vi.fn(() => Promise.resolve({ data: { session: { user: {} } }, error: null })),
    signOut: vi.fn(() => Promise.resolve({ error: null })),
    ...overrides,
  };
  const rpc = vi.fn(() => Promise.resolve({ data: 'tenant-1', error: null }));
  const client = { auth, rpc } as unknown as SupabaseClient;
  return { client, auth, rpc, unsubscribe };
}

describe('createSupabaseAuthApi', () => {
  it('converte a sessão do Supabase em AuthSession', async () => {
    const { client } = fakeClient({
      getSession: () =>
        Promise.resolve({
          data: { session: { user: { id: 'u1', email: 'a@b.co' } } },
          error: null,
        }),
    });
    await expect(createSupabaseAuthApi(client).getSession()).resolves.toEqual({
      userId: 'u1',
      email: 'a@b.co',
    });
  });

  it('onChange devolve uma função que cancela a inscrição', () => {
    const { client, unsubscribe } = fakeClient();
    const stop = createSupabaseAuthApi(client).onChange(() => undefined);
    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('login com erro devolve mensagem em pt-BR, não a do servidor', async () => {
    const error = {
      code: 'invalid_credentials',
      status: 400,
      message: 'Invalid login credentials',
    };
    const { client } = fakeClient({
      signInWithPassword: () => Promise.resolve({ data: {}, error }),
    });
    await expect(
      createSupabaseAuthApi(client).signIn({ email: 'a@b.co', password: 'x' }),
    ).resolves.toEqual({ ok: false, message: loginErrorMessage(error) });
  });

  it('cadastro manda full_name só quando existe e indica confirmação pendente', async () => {
    const signUp = vi.fn(() => Promise.resolve({ data: { session: null }, error: null }));
    const { client } = fakeClient({ signUp });
    const api = createSupabaseAuthApi(client);

    await expect(
      api.signUp({ email: 'a@b.co', password: '123456', fullName: 'Ana' }),
    ).resolves.toEqual({ ok: true, needsConfirmation: true });
    expect(signUp).toHaveBeenLastCalledWith({
      email: 'a@b.co',
      password: '123456',
      options: { data: { full_name: 'Ana' } },
    });

    await api.signUp({ email: 'a@b.co', password: '123456', fullName: undefined });
    expect(signUp).toHaveBeenLastCalledWith({
      email: 'a@b.co',
      password: '123456',
      options: { data: {} },
    });
  });

  it('cadastro com erro devolve mensagem mapeada', async () => {
    const error = { code: 'user_already_exists', status: 422 };
    const { client } = fakeClient({ signUp: () => Promise.resolve({ data: {}, error }) });
    await expect(
      createSupabaseAuthApi(client).signUp({
        email: 'a@b.co',
        password: '123456',
        fullName: undefined,
      }),
    ).resolves.toEqual({ ok: false, message: signupErrorMessage(error) });
  });

  it('aceite chama a RPC com o token e devolve a empresa', async () => {
    const { client, rpc } = fakeClient();
    await expect(createSupabaseAuthApi(client).acceptInvitation('tok')).resolves.toEqual({
      ok: true,
      tenantId: 'tenant-1',
    });
    expect(rpc).toHaveBeenCalledWith('accept_invitation', { p_token: 'tok' });
  });

  it.each([
    ['23514', 'invalid'],
    ['23505', 'already-member'],
    ['42501', 'unauthenticated'],
    ['XX000', 'unknown'],
  ])('erro %s da RPC vira motivo %s', async (code, reason) => {
    const { client, rpc } = fakeClient();
    rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'detalhe interno' } } as never);
    const result = await createSupabaseAuthApi(client).acceptInvitation('tok');
    expect(result).toMatchObject({ ok: false, reason });
    expect(JSON.stringify(result)).not.toContain('detalhe interno');
  });

  it('retorno inesperado da RPC vira falha desconhecida', async () => {
    const { client, rpc } = fakeClient();
    rpc.mockResolvedValueOnce({ data: 42, error: null } as never);
    await expect(createSupabaseAuthApi(client).acceptInvitation('tok')).resolves.toMatchObject({
      ok: false,
      reason: 'unknown',
    });
  });
});
