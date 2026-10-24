# Sprint 1.3 — Auth, convites e guards

- **Início:** 2026-10-23
- **Status:** concluída e aprovada pelo usuário em 2026-10-23 (ponto de aprovação obrigatória)
- **Branch:** `feat/sprint-1.3-auth`

## Objetivo

Autenticação por e-mail e senha, convite de membros e guards de rota no frontend, sem abrir mão da RLS
como barreira real ([ADR-003](../decisions/ADR-003-multi-tenancy-rls.md)). Convites passam pela API
(`server/`), porque exigem service role ([ADR-002](../decisions/ADR-002-camadas-supabase-rpc-api.md)).
O fim da sprint é ponto de aprovação obrigatória.

## Decisões do usuário (2026-10-23)

- Convite expira em **7 dias**.
- **Owner e admin** convidam (permissão `members.manage`). Só o owner convida para o papel `owner`
  (RN-022).
- Criação de empresa (onboarding) fica na **Sprint 2.5**. Na 1.3 existem só o seed local e o convite.
- Autorizada a instalação de `@supabase/supabase-js`, `hono` e TanStack Query (ADR-001), e os ajustes de
  `vite.config.ts` e `eslint.config.js` que forem necessários.
- Senha: mantém o **mínimo de 6** do Supabase local e a confirmação de e-mail como está (desligada
  localmente).
- Passo 4: link do convite com o token no **fragmento** (`/convite#<token>`), que não vai ao servidor;
  **cadastro aberto** a qualquer pessoa (a conta nasce sem empresa); dependências de teste de interface
  autorizadas (`jsdom`, `@testing-library/*`).
- Passo 5: a empresa ativa é **preferência local** (`localStorage`, uma por usuário), sem a empresa na
  URL; com várias empresas, abre a **última usada** e só mostra o seletor se ela não for mais válida.

## Fora do escopo

- MFA do admin global: Sprint 5.1, apenas em `/api/admin` (ADR-003 §6).
- Onboarding e criação de empresa: Sprint 2.5.
- Design system e app shell: Sprint 1.4. As telas da 1.3 são funcionais e simples.
- Envio de e-mail de convite: Fase 6. Na 1.3 a API devolve o link do convite.

## Forma de trabalho

Um passo por vez. Cada passo termina com `npm run check` verde, `npm run db:test` verde, commit,
`docs/STATE.md` atualizado e push da branch. Nenhuma migration é aplicada em homologação ou produção
([ADR-005](../decisions/ADR-005-ambientes.md)). Migrations só para frente; reverter é uma migration nova.

## Passos

| #   | Passo                                      | Status    |
| --- | ------------------------------------------ | --------- |
| 1   | Plano e regras (RN-026, RN-038)            | concluído |
| 2   | Banco: perfil automático e `invitations`   | concluído |
| 3   | Base do frontend (`src/lib`, `src/shared`) | concluído |
| 4   | Auth e rotas                               | concluído |
| 5   | Guards (sessão, empresa ativa, permissão)  | concluído |
| 6   | API de convites (`server/`, Hono)          | concluído |
| 7   | Testes                                     | concluído |
| 8   | Encerramento da sprint                     | concluído |

## Registro

### Passo 1 — Plano e regras (2026-10-23)

- Este documento.
- RN-026 confirmada (prazo de 7 dias e quem convida) e RN-038 registrada como "a confirmar" (aceite do
  convite) em [REGRAS-DE-NEGOCIO.md](../REGRAS-DE-NEGOCIO.md).

### Passo 2 — Banco: perfil automático e convites (2026-10-23)

Migrations novas (as anteriores não foram editadas):

- `20261023120000_profile_on_signup.sql`: trigger `on_auth_user_created` em `auth.users` chama
  `private.handle_new_user`, que cria o `profiles` (nome de `raw_user_meta_data.full_name`, aparado; em
  branco vira nulo). Contas já existentes ganham o perfil que faltava.
