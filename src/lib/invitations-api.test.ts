import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  createSupabaseInvitationsApi,
  InvitationError,
  parseCreateResponse,
  parsePendingRows,
} from './invitations-api';

const TOKEN = 'a'.repeat(43);
const REQUEST = {
  tenantId: '00000000-0000-4000-8000-00000000000a',
  email: 'nova@example.test',
  role: 'admin' as const,
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface QueryResult {
  data: unknown;
  error: unknown;
}

// Cliente Supabase falso: registra a cadeia do query builder e devolve `result` no await.
function fakeClient(result: QueryResult, accessToken: string | null = 'jwt-do-usuario') {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'update', 'eq', 'is', 'order']) {
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
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: accessToken ? { access_token: accessToken } : null },
          error: null,
        }),
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe('parseCreateResponse', () => {
  it('201 válido → link e validade', async () => {
    const result = await parseCreateResponse(
      json(201, {
        id: '00000000-0000-4000-8000-000000000001',
        link: `/convite#${TOKEN}`,
        expiresAt: '2026-10-30T12:00:00.000Z',
      }),
    );
    expect(result).toEqual({
      ok: true,
      id: '00000000-0000-4000-8000-000000000001',
      link: `/convite#${TOKEN}`,
      expiresAt: '2026-10-30T12:00:00.000Z',
    });
  });

  it('201 fora do contrato → erro genérico', async () => {
    const result = await parseCreateResponse(json(201, { id: 'x', link: '/outro' }));
    expect(result.ok).toBe(false);
  });

  it.each([
    [401, 'unauthorized', /sessão expirou/],
    [403, 'forbidden', /permissão/],
    [409, 'invitation_pending', /convite pendente/],
    [409, 'already_member', /já faz parte da equipe/],
    [500, 'internal', /Tente de novo/],
  ])('%i %s → mensagem própria, sem repassar a do servidor', async (status, code, pattern) => {
    const result = await parseCreateResponse(
      json(status, { code, message: 'texto cru do servidor' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(pattern);
    expect(result.message).not.toContain('texto cru');
  });

  it('400 com details → erros de campo', async () => {
    const result = await parseCreateResponse(
      json(400, {
        code: 'invalid_request',
        message: 'x',
        details: { email: 'Informe um e-mail válido.' },
      }),
    );
    expect(result).toEqual({
      ok: false,
      message: 'Confira os dados do convite.',
      fieldErrors: { email: 'Informe um e-mail válido.' },
    });
  });

  it('corpo que não é JSON → erro genérico', async () => {
    const result = await parseCreateResponse(new Response('<html>502</html>', { status: 502 }));
    expect(result.ok).toBe(false);
  });
});

describe('createSupabaseInvitationsApi', () => {
  it('create: POST /api/invitations com o JWT do usuário', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        json(201, {
          id: '00000000-0000-4000-8000-000000000001',
          link: `/convite#${TOKEN}`,
          expiresAt: '2026-10-30T12:00:00.000Z',
        }),
      ),
    );
    const api = createSupabaseInvitationsApi(
      fakeClient({ data: null, error: null }).client,
      fetchFn,
    );

    expect((await api.create(REQUEST)).ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/invitations');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer jwt-do-usuario');
    expect(JSON.parse(init?.body as string)).toEqual(REQUEST);
  });

  it('create sem sessão: não chama a API', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const api = createSupabaseInvitationsApi(
      fakeClient({ data: null, error: null }, null).client,
      fetchFn,
    );
    const result = await api.create(REQUEST);
    expect(result.ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('create com falha de rede → mensagem de conexão', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch')));
    const api = createSupabaseInvitationsApi(
      fakeClient({ data: null, error: null }).client,
      fetchFn,
    );
    const result = await api.create(REQUEST);
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/conexão/) as unknown });
  });

  it('listPending: colunas explícitas (sem token_hash), só pendentes da empresa', async () => {
    const { client, calls } = fakeClient({
      data: [
        {
          id: 'c1',
          email: 'bia@example.test',
          role: 'manager',
          expires_at: '2026-10-30T12:00:00+00:00',
          created_at: '2026-10-23T12:00:00+00:00',
        },
      ],
      error: null,
    });
    const rows = await createSupabaseInvitationsApi(client).listPending('tenant-A');
    expect(rows).toEqual([
      {
        id: 'c1',
        email: 'bia@example.test',
        role: 'manager',
        expiresAt: '2026-10-30T12:00:00+00:00',
        createdAt: '2026-10-23T12:00:00+00:00',
      },
    ]);
    const select = calls.find(([name]) => name === 'select');
    expect(String(select?.[1][0])).not.toMatch(/token_hash|\*/);
    expect(calls).toContainEqual(['eq', ['tenant_id', 'tenant-A']]);
    expect(calls).toContainEqual(['is', ['accepted_at', null]]);
    expect(calls).toContainEqual(['is', ['revoked_at', null]]);
  });

  it('listPending com erro → InvitationError', async () => {
    const api = createSupabaseInvitationsApi(
      fakeClient({ data: null, error: { code: '42501' } }).client,
    );
    await expect(api.listPending('tenant-A')).rejects.toBeInstanceOf(InvitationError);
  });

  it('revoke: atualiza só revoked_at; nenhuma linha afetada (RLS) é erro', async () => {
    const ok = fakeClient({ data: [{ id: 'c1' }], error: null });
    await createSupabaseInvitationsApi(ok.client).revoke('c1');
    const update = ok.calls.find(([name]) => name === 'update');
    expect(Object.keys(update?.[1][0] as object)).toEqual(['revoked_at']);
    expect(ok.calls).toContainEqual(['eq', ['id', 'c1']]);

    const denied = fakeClient({ data: [], error: null });
    await expect(createSupabaseInvitationsApi(denied.client).revoke('c1')).rejects.toBeInstanceOf(
      InvitationError,
    );
  });
});

describe('parsePendingRows', () => {
  it('papel fora do enum → InvitationError', () => {
    expect(() =>
      parsePendingRows([
        { id: 'c1', email: 'x@example.test', role: 'root', expires_at: 'a', created_at: 'b' },
      ]),
    ).toThrow(InvitationError);
  });
});
