import { ChevronDownIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Select nativo (base do shadcn/ui): no celular abre o seletor do sistema, mais acessível que um
// listbox próprio. Alvo de 44 px; o ícone é decorativo.
function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <div data-slot="native-select-wrapper" className="relative w-full">
      <select
        data-slot="native-select"
        className={cn(
          'min-h-control w-full min-w-0 cursor-pointer appearance-none rounded-control border border-input bg-card py-2 pr-10 pl-3 text-base text-foreground transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-70',
          'focus-visible:ring-3 focus-visible:ring-ring',
          'aria-invalid:border-destructive',
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { NativeSelect };
