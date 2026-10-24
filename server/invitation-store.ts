import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { MemberRole } from '../src/shared/roles';

// Porta de acesso a dados da API de convites. A rota só conhece este contrato, o que permite testá-la
// com uma implementação em memória, sem Supabase.

export interface NewInvitation {
  tenantId: string;
  email: string;
  role: MemberRole;
  tokenHash: string;
  invitedBy: string;
}

export type InsertInvitationResult =
  | { ok: true; id: string; expiresAt: string }
  // forbidden: o trigger de invitations negou quem convida (42501, RN-022/RN-026).
  // pending: já existe convite pendente para o e-mail na empresa (índice parcial, 23505).
  // member: o e-mail já é de um membro da empresa (trigger invitations_check_not_member, 23505; RN-039).
  | { ok: false; reason: 'forbidden' | 'pending' | 'member' };

export interface InvitationStore {
  // Valida o JWT do usuário no Auth do Supabase. null = token ausente, inválido ou expirado.
  getUserId(accessToken: string): Promise<string | null>;
  insert(invitation: NewInvitation): Promise<InsertInvitationResult>;
  // Revoga o convite pendente já expirado do e-mail na empresa. Devolve quantos foram revogados.
  revokeExpiredPending(tenantId: string, email: string): Promise<number>;
}

interface PostgrestResponse {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

const insertedRowSchema = z.object({ id: z.string(), expires_at: z.string() });
const revokedRowsSchema = z.array(z.object({ id: z.string() }));

// Erros inesperados do banco viram exceção genérica: a mensagem do Postgres não sai do servidor.
class StoreError extends Error {
  constructor(operation: string, code: string | undefined) {
    super(`Falha no banco ao ${operation} (código ${code ?? 'desconhecido'}).`);
    this.name = 'StoreError';
  }
}

// authClient usa a chave anônima (só valida o JWT); adminClient usa a service role e ignora a RLS, por
// isso só grava o que a rota já validou. O trigger de invitations confere quem convida mesmo assim.
export function createSupabaseInvitationStore(
  authClient: SupabaseClient,
  adminClient: SupabaseClient,
): InvitationStore {
  return {
    async getUserId(accessToken) {
      const { data, error } = await authClient.auth.getUser(accessToken);
      if (error) return null;
      return data.user.id;
    },

    async insert(invitation) {
      const response: PostgrestResponse = await adminClient
        .from('invitations')
        .insert({
          tenant_id: invitation.tenantId,
          email: invitation.email,
          role: invitation.role,
          token_hash: invitation.tokenHash,
          invited_by: invitation.invitedBy,
        })
        .select('id, expires_at')
        .single();

      if (response.error) {
        const { code, message = '' } = response.error;
        if (code === '42501') return { ok: false, reason: 'forbidden' };
        if (code === '23505' && message.includes('invitations_pending_email_key')) {
          return { ok: false, reason: 'pending' };
        }
        if (code === '23505' && message.startsWith('invitations_email_already_member')) {
          return { ok: false, reason: 'member' };
        }
        throw new StoreError('criar convite', code);
      }

      const row = insertedRowSchema.parse(response.data);
      return { ok: true, id: row.id, expiresAt: new Date(row.expires_at).toISOString() };
    },

    async revokeExpiredPending(tenantId, email) {
      const now = new Date().toISOString();
      const response: PostgrestResponse = await adminClient
        .from('invitations')
        .update({ revoked_at: now })
        .eq('tenant_id', tenantId)
        .eq('email', email)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .lte('expires_at', now)
        .select('id');

      if (response.error) throw new StoreError('revogar convite expirado', response.error.code);
      return revokedRowsSchema.parse(response.data).length;
    },
  };
}
