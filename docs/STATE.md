# Estado do projeto

- **Atualizado em:** 2026-10-20

## Objetivo

Entregar o MVP do LabBeautyPro descrito na [seção 3 do plano da Fase 0](roadmap/fase-0-plano.md#3-escopo-do-mvp):
autenticação, convites e papéis; onboarding; serviços, profissionais e clientes; agenda sem conflitos;
branding e portal `/{slug}` com agendamento online; financeiro básico; painel global com tenants, planos e
liberação de recursos por plano.

## Situação

- **Fase 1 — Fundação.** Sprint 1.1 (repositório, tooling, CI e ADRs) **concluída** em 2026-10-19,
  com CI verde no GitHub. Detalhes em [sprint-1.1.md](roadmap/sprint-1.1.md).
- **Sprint 1.2 em andamento** na branch `feat/sprint-1.2-banco`. Passos 1 a 3 de 10 concluídos:
  - Passo 1: Supabase CLI 2.119.0 e projeto local (`supabase/config.toml`, scripts `db:*`).
  - Passo 2: primeira migration (schema `private` e privilégios padrão revogados —
    [ADR-008](decisions/ADR-008-privilegios-explicitos.md)); helpers pgTAP. ADR-008 complementada
    depois com `FOR ROLE postgres` explícito e testes do `service_role`.
  - Passo 3: `tenants`, `profiles`, `memberships`, `platform_admins`, `roles_permissions` e enum
    `member_role`; RLS ligada sem políticas (nega tudo); `GRANT` mínimos só para `authenticated`.
    75 asserções pgTAP verdes.

  Plano e registro em [sprint-1.2.md](roadmap/sprint-1.2.md).

- Tabelas de tenancy existem, mas nenhuma política: nenhum usuário lê ou altera dados ainda. Sem
  autenticação nem funcionalidade de negócio.
- Adiantado da Sprint 1.3, com autorização: validador de slug do portal (`src/shared/slug.ts`, RN-017)
  com 50 testes Vitest, integrado na `main` pelo PR #7. `npm test` deixou de usar `--passWithNoTests`.

## Pendências

- [ ] Decidir os PRs abertos do Dependabot (#1 `@types/node`, #2 `vitest`, #3 `react`, #4 `zod`)
      conforme a política da [ADR-001](decisions/ADR-001-stack-e-versoes.md).
- [ ] Fixar GitHub Actions por SHA em vez de tag major (Fase 8).
- [ ] Validar comercialmente o nome LabBeautyPro antes de registro de marca.
- [ ] Confirmar as regras marcadas "a confirmar" em [REGRAS-DE-NEGOCIO.md](REGRAS-DE-NEGOCIO.md).

## Próximo passo

**Sprint 1.2, passo 4 — funções auxiliares em `private`** (ver [sprint-1.2.md](roadmap/sprint-1.2.md)):

- `private.is_member`, `private.has_permission` e `private.is_platform_admin`, com `security definer`,
  `set search_path = ''`, `STABLE` e `GRANT EXECUTE` explícito só para `authenticated`.
- `GRANT USAGE` no schema `private` para `authenticated`; `private` continua fora de `[api] schemas`.
- Carga da matriz do plano §8 em `roles_permissions`.

Requisito local: Docker em execução e `npm run db:start`.

O fim da Sprint 1.2 é ponto de aprovação obrigatória.
