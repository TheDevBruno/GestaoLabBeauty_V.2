import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AuthLayout } from '@/app/components/AuthLayout';
import { LoadingScreen } from '@/app/components/LoadingScreen';
import { SignOutButton } from '@/app/components/SignOutButton';
import { TenantChooser } from '@/app/components/TenantChooser';
import { useActiveTenant } from '@/app/tenancy/tenancy-context';

// Só renderiza o conteúdo com uma empresa ativa válida. Sem membership, explica como entrar numa
// empresa; com várias e nenhuma escolhida, mostra o seletor (RN-025).
export function RequireTenant({ title, children }: { title: string; children: ReactNode }) {
  const { state } = useActiveTenant();

  switch (state.status) {
    case 'loading':
      return <LoadingScreen title={title} />;
    case 'error':
      return (
        <AuthLayout title={title}>
          <p role="alert" className="text-base text-destructive">
            Não foi possível carregar suas empresas.
          </p>
          <Button className="mt-6 w-full" onClick={state.retry}>
            Tentar de novo
          </Button>
        </AuthLayout>
      );
    case 'none':
      return (
        <AuthLayout title="Nenhuma empresa">
          <p className="text-base text-foreground">
            Sua conta ainda não faz parte de nenhuma empresa. Peça a quem administra a empresa um
            convite para o seu e-mail e abra o link recebido.
          </p>
          <SignOutButton className="mt-6 w-full" />
        </AuthLayout>
      );
    case 'choose':
      return (
        <AuthLayout title="Escolha a empresa">
          <TenantChooser memberships={state.memberships} />
          <SignOutButton className="mt-6 w-full" />
        </AuthLayout>
      );
    case 'active':
      return children;
  }
}
