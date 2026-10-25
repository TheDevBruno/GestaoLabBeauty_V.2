-- Sprint 2.3, passo 2: fuso da empresa, availability_rules, availability_exceptions,
-- set_availability_rules e professional_availability (ADR-003, ADR-008; RN-048 a RN-052).
-- Os casos de RLS saem de uma tabela: 2 empresas × 6 papéis × operações × alvos. Em cada empresa:
--   prof_dele (ligado ao specialist) e prof_outro, com uma regra (segunda 09:00–10:00) e uma exceção
--   (bloqueio em 2026-12-01) cada. O cálculo usa profissionais próprios, criados mais abaixo.
begin;

insert into public.tenants (id, name, slug) values
  ('00000000-0000-0000-0000-00000000000a', 'Empresa A', 'empresa-a'),
  ('00000000-0000-0000-0000-00000000000b', 'Empresa B', 'empresa-b');

create temporary table members (tenant text, tenant_id uuid, role public.member_role, user_id uuid);
insert into members (tenant, tenant_id, role, user_id)
select t.tenant, t.tenant_id, r.role, tests.create_user(format('%s-%s@example.test', r.role, t.tenant))
from (values ('A', '00000000-0000-0000-0000-00000000000a'::uuid),
             ('B', '00000000-0000-0000-0000-00000000000b'::uuid)) t (tenant, tenant_id)
cross join unnest(enum_range(null::public.member_role)) r (role);

insert into public.memberships (tenant_id, user_id, role) select tenant_id, user_id, role from members;

create temporary table targets (tenant text, tenant_id uuid, nome text, id uuid default gen_random_uuid());
insert into targets (tenant, tenant_id, nome)
select m.tenant, m.tenant_id, n.nome
from (select distinct tenant, tenant_id from members) m
cross join unnest(array['prof_dele', 'prof_outro', 'regra_dele', 'regra_outro', 'exc_dele', 'exc_outro']) n (nome);

insert into public.professionals (id, tenant_id, membership_id, display_name)
select g.id, g.tenant_id, case when g.nome = 'prof_dele' then ms.id end, format('%s %s', g.nome, g.tenant)
from targets g
join members m on m.tenant = g.tenant and m.role = 'specialist'
join public.memberships ms on ms.user_id = m.user_id
where g.nome like 'prof\_%';

insert into public.availability_rules (id, tenant_id, professional_id, weekday, start_time, end_time)
select r.id, r.tenant_id, p.id, 1, '09:00', '10:00'
from targets r
join targets p on p.tenant = r.tenant and p.nome = replace(r.nome, 'regra_', 'prof_')
where r.nome like 'regra\_%';

insert into public.availability_exceptions (id, tenant_id, professional_id, kind, period)
select x.id, x.tenant_id, p.id, 'blocked', '[2026-12-01 12:00+00,2026-12-01 13:00+00)'
from targets x
join targets p on p.tenant = x.tenant and p.nome = replace(x.nome, 'exc_', 'prof_')
where x.nome like 'exc\_%';

select tests.create_user('sem-vinculo@example.test') as outsider \gset

