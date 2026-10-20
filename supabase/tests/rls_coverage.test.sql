-- Risco R1 (ADR-003): toda tabela de public precisa de RLS habilitada.
-- Lista os nomes para o erro mostrar exatamente quais tabelas faltam.
begin;
select plan(1);

select is(
  array(
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
    order by 1
  ),
  array[]::text[],
  'nenhuma tabela de public sem RLS'
);

select * from finish();
rollback;
