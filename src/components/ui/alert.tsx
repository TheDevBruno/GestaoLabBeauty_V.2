import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Base do shadcn/ui. role="alert" por padrão (erro do servidor); passe role="status" para avisos que
// não interrompem o leitor de tela.
const alertVariants = cva('w-full rounded-lg border px-4 py-3 text-base', {
  variants: {
    variant: {
      default: 'bg-card text-card-foreground',
      destructive: 'border-destructive bg-card font-medium text-destructive',
      success: 'border-success bg-card text-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

function Alert({
  className,
  variant,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Alert };
