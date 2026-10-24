import { queryOptions } from '@tanstack/react-query';
import type { TenancyApi } from '@/lib/tenancy-api';
import type { MemberRole } from '@/shared/roles';

// RN-024: papel e membership revogados precisam sumir da interface sem novo login. A lista de
// memberships nunca é considerada atual (staleTime 0) e é buscada de novo ao focar a janela, ao
// reconectar, ao navegar (ActiveTenantProvider) e a cada minuto com a aba visível. Os dados em si já
// são protegidos pela RLS, que lê memberships a cada consulta.
export const MEMBERSHIPS_REFETCH_MS = 60_000;

export function membershipsQuery(api: TenancyApi, userId: string) {
  return queryOptions({
    queryKey: ['memberships', userId],
    queryFn: () => api.listMyMemberships(userId),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: MEMBERSHIPS_REFETCH_MS,
    refetchIntervalInBackground: false,
  });
}

// A matriz de permissões é global e só muda por migration; o papel do usuário vem da membership acima.
// Sem papel (sem empresa ativa), a consulta fica desligada.
export function rolePermissionsQuery(api: TenancyApi, role: MemberRole | null) {
  return queryOptions({
    queryKey: ['role-permissions', role],
    queryFn: () => (role ? api.listRolePermissions(role) : Promise.resolve([])),
    enabled: role !== null,
    staleTime: 5 * 60_000,
  });
}
