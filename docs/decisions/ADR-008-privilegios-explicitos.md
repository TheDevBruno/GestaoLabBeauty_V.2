# ADR-008 — Privilégios explícitos no banco

- **Status:** aceita
- **Data:** 2026-10-20

## Contexto

O Supabase configura privilégios padrão (`ALTER DEFAULT PRIVILEGES`) que dão a `anon` e `authenticated`
todos os privilégios em toda tabela, sequência e função que o `postgres` cria no schema `public`. O
Postgres, por sua vez, concede `EXECUTE` a `PUBLIC` em toda função nova, em qualquer schema.

Com isso, a RLS fica sendo a única barreira. Uma tabela criada sem RLS, ou uma função `security definer`
esquecida, fica exposta pela API no mesmo instante (risco R1). A [ADR-003](ADR-003-multi-tenancy-rls.md)
exige que `anon` não leia tabelas diretamente.

## Decisão

1. A migration `20261020025820_private_schema_and_default_privileges.sql` revoga os privilégios padrão
   do `postgres` em `public` para `anon` e `authenticated` (tabelas, sequências e funções) e o
   `EXECUTE` padrão de `PUBLIC` em funções de qualquer schema.
2. Cada tabela nova recebe `GRANT` explícito só das operações que a matriz de permissões permite, na
   mesma migration que a cria. Cada função recebe `GRANT EXECUTE` explícito só para as roles que a
   chamam.
3. `service_role` mantém os privilégios padrão (uso exclusivo do servidor — ADR-002).
4. A RLS continua obrigatória em toda tabela de `public` (ADR-003). Os dois controles se somam:
   o `GRANT` define que operações a role pode tentar; a RLS define em que linhas.
5. Testes pgTAP (`supabase/tests/default_privileges.test.sql`) criam objetos sonda e verificam que
   nascem sem acesso para `anon`, `authenticated` e `PUBLIC`.

## Alternativas consideradas

- **Manter os padrões do Supabase e confiar só na RLS:** menos `GRANT` para escrever, mas um esquecimento
  vira vazamento imediato.
- **`auto_expose_new_tables = false` no `config.toml`:** vale só para o ambiente local; homologação e
  produção dependeriam de configuração manual no painel. A migration vale igual em todos os ambientes.

## Consequências

- Toda migration que cria tabela ou função precisa dos `GRANT` correspondentes; sem eles, a API responde
  `permission denied` (falha segura).
- Objetos criados por `supabase_admin` (extensões, schemas internos do Supabase) não são afetados.
