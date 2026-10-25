import { describe, expect, it } from 'vitest';
import { MAX_PRICE_CENTS, centsToBrlInput, formatCents, parseBrlToCents } from './money';

describe('parseBrlToCents', () => {
  it.each([
    ['0', 0],
    ['0,00', 0],
    ['120', 12000],
    ['120,5', 12050],
    ['120,50', 12050],
    ['120,05', 12005],
    ['1234,56', 123456],
    ['1.234,56', 123456],
    ['1.234', 123400],
    [' 45,00 ', 4500],
    ['R$ 45,00', 4500],
    ['R$45', 4500],
    ['999.999,99', MAX_PRICE_CENTS],
  ])('converte %j em %j', (input, expected) => {
    expect(parseBrlToCents(input)).toBe(expected);
  });

  it.each([
    '',
    ' ',
    'R$',
    '-10',
    '-10,00',
    '10,001',
    '10,',
    ',50',
    '12.50',
    '1.23,00',
    '1,234.56',
    '10 00',
    'dez',
    '1e3',
    '1.000.000,00',
    '12.345.678,90',
  ])('recusa %j', (input) => {
    expect(parseBrlToCents(input)).toBeNull();
  });
});

describe('centsToBrlInput', () => {
  it.each([
    [0, '0,00'],
    [5, '0,05'],
    [12000, '120,00'],
    [12050, '120,50'],
    [123456, '1234,56'],
  ])('%j vira %j', (cents, expected) => {
    expect(centsToBrlInput(cents)).toBe(expected);
  });

  it('volta ao mesmo valor ao ser lido de novo', () => {
    for (const cents of [0, 1, 99, 100, 4500, 123456, MAX_PRICE_CENTS]) {
      expect(parseBrlToCents(centsToBrlInput(cents))).toBe(cents);
    }
  });
});

describe('formatCents', () => {
  it('formata em reais no padrão pt-BR', () => {
    expect(formatCents(0)).toBe('R$ 0,00');
    expect(formatCents(12000)).toBe('R$ 120,00');
    expect(formatCents(123456)).toBe('R$ 1.234,56');
    expect(formatCents(12000, 'BRL')).toBe('R$ 120,00');
  });
});
