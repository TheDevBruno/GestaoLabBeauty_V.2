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
| 3   | Base do frontend (`src/lib`, `src/shared`) | pendente  |
| 4   | Auth e rotas                               | pendente  |
| 5   | Guards (sessão, empresa ativa, permissão)  | pendente  |
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
