import { describe, expect, it } from 'vitest';
import { formatPhone, isE164, parsePhoneToE164 } from './phone';

describe('parsePhoneToE164', () => {
  it.each([
    ['(11) 98765-4321', '+5511987654321'],
    ['11987654321', '+5511987654321'],
    ['+55 11 98765-4321', '+5511987654321'],
    ['+55 (11) 98765-4321', '+5511987654321'],
    ['  11 98765.4321  ', '+5511987654321'],
    ['011 98765-4321', '+5511987654321'],
    ['(11) 3456-7890', '+551134567890'],
    ['1134567890', '+551134567890'],
    ['+55 21 2345-6789', '+552123456789'],
    ['+1 415 555 0100', '+14155550100'],
    ['+351 912 345 678', '+351912345678'],
  ])('aceita %j como %s', (input, expected) => {
    expect(parsePhoneToE164(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'abc',
    '11 98765-432a',
    '+55 11 98765/4321',
    '987654321', // sem DDD
    '119876543210', // dígito a mais
    '(01) 98765-4321', // DDD com zero
    '(10) 98765-4321', // DDD com zero no fim
    '(11) 88765-4321', // 9 dígitos sem começar em 9
    '(11) 1234-5678', // fixo começando em 1
    '(11) 6234-5678', // fixo começando em 6
    '+55 11 8765-43', // +55 fora do padrão brasileiro
    '+0 11 98765-4321', // código do país com zero
    '+1234567', // 7 dígitos
    '+1234567890123456', // 16 dígitos
    '++5511987654321',
    '0011987654321', // dois zeros
  ])('recusa %j', (input) => {
    expect(parsePhoneToE164(input)).toBeNull();
  });

  it('o resultado sempre passa no padrão E.164 do banco', () => {
    const result = parsePhoneToE164('(11) 98765-4321');
    expect(result).not.toBeNull();
    expect(isE164(result ?? '')).toBe(true);
  });
});

describe('formatPhone', () => {
  it.each([
    ['+5511987654321', '(11) 98765-4321'],
    ['+551134567890', '(11) 3456-7890'],
    ['+14155550100', '+14155550100'],
    ['+55123', '+55123'],
  ])('%s → %s', (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });

  it('o texto formatado volta ao mesmo E.164', () => {
    for (const e164 of ['+5511987654321', '+551134567890', '+14155550100']) {
      expect(parsePhoneToE164(formatPhone(e164))).toBe(e164);
    }
  });
});
