import { AuthLayout } from './AuthLayout';

export function LoadingScreen({ title }: { title: string }) {
  return (
    <AuthLayout title={title}>
      <p role="status" className="text-base text-muted-foreground">
        Carregando…
      </p>
    </AuthLayout>
  );
}
