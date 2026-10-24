import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Base do shadcn/ui com alvo de 44 px e texto de 16 px em qualquer largura (abaixo disso o iOS dá zoom
// ao focar). A borda usa `input`, que tem 3:1 sobre o fundo.
function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'min-h-control w-full min-w-0 rounded-control border border-input bg-card px-3 text-base text-foreground transition-[color,box-shadow] outline-none placeholder:text-muted-foreground read-only:bg-muted disabled:cursor-not-allowed disabled:opacity-70',
        'focus-visible:ring-3 focus-visible:ring-ring',
        'aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
