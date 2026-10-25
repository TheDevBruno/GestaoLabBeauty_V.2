# Sprint 2.1 — Serviços (com `buffer_minutes`) e profissionais

- **Início:** 2026-10-24
- **Status:** em andamento (plano aprovado pelo usuário em 2026-10-25)
- **Branch:** `feat/sprint-2.1-servicos-profissionais` (a partir da `main` em `ead9e69`, merge do PR #22)

## Objetivo

Primeira sprint da Fase 2. A empresa passa a cadastrar os **serviços** que oferece (duração, intervalo
`buffer_minutes`, preço) e os **profissionais** que atendem, com a lista de serviços que cada um faz.
Esses dados alimentam a disponibilidade (Sprint 2.3), a agenda (Sprint 2.4) e o portal (Sprint 3.2).
Não é ponto de aprovação obrigatória.

## Diagnóstico (2026-10-24)

- **`professionals`** existe desde a Sprint 1.2 só com `id`, `tenant_id`, `membership_id` e
  `created_at`; **não tem nome**. Políticas: membro lê, `services.manage` cria, altera e exclui
  (RN-035). `GRANT` de coluna: `insert (tenant_id, membership_id)`, `update (membership_id)`.
- **`appointments → professionals`** é FK sem `on delete`: excluir um profissional com agendamento já
  falha no banco.
- **`services`, `service_categories` e `professional_services`** não existem. Plano §7 lista as três.
- **`tenants`** não tem moeda nem fuso. Nesta sprint só a moeda importa (preço, RN-032).
- **`profiles`** só deixa ler o próprio perfil. Para ligar um profissional a um membro, quem tem
  `services.manage` precisa ver o nome dos membros; hoje nem o owner lê o perfil dos outros.
- **Testes pgTAP** que inserem em `professionals`: só `rls_specialist.test.sql` (4 inserções). O seed
  insere 4 profissionais.
- **Interface:** `src/modules/` ainda não existe (ARCHITECTURE.md: "Fase 2"). O shell tem "Painel" e
  "Equipe e convites". Os formulários usam `useState` + Zod (`safeParse`) + `fieldErrorsFrom` +
  `InputField`/`SelectField`, sem `react-hook-form`.

## Proposta de modelo de dados

Uma migration nova (`supabase/migrations/2026102xxxxxxx_services_professionals.sql`). Nenhuma ADR muda.

### `public.services` (nova)

| Coluna             | Tipo / regra                                                               |
| ------------------ | -------------------------------------------------------------------------- |
| `id`               | `uuid` PK, `gen_random_uuid()`                                             |
| `tenant_id`        | `uuid not null` → `tenants (id) on delete cascade`                         |
| `name`             | `text not null`, sem branco, até 80 caracteres                             |
| `description`      | `text` opcional, até 500 caracteres                                        |
| `duration_minutes` | `integer not null`, de 5 a 720, múltiplo de 5                              |
| `buffer_minutes`   | `integer` **opcional** (`null` = sem intervalo), de 0 a 240, múltiplo de 5 |
| `price_cents`      | `integer not null`, `>= 0` (centavos, RN-032)                              |
| `currency`         | `text not null default 'BRL'`, `^[A-Z]{3}$` (ver decisão 3)                |
| `is_active`        | `boolean not null default true`                                            |
| `created_at`       | `timestamptz not null default now()`                                       |

- `unique (tenant_id, id)`; nome único por empresa sem diferenciar maiúsculas
  (`unique index on (tenant_id, lower(btrim(name)))`, decisão 4).
- Trigger `private.prevent_tenant_id_change` (ADR-003 §4).
- RLS: **SELECT** para membro (`private.is_member`), porque recepção, specialist e financeiro vão ver
  o serviço na agenda; **INSERT/UPDATE/DELETE** com `services.manage` (plano §8).
- `GRANT` só de `select`, `delete` e das colunas editáveis em `insert`/`update` (ADR-008). Nada para
  `anon`; o portal lê por função própria na Sprint 3.2 (ADR-003 §7).
- `buffer_minutes` não entra em nenhum cálculo nesta sprint; a RN-003 (período inclui o buffer) é
  aplicada na Sprint 2.4. Aqui só fica gravado e validado.

### `public.professional_services` (nova)

Quais serviços cada profissional faz.

- Colunas: `tenant_id`, `professional_id`, `service_id`, `created_at`.
- PK `(tenant_id, professional_id, service_id)`; FKs compostas para `professionals (tenant_id, id)` e
  `services (tenant_id, id)` com `on delete cascade` (o vínculo some com o profissional ou o serviço).
  A FK composta impede ligar serviço de outra empresa (ADR-003 §2).
- RLS: SELECT para membro; INSERT e DELETE com `services.manage`; **sem UPDATE** (troca = apagar e
  inserir).
- Duração e preço por profissional ficam fora (decisão 5).

### `public.professionals` (alterada)

- `display_name text not null`, sem branco, até 80 caracteres — nome exibido na agenda e no portal.
  Não usa o nome do perfil, porque o profissional pode não ter conta (RN-035).
- `is_active boolean not null default true` — desativar tira o profissional da agenda nova sem apagar
  o histórico.
- `GRANT insert`/`update` passam a incluir `display_name` e `is_active`.
- Exclusão continua permitida com `services.manage`, mas o banco recusa quando há agendamento (FK já
  existente). A tela oferece "Desativar" como caminho normal.
- `display_name` entra como `not null` sem valor padrão: em homologação e produção ainda não há
  linhas; no local, `db reset` aplica a migration antes do seed. Os 4 `insert` do
  `rls_specialist.test.sql` e o seed passam a informar o nome (único ajuste em teste existente, por
  mudança de schema).

### Nomes dos membros para o vínculo (decisão 6)

Recomendado: função `public.list_professional_link_candidates(p_tenant_id uuid)` (`security definer`,
`STABLE`, `search_path` vazio, `EXECUTE` só para `authenticated`) que, **só para quem tem
`services.manage`**, devolve `membership_id`, nome do perfil e papel dos membros da empresa ainda sem
profissional. Não abre a tabela `profiles`; expõe só esses três campos e só nessa empresa. Testada em
pgTAP (manager vê, receptionist recebe vazio/erro, tenant B não aparece).

### Seed

- Nome nos 4 profissionais existentes.
- 3 serviços por empresa (um com `buffer_minutes`, um sem, um inativo), todos fictícios.
- Vínculos em `professional_services` (o profissional do specialist faz 2 dos 3).
- `seed_rls.test.sql` atualizado para contar os novos dados.

### Testes pgTAP (novos)

- `services.test.sql`: estrutura (colunas, `CHECK`s de duração, buffer, preço e moeda, nome único sem
  diferenciar maiúsculas), RLS × operação × papel nos dois tenants, `anon` sem acesso, tenant B
  invisível, `tenant_id` imutável, `GRANT` só nas colunas previstas.
- `professional_services.test.sql`: FK composta recusa serviço ou profissional de outra empresa, RLS ×
  papel, sem UPDATE, cascata ao excluir serviço.
- `professionals` (acréscimos): `display_name` obrigatório e não branco, `is_active`, `GRANT` das
  colunas novas, exclusão recusada com agendamento.
- Função de candidatos (se aprovada).
- `rls_coverage.test.sql` cobre as tabelas novas automaticamente.

## Proposta de interface

Direção visual da Sprint 1.4 (Soft UI, tokens semânticos, Inter, 44 px). Consultas à skill
`ui-ux-pro-max` (`--domain ux`): tabela vira cartões no celular, estado vazio com mensagem e ação,
retorno de carregamento e de sucesso ao salvar, rótulo visível e erro junto ao campo.

- Código em `src/modules/services/` e `src/modules/professionals/` (primeiro uso de `src/modules/`,
  ARCHITECTURE.md). Schemas Zod em `src/shared/service.ts` e `src/shared/professional.ts`.
- `src/shared/money.ts`: converte "120,00" ↔ `12000` centavos e formata em `pt-BR` com
  `Intl.NumberFormat`; testes de borda (vírgula, ponto de milhar, zero, negativo recusado, mais de
  duas casas recusado).
- **Rotas** (decisão 7): `/app/servicos`, `/app/servicos/novo`, `/app/servicos/:id`,
  `/app/profissionais`, `/app/profissionais/novo`, `/app/profissionais/:id`. Página própria para criar e
  editar (link direto, botão voltar previsível), carregada com `lazy`.
- **Navegação:** "Serviços" e "Profissionais" no shell, visíveis com `services.manage` (decisão 8).
  Rota protegida por `RequirePermission`.
- **Lista de serviços:** cartões empilhados abaixo de 1024 px e tabela a partir dele; nome, duração,
  intervalo ("sem intervalo" quando `null`), preço, status (texto, não só cor). Filtro "Mostrar
  inativos". Estado vazio com "Cadastrar o primeiro serviço".
- **Formulário de serviço:** nome, descrição, duração (select de 5 em 5 min, rótulo "1 h 30 min"),
  intervalo após o atendimento (select com "Sem intervalo" e 5 a 60 min, ajuda explicando que o
  horário fica reservado), preço em reais (`inputmode="decimal"`), ativo. Erro por campo, foco no
  primeiro inválido, botão com `busy`, aviso de sucesso com `role="status"`.
- **Lista de profissionais:** nome, membro ligado (ou "Sem acesso ao sistema"), quantidade de serviços,
  status.
- **Formulário de profissional:** nome exibido, membro ligado (select com os candidatos da decisão 6 e
  "Nenhum"), serviços que faz (lista de caixas de seleção em `fieldset` com `legend`, 44 px por item,
  só serviços ativos), ativo. Salvar grava o profissional e acerta os vínculos (inserir os novos,
  apagar os desmarcados).
- **Excluir:** só no formulário de edição, com confirmação em duas etapas como na revogação de
  convite; se o banco recusar (profissional com agendamento), a mensagem sugere desativar.
- Escrita direto no Supabase sob RLS (ADR-002: CRUD simples, sem API). Consultas e mutações com
  TanStack Query, chaves por `tenant_id`.
- Testes de tela (jsdom): permissões (receptionist não vê os itens e recebe "Acesso não permitido"),
  criar, editar, validação de preço e duração, estado vazio, desativar, vínculos de serviços.

## Dependências e configuração

- **Nenhuma dependência nova.** `react-hook-form` continua fora: os dois formulários seguem o padrão
  atual (`useState` + Zod), que já está testado (decisão 9).
- Nenhum arquivo de configuração muda. Se precisar, paro e peço.

## Passos

| #   | Passo                                                                                                     | Status    |
| --- | --------------------------------------------------------------------------------------------------------- | --------- |
| 1   | Plano (este documento) e OK do usuário                                                                    | concluído |
| 2   | Migration (`services`, `professional_services`, colunas de `professionals`, função de candidatos) e pgTAP | pendente  |
| 3   | Seed, schemas Zod e `money.ts`                                                                            | pendente  |
| 4   | Telas de serviços                                                                                         | pendente  |
| 5   | Telas de profissionais (vínculo com membro e serviços)                                                    | pendente  |
| 6   | Verificação (check, db:test, integração, navegador 375/1440 px, checklist) e encerramento                 | pendente  |

Cada passo termina com `npm run check` e `npm run db:test` verdes, commit, `docs/STATE.md`,
`CHANGELOG.md` e este registro atualizados, e push da branch. Migrations só no Supabase local.

## Regras de negócio (registradas em REGRAS-DE-NEGOCIO.md em 2026-10-25)

- **RN-040 — Serviço:** duração de 5 a 720 min em passos de 5; intervalo opcional de 0 a 240 min em
  passos de 5; preço em centavos, não negativo, com moeda; nome único na empresa sem diferenciar
  maiúsculas.
- **RN-041 — Serviços: membro lê, `services.manage` altera** (mesmo modelo da RN-035).
- **RN-042 — Profissional e serviço inativos:** continuam no histórico e nas telas de cadastro, mas não
  são oferecidos em agendamento novo (efeito aplicado nas Sprints 2.3, 2.4 e 3.2).
- **RN-043 — Profissional faz só serviços da própria empresa** (FK composta); sem vínculo, não é
  oferecido para aquele serviço (efeito nas Sprints 2.3 e 3.2).
- **RN-044 — Candidatos ao vínculo:** quem tem `services.manage` vê nome e
  papel dos membros sem profissional; ninguém mais.

## Decisões do usuário (2026-10-25)

Todas as recomendações aprovadas. Na decisão 3, o usuário confirmou que `services.currency` é quem
guarda a moeda (sem `tenants.currency`). As opções apresentadas ficam abaixo como registro.

1. **Escopo**: serviços, `professional_services` e colunas de `professionals`, como acima.
2. **`service_categories` fica para depois** (recomendado: só faz falta com muitos serviços ou no
   portal, Sprint 3.2). Alternativa: incluir agora, com `category_id` opcional em `services`.
3. **Moeda**: coluna `currency` em `services` com padrão `BRL` (recomendado, RN-032 pede "centavos com
   moeda"); a interface mostra só BRL. Alternativa: moeda na empresa (`tenants.currency`).
4. **Nome de serviço único por empresa**, sem diferenciar maiúsculas (recomendado). Alternativa: nomes
   repetidos permitidos.
5. **Duração e preço por profissional** ficam fora do MVP (recomendado). Alternativa: colunas opcionais
   em `professional_services`.
6. **Vínculo com membro**: função de candidatos para quem tem `services.manage` (recomendado; mostra ao
   manager nome e papel dos membros). Alternativa A: só quem tem `members.manage` liga profissional a
   membro, usando a lista da equipe. Alternativa B: vínculo fica para a Sprint 2.5 (onboarding).
7. **Página própria para criar/editar** (recomendado). Alternativa: formulário em gaveta (`Sheet`).
8. **Itens de menu só com `services.manage`** (recomendado; os demais papéis veem serviços e
   profissionais dentro da agenda). Alternativa: todos veem as listas em modo leitura.
9. **Sem `react-hook-form`** nesta sprint (recomendado).

## Fora do escopo

- Categorias de serviço (decisão 2), duração/preço por profissional, comissões
  (`commission_rules`, Fase 4).
- Unidades (`locations`), horários e disponibilidade (Sprint 2.3).
- Uso do `buffer_minutes` no período do agendamento (Sprint 2.4).
- Fotos de profissional e de serviço (exigem Storage e RN-019).
- Exibição no portal público (Sprint 3.2).

## Registro

### Passo 1 — Plano (2026-10-24)

- PR #22 confirmado na `main` (`ead9e69`, mesclado em 2026-10-25T01:02:40Z). Branch criada a partir
  dele. Supabase local em execução (Docker) e `.env.local` presente.
- Este documento. Plano aprovado pelo usuário em 2026-10-25 com todas as recomendações; RN-040 a
  RN-044 registradas.

### Passo 2 — Migration e pgTAP (2026-10-25)

Sem dependência nova nem mudança de configuração. Tudo só no Supabase local.

Entregue em `supabase/migrations/20261025120000_services_professionals.sql`:

- `public.services` com os `CHECK`s da RN-040 (duração de 5 a 720 em passos de 5, `buffer_minutes`
  nulo ou de 0 a 240 em passos de 5, preço não negativo, moeda `^[A-Z]{3}$` com padrão `BRL`, nome não
  branco até 80, descrição até 500) e índice único `(tenant_id, lower(btrim(name)))`.
- `public.professional_services` com PK `(tenant_id, professional_id, service_id)`, FKs compostas com
  `on delete cascade` e índice da FK de serviço.
- `professionals.display_name` (obrigatório, não branco, até 80) e `professionals.is_active`.
- RLS: SELECT para membro e escrita com `services.manage` nas duas tabelas novas;
  `professional_services` sem UPDATE. `GRANT` de tabela só `select`/`delete` e de coluna nos campos
  editáveis; nada para `anon`. Trigger de `tenant_id` imutável nas duas.
- `public.list_professional_link_candidates(p_tenant_id)`: `security definer`, `STABLE`, `search_path`
  vazio, `EXECUTE` só para `authenticated`. Devolve `membership_id`, `full_name`, `role` e
  `professional_id` (profissional já ligado, ou nulo) de todos os membros da empresa, e zero linhas
  para quem não tem `services.manage`. **Ajuste em relação ao plano:** o plano falava em devolver só
  os membros sem profissional; a função devolve todos com o profissional ligado, para a tela de edição
  mostrar o vínculo atual e a lista mostrar quem está ligado a quem. A RN-044 foi ajustada e aguarda
  confirmação do usuário.

Ajustes em arquivos existentes, por mudança de schema:

- `supabase/seed.sql`: nome nos 4 profissionais (serviços e vínculos do seed ficam no passo 3).
- `supabase/tests/rls_specialist.test.sql`: os `insert` em `professionals` passam a informar
  `display_name`, e a lista de colunas com `INSERT`/`UPDATE` de `authenticated` inclui `display_name` e
  `is_active`. Nenhum resultado esperado mudou.

Testes novos em `supabase/tests/services_professionals.test.sql` (293 asserções): 228 casos gerados
(2 empresas × 6 papéis × operação × alvo, incluindo a função de candidatos) e 65 fixos (estrutura,
políticas, `GRANT`, função, conteúdo dos candidatos, `CHECK`s e limites, nome único sem diferenciar
maiúsculas, profissional com agendamento não excluído, FKs compostas entre empresas, cascata,
`tenant_id` imutável, specialist sem alterar o próprio profissional, exclusão da empresa).

Prova de detecção: `services_select_member` trocada para `using (true)` direto no banco local fez
falhar 14 testes (12 casos "outra empresa" e 2 listagens). Política restaurada com `db:reset`.

Verificação: `npm run db:test` 1340 PASS (14 arquivos), `supabase db lint` sem erros, `npm run check`
verde (318 testes Vitest; 8 de integração ignorados). `npm run test:integration`: a primeira execução,
logo após o `db:reset`, estourou o tempo de 10 s no preparo (8 ignorados); a segunda passou com 8.
Durante a prova de detecção a CLI perdeu a conexão com o Postgres local (`DbConnectError`) até
`db:stop` + `db:start`.