- `20261023121000_invitations.sql`:
  - tabela `invitations` com `UNIQUE (tenant_id, id)`, `token_hash` (sha-256 em hexadecimal, único),
    e-mail normalizado, validade de 7 dias, `accepted_*` e `revoked_at`, e um convite pendente por
    e-mail e empresa (índice parcial);
  - trigger `private.check_invitation_inviter`: quem convida precisa de `members.manage` na empresa e
    só owner convida para `owner`. Vale também para a service role, que ignora a RLS;
  - RLS: SELECT com `members.manage` (sem a coluna `token_hash`) e UPDATE só de `revoked_at`
    (convite pendente; convite de owner só o owner revoga). Sem INSERT nem DELETE para `authenticated`;
  - `public.accept_invitation(p_token text)`: `security definer`, valida a sessão, o hash do token, a
    validade, o uso único e que o e-mail da conta, **confirmado**, é o do convite (RN-038); cria a
    membership. Falhas de validação devolvem a mesma mensagem. `EXECUTE` só para `authenticated`.

Decisão de desenho: o **aceite fica numa função Postgres**, não na API do passo 6
([ADR-002](../decisions/ADR-002-camadas-supabase-rpc-api.md) §2, comando atômico). A API do passo 6 fica
com a **criação** do convite (gera o token, grava o hash, devolve o link); listar e revogar são
direto sob RLS.

Testes: `profile_on_signup.test.sql` (8) e `invitations.test.sql` (80). Dois testes da 1.2
(`rls_tenants_profiles`) passaram a atualizar o perfil em vez de inserir, porque o perfil agora nasce
com a conta. Suíte: 1039 asserções pgTAP verdes; `db lint` sem erros.

### Passo 3 — Base do frontend (2026-10-23)

Dependências (versão exata, publicadas há 14 dias ou mais em 2026-10-23, [ADR-001](../decisions/ADR-001-stack-e-versoes.md)):

| Pacote                  | Versão  | Publicada  | `latest` na data      |
| ----------------------- | ------- | ---------- | --------------------- |
| `@supabase/supabase-js` | 2.117.3 | 2026-10-07 | 2.118.0 (10-15, nova) |
| `@tanstack/react-query` | 5.104.1 | 2026-10-02 | 5.104.5 (10-19, nova) |

O Hono (4.13.13, de 2026-10-04) entra no passo 6. `vite.config.ts` e `eslint.config.js` não mudaram.

Entregue:

- `src/lib/env.ts`: valida `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com Zod; o erro cita o nome da
  variável e nunca o valor. `src/lib/supabase.ts`: cliente do navegador (chave anônima, sessão
  persistida). `src/lib/query-client.ts`: `QueryClient` sem retry em erro 4xx e até 2 tentativas nos demais.
- `src/shared/roles.ts` (papéis, iguais ao enum `member_role`), `auth.ts` (login e cadastro; e-mail aparado
  e em minúsculas; senha de 6 a 72 caracteres no cadastro, qualquer senha não vazia no login) e
  `invitation.ts` (criação de convite e formato do token: 43 caracteres base64url).
- `.env.example` só com as duas variáveis `VITE_`.
- 42 testes Vitest novos (92 no total). O teste de `env.ts` achou um defeito de mensagem (variável ausente
  não era citada) e foi corrigido.

Observação: `npm audit` aponta 1 vulnerabilidade alta no `vite@8.3.2` (servidor de desenvolvimento),
instalado na Sprint 1.1 e sem relação com este passo. Fica como pendência para decisão do usuário
(o `npm audit` atinge só o `vite` 8.3.0 a 8.3.2; o `vite@8.3.4`, de 2026-10-08, está dentro da política de
14 dias, e o `8.3.5`, de 2026-10-21, ainda não).

### Passo 4 — Auth e rotas (2026-10-23)

Dependências de desenvolvimento (versão exata, publicadas até 2026-10-09; peers conferidos):
`jsdom` 30.1.2 (a 30.1.3 é nova), `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2 e
`@testing-library/user-event` 14.6.7 (a 14.6.8 é nova). O ambiente jsdom é ligado por arquivo
(`// @vitest-environment jsdom`); `vite.config.ts` e `eslint.config.js` não mudaram.

