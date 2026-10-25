import { createContext, useContext } from 'react';
import type { ServicesApi } from './services-api';

export const ServicesApiContext = createContext<ServicesApi | null>(null);

export function useServicesApi(): ServicesApi {
  const api = useContext(ServicesApiContext);
  if (!api) throw new Error('useServicesApi precisa estar dentro de <ServicesApiContext>.');
  return api;
}

// Lista e detalhe ficam sob o mesmo prefixo: salvar invalida os dois de uma vez.
export function servicesQueryKey(tenantId: string) {
  return ['services', tenantId] as const;
}

export function serviceQueryKey(tenantId: string, serviceId: string) {
  return ['services', tenantId, serviceId] as const;
}

// Aviso que a página de formulário deixa para a lista mostrar depois de salvar.
export interface ServicesNotice {
  notice: string;
}

export function readServicesNotice(state: unknown): string | null {
  if (typeof state === 'object' && state !== null && 'notice' in state) {
    return typeof state.notice === 'string' ? state.notice : null;
  }
  return null;
}
