# ADR-006 — Jobs assíncronos com pg_cron + pg_net

- **Status:** aceita
- **Data:** 2026-10-19

## Contexto

Lembretes, envio de mensagens e manutenção precisam rodar em segundo plano. O Vercel Cron tem
frequência limitada e não deve ditar a cadência dos jobs (ajuste 1).

## Decisão

1. Tabela `jobs` (outbox) no Postgres: tipo, payload, `run_at`, status, tentativas, `locked_at`, erro.
2. `pg_cron` agenda uma chamada periódica que usa `pg_net` para fazer `POST /api/jobs/run`.
3. O endpoint exige um segredo compartilhado no cabeçalho (`Authorization: Bearer <JOBS_RUNNER_SECRET>`),
   comparado em tempo constante. O segredo fica no Supabase Vault e nas variáveis da Vercel.
4. O worker reserva lotes com `FOR UPDATE SKIP LOCKED`, processa com timeout e aplica backoff nas falhas.
   Cada handler é idempotente.
5. Sem serviço pago de fila. Se o volume justificar, avaliar `pgmq`.

## Consequências

- A cadência é controlada no banco e pode chegar a um minuto.
- Chamadas sem segredo válido retornam 401 e são registradas.
- Implementação na Sprint 6.1.
