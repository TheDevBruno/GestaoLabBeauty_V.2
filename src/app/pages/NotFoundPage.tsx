import { TextLink } from '@/components/ui/text-link';
import { AuthLayout } from '@/app/components/AuthLayout';

export function NotFoundPage() {
  return (
    <AuthLayout title="Página não encontrada">
      <p className="text-base text-foreground">O endereço não existe ou foi digitado errado.</p>
      <p className="mt-6 text-base">
        <TextLink to="/app">Voltar ao início</TextLink>
      </p>
    </AuthLayout>
  );
}
