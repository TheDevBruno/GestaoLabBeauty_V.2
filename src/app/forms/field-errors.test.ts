import { describe, expect, it } from 'vitest';
import { signupSchema } from '@/shared/auth';
import { fieldErrorsFrom, firstInvalidField } from './field-errors';

describe('fieldErrorsFrom', () => {
  it('mapeia a primeira mensagem de cada campo', () => {
    const result = signupSchema.safeParse({ email: 'x', password: '1' });
    expect(result.success).toBe(false);
    const errors = result.success ? {} : fieldErrorsFrom(result.error);
    expect(errors.email).toBe('Informe um e-mail válido.');
    expect(errors.password).toContain('6');
    expect(errors.fullName).toBeUndefined();
  });
});

describe('firstInvalidField', () => {
  it('segue a ordem do formulário, não a ordem dos erros', () => {
    expect(
      firstInvalidField(['fullName', 'email', 'password'], { password: 'x', email: 'y' }),
    ).toBe('email');
  });

  it('sem erros, devolve null', () => {
    expect(firstInvalidField(['email'], {})).toBeNull();
  });
});
