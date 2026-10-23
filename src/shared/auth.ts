import { z } from 'zod';

// Mínimo de 6 caracteres, igual a minimum_password_length do Supabase local (decisão de 2026-10-23).
// 72 é o limite do bcrypt usado pelo Auth: acima disso a senha seria truncada em silêncio.
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 72;

// E-mail sempre aparado e em minúsculas, como a tabela invitations o guarda (RN-026).
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Informe um e-mail válido.' }));

const fullNameSchema = z
  .string()
  .trim()
  .max(120, { error: 'O nome deve ter no máximo 120 caracteres.' })
  .optional()
  .transform((value) => (value === undefined || value === '' ? undefined : value));

// No login só se exige senha preenchida: a regra de tamanho não é repetida para não revelar a política.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Informe a senha.' }),
});

export const signupSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, {
      error: `A senha deve ter ao menos ${String(PASSWORD_MIN_LENGTH)} caracteres.`,
    })
    .max(PASSWORD_MAX_LENGTH, {
      error: `A senha deve ter no máximo ${String(PASSWORD_MAX_LENGTH)} caracteres.`,
    }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
