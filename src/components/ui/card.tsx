import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Base do shadcn/ui. Sombra suave e borda clara (estilo Soft UI da direção visual); os títulos ficam
// com quem usa, para cada tela escolher o nível de heading certo.
function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="card-header" className={cn('flex flex-col gap-1 px-6', className)} {...props} />
  );
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-6', className)} {...props} />;
}

export { Card, CardContent, CardHeader };
