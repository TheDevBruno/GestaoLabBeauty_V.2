import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import type { AuthApi, AuthSession } from '@/lib/auth-api';
import type { InvitationsApi, PendingInvitation } from '@/lib/invitations-api';
import type { TenancyApi, TenantMembership } from '@/lib/tenancy-api';
import type { MemberRole } from '@/shared/roles';
import { type Client, type ClientsApi, CLIENTS_PAGE_SIZE } from '@/modules/clients/clients-api';
import { ClientsApiContext } from '@/modules/clients/clients-context';
import type {
  LinkCandidate,
  Professional,
  ProfessionalsApi,
} from '@/modules/professionals/professionals-api';
import { ProfessionalsApiContext } from '@/modules/professionals/professionals-context';
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
const CLIENTS_FULL = ['clients.read', 'clients.write', 'clients.notes.private'];
const PERMISSIONS: Record<MemberRole, string[]> = {
  owner: ['members.manage', 'tenant.settings', 'services.manage', ...CLIENTS_FULL],
  admin: ['members.manage', 'tenant.settings', 'services.manage', ...CLIENTS_FULL],
  manager: ['services.manage', ...CLIENTS_FULL],
  specialist: ['appointments.read', ...CLIENTS_FULL],
  receptionist: ['appointments.read', 'clients.read', 'clients.write'],
  financial: ['finance.read', 'clients.read'],
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

let professionalSeq = 0;

export function professional(
  displayName: string,
  overrides: Partial<Professional> = {},
): Professional {
  professionalSeq += 1;
  return {
    id: `20000000-0000-4000-8000-${String(professionalSeq).padStart(12, '0')}`,
    displayName,
    membershipId: null,
    isActive: true,
    serviceIds: [],
    ...overrides,
  };
}

export function linkCandidate(
  membershipId: string,
  fullName: string | null,
  role: MemberRole,
  professionalId: string | null = null,
): LinkCandidate {
  return { membershipId, fullName, role, professionalId };
}

// ProfessionalsApi em memória. Os candidatos acompanham os vínculos com membros, como a função do
// banco; `withAppointments` simula o profissional que o banco recusa excluir (FK de appointments).
export function createFakeProfessionalsApi(
  initial: Professional[] = [],
  members: LinkCandidate[] = [],
  withAppointments: string[] = [],
) {
  let professionals = initial;
  let next = 1;
  const memberTaken = (membershipId: string | null, exceptId?: string) =>
    membershipId !== null &&
    professionals.some((item) => item.id !== exceptId && item.membershipId === membershipId);
  const taken = {
    ok: false as const,
    message: 'Confira os dados do profissional.',
    fieldErrors: { membershipId: 'Este membro já está ligado a outro profissional.' },
  };
  const api = {
    list: vi.fn<ProfessionalsApi['list']>(() =>
      Promise.resolve(
        [...professionals].sort((a, b) => a.displayName.localeCompare(b.displayName)),
      ),
    ),
    get: vi.fn<ProfessionalsApi['get']>((_tenantId, id) =>
      Promise.resolve(professionals.find((item) => item.id === id) ?? null),
    ),
    listCandidates: vi.fn<ProfessionalsApi['listCandidates']>(() =>
      Promise.resolve(
        members.map((member) => ({
          ...member,
          professionalId:
            professionals.find((item) => item.membershipId === member.membershipId)?.id ?? null,
        })),
      ),
    ),
    create: vi.fn<ProfessionalsApi['create']>((_tenantId, input) => {
      if (memberTaken(input.membershipId)) return Promise.resolve(taken);
      const created: Professional = {
        id: `30000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
        ...input,
      };
      professionals = [...professionals, created];
      return Promise.resolve({ ok: true, professional: created, linksSaved: true });
    }),
    update: vi.fn<ProfessionalsApi['update']>((_tenantId, current, input) => {
      if (memberTaken(input.membershipId, current.id)) return Promise.resolve(taken);
      const updated: Professional = { id: current.id, ...input };
      professionals = professionals.map((item) => (item.id === current.id ? updated : item));
      return Promise.resolve({ ok: true, professional: updated, linksSaved: true });
    }),
    remove: vi.fn<ProfessionalsApi['remove']>((_tenantId, id) => {
      if (withAppointments.includes(id)) {
        return Promise.resolve({
          ok: false,
          message:
            'Este profissional tem agendamentos e não pode ser excluído. Desmarque “Profissional ativo” e salve para tirá-lo da agenda nova.',
        });
      }
      professionals = professionals.filter((item) => item.id !== id);
      return Promise.resolve({ ok: true });
    }),
  } satisfies ProfessionalsApi;
  return { api };
}

let clientSeq = 0;

export function client(fullName: string, overrides: Partial<Client> = {}): Client {
  clientSeq += 1;
  return {
    id: `40000000-0000-4000-8000-${String(clientSeq).padStart(12, '0')}`,
    fullName,
    phone: null,
    email: null,
    birthDate: null,
    isActive: true,
    ...overrides,
  };
}

// Sem acento e minúsculo, como private.search_text no banco.
const searchText = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// ClientsApi em memória com as regras de public.search_clients (RN-047): nome sem acento nem
// maiúsculas, 3 ou mais dígitos também no telefone, arquivados só com o filtro, ordem por nome e
// páginas de CLIENTS_PAGE_SIZE. O recorte do specialist fica a cargo de quem monta a lista inicial.
export function createFakeClientsApi(initial: Client[] = []) {
  let clients = initial;
  let next = 1;
  const api = {
    search: vi.fn<ClientsApi['search']>((_tenantId, { query, includeArchived, offset }) => {
      const name = searchText(query.trim());
      const digits = query.replace(/[\s().+-]/g, '');
      const matches = clients
        .filter((item) => includeArchived || item.isActive)
        .filter(
          (item) =>
            name === '' ||
            searchText(item.fullName).includes(name) ||
            (/^\d{3,}$/.test(digits) && (item.phone ?? '').includes(digits)),
        )
        .sort((a, b) => searchText(a.fullName).localeCompare(searchText(b.fullName)));
      const page = matches.slice(offset, offset + CLIENTS_PAGE_SIZE + 1);
      return Promise.resolve({
        clients: page.slice(0, CLIENTS_PAGE_SIZE),
        hasMore: page.length > CLIENTS_PAGE_SIZE,
      });
    }),
    get: vi.fn<ClientsApi['get']>((_tenantId, id) =>
      Promise.resolve(clients.find((item) => item.id === id) ?? null),
    ),
    create: vi.fn<ClientsApi['create']>((_tenantId, input) => {
      const created: Client = {
        id: `50000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
        ...input,
      };
      clients = [...clients, created];
      return Promise.resolve({ ok: true, client: created });
    }),
    // Cliente fora da lista (outra empresa ou fora do recorte) não é alterado, como a RLS.
    update: vi.fn<ClientsApi['update']>((_tenantId, id, input) => {
      if (!clients.some((item) => item.id === id)) {
        return Promise.resolve({
          ok: false,
          message:
            'Este cliente não existe mais ou não está disponível para você nesta empresa. Volte à lista.',
        });
      }
      const updated: Client = { id, ...input };
      clients = clients.map((item) => (item.id === id ? updated : item));
      return Promise.resolve({ ok: true, client: updated });
    }),
  } satisfies ClientsApi;
  return { api };
}

export function renderAt(
  path: string,
  api: AuthApi,
  tenancyApi: TenancyApi = createFakeTenancyApi().api,
  invitationsApi: InvitationsApi = createFakeInvitationsApi().api,
  servicesApi: ServicesApi = createFakeServicesApi().api,
  professionalsApi: ProfessionalsApi = createFakeProfessionalsApi().api,
  clientsApi: ClientsApi = createFakeClientsApi().api,
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
              <ProfessionalsApiContext value={professionalsApi}>
                <ClientsApiContext value={clientsApi}>
                  <RouterProvider router={router} />
                </ClientsApiContext>
              </ProfessionalsApiContext>
            </ServicesApiContext>
          </InvitationsApiContext>
        </TenancyApiContext>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { router, user, queryClient };
}

export const SIGNED_IN: AuthSession = { userId: 'usuario-teste', email: 'ana@example.test' };
