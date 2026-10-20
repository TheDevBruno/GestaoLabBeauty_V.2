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

| Dado            | Quando           | Então                         |
| --------------- | ---------------- | ----------------------------- |
| Um convite novo | O token é gerado | Só o hash do token é guardado |

- **Origem:** plano §7 (`invitations`).
- **Status:** a confirmar.
- **Dúvida:** prazo de expiração e quem pode convidar para cada papel.

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

## Administração global

### RN-030 — Admin global fora dos papéis da empresa

| Dado                | Quando                         | Então                                                             |
| ------------------- | ------------------------------ | ----------------------------------------------------------------- |
| Um `platform_admin` | Tenta ler dados de uma empresa | Não tem acesso direto; suporte só por função auditada e com prazo |

- **Origem:** plano §8; ADR-003 §6.
- **Status:** a confirmar.
- **Dúvida:** prazo do acesso de suporte e quem o autoriza (Fase 5).

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
