import { createClient } from '@supabase/supabase-js';
import { parseSupabaseEnv } from './env';

// Cliente do navegador: chave anônima + JWT do usuário. A RLS é a barreira (ADR-002, ADR-003).
const env = parseSupabaseEnv(import.meta.env);

export const supabase = createClient(env.url, env.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
