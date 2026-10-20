# Sprint 1.1 — Repositório, tooling, CI e ADRs

- **Período:** 2026-10-19
- **Status:** concluída localmente; aguardando aprovação para o primeiro push.

## Escopo entregue

- Repositório Git local (`main`), remoto `origin` configurado sem push.
- Tooling: React 19.3, Vite 8.3, TypeScript 6.0 estrito, Tailwind CSS 4.3, ESLint 10 (type-checked),
  Prettier 3.9, Vitest 5.0. Versões e política em [ADR-001](../decisions/ADR-001-stack-e-versoes.md).
- Regra de lint que impede `src/` de importar `server/`.
- CI (`.github/workflows/ci.yml`) e Dependabot (`.github/dependabot.yml`).
- Tela provisória "LabBeautyPro — em construção", apenas para validar o build.
- Documentação: README, ARCHITECTURE, SECURITY, CONTRIBUTING, CHANGELOG, plano da Fase 0 e ADRs 001–007.

## Verificações executadas (2026-10-19, Windows 11, Node 24.20, npm 11.19)

| Verificação                              | Resultado                                                   |
| ---------------------------------------- | ----------------------------------------------------------- |
| `npm run check` (pipeline completo)      | exit 0                                                      |
| `npm run typecheck`                      | sem erros                                                   |
| `npm run lint`                           | sem erros                                                   |
| `npm run format:check`                   | "All matched files use Prettier code style!"                |
| `npm test`                               | "No test files found, exiting with code 0" (ver limitações) |
| `npm run build`                          | JS 219,99 kB (gzip 68,83 kB); CSS 5,88 kB (gzip 1,97 kB)    |
| Regra `src/` → `server/` (arquivo sonda) | `no-restricted-imports` disparou; sonda removida            |
| `vite preview` + `curl`                  | HTML servido com `<title>LabBeautyPro</title>`              |
| `grep service_role dist/`                | nenhuma ocorrência                                          |
| `npm audit`                              | 0 vulnerabilidades                                          |

## Limitações

- Ainda não há testes automatizados: `npm test` usa `--passWithNoTests`. Os primeiros testes reais
  (pgTAP) entram na Sprint 1.2; remover a flag quando existirem.
- O CI não foi executado no GitHub: depende do primeiro push, que exige autorização.
- Dependabot só passa a funcionar após o push.
- `react-router` e `zod` estão instalados, mas só serão usados a partir da Sprint 1.3.
- Actions referenciadas por tag major (`@v7`), não por SHA (previsto para a Fase 8).

## Próxima sprint

1.2 — Supabase local (CLI 2.119.0 como devDependency), schema base de tenancy, RLS, FKs compostas,
testes pgTAP negativos entre tenants e job de banco no CI.
