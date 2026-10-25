import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// Moldura das telas de acesso: coluna única centralizada, sem rolagem horizontal em 375 px. `wide` dá
// mais largura a telas com lista (equipe).
export function AuthLayout({
  title,
  wide = false,
  children,
}: {
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-background px-4 py-12 text-foreground sm:items-center">
      <title>{`${title} · LabBeautyPro`}</title>
      <Card className={`w-full ${wide ? 'max-w-xl' : 'max-w-sm'} sm:py-8`}>
        <CardHeader className="sm:px-8">
          <p className="text-sm font-semibold tracking-wide text-muted-foreground">LabBeautyPro</p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </CardHeader>
        <CardContent className="sm:px-8">{children}</CardContent>
      </Card>
    </main>
  );
}
