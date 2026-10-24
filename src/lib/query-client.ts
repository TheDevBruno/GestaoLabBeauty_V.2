import { QueryClient } from '@tanstack/react-query';

const MAX_RETRIES = 2;

// Erro 4xx (sem permissão, não encontrado, validação) não melhora tentando de novo: só falhas de
// rede e 5xx são repetidas, até MAX_RETRIES vezes.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const { status } = error;
    if (typeof status === 'number' && status >= 400 && status < 500) return false;
  }
  return true;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
      },
    },
  });
}
