import type { ReactNode } from 'react';

// Moldura de uma página dentro do app shell: título da aba, um único h1 e largura de leitura. O
// <main> é do shell; aqui só o conteúdo.
export function ShellPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <title>{`${title} · LabBeautyPro`}</title>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <div className="mt-6">{children}</div>
    </div>
  );
}
