# Regras de negócio

Regras extraídas apenas do que já está escrito no [plano da Fase 0](roadmap/fase-0-plano.md) e nas
[ADRs](decisions/). Cada regra cita a origem. Em caso de divergência, a origem prevalece.

- **Status `confirmada`:** a origem define a regra sem ambiguidade.
- **Status `a confirmar`:** a origem define a intenção, mas falta algum detalhe (indicado em "Dúvida").

Regra nova ou alterada deve ser registrada aqui com a origem.

## Agenda

### RN-001 — Sem sobreposição de horários do mesmo profissional

| Dado                                                       | Quando                                                      | Então                      |
| ---------------------------------------------------------- | ----------------------------------------------------------- | -------------------------- |
| Um profissional com agendamento em status ativo no período | Alguém grava outro agendamento ativo com período sobreposto | O banco rejeita a gravação |

- **Origem:** plano §7 (exclusion constraint), risco R2.
- **Status:** a confirmar.
- **Dúvida:** quais status contam como "ativos" no filtro da constraint.

### RN-002 — Reservas simultâneas no mesmo horário

| Dado             | Quando                                           | Então                                    |
| ---------------- | ------------------------------------------------ | ---------------------------------------- |
| Um horário livre | N reservas paralelas chegam para o mesmo horário | Exatamente 1 é gravada; as demais falham |

- **Origem:** plano §9 (teste de concorrência), risco R2.
- **Status:** confirmada.

### RN-003 — Intervalo do serviço entra no período

| Dado                                       | Quando                  | Então                                                                                |
| ------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------ |
| Um serviço com `buffer_minutes` preenchido | Um agendamento é criado | O período do agendamento inclui o buffer, para conflito e cálculo de disponibilidade |

- **Origem:** plano §5, ajuste 6; plano §7.
- **Status:** confirmada. O campo é opcional.

### RN-004 — Status do agendamento

