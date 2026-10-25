import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Junta classes condicionais e resolve conflitos do Tailwind (a última vence), para que o `className`
// de quem usa um componente substitua a classe padrão em vez de competir com ela.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
