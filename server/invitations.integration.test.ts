/// <reference types="vite/client" />
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiErrorSchema } from '../src/shared/api-error';
import { createInvitationResponseSchema } from '../src/shared/invitation';
import { parseServerEnv } from './env';
import { createAppFromEnv } from './main';
import { hashInvitationToken } from './token';

// Integração com o Supabase local: API real (createAppFromEnv) e banco real (trigger, índice de
// pendente, RLS e public.accept_invitation). As consultas de listar e revogar são as mesmas do
// adaptador do navegador (src/lib/invitations-api.ts), que server/ não importa (ARCHITECTURE.md).
// Só roda com `npm run test:integration` (modo "integration"); `npm test` e o CI a ignoram, porque
// exigem Docker. Pré-requisitos: `npm run db:start`, seed aplicado e as variáveis do servidor no
// .env.local. Grava dados sintéticos com e-mails únicos por execução: rode `npm run db:reset` antes do
// `npm run db:test`.

const RUN = import.meta.env.MODE === 'integration';

// Seed sintético da Sprint 1.2 (supabase/seed.sql). Senha só local, documentada em sprint-1.2.md.
const SEED_PASSWORD = 'senha-teste-labbeautypro';
const TENANT_A = '5eed0000-0000-0000-0000-000000000001';
const TENANT_B = '5eed0000-0000-0000-0000-000000000002';
const RUN_ID = randomUUID().slice(0, 8);
const PENDING_COLUMNS = 'id, email, role, expires_at, created_at';

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

const invitationRowSchema = z.object({
  email: z.string(),
  role: z.string(),
  token_hash: z.string(),
  invited_by: z.string(),
  revoked_at: z.string().nullable(),
  accepted_by: z.string().nullable(),
});

function makeClient(url: string, key: string) {
  return createClient(url, key, { auth: noSession });
}

type Client = ReturnType<typeof makeClient>;

