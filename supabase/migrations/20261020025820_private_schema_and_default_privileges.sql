-- Sprint 1.2, passo 2: schema private e privilégios padrão negados (ADR-003, ADR-008).

-- Schema das funções auxiliares de autorização. Fica fora de [api] schemas no config.toml,
-- então não é exposto pelo PostgREST. USAGE é concedido de forma explícita no passo 4.
create schema if not exists private;
revoke all on schema private from public;

-- Por padrão o Supabase concede todos os privilégios a anon e authenticated em toda tabela,
-- sequência e função que o postgres cria em public. Aqui isso deixa de valer: cada objeto novo
-- precisa de GRANT explícito, e a RLS continua sendo a barreira por linha.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

-- O Postgres concede EXECUTE a PUBLIC em toda função nova, em qualquer schema.
-- Funções passam a exigir GRANT EXECUTE explícito.
alter default privileges for role postgres
  revoke execute on functions from public;
