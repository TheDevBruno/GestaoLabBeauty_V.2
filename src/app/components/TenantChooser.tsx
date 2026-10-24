import type { TenantMembership } from '@/lib/tenancy-api';
import { memberRoleLabels } from '@/shared/roles';
import { useActiveTenant } from '@/app/tenancy/tenancy-context';

// Lista só as empresas das memberships do usuário (RN-025). Cada opção é um botão de 44 px ou mais,
// com o nome da empresa e o papel por extenso.
export function TenantChooser({ memberships }: { memberships: readonly TenantMembership[] }) {
  const { select } = useActiveTenant();
  return (
    <ul className="flex flex-col gap-3" aria-label="Suas empresas">
      {memberships.map((membership) => (
        <li key={membership.tenantId}>
          <button
            type="button"
            onClick={() => {
              select(membership.tenantId);
            }}
            className="flex min-h-11 w-full flex-col items-start rounded-md border border-line bg-surface px-4 py-2 text-left outline-none hover:bg-canvas focus-visible:ring-3 focus-visible:ring-focus"
          >
            <span className="text-base font-medium text-ink">{membership.tenantName}</span>
            <span className="text-sm text-muted">{memberRoleLabels[membership.role]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
