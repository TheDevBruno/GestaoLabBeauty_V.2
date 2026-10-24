import { createContext, useContext } from 'react';
import type { AuthApi, AuthSession } from '@/lib/auth-api';

export type AuthState =
  { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; session: AuthSession };

export interface AuthContextValue {
  state: AuthState;
  api: AuthApi;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  }
  return value;
}