-- Executa o comando como o usuário (anon quando nulo) e devolve as linhas afetadas, ou 'negado' em
-- permission denied. O comando é sempre desfeito (exceção LB001); mesmo padrão de clients.test.sql.
create function pg_temp.try_as(p_user_id uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v_rows bigint;
begin
  if p_user_id is null then
    perform tests.authenticate_as_anon();
  else
    perform tests.authenticate_as(p_user_id);
  end if;
  execute p_sql;
  get diagnostics v_rows = row_count;
  raise exception 'desfaz o comando do caso' using errcode = 'LB001';
exception
  when sqlstate 'LB001' then
    return v_rows::text;
  when insufficient_privilege then
    return 'negado';
end;
$$;

-- Executa o comando como o usuário e MANTÉM o efeito; devolve as linhas afetadas ou o SQLSTATE do erro
-- (o erro desfaz só o comando, inclusive a troca de role).
create function pg_temp.run_as(p_user_id uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v_rows bigint;
begin
  perform tests.authenticate_as(p_user_id);
  execute p_sql;
  get diagnostics v_rows = row_count;
  perform tests.clear_authentication();
  return v_rows::text;
exception
  when others then
    return sqlstate;
end;
$$;

-- Tabela de casos. %1$L = empresa do alvo, %2$L = id do alvo nessa empresa.
-- Resultado '1' = uma linha, '0' = nenhuma (RLS), 'negado' = sem GRANT, WITH CHECK recusado ou 42501.
create temporary table cases (
  op text, alvo_empresa text, alvo1 text, permitidos public.member_role[], sim text, nao text, sql text
);
insert into cases (op, alvo_empresa, alvo1, permitidos, sim, nao, sql) values
  -- regras: todo membro lê; services.manage escreve; o specialist não mexe nem no próprio (RN-051)
  ('select regra', 'própria', 'regra_outro', '{owner,admin,manager,specialist,receptionist,financial}', '1', '0',
   'select 1 from public.availability_rules where id = %2$L'),
  ('select regra', 'outra', 'regra_outro', '{}', '1', '0',
   'select 1 from public.availability_rules where id = %2$L'),
  ('insert regra', 'própria', 'prof_outro', '{owner,admin,manager}', '1', 'negado',
   'insert into public.availability_rules (tenant_id, professional_id, weekday, start_time, end_time) values (%1$L, %2$L, 3, ''09:00'', ''10:00'')'),
  ('insert regra', 'própria', 'prof_dele', '{owner,admin,manager}', '1', 'negado',
   'insert into public.availability_rules (tenant_id, professional_id, weekday, start_time, end_time) values (%1$L, %2$L, 3, ''09:00'', ''10:00'')'),
  ('insert regra', 'outra', 'prof_outro', '{}', '1', 'negado',
   'insert into public.availability_rules (tenant_id, professional_id, weekday, start_time, end_time) values (%1$L, %2$L, 3, ''09:00'', ''10:00'')'),
  ('update regra', 'própria', 'regra_dele', '{owner,admin,manager}', '1', '0',
   'update public.availability_rules set end_time = ''11:00'' where id = %2$L'),
  ('update regra', 'outra', 'regra_dele', '{}', '1', '0',
   'update public.availability_rules set end_time = ''11:00'' where id = %2$L'),
  ('delete regra', 'própria', 'regra_dele', '{owner,admin,manager}', '1', '0',
   'delete from public.availability_rules where id = %2$L'),
  ('delete regra', 'outra', 'regra_dele', '{}', '1', '0',
   'delete from public.availability_rules where id = %2$L'),
  ('update professional_id regra', 'própria', 'regra_dele', '{}', '1', 'negado',
   'update public.availability_rules set professional_id = professional_id where id = %2$L'),
  -- exceções: services.manage em qualquer profissional; appointments.write também, o specialist só no
  -- próprio (RN-051)
  ('select exceção', 'própria', 'exc_outro', '{owner,admin,manager,specialist,receptionist,financial}', '1', '0',
   'select 1 from public.availability_exceptions where id = %2$L'),
  ('select exceção', 'outra', 'exc_outro', '{}', '1', '0',
   'select 1 from public.availability_exceptions where id = %2$L'),
  ('insert exceção', 'própria', 'prof_outro', '{owner,admin,manager,receptionist}', '1', 'negado',
   'insert into public.availability_exceptions (tenant_id, professional_id, kind, period, reason) values (%1$L, %2$L, ''blocked'', ''[2026-12-02 12:00+00,2026-12-02 13:00+00)'', ''Folga'')'),
  ('insert exceção', 'própria', 'prof_dele', '{owner,admin,manager,specialist,receptionist}', '1', 'negado',
   'insert into public.availability_exceptions (tenant_id, professional_id, kind, period, reason) values (%1$L, %2$L, ''blocked'', ''[2026-12-02 12:00+00,2026-12-02 13:00+00)'', ''Folga'')'),
  ('insert exceção', 'outra', 'prof_dele', '{}', '1', 'negado',
   'insert into public.availability_exceptions (tenant_id, professional_id, kind, period, reason) values (%1$L, %2$L, ''blocked'', ''[2026-12-02 12:00+00,2026-12-02 13:00+00)'', ''Folga'')'),
  ('update exceção', 'própria', 'exc_outro', '{owner,admin,manager,receptionist}', '1', '0',
   'update public.availability_exceptions set kind = ''extra'', reason = ''Mutirão'' where id = %2$L'),
  ('update exceção', 'própria', 'exc_dele', '{owner,admin,manager,specialist,receptionist}', '1', '0',
   'update public.availability_exceptions set kind = ''extra'', reason = ''Mutirão'' where id = %2$L'),
  ('update exceção', 'outra', 'exc_dele', '{}', '1', '0',
   'update public.availability_exceptions set kind = ''extra'', reason = ''Mutirão'' where id = %2$L'),
  ('delete exceção', 'própria', 'exc_outro', '{owner,admin,manager,receptionist}', '1', '0',
   'delete from public.availability_exceptions where id = %2$L'),
  ('delete exceção', 'própria', 'exc_dele', '{owner,admin,manager,specialist,receptionist}', '1', '0',
   'delete from public.availability_exceptions where id = %2$L'),
  ('delete exceção', 'outra', 'exc_dele', '{}', '1', '0',
   'delete from public.availability_exceptions where id = %2$L'),
  ('update professional_id exceção', 'própria', 'exc_dele', '{}', '1', 'negado',
   'update public.availability_exceptions set professional_id = professional_id where id = %2$L'),
  -- fuso: membro lê; tenant.settings troca (RN-048)
  ('select timezone', 'própria', null, '{owner,admin,manager,specialist,receptionist,financial}', '1', '0',
   'select timezone from public.tenants where id = %1$L'),
  ('select timezone', 'outra', null, '{}', '1', '0',
   'select timezone from public.tenants where id = %1$L'),
  ('update timezone', 'própria', null, '{owner,admin}', '1', '0',
   'update public.tenants set timezone = ''America/Manaus'' where id = %1$L'),
  ('update timezone', 'outra', null, '{}', '1', '0',
   'update public.tenants set timezone = ''America/Manaus'' where id = %1$L'),
  -- funções
  ('set_availability_rules', 'própria', 'prof_outro', '{owner,admin,manager}', '1', 'negado',
   'select 1 from public.set_availability_rules(%1$L, %2$L, ''[{"weekday": 2, "start_time": "09:00", "end_time": "10:00"}]'')'),
  ('set_availability_rules', 'outra', 'prof_outro', '{}', '1', 'negado',
   'select 1 from public.set_availability_rules(%1$L, %2$L, ''[{"weekday": 2, "start_time": "09:00", "end_time": "10:00"}]'')'),
  ('professional_availability', 'própria', 'prof_dele', '{owner,admin,manager,specialist,receptionist,financial}', '1', '0',
   'select 1 from public.professional_availability(%1$L, %2$L, ''2026-11-02'', ''2026-11-02'')'),
  ('professional_availability', 'outra', 'prof_dele', '{}', '1', '0',
   'select 1 from public.professional_availability(%1$L, %2$L, ''2026-11-02'', ''2026-11-02'')');

-- Cada caso roda para os 12 usuários, contra os alvos da mesma empresa ou da outra.
create temporary table runs as
select row_number() over (order by c.op, c.alvo_empresa, c.alvo1, m.tenant, m.role) as n,
       m.user_id as executor,
       format(c.sql, e.tenant_id, a1.id) as sql,
       case when m.role = any (c.permitidos) then c.sim else c.nao end as esperado,
       format('%s %s %s: %s de %s', c.op, c.alvo_empresa, coalesce(c.alvo1, ''), m.role, m.tenant) as descricao
from cases c
cross join members m
join (select distinct tenant, tenant_id from members) e on e.tenant = case
    when c.alvo_empresa = 'própria' then m.tenant
    when m.tenant = 'A' then 'B'
    else 'A'
  end
left join targets a1 on a1.tenant = e.tenant and a1.nome = c.alvo1;

-- Ids usados nos blocos abaixo
select user_id as owner_a from members where tenant = 'A' and role = 'owner' \gset
select user_id as manager_a from members where tenant = 'A' and role = 'manager' \gset
select user_id as specialist_a from members where tenant = 'A' and role = 'specialist' \gset
select id as prof_dele_a from targets where tenant = 'A' and nome = 'prof_dele' \gset
select id as prof_outro_a from targets where tenant = 'A' and nome = 'prof_outro' \gset
select id as prof_outro_b from targets where tenant = 'B' and nome = 'prof_outro' \gset
select id as regra_outro_b from targets where tenant = 'B' and nome = 'regra_outro' \gset
select id as exc_outro_b from targets where tenant = 'B' and nome = 'exc_outro' \gset

select plan((select count(*)::int from runs) + 150);

-- Estrutura: fuso da empresa
select col_type_is('public', 'tenants', 'timezone', 'text', 'tenants.timezone é text');
select col_not_null('public', 'tenants', 'timezone', 'tenants.timezone é obrigatório');
select col_default_is('public', 'tenants', 'timezone', 'America/Sao_Paulo', 'tenants.timezone nasce America/Sao_Paulo');
select has_trigger('public', 'tenants', 'tenants_check_timezone', 'trigger de validação do fuso em tenants');
select has_extension('extensions', 'btree_gist', 'extensão btree_gist no schema extensions');

-- Estrutura: availability_rules
select has_table('public', 'availability_rules', 'availability_rules existe');
select col_type_is('public', 'availability_rules', c, t, format('availability_rules.%s é %s', c, t))
from (values ('id', 'uuid'), ('tenant_id', 'uuid'), ('professional_id', 'uuid'), ('weekday', 'smallint'),
             ('start_time', 'time without time zone'), ('end_time', 'time without time zone'),
             ('created_at', 'timestamp with time zone')) v (c, t);
select col_not_null('public', 'availability_rules', c, format('availability_rules.%s é obrigatório', c))
from unnest(array['id', 'tenant_id', 'professional_id', 'weekday', 'start_time', 'end_time', 'created_at']) c;
select col_is_pk('public', 'availability_rules', 'id', 'availability_rules.id é a PK');
select fk_ok('public', 'availability_rules', array['tenant_id', 'professional_id'],
             'public', 'professionals', array['tenant_id', 'id'], 'availability_rules → professionals pela FK composta');
select is(
  (select array_agg(conname::text order by conname) from pg_constraint
    where conrelid = 'public.availability_rules'::regclass and contype in ('c', 'x', 'u')),
  array['availability_rules_five_minutes', 'availability_rules_no_overlap', 'availability_rules_start_before_end',
        'availability_rules_tenant_id_id_key', 'availability_rules_weekday_range'],
  'availability_rules: CHECKs, exclusion e UNIQUE (tenant_id, id)'
);
select is((select contype::text from pg_constraint where conname = 'availability_rules_no_overlap'), 'x',
  'availability_rules_no_overlap é uma exclusion constraint');
select has_trigger('public', 'availability_rules', 'availability_rules_prevent_tenant_id_change',
  'trigger de tenant_id imutável em availability_rules');

-- Estrutura: availability_exceptions
select has_table('public', 'availability_exceptions', 'availability_exceptions existe');
select col_type_is('public', 'availability_exceptions', c, t, format('availability_exceptions.%s é %s', c, t))
from (values ('id', 'uuid'), ('tenant_id', 'uuid'), ('professional_id', 'uuid'), ('kind', 'text'),
             ('period', 'tstzrange'), ('reason', 'text'), ('created_at', 'timestamp with time zone')) v (c, t);
select col_not_null('public', 'availability_exceptions', c, format('availability_exceptions.%s é obrigatório', c))
from unnest(array['id', 'tenant_id', 'professional_id', 'kind', 'period', 'created_at']) c;
select col_is_null('public', 'availability_exceptions', 'reason', 'availability_exceptions.reason é opcional');
select col_is_pk('public', 'availability_exceptions', 'id', 'availability_exceptions.id é a PK');
select fk_ok('public', 'availability_exceptions', array['tenant_id', 'professional_id'],
             'public', 'professionals', array['tenant_id', 'id'], 'availability_exceptions → professionals pela FK composta');
select is(
  (select array_agg(conname::text order by conname) from pg_constraint
    where conrelid = 'public.availability_exceptions'::regclass and contype in ('c', 'x', 'u')),
  array['availability_exceptions_five_minutes', 'availability_exceptions_kind_check',
        'availability_exceptions_max_length', 'availability_exceptions_period_bounds',
        'availability_exceptions_reason_length', 'availability_exceptions_reason_not_blank',
        'availability_exceptions_tenant_id_id_key'],
  'availability_exceptions: CHECKs e UNIQUE (tenant_id, id), sem exclusion (sobreposição aceita)'
);
select has_index('public', 'availability_exceptions', 'availability_exceptions_period_idx',
  array['tenant_id', 'professional_id', 'period'], 'índice gist (tenant_id, professional_id, period)');
select is((select am.amname::text from pg_class c join pg_am am on am.oid = c.relam
            where c.oid = 'public.availability_exceptions_period_idx'::regclass), 'gist',
  'availability_exceptions_period_idx é gist');
select has_trigger('public', 'availability_exceptions', 'availability_exceptions_prevent_tenant_id_change',
  'trigger de tenant_id imutável em availability_exceptions');

-- Políticas: uma por operação, só para authenticated
select set_eq(
  $$select tablename::text, policyname::text, cmd from pg_policies
    where schemaname = 'public' and tablename in ('availability_rules', 'availability_exceptions')
      and roles = array['authenticated']::name[]$$,
  $$values ('availability_rules', 'availability_rules_select_member', 'SELECT'),
           ('availability_rules', 'availability_rules_insert_manage', 'INSERT'),
           ('availability_rules', 'availability_rules_update_manage', 'UPDATE'),
           ('availability_rules', 'availability_rules_delete_manage', 'DELETE'),
           ('availability_exceptions', 'availability_exceptions_select_member', 'SELECT'),
           ('availability_exceptions', 'availability_exceptions_insert_write', 'INSERT'),
           ('availability_exceptions', 'availability_exceptions_update_write', 'UPDATE'),
           ('availability_exceptions', 'availability_exceptions_delete_write', 'DELETE')$$,
  'regras e exceções: uma política por operação, só para authenticated'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public'
    and tablename in ('availability_rules', 'availability_exceptions')),
  8,
  'regras e exceções não têm outras políticas'
);

-- GRANT: anon sem nada; authenticated SELECT e DELETE na tabela, INSERT e UPDATE só em colunas
select table_privs_are('public', t, 'anon', array[]::text[], format('anon sem privilégios em %s', t))
from unnest(array['availability_rules', 'availability_exceptions']) t;
select table_privs_are('public', t, 'authenticated', array['SELECT', 'DELETE'],
  format('%s: authenticated só SELECT e DELETE na tabela', t))
from unnest(array['availability_rules', 'availability_exceptions']) t;
select set_eq(
  $$select table_name::text, column_name::text, privilege_type::text
    from information_schema.column_privileges
    where grantee = 'authenticated' and table_schema = 'public'
      and table_name in ('availability_rules', 'availability_exceptions')
      and privilege_type in ('INSERT', 'UPDATE')$$,
  $$values ('availability_rules', 'tenant_id', 'INSERT'), ('availability_rules', 'professional_id', 'INSERT'),
           ('availability_rules', 'weekday', 'INSERT'), ('availability_rules', 'start_time', 'INSERT'),
           ('availability_rules', 'end_time', 'INSERT'),
           ('availability_rules', 'weekday', 'UPDATE'), ('availability_rules', 'start_time', 'UPDATE'),
           ('availability_rules', 'end_time', 'UPDATE'),
           ('availability_exceptions', 'tenant_id', 'INSERT'), ('availability_exceptions', 'professional_id', 'INSERT'),
           ('availability_exceptions', 'kind', 'INSERT'), ('availability_exceptions', 'period', 'INSERT'),
           ('availability_exceptions', 'reason', 'INSERT'),
           ('availability_exceptions', 'kind', 'UPDATE'), ('availability_exceptions', 'period', 'UPDATE'),
           ('availability_exceptions', 'reason', 'UPDATE')$$,
  'INSERT e UPDATE de authenticated só nas colunas previstas (sem professional_id no UPDATE)'
);
select ok(has_column_privilege('authenticated', 'public.tenants', 'timezone', 'select'), 'tenants: SELECT em timezone');
select ok(has_column_privilege('authenticated', 'public.tenants', 'timezone', 'update'), 'tenants: UPDATE em timezone');
select ok(not has_column_privilege('anon', 'public.tenants', 'timezone', 'select'), 'tenants: anon sem SELECT em timezone');

-- Funções: security invoker, volatilidade, search_path vazio e EXECUTE só para authenticated
select isnt_definer('public', 'set_availability_rules', array['uuid', 'uuid', 'jsonb'],
  'set_availability_rules é security invoker');
select volatility_is('public', 'set_availability_rules', array['uuid', 'uuid', 'jsonb'], 'volatile',
  'set_availability_rules é VOLATILE');
select isnt_definer('public', 'professional_availability', array['uuid', 'uuid', 'date', 'date'],
  'professional_availability é security invoker');
select volatility_is('public', 'professional_availability', array['uuid', 'uuid', 'date', 'date'], 'stable',
  'professional_availability é STABLE');
select is(
  (select count(*)::int from pg_proc p
    where p.oid in ('public.set_availability_rules(uuid, uuid, jsonb)'::regprocedure,
                    'public.professional_availability(uuid, uuid, date, date)'::regprocedure,
                    'private.check_tenant_timezone()'::regprocedure)
      and p.proconfig @> array['search_path=""']),
  3,
  'set_availability_rules, professional_availability e check_tenant_timezone fixam search_path vazio'
);
select function_privs_are('public', f, a, 'authenticated', array['EXECUTE'], format('authenticated executa %s', f))
from (values ('set_availability_rules', array['uuid', 'uuid', 'jsonb']),
             ('professional_availability', array['uuid', 'uuid', 'date', 'date'])) v (f, a);
select function_privs_are('public', f, a, 'anon', array[]::text[], format('anon não executa %s', f))
from (values ('set_availability_rules', array['uuid', 'uuid', 'jsonb']),
             ('professional_availability', array['uuid', 'uuid', 'date', 'date'])) v (f, a);
select function_privs_are('private', 'check_tenant_timezone', array[]::text[], r, array[]::text[],
  format('%s não executa check_tenant_timezone', r))
from unnest(array['anon', 'authenticated']) r;

-- Casos gerados
select is(pg_temp.try_as(r.executor, r.sql), r.esperado, r.descricao)
from (select * from runs order by n) r;

-- anon e usuário sem vínculo
select is(pg_temp.try_as(null, 'select 1 from public.availability_rules'), 'negado', 'anon não lê regras');
select is(pg_temp.try_as(null, 'select 1 from public.availability_exceptions'), 'negado', 'anon não lê exceções');
select is(pg_temp.try_as(null, format('select 1 from public.professional_availability(%L, %L, %L, %L)',
  '00000000-0000-0000-0000-00000000000a', :'prof_dele_a', '2026-11-02', '2026-11-02')), 'negado',
  'anon não chama professional_availability');
select is(pg_temp.try_as(:'outsider', 'select 1 from public.availability_rules'), '0', 'sem vínculo não lê regras');
select is(pg_temp.try_as(:'outsider', format('select 1 from public.professional_availability(%L, %L, %L, %L)',
  '00000000-0000-0000-0000-00000000000a', :'prof_dele_a', '2026-11-02', '2026-11-02')), '0',
  'sem vínculo recebe disponibilidade vazia');

-- Fuso (RN-048), como postgres
select throws_ok(
  $$insert into public.tenants (name, slug, timezone) values ('Empresa X', 'empresa-x', 'Mars/Olympus')$$,
  '22023', null, 'empresa com fuso desconhecido é recusada'
);
select throws_ok(
  $$update public.tenants set timezone = 'GMT-3 ' where id = '00000000-0000-0000-0000-00000000000b'$$,
  '22023', null, 'troca para fuso desconhecido é recusada'
);
select lives_ok(
  $$insert into public.tenants (id, name, slug, timezone)
    values ('00000000-0000-0000-0000-00000000000c', 'Empresa C', 'empresa-c', 'America/New_York')$$,
  'empresa em America/New_York é aceita'
);
select lives_ok(
  $$update public.tenants set timezone = 'America/Manaus' where id = '00000000-0000-0000-0000-00000000000b'$$,
  'troca para America/Manaus é aceita'
);
select is((select timezone from public.tenants where id = '00000000-0000-0000-0000-00000000000a'),
  'America/Sao_Paulo', 'empresa sem fuso informado fica em America/Sao_Paulo');

-- CHECKs e exclusion das regras (RN-049), como postgres, no prof_outro de B
create function pg_temp.regra(p_prof uuid, p_weekday int, p_start text, p_end text)
returns text
language sql
as $$
  select format(
    'insert into public.availability_rules (tenant_id, professional_id, weekday, start_time, end_time) values (%L, %L, %s, %L, %L)',
    '00000000-0000-0000-0000-00000000000b', p_prof, p_weekday, p_start, p_end
  );
$$;
select throws_ok(pg_temp.regra(:'prof_outro_b', 0, '09:00', '10:00'), '23514', null, 'dia 0 é recusado');
select throws_ok(pg_temp.regra(:'prof_outro_b', 8, '09:00', '10:00'), '23514', null, 'dia 8 é recusado');
select throws_ok(pg_temp.regra(:'prof_outro_b', 2, '09:03', '10:00'), '23514', null, 'início 09:03 é recusado');
select throws_ok(pg_temp.regra(:'prof_outro_b', 2, '09:00', '10:00:30'), '23514', null, 'fim com segundos é recusado');
select throws_ok(pg_temp.regra(:'prof_outro_b', 2, '10:00', '10:00'), '23514', null, 'início igual ao fim é recusado');
select throws_ok(pg_temp.regra(:'prof_outro_b', 2, '18:00', '09:00'), '23514', null, 'início depois do fim é recusado');
select lives_ok(pg_temp.regra(:'prof_outro_b', 2, '20:00', '24:00'), 'fim 24:00 (até a meia-noite) é aceito');
select lives_ok(pg_temp.regra(:'prof_outro_b', 2, '09:00', '12:00'), 'manhã de terça é aceita');
select throws_ok(pg_temp.regra(:'prof_outro_b', 2, '11:55', '13:00'), '23P01', null, 'intervalo sobreposto é recusado');
select throws_ok(pg_temp.regra(:'prof_outro_b', 2, '08:00', '18:00'), '23P01', null, 'intervalo que cobre outro é recusado');
select lives_ok(pg_temp.regra(:'prof_outro_b', 2, '12:00', '14:00'), 'intervalo encostado é aceito');
select lives_ok(pg_temp.regra(:'prof_outro_b', 3, '09:00', '12:00'), 'mesmo horário em outro dia é aceito');
select lives_ok(
  format('insert into public.availability_rules (tenant_id, professional_id, weekday, start_time, end_time) select %L, id, 2, %L, %L from public.professionals where tenant_id = %L and id <> %L limit 1',
    '00000000-0000-0000-0000-00000000000b', '09:00', '12:00', '00000000-0000-0000-0000-00000000000b', :'prof_outro_b'),
  'mesmo horário em outro profissional é aceito'
);
select throws_ok(pg_temp.regra(:'prof_outro_a', 4, '09:00', '10:00'), '23503', null,
  'regra com profissional de outra empresa é recusada');
select throws_ok(
  format('update public.availability_rules set tenant_id = %L where id = %L', '00000000-0000-0000-0000-00000000000a', :'regra_outro_b'),
  '23514', null, 'tenant_id da regra é imutável'
);

-- CHECKs das exceções (RN-050), como postgres, no prof_outro de B
create function pg_temp.exc(p_kind text, p_period text, p_reason text default null)
returns text
language sql
as $$
  select format(
    'insert into public.availability_exceptions (tenant_id, professional_id, kind, period, reason) values (%L, (select id from public.professionals where tenant_id = %L and display_name = %L), %L, %L, %L)',
    '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'prof_outro B',
    p_kind, p_period, p_reason
  );
$$;
select throws_ok(pg_temp.exc('ferias', '[2026-12-03 12:00+00,2026-12-03 13:00+00)'), '23514', null, 'tipo desconhecido é recusado');
select throws_ok(pg_temp.exc('blocked', '[2026-12-03 12:00+00,2026-12-03 12:00+00)'), '23514', null, 'período vazio é recusado');
select throws_ok(pg_temp.exc('blocked', '[2026-12-03 12:00+00,)'), '23514', null, 'período sem fim é recusado');
select throws_ok(pg_temp.exc('blocked', '(,2026-12-03 12:00+00)'), '23514', null, 'período sem início é recusado');
select throws_ok(pg_temp.exc('blocked', '(2026-12-03 12:00+00,2026-12-03 13:00+00]'), '23514', null,
  'período fechado no fim é recusado');
select throws_ok(pg_temp.exc('blocked', '[2026-12-03 12:03+00,2026-12-03 13:00+00)'), '23514', null,
  'início fora de 5 em 5 minutos é recusado');
select throws_ok(pg_temp.exc('blocked', '[2026-12-03 12:00+00,2026-12-03 13:00:30+00)'), '23514', null,
  'fim com segundos é recusado');
select throws_ok(pg_temp.exc('blocked', '[2026-01-01 00:00+00,2027-01-02 00:05+00)'), '23514', null,
  'período maior que 366 dias é recusado');
select lives_ok(pg_temp.exc('blocked', '[2026-01-01 00:00+00,2027-01-02 00:00+00)'), 'período de 366 dias é aceito');
select throws_ok(pg_temp.exc('blocked', '[2026-12-03 12:00+00,2026-12-03 13:00+00)', '   '), '23514', null,
  'motivo em branco é recusado');
select throws_ok(pg_temp.exc('blocked', '[2026-12-03 12:00+00,2026-12-03 13:00+00)', repeat('m', 121)), '23514', null,
  'motivo com 121 caracteres é recusado');
select lives_ok(pg_temp.exc('blocked', '[2026-12-03 12:00+00,2026-12-03 13:00+00)', repeat('m', 120)),
  'motivo com 120 caracteres é aceito');
select lives_ok(pg_temp.exc('extra', '[2026-12-03 12:30+00,2026-12-03 14:00+00)'),
  'exceção sobreposta a outra é aceita');
-- O CHECK de 5 minutos não depende do TimeZone da sessão (fuso de +05:45)
set local timezone = 'Asia/Kathmandu';
select lives_ok(pg_temp.exc('extra', '[2026-12-04 10:00+05:45,2026-12-04 11:00+05:45)'),
  'exceção em hora cheia de Kathmandu (04:15 UTC) é aceita com a sessão em Kathmandu');
select throws_ok(pg_temp.exc('extra', '[2026-12-04 10:03+00,2026-12-04 11:00+00)'), '23514', null,
  '10:03 UTC é recusado com a sessão em Kathmandu');
set local timezone = 'UTC';
select throws_ok(
  format('insert into public.availability_exceptions (tenant_id, professional_id, kind, period) values (%L, %L, %L, %L)',
    '00000000-0000-0000-0000-00000000000b', :'prof_outro_a', 'blocked', '[2026-12-03 12:00+00,2026-12-03 13:00+00)'),
  '23503', null, 'exceção com profissional de outra empresa é recusada'
);
select throws_ok(
  format('update public.availability_exceptions set tenant_id = %L where id = %L', '00000000-0000-0000-0000-00000000000a', :'exc_outro_b'),
  '23514', null, 'tenant_id da exceção é imutável'
);

-- Excluir o profissional leva regras e exceções junto (cascade)
insert into public.professionals (id, tenant_id, display_name)
values ('c0000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-00000000000b', 'Profissional temporário');
insert into public.availability_rules (tenant_id, professional_id, weekday, start_time, end_time)
values ('00000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-0000000000ff', 5, '09:00', '10:00');
insert into public.availability_exceptions (tenant_id, professional_id, kind, period)
values ('00000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-0000000000ff', 'blocked',
        '[2026-12-03 12:00+00,2026-12-03 13:00+00)');
delete from public.professionals where id = 'c0000000-0000-0000-0000-0000000000ff';
select is(
  (select count(*)::int from public.availability_rules where professional_id = 'c0000000-0000-0000-0000-0000000000ff')
  + (select count(*)::int from public.availability_exceptions where professional_id = 'c0000000-0000-0000-0000-0000000000ff'),
  0, 'excluir o profissional apaga regras e exceções dele'
);

-- set_availability_rules (RN-049), mantendo o efeito, no prof_outro de A
create function pg_temp.semana(p_prof uuid, p_rules text)
returns text
language sql
as $$
  select format('select 1 from public.set_availability_rules(%L, %L, %L)',
    '00000000-0000-0000-0000-00000000000a', p_prof, p_rules);
$$;
create function pg_temp.regras_de(p_prof uuid)
returns int
language sql
as $$
  select count(*)::int from public.availability_rules where professional_id = p_prof;
$$;
select is(pg_temp.run_as(:'owner_a', pg_temp.semana(:'prof_outro_a',
  '[{"weekday": 1, "start_time": "09:00", "end_time": "12:00"}, {"weekday": 1, "start_time": "13:00", "end_time": "18:00"}, {"weekday": 6, "start_time": "09:00", "end_time": "13:00"}]')),
  '3', 'owner grava a semana e recebe as 3 regras');
select results_eq(
  format('select weekday::int, start_time::text, end_time::text from public.availability_rules where professional_id = %L order by 1, 2', :'prof_outro_a'),
  $$values (1, '09:00:00', '12:00:00'), (1, '13:00:00', '18:00:00'), (6, '09:00:00', '13:00:00')$$,
  'a semana gravada substitui a anterior'
);
select is(pg_temp.run_as(:'owner_a', pg_temp.semana(:'prof_outro_a',
  '[{"weekday": 2, "start_time": "09:00", "end_time": "12:00"}, {"weekday": 2, "start_time": "11:00", "end_time": "13:00"}]')),
  '23P01', 'semana com intervalos sobrepostos é recusada');
select is(pg_temp.regras_de(:'prof_outro_a'), 3, 'semana recusada não apaga a anterior');
select is(pg_temp.run_as(:'owner_a', pg_temp.semana(:'prof_outro_a',
  '[{"weekday": 8, "start_time": "09:00", "end_time": "12:00"}]')), '23514', 'dia inválido na semana é recusado');
select is(pg_temp.run_as(:'owner_a', pg_temp.semana(:'prof_outro_a',
  '[{"weekday": 2, "start_time": "25:00", "end_time": "26:00"}]')), '22008', 'hora inválida na semana é recusada');
select is(pg_temp.run_as(:'owner_a', pg_temp.semana(:'prof_outro_a',
  '[{"weekday": 2, "start_time": null, "end_time": "12:00"}]')), '23502', 'intervalo sem início é recusado');
select is(pg_temp.run_as(:'owner_a', pg_temp.semana(:'prof_outro_a', '{"weekday": 2}')), '22023',
  'objeto no lugar do array é recusado');
select is(pg_temp.run_as(:'owner_a', format('select 1 from public.set_availability_rules(%L, %L, null)',
  '00000000-0000-0000-0000-00000000000a', :'prof_outro_a')), '22023', 'p_rules nulo é recusado');
select is(pg_temp.run_as(:'owner_a', pg_temp.semana(:'prof_outro_a',
  (select jsonb_agg(jsonb_build_object('weekday', 1 + g % 7, 'start_time', '00:00', 'end_time', '00:05'))::text
     from generate_series(1, 71) g))),
  '22023', 'mais de 70 intervalos é recusado');
select is(pg_temp.regras_de(:'prof_outro_a'), 3, 'semanas recusadas não mudam nada');
select is(pg_temp.run_as(:'owner_a', pg_temp.semana('c0000000-0000-0000-0000-0000000000ee', '[]')), 'P0002',
  'profissional inexistente é recusado');
select is(pg_temp.run_as(:'owner_a', pg_temp.semana(:'prof_outro_b', '[]')), 'P0002',
  'profissional de outra empresa é recusado');
select is(pg_temp.run_as(:'specialist_a', pg_temp.semana(:'prof_dele_a', '[]')), '42501',
  'specialist não grava nem o próprio horário semanal');
select is(pg_temp.run_as(:'manager_a', pg_temp.semana(:'prof_outro_a',
  '[{"weekday": 2, "start_time": "10:00", "end_time": "19:00"}]')), '1', 'manager grava a semana');
select is(pg_temp.run_as(:'owner_a', pg_temp.semana(:'prof_outro_a', '[]')), '0', 'semana vazia apaga as regras');
select is(pg_temp.regras_de(:'prof_outro_a'), 0, 'profissional fica sem horário semanal');

-- professional_availability (RN-052). Empresa A em America/Sao_Paulo (UTC−3, sem horário de verão),
-- B em America/Manaus (UTC−4), C em America/New_York (com horário de verão).
insert into public.professionals (id, tenant_id, display_name) values
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Cálculo SP'),
  ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'Cálculo Manaus'),
  ('c0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000c', 'Cálculo NY'),
  ('c0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000c', 'Cálculo NY hora vazia');
