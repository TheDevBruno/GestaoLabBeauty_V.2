import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  daysBetweenIso,
  DEFAULT_TIME_ZONE,
  isIsoDate,
  isoWeekday,
  isValidTimeZone,
  utcToZoned,
  zonedToUtc,
} from './timezone';

// Mesmas datas de borda de supabase/tests/availability.test.sql: o resultado tem de bater com o
// `at time zone` do Postgres.
const iso = (date: Date) => date.toISOString();

describe('zonedToUtc', () => {
  it.each([
    ['America/Sao_Paulo', '2026-11-02', '09:00', '2026-11-02T12:00:00.000Z'],
    ['America/Sao_Paulo', '2026-11-02', '18:00', '2026-11-02T21:00:00.000Z'],
    ['America/Manaus', '2026-11-02', '09:00', '2026-11-02T13:00:00.000Z'],
    ['America/Sao_Paulo', '2026-11-03', '22:00', '2026-11-04T01:00:00.000Z'],
    ['UTC', '2026-11-02', '09:00', '2026-11-02T09:00:00.000Z'],
    ['Asia/Kathmandu', '2026-12-04', '10:00', '2026-12-04T04:15:00.000Z'],
  ])('%s %s %s → %s', (timeZone, date, time, expected) => {
    expect(iso(zonedToUtc(date, time, timeZone))).toBe(expected);
  });

  it('24:00 é a meia-noite do dia seguinte e vira o dia em UTC', () => {
    expect(iso(zonedToUtc('2026-11-03', '24:00', 'America/Sao_Paulo'))).toBe(
      '2026-11-04T03:00:00.000Z',
    );
  });

  it('New York em 01/11/2026 (volta do horário de verão): o dia tem 25 horas', () => {
    const start = zonedToUtc('2026-11-01', '00:00', 'America/New_York');
    const end = zonedToUtc('2026-11-01', '24:00', 'America/New_York');
    expect(iso(start)).toBe('2026-11-01T04:00:00.000Z');
    expect(iso(end)).toBe('2026-11-02T05:00:00.000Z');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });

  it('New York em 08/03/2026 (início do horário de verão): o dia tem 23 horas', () => {
    const start = zonedToUtc('2026-03-08', '00:00', 'America/New_York');
    const end = zonedToUtc('2026-03-08', '24:00', 'America/New_York');
    expect(iso(start)).toBe('2026-03-08T05:00:00.000Z');
    expect(iso(end)).toBe('2026-03-09T04:00:00.000Z');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });

  it('hora que não existe (02:30 em 08/03/2026) segue o Postgres: 07:30 UTC, depois das 03:00', () => {
    expect(iso(zonedToUtc('2026-03-08', '02:30', 'America/New_York'))).toBe(
      '2026-03-08T07:30:00.000Z',
    );
    expect(iso(zonedToUtc('2026-03-08', '03:00', 'America/New_York'))).toBe(
      '2026-03-08T07:00:00.000Z',
    );
  });

  it('hora que existe duas vezes (01:30 em 01/11/2026) segue o Postgres: a do horário padrão', () => {
    expect(iso(zonedToUtc('2026-11-01', '01:30', 'America/New_York'))).toBe(
      '2026-11-01T06:30:00.000Z',
    );
  });

  it('no domingo seguinte ao início do horário de verão, 02:30 existe (UTC−4)', () => {
    expect(iso(zonedToUtc('2026-03-15', '02:30', 'America/New_York'))).toBe(
      '2026-03-15T06:30:00.000Z',
    );
  });

  it.each(['9:00', '25:00', '24:05', '12:60', '12h00', ''])('recusa a hora %j', (time) => {
    expect(() => zonedToUtc('2026-11-02', time, 'America/Sao_Paulo')).toThrow(RangeError);
  });

  it.each(['2026-02-30', '2026-13-01', '02/11/2026'])('recusa a data %j', (date) => {
    expect(() => zonedToUtc(date, '09:00', 'America/Sao_Paulo')).toThrow(RangeError);
  });
});

describe('utcToZoned', () => {
  it.each([
    ['2026-11-02T12:00:00Z', 'America/Sao_Paulo', '2026-11-02', '09:00'],
    ['2026-11-04T01:00:00Z', 'America/Sao_Paulo', '2026-11-03', '22:00'],
    ['2026-11-02T13:00:00Z', 'America/Manaus', '2026-11-02', '09:00'],
    ['2026-11-02T05:00:00Z', 'America/New_York', '2026-11-02', '00:00'],
    ['2026-11-01T05:30:00Z', 'America/New_York', '2026-11-01', '01:30'],
    ['2026-11-01T06:30:00Z', 'America/New_York', '2026-11-01', '01:30'],
    ['2026-03-08T07:00:00Z', 'America/New_York', '2026-03-08', '03:00'],
  ])('%s em %s → %s %s', (instant, timeZone, date, time) => {
    expect(utcToZoned(new Date(instant), timeZone)).toEqual({ date, time });
  });

  it('meia-noite local sai como 00:00, nunca 24:00', () => {
    expect(utcToZoned(new Date('2026-11-04T03:00:00Z'), 'America/Sao_Paulo')).toEqual({
      date: '2026-11-04',
      time: '00:00',
    });
  });

  it('ida e volta preserva a hora local fora das bordas', () => {
    for (const time of ['00:00', '09:05', '12:00', '23:55']) {
      const instant = zonedToUtc('2026-07-15', time, 'America/New_York');
      expect(utcToZoned(instant, 'America/New_York')).toEqual({ date: '2026-07-15', time });
    }
  });
});

describe('fusos e datas', () => {
  it('reconhece fusos IANA e recusa nomes desconhecidos', () => {
    expect(isValidTimeZone(DEFAULT_TIME_ZONE)).toBe(true);
    expect(isValidTimeZone('America/Manaus')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('valida datas de calendário', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-1-01')).toBe(false);
  });

  it('soma dias e conta dias pelo calendário, sem fuso', () => {
    expect(addDaysIso('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDaysIso('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDaysIso('2026-01-01', -1)).toBe('2025-12-31');
    expect(daysBetweenIso('2026-11-01', '2027-01-01')).toBe(61);
    expect(daysBetweenIso('2026-11-03', '2026-11-02')).toBe(-1);
  });

  it('dia da semana ISO: 1 = segunda, 7 = domingo', () => {
    expect(isoWeekday('2026-11-02')).toBe(1);
    expect(isoWeekday('2026-11-07')).toBe(6);
    expect(isoWeekday('2026-11-01')).toBe(7);
  });
});
