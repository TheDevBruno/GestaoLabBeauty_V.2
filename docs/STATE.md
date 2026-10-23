# Estado do projeto

- **Atualizado em:** 2026-10-23

## Objetivo

Entregar o MVP do LabBeautyPro descrito na [seção 3 do plano da Fase 0](roadmap/fase-0-plano.md#3-escopo-do-mvp):
autenticação, convites e papéis; onboarding; serviços, profissionais e clientes; agenda sem conflitos;
branding e portal `/{slug}` com agendamento online; financeiro básico; painel global com tenants, planos e
liberação de recursos por plano.

## Situação

- **Fase 1 — Fundação.** Sprint 1.1 (repositório, tooling, CI e ADRs) **concluída** em 2026-10-19,
  com CI verde no GitHub. Detalhes em [sprint-1.1.md](roadmap/sprint-1.1.md).
- **Sprint 1.2 (schema base, RLS e pgTAP) concluída** em 2026-10-22 e **aprovada pelo usuário em
  2026-10-23** (ponto de aprovação obrigatória). Os 10 passos foram concluídos; suíte final com 951 asserções pgTAP,
  `db lint` sem erros e CI da `main` verde nos jobs de qualidade e de banco:
  - Passo 1: Supabase CLI 2.119.0 e projeto local (`supabase/config.toml`, scripts `db:*`).
  - Passo 2: primeira migration (schema `private` e privilégios padrão revogados —
    [ADR-008](decisions/ADR-008-privilegios-explicitos.md)); helpers pgTAP. ADR-008 complementada
    depois com `FOR ROLE postgres` explícito e testes do `service_role`.
  - Passo 3: `tenants`, `profiles`, `memberships`, `platform_admins`, `roles_permissions` e enum
    `member_role`; RLS ligada sem políticas (nega tudo); `GRANT` mínimos só para `authenticated`.
    75 asserções pgTAP verdes.
  - Passo 4: `private.is_member`, `private.has_permission` e `private.is_platform_admin`
    (`security definer`, `STABLE`, `search_path` vazio, `EXECUTE` só para `authenticated`) e matriz do
    plano §8 em `roles_permissions`. 115 asserções pgTAP verdes.
  - Passo 5a: políticas de `tenants` (SELECT para membro, UPDATE com `tenant.settings`) e `profiles`
    (só o próprio perfil). 366 asserções pgTAP verdes.
  - Passo 5b: políticas de `memberships` (troca de papel e remoção com `members.manage`, sem alterar o
    próprio papel, só owner mexe em owner) e leitura de `roles_permissions`; trigger que mantém ao
    menos um owner por empresa (RN-023). Equipe e saída da empresa com `members.manage` (RN-034).
    538 asserções pgTAP verdes.
  - Passo 6: versões mínimas de `professionals`, `clients` e `appointments` com `UNIQUE (tenant_id, id)`,
    FKs compostas (inclusive `professionals → memberships`) e políticas por operação; recorte do
    `specialist` com `private.is_specialist`, `private.is_own_professional` e
    `private.specialist_can_see_client` (RN-027, RN-028). Decisões do usuário: RN-035 a RN-037.
    948 asserções pgTAP verdes.
  - Passo 7: `supabase/seed.sql` sintético (2 empresas, um usuário por papel em cada uma com login local
    de teste, profissionais, clientes e agendamentos) e teste `seed_rls.test.sql`. 951 asserções pgTAP
    verdes, com e sem seed.
  - Passo 8: job `database` no CI (Supabase só com Postgres, `db reset`, `test db`, `db lint`), verde
    no PR #17 e na `main`.
  - Passo 9: encerramento — verificações finais e documentação.

  Plano e registro em [sprint-1.2.md](roadmap/sprint-1.2.md).

- **Sprint 1.3 (auth, convites e guards) em andamento**, branch `feat/sprint-1.3-auth`. Passo 1
  concluído: plano, decisões (convite de 7 dias, owner e admin convidam, onboarding na Sprint 2.5) e
  RN-026/RN-038. Registro em [sprint-1.3.md](roadmap/sprint-1.3.md).

- Membros já leem a própria empresa, o próprio perfil e a própria membership; quem tem
  `members.manage` lê a equipe. Profissionais, clientes e agendamentos existem só com chaves e FKs; a
  Sprint 2 completa as colunas. `platform_admins` segue sem política (nega tudo). Sem autenticação nem
  funcionalidade de negócio.
- Adiantado da Sprint 1.3, com autorização: validador de slug do portal (`src/shared/slug.ts`, RN-017)
  com 50 testes Vitest, integrado na `main` pelo PR #7. `npm test` deixou de usar `--passWithNoTests`.

## Pendências

- [ ] Decidir os PRs abertos do Dependabot (#1 `@types/node`, #2 `vitest`, #3 `react`, #4 `zod`)
      conforme a política da [ADR-001](decisions/ADR-001-stack-e-versoes.md).
- [ ] Fixar GitHub Actions por SHA em vez de tag major (Fase 8).
- [ ] Validar comercialmente o nome LabBeautyPro antes de registro de marca.
- [ ] Confirmar as regras marcadas "a confirmar" em [REGRAS-DE-NEGOCIO.md](REGRAS-DE-NEGOCIO.md).
- [ ] Prova de detecção no CI: uma política `using (true)` em `tenants` deve falhar o job `database`
      (provada só localmente no passo 7).
- [ ] Atualizar o Supabase CLI (2.121.0 disponível) quando sair da janela de 14 dias da ADR-001.

## Próximo passo

**Sprint 1.3 — auth, convites e guards**, passo 2 (banco: perfil automático e `invitations`). Plano e
decisões em [sprint-1.3.md](roadmap/sprint-1.3.md).

Requisito local: Docker em execução e `npm run db:start`. Senha de teste dos usuários do seed:
[sprint-1.2.md](roadmap/sprint-1.2.md#passo-7--seed-sintético-2026-10-22) (só local).
