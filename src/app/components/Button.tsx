import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  busy?: boolean;
  busyLabel?: string;
  variant?: 'primary' | 'secondary';
}

const variants = {
  primary: 'bg-action text-on-action hover:bg-action-hover',
  secondary: 'border border-line bg-surface text-ink hover:bg-canvas',
};

// Botão provisório (Sprint 1.4 traz o definitivo). Enquanto `busy`, fica desabilitado e troca o texto,
// para o envio não ser repetido e o estado ser anunciado.
export function Button({
  busy = false,
  busyLabel,
  variant = 'primary',
  disabled,
  children,
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={Boolean(disabled) || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 text-base font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 ${variants[variant]} ${className}`}
      {...props}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
