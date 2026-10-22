# Sprint 1.2 — Schema base, RLS e pgTAP

- **Início:** 2026-10-19
- **Status:** concluída em 2026-10-22 (10 de 10 passos), aguardando aprovação do usuário
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
| 2   | Schema `private` e primeiro teste pgTAP  | concluído |
| 3   | Tabelas de tenancy                       | concluído |
| 4   | Funções auxiliares em `private`          | concluído |
| 5a  | Políticas de `tenants` e `profiles`      | concluído |
| 5b  | Políticas de `memberships` e regra owner | concluído |
| 6   | FKs compostas e regra do `specialist`    | concluído |
| 7   | Seed sintético                           | concluído |
| 8   | Job de banco no CI                       | concluído |
| 9   | Encerramento da sprint                   | concluído |

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

### Passo 2 — Schema `private` e primeiro teste pgTAP (2026-10-20)

Entregue:

- Migration `supabase/migrations/20261020025820_private_schema_and_default_privileges.sql`: cria o
  schema `private` (sem acesso para `PUBLIC`) e revoga os privilégios padrão do Supabase em `public`
  para `anon` e `authenticated`, além do `EXECUTE` padrão de `PUBLIC` em funções. Decisão registrada na
  [ADR-008](../decisions/ADR-008-privilegios-explicitos.md).
- `supabase/tests/000-setup-tests.sql`: extensão `pgtap` e schema `tests` com `tests.create_user`,
  `tests.authenticate_as`, `tests.authenticate_as_anon` e `tests.clear_authentication`. Sem rollback,
  idempotente e fora de migrations.
- Testes: `helpers.test.sql` (6), `default_privileges.test.sql` (12) e `rls_coverage.test.sql` (1).

Verificações:

| Verificação                                                 | Resultado                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| `npm run db:reset`                                          | migration aplicada do zero                                |
| `npm run db:test`                                           | `Files=4, Tests=20`, `Result: PASS`                       |
| `npm run db:test` duas vezes seguidas após o reset          | PASS nas duas (setup idempotente)                         |
| Prova de detecção: tabela sem RLS + `GRANT` padrão a `anon` | FAIL esperado: `have: {sem_rls}` e teste 4 de privilégios |
| `npx supabase db lint`                                      | `No schema errors found`                                  |
| `npm run check`                                             | exit 0                                                    |

Observações:

- O `supabase test db` roda todos os arquivos `.sql` de `supabase/tests/` em ordem alfabética, inclusive
  os sem sufixo `.test`. O CLI já cria a extensão `pgtap`; o `create extension if not exists` fica no
  setup para o arquivo também funcionar sozinho.
- A prova de detecção alterou o banco local; ele foi recriado com `npm run db:reset` antes das
  verificações finais.

### Antes do passo 3 — confirmação da ADR-008 (2026-10-20)

Pedido do usuário: confirmar que `service_role` mantém os privilégios em `public` e que o
`ALTER DEFAULT PRIVILEGES` usa `FOR ROLE postgres`.

- `pg_default_acl` no banco local: regras do `postgres` em `public` citam só `postgres` e
  `service_role` (`arwdDxtm` em tabelas, `rwU` em sequências, `X` em funções). As quatro instruções da
  migration já tinham `FOR ROLE postgres`.
- `default_privileges.test.sql` passou de 12 para 18 asserções: `service_role` com escrita em tabela,
  sequência e `EXECUTE` em função de `public`; `anon`/`authenticated` sem acesso a sequência; conteúdo
  do `pg_default_acl` da role `postgres` (em `public` e global).
- ADR-008 complementada nos itens 1 e 5, com autorização do usuário; a decisão não mudou.

### Passo 3 — Tabelas de tenancy (2026-10-20)

Entregue — migration `supabase/migrations/20261020031300_tenancy_tables.sql`:

- Enum `member_role` (`owner`, `admin`, `manager`, `specialist`, `receptionist`, `financial`), com
  `USAGE` revogado de `PUBLIC` e concedido a `authenticated` e `service_role`.
