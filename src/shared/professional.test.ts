import { describe, expect, it } from 'vitest';
import { professionalFormSchema } from './professional';

const serviceA = '5eed0000-0000-0000-0006-000000000001';
const serviceB = '5eed0000-0000-0000-0006-000000000002';
const membership = '5eed0000-0000-0000-0002-000000000004';

const valid = {
  displayName: ' Profissional Teste ',
  membershipId: membership,
  serviceIds: [serviceA, serviceB],
  isActive: true,
};

describe('professionalFormSchema', () => {
  it('apara o nome e mantém os vínculos', () => {
    expect(professionalFormSchema.parse(valid)).toEqual({
      displayName: 'Profissional Teste',
      membershipId: membership,
      serviceIds: [serviceA, serviceB],
      isActive: true,
    });
  });

  it('membro vazio é "sem acesso ao sistema" (null)', () => {
    expect(professionalFormSchema.parse({ ...valid, membershipId: '' }).membershipId).toBeNull();
    expect(professionalFormSchema.parse({ ...valid, membershipId: null }).membershipId).toBeNull();
  });

  it('aceita nenhum serviço e descarta ids repetidos', () => {
    expect(professionalFormSchema.parse({ ...valid, serviceIds: [] }).serviceIds).toEqual([]);
    expect(
      professionalFormSchema.parse({ ...valid, serviceIds: [serviceA, serviceA, serviceB] })
        .serviceIds,
    ).toEqual([serviceA, serviceB]);
  });

  it.each(['', '   ', 'a'.repeat(81)])('recusa nome %j', (displayName) => {
    expect(professionalFormSchema.safeParse({ ...valid, displayName }).success).toBe(false);
  });

  it('aceita nome com 80 caracteres', () => {
    expect(
      professionalFormSchema.safeParse({ ...valid, displayName: 'a'.repeat(80) }).success,
    ).toBe(true);
  });

  it('recusa membro ou serviço com id inválido', () => {
    expect(professionalFormSchema.safeParse({ ...valid, membershipId: 'x' }).success).toBe(false);
    expect(professionalFormSchema.safeParse({ ...valid, serviceIds: ['x'] }).success).toBe(false);
  });
});
