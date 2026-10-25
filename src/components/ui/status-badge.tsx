import { cn } from '@/lib/utils';

// Status ativo/inativo em texto, não só cor (WCAG 1.4.1).
function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      data-slot="status-badge"
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium whitespace-nowrap',
        active ? 'border-success text-success' : 'border-border text-muted-foreground',
      )}
    >
      {active ? 'Ativo' : 'Inativo'}
    </span>
  );
}

export { StatusBadge };
