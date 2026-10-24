import { z } from 'zod';
import { emailSchema } from './auth';
import { memberRoles } from './roles';

// Token de convite: 32 bytes aleatórios em base64url, sem preenchimento (43 caracteres). Só o hash dele
// vai para o banco (RN-026). O formato fica aqui para o servidor gerar e o cliente validar igual.
export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const invitationTokenSchema = z.string().regex(INVITATION_TOKEN_PATTERN, {
  error: 'Convite inválido.',
});

// O schema aceita qualquer papel, inclusive owner. Quem pode convidar para owner é decidido pelo banco
// (trigger de invitations) e pela API; a RLS e o trigger valem mesmo se o cliente for adulterado (RN-022).
export const createInvitationSchema = z.object({
  email: emailSchema,
  role: z.enum(memberRoles, { error: 'Escolha um papel válido.' }),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

// Corpo de POST /api/invitations: o formulário mais a empresa ativa. O servidor confere no banco
// (trigger de invitations) se quem chama gerencia essa empresa; o tenantId do cliente não é confiável.
// z.guid e não z.uuid: o tipo uuid do Postgres aceita qualquer valor 8-4-4-4-12 em hexadecimal, sem
// exigir versão RFC (os ids do seed, por exemplo, não têm).
export const createInvitationRequestSchema = createInvitationSchema.extend({
  tenantId: z.guid({ error: 'Empresa inválida.' }),
});

export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

// Resposta 201. O token só aparece aqui, dentro do link (no fragmento, que não vai ao servidor).
export const createInvitationResponseSchema = z.object({
  id: z.guid(),
  link: z.string().regex(/^\/convite#[A-Za-z0-9_-]{43}$/),
  expiresAt: z.iso.datetime({ offset: true }),
});

export type CreateInvitationResponse = z.infer<typeof createInvitationResponseSchema>;

export function invitationLink(token: string): string {
  return `/convite#${token}`;
}
