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
