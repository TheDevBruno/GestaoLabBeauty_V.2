# Fase 0 — Plano aprovado

- **Status:** aprovado em 2026-10-19, com as decisões D1–D12 e os ajustes 1–7 abaixo.
- **Produto:** LabBeautyPro (nome técnico; validar comercialmente antes de registro de marca).
- **Repositório:** `TheDevBruno/GestaoLabBeauty_V.2` (privado). Push somente com autorização.

## 1. Visão do produto

Plataforma SaaS white-label para negócios de beleza: maquiadoras, salões, designers de cílios e
sobrancelhas, nail designers, clínicas de estética, barbearias, autônomos e redes com várias unidades.

Proposta de valor: gestão operacional (agenda sem conflitos, clientes, equipe), financeiro que separa
o agendado do recebido, e portal público com a marca da empresa e agendamento online.

Atores:

- **Operador SaaS** — painel global (`/admin`).
- **Empresa (tenant)** — cliente pagante.
- **Membros** — equipe da empresa, com papéis.
- **Cliente final** — usa apenas o portal público, sem login (decisão D9).

## 2. Requisitos não funcionais

| Tema            | Requisito                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Segurança       | Isolamento por tenant no banco (RLS + FKs compostas); MFA para administradores globais; segredos só no servidor   |
| Privacidade     | Minimização, retenção e exclusão definidas, auditoria, exportação. Sem declaração automática de conformidade LGPD |
| Desempenho      | p95 < 300 ms nas leituras do painel; portal com LCP < 2,5 s em 4G e CLS < 0,1                                     |
| Disponibilidade | Meta inicial 99,5%; backup diário em produção (PITR fora do escopo inicial, D5)                                   |
| Acessibilidade  | WCAG 2.2 AA: contraste 4.5:1, teclado, foco visível, alvos de 44 px                                               |
| Responsividade  | Mobile-first; 375, 768, 1024 e 1440 px                                                                            |
| Localização     | pt-BR; `timestamptz` em UTC exibido no fuso do tenant/unidade; dinheiro em centavos (`bigint`) + moeda            |
| Manutenção      | TypeScript estrito, schemas Zod compartilhados, migrations versionadas, ADRs                                      |

## 3. Escopo do MVP

Entra: autenticação, convites e papéis; onboarding; serviços, profissionais, clientes; agenda completa
(sem fila de espera); branding e portal `/{slug}` com agendamento online; financeiro básico (cobranças,
pagamentos manuais, despesas, comissões, relatórios principais); painel global com tenants, planos e
liberação de recursos por plano.

Fica fora: domínio próprio, cobrança recorrente integrada, WhatsApp e e-mail transacional (exceto o e-mail
de autenticação), campanhas, fidelidade, IA, várias unidades na interface, fila de espera.

Cobrança do piloto: contrato manual, registrado como assinatura `manual` no painel global. Nenhuma
integração de pagamento fictícia.

## 4. Decisões

| #   | Decisão                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------- |
| D1  | Nome: LabBeautyPro                                                                                   |
| D2  | Pasta: `C:\Users\LabFantasma_PC\Documents\LabFantasma-Dev\GestaoLabBeauty_V.2`                       |
| D3  | GitHub privado `TheDevBruno/GestaoLabBeauty_V.2`; nenhum push sem autorização                        |
| D4  | Portal público em `/{slug}`; subdomínio e domínio próprio na Fase 5                                  |
| D5  | Dev local com Docker; staging Supabase Free; produção Supabase Pro sem PITR inicialmente; Vercel Pro |
| D6  | Gateway de cobrança decidido na Fase 5 (Stripe, Asaas, Pagar.me), atrás de um adaptador              |
| D7  | E-mail via Resend ou SES; WhatsApp pela Cloud API oficial da Meta; decisão na Fase 6                 |
| D8  | Sentry no plano gratuito                                                                             |
| D9  | Cliente final sem login                                                                              |
| D10 | Período de teste de 14 dias                                                                          |
| D11 | npm, pacote único (sem monorepo)                                                                     |
| D12 | Claude (Anthropic) com tool use, na Fase 7                                                           |

## 5. Ajustes aprovados

