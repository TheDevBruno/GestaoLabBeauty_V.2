import type { TenantMembership } from '@/lib/tenancy-api';

// Empresa ativa (RN-025, ADR-003 §5): preferência de interface, escolhida só entre as memberships do
// usuário. O valor guardado é revalidado contra a lista a cada carga; a RLS continua sendo a barreira.

export type TenantResolution =
  { status: 'none' } | { status: 'choose' } | { status: 'active'; membership: TenantMembership };

export function resolveActiveTenant(
  memberships: readonly TenantMembership[],
  preferredTenantId: string | null,
): TenantResolution {
  const [only] = memberships;
  if (!only) return { status: 'none' };
  if (memberships.length === 1) return { status: 'active', membership: only };
  const preferred = memberships.find((m) => m.tenantId === preferredTenantId);
  return preferred ? { status: 'active', membership: preferred } : { status: 'choose' };
}

export interface PreferenceStore {
  get(): string | null;
  set(tenantId: string): void;
  clear(): void;
}

const KEY_PREFIX = 'labbeautypro.empresa-ativa.';

// Uma preferência por usuário, para duas contas no mesmo navegador não herdarem a escolha uma da
// outra. Storage pode faltar ou lançar (aba privada, bloqueio): a escolha vale só enquanto a página
// estiver aberta.
export function createPreferenceStore(
  storage: Storage | undefined,
  userId: string,
): PreferenceStore {
  const key = `${KEY_PREFIX}${userId}`;
  return {
    get() {
      try {
        return storage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(tenantId) {
      try {
        storage?.setItem(key, tenantId);
      } catch {
        // sem armazenamento
      }
    },
    clear() {
      try {
        storage?.removeItem(key);
      } catch {
        // nada a limpar
      }
    },
  };
}