Entregue:

- `src/lib/auth-api.ts`: contrato `AuthApi` (sessão, login, cadastro, saída, aceite do convite) e a
  implementação com `supabase-js`. As telas só conhecem o contrato, o que permite testá-las sem Supabase.
  `src/lib/auth-errors.ts`: mensagens em pt-BR por código do Auth e por SQLSTATE da RPC; a mensagem crua
  do servidor nunca chega à tela.
- `src/app/auth/`: `AuthProvider` (sessão via `getSession` + `onAuthStateChange`), `useAuth`,
  `safeNextPath` (só caminhos internos em `?next=`, sem open redirect) e o token do convite (lido do
  fragmento, guardado na `sessionStorage`, retirado da URL).
- Rotas (`src/app/routes.tsx`, `react-router`): `/` → `/app`; `/entrar`; `/cadastro`; `/convite` (aceite
  por clique, nunca automático; "Entrar com outra conta"); `/app` (painel provisório: e-mail e Sair; sem
  sessão manda para `/entrar?next=/app`); página "não encontrada". Todos os segmentos estão na lista de
  slugs reservados (RN-017).
- Componentes provisórios em `src/app/components/` (campo, botão, moldura) com label visível, erro junto
  ao campo via `aria-describedby`, `aria-invalid`, foco no primeiro campo inválido, `role="alert"` no
  erro do servidor, alvos de 44 px, foco visível, `autocomplete` correto e colar senha permitido.
- Tokens semânticos provisórios em `src/styles/index.css` (`@theme`) e respeito a
  `prefers-reduced-motion`. O design system é a Sprint 1.4.
- 77 testes Vitest novos (169 no total), incluindo telas em jsdom. Prova de detecção: tirar a limpeza do
  token após o aceite fez o teste correspondente falhar.

Verificação manual no navegador, com o Supabase local completo (Auth ligado) e dados sintéticos:
senha errada → "E-mail ou senha incorretos."; login com usuário do seed → `/app`; convite criado no banco
local (simulando a API do passo 6) → `/convite#<token>` limpa a URL e guarda o token → cadastro com o
e-mail convidado → volta ao convite → aceite → membership `receptionist` criada e token apagado. Em 375 px,
sem rolagem horizontal e com alvos de 44 px.

Observações:

- O bundle passou a 646 kB (188 kB gzip), acima do aviso de 500 kB do Vite, por causa do `supabase-js`.
  Divisão de código por rota fica para a Sprint 1.4.
- A lista de memberships e o aviso "sem empresa" no `/app` ficaram para o passo 5 (abaixo).

### Passo 5 — Guards (2026-10-23)

Sem dependência nova nem mudança em `vite.config.ts` ou `eslint.config.js`.

Entregue:

- `src/lib/tenancy-api.ts`: contrato `TenancyApi` (memberships do usuário com a empresa embutida e
  permissões de um papel em `roles_permissions`), tudo sob RLS com o JWT do usuário. As linhas são
  validadas com Zod; erro do servidor vira `TenancyError`, sem repassar detalhes.
- `src/app/guards/`: `RequireSession` (layout de `/app/*`: sem sessão manda para `/entrar` com volta à
  rota pedida), `RequireTenant` (carregando, erro com "tentar de novo", **nenhuma empresa**, **escolha**
  ou conteúdo) e `RequirePermission` (tela "acesso não permitido").
- `src/app/tenancy/`: `resolveActiveTenant` (RN-025: a empresa ativa só sai da lista de memberships do
  usuário), `ActiveTenantProvider`, `usePermission(permissão)` e a preferência local por usuário.
  Preferência que não é mais uma membership é ignorada e apagada.
- **Revogação (RN-024):** a lista de memberships nunca é considerada atual (`staleTime` 0) e é buscada
  de novo ao focar a janela, ao reconectar, a cada navegação e a cada 60 s com a aba visível. Papel
  rebaixado ou membership removida refletem na interface sem novo login. A matriz de permissões fica em
  cache de 5 min (global, só muda por migration). Ao sair, o cache de consultas é apagado.
