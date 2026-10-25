import { z } from 'zod';
import { parsePhoneToE164 } from './phone';

// Limites da RN-045, iguais aos CHECKs de public.clients (migration 20261025140000). O banco valida de
// novo: o schema só dá a mensagem certa junto ao campo antes de enviar.
export const CLIENT_NAME_MAX_LENGTH = 120;
export const CLIENT_EMAIL_MAX_LENGTH = 254;
export const CLIENT_BIRTH_DATE_MIN = '1900-01-01';

// Mesmo limite que public.search_clients aplica ao termo (RN-047).
export const CLIENT_SEARCH_MAX_LENGTH = 100;

// Forma mínima que o CHECK clients_email_format exige; z.email() é mais estrito e roda antes.
const DB_EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const emailSchema = z.email();

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Data de hoje no fuso do navegador, em AAAA-MM-DD (o mesmo formato do campo type="date").
export function todayIsoDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

// "2026-02-30" tem o formato certo mas não existe; a volta pelo Date.UTC descarta esses casos.
function isCalendarDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) {
    return false;
  }
  const [, year = '', month = '', day = ''] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

// Campos opcionais chegam como texto do formulário; vazio vira null no banco.
const emptyToNull = (value: string) => (value === '' ? null : value);

export const clientFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, { error: 'Informe o nome do cliente.' })
    .max(CLIENT_NAME_MAX_LENGTH, {
      error: `O nome deve ter no máximo ${String(CLIENT_NAME_MAX_LENGTH)} caracteres.`,
    }),
  // Digitado no formato brasileiro; sai em E.164.
  phone: z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === '') {
        return null;
      }
      const e164 = parsePhoneToE164(value);
      if (e164 === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'Informe um telefone com DDD, por exemplo (11) 98765-4321.',
        });
        return z.NEVER;
      }
      return e164;
    }),
  // Gravado em minúsculas, como o banco exige.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(CLIENT_EMAIL_MAX_LENGTH, {
      error: `O e-mail deve ter no máximo ${String(CLIENT_EMAIL_MAX_LENGTH)} caracteres.`,
    })
    .refine(
      (value) =>
        value === '' || (emailSchema.safeParse(value).success && DB_EMAIL_PATTERN.test(value)),
      { error: 'Informe um e-mail válido, por exemplo nome@exemplo.com.' },
    )
    .transform(emptyToNull),
  // Campo type="date": "AAAA-MM-DD" ou vazio. De 1900-01-01 até hoje (o "até hoje" fica só aqui).
  birthDate: z
    .string()
    .trim()
    .refine((value) => value === '' || isCalendarDate(value), {
      error: 'Informe uma data válida.',
    })
    .refine((value) => value === '' || !isCalendarDate(value) || value >= CLIENT_BIRTH_DATE_MIN, {
      error: 'A data de nascimento deve ser a partir de 01/01/1900.',
    })
    .refine((value) => value === '' || !isCalendarDate(value) || value <= todayIsoDate(), {
      error: 'A data de nascimento não pode ser no futuro.',
    })
    .transform(emptyToNull),
  isActive: z.boolean(),
});

export type ClientFormInput = z.input<typeof clientFormSchema>;
export type ClientFormOutput = z.output<typeof clientFormSchema>;

// "1990-03-15" → "15/03/1990". Texto fora do formato volta como está.
export function formatBirthDate(isoDate: string): string {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (match === null) {
    return isoDate;
  }
  const [, year = '', month = '', day = ''] = match;
  return `${day}/${month}/${year}`;
}

// Termo da busca como vai para a URL (?q=) e para search_clients: sem espaços nas pontas, espaços
// repetidos reduzidos a um e no máximo CLIENT_SEARCH_MAX_LENGTH caracteres. Acento e maiúsculas ficam
// com o banco (RN-047), que normaliza com unaccent.
export function normalizeClientSearch(input: string): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, CLIENT_SEARCH_MAX_LENGTH).trimEnd();
}
