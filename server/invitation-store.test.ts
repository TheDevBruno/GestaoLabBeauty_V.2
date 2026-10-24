import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseInvitationStore } from './invitation-store';

interface QueryResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

// Cliente Supabase falso: registra a cadeia de chamadas do query builder e devolve `result` no await.
function fakeClient(result: QueryResult, getUser = vi.fn()) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['insert', 'update', 'select', 'single', 'eq', 'is', 'lte']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: QueryResult) => unknown) => resolve(result);
  const client = {
    from: (table: string) => {
      calls.push(['from', [table]]);
      return builder;
    },
    auth: { getUser },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const INVITATION = {
  tenantId: 'tenant-A',
  email: 'nova@example.test',
  role: 'admin' as const,
  tokenHash: 'a'.repeat(64),
  invitedBy: 'usuario-1',
};

describe('createSupabaseInvitationStore', () => {
  it('getUserId: valida o JWT no Auth com o cliente anônimo', async () => {
    const getUser = vi
      .fn()
      .mockResolvedValueOnce({ data: { user: { id: 'usuario-1' } }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: { message: 'invalid JWT' } });
    const auth = fakeClient({ data: null, error: null }, getUser);
    const admin = fakeClient({ data: null, error: null });
    const store = createSupabaseInvitationStore(auth.client, admin.client);

    expect(await store.getUserId('jwt-1')).toBe('usuario-1');
    expect(await store.getUserId('jwt-ruim')).toBeNull();
    expect(getUser).toHaveBeenCalledWith('jwt-1');
  });

  it('insert: grava as colunas do banco com o cliente admin e devolve id e validade', async () => {
    const auth = fakeClient({ data: null, error: null });
    const admin = fakeClient({
      data: { id: 'convite-1', expires_at: '2026-10-30T12:00:00+00:00' },
      error: null,
    });
    const store = createSupabaseInvitationStore(auth.client, admin.client);

    expect(await store.insert(INVITATION)).toEqual({
      ok: true,
      id: 'convite-1',
      expiresAt: '2026-10-30T12:00:00.000Z',
    });
    expect(admin.calls).toContainEqual(['from', ['invitations']]);
    expect(admin.calls).toContainEqual([
      'insert',
      [
        {
          tenant_id: 'tenant-A',
          email: 'nova@example.test',
          role: 'admin',
          token_hash: 'a'.repeat(64),
          invited_by: 'usuario-1',
        },
      ],
    ]);
    expect(auth.calls).toEqual([]);
  });

  it.each([
    [{ code: '42501', message: 'quem convida precisa de members.manage' }, 'forbidden'],
    [{ code: '23505', message: 'duplicate key ... "invitations_pending_email_key"' }, 'pending'],
  ])('insert: %o → %s', async (error, reason) => {
    const admin = fakeClient({ data: null, error });
    const store = createSupabaseInvitationStore(
      fakeClient({ data: null, error: null }).client,
      admin.client,
    );
    expect(await store.insert(INVITATION)).toEqual({ ok: false, reason });
  });

  it('insert: outro erro vira exceção sem a mensagem do Postgres', async () => {
    const admin = fakeClient({
      data: null,
      error: { code: '23505', message: 'duplicate key ... "invitations_token_hash_key"' },
    });
    const store = createSupabaseInvitationStore(
      fakeClient({ data: null, error: null }).client,
      admin.client,
    );
    const failure = store.insert(INVITATION);
    await expect(failure).rejects.toThrow(/código 23505/);
    await expect(failure).rejects.not.toThrow(/invitations_token_hash_key/);
  });

  it('revokeExpiredPending: só pendente expirado do e-mail na empresa', async () => {
    const admin = fakeClient({ data: [{ id: 'convite-velho' }], error: null });
    const store = createSupabaseInvitationStore(
      fakeClient({ data: null, error: null }).client,
      admin.client,
    );

    expect(await store.revokeExpiredPending('tenant-A', 'nova@example.test')).toBe(1);
    const names = admin.calls.map(([name, args]) => `${name}:${String(args[0])}`);
    expect(names).toEqual(
      expect.arrayContaining([
        'eq:tenant_id',
        'eq:email',
        'is:accepted_at',
        'is:revoked_at',
        'lte:expires_at',
      ]),
    );
  });
});
