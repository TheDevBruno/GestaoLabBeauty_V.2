import { z } from 'zod';
import { addDaysIso, daysBetweenIso, isIsoDate, zonedToUtc } from './timezone';

// Limites da RN-049 e da RN-050, iguais aos CHECKs e às funções da migration 20261025160000. O banco
// valida de novo: o schema só dá a mensagem certa junto ao campo antes de enviar.
export const AVAILABILITY_STEP_MINUTES = 5;
export const AVAILABILITY_MAX_RULES = 70;
export const EXCEPTION_REASON_MAX_LENGTH = 120;
export const EXCEPTION_MAX_DAYS = 366;
// Mesmo limite de public.professional_availability (RN-052).
export const AVAILABILITY_MAX_RANGE_DAYS = 62;

// Dia da semana ISO, como availability_rules.weekday: 1 = segunda … 7 = domingo.
export const WEEKDAYS = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
] as const;

export type Weekday = (typeof WEEKDAYS)[number]['value'];

export function weekdayLabel(weekday: number): string {
  return WEEKDAYS.find((day) => day.value === weekday)?.label ?? '';
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;

// "HH:MM" de 00:00 a 24:00 → minutos desde a meia-noite; fora do formato → null.
export function timeToMinutes(value: string): number | null {
  if (!TIME_PATTERN.test(value)) {
    return null;
  }
  const [hour = '', minute = ''] = value.split(':');
  return Number(hour) * 60 + Number(minute);
}

// Campo type="time" com step de 5 minutos. "24:00" (até a meia-noite) só faz sentido como fim; o
// "início antes do fim" já impede que seja início.
const timeFieldSchema = z
  .string()
  .trim()
  .refine((value) => timeToMinutes(value) !== null, {
    error: 'Informe a hora no formato HH:MM.',
  })
  .refine(
    (value) => {
      const minutes = timeToMinutes(value);
      return minutes === null || minutes % AVAILABILITY_STEP_MINUTES === 0;
    },
    { error: 'Use horários de 5 em 5 minutos.' },
  );

const weeklyIntervalSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    start: timeFieldSchema,
    end: timeFieldSchema,
  })
  .refine(
    ({ start, end }) => {
      const startMinutes = timeToMinutes(start);
      const endMinutes = timeToMinutes(end);
      return startMinutes === null || endMinutes === null || startMinutes < endMinutes;
    },
    { error: 'O fim deve ser depois do início.', path: ['end'] },
  );

export type WeeklyIntervalInput = z.input<typeof weeklyIntervalSchema>;

// Linha que public.set_availability_rules recebe no array p_rules.
export interface AvailabilityRuleRow {
  weekday: number;
  start_time: string;
  end_time: string;
}

// A semana inteira, como a tela salva (RN-049): intervalos sem sobreposição no mesmo dia (encostados
// passam). O erro de sobreposição fica no intervalo que começa depois, no campo "Início". Sai no formato
// de p_rules, em ordem de dia e de início.
export const weeklyRulesSchema = z
  .array(weeklyIntervalSchema)
  .max(AVAILABILITY_MAX_RULES, {
    error: `Cadastre no máximo ${String(AVAILABILITY_MAX_RULES)} intervalos na semana.`,
  })
  .superRefine((intervals, ctx) => {
    const byDay = new Map<number, { index: number; start: number; end: number }[]>();
    intervals.forEach((interval, index) => {
      const start = timeToMinutes(interval.start);
      const end = timeToMinutes(interval.end);
      if (start === null || end === null || start >= end) {
        return;
      }
      const day = byDay.get(interval.weekday) ?? [];
      day.push({ index, start, end });
      byDay.set(interval.weekday, day);
    });
    for (const [weekday, day] of byDay) {
      day.sort((a, b) => a.start - b.start || a.index - b.index);
      let latestEnd = -1;
      for (const interval of day) {
        if (interval.start < latestEnd) {
          ctx.addIssue({
            code: 'custom',
            message: `Este intervalo se sobrepõe a outro de ${weekdayLabel(weekday).toLowerCase()}.`,
            path: [interval.index, 'start'],
          });
        }
        latestEnd = Math.max(latestEnd, interval.end);
      }
    }
  })
  .transform((intervals): AvailabilityRuleRow[] =>
    intervals
      .map((interval) => ({
        weekday: interval.weekday,
        start_time: interval.start,
        end_time: interval.end,
      }))
      .sort(
        (a, b) =>
          a.weekday - b.weekday ||
          (timeToMinutes(a.start_time) ?? 0) - (timeToMinutes(b.start_time) ?? 0),
      ),
  );

export type ExceptionKind = 'blocked' | 'extra';