insert into public.availability_rules (tenant_id, professional_id, weekday, start_time, end_time) values
  ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 1, '09:00', '12:00'),
  ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 1, '13:00', '18:00'),
  ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 2, '22:00', '24:00'),
  ('00000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000002', 1, '09:00', '12:00'),
  ('00000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-000000000003', 7, '00:00', '24:00'),
  ('00000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-000000000004', 7, '02:30', '03:00'),
  ('00000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-000000000004', 7, '09:00', '10:00');
insert into public.availability_exceptions (tenant_id, professional_id, kind, period) values
  -- folga de dia inteiro na segunda 09/11 (00:00 a 00:00 em São Paulo)
  ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'blocked',
   '[2026-11-09 03:00+00,2026-11-10 03:00+00)'),
  -- bloqueio 10:00–11:00 na segunda 16/11
  ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'blocked',
   '[2026-11-16 13:00+00,2026-11-16 14:00+00)'),
  -- extra 09:00–13:00 no sábado 07/11 (dia sem regra)
  ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'extra',
   '[2026-11-07 12:00+00,2026-11-07 16:00+00)'),
  -- extra 09:00–13:00 e bloqueio 10:00–11:00 no sábado 14/11
  ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'extra',
   '[2026-11-14 12:00+00,2026-11-14 16:00+00)'),
  ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'blocked',
   '[2026-11-14 13:00+00,2026-11-14 14:00+00)'),
  -- extra 18:00–19:00 encostado na tarde da segunda 23/11
  ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'extra',
   '[2026-11-23 21:00+00,2026-11-23 22:00+00)'),
  -- extra de domingo 29/11 20:00 a segunda 30/11 02:00
  ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'extra',
   '[2026-11-29 23:00+00,2026-11-30 05:00+00)');

