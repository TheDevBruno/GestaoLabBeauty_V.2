import type { PostgrestError, Session, SupabaseClient } from '@supabase/supabase-js';
import type { LoginInput, SignupInput } from '@/shared/auth';
import {
  type InvitationFailure,
  invitationErrorMessage,
  invitationFailure,
  loginErrorMessage,
  signupErrorMessage,
} from './auth-errors';

// Contrato de autenticação usado pelas telas. As telas não importam o cliente Supabase direto: assim
// os testes trocam a implementação, e só este arquivo conhece a API do supabase-js.

export interface AuthSession {
  userId: string;
  email: string | null;
}

export type AuthResult = { ok: true } | { ok: false; message: string };
export type SignUpResult =
  { ok: true; needsConfirmation: boolean } | { ok: false; message: string };
export type AcceptResult =
  { ok: true; tenantId: string } | { ok: false; reason: InvitationFailure; message: string };

export interface AuthApi {
  getSession(): Promise<AuthSession | null>;
  onChange(listener: (session: AuthSession | null) => void): () => void;
  signIn(input: LoginInput): Promise<AuthResult>;
  signUp(input: SignupInput): Promise<SignUpResult>;
  signOut(): Promise<void>;
  acceptInvitation(token: string): Promise<AcceptResult>;
}

function toAuthSession(session: Session | null): AuthSession | null {
  if (!session) return null;
  return { userId: session.user.id, email: session.user.email ?? null };
}

export function createSupabaseAuthApi(client: SupabaseClient): AuthApi {
  return {
    async getSession() {
      const { data } = await client.auth.getSession();
      return toAuthSession(data.session);
    },

    onChange(listener) {
      // O callback não chama o Supabase de volta (recomendação do supabase-js para evitar deadlock).
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(toAuthSession(session));
      });
      return () => {
        data.subscription.unsubscribe();
      };
    },

    async signIn({ email, password }) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      return error ? { ok: false, message: loginErrorMessage(error) } : { ok: true };
    },

    async signUp({ email, password, fullName }) {
      // full_name vai nos metadados; o trigger on_auth_user_created copia para profiles.
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: fullName ? { full_name: fullName } : {} },
      });
      if (error) return { ok: false, message: signupErrorMessage(error) };
      return { ok: true, needsConfirmation: data.session === null };
    },

    async signOut() {
      await client.auth.signOut();
    },

    async acceptInvitation(token) {
      // Sem tipos gerados do banco, o retorno da RPC chega como any: fica unknown e é checado abaixo.
      const response: { data: unknown; error: PostgrestError | null } = await client.rpc(
        'accept_invitation',
        { p_token: token },
      );
      const { data, error } = response;
      if (error) {
        const reason = invitationFailure(error);
        return { ok: false, reason, message: invitationErrorMessage(reason) };
      }
      if (typeof data !== 'string') {
        return { ok: false, reason: 'unknown', message: invitationErrorMessage('unknown') };
      }
      return { ok: true, tenantId: data };
    },
  };
}
