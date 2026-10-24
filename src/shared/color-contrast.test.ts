import { describe, expect, it } from 'vitest';
import { contrastRatio, parseOklch, relativeLuminance } from './color-contrast';

const WHITE = { l: 1, c: 0, h: 0 };
const BLACK = { l: 0, c: 0, h: 0 };

describe('parseOklch', () => {
  it('lê L em porcentagem ou de 0 a 1', () => {
    expect(parseOklch('oklch(48.8% 0.243 264.376)')).toEqual({ l: 0.488, c: 0.243, h: 264.376 });
    expect(parseOklch('oklch(0.5 0.1 30)')).toEqual({ l: 0.5, c: 0.1, h: 30 });
    expect(parseOklch(' oklch(100% 0 0) ')).toEqual(WHITE);
  });

  it('recusa outros formatos', () => {
    expect(parseOklch('#ffffff')).toBeNull();
    expect(parseOklch('oklch(50% 0.1 30 / 0.5)')).toBeNull();
    expect(parseOklch('var(--lb-white)')).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('branco e preto dão 21:1 e a ordem não importa', () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
  });

  it('a mesma cor dá 1:1', () => {
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
  });

  it('confere com o valor de referência de uma cor sRGB conhecida', () => {
    // #767676 (oklch 56.58% 0 0) sobre branco: 4,54:1 nas calculadoras WCAG.
    const gray = { l: 0.5658, c: 0, h: 0 };
    expect(contrastRatio(gray, WHITE)).toBeCloseTo(4.54, 1);
    expect(relativeLuminance(gray)).toBeCloseTo(0.181, 2);
  });
});
