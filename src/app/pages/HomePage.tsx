import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '@/app/auth/auth-context';
import { loginPath } from '@/app/auth/redirect';
import { AuthLayout } from '@/app/components/AuthLayout';
import { Button } from '@/app/components/Button';

// Painel provisório. A escolha da empresa ativa e os guards de permissão chegam no passo 5; o app
// shell, na Sprint 1.4.
export function HomePage() {
  const { state, api } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (state.status === 'loading') {
    return (
      <AuthLayout title="Painel">
        <p role="status" className="text-base text-muted">
          Carregando…
        </p>
      </AuthLayout>
    );
  }

  if (state.status === 'signed-out') return <Navigate to={loginPath('/app')} replace />;

  async function signOut() {
    setBusy(true);
    await api.signOut();
    void navigate('/entrar', { replace: true });
  }

  return (
    <AuthLayout title="Painel">
      <p className="text-base text-ink">
        Você entrou como <strong>{state.session.email ?? 'usuário sem e-mail'}</strong>.
      </p>
      <Button
        variant="secondary"
        className="mt-6 w-full"
        busy={busy}
        busyLabel="Saindo…"
        onClick={() => {
          void signOut();
        }}
      >
        Sair
      </Button>
    </AuthLayout>
  );
}