- `tenants` (`id`, `name`, `slug`, `created_at`): slug único e `CHECK` de formato, tamanho e reservados
  igual à RN-017; nome não vazio. Status, segmento e fuso entram com as funcionalidades que os usam.
- `profiles` (um por usuário de `auth.users`), `memberships` (`UNIQUE (user_id, tenant_id)` e
  `UNIQUE (tenant_id, id)`), `platform_admins` e `roles_permissions` (global, chave `(role, permission)`;
  a matriz é carregada no passo 4).
- `private.prevent_tenant_id_change()` e trigger em `memberships`.
- RLS ligada nas 5 tabelas, sem políticas.
- `GRANT` só para `authenticated` e só nas operações que as políticas vão liberar:

  | Tabela              | `authenticated`                       |
  | ------------------- | ------------------------------------- |
  | `tenants`           | `SELECT`; `UPDATE (name)`             |
  | `profiles`          | `SELECT`; `UPDATE (full_name)`        |
  | `memberships`       | `SELECT`, `DELETE`; `UPDATE (role)`   |
  | `platform_admins`   | nenhum (servidor e função do passo 4) |
  | `roles_permissions` | `SELECT`                              |

  `INSERT` em `tenants`, `profiles` e `memberships` fica com funções do servidor (onboarding e
  convites). `anon` não recebe nada.

Verificações:

| Verificação                                           | Resultado                                   |
| ----------------------------------------------------- | ------------------------------------------- |
| `npm run db:reset`                                    | 2 migrations aplicadas do zero              |
| `npm run db:test`                                     | `Files=5, Tests=75`, `Result: PASS`         |
| `npm run db:test` duas vezes seguidas                 | PASS nas duas                               |
| Prova de detecção: `GRANT INSERT` a `anon` + política | FAIL esperado nos testes 10, 11 e 47; reset |
| `npx supabase db lint`                                | `No schema errors found`                    |
| `npm run check`                                       | exit 0                                      |

Observações:

- A lista de slugs reservados existe em `src/shared/slug.ts` e no `CHECK` de `tenants`. Rota nova na
  raiz exige mudar as duas (comentário no código e RN-017).
- `memberships.user_id` referencia `auth.users`; `profiles.id` é o mesmo id, então o join é direto.

### Passo 4 — Funções auxiliares em `private` (2026-10-20)

Entregue — migration `supabase/migrations/20261020120000_private_auth_helpers.sql`:

- `private.is_member(tenant_id)`, `private.has_permission(tenant_id, permission)` e
  `private.is_platform_admin()`: `language sql`, `STABLE`, `security definer`, `set search_path = ''`,
  consultando `memberships`/`platform_admins` a partir de `(select auth.uid())`. O papel nunca vem do JWT,
  então troca ou remoção de membership vale na hora.
- `GRANT USAGE` no schema `private` e `GRANT EXECUTE` nas três funções só para `authenticated`;
  `REVOKE EXECUTE` explícito de `PUBLIC` e `anon`. `private` continua fora de `[api] schemas`
  (`config.toml` não mudou).
- Matriz do plano §8 carregada em `roles_permissions` (57 linhas). Linhas com duas permissões viraram duas
  (`tenant.settings`/`tenant.branding`, `clients.read`/`clients.write`, `finance.read`/`finance.write`);
  "ler" virou só a permissão `.read`; "próprio" do `specialist` entra como permissão comum e o recorte por
  registro fica nas políticas do passo 6 (`private.specialist_can_see_client`, ADR-003 §9).
- `private.is_platform_admin()` não dá acesso a dados de tenant: admin da plataforma sem membership não é
  membro nem tem permissão (ADR-003 §6).

Testes — `private_helpers.test.sql` (40): estrutura (definer, `STABLE`, `search_path`), privilégios,
matriz completa escrita por linha da tabela do plano (a migration agrupa por papel), owner × specialist em
dois tenants, admin da plataforma, usuário sem vínculo, argumentos nulos, revogação imediata e `anon` com
`permission denied`. `default_privileges.test.sql`: a asserção do `USAGE` de `authenticated` em `private`
passou a esperar acesso.