- `/app` mostra empresa, papel e, para quem tem `members.manage`, o link para `/app/equipe`, página
  protegida por permissão (o formulário de convite vem no passo 6). "Trocar de empresa" aparece com
  mais de uma.
- Quem tinha uma só empresa continua nela ao ganhar a segunda (a empresa em uso vira a "última usada").
- 35 testes Vitest novos (204 no total). Provas de detecção: tirar a nova busca de memberships ao
  navegar fez falhar os dois testes de revogação.

Verificação manual no navegador (Supabase local, dados sintéticos): recepcionista do seed em
`/app/equipe` → "acesso não permitido"; promovida a `admin` no banco, a navegação seguinte já mostra
"Administrador(a)" e o link da equipe, sem novo login; com uma segunda empresa concedida no banco,
continua na primeira e o seletor lista só as duas empresas dela com o papel de cada uma.

A guarda de interface é conveniência: a RLS nega os dados a quem não tem a permissão, com ou sem ela.

### Passo 6 — API de convites (2026-10-23)

Dependências (versão exata, publicadas até 2026-10-09, [ADR-001](../decisions/ADR-001-stack-e-versoes.md)):

| Pacote                    | Versão  | Publicada  | Observação                                         |
| ------------------------- | ------- | ---------- | -------------------------------------------------- |
| `vite` (dev)              | 8.3.4   | 2026-10-08 | era 8.3.2; corrige o `npm audit` alto (autorizado) |
| `hono`                    | 4.13.13 | 2026-10-04 | `engines.node >=16.9`                              |
| `@hono/node-server` (dev) | 2.1.4   | 2026-10-08 | peer `hono ^4`; a 2.1.5 é nova                     |

Configuração (ajustes autorizados na decisão da sprint): `tsconfig.node.json` passa a incluir `server/` e
`api/` (o ESLint type-checked precisa disso); `vite.config.ts` ganha o plugin `labbeautypro-api-dev`, que
só no `npm run dev` atende `/api/*` com a API de `server/`. `eslint.config.js` não mudou.

Entregue:

- `server/app.ts` (`createApp`): `POST /api/invitations`. Valida `Authorization: Bearer` com
  `auth.getUser` (chave anônima; sessão encerrada no Auth também dá 401), valida o corpo com
  `createInvitationRequestSchema` (`src/shared/invitation.ts`), gera o token (`randomBytes(32)`,
  base64url, 43 caracteres) e grava só o sha-256 em hexadecimal com a service role. 42501 do trigger →
  403; 23505 do índice de pendente → revoga o pendente **expirado** e tenta uma vez mais, senão 409.
  Chegar ao 23505 prova que o trigger aceitou quem convida, então a revogação nunca roda para quem não
  gerencia a empresa. Resposta 201 `{ id, link: "/convite#<token>", expiresAt }` com
  `Cache-Control: no-store`. Limite de corpo de 16 KiB (413). Erros sempre `{ code, message, details? }`;
  o 500 registra só nome e mensagem no log do servidor.
- `server/invitation-store.ts`: porta `InvitationStore` e adaptador Supabase (cliente anônimo para o
  JWT, cliente admin para gravar). Erro inesperado do banco vira exceção sem a mensagem do Postgres.
