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
| 2   | Banco: perfil automático e `invitations`   | pendente  |
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
