import { z } from 'zod';

// Só variáveis VITE_ chegam ao navegador (SECURITY.md): aqui entram a URL e a chave anônima do Supabase.
// A service role nunca passa por aqui.
const supabaseEnvSchema = z.object({
  VITE_SUPABASE_URL: z.url({ error: 'VITE_SUPABASE_URL deve ser uma URL válida.' }),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(1, { error: 'VITE_SUPABASE_ANON_KEY não pode ficar vazia.' }),
});

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export function parseSupabaseEnv(env: Record<string, unknown>): SupabaseEnv {
  const result = supabaseEnvSchema.safeParse(env);
  if (!result.success) {
    // Só o nome da variável e a mensagem do schema: o valor recebido nunca entra no erro.
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(' ');
    throw new Error(`Configuração do Supabase inválida. ${problems} Veja .env.example.`);
  }
  return { url: result.data.VITE_SUPABASE_URL, anonKey: result.data.VITE_SUPABASE_ANON_KEY };
}
