import { z } from 'zod';

// Limite de public.professionals.display_name (migration 20261025120000).
export const PROFESSIONAL_NAME_MAX_LENGTH = 80;

// z.guid e não z.uuid: os ids do seed não têm versão RFC (ver invitation.ts).
const idSchema = z.guid({ error: 'Seleção inválida.' });

export const professionalFormSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { error: 'Informe o nome do profissional.' })
    .max(PROFESSIONAL_NAME_MAX_LENGTH, {
      error: `O nome deve ter no máximo ${String(PROFESSIONAL_NAME_MAX_LENGTH)} caracteres.`,
    }),
  // Membro com acesso ao sistema; vazio = "Sem acesso ao sistema" (RN-035).
  membershipId: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    idSchema.nullable(),
  ),
  // Serviços que faz (RN-043). Duplicados são descartados; a PK do vínculo recusaria de todo modo.
  serviceIds: z.array(idSchema).transform((ids) => [...new Set(ids)]),
  isActive: z.boolean(),
});

export type ProfessionalFormInput = z.input<typeof professionalFormSchema>;
export type ProfessionalFormOutput = z.output<typeof professionalFormSchema>;
