-- Objetos novos não dão acesso a anon/authenticated sem GRANT explícito (ADR-008).
begin;
select plan(12);

select has_schema('private', 'schema private existe');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon não usa o schema private');
select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated ainda não usa o schema private (concedido no passo 4)'
);

-- Objetos sonda, criados pelo postgres como faria uma migration.
create table public.probe_privileges (id int primary key);
create function public.probe_fn() returns int language sql as 'select 1';
create function private.probe_fn() returns int language sql as 'select 1';

select ok(
  not has_table_privilege('anon', 'public.probe_privileges', 'select, insert, update, delete'),
  'tabela nova em public: anon sem privilégios'
);
select ok(
  not has_table_privilege('authenticated', 'public.probe_privileges', 'select, insert, update, delete'),
  'tabela nova em public: authenticated sem privilégios'
);
select ok(
  has_table_privilege('service_role', 'public.probe_privileges', 'select'),
  'tabela nova em public: service_role mantém acesso'
);

select ok(not has_function_privilege('anon', 'public.probe_fn()', 'execute'), 'função nova em public: anon sem EXECUTE');
select ok(
  not has_function_privilege('authenticated', 'public.probe_fn()', 'execute'),
  'função nova em public: authenticated sem EXECUTE'
);
select is(
  (select count(*) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.probe_fn()'::regprocedure and a.grantee = 0),
  0::bigint,
  'função nova em public: PUBLIC sem EXECUTE'
);
select ok(not has_function_privilege('anon', 'private.probe_fn()', 'execute'), 'função nova em private: anon sem EXECUTE');
select ok(
  not has_function_privilege('authenticated', 'private.probe_fn()', 'execute'),
  'função nova em private: authenticated sem EXECUTE'
);
select is(
  (select count(*) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.probe_fn()'::regprocedure and a.grantee = 0),
  0::bigint,
  'função nova em private: PUBLIC sem EXECUTE'
);

select * from finish();
rollback;
