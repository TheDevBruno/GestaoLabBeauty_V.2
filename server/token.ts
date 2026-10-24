import { createHash, randomBytes } from 'node:crypto';

// Token do convite: 32 bytes aleatórios em base64url sem preenchimento (43 caracteres, igual a
// INVITATION_TOKEN_PATTERN em src/shared/invitation.ts).
export function generateInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

// sha-256 em hexadecimal, o mesmo que public.accept_invitation calcula no banco
// (encode(sha256(convert_to(token, 'utf8')), 'hex')). Só o hash é gravado (RN-026).
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