| Dado           | Quando               | Então                                                                                      |
| -------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| Um agendamento | Seu status é gravado | O valor é um de `pending`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show` |

- **Origem:** plano §7.
- **Status:** a confirmar.
- **Dúvida:** transições permitidas entre status e status inicial de cada origem.

### RN-005 — Origem do agendamento

| Dado           | Quando                                      | Então                                           |
| -------------- | ------------------------------------------- | ----------------------------------------------- |
| Um agendamento | É criado pelo painel ou pelo portal público | A origem é registrada como `manual` ou `online` |

- **Origem:** plano §7.
- **Status:** confirmada.

### RN-006 — Agendamento ligado a uma unidade

| Dado           | Quando   | Então                             |
| -------------- | -------- | --------------------------------- |
| Um agendamento | É criado | Registra `location_id` da unidade |

- **Origem:** plano §5, ajuste 5.
- **Status:** confirmada. Várias unidades na interface ficam fora do MVP (plano §3).

## Portal público

### RN-007 — Cliente final sem login

| Dado                       | Quando                    | Então                             |
| -------------------------- | ------------------------- | --------------------------------- |
| Um cliente final no portal | Faz um agendamento online | Não precisa criar conta nem logar |

- **Origem:** decisão D9; ADR-007.
- **Status:** confirmada.

### RN-008 — Captcha na reserva online

| Dado                     | Quando              | Então                                                                        |
| ------------------------ | ------------------- | ---------------------------------------------------------------------------- |
| Um formulário de reserva | A reserva é enviada | O token Turnstile é validado no servidor antes de gravar; inválido não grava |

- **Origem:** ADR-007 §2.
- **Status:** confirmada.

### RN-009 — Limite de requisições no portal

| Dado                                     | Quando                                     | Então                   |
| ---------------------------------------- | ------------------------------------------ | ----------------------- |
| Um visitante identificado por hash do IP | Excede o limite do escopo dentro da janela | A requisição é recusada |

- **Origem:** ADR-007 §1 e §4.
- **Status:** a confirmar.
- **Dúvida:** valores dos limites e janelas (definidos na Sprint 3.2). O IP nunca é guardado em texto puro.

### RN-010 — Dados mínimos no acesso público

| Dado                   | Quando                        | Então                                                          |
| ---------------------- | ----------------------------- | -------------------------------------------------------------- |
| Um visitante sem login | Consulta dados de uma empresa | Recebe só os campos necessários, por funções/views específicas |

- **Origem:** ADR-003 §7; ADR-002 §3.
- **Status:** a confirmar.
- **Dúvida:** lista de campos expostos no portal.

## Empresa (tenant), plano e assinatura

### RN-011 — Período de teste

| Dado             | Quando             | Então                                |
| ---------------- | ------------------ | ------------------------------------ |
| Uma empresa nova | Conclui o cadastro | Entra em teste (`trial`) por 14 dias |

- **Origem:** decisão D10; plano §7.
- **Status:** a confirmar.
- **Dúvida:** o que acontece ao fim dos 14 dias sem assinatura.

### RN-012 — Status da empresa

| Dado        | Quando               | Então                                                                   |
| ----------- | -------------------- | ----------------------------------------------------------------------- |
| Uma empresa | Seu status é gravado | O valor é um de `trial`, `active`, `past_due`, `suspended`, `cancelled` |

- **Origem:** plano §7.
- **Status:** a confirmar.
- **Dúvida:** efeito de cada status no acesso ao painel e ao portal, e transições permitidas.

### RN-013 — Cobrança do piloto

| Dado                  | Quando         | Então                                                                 |
| --------------------- | -------------- | --------------------------------------------------------------------- |
| Uma empresa do piloto | Fecha contrato | A assinatura é registrada como `manual` no painel global, sem gateway |

- **Origem:** plano §3.
- **Status:** confirmada. Gateway decidido na Fase 5 (D6).

### RN-014 — Recursos liberados por plano

| Dado                    | Quando                    | Então                                                     |
| ----------------------- | ------------------------- | --------------------------------------------------------- |
| Uma empresa em um plano | Usa um recurso do sistema | Só acessa recursos liberados pelo plano e pelos overrides |

- **Origem:** plano §3; ADR-003 §8.
- **Status:** a confirmar.
- **Dúvida:** quais planos existem e o que cada um libera.

### RN-015 — Mudança de plano vale na hora

| Dado        | Quando                       | Então                                                  |
| ----------- | ---------------------------- | ------------------------------------------------------ |
| Uma empresa | Sua assinatura ou plano muda | Os recursos liberados refletem a mudança imediatamente |

- **Origem:** plano §5, ajuste 4; ADR-003 §8.
- **Status:** confirmada.

### RN-016 — Evento de cobrança duplicado

| Dado                                | Quando                           | Então                      |
| ----------------------------------- | -------------------------------- | -------------------------- |
| Um evento de cobrança já registrado | O mesmo `event_id` chega de novo | Não é processado outra vez |

- **Origem:** plano §7 (`billing_events.event_id` único); risco R9; ADR-002 §3.
- **Status:** confirmada.

## Branding e portal `/{slug}`

### RN-017 — Endereço único e reservado

| Dado                         | Quando                                                                      | Então                                   |
| ---------------------------- | --------------------------------------------------------------------------- | --------------------------------------- |
| Uma empresa escolhendo slug  | O slug tem só letras minúsculas `a-z`, números e hífen (ex.: `studio-ana1`) | É aceito                                |
| Uma empresa escolhendo slug  | O slug tem maiúscula, espaço, acento, `_`, `.` ou outro símbolo             | É recusado (formato)                    |
| Uma empresa escolhendo slug  | O slug começa ou termina com hífen                                          | É recusado (formato)                    |
| Uma empresa escolhendo slug  | O slug tem dois hífens seguidos (`ana--bela`)                               | É recusado (formato)                    |
| Uma empresa escolhendo slug  | O slug tem menos de 3 caracteres                                            | É recusado (curto demais)               |
| Uma empresa escolhendo slug  | O slug tem mais de 30 caracteres                                            | É recusado (longo demais)               |
| Uma empresa escolhendo slug  | O slug tem 3 ou 30 caracteres                                               | É aceito (limites inclusivos)           |
| Uma empresa escolhendo slug  | O slug está na lista de reservados                                          | É recusado (reservado)                  |
| Uma empresa escolhendo slug  | O slug só contém um reservado (`app-ana`, `minha-api`)                      | É aceito                                |
| Um slug já usado por empresa | Outra empresa escolhe o mesmo slug                                          | É recusado (único; verificado no banco) |

- **Reservados:** `app`, `admin`, `api`, `assets`, `auth`, `login`, `logout`, `signup`, `cadastro`,
  `entrar`, `sair`, `convite`, `onboarding`, `www`, `static`, `public`, `docs`, `help`, `ajuda`,
  `suporte`, `status`, `settings`, `conta`, `labbeautypro`. Rota nova do sistema entra nesta lista.
- **Normalização:** o validador não converte. Sugerir `studio-ana` a partir de "Studio Ana" é papel da
  interface.
- **Origem:** ADR-004 §1 e §2; plano §7. Tamanho, hífen e lista de reservados definidos pelo usuário em
  2026-10-19.
- **Status:** confirmada. A unicidade fica a cargo do banco (`tenants.slug` único, Sprint 1.2); o
  validador cobre formato, tamanho e reservados. O banco repete formato, tamanho e reservados em
  `CHECK` de `tenants` (migration `20261020031300_tenancy_tables.sql`); as duas listas precisam
  ficar iguais.

### RN-018 — Contraste mínimo do tema

| Dado                        | Quando                                              | Então                         |
| --------------------------- | --------------------------------------------------- | ----------------------------- |
| Uma empresa editando o tema | A cor de texto sobre `primary` fica abaixo de 4.5:1 | O valor é bloqueado com aviso |

- **Origem:** ADR-004 §4.
- **Status:** confirmada.

### RN-019 — Tipos de imagem aceitos

| Dado                        | Quando          | Então                                                 |
| --------------------------- | --------------- | ----------------------------------------------------- |
| Uma empresa enviando imagem | O arquivo chega | Só PNG, JPEG, WebP e AVIF são aceitos; SVG é recusado |

- **Origem:** ADR-004 §6; risco R6.
- **Status:** a confirmar.
- **Dúvida:** limite de tamanho por tipo.

## Papéis e acesso

### RN-020 — Matriz de permissões

| Dado                   | Quando         | Então                                                                                 |
| ---------------------- | -------------- | ------------------------------------------------------------------------------------- |
| Um membro com um papel | Tenta uma ação | Só executa o que a [matriz do plano §8](roadmap/fase-0-plano.md#8-permissões) permite |

- **Origem:** plano §8.
- **Status:** confirmada. Papéis: `owner`, `admin`, `manager`, `specialist`, `receptionist`, `financial`.

### RN-021 — Ninguém altera o próprio papel

| Dado      | Quando                      | Então           |
| --------- | --------------------------- | --------------- |
| Um membro | Tenta mudar o próprio papel | A ação é negada |

- **Origem:** plano §8; ADR-003 (testes obrigatórios).
- **Status:** confirmada.

### RN-022 — Só owner promove a owner

| Dado                | Quando                        | Então           |
| ------------------- | ----------------------------- | --------------- |
| Um membro não owner | Tenta promover alguém a owner | A ação é negada |

- **Origem:** plano §8.
- **Status:** confirmada.

### RN-023 — Sempre existe um owner

| Dado                           | Quando                                      | Então           |
| ------------------------------ | ------------------------------------------- | --------------- |
| Uma empresa com um único owner | Alguém tenta remover ou rebaixar esse owner | A ação é negada |

- **Origem:** plano §8.
- **Status:** confirmada.

### RN-024 — Revogação de papel vale na hora

| Dado                        | Quando                             | Então                                                |
| --------------------------- | ---------------------------------- | ---------------------------------------------------- |
| Um membro com sessão aberta | Seu papel ou membership é revogado | Perde o acesso imediatamente, sem esperar novo login |

- **Origem:** ADR-003 §3.
- **Status:** confirmada.

### RN-025 — Empresa ativa só entre as do usuário

| Dado                                      | Quando                  | Então                                           |
| ----------------------------------------- | ----------------------- | ----------------------------------------------- |
| Um usuário membro de uma ou mais empresas | Escolhe a empresa ativa | Só pode escolher empresas em que tem membership |

- **Origem:** ADR-003 §5.
- **Status:** confirmada.

### RN-026 — Convite com token protegido

| Dado                                            | Quando                      | Então                                            |
| ----------------------------------------------- | --------------------------- | ------------------------------------------------ |
| Um convite novo                                 | O token é gerado            | Só o hash do token é guardado                    |
| Um convite                                      | Passam 7 dias               | Expira e não pode mais ser aceito                |
| Um membro com `members.manage` (owner ou admin) | Cria um convite             | Pode convidar para qualquer papel, menos `owner` |
| Um membro que não é owner                       | Tenta convidar para `owner` | A ação é negada (RN-022)                         |

- **Origem:** plano §7 (`invitations`); decisão do usuário em 2026-10-23 (Sprint 1.3).
- **Status:** confirmada.

### RN-038 — Aceite do convite

| Dado                                | Quando                          | Então                                        |
| ----------------------------------- | ------------------------------- | -------------------------------------------- |
| Um convite válido e não usado       | Um usuário autenticado o aceita | A membership é criada com o papel do convite |
| Um convite aceito                   | Alguém tenta aceitá-lo de novo  | A ação é negada (uso único)                  |
| Um convite expirado ou revogado     | Alguém tenta aceitá-lo          | A ação é negada                              |
| Um convite para um e-mail           | Outro e-mail tenta aceitá-lo    | A ação é negada                              |
| Uma conta com e-mail não confirmado | Tenta aceitar o convite         | A ação é negada                              |

- **Origem:** proposta do plano da Sprint 1.3, derivada de RN-026 e ADR-003; confirmada pelo usuário em
  2026-10-23 (aprovação da Sprint 1.3): o e-mail da conta precisa ser igual ao convidado e confirmado.
- **Status:** confirmada.

### RN-039 — Não convidar quem já é membro

| Dado                                    | Quando                                | Então                                   |
| --------------------------------------- | ------------------------------------- | --------------------------------------- |
| Um e-mail que já é de membro da empresa | Alguém com `members.manage` o convida | O convite não é criado ("já é membro")  |
| Um e-mail de membro de outra empresa    | É convidado                           | O convite é criado normalmente          |
| Quem não tem `members.manage`           | Tenta convidar um e-mail de membro    | A ação é negada sem revelar se é membro |

- **Origem:** decisão do usuário em 2026-10-23 (aprovação da Sprint 1.3). Antes, só o aceite falhava.
- **Status:** confirmada.

## Specialist ("próprio")

### RN-027 — Specialist vê os próprios agendamentos

| Dado                                            | Quando                          | Então                                        |
| ----------------------------------------------- | ------------------------------- | -------------------------------------------- |
| Um membro `specialist` ligado a um profissional | Consulta ou altera agendamentos | Só acessa os agendamentos desse profissional |

- **Origem:** ADR-003 §9; plano §8.
- **Status:** confirmada.

### RN-028 — Specialist vê clientes atendidos por ele

| Dado                   | Quando            | Então                                                                                          |
| ---------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| Um membro `specialist` | Consulta clientes | Só vê clientes com ao menos um agendamento com ele, em qualquer status; os demais não aparecem |

- **Origem:** plano §5, ajuste 3; ADR-003 §9.
- **Status:** confirmada.

### RN-029 — Specialist vê só as próprias notas, comissões e relatórios

| Dado                   | Quando                                           | Então                  |
| ---------------------- | ------------------------------------------------ | ---------------------- |
| Um membro `specialist` | Consulta notas privadas, comissões ou relatórios | Só vê os ligados a ele |

- **Origem:** ADR-003 §9; plano §8.
- **Status:** a confirmar.
- **Dúvida:** se "nota ligada a ele" é a nota escrita por ele ou toda nota de cliente que ele pode ver.

### RN-036 — Specialist não amplia o próprio recorte

| Dado                   | Quando                                          | Então                                                                     |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| Um membro `specialist` | Tenta cadastrar um cliente novo                 | A ação é negada; o cadastro fica com quem tem `clients.write` sem recorte |
| Um membro `specialist` | Altera um cliente                               | Só consegue nos clientes que vê (RN-028)                                  |
| Um membro `specialist` | Cria ou altera um agendamento                   | Só para o profissional ligado a ele e para clientes que já vê             |
| Um membro `specialist` | Tenta passar o agendamento a outro profissional | A ação é negada                                                           |

- **Origem:** decisão do usuário em 2026-10-20 (Sprint 1.2, passo 6). Sem esta regra, agendar um
  cliente qualquer daria ao specialist acesso a ele (RN-028).
- **Status:** confirmada. O primeiro agendamento de um cliente com o specialist é feito pela recepção
  ou pela gestão.

## Serviços e profissionais

### RN-040 — Dados do serviço

| Dado        | Quando                                                         | Então                                              |
| ----------- | -------------------------------------------------------------- | -------------------------------------------------- |
| Um serviço  | A duração é gravada                                            | Fica entre 5 e 720 min, em passos de 5             |
| Um serviço  | O intervalo (`buffer_minutes`) é gravado                       | É vazio (sem intervalo) ou de 0 a 240 min, passo 5 |
| Um serviço  | O preço é gravado                                              | Em centavos, não negativo, com moeda (`BRL`)       |
| Uma empresa | Cadastra um serviço com o nome de outro (ignorando maiúsculas) | O cadastro é recusado (nome único na empresa)      |

- **Origem:** plano §5, ajuste 6; plano §7; RN-032; decisões do usuário em 2026-10-25 (Sprint 2.1).
  A moeda fica em `services.currency` (padrão `BRL`); a empresa não tem moeda própria.
- **Status:** confirmada. O uso do intervalo no período do agendamento é a RN-003 (Sprint 2.4).

### RN-041 — Serviços: membro lê, `services.manage` altera

| Dado      | Quando                                                          | Então                             |
| --------- | --------------------------------------------------------------- | --------------------------------- |
| Um membro | Consulta os serviços da empresa                                 | Vê todos                          |
| Um membro | Cria, altera ou exclui um serviço ou o vínculo com profissional | Só consegue com `services.manage` |

- **Origem:** plano §8 (`services.manage`); mesmo modelo da RN-035; decisão do usuário em 2026-10-25.
- **Status:** confirmada.

### RN-042 — Profissional e serviço inativos

| Dado                               | Quando                          | Então                                     |
| ---------------------------------- | ------------------------------- | ----------------------------------------- |
| Um profissional ou serviço inativo | Alguém consulta o cadastro      | Continua aparecendo, marcado como inativo |
| Um profissional ou serviço inativo | Um agendamento novo é oferecido | Não é oferecido (Sprints 2.3, 2.4 e 3.2)  |
| Um profissional com agendamento    | Alguém tenta excluí-lo          | O banco recusa; o caminho é desativar     |

- **Origem:** decisão do usuário em 2026-10-25 (Sprint 2.1).
- **Status:** confirmada.

### RN-043 — Profissional faz só serviços da própria empresa

| Dado                                       | Quando                                 | Então                                      |
| ------------------------------------------ | -------------------------------------- | ------------------------------------------ |
| Um profissional                            | É ligado a um serviço de outra empresa | O banco recusa (FK composta)               |
| Um profissional sem vínculo com um serviço | Esse serviço é agendado                | O profissional não é oferecido (2.3 e 3.2) |

- **Origem:** ADR-003 §2; decisão do usuário em 2026-10-25 (Sprint 2.1).
- **Status:** confirmada. Duração e preço são os do serviço, iguais para todos os profissionais.

### RN-044 — Candidatos ao vínculo de profissional

| Dado                            | Quando                              | Então                                                                               |
| ------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| Um membro com `services.manage` | Liga um profissional a um membro    | Vê nome e papel dos membros da empresa e a qual profissional cada um já está ligado |
| Um membro com `services.manage` | Escolhe o membro de um profissional | Só os membros sem profissional e o já ligado a ele podem ser escolhidos             |
| Um membro sem `services.manage` | Pede a lista de candidatos          | Não recebe nenhum nome                                                              |

- **Origem:** decisão do usuário em 2026-10-25 (Sprint 2.1). Exceção controlada à leitura só do
  próprio perfil: os nomes saem por função (`public.list_professional_link_candidates`), nunca pela
  tabela `profiles`. No passo 2 a função passou a devolver também o profissional ligado, para a tela
  mostrar o vínculo atual; ajuste confirmado pelo usuário em 2026-10-25.
- **Status:** confirmada.

## Clientes

### RN-045 — Dados do cliente

| Dado        | Quando                                     | Então                                                         |
| ----------- | ------------------------------------------ | ------------------------------------------------------------- |
| Um cliente  | O nome é gravado                           | É obrigatório, não branco, até 120 caracteres                 |
| Um cliente  | O telefone é gravado                       | É vazio ou em E.164 (`+5511987654321`)                        |
| Um cliente  | O e-mail é gravado                         | É vazio ou um e-mail em minúsculas, até 254 caracteres        |
| Um cliente  | A data de nascimento é gravada             | É vazia ou de 1900-01-01 até hoje (o "até hoje" é da tela)    |
| Uma empresa | Cadastra dois clientes com o mesmo contato | É aceito: telefone e e-mail podem se repetir na mesma empresa |

- **Origem:** plano §7 (`clients`); decisões do usuário em 2026-10-25 (Sprint 2.2): sem CPF, endereço
  ou gênero (minimização), telefone em E.164 com a tela aceitando o formato brasileiro, contatos não
  únicos (fusão de duplicados do portal decidida na Sprint 3.2).
- **Status:** confirmada.

### RN-046 — Cliente arquivado

| Dado                 | Quando                               | Então                                                 |
| -------------------- | ------------------------------------ | ----------------------------------------------------- |
| Um cliente           | Alguém com `clients.write` o arquiva | Não é excluído (RN-037); some da lista padrão         |
| Um cliente arquivado | Alguém marca "Mostrar arquivados"    | Aparece, marcado como arquivado, e pode ser reativado |
| Um cliente arquivado | Um agendamento novo é oferecido      | Não é oferecido (Sprints 2.4 e 3.2)                   |

- **Origem:** RN-037; decisão do usuário em 2026-10-25 (Sprint 2.2).
- **Status:** confirmada. O specialist pode arquivar os clientes que vê (RN-036); bloquear isso exige
  trigger e fica como possível ajuste.

### RN-047 — Busca de clientes

| Dado      | Quando                      | Então                                                         |
| --------- | --------------------------- | ------------------------------------------------------------- |
| Um membro | Busca por parte do nome     | Acha sem diferenciar acento e maiúsculas ("joao" acha "João") |
| Um membro | Busca por 3 ou mais dígitos | Acha também pelo telefone                                     |
| Um membro | Faz qualquer busca          | Só recebe clientes que já pode ver (recorte da RN-028)        |

- **Origem:** decisão do usuário em 2026-10-25 (Sprint 2.2): extensão `unaccent`, coluna de busca
  mantida por trigger e função `public.search_clients` com `security invoker`.
- **Status:** confirmada.

## Disponibilidade

### RN-048 — Fuso da empresa

| Dado        | Quando                             | Então                                                              |
| ----------- | ---------------------------------- | ------------------------------------------------------------------ |
| Uma empresa | É criada                           | Fica no fuso `America/Sao_Paulo`                                   |
| Uma empresa | Grava um fuso                      | É aceito só se for um nome IANA conhecido pelo banco               |
| Um horário  | É semanal ou de "dia inteiro"      | É interpretado no fuso da empresa; o banco guarda instantes em UTC |
| Uma empresa | Troca de fuso (tela na Sprint 2.5) | Só owner e admin (`tenant.settings`)                               |

- **Origem:** plano §7; RN-032; decisão 1 do usuário em 2026-10-25 (Sprint 2.3).
- **Status:** confirmada.

### RN-049 — Horário semanal do profissional

| Dado            | Quando                             | Então                                                        |
| --------------- | ---------------------------------- | ------------------------------------------------------------ |
| Um intervalo    | É gravado                          | Tem dia da semana, início antes do fim, no mesmo dia         |
| Um intervalo    | Tem hora fora de 5 em 5 minutos    | É recusado                                                   |
| Um intervalo    | Termina à meia-noite               | É gravado com fim `24:00`                                    |
| Dois intervalos | Se sobrepõem no mesmo dia e pessoa | São recusados; encostados (12:00–14:00 e 14:00–18:00) passam |
| Uma semana      | É salva e um intervalo é inválido  | Nada muda: a semana inteira é gravada ou nenhuma parte       |
| Um intervalo    | É alterado                         | Vale dali em diante; não há data de vigência                 |

- **Origem:** decisões 3 e 6 do usuário em 2026-10-25 (Sprint 2.3).
- **Status:** confirmada.

### RN-050 — Exceções de disponibilidade

| Dado                | Quando                   | Então                                                         |
| ------------------- | ------------------------ | ------------------------------------------------------------- |
| Uma exceção         | É gravada                | É de um profissional: bloqueio (não atende) ou horário extra  |
| Uma exceção         | É gravada                | Vai de 5 em 5 minutos, com fim depois do início, até 366 dias |
| Duas exceções       | Se sobrepõem             | São aceitas; no cálculo, bloqueio vence extra                 |
| Um feriado          | Vale para a empresa toda | Vira um bloqueio por profissional                             |
| O motivo da exceção | É preenchido             | Tem até 120 caracteres e não deve conter dado de saúde        |

- **Origem:** decisão 5 do usuário em 2026-10-25 (Sprint 2.3).
- **Status:** confirmada.

### RN-051 — Quem altera a disponibilidade

| Dado                          | Quem altera                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------- |
| Horário semanal               | `services.manage` (owner, admin, manager)                                        |
| Exceções                      | `services.manage` e `appointments.write` (receptionist; specialist só o próprio) |
| Leitura de horário e exceções | Todo membro da empresa; nada para `anon` (o portal lê por função na Sprint 3.2)  |

- **Origem:** plano §8; decisão 4 do usuário em 2026-10-25 (Sprint 2.3).
- **Status:** confirmada.

### RN-052 — Disponibilidade calculada

| Dado                    | Quando                       | Então                                                          |
| ----------------------- | ---------------------------- | -------------------------------------------------------------- |
| Um profissional ativo   | Tem a disponibilidade pedida | Recebe horário do dia + extras − bloqueios, no fuso da empresa |
| Um profissional inativo | Tem a disponibilidade pedida | Recebe vazio (RN-042)                                          |
| Um pedido               | Passa de 62 dias             | É recusado                                                     |

- **Origem:** decisão 7 do usuário em 2026-10-25 (Sprint 2.3). Agendamentos, duração e intervalo do
  serviço entram na Sprint 2.4 (RN-003).
- **Status:** confirmada.

## Administração global

### RN-030 — Admin global fora dos papéis da empresa

| Dado                | Quando                         | Então                                                             |
| ------------------- | ------------------------------ | ----------------------------------------------------------------- |
| Um `platform_admin` | Tenta ler dados de uma empresa | Não tem acesso direto; suporte só por função auditada e com prazo |

- **Origem:** plano §8; ADR-003 §6.
- **Status:** a confirmar.
- **Dúvida:** prazo do acesso de suporte e quem o autoriza (Fase 5).

### RN-034 — Equipe e saída da empresa com `members.manage`

| Dado      | Quando                             | Então                                                          |
| --------- | ---------------------------------- | -------------------------------------------------------------- |
| Um membro | Consulta as memberships da empresa | Vê só a própria, salvo se tiver `members.manage`               |
| Um membro | Tenta remover a própria membership | Só consegue com `members.manage` (owner único não sai, RN-023) |

- **Origem:** decisão do usuário em 2026-10-21 (Sprint 1.2, passo 5b).
- **Status:** confirmada.

### RN-035 — Profissionais: membro lê, `services.manage` altera

| Dado      | Quando                                                        | Então                             |
| --------- | ------------------------------------------------------------- | --------------------------------- |
| Um membro | Consulta os profissionais da empresa                          | Vê todos                          |
| Um membro | Cria, altera, liga a uma membership ou remove um profissional | Só consegue com `services.manage` |

- **Origem:** decisão do usuário em 2026-10-20 (Sprint 1.2, passo 6). A matriz do plano §8 não tem
  permissão própria para profissionais.
- **Status:** confirmada. Uma membership atende como no máximo um profissional; se a membership sai, o
  profissional fica sem ligação.

### RN-037 — Clientes e agendamentos não são excluídos pelo app

| Dado      | Quando                                     | Então           |
| --------- | ------------------------------------------ | --------------- |
| Um membro | Tenta excluir um cliente ou um agendamento | A ação é negada |

- **Origem:** decisão do usuário em 2026-10-20 (Sprint 1.2, passo 6).
- **Status:** confirmada para a Sprint 1.2. Cancelamento vira status na Sprint 2. Remoção de cliente:
  o caminho é arquivar (RN-046), decisão do usuário em 2026-10-25 (Sprint 2.2); pedido de apagar os
  dados de um cliente fica para quando a LGPD for tratada.

## Financeiro e valores

### RN-031 — Agendado separado do recebido

| Dado                                  | Quando                 | Então                                               |
| ------------------------------------- | ---------------------- | --------------------------------------------------- |
| Agendamentos com valores e pagamentos | O financeiro é exibido | O valor agendado aparece separado do valor recebido |

- **Origem:** plano §1 (proposta de valor).
- **Status:** a confirmar.
- **Dúvida:** como a separação aparece em telas e relatórios (Fase 4).

### RN-032 — Dinheiro e horário

| Dado                   | Quando              | Então                                                                                 |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------------- |
| Um valor ou um horário | É gravado e exibido | Dinheiro em centavos com moeda; horário em UTC, exibido no fuso da empresa ou unidade |

- **Origem:** plano §2 (Localização); risco R3.
- **Status:** confirmada.

## IA

### RN-033 — Cota de IA por plano

| Dado                       | Quando                   | Então                           |
| -------------------------- | ------------------------ | ------------------------------- |
| Uma empresa com cota de IA | Atinge o limite do plano | O uso é cortado automaticamente |

- **Origem:** risco R7; plano §10 (Sprint 7.1).
- **Status:** a confirmar.
- **Dúvida:** valores da cota por plano e se a mesma regra vale para mensagens.