create function pg_temp.disp(p_tenant text, p_prof text, p_from text, p_to text)
returns text
language sql
as $$
  select format('select period from public.professional_availability(%L, %L, %L, %L)', p_tenant, p_prof, p_from, p_to);
$$;
\set ta '00000000-0000-0000-0000-00000000000a'
\set tb '00000000-0000-0000-0000-00000000000b'
\set tc '00000000-0000-0000-0000-00000000000c'
\set sp 'c0000000-0000-0000-0000-000000000001'

select results_eq(pg_temp.disp(:'ta', :'sp', '2026-11-02', '2026-11-02'),
  $$values (tstzrange('2026-11-02 12:00+00', '2026-11-02 15:00+00')), (tstzrange('2026-11-02 16:00+00', '2026-11-02 21:00+00'))$$,
  'segunda comum: manhã e tarde com almoço, convertidas de São Paulo para UTC');
select results_eq(pg_temp.disp(:'ta', :'sp', '2026-11-03', '2026-11-03'),
  $$values (tstzrange('2026-11-04 01:00+00', '2026-11-04 03:00+00'))$$,
  'terça 22:00–24:00 vira o dia em UTC e termina à meia-noite local');
select is_empty(pg_temp.disp(:'ta', :'sp', '2026-11-04', '2026-11-04'), 'quarta sem regra não tem disponibilidade');
select is_empty(pg_temp.disp(:'ta', :'sp', '2026-11-09', '2026-11-09'), 'folga de dia inteiro zera a segunda');
select results_eq(pg_temp.disp(:'ta', :'sp', '2026-11-16', '2026-11-16'),
  $$values (tstzrange('2026-11-16 12:00+00', '2026-11-16 13:00+00')), (tstzrange('2026-11-16 14:00+00', '2026-11-16 15:00+00')),
           (tstzrange('2026-11-16 16:00+00', '2026-11-16 21:00+00'))$$,
  'bloqueio parcial corta a manhã');
