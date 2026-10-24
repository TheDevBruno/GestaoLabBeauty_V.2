import { Link } from 'react-router';
import { AuthLayout, linkClass } from '@/app/components/AuthLayout';

export function NotFoundPage() {
  return (
    <AuthLayout title="Página não encontrada">
      <p className="text-base text-ink">O endereço não existe ou foi digitado errado.</p>
      <p className="mt-6 text-base">
        <Link to="/app" className={linkClass}>
          Voltar ao início
        </Link>
      </p>
    </AuthLayout>
  );
}
