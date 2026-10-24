import type { ReactNode } from 'react';

// Moldura das telas de acesso: coluna única centralizada, sem rolagem horizontal em 375 px.
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-canvas px-4 py-12 text-ink sm:items-center">
      <title>{`${title} · LabBeautyPro`}</title>
      <div className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold tracking-wide text-muted">LabBeautyPro</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export const linkClass =
  'rounded-sm font-medium text-ink underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-focus';