select results_eq(pg_temp.disp(:'ta', :'sp', '2026-11-07', '2026-11-07'),
  $$values (tstzrange('2026-11-07 12:00+00', '2026-11-07 16:00+00'))$$,
  'extra em sábado sem regra');
select results_eq(pg_temp.disp(:'ta', :'sp', '2026-11-14', '2026-11-14'),
  $$values (tstzrange('2026-11-14 12:00+00', '2026-11-14 13:00+00')), (tstzrange('2026-11-14 14:00+00', '2026-11-14 16:00+00'))$$,
  'bloqueio vence extra');
select results_eq(pg_temp.disp(:'ta', :'sp', '2026-11-23', '2026-11-23'),
  $$values (tstzrange('2026-11-23 12:00+00', '2026-11-23 15:00+00')), (tstzrange('2026-11-23 16:00+00', '2026-11-23 22:00+00'))$$,
  'extra encostado na tarde vira um período só');
select results_eq(pg_temp.disp(:'ta', :'sp', '2026-11-29', '2026-11-29'),
  $$values (tstzrange('2026-11-29 23:00+00', '2026-11-30 03:00+00'))$$,
  'extra que passa da meia-noite é recortado ao dia pedido');
select results_eq(pg_temp.disp(:'ta', :'sp', '2026-11-02', '2026-11-03'),
  $$values (tstzrange('2026-11-02 12:00+00', '2026-11-02 15:00+00')), (tstzrange('2026-11-02 16:00+00', '2026-11-02 21:00+00')),
           (tstzrange('2026-11-04 01:00+00', '2026-11-04 03:00+00'))$$,
  'dois dias seguidos, em ordem');
