# Sprint 2.3 — Disponibilidade

- **Início:** 2026-10-25
- **Status:** passos 1 a 3 concluídos (plano aprovado pelo usuário em 2026-10-25 com todas as
  recomendações; migration e pgTAP; seed, schemas e fuso); não é ponto de aprovação obrigatória
- **Branch:** `feat/sprint-2.3-disponibilidade` (a partir da `main` em `3986ca5`, merge do PR #24)

## Objetivo

Terceira sprint da Fase 2. A empresa passa a dizer **quando cada profissional atende**: horários
semanais (com intervalo de almoço) e exceções (folga, férias, feriado, horário extra), no **fuso da
empresa**. O banco passa a calcular os períodos livres de um profissional num intervalo de datas. É a
base da agenda (Sprint 2.4: conflito, `location_id`, `buffer_minutes`) e do portal (Sprint 3.2). Só
dados sintéticos.

## Diagnóstico (2026-10-25)

Feito no Supabase local depois de `db:reset` (migrations e seed atuais, 11 migrations).

- **`public.tenants`**: só `id`, `name`, `slug`, `created_at`. **Sem fuso horário**, apesar do plano §7
  e da RN-032 ("horário em UTC, exibido no fuso da empresa ou unidade"). `GRANT` para `authenticated`:
  `select (id, name, slug, created_at)` e `update (name)`; política `tenants_update_settings` com
  `tenant.settings` (owner e admin). O banco local reconhece `America/Sao_Paulo` em
  `pg_timezone_names`.
- **Não existem** `locations`, `location_hours`, `availability_rules` nem `availability_exceptions`.
  Nenhuma ADR trata de fuso, unidade ou disponibilidade.
- **`public.professionals`**: `id`, `tenant_id`, `membership_id` (opcional), `display_name`,
  `is_active`, `created_at`. Políticas: membro lê; `services.manage` cria, altera e exclui (RN-035). A
  exclusão só é recusada quando há agendamento (RN-042).
- **`public.appointments`**: ainda mínima (`id`, `tenant_id`, `client_id`, `professional_id`,
  `created_at`), **sem período, status nem `location_id`** — tudo isso é da Sprint 2.4.
- **Helpers em `private`**: `is_member`, `has_permission`, `is_specialist`, `is_own_professional`
  (profissional ligado ao usuário da sessão), `prevent_tenant_id_change`, entre outros.
- **Matriz (`roles_permissions`)**: não há permissão própria de disponibilidade. `services.manage`:
  owner, admin e manager. `appointments.write`: owner, admin, manager, specialist (próprio) e
  receptionist. `appointments.read`: os 6 papéis (specialist próprio, financial leitura).
- **Extensões**: `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `unaccent` (no schema `extensions`) e
  `supabase_vault`. **`btree_gist` não está instalada, mas está disponível** (`pg_available_extensions`);
  o plano §7 já a prevê para a exclusion constraint da agenda.
- **Postgres 17.11**: tem `tstzmultirange` (cálculo de extras e bloqueios). Conferido numa transação
  desfeita (`rollback`): `create extension btree_gist with schema extensions` funciona e a exclusion
  com `int4range` de minutos aceita intervalos encostados e `24:00`; `date + '24:00'::time` vira
  00:00 do dia seguinte.
- **`professional_services`** (Sprint 2.1) existe; não muda nesta sprint.
- **Volatilidade**: `date_part(text, time)` é `IMMUTABLE` (serve no índice da exclusion);
  `date_part(text, timestamptz)` é `STABLE` (depende do `TimeZone` da sessão), então os `CHECK`s de
  exceção não usam `extract` direto sobre `timestamptz` (ver abaixo).
- **Helpers conferidos**: `private.is_own_professional(p_tenant_id uuid, p_professional_id uuid)` e
  `private.is_specialist(p_tenant_id uuid)`, ambos `STABLE`.
- **Interface**: `src/modules/services`, `src/modules/professionals` e `src/modules/clients` são o
  modelo (API fina com Zod, contexto com chaves do TanStack Query por `tenant_id`, páginas próprias,
  `useState` + Zod, `SavedNotice`, `StatusBadge`). As telas de profissionais exigem `services.manage`
  (lista, criar e editar). Não há tela de configurações da empresa; o onboarding é a Sprint 2.5.
- **Pendências do `STATE.md` que tocam esta sprint**: `TextLink` de 20 px nos "Voltar para…" de
  serviço e profissional não encontrados (a tela de horários nasce dentro de profissionais) e o
  specialist arquivando cliente (sem relação direta; segue para o usuário decidir).

## Proposta de modelo de dados

Uma migration nova (`supabase/migrations/2026102xxxxxxx_availability.sql`). Nenhuma ADR muda.

### Fuso da empresa: `tenants.timezone` (decisão 1)

- `timezone text not null default 'America/Sao_Paulo'`, nome IANA.
- Validação por trigger (`before insert or update of timezone`): o nome precisa existir em
  `pg_timezone_names`. Não dá para usar `CHECK` (consulta a catálogo) e um `CHECK` com conversão de
  data não é imutável.
- `GRANT update (timezone)` para `authenticated`; a política `tenants_update_settings` já restringe a
  owner e admin. `select (timezone)` para todo membro.
- Seed: Studio Ana em `America/Sao_Paulo` e Clinica Bela em `America/Manaus` (testa um fuso diferente
  de UTC−3 no cálculo).
- **Tela para trocar o fuso fica na Sprint 2.5** (onboarding e configurações). Nesta sprint o fuso é
  mostrado na tela de horários ("Horários no fuso de São Paulo").

### Unidade (decisão 2)

- MVP com unidade única (plano §3). **Recomendação:** `locations` nasce na Sprint 2.4, junto com
  `appointments.location_id` (plano §5, ajuste 5), e não nesta. A disponibilidade é por profissional,
  no fuso da empresa; quando houver várias unidades, a regra ganha `location_id` opcional numa
  migration futura.
- `location_hours` (horário de funcionamento da unidade) fica fora do MVP: o horário que vale é o de
  cada profissional.

### `public.availability_rules` (nova): horário semanal do profissional

| Coluna            | Tipo / regra                                                                    |
| ----------------- | ------------------------------------------------------------------------------- |
| `id`              | `uuid` PK                                                                       |
| `tenant_id`       | `uuid not null`, FK `tenants` `on delete cascade`                               |
| `professional_id` | `uuid not null`, FK composta `(tenant_id, professional_id)` `on delete cascade` |
| `weekday`         | `smallint not null`, ISO: 1 = segunda … 7 = domingo (`extract(isodow)`)         |
| `start_time`      | `time not null`, hora local no fuso da empresa                                  |
| `end_time`        | `time not null`, hora local; `24:00` permitido para "até meia-noite"            |
| `created_at`      | `timestamptz not null default now()`                                            |

- `CHECK`s: `weekday between 1 and 7`; `start_time < end_time` (sem virar a meia-noite; quem atende
  de madrugada cadastra dois intervalos); minutos múltiplos de 5 e segundos zerados nas duas horas;
  `end_time <= '24:00'`.
- Vários intervalos por dia (manhã e tarde, com almoço no meio), **sem sobreposição** no mesmo
  profissional e dia: `EXCLUDE USING gist (tenant_id WITH =, professional_id WITH =, weekday WITH =,
int4range(minutos de start_time, minutos de end_time) WITH &&)` com a extensão **`btree_gist`**
  (decisão 3). Intervalos encostados (12:00–14:00 e 14:00–18:00) são aceitos (`[)`).
- `UNIQUE (tenant_id, id)`, índice `(tenant_id, professional_id, weekday)` (coberto pelo índice da
  exclusion), trigger `prevent_tenant_id_change`.
- Sem data de vigência ("a partir de"): mudar o horário vale para os próximos dias; agendamentos já
  feitos não mudam (decisão 6).

### `public.availability_exceptions` (nova): folgas, bloqueios e horário extra

| Coluna            | Tipo / regra                                                                |
| ----------------- | --------------------------------------------------------------------------- |
| `id`              | `uuid` PK                                                                   |
| `tenant_id`       | `uuid not null`, FK `tenants` `on delete cascade`                           |
| `professional_id` | `uuid not null`, FK composta `on delete cascade` (decisão 5)                |
| `kind`            | `text not null`, `blocked` (não atende) ou `extra` (atende fora do horário) |
| `period`          | `tstzrange not null`, `[)`, em UTC; a tela converte do fuso da empresa      |
| `reason`          | `text` opcional, até 120 caracteres, não branco quando preenchido           |
| `created_at`      | `timestamptz not null default now()`                                        |

- `CHECK`s: `kind in ('blocked', 'extra')`; `period` não vazio, com início e fim finitos e `[)`;
  início e fim em minutos múltiplos de 5; duração de até 366 dias. O "múltiplo de 5 minutos" usa a
  diferença para a época em UTC (`extract(epoch from lower(period) - timestamptz '1970-01-01
00:00+00')::bigint % 300 = 0`), que não depende do `TimeZone` da sessão (todos os fusos IANA atuais
  têm deslocamento múltiplo de 5 minutos).
- Índice gist `(tenant_id, professional_id, period)` para o cálculo. Sobreposição entre exceções é
  aceita (um bloqueio de férias por cima de uma folga não é erro); no cálculo, **bloqueio vence
  extra**.
- `UNIQUE (tenant_id, id)`, trigger `prevent_tenant_id_change`.
- "Dia inteiro" é só da tela: vira `[00:00 do dia, 00:00 do dia seguinte)` no fuso da empresa.
- `reason` é texto livre visível a quem lê a disponibilidade: a tela avisa para não registrar dado de
  saúde (risco de dado sensível, como em `client_notes`).

### RLS e `GRANT` (decisão 4)

| Operação                        | Quem                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Ler regras e exceções           | Todo membro da empresa (a recepção e a agenda precisam; mesmo modelo de `professionals`)                                   |
| Criar, alterar, excluir regras  | `services.manage` (owner, admin, manager)                                                                                  |
| Criar, alterar, excluir exceção | `services.manage`, ou `appointments.write` (receptionist; specialist só do próprio profissional via `is_own_professional`) |

- Nada para `anon`: o portal lê por função própria na Sprint 3.2 (ADR-003 §7).
- `GRANT` só de colunas: regras `insert (tenant_id, professional_id, weekday, start_time, end_time)`,
  `update (weekday, start_time, end_time)`, `delete`; exceções `insert (tenant_id, professional_id,
kind, period, reason)`, `update (kind, period, reason)`, `delete`. O specialist não troca o
  profissional de uma exceção (`professional_id` fora do `update`).
- Disponibilidade e exceções são registros de configuração, não de cliente: excluir é permitido (a
  RN-037 vale só para clientes e agendamentos).

### Gravação da semana: `public.set_availability_rules` (nova)

`public.set_availability_rules(p_tenant_id uuid, p_professional_id uuid, p_rules jsonb)`, **`security
invoker`** (as políticas valem para quem chama), `VOLATILE`, `search_path` vazio, `EXECUTE` só para
`authenticated`. Apaga e insere as regras do profissional numa transação só: a tela salva a semana
inteira de uma vez, e um erro (sobreposição, hora inválida) não deixa a semana pela metade. Sem a
função, o navegador teria de fazer `delete` + `insert` em duas chamadas, sem atomicidade.

### Cálculo: `public.professional_availability` (nova, decisão 7)

`public.professional_availability(p_tenant_id uuid, p_professional_id uuid, p_from date, p_to date)`
devolve `table (period tstzrange)`: os períodos em que o profissional atende, já em UTC.

1. Para cada dia local entre `p_from` e `p_to` (no máximo 62 dias), as regras do dia da semana viram
   `tstzrange` com `(dia + hora) at time zone tenants.timezone` (horário de verão tratado pelo
   Postgres).
2. Soma as exceções `extra` e subtrai as `blocked` (com `tstzmultirange`, Postgres 14+; bloqueio
   vence extra).
3. Profissional inativo devolve vazio (RN-042).

`security invoker`, `STABLE`, `search_path` vazio, `EXECUTE` só para `authenticated`. Não trata
serviço, duração, `buffer_minutes` nem agendamentos: isso é da Sprint 2.4 (RN-003), que vai subtrair
os agendamentos ativos e quebrar em horários. Nesta sprint ela alimenta a prévia da tela e os testes
de fuso (risco R3).

### Seed

- Profissionais do Studio Ana: um com segunda a sexta 09:00–12:00 e 13:00–18:00 e sábado
  09:00–13:00; outro de terça a sábado 10:00–19:00. Clinica Bela com um horário simples.
- Exceções: uma folga de dia inteiro, um bloqueio de duas horas e um sábado extra, em datas fixas de
  2026 (seed determinístico).
- `seed_rls.test.sql` passa a contar regras e exceções.

### Testes pgTAP (novos, `availability.test.sql`)

- Estrutura: colunas, `CHECK`s nos limites (dia 0 e 8, 09:03, início igual ao fim, `24:00`, período
  vazio, aberto, maior que 366 dias, motivo de 121 caracteres), exclusion (sobreposto recusado,
  encostado aceito, outro dia ou outro profissional aceito), FKs compostas (profissional de outra
  empresa recusado), cascade ao excluir o profissional, `tenant_id` imutável, fuso inválido recusado.
- `GRANT`: só as colunas previstas; nada para `anon`; `timezone` gravável só com `tenant.settings`.
- RLS × operação × papel nos dois tenants (regras e exceções; specialist só nas exceções do próprio
  profissional, nunca nas regras; financial só lê).
- `set_availability_rules`: troca a semana, falha inteira com sobreposição, nega quem não tem
  `services.manage`, propriedades da função.
- `professional_availability`: dia comum, almoço, folga de dia inteiro, bloqueio parcial, extra em dia
  sem regra, bloqueio por cima de extra, profissional inativo, outra empresa vazia, limite de 62 dias,
  fuso de Manaus, e **datas de borda** (virada de dia em UTC, `24:00`, e um fuso com horário de verão
  — `America/New_York` em 2026-03-08 e 2026-11-01 — para provar que a conversão usa o fuso e não um
  deslocamento fixo).

## Proposta de interface

Direção visual da Sprint 1.4 (tokens semânticos, Inter, 44 px) e padrão de módulos das Sprints 2.1 e
2.2. Consultas à skill `ui-ux-pro-max` (`--domain ux`, revistas em 2026-10-25): campo com o tipo certo
(`type="time"`, `type="date"`), rótulo sempre visível (nunca só placeholder), retorno de carregamento e
de sucesso ao salvar, confirmação antes de ação destrutiva (excluir exceção), erro junto ao campo com
`aria-describedby` e resumo de erros focável em formulário longo. Para grade semanal a base não trouxe
resultado próprio; uso os padrões gerais de formulário acima.

- Código em `src/modules/availability/` (`availability-api.ts`, `availability-context.ts`,
  `AvailabilityPage.tsx`, componentes da semana e das exceções). Schemas Zod em
  `src/shared/availability.ts` (hora `HH:MM` de 5 em 5, intervalo com fim depois do início, sem
  sobreposição no dia, exceção com fim depois do início). Conversão entre hora local da empresa e UTC
  com `Intl.DateTimeFormat` (sem dependência nova), em `src/shared/timezone.ts`, com testes de borda.
- **Rota** (decisão 8): `/app/profissionais/:id/horarios`, carregada com `lazy`. Acesso:
  `services.manage` (todos os profissionais) e specialist no próprio profissional. Para o specialist,
  item "Meus horários" no shell, que leva ao profissional ligado a ele.
- **Entrada:** botão "Horários" na edição do profissional e na linha da lista de profissionais.
- **Semana** (seção "Horário semanal"):
  - Um `fieldset` por dia, de segunda a domingo, com `legend` ("Segunda-feira"). Dia sem intervalo
    aparece como "Não atende".
  - Cada intervalo: "Início" e "Fim" com `type="time"` e `step="300"`, rótulos visíveis, e botão
    "Remover" com nome acessível ("Remover intervalo 2 de terça-feira"). "Adicionar intervalo" por
    dia.
  - Atalho "Copiar segunda-feira para os dias úteis" (economiza a parte repetitiva).
  - Erros junto ao intervalo (fim antes do início, sobreposição), ligados ao campo por
    `aria-describedby`. Como a semana tem muitos campos, ao salvar com erro aparece um resumo no topo
    (`role="alert"`, `tabindex="-1"`, recebe o foco) com um link para cada campo inválido; os erros
    junto ao campo continuam. Um único "Salvar horários" com `busy` e aviso de sucesso com
    `role="status"`. Grava pela `set_availability_rules`.
  - Mostra o fuso ("Horários no fuso America/Sao_Paulo (São Paulo)").
  - Celular: dias empilhados; a partir de 1024 px, os dias continuam em lista (uma grade de 7 colunas
    de horários fica apertada e difícil de usar no teclado).
- **Exceções** (seção "Folgas e exceções"):
  - Lista das próximas (a partir de hoje), em ordem de data: tipo em texto ("Não atende" / "Horário
    extra"), período formatado no fuso da empresa ("Sex, 13/11, dia inteiro" ou "Sáb, 14/11, 09:00 às
    13:00") e motivo. "Mostrar anteriores" para as passadas.
  - Formulário em página própria (`/horarios/excecoes/nova` e `/:excecaoId`), como os demais
    cadastros: tipo (rádio), "Dia inteiro" (caixa), data de início e de fim (`type="date"`), hora de
    início e de fim (`type="time"`, escondidas no dia inteiro), motivo (com a dica "Não registre
    informações de saúde").
  - Excluir com confirmação em duas etapas (como a exclusão de profissional da Sprint 2.1).
  - Receptionist (decisão 4) chega às exceções pela tela de horários em modo leitura da semana; o
    acesso dele depende da decisão 8.
- **Prévia** (seção "Próximos 7 dias", decisão 7): lista por dia com os períodos livres calculados
  pela `professional_availability`, para conferir o efeito de regras e exceções. Só leitura.
- **Leitura sem escrita:** quem lê mas não altera vê a semana e as exceções como texto, sem campos.
- Erros do Postgres viram mensagem da tela (`23P01` sobreposição → "Os intervalos de <dia> se
  sobrepõem"; `23514`/`22P02`/`22007`/`22008` → conferir os dados; `42501` → sem permissão), sem
  repassar o texto do banco.
- Testes de tela (jsdom): acesso por papel, adicionar e remover intervalo, copiar para dias úteis,
  validações, salvar, erro do banco, exceção dia inteiro e com horas, exclusão com confirmação, lista
  de próximas e anteriores, prévia, "Profissional não encontrado".
- O "Voltar para…" das telas novas nasce como botão de 44 px (lição da Sprint 2.2). Corrigir os
  `TextLink` antigos de serviço e profissional entra só se o usuário aprovar (decisão 9).

## Dependências e configuração

- **Nenhuma dependência npm nova.** Conversão de fuso com `Intl` (nativo); sem biblioteca de datas.
- Extensão Postgres **`btree_gist`** (vem com o Supabase; criada pela migration no schema
  `extensions`): **precisa de autorização** (decisão 3). Ela já estava prevista no plano §7 para a
  agenda.
- Nenhum arquivo de configuração muda. Se precisar, paro e peço.

## Decisões para o usuário

1. **Fuso na empresa** (`tenants.timezone`, padrão `America/Sao_Paulo`, validado no banco), com a tela
   de troca na Sprint 2.5 (recomendado). Alternativa: um seletor de fuso já nesta sprint (tela de
   configurações nova, fora do escopo previsto).
2. **`locations` só na Sprint 2.4**, junto com `appointments.location_id`; `location_hours` fora do MVP
   (recomendado: nesta sprint a unidade não muda nada, e criar a tabela agora obriga a decidir a
   unidade padrão sem uso). Alternativa: criar `locations` agora, com uma unidade padrão por empresa
   criada por trigger, e ligar regras a ela.
3. **Extensão `btree_gist`** para impedir intervalos sobrepostos no banco (recomendado; a agenda da
   Sprint 2.4 vai precisar dela de qualquer jeito). Alternativa: validar sobreposição por trigger, sem
   extensão.
4. **Quem altera**: regras com `services.manage`; exceções também com `appointments.write` (recepção
   bloqueia horário de qualquer profissional, specialist só do próprio) (recomendado: bloquear horário
   é mexer na agenda, e o plano §8 dá agenda a esses papéis). Alternativa A: tudo só com
   `services.manage`. Alternativa B: specialist também edita o próprio horário semanal.
5. **Exceção sempre de um profissional** (recomendado). Feriado da empresa vira um bloqueio por
   profissional, com o atalho "aplicar a todos" ficando para depois. Alternativa: `professional_id`
   opcional para bloqueio da empresa inteira (mais uma regra de RLS e de cálculo).
6. **Sem data de vigência** nas regras (recomendado: a mudança vale dali em diante; horário de verão e
   mudança temporária são exceções). Alternativa: `valid_from`/`valid_until` por regra.
7. **Cálculo no banco** (`professional_availability`, `security invoker`) com prévia de 7 dias na tela
   (recomendado: uma regra só para painel e portal, testada em pgTAP com datas de borda). Alternativa:
   cálculo em TypeScript no navegador (o portal teria de repetir a regra no servidor).
8. **Rota dentro de profissionais** e item "Meus horários" para o specialist (recomendado).
   Receptionist: acesso às exceções pela mesma rota, com a semana só para leitura, sem item de menu
   novo (entra pela agenda na Sprint 2.4). Alternativa: item "Horários" no menu para todos os papéis
   com `appointments.write`.
9. **Corrigir agora os "Voltar para…" com `TextLink` de 20 px** de serviço e profissional não
   encontrados e do `RequirePermission` (recomendado: são poucas linhas, a tela nova fica ao lado e a
   pendência fecha). Alternativa: deixar para uma sprint de acabamento.
10. **Specialist arquivando cliente** (pendência da Sprint 2.2): sem relação com esta sprint;
    recomendo manter como está (RN-046) até o usuário decidir, sem trigger nesta sprint.

## Regras de negócio (registradas em REGRAS-DE-NEGOCIO.md em 2026-10-25)

- **RN-048 — Fuso da empresa:** toda empresa tem um fuso IANA (padrão `America/Sao_Paulo`); horários
  semanais e "dia inteiro" são interpretados nele; o banco guarda instantes em UTC (RN-032).
- **RN-049 — Horário semanal:** intervalos por dia da semana, de 5 em 5 minutos, início antes do fim,
  no mesmo dia, sem sobreposição no mesmo profissional e dia; encostados são aceitos.
- **RN-050 — Exceções:** bloqueio (não atende) ou horário extra, de 5 em 5 minutos, até 366 dias;
  bloqueio vence extra; motivo opcional sem dado de saúde.
- **RN-051 — Quem altera a disponibilidade:** conforme a decisão 4.
- **RN-052 — Disponibilidade calculada:** regras do dia + extras − bloqueios, no fuso da empresa;
  profissional inativo não tem disponibilidade (RN-042). Agendamentos e duração do serviço entram na
  Sprint 2.4 (RN-003).

## Riscos

- **Fuso e horário de verão (R3):** o Brasil não tem horário de verão desde 2019, mas pode voltar e
  outras empresas podem estar em outro fuso. A conversão fica com o Postgres (`at time zone`) e é
  testada com `America/New_York` nas datas de mudança. Uma hora que não existe no dia da mudança
  (02:30 no adiantamento) é normalizada pelo Postgres; fica registrada nos testes.
- **Tela e banco convertendo fuso de jeitos diferentes:** a tela converte só para exibir e para gravar
  exceções; o cálculo é do banco. `timezone.ts` tem testes nas mesmas datas de borda.
- **Mudar o fuso da empresa depois** muda o significado das regras (09:00 continua 09:00 local) mas
  não o das exceções (instantes em UTC). Registrar no aviso da tela de troca (Sprint 2.5).
- **`24:00` em `time`:** o Postgres aceita; a tela mostra "24:00" como "meia-noite". Coberto em teste.
- **Motivo da exceção com dado sensível:** campo opcional, curto e com aviso; visível a todo membro.
- **Disponibilidade sem agendamentos:** até a Sprint 2.4 a prévia mostra horário de atendimento, não
  horário livre de verdade. O texto da tela diz isso.
- **`btree_gist` sem autorização:** cai para trigger de sobreposição (alternativa da decisão 3).
- **Exceções sobrepostas:** aceitas por decisão; o cálculo resolve. A lista pode mostrar duas
  exceções no mesmo dia, o que é esperado.

## Fora do escopo

- Duração do serviço, `buffer_minutes`, agendamentos e horários livres para reservar (Sprint 2.4).
- `locations` e `location_hours` (decisão 2), várias unidades.
- Tela de troca do fuso (Sprint 2.5), onboarding.
- Feriados nacionais automáticos, recorrência de exceções e "aplicar a todos".
- Portal público (Sprint 3.2).

## Passos

| #   | Passo                                                                                                      | Status    |
| --- | ---------------------------------------------------------------------------------------------------------- | --------- |
| 1   | Plano (este documento) e OK do usuário                                                                     | concluído |
| 2   | Migration (`timezone`, `btree_gist`, regras, exceções, RLS, `set_availability_rules`, cálculo) e pgTAP     | concluído |
| 3   | Seed, schemas Zod e `timezone.ts` com testes de borda                                                      | concluído |
| 4   | Tela de horários: semana, prévia de 7 dias e entradas (profissionais e "Meus horários")                    | pendente  |
| 5   | Exceções: lista, cadastro, edição e exclusão                                                               | pendente  |
| 6   | Verificação (check, db:test, integração, navegador 375/768/1024/1440 px por papel, teclado) e encerramento | pendente  |

Cada passo termina com `npm run check` e `npm run db:test` verdes, commit, `docs/STATE.md`,
`CHANGELOG.md` e este registro atualizados, e push da branch. Migrations só no Supabase local.

## Registro

### Passo 1 — Plano (2026-10-25)

- PR #24 confirmado na `main` (`3986ca5`, mesclado em 2026-10-25T16:10:58Z). Branch criada a partir
  dele. Docker em execução, Supabase local no ar, `npm run db:reset` aplicado.
- Diagnóstico no banco local (colunas de `tenants`, `professionals` e `appointments`, `GRANT` e
  políticas de `tenants`, matriz, extensões, helpers) e leitura das migrations, das RNs e dos módulos
  de referência.
- Revisão do rascunho (2026-10-25): diagnóstico conferido de novo no banco local (colunas, `GRANT`,
  políticas, matriz, helpers, extensões disponíveis, Postgres 17.11); exclusion com `btree_gist`
  testada numa transação desfeita; `CHECK` de exceção sem `extract` sobre `timestamptz`; resumo de
  erros focável na semana (skill `ui-ux-pro-max`).
- Este documento. **Aprovado pelo usuário em 2026-10-25 com todas as recomendações** (decisões 1 a
  10, inclusive a extensão `btree_gist`). RN-048 a RN-052 registradas em
  [REGRAS-DE-NEGOCIO.md](../REGRAS-DE-NEGOCIO.md#disponibilidade).

### Passo 2 — Migration e pgTAP (2026-10-25)

- Migration `supabase/migrations/20261025160000_availability.sql`, aplicada só no Supabase local
  (`npm run db:reset`):
  - extensão `btree_gist` no schema `extensions`;
  - `tenants.timezone` (`not null`, padrão `America/Sao_Paulo`) validado pelo trigger
    `tenants_check_timezone` contra `pg_timezone_names` (erro `22023`); `GRANT select, update (timezone)`;
  - `availability_rules` com os `CHECK`s do plano e a exclusion `availability_rules_no_overlap`
    (`int4range` de minutos, `[)`);
  - `availability_exceptions` com os `CHECK`s do plano; o de 5 minutos usa a distância para a época em
    UTC (sem `extract` sobre `timestamptz`), índice gist `(tenant_id, professional_id, period)`;
  - FKs compostas com `on delete cascade`, `prevent_tenant_id_change`, RLS e uma política por operação
    (RN-051), `GRANT` só de colunas, sem `professional_id` no `UPDATE`;
  - `public.set_availability_rules` (`security invoker`, `VOLATILE`): confere `services.manage` antes
    (`42501` mesmo com a semana vazia), `p_rules` precisa ser array com até 70 itens (`22023`),
    profissional da empresa (`P0002`), apaga e insere numa transação;
  - `public.professional_availability` (`security invoker`, `STABLE`): de 1 a 62 dias (`22023`),
    regras convertidas com `at time zone`, extras somados e bloqueios subtraídos com `range_agg` e
    `tstzmultirange`, recorte à janela local, vazio para profissional inativo ou invisível.
- **Achado na implementação:** uma hora local que não existe no adiantamento do relógio vira um
  instante depois do fim (em New York, 02:30 → 07:30 UTC e 03:00 → 07:00 UTC). Sem tratamento, uma
  regra 02:30–03:00 quebraria o `tstzrange` e a função inteira naquele dia. O cálculo descarta o
  intervalo que fica com início depois do fim; coberto em teste (08/03/2026 e o domingo seguinte).
- `supabase/tests/availability.test.sql`: 510 asserções — estrutura, `CHECK`s nos limites, exclusion
  (sobreposto e cobrindo recusados; encostado, outro dia e outro profissional aceitos), FKs compostas,
  cascade, `tenant_id` imutável, fuso inválido, `GRANT`, políticas, propriedades das funções, 360
  casos de RLS (2 empresas × 6 papéis × 30 casos), anon e usuário sem vínculo, `set_availability_rules`
  (troca, falha inteira, entradas inválidas, papéis) e `professional_availability` (dia comum, almoço,
  virada de dia em UTC com `24:00`, folga de dia inteiro, bloqueio parcial, extra em dia sem regra,
  bloqueio por cima de extra, extra encostado, recorte da janela, Manaus, New York em 2026-03-08 e
  2026-11-01, hora inexistente, outra empresa, inativo, limite de 62 dias, sessão em outro fuso).
- Prova de detecção: com a exclusion removida e a política de inserção de exceção trocada por só
  `appointments.write`, 9 asserções falharam; `db:reset` restaurou o banco.
- Verificação: `npm run db:test` 2100 PASS (16 arquivos), `npx supabase db lint` sem erros,
  `npm run test:integration` 8 passed, `typecheck`, `lint`, `format:check` e `build` verdes.
- **Vitest intermitente com o paralelismo padrão:** no `npm run check`, 2 a 9 testes de tela falham por
  tempo (o primeiro `findBy` de cada arquivo, com rota `lazy`, passa de 1 s com 6 CPUs e o Supabase no
  Docker); os arquivos que falham mudam a cada execução e passam isolados. Com `npx vitest run
--maxWorkers=2`: 609 passed. Nenhum arquivo de `src/` mudou nesta sprint até aqui; registrado como
  pendência para o usuário decidir (aumentar o tempo dos `findBy` iniciais ou limitar workers exige
  mudar testes ou configuração).
- Commit `ae4a5c0` **sem push**: o push exige `npm run check` verde (decisão do usuário em 2026-10-25:
  "push só com check 100% verde"); vai junto com o passo 3.

### Passo 3 — Seed, schemas e fuso (2026-10-25)

- **Intermitência do Vitest resolvida** (decisão do usuário: ajustar os testes, sem configuração):
  `FIRST_RENDER_WAIT` (4 s, abaixo dos 5 s do teste) em `src/app/testing/render-app.tsx`, usado só na
  primeira espera de cada um dos 9 arquivos de tela; as falhas eram sempre o primeiro teste do arquivo,
  que paga o carregamento das rotas `lazy`. Três `npm run check` seguidos verdes (609 passed) antes das
  mudanças do passo; commit próprio.
- **Seed** (`supabase/seed.sql`, ids `5eed0000-…-0007-…` e `-0008-…`): Studio Ana em
  `America/Sao_Paulo` e Clinica Bela em `America/Manaus`; 21 regras — profissional 01 de segunda a
  sexta 09:00–12:00 e 13:00–18:00 e sábado 09:00–13:00, profissional 02 de terça a sábado 10:00–19:00,
  profissional 03 (Manaus) de segunda a sexta 08:00–17:00, profissional 04 sem horário; 4 exceções em
  novembro de 2026 — folga na sexta 13/11, bloqueio 14:00–16:00 na quarta 18/11 e extra 13:00–17:00 no
  sábado 21/11 (profissional 01) e feriado na sexta 20/11 em Manaus (profissional 03).
  `seed_rls.test.sql` passa a cobrir regras e exceções no isolamento por empresa, conta 21/16/4/1 e o
  fuso de Manaus, e confere no cálculo a folga (13/11 vazio) e o extra emendado (21/11 09:00–17:00).
  Conferido pelo PostgREST local com o owner do Studio Ana: 3 exceções (só as dele) e o período
  `["2026-11-21 12:00:00+00","2026-11-21 20:00:00+00")`.
- **`src/shared/timezone.ts`** (só `Intl`, sem dependência): `zonedToUtc` (hora local → UTC, `24:00`
  como meia-noite do dia seguinte, hora inexistente e hora repetida resolvidas como o `at time zone` do
  Postgres: o candidato mais tardio), `utcToZoned`, `isValidTimeZone`, `isIsoDate`, `addDaysIso`,
  `daysBetweenIso` e `isoWeekday`. 34 testes nas datas do pgTAP (São Paulo, Manaus, Kathmandu, New York
  em 2026-03-08 e 2026-11-01, 02:30 inexistente, 01:30 repetida, `24:00`).
- **`src/shared/availability.ts`**: `weeklyRulesSchema` (hora `HH:MM` de 5 em 5, fim depois do início,
  sem sobreposição no dia com o erro no "Início" do intervalo que começa depois, até 70 intervalos; sai no
  formato de `p_rules`), `exceptionFormSchema` (tipo, dia inteiro, datas e horas locais, fim depois do
  início, até 366 dias de calendário, motivo até 120 caracteres ou `null`), `exceptionPeriodUtc` (devolve
  `null` quando a mudança de horário de verão deixa o fim antes do início), `toTstzRange` e
  `parseTstzRange` (formato do PostgREST). 50 testes.
- Verificação: `npm run check` 693 passed (41 arquivos, 8 ignorados), `npm run db:test` 2102 PASS,
  `npx supabase db lint` sem erros, `npm run test:integration` 8 passed.
