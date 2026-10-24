import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import type { AuthApi } from '@/lib/auth-api';
import type { TenancyApi } from '@/lib/tenancy-api';
import { AuthProvider } from './auth/AuthProvider';
import { SessionCacheGuard } from './auth/SessionCacheGuard';
import { routes } from './routes';
import { TenancyApiContext } from './tenancy/tenancy-context';

// Raiz da aplicação. As dependências chegam de main.tsx, para os testes montarem as telas com
// implementações falsas sem tocar no Supabase.
export function App({
  api,
  tenancyApi,
  queryClient,
}: {
  api: AuthApi;
  tenancyApi: TenancyApi;
  queryClient: QueryClient;
}) {
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider api={api}>
        <SessionCacheGuard />
        <TenancyApiContext value={tenancyApi}>
          <RouterProvider router={router} />
        </TenancyApiContext>
      </AuthProvider>
    </QueryClientProvider>
  );
}
