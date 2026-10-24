# Sprint 1.3 — Auth, convites e guards

- **Início:** 2026-10-23
- **Status:** em andamento
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
| 6   | API de convites (`server/`, Hono)          | pendente  |
| 7   | Testes                                     | pendente  |
| 8   | Encerramento da sprint                     | pendente  |

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
