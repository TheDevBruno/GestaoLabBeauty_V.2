import { fileURLToPath, URL } from 'node:url';
import { getRequestListener } from '@hono/node-server';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Hono } from 'hono';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Só no `npm run dev`: atende /api/* com a API Hono de server/, como a Vercel Function faria. As
// variáveis do servidor (sem VITE_) são lidas aqui, no processo do Node, e não entram no bundle.
function apiDevServer(): Plugin {
  return {
    name: 'labbeautypro-api-dev',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '');
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next();
          return;
        }
        server
          .ssrLoadModule('/server/main.ts')
          .then((mod) => {
            const { createAppFromEnv } = mod as {
              createAppFromEnv: (env: Record<string, unknown>) => Hono;
            };
            return getRequestListener(createAppFromEnv(env).fetch)(req, res);
          })
          .catch(next);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiDevServer()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Separa fornecedores do código do app: o chunk de entrada fica pequeno e os fornecedores
        // mudam menos, então o cache do navegador os reaproveita entre deploys.
        codeSplitting: {
          groups: [
            { name: 'vendor-supabase', test: /node_modules[/]@supabase[/]/, priority: 30 },
            {
              name: 'vendor-router-query',
              test: /node_modules[/](react-router|@tanstack|cookie|set-cookie-parser)[/]/,
              priority: 20,
            },
            {
              name: 'vendor-react',
              test: /node_modules[/](react|react-dom|scheduler)[/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    environment: 'node',
  },
});
