import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import type { AuthApi, AuthSession } from '@/lib/auth-api';
import { AuthProvider } from '@/app/auth/AuthProvider';
import { routes } from '@/app/routes';

// Só para testes: AuthApi em memória, sem Supabase. Login e cadastro bem-sucedidos abrem a sessão e
// avisam os ouvintes, como o onAuthStateChange real.
export function createFakeAuthApi(initial: AuthSession | null = null) {
  let session = initial;
  const listeners = new Set<(session: AuthSession | null) => void>();
  const setSession = (next: AuthSession | null) => {
    session = next;
    for (const listener of listeners) listener(next);
  };

  const api = {
    getSession: vi.fn<AuthApi['getSession']>(() => Promise.resolve(session)),
    onChange: vi.fn<AuthApi['onChange']>((listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
    signIn: vi.fn<AuthApi['signIn']>(({ email }) => {
      setSession({ userId: 'usuario-teste', email });
      return Promise.resolve({ ok: true });
    }),
    signUp: vi.fn<AuthApi['signUp']>(({ email }) => {
      setSession({ userId: 'usuario-teste', email });
      return Promise.resolve({ ok: true, needsConfirmation: false });
    }),
    signOut: vi.fn<AuthApi['signOut']>(() => {
      setSession(null);
      return Promise.resolve();
    }),
    acceptInvitation: vi.fn<AuthApi['acceptInvitation']>(() =>
      Promise.resolve({ ok: true, tenantId: '00000000-0000-0000-0000-00000000000a' }),
    ),
  } satisfies AuthApi;

  return { api, setSession };
}

export function renderAt(path: string, api: AuthApi) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  render(
    <AuthProvider api={api}>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return { router, user };
}

export const SIGNED_IN: AuthSession = { userId: 'usuario-teste', email: 'ana@example.test' };
