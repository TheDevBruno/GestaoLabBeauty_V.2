import { z } from 'zod';
import { parseBrlToCents } from './money';

// Limites da RN-040, iguais aos CHECKs de public.services (migration 20261025120000). O banco valida de
// novo: o schema só dá a mensagem certa junto ao campo antes de enviar.
export const SERVICE_NAME_MAX_LENGTH = 80;
export const SERVICE_DESCRIPTION_MAX_LENGTH = 500;
export const SERVICE_MINUTES_STEP = 5;
export const SERVICE_DURATION_MIN = 5;
export const SERVICE_DURATION_MAX = 720;
export const SERVICE_BUFFER_MAX = 240;

// Opções dos selects do formulário. O intervalo vai só até 60 min na interface (plano da Sprint 2.1);
// o banco aceita até 240 para não travar um ajuste futuro.
const SERVICE_BUFFER_UI_MAX = 60;

function stepsOf5(from: number, to: number): number[] {
  const values: number[] = [];
  for (let minutes = from; minutes <= to; minutes += SERVICE_MINUTES_STEP) {
    values.push(minutes);
  }
  return values;
}

export const serviceDurationOptions = stepsOf5(SERVICE_DURATION_MIN, SERVICE_DURATION_MAX);
export const serviceBufferOptions = stepsOf5(SERVICE_MINUTES_STEP, SERVICE_BUFFER_UI_MAX);

// 45 → "45 min", 60 → "1 h", 90 → "1 h 30 min".
export function formatMinutes(minutes: number): string {
  const hours = Math.trunc(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${String(rest)} min`;
  }
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}

// Os selects entregam texto; o campo vazio do intervalo é "Sem intervalo" (null no banco).
const minutesSchema = (min: number, max: number, message: string) =>
  z.coerce
    .number({ error: message })
    .int({ error: message })
    .min(min, { error: message })
    .max(max, { error: message })
    .multipleOf(SERVICE_MINUTES_STEP, { error: message });

const bufferSchema = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? null : value),
  minutesSchema(0, SERVICE_BUFFER_MAX, 'Escolha um intervalo válido.').nullable(),
);

export const serviceFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Informe o nome do serviço.' })
    .max(SERVICE_NAME_MAX_LENGTH, {
      error: `O nome deve ter no máximo ${String(SERVICE_NAME_MAX_LENGTH)} caracteres.`,
    }),
  description: z
    .string()
    .trim()
    .max(SERVICE_DESCRIPTION_MAX_LENGTH, {
      error: `A descrição deve ter no máximo ${String(SERVICE_DESCRIPTION_MAX_LENGTH)} caracteres.`,
    })
    .transform((value) => (value === '' ? null : value)),
  durationMinutes: minutesSchema(
    SERVICE_DURATION_MIN,
    SERVICE_DURATION_MAX,
    'Escolha uma duração válida.',
  ),
  bufferMinutes: bufferSchema,
  // Preço digitado em reais; sai em centavos (RN-032). A moeda fica no padrão BRL do banco.
  price: z.string().transform((value, ctx) => {
    const cents = parseBrlToCents(value);
    if (cents === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe um preço válido, por exemplo 120,00.',
      });
      return z.NEVER;
    }
    return cents;
  }),
  isActive: z.boolean(),
});

export type ServiceFormInput = z.input<typeof serviceFormSchema>;
export type ServiceFormOutput = z.output<typeof serviceFormSchema>;