1. **Jobs:** worker disparado por `pg_cron` + `pg_net` chamando `POST /api/jobs/run` com segredo, sem
   depender da frequência do Vercel Cron. Ver [ADR-006](../decisions/ADR-006-jobs-pg-cron-pg-net.md).
2. **Portal público:** rate limit com contador em tabela Postgres; captcha Cloudflare Turnstile. Ver
   [ADR-007](../decisions/ADR-007-protecao-portal-publico.md).
3. **Regra "próprio" do `specialist`:** enxerga clientes com ao menos um agendamento com ele. Coberta por
   teste pgTAP. Ver [ADR-003](../decisions/ADR-003-multi-tenancy-rls.md).
4. **`tenant_entitlements`:** view comum ou função, não materializada. Ver ADR-003.
5. **`location_id` em `appointments`** desde a Sprint 2.4.
6. **`buffer_minutes`** opcional no serviço, somado ao período do agendamento (afeta a exclusion
   constraint e o cálculo de disponibilidade).
7. Referência corrigida: o cliente final sem login é a decisão D9.

## 6. Arquitetura

Resumo em [ARCHITECTURE.md](../../ARCHITECTURE.md) e nas ADRs 002–007.

## 7. Modelo conceitual de dados

**Global (sem tenant):** `platform_admins`, `plans`, `plan_features`, `segments`, `feature_flags`,
`admin_audit_log`.

**Tenant e acesso:** `tenants` (slug único, segmento, status `trial|active|past_due|suspended|cancelled`,
timezone), `tenant_branding`, `tenant_domains`, `subscriptions`, `billing_events` (`event_id` único),
`tenant_entitlements` (view/função — ajuste 4), `memberships`, `invitations` (token com hash),
`roles_permissions`, `profiles`.

**Operação (`tenant_id NOT NULL`):** `locations`, `location_hours`, `professionals`, `service_categories`,
`services` (com `buffer_minutes` — ajuste 6), `professional_services`, `commission_rules`,
`availability_rules`, `availability_exceptions`, `clients`, `client_notes`, `client_consents`,
`appointments` (`location_id` — ajuste 5; `period tstzrange`; status
`pending|confirmed|in_progress|completed|cancelled|no_show`; origem `manual|online`),
`appointment_services`, `appointment_events`, `waitlist_entries`.

**Financeiro:** `charges`, `payments`, `expenses`, `expense_categories`, `commission_entries`,
`cash_movements`.

**Mensagens, IA, arquivos e auditoria:** `message_templates`, `message_outbox`, `message_deliveries`,
`jobs`, `ai_usage`, `ai_audit_log`, `media_assets`, `audit_log`, `public_rate_limits` (ajuste 2).

Garantias no banco:

- Anti-conflito: `EXCLUDE USING gist (professional_id WITH =, period WITH &&)` filtrado pelos status
  ativos (`btree_gist`). O período já inclui `buffer_minutes`.
- `UNIQUE (tenant_id, id)` em cada tabela e FKs compostas, impedindo vínculo entre tenants.

## 8. Permissões

Legenda: `✓` acesso; `próprio` só os próprios registros; `ler` só leitura; `–` sem acesso.

| Permissão                  | owner | admin | manager | specialist | receptionist | financial |
| -------------------------- | ----- | ----- | ------- | ---------- | ------------ | --------- |
| tenant.settings / branding | ✓     | ✓     | –       | –          | –            | –         |
| billing.manage             | ✓     | –     | –       | –          | –            | –         |
| members.manage             | ✓     | ✓     | –       | –          | –            | –         |
| services.manage            | ✓     | ✓     | ✓       | –          | –            | –         |
| appointments.read          | ✓     | ✓     | ✓       | próprio    | ✓            | ler       |
| appointments.write         | ✓     | ✓     | ✓       | próprio    | ✓            | –         |
| clients.read / write       | ✓     | ✓     | ✓       | próprio    | ✓            | ler       |
| clients.notes.private      | ✓     | ✓     | ✓       | próprio    | –            | –         |
| finance.read / write       | ✓     | ✓     | ler     | –          | –            | ✓         |
| commissions.read           | ✓     | ✓     | ✓       | próprio    | –            | ✓         |
| reports.read               | ✓     | ✓     | ✓       | próprio    | –            | ✓         |
| ai.use                     | ✓     | ✓     | ✓       | –          | –            | ✓         |

