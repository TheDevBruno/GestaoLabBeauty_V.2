# ADR-001 — Stack e política de versões

- **Status:** aceita
- **Data:** 2026-10-19

## Contexto

O produto precisa de uma stack TypeScript de ponta a ponta, com custo baixo, boa base de componentes
acessíveis e integração direta com Supabase e Vercel.

## Decisão

- **Frontend:** React, Vite, React Router, Tailwind CSS, shadcn/ui (Radix), Lucide, React Hook Form,
  TanStack Query, Zod.
- **API:** Node.js com Hono, executado como Vercel Functions (ver ADR-002).
- **Banco e auth:** Supabase (Postgres, Auth, Storage).
- **Qualidade:** TypeScript estrito, ESLint (typescript-eslint type-checked), Prettier, Vitest,
  pgTAP, Playwright.
- **Gerenciador de pacotes:** npm, pacote único, sem monorepo (D11). Node 24 (`.nvmrc`).

### Política de versões

1. Usar a última versão estável publicada há pelo menos 14 dias.
2. Fixar a versão exata (`--save-exact`) e versionar o `package-lock.json`.
3. Confirmar compatibilidade na documentação oficial e nos `peerDependencies` antes de instalar.
4. Atualizações chegam por Dependabot (semanal) e passam pelo CI.

### TypeScript 6.0, não 7.0

A versão `latest` do TypeScript é a 7.0.2, mas o typescript-eslint declara suporte apenas a
`>=4.8.4 <6.1.0` (typescript-eslint.io/users/dependency-versions, consultado em 2026-10-19).
Usamos **TypeScript 6.0.3**. Reavaliar quando o typescript-eslint suportar a versão 7.

### Versões instaladas na Sprint 1.1 (corte: publicadas até 2026-10-05)

| Pacote                          | Versão  |
| ------------------------------- | ------- |
| react / react-dom               | 19.3.0  |
| react-router                    | 8.4.0   |
| zod                             | 4.6.5   |
| vite                            | 8.3.2   |
| @vitejs/plugin-react            | 6.1.2   |
| tailwindcss / @tailwindcss/vite | 4.3.3   |
| typescript                      | 6.0.3   |
| eslint                          | 10.12.0 |
| @eslint/js                      | 10.0.1  |
| typescript-eslint               | 8.71.1  |
| eslint-plugin-react-hooks       | 7.1.1   |
| eslint-plugin-react-refresh     | 0.5.7   |
| globals                         | 17.13.0 |
| prettier                        | 3.9.9   |
| vitest                          | 5.0.3   |
| @types/react / @types/react-dom | 19.3.0  |
| @types/node                     | 26.6.4  |

GitHub Actions: `actions/checkout@v7` e `actions/setup-node@v7` (tag de versão major). Fixar por SHA
na Fase 8.

## Consequências

- Versões novas chegam com atraso mínimo de duas semanas, reduzindo risco de regressão.
- TypeScript fica uma versão major atrás até o ecossistema de lint acompanhar.
