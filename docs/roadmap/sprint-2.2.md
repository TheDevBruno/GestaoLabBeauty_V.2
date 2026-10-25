# Sprint 2.2 — Clientes

- **Início:** 2026-10-25
- **Status:** em andamento; plano aprovado pelo usuário em 2026-10-25 (não é ponto de aprovação
  obrigatória)
- **Branch:** `feat/sprint-2.2-clientes` (a partir da `main` em `5848ff1`, merge do PR #23)

## Objetivo

Segunda sprint da Fase 2. A empresa passa a cadastrar e encontrar os seus **clientes** (nome, contato e
data de nascimento), com busca por nome ou telefone e o recorte do `specialist` já garantido no banco.
Esses dados alimentam a agenda (Sprint 2.4) e o portal (Sprint 3.2). Só dados sintéticos; o repositório
não declara conformidade com a LGPD.

## Diagnóstico (2026-10-25)

Feito no Supabase local depois de `db:reset` (migrations e seed atuais).

- **`public.clients`** existe desde a Sprint 1.2 (`20261021040000_specialist_scope.sql`) só com `id`,
  `tenant_id`, `full_name` e `created_at`. Restrições: `clients_full_name_not_blank`
  (`btrim(full_name) <> ''`), `UNIQUE (tenant_id, id)` e FK para `tenants` com `on delete cascade`. Sem
  limite de tamanho no nome. Índices: só a PK e o `UNIQUE (tenant_id, id)`.
- **Trigger** `clients_prevent_tenant_id_change` (ADR-003 §4). RLS ligada (sem `force`).
- **Políticas:**
  - `clients_select_read`: `clients.read` e, se specialist, `private.specialist_can_see_client`
    (RN-028).
  - `clients_insert_write`: `clients.write` e **não** specialist (RN-036).
  - `clients_update_write`: `clients.write` e, se specialist, só os clientes que vê.
  - Sem política de DELETE (RN-037).
- **`GRANT` para `authenticated`:** `select` na tabela; `insert (tenant_id, full_name)`;
  `update (full_name)`. Nada para `anon`; sem `delete`.
- **Matriz em `roles_permissions`:** `clients.read` e `clients.write` para owner, admin, manager,
  specialist e receptionist; financial só `clients.read`. `clients.notes.private` para owner, admin,
  manager e specialist (ainda sem tabela que use).
- **Quem aponta para `clients`:** só `appointments_client_fkey` (`(tenant_id, client_id)`), sem
  `on delete`: um cliente com agendamento já não pode ser apagado nem pelo `service_role`.
- **Recorte do specialist:** `private.specialist_can_see_client(tenant, client)` lê `memberships`,
  `professionals` e `appointments` como `security definer`. No seed, o specialist do Studio Ana vê o
  Cliente Teste 1 (agendamento com o profissional dele) e não vê os clientes 2 e 3.
- **Seed:** 3 clientes por empresa, só com nome.
- **Testes que dependem do formato atual:** `rls_specialist.test.sql` (insere em `clients` com
  `full_name` e confere a lista exata de colunas com `INSERT`/`UPDATE`) e
  `services_professionals.test.sql` (insere clientes só com `full_name`). Colunas novas opcionais não
  quebram os `insert`; a lista de colunas com `GRANT` muda.
- **Extensões instaladas:** `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault`. **Não
  há** `unaccent` nem `pg_trgm`.
- **`tenants`** não tem fuso horário (só `id`, `name`, `slug`, `created_at`). Data de nascimento é
  `date`, sem fuso; nada nesta sprint depende dele.
- **Plano §7** lista também `client_notes` e `client_consents`; **plano §8** separa
  `clients.notes.private`. **RN-029** (notas do specialist) segue "a confirmar".
- **Interface:** `src/modules/services` e `src/modules/professionals` são o modelo (API fina sobre o
  Supabase com Zod nas linhas, contexto com chaves do TanStack Query por `tenant_id`, páginas próprias
  de lista e formulário, `useState` + Zod, `SavedNotice`, `StatusBadge`, tabela a partir de 1024 px e
  cartões abaixo). O shell mostra itens por permissão (`usePermission`).

## Proposta de modelo de dados

Uma migration nova (`supabase/migrations/2026102xxxxxxx_clients.sql`). Nenhuma ADR muda.

### `public.clients` (alterada)

| Coluna        | Tipo / regra                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `full_name`   | já existe; ganha limite de **120** caracteres                                                      |
| `phone`       | `text` opcional, formato E.164: `^\+[1-9][0-9]{7,14}$` (decisão 2)                                 |
| `email`       | `text` opcional, até 254 caracteres, minúsculo (`email = lower(email)`), forma `x@y.z` sem espaços |
| `birth_date`  | `date` opcional, `>= 1900-01-01` (o "não pode ser no futuro" fica no Zod; ver riscos)              |
| `is_active`   | `boolean not null default true` — "arquivar" no lugar de excluir (decisão 6)                       |
| `search_name` | `text not null`, **mantida por trigger**: nome sem acento e minúsculo, só para busca (decisão 4)   |

- Sem CPF, endereço, gênero ou foto (minimização de dados; decisão 1).
- Telefone e e-mail **não** são únicos na empresa (decisão 3). Índice `(tenant_id, phone)` para a busca
  por telefone e para o portal achar o cliente na Sprint 3.2.
- `search_name`: trigger `before insert or update of full_name` grava
  `lower(extensions.unaccent(full_name))`. Fica fora de todo `GRANT` de escrita, então ninguém a
  altera pela API. Exige a extensão **`unaccent`** no schema `extensions` (decisão 4; pedido de
  autorização, ver "Dependências e configuração").
- `GRANT` passa a ser: `insert (tenant_id, full_name, phone, email, birth_date, is_active)` e
  `update (full_name, phone, email, birth_date, is_active)`. Políticas não mudam: o recorte da RN-028 e
  a proibição de cadastro pelo specialist (RN-036) continuam valendo para as colunas novas.
- Continua sem DELETE (RN-037).

### Busca: `public.search_clients` (nova, decisão 4)

`public.search_clients(p_tenant_id uuid, p_query text, p_include_inactive boolean, p_limit int,
p_offset int)`, **`security invoker`** (a RLS de `clients` vale para quem chama, inclusive o recorte do
specialist), `STABLE`, `search_path` vazio, `EXECUTE` só para `authenticated`.

- Termo vazio: lista todos (ativos, ou todos com `p_include_inactive`).
- Termo com letras: `search_name like '%' || termo_normalizado || '%'` (normalizado no banco com o
  mesmo `unaccent` + `lower`; `%`, `_` e `\` do termo escapados).
- Termo só com dígitos (3 ou mais, ignorando espaço, parêntese, hífen e `+`): busca também em `phone`.
- Ordem por `search_name`, depois `id`; `p_limit` limitado a 100 no banco.
- Motivo de função em vez de `.or()` do PostgREST: o termo do usuário não entra numa string de filtro
  (sem risco de injeção de filtro), a normalização é a mesma do trigger e a regra fica testada em
  pgTAP.

### Seed

- Os 6 clientes existentes ganham telefone, e-mail `@example.test` e data de nascimento fictícios
  (alguns sem telefone ou sem e-mail, para testar os vazios).
- Mais clientes no Studio Ana (cerca de 12, com acentos no nome — "Conceição", "Júlia" — e um
  arquivado) para testar busca, paginação e filtro. Telefones claramente fictícios
  (`+551190000xxxx`).
- `seed_rls.test.sql` atualizado para contar os novos dados.

### Testes pgTAP (novos, `clients.test.sql`)

- Estrutura: colunas, `CHECK`s (nome até 120 e não branco, telefone E.164, e-mail minúsculo e com
  forma, data `>= 1900-01-01`), índice de telefone, trigger de `search_name`.
- `GRANT`: só as colunas previstas; `search_name` sem `INSERT`/`UPDATE`; nada para `anon`.
- RLS × operação × papel nos dois tenants (select, insert, update; delete negado a todos), `tenant_id`
  imutável.
- Specialist: vê e altera só os clientes com agendamento com ele; não cadastra; não arquiva quem não vê.
- `search_clients`: sem acento e sem diferenciar maiúsculas ("joao" acha "João"), telefone parcial,
  inativos só com o parâmetro, limite e deslocamento, recorte do specialist, outra empresa nunca
  aparece, `anon` sem `EXECUTE`, termo com `%` e `_` tratado como texto.
- Ajuste em teste existente, por mudança de schema: lista de colunas com `GRANT` em
  `rls_specialist.test.sql`.

## Proposta de interface

Direção visual da Sprint 1.4 (tokens semânticos, Inter, 44 px) e o mesmo padrão de módulos da Sprint
2.1. Consultas à skill `ui-ux-pro-max` (`--domain ux`): busca sem resultado com sugestão (não só
"0 resultados"), estado vazio com mensagem e ação, tipo de campo adequado (`tel`, `email`), rótulo
sempre visível. A consulta sobre atraso da busca enquanto digita não trouxe resultado próprio; sigo o
padrão da própria skill para autocompletar ("debounced fetch").

- Código em `src/modules/clients/` (`clients-api.ts`, `clients-context.ts`, `ClientsListPage.tsx`,
  `ClientFormPage.tsx`). Schemas Zod em `src/shared/client.ts`; telefone em `src/shared/phone.ts`
  (aceita "(11) 98765-4321", "11987654321" e "+55 11 98765-4321"; grava `+5511987654321`; formata de
  volta no padrão brasileiro); normalização do termo de busca no mesmo arquivo do schema.
- **Rotas** (decisão 7): `/app/clientes`, `/app/clientes/novo`, `/app/clientes/:id`, carregadas com
  `lazy`, protegidas por `RequirePermission` `clients.read` (o `/novo`, por `clients.write`).
- **Navegação** (decisão 8): item "Clientes" no shell para quem tem `clients.read` — owner, admin,
  manager, specialist, receptionist e financial.
- **Lista:**
  - Campo de busca com rótulo visível ("Buscar por nome ou telefone"), `type="search"`, atraso de
    300 ms antes de consultar, botão de limpar com nome acessível; o termo fica na URL (`?q=`), então
    voltar do formulário mantém a busca.
  - Quantidade de resultados anunciada em `role="status"` ("12 clientes", "Nenhum cliente encontrado
    para 'joao'"), sem mover o foco.
  - Tabela a partir de 1024 px (nome, telefone formatado, e-mail, status) e cartões abaixo; status em
    texto. Telefone e e-mail não viram link nesta sprint.
  - Filtro "Mostrar arquivados". Paginação "Carregar mais" de 50 em 50 (decisão 9), com o foco indo
    para o primeiro item novo.
  - Estados: carregando, vazio sem clientes ("Cadastrar o primeiro cliente", só para quem cadastra),
    busca sem resultado (sugere conferir a grafia ou buscar pelo telefone), erro com "Tentar de novo".
  - Specialist sem nenhum cliente visível: mensagem própria ("Aqui aparecem os clientes que já têm
    agendamento com você"), sem botão de cadastro.
- **Formulário** (`/novo` e `/:id`): nome completo, telefone (`type="tel"`, `autocomplete="tel"`),
  e-mail (`type="email"`, `autocomplete="email"`), data de nascimento (`type="date"`), "Cliente ativo"
  (só na edição). Erro junto ao campo, foco no primeiro inválido, botão com `busy`, aviso de sucesso com
  `role="status"` ao voltar para a lista. "Cliente não encontrado" para id inexistente, de outra empresa
  ou fora do recorte do specialist (sem distinguir os casos).
- **Leitura sem escrita:** quem tem só `clients.read` (financial) abre `/:id` como ficha de leitura
  (lista de definições), sem campos nem "Salvar"; "Novo cliente" não aparece.
- **Specialist:** "Novo cliente" não aparece e `/novo` mostra "Acesso não permitido"; edita os
  clientes que vê (RN-036).
- Escrita direto no Supabase sob RLS (ADR-002); busca pela função `search_clients`. Erros do Postgres
  viram mensagem da tela (`23514`/`22P02` → conferir os dados; `42501` → sem permissão), sem repassar o
  texto do banco.
- Testes de tela (jsdom): permissões por papel (item de menu, botão, `/novo`, ficha de leitura do
  financial), busca com atraso e termo na URL, sem resultado, paginação, arquivados, criar, editar,
  arquivar, validações (telefone, e-mail, data no futuro), não encontrado.

## Dependências e configuração

- **Nenhuma dependência npm nova.** Sem `react-hook-form` e sem biblioteca de máscara: o telefone é
  tratado em `src/shared/phone.ts`.
- Extensão Postgres **`unaccent`** (vem com o Supabase; criada pela migration no schema
  `extensions`), **autorizada pelo usuário em 2026-10-25** junto com a decisão 4.
- Nenhum arquivo de configuração muda. Se precisar, paro e peço.

## Passos

| #   | Passo                                                                                             | Status    |
| --- | ------------------------------------------------------------------------------------------------- | --------- |
| 1   | Plano (este documento) e OK do usuário                                                            | concluído |
| 2   | Migration (colunas, `CHECK`s, trigger de busca, `unaccent`, `search_clients`) e pgTAP             | concluído |
| 3   | Seed, schemas Zod, `phone.ts` e normalização da busca                                             | pendente  |
| 4   | Lista de clientes com busca, filtro e paginação; item "Clientes" no shell                         | pendente  |
| 5   | Cadastro, edição, arquivar e ficha de leitura                                                     | pendente  |
| 6   | Verificação (check, db:test, integração, navegador 375/1440 px por papel, teclado) e encerramento | pendente  |

Cada passo termina com `npm run check` e `npm run db:test` verdes, commit, `docs/STATE.md`,
`CHANGELOG.md` e este registro atualizados, e push da branch. Migrations só no Supabase local.

## Regras de negócio (registradas em REGRAS-DE-NEGOCIO.md em 2026-10-25)

- **RN-045 — Dados do cliente:** nome obrigatório até 120 caracteres; telefone opcional em E.164;
  e-mail opcional, minúsculo; data de nascimento opcional, não futura e a partir de 1900. Telefone e
  e-mail podem se repetir na empresa.
- **RN-046 — Cliente arquivado:** não é excluído (RN-037); some da lista padrão, aparece com o filtro
  "Mostrar arquivados" e não é oferecido em agendamento novo (efeito nas Sprints 2.4 e 3.2). Pode ser
  reativado.
- **RN-047 — Busca de clientes:** por parte do nome, sem diferenciar acento e maiúsculas, ou por parte
  do telefone; só devolve clientes que a pessoa já pode ver (recorte da RN-028).
- **RN-037 (complemento):** a "regra própria" de remoção passa a ser o arquivamento (RN-046). Pedido de
  apagar os dados de um cliente fica para quando a LGPD for tratada.

## Decisões do usuário (2026-10-25)

Todas as recomendações aprovadas, incluindo a extensão `unaccent` (decisão 4). As opções apresentadas
ficam abaixo como registro.

1. **Campos**: nome, telefone, e-mail, data de nascimento e ativo (recomendado: o mínimo para agendar,
   lembrar e achar o cliente). Alternativa: incluir também CPF e/ou endereço (dado pessoal a mais, sem
   uso no MVP).
2. **Telefone em E.164** (`+5511987654321`), com a tela aceitando o formato brasileiro (recomendado:
   pronto para WhatsApp e para números de fora). Alternativa: só os dígitos nacionais (10 ou 11).
3. **Telefone e e-mail não únicos** na empresa (recomendado: mãe e filha dividem telefone; a fusão de
   duplicados do portal é decidida na Sprint 3.2). Alternativa: telefone único por empresa.
4. **Busca sem acento** com a extensão `unaccent`, coluna `search_name` por trigger e função
   `search_clients` (recomendado). Alternativa A: busca com `ilike` sem tratar acento ("joao" não acha
   "João"). Alternativa B: carregar todos os clientes e filtrar no navegador (não escala, e a
   paginação some).
5. **Observações e notas ficam fora** desta sprint (recomendado: `client_notes` com
   `clients.notes.private` depende da RN-029, ainda "a confirmar", e pode guardar dado sensível de
   saúde, como alergia). Alternativa: coluna simples `notes` em `clients`, visível a quem lê o cliente.
6. **Arquivar no lugar de excluir** (`is_active`), RN-046 (recomendado). Alternativa: manter só o
   cadastro, sem arquivar.
7. **Página própria** para criar e editar, como serviços e profissionais (recomendado). Alternativa:
   gaveta (`Sheet`) sobre a lista.
8. **Menu "Clientes" para todos os papéis com `clients.read`**: financial em leitura, specialist só
   com o recorte e sem cadastrar (recomendado, segue o plano §8). Alternativa: menu só para quem tem
   `clients.write`.
9. **"Carregar mais" de 50 em 50** (recomendado: simples no celular e mantém a posição). Alternativa:
   páginas numeradas.
10. **`client_consents` fica para a Sprint 3.2** (portal e mensagens), quando houver o que consentir
    (recomendado).

## Riscos

- **Normalização diferente entre navegador e banco:** a busca normaliza o termo no próprio banco
  (`search_clients`), então a tela não precisa repetir a regra; o Zod só limita o tamanho do termo.
- **"Não futura" fora do `CHECK`:** `current_date` num `CHECK` deixaria linhas antigas inválidas com o
  tempo e não é imutável. Fica no Zod; o banco garante só o piso de 1900.
- **Busca sem índice de trigramas:** `like '%termo%'` lê a tabela da empresa. Para salões do piloto
  (centenas a poucos milhares de clientes) é suficiente; `pg_trgm` entra quando o volume pedir (nova
  autorização).
- **Specialist sem clientes até existir agenda:** só o seed cria agendamentos antes da Sprint 2.4. A
  tela explica o vazio.
- **Specialist pode arquivar cliente que vê** (RN-036 deixa alterar). Se não for desejado, um trigger
  bloqueia `is_active` para specialist; fica registrado como possível ajuste.
- **Limite de 120 no nome:** em homologação e produção ainda não há clientes; seed e testes usam nomes
  curtos.
- **Mudança na lista de `GRANT` testada em `rls_specialist.test.sql`:** ajuste esperado por mudança de
  schema, sem mudar resultado de política.
- **LGPD não declarada:** só dados sintéticos em seed e testes; nada de dado real no navegador de
  teste.

## Fora do escopo

- Notas (`client_notes`) e consentimentos (`client_consents`) — decisões 5 e 10.
- Histórico de agendamentos do cliente (Sprint 2.4) e financeiro do cliente (Fase 4).
- Importação de planilha, fusão de duplicados, aniversariantes e mensagens.
- Exclusão ou anonimização de dados a pedido do cliente.
- Exibição e cadastro pelo portal público (Sprint 3.2).

## Registro

### Passo 1 — Plano (2026-10-25)

- PR #23 confirmado na `main` (`5848ff1`, mesclado em 2026-10-25T12:55:56Z). Branch criada a partir
  dele. Docker em execução, Supabase local no ar, `npm run db:reset` aplicado, `.env.local` presente.
- Diagnóstico de `clients` no banco local (colunas, restrições, políticas, `GRANT`, matriz, extensões)
  e leitura das migrations, testes e módulos de referência.
- Este documento. Plano aprovado pelo usuário em 2026-10-25 com todas as recomendações e a extensão
  `unaccent`; RN-045 a RN-047 e o complemento da RN-037 registrados.

### Passo 2 — Migration e pgTAP (2026-10-25)

Sem dependência npm nova e sem mudança de configuração. Extensão `unaccent` autorizada no passo 1. Tudo
só no Supabase local.

Entregue em `supabase/migrations/20261025140000_clients.sql`:

- `create extension unaccent with schema extensions`.
- `private.search_text(text)`: `lower(extensions.unaccent('extensions.unaccent'::regdictionary, …))`,
  `IMMUTABLE`, `security invoker`, `search_path` vazio, `EXECUTE` só para `authenticated`. O dicionário
  explícito tira a dependência do `search_path`.
- `clients`: `phone` (`^\+[1-9][0-9]{7,14}$`), `email` (minúsculo, até 254, forma `x@y.z` sem
  espaços), `birth_date` (`>= 1900-01-01`), `is_active` (padrão `true`), limite de 120 no nome e
  `search_name not null`.
- Trigger `clients_set_search_name` (`private.set_client_search_name`) recalcula `search_name` em todo
  `INSERT` e `UPDATE`.
- Índices `(tenant_id, phone)` parcial (telefone não nulo) e `(tenant_id, search_name, id)`.
- `GRANT insert`/`update` de `phone`, `email`, `birth_date` e `is_active`; `search_name` sem `GRANT` de
  escrita. Políticas inalteradas.
- `public.search_clients(p_tenant_id, p_query, p_include_inactive, p_limit, p_offset)`: `security
invoker`, `STABLE`, `search_path` vazio, `EXECUTE` só para `authenticated`. Devolve `setof clients`
  (o PostgREST trata como tabela). Termo cortado em 100 caracteres, normalizado por `search_text`, com
  `\`, `%` e `_` escapados; 3 ou mais dígitos (sem espaço, parênteses, ponto, hífen e `+`) buscam também
  no telefone. Ordem `search_name, id`. Limite nulo vira 50, abaixo de 1 vira 1 e acima de 100 vira
  100; deslocamento negativo vira 0.

Ajustes em relação ao plano:

- **Função `private.search_text`** separada: a mesma normalização serve ao trigger e à busca. Ela não
  precisou de `security definer`: o Supabase já concede `USAGE` em `extensions` e `EXECUTE` do
  `unaccent` a `authenticated` (conferido no banco local).
- **Trigger em todo `INSERT`/`UPDATE`**, não só em `update of full_name`: assim nem um `UPDATE` direto
  de `search_name` (por quem ignora `GRANT`) a desalinha do nome.
- **Índice `(tenant_id, search_name, id)`** a mais, para a ordem e a paginação da lista.

Ajuste em teste existente, por mudança de schema: `rls_specialist.test.sql` passa a esperar as colunas
novas na lista de `INSERT`/`UPDATE` de `authenticated`. Nenhum resultado de política mudou.

Testes novos em `supabase/tests/clients.test.sql` (248 asserções): 168 casos gerados (2 empresas × 6
papéis × leitura, cadastro completo, alteração e arquivamento, `search_name` não gravável, exclusão
negada e busca, nos alvos com e sem agendamento com o specialist e na outra empresa) e 80 fixos
(estrutura, índices, trigger, extensão, políticas inalteradas, `GRANT`, propriedades das funções,
`CHECK`s nos limites, `search_name` no cadastro, na troca de nome e contra escrita direta, busca sem
acento e sem maiúsculas, arquivados, telefone parcial e com máscara, menos de 3 dígitos, `%` e `_`
como texto, ordem e paginação, limites, recorte do specialist, financial, usuário sem vínculo, `anon` e
outra empresa).

Provas de detecção, direto no banco local:

- `search_clients` trocada para `security definer`: 19 testes falharam (propriedade da função, 12
  buscas na outra empresa, 2 do specialist em cliente que não atendeu e 4 do bloco de recorte).
- Busca sem o escape de `\`, `%` e `_`: 2 testes falharam (`%` e `_` como texto). O teste do `\` não
  detecta essa troca: sem escape, o padrão `%\%` passa a exigir `%` no fim do nome, e nenhum nome
  termina assim.
- Função restaurada com `db:reset`.

Verificação: `npm run db:test` 1589 PASS (15 arquivos), `supabase db lint` sem erros, `npm run check`
verde (472 testes Vitest; 8 de integração ignorados). Na primeira tentativa de `db:reset` a CLI perdeu
a conexão com o Postgres local (`DbConnectError`), como no passo 2 da Sprint 2.1; resolvido com
`db:stop` + `db:start` e novo `db:reset`.