// Formulário de exceção (RN-050), em data e hora locais da empresa. "Dia inteiro" ignora as horas e vai
// da meia-noite do primeiro dia à meia-noite do dia seguinte ao último. O limite de 366 dias é contado em
// dias de calendário; o banco confere de novo a duração em UTC.
export const exceptionFormSchema = z
  .object({
    kind: z.enum(['blocked', 'extra'], { error: 'Escolha o tipo da exceção.' }),
    allDay: z.boolean(),
    startDate: z.string().trim(),
    endDate: z.string().trim(),
    startTime: z.string().trim(),
    endTime: z.string().trim(),
    reason: z
      .string()
      .trim()
      .max(EXCEPTION_REASON_MAX_LENGTH, {
        error: `O motivo deve ter no máximo ${String(EXCEPTION_REASON_MAX_LENGTH)} caracteres.`,
      })
      .transform((value) => (value === '' ? null : value)),
  })
  .superRefine((value, ctx) => {
    const datesOk = [
      ['startDate', value.startDate],
      ['endDate', value.endDate],
    ].every(([field = '', date = '']) => {
      if (isIsoDate(date)) {
        return true;
      }
      ctx.addIssue({ code: 'custom', message: 'Informe uma data válida.', path: [field] });
      return false;
    });

    let timesOk = true;
    if (!value.allDay) {
      for (const [field, time] of [
        ['startTime', value.startTime],
        ['endTime', value.endTime],
      ] as const) {
        const minutes = timeToMinutes(time);
        if (minutes === null) {
          ctx.addIssue({
            code: 'custom',
            message: 'Informe a hora no formato HH:MM.',
            path: [field],
          });
          timesOk = false;
        } else if (minutes % AVAILABILITY_STEP_MINUTES !== 0) {
          ctx.addIssue({
            code: 'custom',
            message: 'Use horários de 5 em 5 minutos.',
            path: [field],
          });
          timesOk = false;
        }
      }
    }
    if (!datesOk || !timesOk) {
      return;
    }

    const days = daysBetweenIso(value.startDate, value.endDate);
    if (value.allDay) {
      if (days < 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'A data final não pode ser antes da inicial.',
          path: ['endDate'],
        });
        return;
      }
    } else {
      const startMinutes = timeToMinutes(value.startTime) ?? 0;
      const endMinutes = timeToMinutes(value.endTime) ?? 0;
      if (days < 0 || (days === 0 && endMinutes <= startMinutes)) {
        ctx.addIssue({
          code: 'custom',
          message: 'O fim deve ser depois do início.',
          path: [days < 0 ? 'endDate' : 'endTime'],
        });
        return;
      }
    }
    const length = value.allDay ? days + 1 : days;
    if (length > EXCEPTION_MAX_DAYS) {
      ctx.addIssue({
        code: 'custom',
        message: `Uma exceção pode durar no máximo ${String(EXCEPTION_MAX_DAYS)} dias.`,
        path: ['endDate'],
      });
    }
  });

export type ExceptionFormInput = z.input<typeof exceptionFormSchema>;
export type ExceptionFormOutput = z.output<typeof exceptionFormSchema>;

export interface UtcPeriod {
  start: Date;
  end: Date;
}

// Período da exceção em UTC, no fuso da empresa. Devolve null quando a conversão deixa o fim antes ou
// igual ao início, o que só acontece com horas na mudança do horário de verão (02:30–03:00 no dia em que
// o relógio adianta): a tela pede outro horário em vez de mandar um período que o banco recusaria.
export function exceptionPeriodUtc(form: ExceptionFormOutput, timeZone: string): UtcPeriod | null {
  const start = zonedToUtc(form.startDate, form.allDay ? '00:00' : form.startTime, timeZone);
  const end = form.allDay
    ? zonedToUtc(addDaysIso(form.endDate, 1), '00:00', timeZone)
    : zonedToUtc(form.endDate, form.endTime, timeZone);
  return end.getTime() > start.getTime() ? { start, end } : null;
}

// Literal de tstzrange [início, fim) para gravar availability_exceptions.period.
export function toTstzRange(period: UtcPeriod): string {
  return `[${period.start.toISOString()},${period.end.toISOString()})`;
}

const TSTZRANGE_PATTERN = /^\[\s*"?([^",]+)"?\s*,\s*"?([^",]+)"?\s*\)$/;

// tstzrange como o PostgREST devolve ("[\"2026-11-13 03:00:00+00\",\"2026-11-14 03:00:00+00\")") →
// início e fim. Só aceita o formato [) com as duas pontas, o único que o banco grava (RN-050).
export function parseTstzRange(value: string): UtcPeriod | null {
  const match = TSTZRANGE_PATTERN.exec(value.trim());
  if (match === null) {
    return null;
  }
  // "2026-11-13 03:00:00+00" → "2026-11-13T03:00:00+00:00", que o Date entende em todo navegador.
  const toIso = (text: string) =>
    text
      .trim()
      .replace(' ', 'T')
      .replace(/([+-]\d{2})$/, '$1:00');
  const start = new Date(toIso(match[1] ?? ''));
  const end = new Date(toIso(match[2] ?? ''));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return null;
  }
  return { start, end };
}