Verificações:

| Verificação                                                     | Resultado                                   |
| --------------------------------------------------------------- | ------------------------------------------- |
| `npm run db:reset`                                              | 3 migrations aplicadas do zero              |
| `npm run db:test`                                               | `Files=6, Tests=115`, `Result: PASS`        |
| `npm run db:test` duas vezes seguidas                           | PASS nas duas                               |
| Prova de detecção: matriz alterada + `USAGE`/`EXECUTE` a `anon` | FAIL esperado nos testes 2, 12, 16, 20 e 39 |
| `npx supabase db lint`                                          | `No schema errors found`                    |
| `npm run check`                                                 | exit 0                                      |

Observações:

- No primeiro `db:reset` da sessão o container do banco reiniciou logo depois e voltou sem as migrations
  (`DbConnectError` no `db:test`). Esperar o container ficar `healthy` e repetir o reset resolveu.
- O CLI avisa que existe a 2.121.0; a atualização segue a janela de 14 dias da ADR-001.
- A migration e os testes deste passo ficaram fora do commit `e89b912`, que levou só a documentação.
  Entraram no commit seguinte, `a4a5099`.

### Passo 5a — Políticas de `tenants` e `profiles` (2026-10-20)

Entregue — migration `supabase/migrations/20261021020000_rls_tenants_profiles.sql`:

| Tabela     | Política                  | Operação | Regra                                                                              |
| ---------- | ------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `tenants`  | `tenants_select_member`   | SELECT   | `(select private.is_member(id))`                                                   |
| `tenants`  | `tenants_update_settings` | UPDATE   | `(select private.has_permission(id, 'tenant.settings'))` em `USING` e `WITH CHECK` |
| `profiles` | `profiles_select_own`     | SELECT   | `id = (select auth.uid())`                                                         |
| `profiles` | `profiles_update_own`     | UPDATE   | `id = (select auth.uid())` em `USING` e `WITH CHECK`                               |

- Todas `PERMISSIVE` e só `to authenticated`. INSERT e DELETE não têm `GRANT` nessas tabelas (passo 3),
  então não têm política: a tentativa termina em `permission denied`.
- Nenhuma política usa `private.is_platform_admin()` (ADR-003 §6).
- `profiles`: decisão padrão desta sessão, cada usuário vê só o próprio perfil. Ver o perfil de colegas
  da mesma empresa fica para quando a tela de equipe existir, com função própria em `private`.

Testes — `rls_tenants_profiles.test.sql` (251): tabela de casos com operação, alvo, papéis que conseguem
e resultado esperado, executada para os 12 usuários (6 papéis × 2 empresas). Alvos: a própria empresa e a
outra; o próprio perfil, o de um colega e o de alguém da outra empresa. Somam-se estrutura das políticas,
listagem sem filtro, usuário sem vínculo, admin da plataforma sem membership, revogação imediata
(RN-024), renomeação gravada pelo owner e `anon` com `permission denied`. `tenancy_tables.test.sql`: a
asserção "nenhuma política" passou a cobrir só as três tabelas do passo 5b, e a leitura sem política
passou a usar `roles_permissions`.

Verificações:

| Verificação                                                 | Resultado                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `npm run db:reset`                                          | 4 migrations aplicadas do zero                                    |
| `npm run db:test`                                           | `Files=7, Tests=366`, `Result: PASS`                              |
| `npm run db:test` duas vezes seguidas                       | PASS nas duas                                                     |
| Prova de detecção: `SELECT using (true)` + `DROP` do UPDATE | FAIL esperado nos testes 1, 50-61, 230-242, 244, 246 e 249; reset |
| `npx supabase db lint`                                      | sem erros (`"results":[]`)                                        |
| `npm run check`                                             | exit 0                                                            |

### Passo 5b — Políticas de `memberships`, `roles_permissions` e regra do owner (2026-10-21)

Entregue — migration `supabase/migrations/20261021030000_rls_memberships.sql`:

| Tabela              | Política                       | Operação | Regra                                                                                           |
| ------------------- | ------------------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `memberships`       | `memberships_select_member`    | SELECT   | `user_id = auth.uid()` ou `members.manage` na empresa (RN-034)                                  |
| `memberships`       | `memberships_update_role`      | UPDATE   | `members.manage`, `user_id <> auth.uid()` (RN-021) e linha/valor `owner` só para owner (RN-022) |
| `memberships`       | `memberships_delete_manage`    | DELETE   | `members.manage` e membership `owner` só para owner                                             |
| `roles_permissions` | `roles_permissions_select_all` | SELECT   | `using (true)`: matriz global, igual para todas as empresas                                     |

- `private.is_owner(tenant_id)`: `security definer`, `STABLE`, `search_path` vazio; `EXECUTE` só para
  `authenticated`. Helper novo além dos três da ADR-003 §3, usado só pelas políticas deste passo.
- RN-023: trigger `private.ensure_tenant_has_owner` (`AFTER UPDATE OF role OR DELETE`, por linha). Roda
  ao fim do comando, então a troca de owner dentro de um mesmo comando vale pelo estado final. Quando a
  própria empresa é apagada, o cascade passa sem erro.
- `platform_admins` segue sem GRANT e sem política (ADR-003 §6).
- INSERT segue sem GRANT: criação de membership fica com o servidor (convites).

Testes:

- `rls_memberships.test.sql` (171 na primeira versão): tabela de casos com 2 empresas × 6 papéis; alvos na própria e na
  outra empresa, com papel do executor, `owner` e `receptionist`; mais estrutura das políticas, leitura
  da matriz por todos os usuários, usuário sem vínculo, promoção a owner em savepoint, remoção, último
  owner (com `postgres` e com `authenticated`) e cascade ao apagar a empresa.
- `tenancy_tables.test.sql`: a asserção "sem política" passou a cobrir só `platform_admins`; o teste de
  trigger troca `set role` por `set created_at` (o único owner da empresa não pode ser rebaixado).
- `private_helpers.test.sql`: ganha um segundo owner em A, porque o último owner não sai (RN-023).

Verificações:

| Verificação                                         | Resultado                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `npm run db:reset`                                  | 5 migrations aplicadas do zero                                      |
| `npm run db:test`                                   | `Files=8, Tests=536`, `Result: PASS`                                |
| Prova de detecção: `user_id <> auth.uid()` removido | FAIL esperado nos testes 110, 116, 122, 123, 128 e 129; reset, PASS |
| `npx supabase db lint`                              | `{"results":[]}`                                                    |
| `npm run check`                                     | exit 0 (50 testes Vitest, build)                                    |

Decisão do usuário (2026-10-21), registrada como RN-034 — `members.manage` governa:

- Equipe: sem `members.manage`, o membro vê só a própria membership. A primeira versão da política
  usava `private.is_member` (todo membro via a equipe) e foi trocada antes do merge.
- Sair da empresa: quem tem `members.manage` remove a própria membership; os demais não. O owner único
  continua sem sair (RN-023).
- `rls_memberships.test.sql` passou a 173 asserções; `npm run db:test`: `Files=8, Tests=538`, PASS.

### Passo 6 — FKs compostas e regra do `specialist` (2026-10-20)

Decisões do usuário nesta sessão (registradas como RN-035 a RN-037):

- `professionals`: todo membro lê; `services.manage` cria, altera e remove (RN-035).
- O specialist não cadastra cliente novo e só altera os clientes que vê; agenda só para o profissional
  ligado a ele e só clientes que já vê, sem passar o agendamento a outro profissional (RN-036).
- Sem `DELETE` em `clients` e `appointments` por enquanto (RN-037).

Entregue — migration `supabase/migrations/20261021040000_specialist_scope.sql`:

- Tabelas mínimas, todas com `tenant_id NOT NULL`, `UNIQUE (tenant_id, id)`, trigger
  `private.prevent_tenant_id_change` e cascade a partir de `tenants`:
  - `professionals` (`membership_id` opcional; `UNIQUE (tenant_id, membership_id)`; FK composta
    `(tenant_id, membership_id) → memberships (tenant_id, id)` com `on delete set null (membership_id)`);
  - `clients` (`full_name`, única coluna editável, sem a qual não haveria UPDATE a proteger);
  - `appointments` (FKs compostas para `clients` e `professionals`, com índice em cada uma). Ainda sem
    status: a regra do specialist não filtra por status, então "qualquer status" (RN-028) já vale.
- Funções em `private` (`security definer`, `STABLE`, `search_path` vazio, `EXECUTE` só para
  `authenticated`):
  - `private.is_specialist(tenant_id)`: o papel do usuário na empresa é `specialist`;
  - `private.is_own_professional(tenant_id, professional_id)`: o profissional está ligado à membership
    do usuário;
  - `private.specialist_can_see_client(tenant_id, client_id)`: o usuário é specialist e o cliente tem ao
    menos um agendamento com o profissional ligado a ele. Devolve `false` para os outros papéis.
- RLS ligada, `GRANT` só para `authenticated`, uma política por operação:

  | Tabela          | SELECT                                 | INSERT                                                   | UPDATE                   | DELETE            |
  | --------------- | -------------------------------------- | -------------------------------------------------------- | ------------------------ | ----------------- |
  | `professionals` | membro                                 | `services.manage`                                        | `services.manage`        | `services.manage` |
  | `clients`       | `clients.read`; specialist: com agend. | `clients.write`, não specialist                          | `clients.write`; recorte | sem GRANT         |
  | `appointments`  | `appointments.read`; specialist: dele  | `appointments.write`; specialist: dele e cliente visível | igual ao INSERT          | sem GRANT         |

  Colunas com `GRANT`: INSERT `professionals (tenant_id, membership_id)`, `clients (tenant_id,
full_name)`, `appointments (tenant_id, client_id, professional_id)`; UPDATE
  `professionals (membership_id)`, `clients (full_name)`, `appointments (client_id, professional_id)`.

Testes — `supabase/tests/rls_specialist.test.sql` (410): tabela de 29 casos × 12 usuários (348
asserções), com alvos em cada empresa: profissional do specialist, outro profissional e um sem
agendamentos; cliente com agendamento com o specialist, cliente só com outro profissional e cliente sem
agendamento. Somam-se estrutura (RLS, chaves, FKs, políticas, `GRANT` por coluna, funções), positivo e
negativos de `private.specialist_can_see_client`, listagem sem filtro, specialist sem profissional
ligado, troca de profissional ou de cliente pelo specialist, desligamento imediato (RN-024), remoção da
membership, FKs compostas recusando vínculo entre empresas (também para `authenticated`), `tenant_id`
imutável, `anon` sem leitura e cascade ao apagar a empresa. Cada caso roda e é desfeito, então nenhum
altera o estado dos seguintes. Nenhum teste antigo mudou; `rls_coverage` segue em zero.

Verificações:

| Verificação                                                                                                                    | Resultado                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Ponto de partida (`db:reset` + `db:test`)                                                                                      | `Files=8, Tests=538`, `Result: PASS`                                             |
| `npm run db:reset`                                                                                                             | 6 migrations aplicadas do zero                                                   |
| `npm run db:test`                                                                                                              | `Files=9, Tests=948`, `Result: PASS`                                             |
| `npm run db:test` duas vezes seguidas                                                                                          | PASS nas duas                                                                    |
| Prova de detecção: recorte tirado de `clients_select_read` e `specialist_can_see_client` tirado de `appointments_insert_write` | FAIL esperado nos testes 68, 74, 224, 230, 236, 242, 383, 388 e 395; reset, PASS |
| `npx supabase db lint`                                                                                                         | `No schema errors found` (`"results":[]`)                                        |
| `npm run check`                                                                                                                | exit 0                                                                           |

Observações:

- A função lê o estado do início do comando: o agendamento sendo gravado não libera o próprio cliente.
  Por isso o specialist não ganha acesso a cliente novo agendando-o (RN-036).
