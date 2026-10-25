import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Base do shadcn/ui com as mesmas regras do Input: texto de 16 px, borda `input` (3:1 sobre o fundo),
// foco sólido e borda de erro. Altura mínima de três linhas; a pessoa pode aumentar na vertical.
function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-24 w-full min-w-0 resize-y rounded-control border border-input bg-card px-3 py-2 text-base text-foreground transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70',
        'focus-visible:ring-3 focus-visible:ring-ring',
        'aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
