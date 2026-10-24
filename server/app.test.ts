import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorSchema } from '../src/shared/api-error';
import { createInvitationResponseSchema, INVITATION_TOKEN_PATTERN } from '../src/shared/invitation';
import { createApp } from './app';
import type { InsertInvitationResult, InvitationStore, NewInvitation } from './invitation-store';
import { hashInvitationToken } from './token';

// Formato dos ids do seed: uuid válido no Postgres, mas sem versão RFC (regressão: z.uuid recusava).
const TENANT_ID = '5eed0000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000101';
const VALID_JWT = 'jwt-valido';
const EXPIRES_AT = '2026-10-30T12:00:00.000Z';

// Store em memória: simula o Auth (só VALID_JWT é aceito) e as respostas do banco.
function createFakeStore(results: InsertInvitationResult[] = [], revoked = 0) {
  const inserted: NewInvitation[] = [];
  const store = {
    getUserId: vi.fn<InvitationStore['getUserId']>((token) =>
      Promise.resolve(token === VALID_JWT ? USER_ID : null),
    ),
    insert: vi.fn<InvitationStore['insert']>((invitation) => {
      inserted.push(invitation);
      return Promise.resolve(
        results.shift() ?? {
          ok: true,
          id: '00000000-0000-4000-8000-000000000001',
          expiresAt: EXPIRES_AT,
        },
      );
    }),
    revokeExpiredPending: vi.fn<InvitationStore['revokeExpiredPending']>(() =>
      Promise.resolve(revoked),
    ),
  } satisfies InvitationStore;
  return { store, inserted };
}

