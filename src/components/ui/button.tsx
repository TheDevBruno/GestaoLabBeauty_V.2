import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Base do shadcn/ui (new-york), ajustada ao projeto: alvo de 44 px (min-h-control), texto de 16 px,
// anel de foco sólido de 3 px (o `ring/50` do shadcn fica abaixo de 3:1) e cores só de tokens.
const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-control text-base font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-5',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-card text-foreground hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'text-foreground hover:bg-accent',
        link: 'text-foreground underline underline-offset-4 hover:text-muted-foreground',
      },
      size: {
        default: 'min-h-control px-4',
        icon: 'size-control',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    // Renderiza o filho (por exemplo um <Link>) com a aparência de botão.
    asChild?: boolean;
    // Enquanto `busy`, o botão fica desabilitado e troca o texto, para o envio não ser repetido e o
    // estado ser anunciado. Não vale com `asChild`.
    busy?: boolean;
    busyLabel?: string;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  busy = false,
  busyLabel,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      data-slot="button"
      type={type ?? 'button'}
      disabled={Boolean(disabled) || busy}
      aria-busy={busy || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

export { Button };
