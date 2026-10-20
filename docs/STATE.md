# Estado do projeto

- **Atualizado em:** 2026-10-19

## Objetivo

Entregar o MVP do LabBeautyPro descrito na [seção 3 do plano da Fase 0](roadmap/fase-0-plano.md#3-escopo-do-mvp):
autenticação, convites e papéis; onboarding; serviços, profissionais e clientes; agenda sem conflitos;
branding e portal `/{slug}` com agendamento online; financeiro básico; painel global com tenants, planos e
liberação de recursos por plano.

## Situação

- **Fase 1 — Fundação.** Sprint 1.1 (repositório, tooling, CI e ADRs) **concluída** em 2026-10-19,
  com CI verde no GitHub. Detalhes em [sprint-1.1.md](roadmap/sprint-1.1.md).
- Ainda não há banco, autenticação nem funcionalidade de negócio.
- Adiantado da Sprint 1.3, com autorização: validador de slug do portal (`src/shared/slug.ts`, RN-017)
  com 50 testes Vitest, integrado na `main` pelo PR #7. `npm test` deixou de usar `--passWithNoTests`.

## Pendências

- [ ] Decidir os PRs abertos do Dependabot (#1 `@types/node`, #2 `vitest`, #3 `react`, #4 `zod`)
      conforme a política da [ADR-001](decisions/ADR-001-stack-e-versoes.md).
- [ ] Fixar GitHub Actions por SHA em vez de tag major (Fase 8).
- [ ] Validar comercialmente o nome LabBeautyPro antes de registro de marca.
- [ ] Confirmar as regras marcadas "a confirmar" em [REGRAS-DE-NEGOCIO.md](REGRAS-DE-NEGOCIO.md).

## Próximo passo

**Sprint 1.2 — schema base, RLS e pgTAP:**

- Supabase local (CLI 2.119.0 como devDependency, Docker).
- Schema base de tenancy com `tenant_id`, `UNIQUE (tenant_id, id)` e FKs compostas.
- RLS e funções auxiliares em `private` ([ADR-003](decisions/ADR-003-multi-tenancy-rls.md)).
- Testes pgTAP, incluindo negativos entre tenants e a regra do `specialist`.
- Job de banco no CI.

O fim da Sprint 1.2 é ponto de aprovação obrigatória.
