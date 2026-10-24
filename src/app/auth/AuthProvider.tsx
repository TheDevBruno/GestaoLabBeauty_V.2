import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { AuthApi, AuthSession } from '@/lib/auth-api';
import { AuthContext, type AuthState } from './auth-context';

function toState(session: AuthSession | null): AuthState {
  return session ? { status: 'signed-in', session } : { status: 'signed-out' };
}

// Sessão do Supabase para a interface. A sessão só diz quem é o usuário: o que ele pode ver continua
// decidido pela RLS em cada consulta (ADR-003 §3 e §5).
export function AuthProvider({ api, children }: { api: AuthApi; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void api.getSession().then((session) => {
      if (active) setState(toState(session));
    });
    const unsubscribe = api.onChange((session) => {
      if (active) setState(toState(session));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);

  const value = useMemo(() => ({ state, api }), [state, api]);
  return <AuthContext value={value}>{children}</AuthContext>;
}
