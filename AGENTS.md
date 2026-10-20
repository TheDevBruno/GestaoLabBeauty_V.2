# AGENTS.md

Instruções para agentes de IA e pessoas que trabalham neste repositório.

## Sobre

**LabBeautyPro** — plataforma SaaS white-label para gestão de negócios de beleza: agenda, clientes,
serviços, equipe, financeiro e portal público com a marca de cada empresa.

- Visão, escopo do MVP e decisões D1–D12: [docs/roadmap/fase-0-plano.md](docs/roadmap/fase-0-plano.md).
- Situação atual e próximo passo: [docs/STATE.md](docs/STATE.md).

## Stack

Instalado hoje (versões exatas e política de atualização em
[ADR-001](docs/decisions/ADR-001-stack-e-versoes.md)):

- React 19 + Vite 8 + TypeScript 6.0 estrito (não 7.0 — ver ADR-001)
- Tailwind CSS 4
- ESLint 10 (typescript-eslint type-checked) e Prettier 3
- Vitest 5
- Node 24 (`.nvmrc`) e npm, pacote único, sem monorepo (D11)
- `react-router` e `zod` instalados, em uso a partir da Sprint 1.3

Planejado: Supabase (Sprint 1.2), API Hono em Vercel Functions (Sprint 1.3), shadcn/ui (Sprint 1.4),
pgTAP e Playwright. Camadas em [ADR-002](docs/decisions/ADR-002-camadas-supabase-rpc-api.md) e
[ARCHITECTURE.md](ARCHITECTURE.md).

## Comandos

```bash
npm ci                 # instala dependências a partir do package-lock.json
npm run dev            # servidor de desenvolvimento (Vite)
npm run build          # tsc -b && vite build
npm run preview        # serve o build localmente
npm run typecheck      # tsc -b
npm run lint           # eslint .
npm run format         # prettier --write .
npm run format:check   # prettier --check .
npm test               # vitest run
npm run test:watch     # vitest
npm run check          # typecheck + lint + format:check + test + build (mesma ordem do CI)
npm run db:start       # sobe o Supabase local (exige Docker)
npm run db:stop        # para o Supabase local
npm run db:reset       # recria o banco local e aplica as migrations
npm run db:test        # testes pgTAP (supabase test db)
```

## Estrutura

| Caminho           | Conteúdo                               |
| ----------------- | -------------------------------------- |
| `src/app/`        | Rotas, layouts, providers e guards     |
| `src/styles/`     | CSS global e tokens                    |
| `src/main.tsx`    | Ponto de entrada                       |
| `docs/roadmap/`   | Plano da Fase 0 e registro das sprints |
| `docs/decisions/` | ADRs                                   |
| `.github/`        | CI (`workflows/ci.yml`) e Dependabot   |

Diretórios futuros (`src/components/ui/`, `src/modules/`, `src/lib/`, `src/shared/`, `server/`,
`supabase/`, `tests/`) e regras de dependência estão em [ARCHITECTURE.md](ARCHITECTURE.md). Diretórios só
são criados quando recebem conteúdo real.

## Memória do projeto

Ler nesta ordem antes de começar uma tarefa:

1. [docs/STATE.md](docs/STATE.md) — objetivo, situação, pendências e próximo passo.
2. [docs/REGRAS-DE-NEGOCIO.md](docs/REGRAS-DE-NEGOCIO.md) — regras de negócio (RN-xxx) e o que está a
   confirmar.
3. [docs/roadmap/](docs/roadmap/) — plano da Fase 0 e registro de cada sprint.
4. [docs/decisions/](docs/decisions/) — ADRs (fonte da verdade das decisões; não duplicar o conteúdo):
   - [ADR-001](docs/decisions/ADR-001-stack-e-versoes.md) — stack e política de versões
   - [ADR-002](docs/decisions/ADR-002-camadas-supabase-rpc-api.md) — camadas: Supabase direto, funções
     Postgres e API
   - [ADR-003](docs/decisions/ADR-003-multi-tenancy-rls.md) — multi-tenancy com RLS
   - [ADR-004](docs/decisions/ADR-004-white-label-e-portal-slug.md) — white-label e portal `/{slug}`
   - [ADR-005](docs/decisions/ADR-005-ambientes.md) — ambientes
   - [ADR-006](docs/decisions/ADR-006-jobs-pg-cron-pg-net.md) — jobs com `pg_cron` + `pg_net`
   - [ADR-007](docs/decisions/ADR-007-protecao-portal-publico.md) — proteção do portal público
   - [ADR-008](docs/decisions/ADR-008-privilegios-explicitos.md) — privilégios explícitos no banco
5. [CHANGELOG.md](CHANGELOG.md) — histórico de mudanças.

Ao concluir uma sprint, atualizar `docs/STATE.md` e o registro da sprint em `docs/roadmap/`.

## Regras de trabalho

- Responder e documentar em português do Brasil.
- Mudanças pequenas, verificáveis e reversíveis; preservar a arquitetura e a formatação existentes.
- Branch a partir de `main`: `feat/...`, `fix/...`, `chore/...` ou `docs/...`.
- Conventional Commits em português, por exemplo `feat(agenda): bloqueia horário com conflito`.
- Rodar `npm run check` antes de afirmar que algo está pronto. Nenhum teste é declarado aprovado sem
  execução registrada.
- TypeScript estrito; nada de `any` sem justificativa em comentário.
- Toda decisão arquitetural relevante gera uma ADR nova em `docs/decisions/` (`ADR-NNN-titulo.md`).
- Regra de negócio nova ou alterada: registrar em `docs/REGRAS-DE-NEGOCIO.md` com a origem.
- Interface: WCAG 2.2 AA (contraste 4.5:1, teclado, foco visível, alvos de 44 px), mobile-first.
- Atualizar o `CHANGELOG.md` na seção `[Unreleased]`.

Detalhes em [CONTRIBUTING.md](CONTRIBUTING.md).

## Segurança

Regras completas em [SECURITY.md](SECURITY.md). Resumo:

- Nenhum segredo versionado; só `.env.example` sem valores reais.
- Variáveis `VITE_` vão para o navegador: nunca colocar nelas service role, chaves de terceiros ou
  segredos de webhook.
- Service role do Supabase só no servidor (Vercel) e no Supabase Vault.
- `src/` nunca importa de `server/` (bloqueado pelo ESLint).
- Toda tabela nova precisa de `tenant_id`, RLS, políticas e testes pgTAP
  ([ADR-003](docs/decisions/ADR-003-multi-tenancy-rls.md)).
- Apenas dados sintéticos em testes e seeds.
- Segredo exposto deve ser revogado e trocado imediatamente.
- Este repositório não declara conformidade com a LGPD.

## Proibido sem autorização

- `git push` ou qualquer publicação no GitHub (D3).
- Aplicar migrations ou alterar dados em homologação ou produção
  ([ADR-005](docs/decisions/ADR-005-ambientes.md)).
- Instalar, remover ou atualizar dependências fora da política da
  [ADR-001](docs/decisions/ADR-001-stack-e-versoes.md).
- Alterar CI, Dependabot ou arquivos de configuração (`tsconfig*`, `eslint.config.js`, `vite.config.ts`,
  `.prettierrc.json` etc.).
- Alterar uma ADR aceita (criar uma nova que a substitua).
- Excluir arquivos, dados ou histórico do Git.
- Usar dados reais de clientes.
- Avançar além da sprint atual ou passar por um ponto de aprovação obrigatória (fim das Sprints 1.2, 1.3,
  2.4, 3.2, 5.3, 5.4 e da Fase 8).
