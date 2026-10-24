import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import type { AuthApi, AuthSession } from '@/lib/auth-api';
import type { TenancyApi, TenantMembership } from '@/lib/tenancy-api';
import type { MemberRole } from '@/shared/roles';
import { AuthProvider } from '@/app/auth/AuthProvider';
import { SessionCacheGuard } from '@/app/auth/SessionCacheGuard';
import { routes } from '@/app/routes';
import { TenancyApiContext } from '@/app/tenancy/tenancy-context';

// Só para testes: AuthApi em memória, sem Supabase. Login e cadastro bem-sucedidos abrem a sessão e
// avisam os ouvintes, como o onAuthStateChange real.
export function createFakeAuthApi(initial: AuthSession | null = null) {
  let session = initial;
  const listeners = new Set<(session: AuthSession | null) => void>();
  const setSession = (next: AuthSession | null) => {
    session = next;
    for (const listener of listeners) listener(next);
  };

  const api = {
    getSession: vi.fn<AuthApi['getSession']>(() => Promise.resolve(session)),
    onChange: vi.fn<AuthApi['onChange']>((listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
    signIn: vi.fn<AuthApi['signIn']>(({ email }) => {
      setSession({ userId: 'usuario-teste', email });
      return Promise.resolve({ ok: true });
    }),
    signUp: vi.fn<AuthApi['signUp']>(({ email }) => {
      setSession({ userId: 'usuario-teste', email });
      return Promise.resolve({ ok: true, needsConfirmation: false });
    }),
    signOut: vi.fn<AuthApi['signOut']>(() => {
      setSession(null);
      return Promise.resolve();
    }),
    acceptInvitation: vi.fn<AuthApi['acceptInvitation']>(() =>
      Promise.resolve({ ok: true, tenantId: '00000000-0000-0000-0000-00000000000a' }),
    ),
  } satisfies AuthApi;

  return { api, setSession };
}

// Matriz do plano §8 resumida ao que os testes de tela usam.
const PERMISSIONS: Record<MemberRole, string[]> = {
  owner: ['members.manage', 'tenant.settings'],
  admin: ['members.manage', 'tenant.settings'],
  manager: ['services.manage'],
  specialist: ['appointments.read'],
  receptionist: ['appointments.read'],
  financial: ['finance.read'],
};

export function membership(tenant: 'A' | 'B', role: MemberRole = 'owner'): TenantMembership {
  return {
    membershipId: `membership-${tenant}`,
    tenantId: `tenant-${tenant}`,
    tenantName: tenant === 'A' ? 'Studio Ana' : 'Clínica Bela',
    tenantSlug: tenant === 'A' ? 'studio-ana' : 'clinica-bela',
    role,
  };
}

// TenancyApi em memória. setMemberships simula concessão ou revogação no banco.
export function createFakeTenancyApi(initial: TenantMembership[] = [membership('A')]) {
  let memberships = initial;
  const api = {
    listMyMemberships: vi.fn<TenancyApi['listMyMemberships']>(() => Promise.resolve(memberships)),
    listRolePermissions: vi.fn<TenancyApi['listRolePermissions']>((role) =>
      Promise.resolve(PERMISSIONS[role]),
    ),
  } satisfies TenancyApi;
  const setMemberships = (next: TenantMembership[]) => {
    memberships = next;
  };
  return { api, setMemberships };
}

export function renderAt(
  path: string,
  api: AuthApi,
  tenancyApi: TenancyApi = createFakeTenancyApi().api,
) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider api={api}>
        <SessionCacheGuard />
        <TenancyApiContext value={tenancyApi}>
          <RouterProvider router={router} />
        </TenancyApiContext>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { router, user, queryClient };
}

export const SIGNED_IN: AuthSession = { userId: 'usuario-teste', email: 'ana@example.test' };
