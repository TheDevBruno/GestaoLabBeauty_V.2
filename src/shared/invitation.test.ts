import { describe, expect, it } from 'vitest';
import { createInvitationSchema, invitationTokenSchema } from './invitation';
import { memberRoles } from './roles';

describe('memberRoles', () => {
  it('tem os 6 papéis do enum member_role (RN-020)', () => {
    expect([...memberRoles]).toEqual([
      'owner',
      'admin',
      'manager',
      'specialist',
      'receptionist',
      'financial',
    ]);
  });
});

describe('createInvitationSchema', () => {
  it('aceita cada papel e normaliza o e-mail', () => {
    for (const role of memberRoles) {
      const result = createInvitationSchema.parse({ email: ' Nova@Example.test ', role });
      expect(result).toEqual({ email: 'nova@example.test', role });
    }
  });

  it('recusa papel desconhecido, ausente ou em outra caixa', () => {
    for (const role of ['platform_admin', 'Owner', '', undefined, 1]) {
      expect(createInvitationSchema.safeParse({ email: 'nova@example.test', role }).success).toBe(
        false,
      );
    }
  });

  it('recusa e-mail inválido ou ausente', () => {
    expect(createInvitationSchema.safeParse({ email: 'nova', role: 'admin' }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ role: 'admin' }).success).toBe(false);
  });

  it('não aceita campos extras como tenant_id (são ignorados na saída)', () => {
    const result = createInvitationSchema.parse({ email: 'a@b.co', role: 'admin', tenant_id: 'x' });
    expect(result).toEqual({ email: 'a@b.co', role: 'admin' });
  });
});

describe('invitationTokenSchema', () => {
  const valid = 'A'.repeat(43);

  it('aceita 43 caracteres base64url', () => {
    expect(invitationTokenSchema.safeParse(valid).success).toBe(true);
    expect(invitationTokenSchema.safeParse('a-_0'.repeat(10) + 'abc').success).toBe(true);
  });

  it.each([
    '',
    'A'.repeat(42),
    'A'.repeat(44),
    `${'A'.repeat(42)}=`,
    `${'A'.repeat(42)}+`,
    `${'A'.repeat(42)} `,
  ])('recusa token fora do formato %j', (token) => {
    expect(invitationTokenSchema.safeParse(token).success).toBe(false);
  });
});
