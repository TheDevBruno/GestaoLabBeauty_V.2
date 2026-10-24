import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { type ApiErrorCode, apiErrorSchema } from '@/shared/api-error';
import { type CreateInvitationRequest, createInvitationResponseSchema } from '@/shared/invitation';
import { type MemberRole, memberRoles } from '@/shared/roles';

// Convites da empresa ativa. Criar passa pela API (/api/invitations, service role só no servidor);
// listar e revogar vão direto ao banco sob RLS com o JWT do usuário (members.manage).

export interface PendingInvitation {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: string;
  createdAt: string;
}

export type CreateInvitationResult =
  | { ok: true; id: string; link: string; expiresAt: string }
  | { ok: false; message: string; fieldErrors?: Partial<Record<string, string>> };

export interface InvitationsApi {
  listPending(tenantId: string): Promise<PendingInvitation[]>;
  create(input: CreateInvitationRequest): Promise<CreateInvitationResult>;
  revoke(invitationId: string): Promise<void>;
}

export class InvitationError extends Error {
  constructor(message = 'Não foi possível carregar os convites.') {
    super(message);
    this.name = 'InvitationError';
  }
}

// Mensagem da tela por código de erro da API; o texto do servidor não é repassado.
const CREATE_MESSAGES: Record<ApiErrorCode, string> = {
  unauthorized: 'Sua sessão expirou. Entre de novo para convidar.',
  forbidden: 'Você não tem permissão para convidar para este papel nesta empresa.',
  not_found: 'Não foi possível criar o convite. Tente de novo.',
  invalid_request: 'Confira os dados do convite.',
  payload_too_large: 'Confira os dados do convite.',
  invitation_pending:
    'Já existe um convite pendente para este e-mail. Revogue-o para enviar outro.',
  internal: 'Não foi possível criar o convite. Tente de novo em instantes.',
};

const NETWORK_MESSAGE = 'Sem conexão com o servidor. Confira sua internet e tente de novo.';

// Colunas listadas: token_hash não tem GRANT de SELECT e "select *" é negado (migration de invitations).
const pendingRowSchema = z.object({
  id: z.string().min(1),
  email: z.string(),
  role: z.enum(memberRoles),
  expires_at: z.string(),
  created_at: z.string(),
});

export function parsePendingRows(rows: unknown): PendingInvitation[] {
  const parsed = z.array(pendingRowSchema).safeParse(rows);
  if (!parsed.success) throw new InvitationError();
  return parsed.data.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

export async function parseCreateResponse(response: Response): Promise<CreateInvitationResult> {
  const body: unknown = await response.json().catch(() => undefined);
  if (response.status === 201) {
    const parsed = createInvitationResponseSchema.safeParse(body);
    if (parsed.success) return { ok: true, ...parsed.data };
    return { ok: false, message: CREATE_MESSAGES.internal };
  }
  const error = apiErrorSchema.safeParse(body);
  if (!error.success) return { ok: false, message: CREATE_MESSAGES.internal };
  const { code, details } = error.data;
  // details traz as mensagens do schema compartilhado (src/shared), as mesmas do formulário.
  return code === 'invalid_request' && details
    ? { ok: false, message: CREATE_MESSAGES[code], fieldErrors: details }
    : { ok: false, message: CREATE_MESSAGES[code] };
}

export function createSupabaseInvitationsApi(
  client: SupabaseClient,
  fetchFn: typeof fetch = (...args) => fetch(...args),
): InvitationsApi {
  return {
    async listPending(tenantId) {
      const response: { data: unknown; error: unknown } = await client
        .from('invitations')
        .select('id, email, role, expires_at, created_at')
        .eq('tenant_id', tenantId)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (response.error) throw new InvitationError();
      return parsePendingRows(response.data);
    },

    async create(input) {
      const { data } = await client.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return { ok: false, message: CREATE_MESSAGES.unauthorized };
      let response: Response;
      try {
        response = await fetchFn('/api/invitations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
        });
      } catch {
        return { ok: false, message: NETWORK_MESSAGE };
      }
      return parseCreateResponse(response);
    },

    async revoke(invitationId) {
      // A RLS só deixa revogar convite pendente da empresa de quem gerencia; linha nenhuma = negado.
      const response: { data: unknown; error: unknown } = await client
        .from('invitations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', invitationId)
        .select('id');
      if (response.error || !Array.isArray(response.data) || response.data.length === 0) {
        throw new InvitationError(
          'Não foi possível revogar o convite. Atualize a lista e tente de novo.',
        );
      }
    },
  };
}
