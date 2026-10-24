import { describe, expect, it } from 'vitest';
import { contrastRatio, parseOklch, type Oklch } from '@/shared/color-contrast';

// Lê os tokens direto do index.css, para o teste acompanhar qualquer troca de cor sem duplicar valores.
// O Vitest devolve CSS vazio mesmo com `?raw`, e src/ não carrega os tipos do Node (tsconfig.app.json);
// por isso o fs vem do módulo embutido, tipado só com o que o teste usa.
interface NodeFs {
  readFileSync(path: URL, encoding: 'utf8'): string;
}
const { process } = globalThis as unknown as {
  process: { getBuiltinModule(id: 'node:fs'): NodeFs };
};
const css = process
  .getBuiltinModule('node:fs')
  .readFileSync(new URL('./index.css', import.meta.url), 'utf8');

const primitives = new Map<string, Oklch>();
for (const [, name = '', value = ''] of css.matchAll(/(--lb-[\w-]+):\s*(oklch\([^)]*\));/g)) {
  const color = parseOklch(value);
  if (color) primitives.set(name, color);
}

const semantic = new Map<string, Oklch>();
for (const [, name = '', primitive = ''] of css.matchAll(
  /\s(--[a-z-]+):\s*var\((--lb-[\w-]+)\);/g,
)) {
  const color = primitives.get(primitive);
  if (color) semantic.set(name, color);
}

function token(name: string): Oklch {
  const color = semantic.get(name);
  if (!color) throw new Error(`Token ${name} não encontrado em index.css`);
  return color;
}

// Texto normal: 4,5:1 (WCAG 1.4.3). Borda de controle e anel de foco: 3:1 (WCAG 1.4.11).
const TEXT_PAIRS: [string, string][] = [
  ['--foreground', '--background'],
  ['--foreground', '--card'],
  ['--card-foreground', '--card'],
  ['--popover-foreground', '--popover'],
  ['--primary-foreground', '--primary'],
  ['--secondary-foreground', '--secondary'],
  ['--muted-foreground', '--background'],
  ['--muted-foreground', '--card'],
  ['--muted-foreground', '--muted'],
  ['--accent-foreground', '--accent'],
  ['--destructive', '--background'],
  ['--destructive', '--card'],
  ['--destructive-foreground', '--destructive'],
  ['--success', '--card'],
  ['--success-foreground', '--success'],
];

const NON_TEXT_PAIRS: [string, string][] = [
  ['--input', '--card'],
  ['--input', '--background'],
  ['--ring', '--card'],
  ['--ring', '--background'],
  ['--primary', '--background'],
];

describe('tokens do design system', () => {
  it('lê os primitivos e os semânticos do index.css', () => {
    expect(primitives.size).toBeGreaterThanOrEqual(10);
    expect(semantic.size).toBeGreaterThanOrEqual(20);
  });

  it.each(TEXT_PAIRS)('%s sobre %s tem contraste de texto (4,5:1)', (text, surface) => {
    expect(contrastRatio(token(text), token(surface))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)('%s sobre %s tem contraste de componente (3:1)', (part, surface) => {
    expect(contrastRatio(token(part), token(surface))).toBeGreaterThanOrEqual(3);
  });
});
