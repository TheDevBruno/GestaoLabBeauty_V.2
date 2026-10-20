# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versionamento
[SemVer](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado

- Sprint 1.1: estrutura inicial com React 19, Vite 8, TypeScript 6 (estrito), Tailwind CSS 4, ESLint,
  Prettier e Vitest.
- CI no GitHub Actions (typecheck, lint, formatação, testes e build) e Dependabot.
- Documentação: README, ARCHITECTURE, SECURITY, CONTRIBUTING, plano aprovado da Fase 0 e ADRs 001–007.
- Validação do slug do portal (`src/shared/slug.ts`, RN-017): formato, tamanho de 3 a 30 e slugs
  reservados, com testes Vitest. Adiantada da Sprint 1.3 com autorização do usuário.
- Sprint 1.2, passo 1: Supabase CLI 2.119.0 (devDependency), projeto local em `supabase/` e scripts
  `db:start`, `db:stop`, `db:reset` e `db:test`.
- Sprint 1.2, passo 2: primeira migration (schema `private` e revogação dos privilégios padrão de
  `anon` e `authenticated` — ADR-008), helpers de teste pgTAP e testes de privilégios padrão e de
  cobertura de RLS.

### Alterado

- RN-017 confirmada com formato, tamanho e lista de slugs reservados.
- Script `test` sem `--passWithNoTests`: `npm test` agora falha se nenhum teste for encontrado
  (`AGENTS.md` e `docs/STATE.md` atualizados).
- Sprint 1.1 encerrada: CI e Dependabot confirmados no GitHub; `docs/STATE.md` e
  `docs/roadmap/sprint-1.1.md` atualizados.
