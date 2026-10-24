import { Link } from 'react-router';
import { AuthLayout, linkClass } from '@/app/components/AuthLayout';
import { RequirePermission } from '@/app/guards/RequirePermission';
import { RequireTenant } from '@/app/guards/RequireTenant';
import { useActiveTenant } from '@/app/tenancy/tenancy-context';

// Equipe e convites: protegida por members.manage (owner e admin, plano §8). O formulário de convite
// chega com a API do passo 6.
export function TeamPage() {
  return (
    <RequireTenant title="Equipe">
      <RequirePermission permission="members.manage" title="Equipe">
        <TeamPlaceholder />
      </RequirePermission>
    </RequireTenant>
  );
}

function TeamPlaceholder() {
  const { state } = useActiveTenant();
  const name = state.status === 'active' ? state.membership.tenantName : '';
  return (
    <AuthLayout title="Equipe e convites">
      <p className="text-base text-ink">
        Aqui você vai convidar pessoas para <strong>{name}</strong>. O envio de convites chega no
        próximo passo.
      </p>
      <p className="mt-6 text-base">
        <Link to="/app" className={linkClass}>
          Voltar ao painel
        </Link>
      </p>
    </AuthLayout>
  );
}