- `server/env.ts`: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`, sem `VITE_`; o
  erro cita o nome e nunca o valor. `.env.example` só com os nomes.
- `api/[[...route]].ts`: Vercel Function no formato Web padrão (`app.fetch`). `hono/vercel` não foi usado
  por estar obsoleto no Hono 4.
- `src/shared/api-error.ts` (formato de erro) e, em `invitation.ts`, os schemas de pedido e resposta.
  `tenantId` usa `z.guid()`: o `z.uuid()` exige versão RFC e recusava os ids do seed — defeito achado no
  teste manual, coberto agora pelo teste da API.
- `src/lib/invitations-api.ts`: contrato `InvitationsApi` (listar pendentes com colunas explícitas,
  criar pela API com o JWT da sessão, revogar por update de `revoked_at`; nenhuma linha afetada = erro).
  Mensagens da tela por código, sem repassar o texto do servidor.
- `/app/equipe`: formulário (e-mail e papel; "Proprietário(a)" só para o owner, RN-022), aviso "Convite
  criado" com foco, link mostrado uma única vez em campo somente leitura e botão "Copiar link" (com
  mensagem alternativa se a área de transferência for negada), lista de pendentes com validade e
  "Expirado em" por extenso, revogação com confirmação em linha (convite de owner só o owner revoga) e
  anúncios em `role="status"`. Skill `ui-ux-pro-max` consultada antes (confirmação de ação destrutiva,
  feedback de envio, status sem mover o foco).
- 57 testes Vitest novos (261 no total): API com `app.request` e store falso (401, 400, 413, 403, 409,
  revogação do expirado, 201, token de 32 bytes, hash gravado, 500 sem SQL, 404), adaptador do Supabase,
  token, env, `InvitationsApi` e a tela em jsdom.

Verificação manual (Supabase local, dados sintéticos do seed, `ana.admin@example.test`):

| Verificação                                                   | Resultado                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `POST /api/invitations` sem JWT                               | 401 `unauthorized`                                                                                            |
| JWT de sessão já encerrada no Auth (após `db reset` anterior) | 401 (o `getUser` recusa `session_not_found`)                                                                  |
| Criar pela tela                                               | 201; foco em "Convite criado"; link com 43 caracteres                                                         |
| Banco                                                         | `token_hash` = sha-256 do token; `invited_by` certo; 7 dias                                                   |
| Mesmo e-mail de novo                                          | 409 `invitation_pending`                                                                                      |
| Admin pede papel `owner` / outra empresa                      | 403 / 403 (trigger)                                                                                           |
| Pendente expirado no banco e novo convite                     | 201; o antigo revogado, o novo válido                                                                         |
| Revogar pela tela                                             | confirmação, "Convite de … revogado.", sai da lista                                                           |
| 375 px                                                        | sem rolagem horizontal; nenhum controle abaixo de 44 px                                                       |
| "Copiar link" no painel do navegador do app                   | área de transferência negada → mensagem alternativa                                                           |
| `vite build` + busca em `dist/`                               | valor da service role, `SUPABASE_SERVICE_ROLE_KEY`, `service_role`, `server/`: 0; chave anônima (controle): 1 |

Depois do teste manual: `npm run db:reset` e `npm run db:test` → `Files=12, Tests=1039`, `Result: PASS`.

Observações:

- `npm audit` passou a apontar 1 vulnerabilidade alta no `zod` < 4.6.6 (memória ao validar coleções
  grandes; GHSA-mrhx-c7xc-m3w5). O `zod` 4.6.6 é de 2026-10-11 e entra na janela de 14 dias em
  2026-10-25. Mitigação até lá: os schemas da API não têm coleções e o corpo é limitado a 16 KiB.
- O SPA na Vercel vai precisar de rewrite das rotas do navegador para `index.html` (`vercel.json`) no
  primeiro deploy; fora deste passo.
- Convidar quem já é membro só falha no aceite ("já é membro"); sem checagem na criação.

### Passo 7 — Testes e prova de detecção (2026-10-23)

Lacuna encontrada: os testes da API usavam um store em memória, e o contrato real com o banco (códigos
42501 e 23505, nome do índice de pendente, colunas, `auth.getUser`, aceite com o token gerado) só tinha
verificação manual. O pgTAP de `invitations` (80 asserções) já cobria privilégios, RLS, trigger e aceite.

Entregue:

- `server/invitations.integration.test.ts` (7 testes): API real (`createAppFromEnv`) contra o Supabase
  local com o seed sintético. Cobre 401 sem JWT e com JWT forjado; criação com e-mail normalizado,
  `Cache-Control: no-store`, `token_hash` = sha-256 do token e `invited_by` certo; lista sob RLS;
  conta convidada com e-mail confirmado aceita pela RPC, membership com o papel do convite e token de uso
  único; 409 para pendente válido; expirado revogado e substituído; 403 (admin → owner, admin de outra
  empresa, recepção) sem nada gravado; `token_hash` ilegível para `authenticated` (42501), recepção não
  lista, admin de outra empresa não revoga e admin da empresa revoga. Listar e revogar usam as mesmas
  consultas do adaptador do navegador, que `server/` não importa (ARCHITECTURE.md).
- Script `npm run test:integration` (`vitest run --mode integration`). A suíte só roda nesse modo: `npm
test` e o CI a mostram como ignorada (7 skipped), porque exige Docker. Comando listado no AGENTS.md.
- Sem mudança de CI (alteração de CI exige autorização).

Provas de detecção (cada mutação aplicada, testes rodados e mutação revertida; `git diff` vazio ao fim):

| Mutação                                                                  | Detectada por                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Store não reconhece o índice `invitations_pending_email_key` (23505→500) | Vitest: `invitation-store` (1); integração: 409/expirado (1)               |
| API não tenta de novo após revogar o expirado                            | Vitest: `app` "pendente expirado" (1); integração: 409/expirado (1)        |
| Token de 31 bytes                                                        | Vitest: `token` (1) e `app` (2); integração (3)                            |
| Hash gravado diferente do sha-256 do token                               | Vitest: `app` (1); integração (3; o `CHECK` de formato do banco recusa)    |
| Tela mostra "Proprietário(a)" para admin                                 | Vitest: `team-page` "admin vê a opção Proprietário(a): false" (1)          |
| `invitations_select_manage` com `using (true)` (direto no banco local)   | pgTAP: `invitations.test.sql` 21/80 falham, `Result: FAIL`; integração (1) |

Depois das provas: `npm run db:reset`, `npm run db:test` → `Files=12, Tests=1039`, `Result: PASS`;
`npm run test:integration` → 7 passed; `npm run db:reset` de novo para limpar os dados da integração.

Pendente (fora deste passo): prova de detecção no CI (job `database`) continua só local; rodar a
integração no CI exige mudar o workflow, o que depende de autorização.

### Passo 8 — Encerramento (2026-10-23)

Verificação final (Supabase local completo, dados sintéticos):

| Comando                                          | Resultado                                                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                         | instalado a partir do lock (com o `npm run dev` parado: no Windows o servidor trava arquivos do `node_modules`) |
| `npm run check`                                  | typecheck, lint, Prettier, `Tests 261 passed \| 7 skipped`, build                                               |
| `npm run db:reset` + `npm run db:test`           | `Files=12, Tests=1039`, `Result: PASS`                                                                          |
| `npx supabase db lint`                           | `"results":[]`                                                                                                  |
| `npm run test:integration`                       | 7 passed                                                                                                        |
| `npm audit`                                      | 1 alta: `zod` < 4.6.6 (pendência abaixo)                                                                        |
| Busca em `dist/`                                 | service role (valor), `SUPABASE_SERVICE_ROLE_KEY`, `service_role`, `server/`: 0                                 |
| `npm run db:reset` + `npm run db:test` (limpeza) | `Result: PASS`                                                                                                  |

Resultado da sprint:

- Contas por e-mail e senha (`/entrar`, `/cadastro`), sessão no `AuthProvider`, perfil criado por trigger.
- Convites: tabela `invitations` com RLS, token de 32 bytes só no link (fragmento) e sha-256 no banco,
  validade de 7 dias, um pendente por e-mail e empresa, criação pela API Hono com service role só no
  servidor, listagem e revogação sob RLS, aceite atômico em `public.accept_invitation` (RN-026, RN-038).
- Guards de sessão, empresa ativa (RN-025) e permissão; revogação de papel sem novo login (RN-024); só
  owner convida para owner (RN-022), garantido no banco.
- Testes: 1039 asserções pgTAP, 261 testes Vitest e 7 de integração; provas de detecção nos passos 4, 5 e 7.

Pendências para a aprovação e as próximas sprints:

- **RN-038 "a confirmar":** o aceite já exige o e-mail da conta igual ao do convite e confirmado.
  Confirmar a regra ou pedir mudança.
- `npm audit`: `zod` < 4.6.6 (GHSA-mrhx-c7xc-m3w5); o 4.6.6 entra na janela da ADR-001 em 2026-10-25.
  Atualizar só com autorização. Mitigação: schemas da API sem coleções e corpo limitado a 16 KiB.
- Bundle de 678 kB (aviso de 500 kB): divisão de código por rota na Sprint 1.4.
- `vercel.json` com rewrite do SPA no primeiro deploy.
- Convidar quem já é membro só falha no aceite.
- Integração e prova de detecção no CI dependem de autorização para mudar o workflow.
- Supabase CLI 2.122.0 disponível (ADR-001) e PRs do Dependabot em aberto.

## Aprovação (2026-10-23)

Decisões do usuário sobre as pendências e correções feitas antes do encerramento:

| Pendência                   | Decisão do usuário          | Feito                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RN-038                      | Confirmada como está        | [REGRAS-DE-NEGOCIO.md](../REGRAS-DE-NEGOCIO.md): status confirmada (e-mail igual e confirmado).                                                                                                                                                                                                                                                                                   |
| `zod` < 4.6.6 (`npm audit`) | Pode atualizar              | `zod` 4.6.5 → **4.6.6** (2026-10-11), a menor versão com a correção. **Exceção à ADR-001** autorizada pelo usuário por ser correção de segurança: a versão entraria na janela de 14 dias só em 2026-10-25. `npm audit`: 0 vulnerabilidades.                                                                                                                                       |
| Bundle de 678 kB            | Tratar na Sprint 1.4        | Mantido como pendência da 1.4.                                                                                                                                                                                                                                                                                                                                                    |
| `vercel.json` (rewrite SPA) | Fica para o primeiro deploy | Mantido como pendência.                                                                                                                                                                                                                                                                                                                                                           |
| Convite para quem é membro  | Verificar já na criação     | RN-039. Migration `20261024120000_invitations_existing_member.sql`: trigger `invitations_check_not_member` (depois do de quem convida, para não revelar membros a quem não gerencia); API responde 409 `already_member`; mensagem na tela. pgTAP `invitations_existing_member.test.sql` (8); teste antigo de aceite por membro ajustado (a pessoa vira membro depois do convite). |
| Integração no CI            | Fazer                       | Job `integration` em `.github/workflows/ci.yml`: Supabase com Auth, PostgREST e Kong, `db reset` com seed, variáveis do servidor tiradas de `supabase status` (service role mascarada) e `npm run test:integration`.                                                                                                                                                              |
| Supabase CLI                | Atualizar                   | 2.119.0 → **2.120.0** (2026-10-06), a mais nova dentro da ADR-001. A 2.121.0 entra na janela em 2026-10-28 e a 2.122.0 em 2026-11-06.                                                                                                                                                                                                                                             |

Testes novos: 3 Vitest (`already_member` na API, no adaptador do servidor e na mensagem da tela) e 1 de
integração (409 `already_member`; recepção recebe 403 antes). Prova de detecção: sem o trigger
`invitations_check_not_member` (removido direto no banco local), o pgTAP falhou em 3/8 e a integração em 1;
o `db:reset` restaurou.

Verificação: `npm run check` (264 testes + 8 de integração ignorados), `db:reset` + `db:test`
(`Files=13, Tests=1047`, `Result: PASS`), `npm run test:integration` (8 passed), `npm audit` sem
vulnerabilidades. O job `integration` roda pela primeira vez no PR #20.

Com as decisões aplicadas, o usuário considera a **Sprint 1.3 concluída e aprovada**. O merge do PR #20
na `main` fica com o usuário.

Pendências que seguem: bundle (Sprint 1.4), `vercel.json` (primeiro deploy), prova de detecção no CI do
job `database` (só local), Supabase CLI 2.121.0+ quando entrar na janela e PRs do Dependabot.
