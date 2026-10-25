import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIENT_SEARCH_MAX_LENGTH,
  clientFormSchema,
  formatBirthDate,
  normalizeClientSearch,
  todayIsoDate,
} from './client';

const valid = {
  fullName: '  Joana Conceição Teste ',
  phone: '(11) 98765-4321',
  email: ' Joana.Teste@Example.TEST ',
  birthDate: '1992-01-20',
  isActive: true,
};

function errorOf(field: keyof typeof valid, value: string): string | undefined {
  const result = clientFormSchema.safeParse({ ...valid, [field]: value });
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe('clientFormSchema', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 25, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('apara o nome, grava telefone em E.164 e e-mail em minúsculas', () => {
    expect(clientFormSchema.parse(valid)).toEqual({
      fullName: 'Joana Conceição Teste',
      phone: '+5511987654321',
      email: 'joana.teste@example.test',
      birthDate: '1992-01-20',
      isActive: true,
    });
  });

  it('campos opcionais vazios viram null', () => {
    expect(
      clientFormSchema.parse({ ...valid, phone: '  ', email: '', birthDate: '', isActive: false }),
    ).toEqual({
      fullName: 'Joana Conceição Teste',
      phone: null,
      email: null,
      birthDate: null,
      isActive: false,
    });
  });

  it.each(['', '   ', 'a'.repeat(121)])('recusa nome %j', (fullName) => {
    expect(errorOf('fullName', fullName)).toBeDefined();
  });

  it('aceita nome com 120 caracteres', () => {
    expect(errorOf('fullName', 'a'.repeat(120))).toBeUndefined();
  });

  it.each(['987654321', '(11) 88765-4321', 'abc', '+55 11 8765-43'])(
    'recusa telefone %j com mensagem de exemplo',
    (phone) => {
      expect(errorOf('phone', phone)).toBe(
        'Informe um telefone com DDD, por exemplo (11) 98765-4321.',
      );
    },
  );

  it('aceita telefone de outro país com +', () => {
    expect(clientFormSchema.parse({ ...valid, phone: '+1 415 555 0100' }).phone).toBe(
      '+14155550100',
    );
  });

  it.each(['joana', 'joana@', 'joana@example', 'jo ana@example.test', '@example.test'])(
    'recusa e-mail %j',
    (email) => {
      expect(errorOf('email', email)).toBe(
        'Informe um e-mail válido, por exemplo nome@exemplo.com.',
      );
    },
  );

  it('limita o e-mail a 254 caracteres', () => {
    const domain = '@example.test';
    expect(errorOf('email', 'a'.repeat(254 - domain.length) + domain)).toBeUndefined();
    expect(errorOf('email', 'a'.repeat(255 - domain.length) + domain)).toBe(
      'O e-mail deve ter no máximo 254 caracteres.',
    );
  });

  it.each(['15/03/1990', '1990-3-15', '2026-02-30', '1990-13-01', 'ontem'])(
    'recusa data %j',
    (birthDate) => {
      expect(errorOf('birthDate', birthDate)).toBe('Informe uma data válida.');
    },
  );

  it('aceita de 1900-01-01 até hoje', () => {
    expect(errorOf('birthDate', '1900-01-01')).toBeUndefined();
    expect(errorOf('birthDate', '2026-10-25')).toBeUndefined();
    expect(errorOf('birthDate', '2000-02-29')).toBeUndefined();
  });

  it('recusa antes de 1900 e depois de hoje', () => {
    expect(errorOf('birthDate', '1899-12-31')).toBe(
      'A data de nascimento deve ser a partir de 01/01/1900.',
    );
    expect(errorOf('birthDate', '2026-10-26')).toBe('A data de nascimento não pode ser no futuro.');
  });
});

describe('todayIsoDate', () => {
  it('usa a data local com zeros à esquerda', () => {
    expect(todayIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('formatBirthDate', () => {
  it('formata AAAA-MM-DD como DD/MM/AAAA', () => {
    expect(formatBirthDate('1990-03-15')).toBe('15/03/1990');
  });

  it('devolve o texto como está fora do formato', () => {
    expect(formatBirthDate('15/03/1990')).toBe('15/03/1990');
  });
});

describe('normalizeClientSearch', () => {
  it.each([
    ['  joão   da  silva ', 'joão da silva'],
    ['(11) 98765-4321', '(11) 98765-4321'],
    ['\tana\n', 'ana'],
    ['', ''],
    ['   ', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeClientSearch(input)).toBe(expected);
  });

  it(`corta em ${String(CLIENT_SEARCH_MAX_LENGTH)} caracteres sem espaço no fim`, () => {
    const long = `${'a'.repeat(99)} bbbb`;
    expect(normalizeClientSearch(long)).toBe('a'.repeat(99));
    expect(normalizeClientSearch('c'.repeat(150))).toHaveLength(CLIENT_SEARCH_MAX_LENGTH);
  });
});
