-- Objetos novos não dão acesso a anon/authenticated sem GRANT explícito (ADR-008).
begin;
select plan(18);

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
select ok(
  has_table_privilege('service_role', 'public.probe_privileges', 'insert')
    and has_table_privilege('service_role', 'public.probe_privileges', 'update')
    and has_table_privilege('service_role', 'public.probe_privileges', 'delete'),
  'tabela nova em public: service_role mantém insert, update e delete'
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

-- service_role mantém os privilégios padrão (ADR-008 §3): a revogação atinge só anon e authenticated.
create sequence public.probe_seq;
select ok(
  has_sequence_privilege('service_role', 'public.probe_seq', 'usage, select, update'),
  'sequência nova em public: service_role mantém acesso'
);
select ok(
  not has_sequence_privilege('anon', 'public.probe_seq', 'usage, select, update')
    and not has_sequence_privilege('authenticated', 'public.probe_seq', 'usage, select, update'),
  'sequência nova em public: anon e authenticated sem privilégios'
);
select ok(
  has_function_privilege('service_role', 'public.probe_fn()', 'execute'),
  'função nova em public: service_role mantém EXECUTE'
);

-- O ALTER DEFAULT PRIVILEGES da migration é da role postgres (for role postgres), em public.
-- Grantees das regras padrão do postgres em public, por tipo de objeto.
select is(
  array(
    select distinct d.defaclobjtype::text || ':' || coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC')
    from pg_default_acl d, aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and d.defaclnamespace = 'public'::regnamespace
    order by 1
  ),
  array['f:postgres', 'f:service_role', 'r:postgres', 'r:service_role', 'S:postgres', 'S:service_role'],
  'padrões do postgres em public: só postgres e service_role'
);
select is(
  array(
    select distinct coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC')
    from pg_default_acl d, aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and d.defaclnamespace = 0
      and d.defaclobjtype = 'f'
    order by 1
  ),
  array['postgres'],
  'padrão global de funções do postgres: sem EXECUTE para PUBLIC'
);

select * from finish();
rollback;
