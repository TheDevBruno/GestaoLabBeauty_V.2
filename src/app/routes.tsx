import { Navigate, type RouteObject } from 'react-router';
import { RequireSession } from './guards/RequireSession';
import { HomePage } from './pages/HomePage';
import { InvitePage } from './pages/InvitePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SignupPage } from './pages/SignupPage';
import { TeamPage } from './pages/TeamPage';

// Rotas do sistema. Cada segmento novo de primeiro nível precisa estar na lista de slugs reservados
// (RN-017: src/shared/slug.ts e o CHECK de tenants), senão uma empresa poderia ocupá-lo no portal.
// entrar, cadastro, convite e app já estão lá. Tudo em /app exige sessão (RequireSession).
export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/app" replace /> },
  { path: '/entrar', element: <LoginPage /> },
  { path: '/cadastro', element: <SignupPage /> },
  { path: '/convite', element: <InvitePage /> },
  {
    path: '/app',
    element: <RequireSession />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'equipe', element: <TeamPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
