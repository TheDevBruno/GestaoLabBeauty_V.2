import type { ReactNode } from 'react';
import { TextLink } from '@/components/ui/text-link';
import { ShellPage } from '@/app/shell/ShellPage';
import { usePermission } from '@/app/tenancy/usePermission';

// Guarda de tela por permissão (plano §8), para páginas dentro do app shell. É conveniência de
// interface: a RLS nega os dados a quem não tem a permissão, com ou sem esta guarda. `deny` nega mesmo
// com a permissão, para regras que a matriz não expressa (o specialist não cadastra cliente, RN-036).
export function RequirePermission({
  permission,
  title,
  deny = false,
  children,
}: {
  permission: string;
  title: string;
  deny?: boolean;
  children: ReactNode;
}) {
  const permissionResult = usePermission(permission);
  const result = deny && permissionResult !== 'loading' ? 'denied' : permissionResult;
  if (result === 'loading') {
    return (
      <ShellPage title={title}>
        <p role="status" className="text-base text-muted-foreground">
          Carregando…
        </p>
      </ShellPage>
    );
  }
  if (result === 'denied') {
    return (
      <ShellPage title="Acesso não permitido">
        <p role="alert" className="text-base text-foreground">
          Seu papel nesta empresa não permite abrir esta página.
        </p>
        <p className="mt-6 text-base">
          <TextLink to="/app">Voltar ao painel</TextLink>
        </p>
      </ShellPage>
    );
  }
  return children;
}
