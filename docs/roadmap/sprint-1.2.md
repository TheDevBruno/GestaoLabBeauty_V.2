# Sprint 1.2 — Schema base, RLS e pgTAP

- **Início:** 2026-10-19
- **Status:** em andamento (passo 1 de 10 concluído)
- **Branch:** `feat/sprint-1.2-banco`

## Objetivo

Fechar o risco R1 (vazamento entre tenants) na fundação: Supabase local, schema base de tenancy, RLS com
funções auxiliares em `private`, testes pgTAP (incluindo negativos entre tenants e a regra do
`specialist`) e job de banco no CI ([ADR-003](../decisions/ADR-003-multi-tenancy-rls.md)). O fim da
sprint é ponto de aprovação obrigatória.

## Decisões do usuário (2026-10-19)

- A branch sai da `main` depois da integração do encerramento da Sprint 1.1 (PR #8).
- Regra do `specialist`: criar versões **mínimas** de `professionals`, `clients` e `appointments`
  (chaves, `tenant_id`, FKs compostas e `professional_id`). A Sprint 2 completa as colunas com
  migrations novas.
- Alterar `.github/workflows/ci.yml` para o job de banco: autorizado (passo 8).
- Push só da branch, ao fim de cada passo. PR e merge ficam com o usuário.

## Forma de trabalho

Um passo por sessão. Cada passo termina com `npm run check` verde, `npm run db:test` verde (a partir do
passo 2), commit, `docs/STATE.md` atualizado e push da branch. Nenhuma migration é aplicada em
homologação ou produção ([ADR-005](../decisions/ADR-005-ambientes.md)).

## Passos

| #   | Passo                                    | Status    |
| --- | ---------------------------------------- | --------- |
| 1   | Supabase local (CLI e projeto)           | concluído |
| 2   | Schema `private` e primeiro teste pgTAP  | pendente  |
| 3   | Tabelas de tenancy                       | pendente  |
| 4   | Funções auxiliares em `private`          | pendente  |
| 5a  | Políticas de `tenants` e `profiles`      | pendente  |
| 5b  | Políticas de `memberships` e regra owner | pendente  |
| 6   | FKs compostas e regra do `specialist`    | pendente  |
| 7   | Seed sintético                           | pendente  |
| 8   | Job de banco no CI                       | pendente  |
| 9   | Encerramento da sprint                   | pendente  |

Detalhes por passo:

- **2:** migration com schema `private` e revogação de privilégios padrão;
  `supabase/tests/000-setup-tests.sql` com os helpers de teste (sem rollback, nunca em migration);
  teste "tabelas de `public` sem RLS = 0".
- **3:** `tenants` (slug com `CHECK` alinhado à RN-017), `profiles`, `memberships`, `platform_admins`,
  `roles_permissions`; `UNIQUE (tenant_id, id)`; trigger que impede trocar `tenant_id`; RLS ligada sem
  políticas.
- **4:** `private.is_member`, `private.has_permission`, `private.is_platform_admin` com
  `security definer`, `set search_path = ''`, `revoke execute` de `public` e `anon`; `private` fora de
  `[api] schemas`.
- **5a/5b:** uma política por operação; testes gerados a partir de uma tabela de casos (2 tenants × 6
  papéis × 4 operações); trigger `private.ensure_tenant_has_owner`, liberado quando o próprio tenant é
  apagado.
- **6:** tabelas mínimas com FKs compostas; `private.specialist_can_see_client` com teste positivo e
  negativo.
- **7:** `supabase/seed.sql` com dados sintéticos; os testes não dependem dele.
- **8:** job `database` no CI com `supabase start` excluindo serviços desnecessários, `supabase test db`
  e `supabase db lint`.

## Registro

### Passo 1 — Supabase local (2026-10-19)

Entregue:

- `supabase@2.119.0` como devDependency exata. É a última versão estável publicada há pelo menos 14
  dias ([ADR-001](../decisions/ADR-001-stack-e-versoes.md)): saiu em 2026-09-30; a 2.120.0 saiu em
  2026-10-06, dentro da janela.
- `supabase init`: `supabase/config.toml` e `supabase/.gitignore`. Único ajuste: `project_id` passou
  de `GestaoLabBeauty_V.2` (nome da pasta) para `labbeautypro`, que nomeia os containers Docker.
- Scripts `db:start`, `db:stop`, `db:reset` e `db:test` no `package.json`.

Verificações (Windows 11, Node 24.20, npm 11.19, Docker 29.8):

| Verificação                     | Resultado                                                          |
| ------------------------------- | ------------------------------------------------------------------ |
| `npm audit` após a instalação   | 0 vulnerabilidades                                                 |
| `npx supabase --version`        | 2.119.0                                                            |
| `npm run db:start`              | stack local no ar (primeira execução: 9 min, download das imagens) |
| `select version()` no container | PostgreSQL 17.11                                                   |
| Extensões disponíveis           | `pgtap` e `btree_gist` presentes em `pg_available_extensions`      |
| `npm run check`                 | exit 0                                                             |

Observações:

- `supabase start` avisa `no files matched pattern: supabase/seed.sql`. O seed entra no passo 7.
- As chaves impressas por `supabase start` são as padrão do ambiente local, públicas e iguais em todas
  as máquinas. Não valem fora do Docker local e não vão para `.env`.
