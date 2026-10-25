import { describe, expect, it } from 'vitest';
import {
  formatMinutes,
  serviceBufferOptions,
  serviceDurationOptions,
  serviceFormSchema,
} from './service';

const valid = {
  name: ' Corte feminino ',
  description: '',
  durationMinutes: '60',
  bufferMinutes: '15',
  price: '120,00',
  isActive: true,
};

// Campos com erro, sem repetição: um valor pode violar duas regras do mesmo campo ("4" fica abaixo do
// mínimo e fora do passo de 5).
function errorsOf(input: Record<string, unknown>): string[] {
  const result = serviceFormSchema.safeParse(input);
  return result.success ? [] : [...new Set(result.error.issues.map((i) => i.path.join('.')))];
}

describe('serviceFormSchema', () => {
  it('converte o formulário nos valores do banco', () => {
    expect(serviceFormSchema.parse(valid)).toEqual({
      name: 'Corte feminino',
      description: null,
      durationMinutes: 60,
      bufferMinutes: 15,
      price: 12000,
      isActive: true,
    });
  });

  it('intervalo vazio é "sem intervalo" (null); zero é aceito', () => {
    expect(serviceFormSchema.parse({ ...valid, bufferMinutes: '' }).bufferMinutes).toBeNull();
    expect(serviceFormSchema.parse({ ...valid, bufferMinutes: null }).bufferMinutes).toBeNull();
    expect(serviceFormSchema.parse({ ...valid, bufferMinutes: '0' }).bufferMinutes).toBe(0);
    expect(serviceFormSchema.parse({ ...valid, bufferMinutes: 240 }).bufferMinutes).toBe(240);
  });

  it('mantém a descrição aparada', () => {
    expect(serviceFormSchema.parse({ ...valid, description: '  Com lavagem ' }).description).toBe(
      'Com lavagem',
    );
  });

  it.each(['', '   ', 'a'.repeat(81)])('recusa nome %j', (name) => {
    expect(errorsOf({ ...valid, name })).toEqual(['name']);
  });

  it('aceita nome com 80 caracteres e recusa descrição com 501', () => {
    expect(errorsOf({ ...valid, name: 'a'.repeat(80) })).toEqual([]);
    expect(errorsOf({ ...valid, description: 'a'.repeat(501) })).toEqual(['description']);
  });

  it.each(['', '0', '4', '7', '725', '1.5', 'abc'])('recusa duração %j', (durationMinutes) => {
    expect(errorsOf({ ...valid, durationMinutes })).toEqual(['durationMinutes']);
  });

  it.each(['5', '720', 90])('aceita duração %j', (durationMinutes) => {
    expect(errorsOf({ ...valid, durationMinutes })).toEqual([]);
  });

  it.each(['-5', '3', '245', 'x'])('recusa intervalo %j', (bufferMinutes) => {
    expect(errorsOf({ ...valid, bufferMinutes })).toEqual(['bufferMinutes']);
  });

  it.each(['', '-1', '10,001', 'dez'])('recusa preço %j', (price) => {
    expect(errorsOf({ ...valid, price })).toEqual(['price']);
  });

  it('aceita preço zero', () => {
    expect(serviceFormSchema.parse({ ...valid, price: '0' }).price).toBe(0);
  });
});

describe('opções dos selects', () => {
  it('duração de 5 a 720 em passos de 5', () => {
    expect(serviceDurationOptions[0]).toBe(5);
    expect(serviceDurationOptions.at(-1)).toBe(720);
    expect(serviceDurationOptions).toHaveLength(144);
    expect(serviceDurationOptions.every((m) => m % 5 === 0)).toBe(true);
  });

  it('intervalo de 5 a 60 em passos de 5 (sem o "sem intervalo")', () => {
    expect(serviceBufferOptions).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  });
});

describe('formatMinutes', () => {
  it.each([
    [5, '5 min'],
    [45, '45 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [125, '2 h 5 min'],
    [720, '12 h'],
  ])('%j → %j', (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });
});
