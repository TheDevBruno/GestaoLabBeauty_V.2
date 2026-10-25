# Estado do projeto

- **Atualizado em:** 2026-10-25

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

- **Sprint 1.3 (auth, convites e guards) concluída e aprovada pelo usuário** em 2026-10-23 (ponto de
  aprovação obrigatória), PR #20 (`feat/sprint-1.3-auth`) já na `main`; as correções da aprovação estão no PR #21
  (`feat/sprint-1.3-aprovacao`, merge com o usuário). Na aprovação:
  RN-038 confirmada; RN-039 (não convidar quem já é membro, checado na criação); `zod` 4.6.6 (exceção à
  ADR-001 por segurança, autorizada); Supabase CLI 2.120.0; job `integration` no CI; pgTAP 1047 PASS,
  264 testes Vitest e 8 de integração. Detalhes em
  [sprint-1.3.md](roadmap/sprint-1.3.md#aprovação-2026-10-23). Verificação final no passo 8:
  `npm ci`, `npm run check` (261 testes + 7 de integração ignorados), `db:test` 1039 PASS, `db lint` sem
  erros, `test:integration` 7 passed, `dist/` sem a service role. Passo 1
  concluído: plano, decisões (convite de 7 dias, owner e admin convidam, onboarding na Sprint 2.5) e
  RN-026/RN-038. Passo 2 concluído: perfil criado por trigger em `auth.users`, tabela `invitations`
  com RLS e `public.accept_invitation`; 1039 asserções pgTAP verdes. Passo 3 concluído: dependências
  `@supabase/supabase-js` 2.117.3 e `@tanstack/react-query` 5.104.1, `src/lib` (cliente Supabase,
  `QueryClient`, validação de env), schemas Zod em `src/shared` e `.env.example`; 92 testes Vitest. Passo 4
  concluído: telas `/entrar`, `/cadastro`, `/convite` (token no fragmento) e `/app` provisório, sessão
  via `AuthProvider`; 169 testes Vitest (com telas em jsdom) e fluxo de convite verificado no navegador
  com o Supabase local. Passo 5 concluído: guards de sessão, de empresa ativa (RN-025, preferência local,
  abre a última usada) e de permissão, com revogação refletida na interface sem novo login (RN-024);
  204 testes Vitest. Passo 6 concluído: `vite` 8.3.4; API Hono em `server/` (`/api/*`, Vercel Function
  em `api/` e plugin do Vite no `npm run dev`) com `POST /api/invitations` (JWT validado no Auth, token
  de 32 bytes, só o hash no banco, service role só no servidor, 403/409 e revogação do expirado); tela
  `/app/equipe` com criar, copiar link, listar e revogar sob RLS; 261 testes Vitest; `dist/` sem a
  service role. Passo 7 concluído: teste de integração da API com o Supabase local
  (`npm run test:integration`, 7 testes, do convite ao aceite) e seis provas de detecção registradas
  (servidor, tela e banco). Registro em [sprint-1.3.md](roadmap/sprint-1.3.md).

- Há contas por e-mail e senha, convites (criar pela API, listar, revogar e aceitar) e guards de rota.
  Membros leem a própria empresa, o próprio perfil e a própria membership; quem tem `members.manage` lê
  a equipe e gerencia convites. Profissionais, clientes e agendamentos existem só com chaves e FKs; a
  Sprint 2 completa as colunas. `platform_admins` segue sem política (nega tudo). Sem funcionalidade de
  negócio além de acesso e equipe.
- Adiantado da Sprint 1.3, com autorização: validador de slug do portal (`src/shared/slug.ts`, RN-017)
  com 50 testes Vitest, integrado na `main` pelo PR #7. `npm test` deixou de usar `--passWithNoTests`.

## Pendências

- [ ] Decidir os PRs abertos do Dependabot (#1 `@types/node`, #2 `vitest`, #3 `react`, #4 `zod`)
      conforme a política da [ADR-001](decisions/ADR-001-stack-e-versoes.md).
- [ ] Fixar GitHub Actions por SHA em vez de tag major (Fase 8).
- [ ] Validar comercialmente o nome LabBeautyPro antes de registro de marca.
- [ ] Confirmar as regras marcadas "a confirmar" em [REGRAS-DE-NEGOCIO.md](REGRAS-DE-NEGOCIO.md).
- [ ] Prova de detecção no CI: uma política `using (true)` em `tenants` deve falhar o job `database`
      (provada só localmente).
- [ ] Favicon: `/favicon.ico` responde 404 (sem ícone definido).
- [ ] Movimento reduzido, texto ampliado do sistema e paisagem: não verificados no navegador
      (Sprints 1.4 e 2.1).
- [ ] `vercel.json` com rewrite do SPA para `index.html` no **primeiro deploy** (decisão do usuário).
- [ ] Supabase CLI: 2.121.0 entra na janela da ADR-001 em 2026-10-28 (instalada: 2.120.0).

## Próximo passo

**Sprint 2.2 — clientes** (`feat/sprint-2.2-clientes`, a partir da `main` em `5848ff1`, merge do PR
#23). Em andamento. Passo 1 concluído: plano em [sprint-2.2.md](roadmap/sprint-2.2.md) aprovado pelo
usuário em 2026-10-25 com todas as recomendações (nome, telefone E.164, e-mail, nascimento e ativo;
contatos não únicos; busca sem acento com a extensão `unaccent`, `search_name` por trigger e
`public.search_clients`; notas e consentimentos fora; arquivar no lugar de excluir; páginas próprias;
menu para quem tem `clients.read`; "Carregar mais" de 50 em 50); RN-045 a RN-047 e complemento da
RN-037. Passo 2 concluído: migration `20261025140000_clients.sql` (colunas `phone`, `email`,
`birth_date`, `is_active`, limite de 120 no nome, `search_name` por trigger com `unaccent`,
`private.search_text` e `public.search_clients` com `security invoker`) e `clients.test.sql` com 248
asserções; pgTAP 1589 PASS, `db lint` sem erros. Passo 3 concluído: seed com contato nos clientes e 12
clientes a mais no Studio Ana (acentos, um arquivado), `src/shared/phone.ts` (formato brasileiro ↔
E.164) e `src/shared/client.ts` (schema do formulário, nascimento até hoje, termo de busca); pgTAP 1590
PASS, 540 testes Vitest, integração 8 passed. Próximo: passo 4 (lista de clientes com busca, filtro e
paginação; item "Clientes" no shell).

Sprint anterior: **Sprint 2.1 — serviços (com `buffer_minutes`) e profissionais**
(`feat/sprint-2.1-servicos-profissionais`, a partir da `main` em `ead9e69`). **Concluída em
2026-10-25**, PR #23 mesclado em 2026-10-25 (não é ponto de aprovação obrigatória).
Passo 1 concluído: plano em [sprint-2.1.md](roadmap/sprint-2.1.md) aprovado pelo usuário em 2026-10-25
com todas as recomendações (sem categorias, moeda em `services.currency`, nome único por empresa, sem
preço por profissional, função de candidatos ao vínculo, páginas próprias, menu só com
`services.manage`, sem `react-hook-form`); RN-040 a RN-044. Passo 2 concluído: migration com `services`,
`professional_services`, nome e ativo em `professionals` e função de candidatos ao vínculo; pgTAP 1340
PASS. Passo 3 concluído: seed com serviços e vínculos, `src/shared/money.ts` e schemas Zod de serviço
e de profissional; pgTAP 1341 PASS, 396 testes Vitest. Passo 4 concluído: telas de serviços em
`src/modules/services/` (lista com tabela e cartões, filtro de inativos, estado vazio, criar e editar
em páginas próprias com `services.manage`, item "Serviços" no shell); 434 testes Vitest, pgTAP 1341
PASS, verificado no navegador em 375 e 1440 px. Passo 5 concluído: telas de profissionais em
`src/modules/professionals/` (membro ligado pela função de candidatos, serviços que faz, vínculos pela
diferença, exclusão em duas etapas com recusa do banco quando há agendamento, item "Profissionais" no
shell); 472 testes Vitest, verificado no navegador em 375 e 1440 px. Passo 6 concluído: `npm ci`,
`check` (472 testes), `db:test` 1341 PASS, `db lint` sem erros, `test:integration` 8 passed, `dist/`
sem a service role; navegador em 375, 768, 1024 e 1440 px com owner, manager e receptionist e teste só
com teclado (registro em [sprint-2.1.md](roadmap/sprint-2.1.md#passo-6--verificação-final-e-encerramento-2026-10-25)).

Sprint anterior: **Sprint 1.4 — design system e app shell** (`feat/sprint-1.4-design-system`, PR #22
mesclado em 2026-10-25). Passo 1 concluído: plano em [sprint-1.4.md](roadmap/sprint-1.4.md) aprovado pelo
usuário em 2026-10-23 (dependências, `components.json`, Inter auto-hospedada, dark mode fora e remoção
dos componentes provisórios). Passo 2 concluído: dependências do design system, `components.json`,
`cn()`, tokens em três camadas (primitivo, semântico, componente), Inter auto-hospedada e teste de
contraste dos tokens. Passo 3 concluído: componentes base em `src/components/ui/` (a partir do
shadcn/ui, ajustados a 44 px, foco sólido e tokens), telas migradas sem mudar os testes de tela e
provisórios apagados. Passo 4 concluído: app shell em `/app/*` (navegação lateral a partir de
1024 px e gaveta abaixo, empresa ativa, troca de empresa por menu, papel, conta e sair); 318 testes
Vitest, pgTAP 1047 PASS. Passo 5 concluído: rotas
preguiçosas e fornecedores separados em `vite.config.ts` (autorizado); maior chunk 214 kB, sem aviso de
500 kB. Passo 6 concluído: `check`, `db:test` (1047) e `test:integration` (8) verdes; navegador em 375,
768, 1024 e 1440 px sem rolagem horizontal, alvos de 44 px e foco visível (registro e capturas em
[sprint-1.4.md](roadmap/sprint-1.4.md)). **Sprint 1.4 concluída em 2026-10-24**, com PR aberto para o
usuário revisar e mesclar (a Sprint 1.4 não é ponto de aprovação obrigatória). Próximo: Sprint 2.1
(serviços com `buffer_minutes` e profissionais), só depois do merge do PR e com autorização.

Requisito local: Docker em execução e `npm run db:start`. O `.env.local` precisa também de
`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` (valores em `npx supabase status`) para
a API funcionar no `npm run dev`. Senha de teste dos usuários do seed:
[sprint-1.2.md](roadmap/sprint-1.2.md#passo-7--seed-sintético-2026-10-22) (só local).
