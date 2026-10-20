# Estado do projeto

- **Atualizado em:** 2026-10-19

## Objetivo

Entregar o MVP do LabBeautyPro descrito na [seção 3 do plano da Fase 0](roadmap/fase-0-plano.md#3-escopo-do-mvp):
autenticação, convites e papéis; onboarding; serviços, profissionais e clientes; agenda sem conflitos;
branding e portal `/{slug}` com agendamento online; financeiro básico; painel global com tenants, planos e
liberação de recursos por plano.

## Situação

- **Fase 1 — Fundação.** Sprint 1.1 (repositório, tooling, CI e ADRs) **concluída localmente** em
  2026-10-19.
- `npm run check` executado com exit 0 (Windows 11, Node 24.20, npm 11.19). Detalhes em
  [sprint-1.1.md](roadmap/sprint-1.1.md).
- Ainda não há banco, autenticação nem funcionalidade de negócio.
- Adiantado da Sprint 1.3, com autorização, na branch `feat/slug-portal`: validador de slug do portal
  (`src/shared/slug.ts`, RN-017) com 50 testes Vitest. `npm test` deixou de usar `--passWithNoTests`.
  `npm run check` com exit 0 em 2026-10-19. Push, PR e merge autorizados pelo usuário (D3).

## Pendências

- [ ] Primeiro push para `TheDevBruno/GestaoLabBeauty_V.2` — exige autorização (D3).
- [ ] CI nunca executado no GitHub (depende do push).
- [ ] Dependabot inativo até o push.
- [x] Removido `--passWithNoTests` do script `test` (primeiros testes em `src/shared/slug.test.ts`).
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
