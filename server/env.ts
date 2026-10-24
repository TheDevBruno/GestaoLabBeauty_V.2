import { z } from 'zod';

// Variáveis do servidor, sem prefixo VITE_: nunca chegam ao navegador (SECURITY.md). A service role só
// existe aqui, nas Vercel Functions e no servidor de desenvolvimento.
const serverEnvSchema = z.object({
  SUPABASE_URL: z.url({ error: 'SUPABASE_URL deve ser uma URL válida.' }),
  SUPABASE_ANON_KEY: z.string().min(1, { error: 'SUPABASE_ANON_KEY não pode ficar vazia.' }),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, { error: 'SUPABASE_SERVICE_ROLE_KEY não pode ficar vazia.' }),
});

export interface ServerEnv {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

export function parseServerEnv(env: Record<string, unknown>): ServerEnv {
  const result = serverEnvSchema.safeParse(env);
  if (!result.success) {
    // Só o nome da variável e a mensagem do schema: o valor recebido nunca entra no erro.
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(' ');
    throw new Error(`Configuração do servidor inválida. ${problems} Veja .env.example.`);
  }
  return {
    supabaseUrl: result.data.SUPABASE_URL,
    anonKey: result.data.SUPABASE_ANON_KEY,
    serviceRoleKey: result.data.SUPABASE_SERVICE_ROLE_KEY,
  };
}