- Papéis com recorte são só `specialist`. Owner, admin, manager, receptionist e financial seguem a
  matriz sem filtro por registro, mesmo que estejam ligados a um profissional.

### Passo 7 — Seed sintético (2026-10-22)

Entregue:

- `supabase/seed.sql`, aplicado pelo `supabase db reset` (`[db.seed]` já ativo em `config.toml`; nenhuma
  mudança de configuração). Ids começam em `5eed0000-…` para não colidir com os dos testes.
- Duas empresas: `studio-ana` e `clinica-bela` (slugs válidos pela RN-017).
- Em cada empresa, um usuário por papel (6): `auth.users` com login local, `auth.identities` (provider
  `email`), `profiles` e `memberships`. E-mails `<nome>.<papel>@example.test`, nomes fictícios.
- Em cada empresa: 2 profissionais (um ligado ao `specialist`, um sem ligação), 3 clientes (um com
  agendamento com o `specialist`, um só com o outro profissional, um sem agendamento) e 2 agendamentos.
  Total: 12 usuários, 12 identidades, 4 profissionais, 6 clientes, 4 agendamentos.
- Senha de teste, só local: `senha-teste-labbeautypro`. Fica documentada aqui e no `seed.sql`; não vai
  para `.env` nem para homologação ou produção (ADR-005). Login verificado: senha certa responde 200 pelo
  Auth local, senha errada responde 400.
- `supabase/tests/seed_rls.test.sql` (3 asserções): `rls_coverage` em zero; cada usuário do seed vê só a
  própria empresa, nenhuma linha de outra empresa e só o próprio perfil; o seed está completo (12) ou
  ausente, nunca pela metade. Sem seed, a lista de usuários existentes fica vazia e o teste passa sem
  comparar nada.
- Nenhuma regra de negócio nova; nenhuma ADR (o seed não é decisão arquitetural).

Verificações:

| Verificação                                                                  | Resultado                                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Pré-condição: PR #15 mesclado na `main` (2026-10-21)                         | confirmado; branch atualizada por fast-forward                 |
| Baseline antes do seed (`db:reset` + `db:test`)                              | `Files=9, Tests=948`, `Result: PASS`                           |
| `npm run db:reset` com seed                                                  | seed aplicado; `Finished supabase db reset`                    |
| `npm run db:test` com seed                                                   | `Files=10, Tests=951`, `Result: PASS`                          |
| `npx supabase db reset --no-seed` + `npm run db:test` (sem seed)             | `Files=10, Tests=951`, `Result: PASS`                          |
| Prova de detecção: política `using (true)` em `tenants` + `db:test` com seed | `seed_rls` falha no teste 2 (`seed: cada usuário ... `); reset |
| Login local (`/auth/v1/token`): senha certa e errada                         | 200 e 400                                                      |
| `npx supabase db lint`                                                       | `No schema errors found` (`"results":[]`)                      |
| `npm run check`                                                              | exit 0 (50 testes Vitest, build)                               |

Observações:

- O GoTrue local falha (500, "converting NULL to string") se as colunas de token de `auth.users` forem
  `NULL`. O seed grava `''` nelas.
- `auth.identities.email` é coluna gerada nesta versão: o seed não a informa.
- Após cada `db reset` o container do banco reinicia e o `db:test` pode dar `DbConnectError` por alguns
  segundos. Repetir depois de o container ficar `healthy` resolveu (mesmo caso do passo 4).
- O CLI avisa que existe a 2.121.0; a atualização segue a janela de 14 dias da ADR-001.
- `.claude/settings.json` tinha uma alteração local do usuário (`remoteControlEnabled`) antes do passo;
  ficou fora do commit deste passo.

### Passo 8 — Job de banco no CI (2026-10-22)

Entregue — `.github/workflows/ci.yml`, job `database` ao lado de `quality`:

- Mesmos triggers (`push` em `main`, `pull_request`), `permissions: contents: read`, sem secrets,
  sem `pull_request_target`, sem Actions novas (`actions/checkout@v7`, `actions/setup-node@v7`).
