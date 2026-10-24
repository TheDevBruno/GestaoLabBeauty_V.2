import { useActiveTenant } from '@/app/tenancy/tenancy-context';
import { ShellPage } from '@/app/shell/ShellPage';

// Painel inicial dentro do app shell. Sem indicadores fictícios: agenda, clientes e financeiro chegam
// com os módulos da Fase 2 em diante. Empresa, papel, conta e sair ficam na navegação do shell.
export function HomePage() {
  const { state } = useActiveTenant();
  if (state.status !== 'active') return null;

  return (
    <ShellPage title={state.membership.tenantName}>
      <p className="text-base text-foreground">
        Boas-vindas ao painel. Use o menu para navegar; os módulos de agenda, clientes e financeiro
        aparecem aqui conforme forem liberados.
      </p>
    </ShellPage>
  );
}