select results_eq(pg_temp.disp(:'tb', 'c0000000-0000-0000-0000-000000000002', '2026-11-02', '2026-11-02'),
  $$values (tstzrange('2026-11-02 13:00+00', '2026-11-02 16:00+00'))$$,
  'Manaus (UTC−4): 09:00–12:00 vira 13:00–16:00 UTC');
select results_eq(pg_temp.disp(:'tc', 'c0000000-0000-0000-0000-000000000003', '2026-11-01', '2026-11-01'),
  $$values (tstzrange('2026-11-01 04:00+00', '2026-11-02 05:00+00'))$$,
  'New York na volta do horário de verão (01/11/2026): o dia inteiro tem 25 horas');
select results_eq(pg_temp.disp(:'tc', 'c0000000-0000-0000-0000-000000000003', '2026-03-08', '2026-03-08'),
  $$values (tstzrange('2026-03-08 05:00+00', '2026-03-09 04:00+00'))$$,
  'New York no início do horário de verão (08/03/2026): o dia inteiro tem 23 horas');
select results_eq(pg_temp.disp(:'tc', 'c0000000-0000-0000-0000-000000000004', '2026-03-08', '2026-03-08'),
  $$values (tstzrange('2026-03-08 13:00+00', '2026-03-08 14:00+00'))$$,
  'intervalo 02:30–03:00 na hora que não existe (08/03/2026) é descartado sem erro');