Regras: ninguém altera o próprio papel; só owner promove a owner; sempre ao menos um owner;
`platform_admin` fica fora dos papéis de tenant.

## 9. Plano de testes

| Camada       | Ferramenta                     | Cobertura                                                                                   |
| ------------ | ------------------------------ | ------------------------------------------------------------------------------------------- |
| Estático     | tsc, ESLint, Prettier, Vite    | Tipos, lint, formatação, build                                                              |
| Unitário     | Vitest                         | Schemas, disponibilidade, fórmulas, tema e contraste, comissões                             |
| Banco        | pgTAP (`supabase test db`)     | RLS por tabela e operação, testes negativos entre tenants, FKs, `anon`, regra do specialist |
| Concorrência | Vitest + Postgres local        | N reservas paralelas no mesmo horário: exatamente 1 vence                                   |
| API          | Vitest + Hono + Supabase local | Autorização, validação, idempotência, rate limit                                            |
| E2E          | Playwright + axe               | Fluxos críticos e acessibilidade                                                            |
| Cobrança     | Sandbox do gateway             | Ciclo de assinatura (Fase 5)                                                                |

Nenhum teste é declarado aprovado sem execução registrada. Dados de teste apenas sintéticos.

## 10. Roadmap

| Fase          | Sprints                                                                                                                                    | Depende de |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1 Fundação    | 1.1 repositório, tooling, CI, ADRs · 1.2 schema base, RLS, pgTAP · 1.3 auth, convites, guards · 1.4 design system e app shell              | 0          |
| 2 Núcleo      | 2.1 serviços (com `buffer_minutes`) e profissionais · 2.2 clientes · 2.3 disponibilidade · 2.4 agenda (com `location_id`) · 2.5 onboarding | 1          |
| 3 White-label | 3.1 branding e preview · 3.2 portal e agendamento online (rate limit, Turnstile) · 3.3 OG/SEO                                              | 2          |
| 4 Financeiro  | 4.1 cobranças e pagamentos · 4.2 despesas e caixa · 4.3 comissões · 4.4 relatórios                                                         | 2          |
| 5 Admin SaaS  | 5.1 painel global, MFA, auditoria · 5.2 planos e limites · 5.3 gateway e webhooks · 5.4 domínio próprio                                    | 1, 4       |
| 6 Integrações | 6.1 outbox e worker (pg_cron + pg_net) · 6.2 e-mail · 6.3 WhatsApp · 6.4 campanhas e fila de espera                                        | 5          |
| 7 IA          | 7.1 ferramentas e cota · 7.2 interface · 7.3 auditoria e avaliação                                                                         | 4, 5       |
| 8 Lançamento  | Revisão de segurança, E2E completo, observabilidade, backup testado, piloto                                                                | todas      |

Pontos de aprovação obrigatória: fim das Sprints 1.2, 1.3, 2.4, 3.2, 5.3, 5.4 e da Fase 8.

## 11. Riscos

| #   | Risco                           | Mitigação                                                        |
| --- | ------------------------------- | ---------------------------------------------------------------- |
| R1  | Vazamento entre tenants         | FKs compostas; teste que lista tabelas sem RLS; pgTAP negativo   |
| R2  | Agendamento duplo               | Exclusion constraint; teste de concorrência                      |
| R3  | Fuso horário e horário de verão | UTC no banco; testes com datas de borda                          |
| R4  | Service role exposta            | Só no servidor; lint bloqueia `src/` → `server/`; grep no bundle |
| R5  | Abuso do portal público         | Rate limit em Postgres + Turnstile                               |
| R6  | XSS por upload ou branding      | Sem SVG; validação de MIME; tokens validados por Zod             |
| R7  | Custo de IA e mensagens         | Cota por plano; corte automático                                 |
| R8  | Lock-in de provedores           | Postgres padrão; Hono portátil                                   |
| R9  | Webhook duplicado ou forjado    | Assinatura verificada; `event_id` único                          |
| R10 | Escopo grande para o piloto     | MVP restrito; flags por plano                                    |
| R11 | Caminho com acento e espaço     | Resolvido pela D2 (pasta sem acento nem espaço)                  |
| R12 | Questões jurídicas da LGPD      | Registro de controles; parecer jurídico antes do lançamento      |
