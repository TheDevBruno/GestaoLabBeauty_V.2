import { Link } from 'react-router';
import { memberRoleLabels } from '@/shared/roles';
import { AuthLayout, linkClass } from '@/app/components/AuthLayout';
import { Button } from '@/app/components/Button';
import { SignOutButton } from '@/app/components/SignOutButton';
import { useAuth } from '@/app/auth/auth-context';
import { RequireTenant } from '@/app/guards/RequireTenant';
import { useActiveTenant } from '@/app/tenancy/tenancy-context';
import { usePermission } from '@/app/tenancy/usePermission';

// Painel provisório. O app shell e a navegação definitiva são a Sprint 1.4.
export function HomePage() {
  return (
    <RequireTenant title="Painel">
      <ActiveTenantSummary />
    </RequireTenant>
  );
}

function ActiveTenantSummary() {
  const { state: auth } = useAuth();
  const { state, change } = useActiveTenant();
  const canManageMembers = usePermission('members.manage') === 'allowed';
  if (state.status !== 'active' || auth.status !== 'signed-in') return null;
  const { membership, memberships } = state;

  return (
    <AuthLayout title={membership.tenantName}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
        <dt className="text-muted">Conta</dt>
        <dd className="break-all text-ink">{auth.session.email ?? 'sem e-mail'}</dd>
        <dt className="text-muted">Papel</dt>
        <dd className="text-ink">{memberRoleLabels[membership.role]}</dd>
      </dl>
      {canManageMembers ? (
        <p className="mt-6 text-base">
          <Link to="/app/equipe" className={linkClass}>
            Equipe e convites
          </Link>
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3">
        {memberships.length > 1 ? (
          <Button variant="secondary" onClick={change}>
            Trocar de empresa
          </Button>
        ) : null}
        <SignOutButton />
      </div>
    </AuthLayout>
  );
}
