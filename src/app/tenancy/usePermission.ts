import { useQuery } from '@tanstack/react-query';
import { rolePermissionsQuery } from './queries';
import { useActiveTenant, useTenancyApi } from './tenancy-context';

export type PermissionState = 'loading' | 'allowed' | 'denied';

// Permissão do papel do usuário na empresa ativa (plano §8). Só decide o que a interface mostra: o
// banco aplica a mesma matriz pela RLS, então esconder um botão nunca é a única proteção.
export function usePermission(permission: string): PermissionState {
  const api = useTenancyApi();
  const { state } = useActiveTenant();
  const role = state.status === 'active' ? state.membership.role : null;
  const query = useQuery(rolePermissionsQuery(api, role));

  if (state.status === 'loading') return 'loading';
  if (role === null) return 'denied';
  if (query.isPending) return 'loading';
  if (query.isError) return 'denied';
  return query.data.includes(permission) ? 'allowed' : 'denied';
}
