import { Navigate, Outlet, type RouteObject } from 'react-router';
import { RouteFallback as Loading } from './components/RouteFallback';
import { RequireSession } from './guards/RequireSession';
import { RequireTenant } from './guards/RequireTenant';

// Rotas do sistema. Cada segmento novo de primeiro nível precisa estar na lista de slugs reservados
// (RN-017: src/shared/slug.ts e o CHECK de tenants), senão uma empresa poderia ocupá-lo no portal.
// entrar, cadastro, convite e app já estão lá. Tudo em /app exige sessão (RequireSession) e empresa
// ativa (RequireTenant) e fica dentro do app shell.
//
// As páginas e o shell carregam sob demanda (`lazy`), cada um no seu chunk. Na primeira carga o
// roteador mostra HydrateFallback (role="status"); nas navegações seguintes a tela atual fica até o
// chunk chegar. Os guardas ficam no chunk de entrada porque decidem o que carregar.
export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/app" replace />, HydrateFallback: Loading },
  {
    path: '/entrar',
    HydrateFallback: Loading,
    lazy: async () => ({ Component: (await import('./pages/LoginPage')).LoginPage }),
  },
  {
    path: '/cadastro',
    HydrateFallback: Loading,
    lazy: async () => ({ Component: (await import('./pages/SignupPage')).SignupPage }),
  },
  {
    path: '/convite',
    HydrateFallback: Loading,
    lazy: async () => ({ Component: (await import('./pages/InvitePage')).InvitePage }),
  },
  {
    path: '/app',
    element: <RequireSession />,
    HydrateFallback: Loading,
    children: [
      {
        element: (
          <RequireTenant title="Painel">
            <Outlet />
          </RequireTenant>
        ),
        children: [
          {
            lazy: async () => ({ Component: (await import('./shell/AppShell')).AppShell }),
            children: [
              {
                index: true,
                lazy: async () => ({ Component: (await import('./pages/HomePage')).HomePage }),
              },
              {
                path: 'equipe',
                lazy: async () => ({ Component: (await import('./pages/TeamPage')).TeamPage }),
              },
              {
                path: 'servicos',
                children: [
                  {
                    index: true,
                    lazy: async () => ({
                      Component: (await import('@/modules/services/ServicesListPage'))
                        .ServicesListPage,
                    }),
                  },
                  {
                    path: 'novo',
                    lazy: async () => ({
                      Component: (await import('@/modules/services/ServiceFormPage'))
                        .ServiceNewPage,
                    }),
                  },
                  {
                    path: ':id',
                    lazy: async () => ({
                      Component: (await import('@/modules/services/ServiceFormPage'))
                        .ServiceEditPage,
                    }),
                  },
                ],
              },
              {
                path: 'clientes',
                children: [
                  {
                    index: true,
                    lazy: async () => ({
                      Component: (await import('@/modules/clients/ClientsListPage'))
                        .ClientsListPage,
                    }),
                  },
                  {
                    path: 'novo',
                    lazy: async () => ({
                      Component: (await import('@/modules/clients/ClientFormPage')).ClientNewPage,
                    }),
                  },
                  {
                    path: ':id',
                    lazy: async () => ({
                      Component: (await import('@/modules/clients/ClientFormPage')).ClientEditPage,
                    }),
                  },
                ],
              },
              {
                path: 'profissionais',
                children: [
                  {
                    index: true,
                    lazy: async () => ({
                      Component: (await import('@/modules/professionals/ProfessionalsListPage'))
                        .ProfessionalsListPage,
                    }),
                  },
                  {
                    path: 'novo',
                    lazy: async () => ({
                      Component: (await import('@/modules/professionals/ProfessionalFormPage'))
                        .ProfessionalNewPage,
                    }),
                  },
                  {
                    path: ':id',
                    lazy: async () => ({
                      Component: (await import('@/modules/professionals/ProfessionalFormPage'))
                        .ProfessionalEditPage,
                    }),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    path: '*',
    HydrateFallback: Loading,
    lazy: async () => ({ Component: (await import('./pages/NotFoundPage')).NotFoundPage }),
  },
];
