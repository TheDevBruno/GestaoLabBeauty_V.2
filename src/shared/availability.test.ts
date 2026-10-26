import { describe, expect, it } from 'vitest';
import {
  AVAILABILITY_MAX_RULES,
  exceptionFormSchema,
  type ExceptionFormInput,
  exceptionPeriodUtc,
  parseTstzRange,
  timeToMinutes,
  toTstzRange,
  weekdayLabel,
  weeklyRulesSchema,
} from './availability';

describe('timeToMinutes', () => {
  it.each([
    ['00:00', 0],
    ['09:05', 545],
    ['23:59', 1439],
    ['24:00', 1440],
  ])('%s → %i', (time, minutes) => {
    expect(timeToMinutes(time)).toBe(minutes);
  });

  it.each(['9:00', '24:05', '25:00', '12:60', '', '12h00'])('%j → null', (time) => {
    expect(timeToMinutes(time)).toBeNull();
  });
});

describe('weekdayLabel', () => {
  it('nomes de segunda a domingo e vazio fora de 1 a 7', () => {
    expect(weekdayLabel(1)).toBe('Segunda-feira');
    expect(weekdayLabel(7)).toBe('Domingo');
    expect(weekdayLabel(0)).toBe('');
  });
});

// Erros como "caminho: mensagem", para conferir também onde a tela mostra cada um.
function weekIssues(input: unknown): string[] {
  const result = weeklyRulesSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

describe('weeklyRulesSchema', () => {
  it('sai no formato de set_availability_rules, em ordem de dia e de início', () => {
    expect(
      weeklyRulesSchema.parse([
        { weekday: 2, start: '13:00', end: '18:00' },
        { weekday: 1, start: ' 13:00 ', end: '18:00' },
        { weekday: 1, start: '09:00', end: '12:00' },
      ]),
    ).toEqual([
      { weekday: 1, start_time: '09:00', end_time: '12:00' },
      { weekday: 1, start_time: '13:00', end_time: '18:00' },
      { weekday: 2, start_time: '13:00', end_time: '18:00' },
    ]);
  });

  it('semana vazia é aceita (profissional sem horário)', () => {
    expect(weeklyRulesSchema.parse([])).toEqual([]);
  });

  it('aceita intervalos encostados e fim 24:00', () => {
    expect(
      weekIssues([
        { weekday: 3, start: '09:00', end: '12:00' },
        { weekday: 3, start: '12:00', end: '14:00' },
        { weekday: 3, start: '20:00', end: '24:00' },
      ]),
    ).toEqual([]);
  });

  it('o mesmo horário em dias diferentes não é sobreposição', () => {
    expect(
      weekIssues([
        { weekday: 1, start: '09:00', end: '12:00' },
        { weekday: 2, start: '09:00', end: '12:00' },
      ]),
    ).toEqual([]);
  });

  it('sobreposição aponta o intervalo que começa depois, no campo início', () => {
    expect(
      weekIssues([
        { weekday: 2, start: '11:00', end: '13:00' },
        { weekday: 2, start: '09:00', end: '12:00' },
      ]),
    ).toEqual(['0.start: Este intervalo se sobrepõe a outro de terça-feira.']);
  });

  it('intervalo dentro de outro também é sobreposição', () => {
    expect(
      weekIssues([
        { weekday: 5, start: '08:00', end: '18:00' },
        { weekday: 5, start: '10:00', end: '11:00' },
        { weekday: 5, start: '12:00', end: '13:00' },
      ]),
    ).toEqual([
      '1.start: Este intervalo se sobrepõe a outro de sexta-feira.',
      '2.start: Este intervalo se sobrepõe a outro de sexta-feira.',
    ]);
  });

  it('fim antes ou igual ao início fica no campo fim', () => {
    expect(weekIssues([{ weekday: 1, start: '10:00', end: '10:00' }])).toEqual([
      '0.end: O fim deve ser depois do início.',
    ]);
    expect(weekIssues([{ weekday: 1, start: '18:00', end: '09:00' }])).toEqual([
      '0.end: O fim deve ser depois do início.',
    ]);
  });

  it('hora fora de 5 em 5 e fora do formato', () => {
    expect(weekIssues([{ weekday: 1, start: '09:03', end: '10:00' }])).toEqual([
      '0.start: Use horários de 5 em 5 minutos.',
    ]);
    expect(weekIssues([{ weekday: 1, start: '', end: '10:00' }])).toEqual([
      '0.start: Informe a hora no formato HH:MM.',
    ]);
  });

  it('início 24:00 é recusado (o fim não pode vir depois)', () => {
    expect(weekIssues([{ weekday: 1, start: '24:00', end: '24:00' }])).toEqual([
      '0.end: O fim deve ser depois do início.',
    ]);
  });

  it.each([0, 8, 1.5])('dia %d é recusado', (weekday) => {
    expect(weekIssues([{ weekday, start: '09:00', end: '10:00' }])).not.toEqual([]);
  });

  it(`aceita ${String(AVAILABILITY_MAX_RULES)} intervalos e recusa um a mais`, () => {
    const interval = (index: number) => ({
      weekday: 1 + (index % 7),
      start: `${String(Math.floor(index / 7)).padStart(2, '0')}:00`,
      end: `${String(Math.floor(index / 7)).padStart(2, '0')}:30`,
    });
    const max = Array.from({ length: AVAILABILITY_MAX_RULES }, (_, index) => interval(index));
    expect(weekIssues(max)).toEqual([]);
    expect(weekIssues([...max, interval(AVAILABILITY_MAX_RULES)])).toEqual([
      ': Cadastre no máximo 70 intervalos na semana.',
    ]);
  });
});

const exception: ExceptionFormInput = {
  kind: 'blocked',
  allDay: false,
  startDate: '2026-11-16',
  endDate: '2026-11-16',
  startTime: '10:00',
  endTime: '11:00',
  reason: '  Reunião de equipe ',
};

function exceptionIssues(patch: Partial<ExceptionFormInput>): string[] {
  const result = exceptionFormSchema.safeParse({ ...exception, ...patch });
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

describe('exceptionFormSchema', () => {
  it('apara o motivo e mantém data e hora locais', () => {
    expect(exceptionFormSchema.parse(exception)).toEqual({
      ...exception,
      reason: 'Reunião de equipe',
    });
  });

  it('motivo vazio vira null; 120 caracteres passam e 121 não', () => {
    expect(exceptionFormSchema.parse({ ...exception, reason: '   ' }).reason).toBeNull();
    expect(exceptionIssues({ reason: 'm'.repeat(120) })).toEqual([]);
    expect(exceptionIssues({ reason: 'm'.repeat(121) })).toEqual([
      'reason: O motivo deve ter no máximo 120 caracteres.',
    ]);
  });

  it('dia inteiro ignora as horas, inclusive vazias', () => {
    expect(exceptionIssues({ allDay: true, startTime: '', endTime: '' })).toEqual([]);
  });

  it('dia inteiro aceita um só dia e recusa fim antes do início', () => {
    expect(exceptionIssues({ allDay: true, endDate: '2026-11-16' })).toEqual([]);
    expect(exceptionIssues({ allDay: true, endDate: '2026-11-15' })).toEqual([
      'endDate: A data final não pode ser antes da inicial.',
    ]);
  });

  it('com horas: fim igual ou antes do início fica no campo fim', () => {
    expect(exceptionIssues({ endTime: '10:00' })).toEqual([
      'endTime: O fim deve ser depois do início.',
    ]);
    expect(exceptionIssues({ endDate: '2026-11-15', endTime: '23:00' })).toEqual([
      'endDate: O fim deve ser depois do início.',
    ]);
  });

  it('com horas: pode virar o dia (20:00 de domingo a 02:00 de segunda)', () => {
    expect(
      exceptionIssues({
        startDate: '2026-11-29',
        startTime: '20:00',
        endDate: '2026-11-30',
        endTime: '02:00',
      }),
    ).toEqual([]);
  });

  it('horas fora de 5 em 5 ou do formato', () => {
    expect(exceptionIssues({ startTime: '10:03' })).toEqual([
      'startTime: Use horários de 5 em 5 minutos.',
    ]);
    expect(exceptionIssues({ endTime: '' })).toEqual(['endTime: Informe a hora no formato HH:MM.']);
  });

  it.each(['', '2026-02-30', '16/11/2026'])('data %j é recusada', (startDate) => {
    expect(exceptionIssues({ startDate })).toEqual(['startDate: Informe uma data válida.']);
  });

  it('até 366 dias: dia inteiro de 01/01/2026 a 01/01/2027 passa, um dia a mais não', () => {
    expect(
      exceptionIssues({ allDay: true, startDate: '2026-01-01', endDate: '2027-01-01' }),
    ).toEqual([]);
    expect(
      exceptionIssues({ allDay: true, startDate: '2026-01-01', endDate: '2027-01-02' }),
    ).toEqual(['endDate: Uma exceção pode durar no máximo 366 dias.']);
  });

  it('tipo fora de bloqueio e extra é recusado', () => {
    expect(
      exceptionFormSchema.safeParse({ ...exception, kind: 'ferias' }).error?.issues[0]?.message,
    ).toBe('Escolha o tipo da exceção.');
  });
});

describe('exceptionPeriodUtc', () => {
  const parse = (patch: Partial<ExceptionFormInput>) =>
    exceptionFormSchema.parse({ ...exception, ...patch });

  it('bloqueio 10:00–11:00 em São Paulo (como no pgTAP)', () => {
    const period = exceptionPeriodUtc(parse({}), 'America/Sao_Paulo');
    expect(period && toTstzRange(period)).toBe(
      '[2026-11-16T13:00:00.000Z,2026-11-16T14:00:00.000Z)',
    );
  });

  it('dia inteiro vai da meia-noite à meia-noite do dia seguinte no fuso da empresa', () => {
    const period = exceptionPeriodUtc(
      parse({ allDay: true, startDate: '2026-11-09', endDate: '2026-11-09' }),
      'America/Sao_Paulo',
    );
    expect(period && toTstzRange(period)).toBe(
      '[2026-11-09T03:00:00.000Z,2026-11-10T03:00:00.000Z)',
    );
  });

  it('feriado de dia inteiro em Manaus (UTC−4)', () => {
    const period = exceptionPeriodUtc(
      parse({ allDay: true, startDate: '2026-11-20', endDate: '2026-11-20' }),
      'America/Manaus',
    );
    expect(period && toTstzRange(period)).toBe(
      '[2026-11-20T04:00:00.000Z,2026-11-21T04:00:00.000Z)',
    );
  });

  it('dia inteiro na volta do horário de verão de New York tem 25 horas', () => {
    const period = exceptionPeriodUtc(
      parse({ allDay: true, startDate: '2026-11-01', endDate: '2026-11-01' }),
      'America/New_York',
    );
    expect(period && toTstzRange(period)).toBe(
      '[2026-11-01T04:00:00.000Z,2026-11-02T05:00:00.000Z)',
    );
  });

  it('02:30–03:00 no dia em que o relógio adianta não vira período (null)', () => {
    expect(
      exceptionPeriodUtc(
        parse({
          startDate: '2026-03-08',
          endDate: '2026-03-08',
          startTime: '02:30',
          endTime: '03:00',
        }),
        'America/New_York',
      ),
    ).toBeNull();
  });
});

describe('parseTstzRange', () => {
  it('lê o formato do PostgREST', () => {
    expect(parseTstzRange('["2026-11-13 03:00:00+00","2026-11-14 03:00:00+00")')).toEqual({
      start: new Date('2026-11-13T03:00:00Z'),
      end: new Date('2026-11-14T03:00:00Z'),
    });
  });

  it('lê o próprio literal de toTstzRange', () => {
    const period = {
      start: new Date('2026-11-16T13:00:00Z'),
      end: new Date('2026-11-16T14:00:00Z'),
    };
    expect(parseTstzRange(toTstzRange(period))).toEqual(period);
  });

  it('lê deslocamento com minutos', () => {
    expect(parseTstzRange('["2026-12-04 10:00:00+05:45","2026-12-04 11:00:00+05:45")')).toEqual({
      start: new Date('2026-12-04T04:15:00Z'),
      end: new Date('2026-12-04T05:15:00Z'),
    });
  });

  it.each([
    'empty',
    '["2026-11-13 03:00:00+00",)',
    '("2026-11-13 03:00:00+00","2026-11-14 03:00:00+00")',
    '["2026-11-13 03:00:00+00","2026-11-14 03:00:00+00"]',
    '["2026-11-14 03:00:00+00","2026-11-13 03:00:00+00")',
    '["ontem","hoje")',
  ])('recusa %j', (value) => {
    expect(parseTstzRange(value)).toBeNull();
  });
});
