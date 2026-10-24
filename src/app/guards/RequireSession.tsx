import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/app/auth/auth-context';
import { loginPath } from '@/app/auth/redirect';
import { LoadingScreen } from '@/app/components/LoadingScreen';
import { ActiveTenantProvider } from '@/app/tenancy/ActiveTenantProvider';

// Layout das rotas privadas (/app/*). Sem sessão, manda para /entrar e volta para a rota pedida. Com
// sessão, carrega a empresa ativa do usuário. A key troca o provider inteiro quando o usuário muda.
export function RequireSession() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') return <LoadingScreen title="Painel" />;
  if (state.status === 'signed-out') {
    return <Navigate to={loginPath(`${location.pathname}${location.search}`)} replace />;
  }

  return (
    <ActiveTenantProvider key={state.session.userId} userId={state.session.userId}>
      <Outlet />
    </ActiveTenantProvider>
  );
}
