import { describe, expect, it } from 'vitest';
import { INVITATION_TOKEN_PATTERN, invitationTokenSchema } from '../src/shared/invitation';
import { generateInvitationToken, hashInvitationToken } from './token';

describe('token do convite', () => {
  it('32 bytes em base64url sem preenchimento, aceito pelo schema do cliente', () => {
    for (let i = 0; i < 50; i += 1) {
      const token = generateInvitationToken();
      expect(token).toMatch(INVITATION_TOKEN_PATTERN);
      expect(invitationTokenSchema.safeParse(token).success).toBe(true);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    }
  });

  it('hash igual ao do banco: sha-256 em hexadecimal minúsculo', () => {
    // Vetor conhecido do sha-256 ("abc"), o mesmo que encode(sha256('abc'), 'hex') no Postgres.
    expect(hashInvitationToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(hashInvitationToken(generateInvitationToken())).toMatch(/^[0-9a-f]{64}$/);
  });
});
