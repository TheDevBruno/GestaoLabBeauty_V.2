import { createContext, useContext } from 'react';
import type { ClientsApi } from './clients-api';

export const ClientsApiContext = createContext<ClientsApi | null>(null);

export function useClientsApi(): ClientsApi {
  const api = useContext(ClientsApiContext);
  if (!api) throw new Error('useClientsApi precisa estar dentro de <ClientsApiContext>.');
  return api;
}

// Busca e detalhe ficam sob o mesmo prefixo: salvar invalida os dois de uma vez.
export function clientsQueryKey(tenantId: string) {
  return ['clients', tenantId] as const;
}

export function clientsSearchQueryKey(tenantId: string, query: string, includeArchived: boolean) {
  return ['clients', tenantId, 'search', query, includeArchived] as const;
}

export function clientQueryKey(tenantId: string, clientId: string) {
  return ['clients', tenantId, 'detail', clientId] as const;
}
