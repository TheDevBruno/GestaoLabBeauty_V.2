// Validação do slug do portal público /{slug} — RN-017 e ADR-004 §1–§2.
// A unicidade entre empresas é garantida pelo banco (tenants.slug único), não aqui.
import { z } from 'zod';

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 30;

// Toda rota nova do sistema na raiz precisa entrar nesta lista, na RN-017 e no CHECK
// tenants_slug_not_reserved (migration nova em supabase/migrations/).
export const RESERVED_SLUGS = [
  'app',
  'admin',
  'api',
  'assets',
  'auth',
  'login',
  'logout',
  'signup',
  'cadastro',
  'entrar',
  'sair',
  'convite',
  'onboarding',
  'www',
  'static',
  'public',
  'docs',
  'help',
  'ajuda',
  'suporte',
  'status',
  'settings',
  'conta',
  'labbeautypro',
] as const;

const reserved = new Set<string>(RESERVED_SLUGS);

// Blocos de [a-z0-9] separados por um único hífen: sem hífen no início, no fim ou duplo.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string()
  .min(SLUG_MIN_LENGTH, { error: `Use pelo menos ${String(SLUG_MIN_LENGTH)} caracteres.` })
  .max(SLUG_MAX_LENGTH, { error: `Use no máximo ${String(SLUG_MAX_LENGTH)} caracteres.` })
  .regex(SLUG_PATTERN, {
    error: 'Use só letras minúsculas, números e hífen, sem hífen no início, no fim ou repetido.',
  })
  .refine((slug) => !reserved.has(slug), { error: 'Este endereço é reservado pelo sistema.' });

export type SlugError = 'format' | 'too_short' | 'too_long' | 'reserved';

export type SlugResult = { ok: true; slug: string } | { ok: false; reason: SlugError };

export function validateSlug(input: string): SlugResult {
  const result = slugSchema.safeParse(input);
  if (result.success) return { ok: true, slug: result.data };

  // O Zod lista os problemas na ordem das regras acima; o primeiro define o motivo.
  switch (result.error.issues[0]?.code) {
    case 'too_small':
      return { ok: false, reason: 'too_short' };
    case 'too_big':
      return { ok: false, reason: 'too_long' };
    case 'custom':
      return { ok: false, reason: 'reserved' };
    default:
      return { ok: false, reason: 'format' };
  }
}
