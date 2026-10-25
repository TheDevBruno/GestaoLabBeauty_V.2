import { createContext, useContext } from 'react';
import type { ProfessionalsApi } from './professionals-api';

export const ProfessionalsApiContext = createContext<ProfessionalsApi | null>(null);

export function useProfessionalsApi(): ProfessionalsApi {
  const api = useContext(ProfessionalsApiContext);
  if (!api) {
    throw new Error('useProfessionalsApi precisa estar dentro de <ProfessionalsApiContext>.');
  }
  return api;
}

// Lista, detalhe e candidatos ficam sob o mesmo prefixo: salvar ou excluir invalida tudo de uma vez
// (o vínculo com um membro muda a lista de candidatos).
export function professionalsQueryKey(tenantId: string) {
  return ['professionals', tenantId] as const;
}

export function professionalQueryKey(tenantId: string, professionalId: string) {
  return ['professionals', tenantId, professionalId] as const;
}

export function linkCandidatesQueryKey(tenantId: string) {
  return ['professionals', tenantId, 'candidates'] as const;
}
