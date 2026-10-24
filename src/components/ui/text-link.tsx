import { Link, type LinkProps } from 'react-router';
import { cn } from '@/lib/utils';

// Link de texto dentro de frases (substitui o `linkClass` provisório). Sublinhado para não depender só
// da cor; links em linha ficam fora do alvo mínimo de 44 px (WCAG 2.5.8, exceção "inline").
const textLinkClass =
  'rounded-sm font-medium text-foreground underline underline-offset-4 outline-none hover:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring';

function TextLink({ className, ...props }: LinkProps) {
  return <Link data-slot="text-link" className={cn(textLinkClass, className)} {...props} />;
}

export { TextLink };
