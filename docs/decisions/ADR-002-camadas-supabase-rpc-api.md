# ADR-002 — Divisão de camadas: Supabase direto, funções Postgres e API

- **Status:** aceita
- **Data:** 2026-10-19

## Contexto

Uma API intermediando todo acesso a dados duplica a autorização que a RLS já faz. Por outro lado,
algumas operações exigem segredos, chamadas externas ou regras que não cabem no navegador.

## Decisão

1. **CRUD simples do painel:** navegador → Supabase com o JWT do usuário. A RLS é a barreira.
2. **Comandos atômicos de negócio** (agendar, reagendar, cancelar, registrar pagamento): funções
   Postgres `security invoker`. `security definer` só com `search_path` fixo e validação explícita de
   identidade, argumentos e permissão.
3. **API Node (Hono, `server/`, servida em `/api/*` por Vercel Functions)** apenas para:
   - criação de tenant no onboarding;
   - convites (service role e e-mail);
   - portal público (leitura mínima, agendamento sem login, rate limit, Turnstile — ADR-007);
   - webhooks idempotentes de cobrança e mensageria;
   - IA (Fase 7);
   - domínio próprio (API da Vercel);
   - execução de jobs (`/api/jobs/run` — ADR-006).
4. **Validação:** schemas Zod em `src/shared/`, usados pelo formulário e pelo servidor. O banco mantém
   `CHECK`, `NOT NULL` e FKs como última defesa.
5. **Erros:** formato único `{ code, message, details? }`; nunca expor stack trace ou SQL.

## Alternativas consideradas

- **API para todas as operações:** mais código e uma segunda camada de autorização para manter.
- **Somente Supabase, sem API:** inviável para webhooks, segredos de terceiros e IA.

## Consequências

- `src/` nunca importa de `server/` (regra de lint `no-restricted-imports`).
- A service role existe somente em variáveis de ambiente do servidor.
