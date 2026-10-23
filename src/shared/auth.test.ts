import { describe, expect, it } from 'vitest';
import { loginSchema, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, signupSchema } from './auth';

describe('loginSchema', () => {
  it('aceita e-mail e senha e normaliza o e-mail', () => {
    const result = loginSchema.parse({ email: '  Ana@Example.TEST ', password: 'x' });
    expect(result).toEqual({ email: 'ana@example.test', password: 'x' });
  });

  it('não aparar nem alterar a senha', () => {
    const result = loginSchema.parse({ email: 'ana@example.test', password: '  espaço  ' });
    expect(result.password).toBe('  espaço  ');
  });

  it.each(['', 'sem-arroba', 'a@', '@b.com', 'a b@c.com'])('recusa e-mail inválido %j', (email) => {
    expect(loginSchema.safeParse({ email, password: 'x' }).success).toBe(false);
  });

  it('recusa senha vazia, sem revelar a política de tamanho', () => {
    const result = loginSchema.safeParse({ email: 'ana@example.test', password: '' });
    expect(result.success).toBe(false);
    expect(loginSchema.safeParse({ email: 'ana@example.test', password: '1' }).success).toBe(true);
  });
});

describe('signupSchema', () => {
  const base = { email: 'ana@example.test', password: 'abcdef' };

  it('aceita a senha no tamanho mínimo e no máximo (limites inclusivos)', () => {
    expect(
      signupSchema.safeParse({ ...base, password: 'a'.repeat(PASSWORD_MIN_LENGTH) }).success,
    ).toBe(true);
    expect(
      signupSchema.safeParse({ ...base, password: 'a'.repeat(PASSWORD_MAX_LENGTH) }).success,
    ).toBe(true);
  });

  it('recusa senha curta demais e longa demais', () => {
    expect(
      signupSchema.safeParse({ ...base, password: 'a'.repeat(PASSWORD_MIN_LENGTH - 1) }).success,
    ).toBe(false);
    expect(
      signupSchema.safeParse({ ...base, password: 'a'.repeat(PASSWORD_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it('mensagem de senha curta cita o mínimo', () => {
    const result = signupSchema.safeParse({ ...base, password: 'abc' });
    expect(result.error?.issues[0]?.message).toContain('6');
  });

  it('o nome é opcional; vazio ou só espaços vira ausente', () => {
    expect(signupSchema.parse(base).fullName).toBeUndefined();
    expect(signupSchema.parse({ ...base, fullName: '' }).fullName).toBeUndefined();
    expect(signupSchema.parse({ ...base, fullName: '   ' }).fullName).toBeUndefined();
  });

  it('apara o nome e limita a 120 caracteres', () => {
    expect(signupSchema.parse({ ...base, fullName: '  Ana Souza ' }).fullName).toBe('Ana Souza');
    expect(signupSchema.safeParse({ ...base, fullName: 'a'.repeat(120) }).success).toBe(true);
    expect(signupSchema.safeParse({ ...base, fullName: 'a'.repeat(121) }).success).toBe(false);
  });

  it('recusa e-mail inválido', () => {
    expect(signupSchema.safeParse({ ...base, email: 'ana' }).success).toBe(false);
  });
});
