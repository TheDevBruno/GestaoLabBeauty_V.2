// Telefone do cliente gravado em E.164 (RN-045, "+5511987654321"), igual ao CHECK clients_phone_format da
// migration 20261025140000. A tela aceita o formato brasileiro e devolve o número formatado em pt-BR.

// Mesmo padrão do banco: "+", código do país sem zero à esquerda e de 8 a 15 dígitos no total.
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

// Separadores aceitos na digitação: espaço, parênteses, hífen e ponto. Qualquer outro caractere recusa.
const SEPARATORS = /[\s().-]/g;

const BRAZIL_CODE = '55';

// Número nacional brasileiro: DDD de 11 a 99 sem zero, e fixo com 8 dígitos começando em 2 a 5 ou
// celular com 9 dígitos começando em 9.
const BR_NATIONAL_PATTERN = /^[1-9]{2}(?:[2-5]\d{7}|9\d{8})$/;

export function isE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

// Converte o que a pessoa digitou em E.164. Aceita "(11) 98765-4321", "11987654321", "011 98765-4321"
// (zero de longa distância) e "+55 11 98765-4321"; número de outro país só com "+". Devolve null para
// texto vazio ou inválido.
export function parsePhoneToE164(input: string): string | null {
  const text = input.trim();
  const international = text.startsWith('+');
  const digits = (international ? text.slice(1) : text).replace(SEPARATORS, '');
  if (!/^\d+$/.test(digits)) {
    return null;
  }

  if (international) {
    if (digits.startsWith(BRAZIL_CODE) && !BR_NATIONAL_PATTERN.test(digits.slice(2))) {
      return null;
    }
    const e164 = `+${digits}`;
    return isE164(e164) ? e164 : null;
  }

  const national = digits.startsWith('0') ? digits.slice(1) : digits;
  return BR_NATIONAL_PATTERN.test(national) ? `+${BRAZIL_CODE}${national}` : null;
}

// Exibição e texto para editar: "+5511987654321" → "(11) 98765-4321", "+551134567890" → "(11) 3456-7890".
// Número de outro país (ou fora do padrão brasileiro) volta como está; o parser aceita os dois.
export function formatPhone(e164: string): string {
  if (!e164.startsWith(`+${BRAZIL_CODE}`)) {
    return e164;
  }
  const national = e164.slice(3);
  if (!BR_NATIONAL_PATTERN.test(national)) {
    return e164;
  }
  const ddd = national.slice(0, 2);
  const number = national.slice(2);
  const split = number.length - 4;
  return `(${ddd}) ${number.slice(0, split)}-${number.slice(split)}`;
}
