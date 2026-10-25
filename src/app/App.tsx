import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import type { AuthApi } from '@/lib/auth-api';
import type { InvitationsApi } from '@/lib/invitations-api';
import type { TenancyApi } from '@/lib/tenancy-api';
import type { ProfessionalsApi } from '@/modules/professionals/professionals-api';
import { ProfessionalsApiContext } from '@/modules/professionals/professionals-context';
import type { ServicesApi } from '@/modules/services/services-api';
import { ServicesApiContext } from '@/modules/services/services-context';
import { AuthProvider } from './auth/AuthProvider';
import { SessionCacheGuard } from './auth/SessionCacheGuard';
import { routes } from './routes';
import { InvitationsApiContext } from './team/invitations-context';
import { TenancyApiContext } from './tenancy/tenancy-context';

// Raiz da aplicação. As dependências chegam de main.tsx, para os testes montarem as telas com
// implementações falsas sem tocar no Supabase.
export function App({
  api,
  tenancyApi,
  invitationsApi,
  servicesApi,
  professionalsApi,
  queryClient,
}: {
  api: AuthApi;
  tenancyApi: TenancyApi;
  invitationsApi: InvitationsApi;
  servicesApi: ServicesApi;
  professionalsApi: ProfessionalsApi;
  queryClient: QueryClient;
}) {
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider api={api}>
        <SessionCacheGuard />
        <TenancyApiContext value={tenancyApi}>
          <InvitationsApiContext value={invitationsApi}>
            <ServicesApiContext value={servicesApi}>
              <ProfessionalsApiContext value={professionalsApi}>
                <RouterProvider router={router} />
              </ProfessionalsApiContext>
            </ServicesApiContext>
          </InvitationsApiContext>
        </TenancyApiContext>
      </AuthProvider>
    </QueryClientProvider>
  );
}