- `npm ci` (CLI `supabase@2.119.0` já exato no `package.json`).
- `npx supabase start -x gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`:
  só o Postgres sobe. pgTAP e `db lint` não usam os demais serviços. Lista conferida com
  `npx supabase start --help`.
- `npx supabase db reset` (migrations e seed), `npm run db:test`, `npx supabase db lint`,
  `npx supabase stop --no-backup` com `if: always()`.
- Timeout 20 min.

Verificações:

| Verificação                                         | Resultado                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sequência do job, local, só com `postgres`          | `Files=10, Tests=951`, `Result: PASS`                                                                                                                         |
| `npx supabase db lint` (local, só `postgres`)       | `No schema errors found`                                                                                                                                      |
| CI do PR #17, job `Banco: pgTAP e lint`             | pass, 3m41s (run 39832238856)                                                                                                                                 |
| CI do PR #17, job `Typecheck, lint, testes e build` | pass, 23s                                                                                                                                                     |
| `npm run check` local                               | typecheck, lint, test (50), build: exit 0. `format:check` falha só em `.claude/settings.local.json`, arquivo local ignorado pelo git e ausente no clone da CI |

Observações:

- O `name` do job com `: ` precisa de aspas no YAML (`name: 'Banco: pgTAP e lint'`); sem elas o YAML falha.
- Os demais serviços continuam no `config.toml`; só não sobem no CI.
- Prova de detecção no CI (política `using (true)` em `tenants` deve falhar o job) ainda não feita; o
  `seed_rls` já foi provado localmente no passo 7.

### Passo 9 — Encerramento da sprint (2026-10-22)

Conferência dos passos: os 10 passos da tabela (1, 2, 3, 4, 5a, 5b, 6, 7, 8 e 9) estão concluídos e
registrados acima. Nenhuma migration, teste ou configuração mudou neste passo; só documentação.

Entregue pela sprint:

- 6 migrations em `supabase/migrations/`: schema `private` e privilégios padrão (ADR-008), tabelas de
  tenancy, funções auxiliares, políticas de `tenants`/`profiles`, de `memberships`/`roles_permissions` e
  recorte do `specialist`.
- 8 tabelas em `public`, todas com RLS e `GRANT` mínimos só para `authenticated`; `anon` sem acesso.
- 10 arquivos pgTAP (951 asserções) cobrindo os testes obrigatórios da
  [ADR-003](../decisions/ADR-003-multi-tenancy-rls.md): 2 empresas × 6 papéis × operações, negativos
  entre empresas, FKs compostas, ninguém promove o próprio papel e `rls_coverage` em zero.
- Seed sintético e job `database` no CI.
- Nada foi aplicado em homologação ou produção ([ADR-005](../decisions/ADR-005-ambientes.md)).

Verificações finais (branch `feat/sprint-1.2-ci-banco` atualizada por fast-forward com a `main` em
`e6f709f`, merge do PR #17):

| Verificação                                                  | Resultado                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Pré-condição: PR #17 mesclado na `main`                      | confirmado (2026-10-22)                                                              |
| `npx supabase db reset`                                      | 6 migrations e seed aplicados do zero                                                |
| `npm run db:test`                                            | `Files=10, Tests=951`, `Result: PASS`                                                |
| `npx supabase db lint`                                       | `{"results":[]}`                                                                     |
| `npm run check`: typecheck, lint, test e build               | exit 0 (50 testes Vitest)                                                            |
| `npm run check`: `format:check`                              | falha só em `.claude/settings.local.json`, ignorado pelo git (mesmo caso do passo 8) |
| `prettier --check --ignore-unknown` nos arquivos versionados | `All matched files use Prettier code style!`                                         |
| CI da `main` após o merge do PR #17                          | success (run 39833578720)                                                            |

Pendências que seguem para depois da sprint (em [STATE.md](../STATE.md)): prova de detecção no CI e
atualização do Supabase CLI conforme a ADR-001.

O fim da Sprint 1.2 é ponto de aprovação obrigatória: a Sprint 1.3 só começa com aprovação do usuário.
