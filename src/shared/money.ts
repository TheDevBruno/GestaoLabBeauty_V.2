// Valores em dinheiro ficam em centavos inteiros com moeda (RN-032). Este módulo converte o que a pessoa
// digita em reais ("1.234,56") para centavos e formata centavos para exibição em pt-BR.

// Teto da interface: R$ 999.999,99. O banco só exige preço não negativo; o teto evita estourar o
// integer do Postgres (cerca de R$ 21 milhões) e erros de digitação com zeros a mais.
export const MAX_PRICE_CENTS = 99_999_999;

// Parte inteira sem separador ("1234") ou com ponto de milhar em grupos de 3 ("1.234"), seguida
// opcionalmente de vírgula e 1 ou 2 casas. Ponto como separador decimal ("12.50") é recusado: em pt-BR
// ele é de milhar, e aceitar os dois deixaria "1.234" ambíguo.
const BRL_INPUT_PATTERN = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

// Converte o texto digitado em centavos. Aceita "R$" no início e espaços nas pontas. Devolve null se o
// texto não for um valor válido, se for negativo ou se passar de MAX_PRICE_CENTS.
export function parseBrlToCents(input: string): number | null {
  const text = input
    .trim()
    .replace(/^R\$\s*/, '')
    .trim();
  const match = BRL_INPUT_PATTERN.exec(text);
  if (match === null) {
    return null;
  }
  const [, integerPart = '', decimalPart = ''] = match;
  const reais = Number(integerPart.replaceAll('.', ''));
  const cents = reais * 100 + Number(decimalPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > MAX_PRICE_CENTS) {
    return null;
  }
  return cents;
}

// Texto para preencher o campo de preço ao editar: 12000 → "120,00", 123456 → "1234,56". Sem ponto de
// milhar, para a pessoa editar sem precisar apagar separadores.
export function centsToBrlInput(cents: number): string {
  const reais = Math.trunc(cents / 100);
  const rest = String(cents % 100).padStart(2, '0');
  return `${String(reais)},${rest}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

// Exibição: 12000 → "R$ 120,00" (com espaço não separável, como o Intl gera).
export function formatCents(cents: number, currency = 'BRL'): string {
  let formatter = formatters.get(currency);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency });
    formatters.set(currency, formatter);
  }
  return formatter.format(cents / 100);
}
