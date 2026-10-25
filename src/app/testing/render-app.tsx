import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import type { AuthApi, AuthSession } from '@/lib/auth-api';
import type { InvitationsApi, PendingInvitation } from '@/lib/invitations-api';
import type { TenancyApi, TenantMembership } from '@/lib/tenancy-api';
import type { MemberRole } from '@/shared/roles';
import type { ServicesApi, Service } from '@/modules/services/services-api';
import { ServicesApiContext } from '@/modules/services/services-context';
import { AuthProvider } from '@/app/auth/AuthProvider';
import { SessionCacheGuard } from '@/app/auth/SessionCacheGuard';
import { routes } from '@/app/routes';
import { InvitationsApiContext } from '@/app/team/invitations-context';
import { TenancyApiContext } from '@/app/tenancy/tenancy-context';

// O jsdom não tem ResizeObserver nem captura de ponteiro, que o menu e a gaveta do Radix usam no app
// shell. Os testes de tela importam este módulo, então o ajuste vale para todos eles.
if (typeof globalThis.ResizeObserver === 'undefined') {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {
        /* sem layout no jsdom */
      }
      unobserve() {
        /* sem layout no jsdom */
      }
      disconnect() {
        /* sem layout no jsdom */
      }
    },
  );
}
if (typeof Element !== 'undefined') {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    scrollIntoView: () => undefined,
  });
}

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
  owner: ['members.manage', 'tenant.settings', 'services.manage'],
  admin: ['members.manage', 'tenant.settings', 'services.manage'],
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

export const INVITATION_TOKEN = 'T'.repeat(43);

export function pendingInvitation(
  email: string,
  role: MemberRole = 'receptionist',
  expiresAt = '2099-01-01T12:00:00.000Z',
): PendingInvitation {
  return { id: `convite-${email}`, email, role, expiresAt, createdAt: '2026-10-23T12:00:00.000Z' };
}

// InvitationsApi em memória: criar acrescenta à lista de pendentes, revogar retira.
export function createFakeInvitationsApi(initial: PendingInvitation[] = []) {
  let pending = initial;
  const api = {
    listPending: vi.fn<InvitationsApi['listPending']>(() => Promise.resolve(pending)),
    create: vi.fn<InvitationsApi['create']>(({ email, role }) => {
      const invitation = pendingInvitation(email, role);
      pending = [invitation, ...pending];
      return Promise.resolve({
        ok: true,
        id: invitation.id,
        link: `/convite#${INVITATION_TOKEN}`,
        expiresAt: '2026-10-30T12:00:00.000Z',
      });
    }),
    revoke: vi.fn<InvitationsApi['revoke']>((id) => {
      pending = pending.filter((invitation) => invitation.id !== id);
      return Promise.resolve();
    }),
  } satisfies InvitationsApi;
  return { api };
}

let serviceSeq = 0;

export function service(name: string, overrides: Partial<Service> = {}): Service {
  serviceSeq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(serviceSeq).padStart(12, '0')}`,
    name,
    description: null,
    durationMinutes: 60,
    bufferMinutes: null,
    priceCents: 12000,
    currency: 'BRL',
    isActive: true,
    ...overrides,
  };
}

// ServicesApi em memória, com o nome único por empresa sem diferenciar maiúsculas (RN-040), como o
// índice do banco. Os ids novos seguem a forma de uuid.
export function createFakeServicesApi(initial: Service[] = []) {
  let services = initial;
  let next = 1;
  const duplicate = (name: string, exceptId?: string) =>
    services.some((item) => item.id !== exceptId && item.name.toLowerCase() === name.toLowerCase());
  const api = {
    list: vi.fn<ServicesApi['list']>(() =>
      Promise.resolve([...services].sort((a, b) => a.name.localeCompare(b.name))),
    ),
    get: vi.fn<ServicesApi['get']>((_tenantId, id) =>
      Promise.resolve(services.find((item) => item.id === id) ?? null),
    ),
    create: vi.fn<ServicesApi['create']>((_tenantId, input) => {
      if (duplicate(input.name)) {
        return Promise.resolve({
          ok: false,
          message: 'Confira os dados do serviço.',
          fieldErrors: { name: 'Já existe um serviço com este nome nesta empresa.' },
        });
      }
      const created: Service = {
        id: `10000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
        name: input.name,
        description: input.description,
        durationMinutes: input.durationMinutes,
        bufferMinutes: input.bufferMinutes,
        priceCents: input.price,
        currency: 'BRL',
        isActive: input.isActive,
      };
      services = [...services, created];
      return Promise.resolve({ ok: true, service: created });
    }),
    update: vi.fn<ServicesApi['update']>((_tenantId, id, input) => {
      const current = services.find((item) => item.id === id);
      if (!current) return Promise.resolve({ ok: false, message: 'Serviço não encontrado.' });
      const updated: Service = {
        ...current,
        name: input.name,
        description: input.description,
        durationMinutes: input.durationMinutes,
        bufferMinutes: input.bufferMinutes,
        priceCents: input.price,
        isActive: input.isActive,
      };
      services = services.map((item) => (item.id === id ? updated : item));
      return Promise.resolve({ ok: true, service: updated });
    }),
  } satisfies ServicesApi;
  return { api };
}

export function renderAt(
  path: string,
  api: AuthApi,
  tenancyApi: TenancyApi = createFakeTenancyApi().api,
  invitationsApi: InvitationsApi = createFakeInvitationsApi().api,
  servicesApi: ServicesApi = createFakeServicesApi().api,
) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider api={api}>
        <SessionCacheGuard />
        <TenancyApiContext value={tenancyApi}>
          <InvitationsApiContext value={invitationsApi}>
            <ServicesApiContext value={servicesApi}>
              <RouterProvider router={router} />
            </ServicesApiContext>
          </InvitationsApiContext>
        </TenancyApiContext>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { router, user, queryClient };
}

export const SIGNED_IN: AuthSession = { userId: 'usuario-teste', email: 'ana@example.test' };
