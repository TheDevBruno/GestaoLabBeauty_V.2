import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('junta classes e ignora valores falsos', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });

  it('a classe passada por último vence o conflito do Tailwind', () => {
    expect(cn('px-4 bg-primary', 'px-2')).toBe('bg-primary px-2');
  });

  it('entende os tokens do design system como cores', () => {
    expect(cn('text-foreground', 'text-muted-foreground')).toBe('text-muted-foreground');
    expect(cn('bg-card', 'bg-primary')).toBe('bg-primary');
  });

  it('mantém tamanho de texto e cor juntos', () => {
    expect(cn('text-base text-foreground')).toBe('text-base text-foreground');
  });
});
