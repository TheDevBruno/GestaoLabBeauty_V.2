// Conversão entre hora local no fuso da empresa e instante UTC (RN-048), só com Intl, sem biblioteca de
// datas. O cálculo da disponibilidade é do banco (public.professional_availability); aqui a tela converte
// para mostrar períodos e para gravar exceções. As regras de borda seguem o Postgres (`at time zone`):
// - hora que não existe no adiantamento do relógio (02:30 em New York em 08/03/2026) vira o instante
//   pelo deslocamento de antes da mudança (07:30 UTC);
// - hora que existe duas vezes no atraso do relógio (01:30 em New York em 01/11/2026) vira o instante
//   mais tardio, o do horário padrão (06:30 UTC).
// Nos dois casos é o mais tardio dos candidatos.

export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const DAY_MS = 86_400_000;

// Data e hora locais: "AAAA-MM-DD" (campo type="date") e "HH:MM" (campo type="time").
export interface LocalDateTime {
  date: string;
  time: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.trim() === '') {
    return false;
  }
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

// Campos da data e hora locais de um instante, como números.
function localParts(epochMs: number, timeZone: string) {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(epochMs))) {
    if (part.type !== 'literal') {
      parts[part.type] = Number(part.value);
    }
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

// Deslocamento do fuso (local − UTC) em milissegundos no instante dado.
function offsetMs(epochMs: number, timeZone: string): number {
  const whole = Math.floor(epochMs / 1000) * 1000;
  const p = localParts(whole, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - whole;
}

// "2026-02-30" tem o formato certo mas não existe; a volta pelo Date.UTC descarta esses casos.
export function isIsoDate(value: string): boolean {
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

function isoDateToUtcMs(date: string): number {
  const match = ISO_DATE_PATTERN.exec(date);
  if (match === null || !isIsoDate(date)) {
    throw new RangeError(`Data inválida: ${date}`);
  }
  const [, year = '', month = '', day = ''] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function utcMsToIsoDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

// Soma dias a uma data "AAAA-MM-DD" (calendário puro, sem fuso).
export function addDaysIso(date: string, days: number): string {
  return utcMsToIsoDate(isoDateToUtcMs(date) + days * DAY_MS);
}

// Dias de calendário de uma data até outra (negativo se `to` vem antes).
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((isoDateToUtcMs(to) - isoDateToUtcMs(from)) / DAY_MS);
}

// Dia da semana ISO da data: 1 = segunda … 7 = domingo (o mesmo de availability_rules.weekday).
export function isoWeekday(date: string): number {
  const day = new Date(isoDateToUtcMs(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

// Hora local no fuso → instante UTC. Aceita "24:00" (meia-noite do dia seguinte), como o tipo time do
// Postgres.
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const match = TIME_PATTERN.exec(time);
  const hour = Number(match?.[1] ?? NaN);
  const minute = Number(match?.[2] ?? NaN);
  if (match === null || minute > 59 || hour > 24 || (hour === 24 && minute !== 0)) {
    throw new RangeError(`Hora inválida: ${time}`);
  }
  // A hora local lida como se fosse UTC; o instante certo é ela menos o deslocamento do fuso.
  const asUtc = isoDateToUtcMs(date) + (hour * 60 + minute) * 60_000;
  const candidates = [
    asUtc - offsetMs(asUtc, timeZone),
    asUtc - offsetMs(asUtc - DAY_MS, timeZone),
    asUtc - offsetMs(asUtc + DAY_MS, timeZone),
  ];
  const exact = candidates.filter((epochMs) => epochMs + offsetMs(epochMs, timeZone) === asUtc);
  // Sem candidato exato, a hora caiu no adiantamento do relógio; com dois, no atraso. Nos dois casos o
  // Postgres fica com o mais tardio.
  return new Date(Math.max(...(exact.length > 0 ? exact : candidates)));
}

// Instante UTC → data e hora locais no fuso ("HH:MM", segundos descartados).
export function utcToZoned(instant: Date, timeZone: string): LocalDateTime {
  const p = localParts(instant.getTime(), timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    date: `${String(p.year)}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}
