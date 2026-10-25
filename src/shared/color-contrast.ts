// Contraste WCAG 2.2 entre cores OKLCH, o formato dos tokens do design system. Fica em src/shared
// porque o tema de cada empresa (Sprint 3.1, RN-018) vai validar o mesmo cálculo no navegador e na API.

export interface Oklch {
  l: number; // 0 a 1
  c: number;
  h: number; // graus
}

const OKLCH_PATTERN = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/;

// Aceita `oklch(L C H)` com L em porcentagem ou de 0 a 1, sem alfa.
export function parseOklch(value: string): Oklch | null {
  const match = OKLCH_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, l = '', percent, c = '', h = ''] = match;
  const lightness = Number(l) / (percent ? 100 : 1);
  return { l: lightness, c: Number(c), h: Number(h) };
}

// OKLCH → sRGB linear (matrizes de Björn Ottosson). Valores fora do gamut são cortados em 0..1, como
// uma aproximação do mapeamento que o navegador faz.
function toLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return [
    clamp(4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1),
    clamp(-1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1),
    clamp(-0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1),
  ];
}

export function relativeLuminance(color: Oklch): number {
  const [r, g, b] = toLinearSrgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Razão de contraste de 1 a 21, independente da ordem das cores.
export function contrastRatio(a: Oklch, b: Oklch): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}
