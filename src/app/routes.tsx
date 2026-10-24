import { Navigate, type RouteObject } from 'react-router';
import { HomePage } from './pages/HomePage';
import { InvitePage } from './pages/InvitePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SignupPage } from './pages/SignupPage';

// Rotas do sistema. Cada segmento novo de primeiro nível precisa estar na lista de slugs reservados
// (RN-017: src/shared/slug.ts e o CHECK de tenants), senão uma empresa poderia ocupá-lo no portal.
// entrar, cadastro, convite e app já estão lá.
export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/app" replace /> },
  { path: '/entrar', element: <LoginPage /> },
  { path: '/cadastro', element: <SignupPage /> },
  { path: '/convite', element: <InvitePage /> },
  { path: '/app', element: <HomePage /> },
  { path: '*', element: <NotFoundPage /> },
];
