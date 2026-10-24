import type { ReactNode } from 'react';
import { TextLink } from '@/components/ui/text-link';
import { AuthLayout } from '@/app/components/AuthLayout';
import { LoadingScreen } from '@/app/components/LoadingScreen';
import { usePermission } from '@/app/tenancy/usePermission';

// Guarda de tela por permissão (plano §8). Vai dentro de RequireTenant. É conveniência de interface:
// a RLS nega os dados a quem não tem a permissão, com ou sem esta guarda.
export function RequirePermission({
  permission,
  title,
  children,
}: {
  permission: string;
  title: string;
  children: ReactNode;
}) {
  const result = usePermission(permission);
  if (result === 'loading') return <LoadingScreen title={title} />;
  if (result === 'denied') {
    return (
      <AuthLayout title="Acesso não permitido">
        <p role="alert" className="text-base text-foreground">
          Seu papel nesta empresa não permite abrir esta página.
        </p>
        <p className="mt-6 text-base">
          <TextLink to="/app">Voltar ao painel</TextLink>
        </p>
      </AuthLayout>
    );
  }
  return children;
}
