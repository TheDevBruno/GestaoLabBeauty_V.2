import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from './auth-context';

// Ao sair, apaga o cache de consultas: a próxima pessoa no mesmo navegador não vê, nem por um
// instante, empresas ou permissões da sessão anterior.
export function SessionCacheGuard() {
  const { state } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (state.status === 'signed-out') queryClient.clear();
  }, [state.status, queryClient]);
  return null;
}
