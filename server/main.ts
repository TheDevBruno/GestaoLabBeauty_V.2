import { createClient } from '@supabase/supabase-js';
import { createApp } from './app';
import { parseServerEnv } from './env';
import { createSupabaseInvitationStore } from './invitation-store';

// Monta a API a partir das variáveis do servidor. Usado pela Vercel Function (api/) e pelo servidor de
// desenvolvimento do Vite (vite.config.ts).
export function createAppFromEnv(env: Record<string, unknown>) {
  const { supabaseUrl, anonKey, serviceRoleKey } = parseServerEnv(env);
  // Sem sessão guardada: cada requisição traz o próprio JWT.
  const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  const authClient = createClient(supabaseUrl, anonKey, { auth });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth });
  return createApp({ store: createSupabaseInvitationStore(authClient, adminClient) });
}
