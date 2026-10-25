import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Moldura de uma página dentro do app shell: título da aba, um único h1 e largura de leitura. O
// <main> é do shell; aqui só o conteúdo. `wide` dá mais largura a listas em tabela.
export function ShellPage({
  title,
  wide = false,
  children,
}: {
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn('w-full px-4 py-8 sm:px-6 lg:px-10 lg:py-10', wide ? 'max-w-5xl' : 'max-w-3xl')}
    >
      <title>{`${title} · LabBeautyPro`}</title>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <div className="mt-6">{children}</div>
    </div>
  );
}
