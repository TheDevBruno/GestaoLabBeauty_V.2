import { cn } from '@/lib/utils';

// Status ativo/inativo em texto, não só cor (WCAG 1.4.1). Os rótulos mudam por cadastro (cliente
// inativo é "Arquivado", RN-046).
function StatusBadge({
  active,
  activeLabel = 'Ativo',
  inactiveLabel = 'Inativo',
}: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <span
      data-slot="status-badge"
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium whitespace-nowrap',
        active ? 'border-success text-success' : 'border-border text-muted-foreground',
      )}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

export { StatusBadge };
