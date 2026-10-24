import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import type { AuthApi } from '@/lib/auth-api';
import { AuthProvider } from './auth/AuthProvider';
import { routes } from './routes';

// Raiz da aplicação. As dependências chegam de main.tsx, para os testes montarem as telas com
// implementações falsas sem tocar no Supabase.
export function App({ api, queryClient }: { api: AuthApi; queryClient: QueryClient }) {
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider api={api}>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
