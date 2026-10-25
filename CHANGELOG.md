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
- Sprint 1.3, passo 8: encerramento com verificação final registrada.
- Sprint 1.3, aprovação: RN-039 — convite para quem já é membro é recusado na criação (trigger
  `invitations_check_not_member`, 409 `already_member` na API, mensagem na tela; 8 asserções pgTAP e 4
  testes novos); job `integration` no CI (API + Supabase local com `npm run test:integration`).
- Sprint 1.4, passo 1: plano do design system e do app shell em `docs/roadmap/sprint-1.4.md`
  (diagnóstico, direção visual, dependências e configuração para autorização).
- Sprint 1.4, passo 2: dependências do design system (`radix-ui`, `class-variance-authority`, `clsx`,
  `tailwind-merge`, `lucide-react`, `@fontsource-variable/inter`, `tw-animate-css`), `components.json`,
  `cn()`, tokens em três camadas em `src/styles/index.css`, Inter auto-hospedada,
  `src/shared/color-contrast.ts` e teste de contraste dos tokens.
- Sprint 1.4, passo 3: componentes base em `src/components/ui/` (`button`, `input`, `label`,
  `native-select`, `field`, `card`, `alert`, `text-link`, `sheet` e `dropdown-menu`) e testes de
  componente.
- Sprint 1.4, passo 4: app shell em `/app/*` (`src/app/shell/`): navegação lateral a partir de 1024 px
  e gaveta abaixo, empresa ativa e papel, troca de empresa por menu, conta, sair, link para pular para
  o conteúdo e `aria-current` no item atual.
- Sprint 1.4, passo 5: divisão de código. Páginas e shell carregam por rota (`lazy` do React Router) com
  `RouteFallback` (`role="status"`); `vite.config.ts` separa fornecedores em `vendor-react`,
  `vendor-router-query` e `vendor-supabase` (autorizado pelo usuário). Maior chunk: 214 kB (era 808 kB).
- Sprint 1.4, passo 6: verificação final em 375, 768, 1024 e 1440 px (sem rolagem horizontal, alvos de
  44 px, foco visível, gaveta com foco preso) e capturas em `docs/roadmap/sprint-1.4-capturas/`.
  Sprint 1.4 concluída.
- Sprint 2.1, passo 1: plano de serviços (com `buffer_minutes`) e profissionais em
  `docs/roadmap/sprint-2.1.md`, aprovado; RN-040 a RN-044.
- Sprint 2.1, passo 2: tabelas `services` (duração, `buffer_minutes` opcional, preço em centavos e
  moeda, ativo, nome único por empresa) e `professional_services`, colunas `display_name` e `is_active`
  em `professionals` e função `public.list_professional_link_candidates`, com RLS, `GRANT` mínimos e
  293 asserções pgTAP novas.
- Sprint 2.1, passo 3: seed com 3 serviços por empresa (com intervalo, sem intervalo e inativo) e
  vínculos profissional × serviço; `src/shared/money.ts` (reais ↔ centavos e formatação pt-BR) e
  schemas Zod dos formulários de serviço e de profissional, com 78 testes Vitest novos.
- Sprint 2.1, passo 4: telas de serviços em `src/modules/services/` (primeiro módulo de negócio):
  lista em `/app/servicos` (tabela a partir de 1024 px, cartões abaixo, filtro "Mostrar inativos",
  estado vazio), páginas `/app/servicos/novo` e `/app/servicos/:id` com `services.manage`, item
  "Serviços" no shell, escrita direto no Supabase sob RLS e nome repetido mostrado junto ao campo.
  Componentes `Textarea`, `TextareaField` e `CheckboxField`; `ShellPage` com largura `wide`.