describe.runIf(RUN)('convites ponta a ponta (Supabase local)', () => {
  // Montados no beforeAll: o corpo do describe roda mesmo quando a suíte é ignorada.
  let supabaseUrl: string;
  let anonKey: string;
  let app: ReturnType<typeof createAppFromEnv>;
  let admin: Client;

  async function signIn(email: string, password = SEED_PASSWORD) {
    const client = makeClient(supabaseUrl, anonKey);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`login de ${email} falhou: ${error.message} (seed aplicado?)`);
    return { client, userId: data.user.id, token: data.session.access_token };
  }

  async function post(token: string | null, body: unknown) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return app.request('/api/invitations', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  async function invitationRow(id: string) {
    const { data, error } = await admin
      .from('invitations')
      .select('email, role, token_hash, invited_by, revoked_at, accepted_by')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return invitationRowSchema.parse(data);
  }

  // Mesma consulta de InvitationsApi.listPending.
  async function listPending(client: Client, tenantId: string) {
    const { data, error } = await client
      .from('invitations')
      .select(PENDING_COLUMNS)
      .eq('tenant_id', tenantId)
      .is('accepted_at', null)
      .is('revoked_at', null);
    if (error) throw new Error(error.message);
    return z.array(z.object({ email: z.string() })).parse(data);
  }

  // Mesma escrita de InvitationsApi.revoke; devolve quantas linhas a RLS deixou mudar.
  async function revoke(client: Client, id: string) {
    const { data, error } = await client
      .from('invitations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .select('id');
    if (error) throw new Error(error.message);
    return z.array(z.unknown()).parse(data).length;
  }

  const email = (name: string) => `integ.${RUN_ID}.${name}@example.test`;

  let anaAdmin: Awaited<ReturnType<typeof signIn>>;
  let anaReceptionist: Awaited<ReturnType<typeof signIn>>;
  let belaAdmin: Awaited<ReturnType<typeof signIn>>;

  beforeAll(async () => {
    const env = loadEnv('integration', process.cwd(), '');
    const parsed = parseServerEnv(env);
    supabaseUrl = parsed.supabaseUrl;
    anonKey = parsed.anonKey;
    app = createAppFromEnv(env);
    admin = makeClient(supabaseUrl, parsed.serviceRoleKey);
    [anaAdmin, anaReceptionist, belaAdmin] = await Promise.all([
      signIn('ana.admin@example.test'),
      signIn('ana.receptionist@example.test'),
      signIn('bela.admin@example.test'),
    ]);
  });

  it('401 sem JWT e com JWT forjado', async () => {
    const body = { tenantId: TENANT_A, email: email('x'), role: 'manager' };
    expect((await post(null, body)).status).toBe(401);
    expect((await post('nao.e.um.jwt', body)).status).toBe(401);
  });

  it('criar, gravar só o hash e aceitar com a conta convidada', async () => {
    // E-mail com espaços e maiúsculas: o schema compartilhado normaliza antes de gravar.
    const invitee = email('aceite');
    const response = await post(anaAdmin.token, {
      tenantId: TENANT_A,
      email: `  ${invitee.toUpperCase()} `,
      role: 'manager',
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const created = createInvitationResponseSchema.parse(await response.json());
    const token = created.link.slice('/convite#'.length);

    const row = await invitationRow(created.id);
    expect(row).toMatchObject({ email: invitee, role: 'manager', invited_by: anaAdmin.userId });
    expect(row.token_hash).toBe(hashInvitationToken(token));
    expect(row.token_hash).not.toContain(token);

    // Lista sob RLS com o JWT do admin (colunas explícitas) mostra o convite.
    expect((await listPending(anaAdmin.client, TENANT_A)).map((p) => p.email)).toContain(invitee);

    // Conta convidada, com e-mail confirmado (RN-038), aceita pela RPC.
    const password = `Senha-${RUN_ID}-integ`;
    const { error: createUserError } = await admin.auth.admin.createUser({
      email: invitee,
      password,
      email_confirm: true,
    });
    expect(createUserError).toBeNull();
    const guest = await signIn(invitee, password);

    const accepted = await guest.client.rpc('accept_invitation', { p_token: token });
    expect(accepted.error).toBeNull();
    expect(accepted.data).toBe(TENANT_A);

    const { data: memberships } = await admin
      .from('memberships')
      .select('role')
      .eq('tenant_id', TENANT_A)
      .eq('user_id', guest.userId);
    expect(memberships).toEqual([{ role: 'manager' }]);
    expect((await invitationRow(created.id)).accepted_by).toBe(guest.userId);

    // Uso único: o mesmo token não serve de novo.
    const again = await guest.client.rpc('accept_invitation', { p_token: token });
    expect(again.error).not.toBeNull();
  });

  it('409 para pendente válido; expirado é revogado e substituído', async () => {
    const body = { tenantId: TENANT_A, email: email('repetido'), role: 'financial' };
    const first = await post(anaAdmin.token, body);
    expect(first.status).toBe(201);
    const { id: firstId } = createInvitationResponseSchema.parse(await first.json());

    const duplicate = await post(anaAdmin.token, body);
    expect(duplicate.status).toBe(409);
    expect(apiErrorSchema.parse(await duplicate.json()).code).toBe('invitation_pending');

    // Simula a passagem do tempo (constraint: expires_at > created_at).
    const { error: expireError } = await admin
      .from('invitations')
      .update({
        created_at: new Date(Date.now() - 8 * 86_400_000).toISOString(),
        expires_at: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .eq('id', firstId);
    expect(expireError).toBeNull();

    const replaced = await post(anaAdmin.token, body);
    expect(replaced.status).toBe(201);
    const { id: secondId } = createInvitationResponseSchema.parse(await replaced.json());
    expect(secondId).not.toBe(firstId);
    expect((await invitationRow(firstId)).revoked_at).not.toBeNull();
    expect((await invitationRow(secondId)).revoked_at).toBeNull();
  });

  it.each([
    ['admin pede papel owner (RN-022)', () => anaAdmin, TENANT_A, 'owner'],
    ['admin de outra empresa', () => anaAdmin, TENANT_B, 'manager'],
    ['recepção sem members.manage', () => anaReceptionist, TENANT_A, 'manager'],
  ] as const)('403: %s, nada gravado', async (_name, who, tenantId, role) => {
    const target = email(`negado-${role}-${tenantId.slice(-1)}`);
    const response = await post(who().token, { tenantId, email: target, role });
    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(await response.json()).code).toBe('forbidden');
    const { data } = await admin.from('invitations').select('id').eq('email', target);
    expect(data).toEqual([]);
  });

  it('RLS: token_hash ilegível, recepção não lista, outra empresa não revoga, admin revoga', async () => {
    const response = await post(anaAdmin.token, {
      tenantId: TENANT_A,
      email: email('revogar'),
      role: 'specialist',
    });
    const { id } = createInvitationResponseSchema.parse(await response.json());

    const hash = await anaAdmin.client.from('invitations').select('token_hash').eq('id', id);
    expect(hash.error?.code).toBe('42501');

    expect(await listPending(anaReceptionist.client, TENANT_A)).toEqual([]);

    expect(await revoke(belaAdmin.client, id)).toBe(0);
    expect((await invitationRow(id)).revoked_at).toBeNull();

    expect(await revoke(anaAdmin.client, id)).toBe(1);
    expect((await invitationRow(id)).revoked_at).not.toBeNull();
  });
});