select results_eq(pg_temp.disp(:'tc', 'c0000000-0000-0000-0000-000000000004', '2026-03-15', '2026-03-15'),
  $$values (tstzrange('2026-03-15 06:30+00', '2026-03-15 07:00+00')), (tstzrange('2026-03-15 13:00+00', '2026-03-15 14:00+00'))$$,
  'no domingo seguinte o 02:30–03:00 volta (horário de verão, UTC−4)');
select is_empty(pg_temp.disp(:'tb', :'sp', '2026-11-02', '2026-11-02'), 'profissional pedido com outra empresa devolve vazio');
savepoint inativo;
update public.professionals set is_active = false where id = 'c0000000-0000-0000-0000-000000000001';
select is_empty(pg_temp.disp(:'ta', :'sp', '2026-11-07', '2026-11-07'), 'profissional inativo não tem disponibilidade (RN-042)');
rollback to savepoint inativo;
select lives_ok(pg_temp.disp(:'ta', :'sp', '2026-11-01', '2027-01-01'), '62 dias são aceitos');
select throws_ok(pg_temp.disp(:'ta', :'sp', '2026-11-01', '2027-01-02'), '22023', null, '63 dias são recusados');
select throws_ok(pg_temp.disp(:'ta', :'sp', '2026-11-03', '2026-11-02'), '22023', null, 'fim antes do início é recusado');
select throws_ok(format('select * from public.professional_availability(%L, %L, null, %L)', :'ta', :'sp', '2026-11-02'),
  '22023', null, 'data nula é recusada');
-- Mesmo resultado com outra sessão em outro fuso: o cálculo usa o fuso da empresa
set local timezone = 'Asia/Tokyo';
select results_eq(pg_temp.disp(:'ta', :'sp', '2026-11-02', '2026-11-02'),
  $$values (tstzrange('2026-11-02 12:00+00', '2026-11-02 15:00+00')), (tstzrange('2026-11-02 16:00+00', '2026-11-02 21:00+00'))$$,
  'sessão em Tóquio não muda o cálculo');
set local timezone = 'UTC';
-- Pela RLS: o specialist de A vê a disponibilidade de qualquer profissional de A
select is(pg_temp.try_as(:'specialist_a', pg_temp.disp(:'ta', :'sp', '2026-11-02', '2026-11-02')), '2',
  'specialist de A vê a disponibilidade de outro profissional de A');

select * from finish();
rollback;
