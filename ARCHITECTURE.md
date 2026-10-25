# Arquitetura

Visão geral aprovada na Fase 0. As decisões detalhadas estão em [docs/decisions/](docs/decisions/).

## Visão geral

```
┌──────────── Vercel ───────────────────────────────────────────┐
│  SPA React + Vite (TypeScript estrito)                        │
│   /app/*     painel do tenant                                 │
│   /admin/*   painel global (tema fixo, MFA)                   │
│   /:slug/*   portal público (tema do tenant)                  │
│                                                               │
│  server/ → Vercel Functions (Node, Hono)  /api/*              │
│   comandos privilegiados, webhooks, portal público,           │
│   IA, convites, domínio próprio, /api/jobs/run                │
└──────────────┬──────────────────────────────┬─────────────────┘
               │ anon key + JWT do usuário     │ service role (só servidor)
               ▼                               ▼
┌──────────── Supabase (um projeto por ambiente) ───────────────┐
│ Auth · Postgres (RLS, exclusion constraints, pg_cron, pg_net) │
│ Storage                                                       │
└───────────────────────────────────────────────────────────────┘
```

## Camadas

| Camada               | Responsabilidade                                              | ADR |
| -------------------- | ------------------------------------------------------------- | --- |
| `src/` (navegador)   | Interface; CRUD simples direto no Supabase sob RLS            | 002 |
| Funções Postgres     | Comandos atômicos (agenda, pagamentos); regras de integridade | 002 |
| `server/` (API Hono) | Segredos, webhooks, portal público, convites, IA, jobs        | 002 |
| Postgres + RLS       | Isolamento por tenant, FKs compostas, anti-conflito           | 003 |
| Jobs                 | Outbox em Postgres, disparo por `pg_cron` + `pg_net`          | 006 |

## Estrutura do repositório

| Caminho              | Conteúdo                                           | Desde      |
| -------------------- | -------------------------------------------------- | ---------- |
| `src/app/`           | Rotas, layouts, providers e guards                 | Sprint 1.1 |
| `src/styles/`        | CSS global e tokens                                | Sprint 1.1 |
| `src/components/ui/` | Design system (shadcn/ui, tokens, `cn()`)          | Sprint 1.4 |
| `src/modules/`       | Módulos de negócio (agenda, clientes, financeiro…) | Fase 2     |
| `src/lib/`           | Clientes Supabase e TanStack Query, formatação     | Sprint 1.3 |
| `src/shared/`        | Schemas Zod e tipos compartilhados com `server/`   | Sprint 1.3 |
| `server/`            | API Hono, serviços, adaptadores externos           | Sprint 1.3 |
| `supabase/`          | Migrations, testes pgTAP, seed sintético           | Sprint 1.2 |
| `tests/`             | Testes de integração e E2E                         | Sprint 1.3 |
| `docs/`              | Roadmap e ADRs                                     | Sprint 1.1 |

Diretórios só são criados quando recebem conteúdo real.

## Regras de dependência

- `src/` nunca importa de `server/` (verificado pelo ESLint).
- `server/` pode importar de `src/shared/`.
- Chaves privilegiadas existem apenas em variáveis de ambiente do servidor.