- Sprint 2.1, passo 5: telas de profissionais em `src/modules/professionals/`: lista em
  `/app/profissionais` (membro ligado ou "Sem acesso ao sistema", quantidade de serviços, status,
  tabela e cartões, filtro de inativos, estado vazio), páginas `/app/profissionais/novo` e
  `/app/profissionais/:id` com nome exibido, membro da equipe (função `list_professional_link_candidates`),
  serviços que faz (`fieldset`/`legend`) e ativo; vínculos acertados pela diferença; exclusão em duas
  etapas com mensagem para desativar quando há agendamento; item "Profissionais" no shell.
  `SavedNotice` e `StatusBadge` passaram a ser compartilhados pelos dois módulos.
- Sprint 2.1, passo 6: verificação final (`npm ci`, `check`, `db:test`, `db lint`, integração,
  `dist/` sem a service role, navegador em 375/768/1024/1440 px com owner, manager e receptionist e
  teste só com teclado) e encerramento da sprint.
- Sprint 2.2, passo 1: plano de clientes em `docs/roadmap/sprint-2.2.md` (diagnóstico de `clients`,
  modelo com telefone E.164, e-mail, nascimento e arquivamento, busca sem acento com `unaccent` e
  `search_clients`, telas por papel), aprovado; RN-045 a RN-047 e complemento da RN-037.
- Sprint 2.2, passo 2: colunas `phone` (E.164), `email`, `birth_date` e `is_active` em `clients`, limite
  de 120 no nome, extensão `unaccent`, `search_name` mantida por trigger, `private.search_text` e
  `public.search_clients` (busca sem acento por nome ou telefone, `security invoker`, paginada), com
  `GRANT` de colunas e 248 asserções pgTAP novas.
- Sprint 2.2, passo 3: seed com telefone, e-mail e nascimento fictícios nos clientes e 12 clientes a
  mais no Studio Ana (nomes com acento, um arquivado); `src/shared/phone.ts` (formato brasileiro ↔
  E.164) e `src/shared/client.ts` (schema do formulário de cliente e termo de busca), com 68 testes
  Vitest novos.
- Sprint 2.2, passo 4: lista de clientes em `/app/clientes` (`src/modules/clients/`): busca por nome ou
  telefone pela função `search_clients` com espera de 300 ms e termo em `?q=`, "Mostrar arquivados",
  contagem em `role="status"`, tabela a partir de 1024 px e cartões abaixo, "Carregar mais" de 50 em 50
  com foco no primeiro novo, estados vazio, sem resultado e erro; item "Clientes" no shell para quem
  tem `clients.read` e "Novo cliente" só para quem cadastra. `StatusBadge` com rótulos configuráveis e
  `SavedNotice` mantendo a busca da URL. 38 testes Vitest novos.
- Sprint 2.2, passo 5: cadastro de cliente em `/app/clientes/novo` (negado ao specialist) e edição em
  `/app/clientes/:id` com arquivar e reativar pelo "Cliente ativo"; ficha de leitura para quem só tem
  `clients.read`; "Cliente não encontrado" sem revelar o motivo; botão "Abrir" na lista e volta
  mantendo a busca. `RequirePermission` ganhou `deny`. 31 testes Vitest novos.

### Alterado

- Sprint 1.4: `/app` virou boas-vindas dentro do shell e "Trocar de empresa" abre um menu com as
  outras empresas em vez de voltar ao seletor.
- Sprint 1.4: telas migradas para `src/components/ui/`; `TextField`, `SelectField` e `Button`
  provisórios removidos de `src/app/components/`.
- Sprint 1.4: tokens provisórios da Sprint 1.3 substituídos pelos do design system; borda dos campos
  de `stone-400` para `stone-500` (contraste de 3:1).
- `vite` 8.3.2 → 8.3.4 (autorizado pelo usuário), que corrige a vulnerabilidade alta apontada pelo
  `npm audit` no servidor de desenvolvimento.
- `zod` 4.6.5 → 4.6.6 (GHSA-mrhx-c7xc-m3w5; exceção à janela de 14 dias da ADR-001 autorizada pelo
  usuário por ser correção de segurança) e Supabase CLI 2.119.0 → 2.120.0. `npm audit` sem
  vulnerabilidades.
- RN-038 confirmada pelo usuário (aceite exige e-mail da conta igual ao convidado e confirmado).

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