function post(
  app: ReturnType<typeof createApp>,
  body: unknown,
  headers: Record<string, string> = { Authorization: `Bearer ${VALID_JWT}` },
) {
  return app.request('/api/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const VALID_BODY = { tenantId: TENANT_ID, email: '  Nova@Example.TEST ', role: 'receptionist' };

async function errorBody(response: Response) {
  return apiErrorSchema.parse(await response.json());
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/invitations — autenticação', () => {
  it.each([
    ['sem Authorization', {}],
    ['esquema diferente de Bearer', { Authorization: `Basic ${VALID_JWT}` }],
    ['JWT inválido', { Authorization: 'Bearer outro-jwt' }],
  ])('%s → 401 e nada gravado', async (_name, headers) => {
    const { store } = createFakeStore();
    const response = await post(createApp({ store }), VALID_BODY, headers);
    expect(response.status).toBe(401);
    expect((await errorBody(response)).code).toBe('unauthorized');
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('valida o JWT antes do corpo', async () => {
    const { store } = createFakeStore();
    const response = await post(createApp({ store }), 'isto não é json', {});
    expect(response.status).toBe(401);
  });
});

describe('POST /api/invitations — validação do corpo', () => {
  it.each([
    ['JSON malformado (sem campo a apontar)', '{"email":', []],
    ['objeto vazio', {}, ['tenantId', 'email', 'role']],
    ['e-mail inválido', { ...VALID_BODY, email: 'sem-arroba' }, ['email']],
    ['papel desconhecido', { ...VALID_BODY, role: 'superadmin' }, ['role']],
    ['empresa que não é uuid', { ...VALID_BODY, tenantId: 'tenant-A' }, ['tenantId']],
  ])('%s → 400 com o campo em details', async (_name, body, fields) => {
    const { store } = createFakeStore();
    const response = await post(createApp({ store }), body);
    expect(response.status).toBe(400);
    const error = await errorBody(response);
    expect(error.code).toBe('invalid_request');
    expect(Object.keys(error.details ?? {}).sort()).toEqual([...fields].sort());
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('corpo acima de 16 KiB → 413', async () => {
    const { store } = createFakeStore();
    const response = await post(createApp({ store }), { ...VALID_BODY, extra: 'x'.repeat(17_000) });
    expect(response.status).toBe(413);
    expect((await errorBody(response)).code).toBe('payload_too_large');
  });
});

describe('POST /api/invitations — criação', () => {
  it('201 com link de token de 32 bytes; grava só o sha-256, e-mail normalizado e quem convida', async () => {
    const { store, inserted } = createFakeStore();
    const response = await post(createApp({ store }), VALID_BODY);

    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = createInvitationResponseSchema.parse(await response.json());
    expect(body.expiresAt).toBe(EXPIRES_AT);

    const token = body.link.slice('/convite#'.length);
    expect(token).toMatch(INVITATION_TOKEN_PATTERN);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);

    expect(inserted).toEqual([
      {
        tenantId: TENANT_ID,
        email: 'nova@example.test',
        role: 'receptionist',
        tokenHash: hashInvitationToken(token),
        invitedBy: USER_ID,
      },
    ]);
    expect(inserted[0]?.tokenHash).not.toContain(token);
  });

  it('tokens diferentes a cada convite', async () => {
    const { store } = createFakeStore();
    const app = createApp({ store });
    const links = await Promise.all(
      [1, 2, 3].map(async () => {
        const response = await post(app, VALID_BODY);
        return createInvitationResponseSchema.parse(await response.json()).link;
      }),
    );
    expect(new Set(links).size).toBe(3);
  });

  it('trigger nega quem convida (42501) → 403', async () => {
    const { store } = createFakeStore([{ ok: false, reason: 'forbidden' }]);
    const response = await post(createApp({ store }), { ...VALID_BODY, role: 'owner' });
    expect(response.status).toBe(403);
    expect((await errorBody(response)).code).toBe('forbidden');
    expect(store.revokeExpiredPending).not.toHaveBeenCalled();
  });

  it('pendente válido (23505 sem expirado) → 409, sem nova tentativa', async () => {
    const { store } = createFakeStore([{ ok: false, reason: 'pending' }], 0);
    const response = await post(createApp({ store }), VALID_BODY);
    expect(response.status).toBe(409);
    expect((await errorBody(response)).code).toBe('invitation_pending');
    expect(store.revokeExpiredPending).toHaveBeenCalledWith(TENANT_ID, 'nova@example.test');
    expect(store.insert).toHaveBeenCalledTimes(1);
  });

  it('e-mail de quem já é membro (RN-039) → 409 already_member, sem revogar nem repetir', async () => {
    const { store } = createFakeStore([{ ok: false, reason: 'member' }]);
    const response = await post(createApp({ store }), VALID_BODY);
    expect(response.status).toBe(409);
    expect((await errorBody(response)).code).toBe('already_member');
    expect(store.revokeExpiredPending).not.toHaveBeenCalled();
    expect(store.insert).toHaveBeenCalledTimes(1);
  });

  it('pendente expirado: revoga e cria o novo (201)', async () => {
    const { store, inserted } = createFakeStore([{ ok: false, reason: 'pending' }], 1);
    const response = await post(createApp({ store }), VALID_BODY);
    expect(response.status).toBe(201);
    expect(store.revokeExpiredPending).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(2);
    expect(inserted[1]).toEqual(inserted[0]);
  });
});

describe('Erros da API (ADR-002 §5)', () => {
  it('falha inesperada → 500 genérico, sem stack nem SQL', async () => {
    const { store } = createFakeStore();
    store.insert.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint "invitations_token_hash_key"'),
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await post(createApp({ store }), VALID_BODY);
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(apiErrorSchema.parse(JSON.parse(text)).code).toBe('internal');
    expect(text).not.toMatch(/invitations|constraint|stack|at /);
    expect(log).toHaveBeenCalled();
  });

  it('rota desconhecida → 404 no mesmo formato', async () => {
    const { store } = createFakeStore();
    const response = await createApp({ store }).request('/api/nada');
    expect(response.status).toBe(404);
    expect((await errorBody(response)).code).toBe('not_found');
  });

  it('GET em /api/invitations não existe (listar é direto sob RLS)', async () => {
    const { store } = createFakeStore();
    const response = await createApp({ store }).request('/api/invitations', {
      headers: { Authorization: `Bearer ${VALID_JWT}` },
    });
    expect(response.status).toBe(404);
  });
});
