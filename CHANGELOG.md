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
- Sprint 1.2, passo 3: tabelas `tenants` (slug com `CHECK` da RN-017), `profiles`, `memberships`,
  `platform_admins` e `roles_permissions`, enum `member_role`, trigger que impede trocar `tenant_id`,
  RLS ligada sem políticas e `GRANT` mínimos para `authenticated` (nenhum para `anon`), com 49
  asserções pgTAP.
- Sprint 1.2, passo 4: funções `private.is_member`, `private.has_permission` e
  `private.is_platform_admin` (`security definer`, `STABLE`, `search_path` vazio, `EXECUTE` só para
  `authenticated`), `USAGE` em `private` para `authenticated` e matriz de permissões do plano §8 em
  `roles_permissions` (57 linhas), com 40 asserções pgTAP.
- Sprint 1.2, passo 5a: políticas RLS de `tenants` (membro lê; `tenant.settings` altera o nome) e de
  `profiles` (cada usuário lê e altera só o próprio perfil), com 251 asserções pgTAP geradas a partir
  de uma tabela de casos (2 empresas × 6 papéis × 4 operações).
- Sprint 1.2, passo 5b: políticas RLS de `memberships` (SELECT; UPDATE de `role` com `members.manage`,
  sem alterar o próprio papel e só owner mexendo em owner; DELETE), política de leitura de
  `roles_permissions` e trigger que exige ao menos um owner por empresa (RN-021 a RN-023); equipe e
  saída da empresa com `members.manage` (RN-034). 173 asserções pgTAP em tabela de casos e prova de detecção.
- Sprint 1.2, passo 6: tabelas mínimas `professionals`, `clients` e `appointments` com FKs compostas
  (`appointments → clients`, `appointments → professionals`, `professionals → memberships`), RLS e uma
  política por operação; funções `private.is_specialist`, `private.is_own_professional` e
  `private.specialist_can_see_client` para o recorte do `specialist` (RN-027, RN-028, RN-035 a RN-037).
  410 asserções pgTAP em tabela de casos e prova de detecção.
- Sprint 1.2, passo 7: seed sintético (`supabase/seed.sql`): 2 empresas, um usuário por papel em cada
  uma (com login local de teste), profissionais, clientes e agendamentos cobrindo a regra do
  `specialist`. Teste pgTAP `seed_rls.test.sql` prova que o seed não vaza dados entre empresas; a suíte
  passa com e sem o seed.
- Sprint 1.2, passo 8: job `database` no CI com Supabase local só com Postgres (`supabase start -x`),
  `supabase db reset`, `supabase test db` e `supabase db lint`.
- Sprint 1.2 encerrada (passo 9): 951 asserções pgTAP, `db lint` sem erros e CI verde;
  `docs/STATE.md` e `docs/roadmap/sprint-1.2.md` atualizados. Aprovada pelo usuário em 2026-10-23.
- Sprint 1.3, passo 1: plano em `docs/roadmap/sprint-1.3.md`; RN-026 confirmada (convite de 7 dias,
  owner e admin convidam) e RN-038 (aceite do convite) a confirmar.
- Sprint 1.3, passo 2: trigger que cria o `profiles` junto com a conta; tabela `invitations` (token só
  como hash, validade de 7 dias, trigger que valida quem convida), RLS de leitura e revogação e função
  `public.accept_invitation`; 88 asserções pgTAP novas (1039 no total).
- Sprint 1.3, passo 3: `@supabase/supabase-js` 2.117.3 e `@tanstack/react-query` 5.104.1; `src/lib`
  (cliente Supabase com chave anônima, `QueryClient`, validação das variáveis `VITE_`), schemas Zod de
  login, cadastro e convite em `src/shared`, `.env.example` e 42 testes Vitest novos (92 no total).
- Sprint 1.3, passo 4: rotas com `react-router` (`/entrar`, `/cadastro`, `/convite`, `/app` provisório e
  página não encontrada), `AuthProvider` com a sessão do Supabase, contrato `AuthApi` com mensagens de
  erro em pt-BR, aceite do convite por clique com o token no fragmento da URL, `?next=` sem open
  redirect, componentes de formulário acessíveis e tokens semânticos provisórios. Dependências de teste
  `jsdom` 30.1.2 e `@testing-library/{react,dom,user-event}`; 77 testes Vitest novos (169 no total).
- Sprint 1.3, passo 5: guards de rota (`RequireSession`, `RequireTenant`, `RequirePermission`), empresa
  ativa só entre as memberships do usuário (RN-025) guardada como preferência local, `usePermission`
  sobre `roles_permissions`, revogação refletida na interface sem novo login (RN-024), cache apagado ao
  sair, painel com empresa e papel e página `/app/equipe` protegida por `members.manage`. 35 testes
  Vitest novos (204 no total).
- Sprint 1.3, passo 6: API Hono (`hono` 4.13.13) em `server/`, servida em `/api/*` pela Vercel Function
  `api/[[...route]].ts` e, no `npm run dev`, por um plugin do Vite (`@hono/node-server` 2.1.4).
  `POST /api/invitations` valida o JWT no Auth, valida o corpo com o schema compartilhado, gera token de
  32 bytes, grava só o sha-256 com a service role (só no servidor), revoga o convite pendente expirado
  antes de criar outro e responde erros no formato `{ code, message, details? }` (403 do trigger, 409
  de pendente). Tela `/app/equipe` com criação, link mostrado uma vez com cópia, lista de pendentes e
  revogação sob RLS. 57 testes Vitest novos (261 no total); `dist/` sem a service role.
- Sprint 1.3, passo 7: teste de integração da API de convites com o Supabase local
  (`server/invitations.integration.test.ts`, script `npm run test:integration`, 7 testes, do convite ao
  aceite e RLS de listar e revogar) e seis provas de detecção registradas em `sprint-1.3.md`.

### Alterado

- `vite` 8.3.2 → 8.3.4 (autorizado pelo usuário), que corrige a vulnerabilidade alta apontada pelo
  `npm audit` no servidor de desenvolvimento.

- `.claude/settings.json` libera commit, push das branches de trabalho e `gh pr create` para o
  Claude Code; bloqueia push na `main`, force push, `reset --hard` e `clean`; merge pede confirmação.
  AGENTS.md ganha a exceção correspondente ao item D3.
- ADR-008 complementada (autorizado pelo usuário): `FOR ROLE postgres` explícito e testes que
  confirmam que `service_role` mantém os privilégios padrão em `public`.

- RN-017 confirmada com formato, tamanho e lista de slugs reservados.
- Script `test` sem `--passWithNoTests`: `npm test` agora falha se nenhum teste for encontrado
  (`AGENTS.md` e `docs/STATE.md` atualizados).
- Sprint 1.1 encerrada: CI e Dependabot confirmados no GitHub; `docs/STATE.md` e
  `docs/roadmap/sprint-1.1.md` atualizados.
