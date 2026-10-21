-- Passo 5a: políticas de tenants e profiles (ADR-003 §3 e §4, plano §8).
-- Os testes saem de uma tabela de casos: 2 empresas × 6 papéis × 4 operações × alvos.
begin;

-- Cenário: um usuário de cada papel em cada empresa, todos com perfil.
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
insert into public.profiles (id, full_name) select user_id, format('Pessoa %s %s', role, tenant) from members;

select tests.create_user('sem-vinculo@example.test') as outsider \gset
select tests.create_user('platform@example.test') as platform_admin \gset
insert into public.profiles (id, full_name) values (:'outsider', 'Pessoa sem vínculo');
insert into public.platform_admins (user_id) values (:'platform_admin');

-- Executa o comando como o usuário e devolve as linhas afetadas, ou 'negado' em permission denied.
-- O bloco com exception desfaz o set_config local, então a sessão volta para postgres nos dois casos.
create function pg_temp.try_as(p_user_id uuid, p_sql text)
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
  when insufficient_privilege then
    return 'negado';
end;
$$;

-- Tabela de casos: para cada operação e alvo, os papéis que conseguem (resultado "sim") e o resultado
-- dos demais ("nao"). '1' = uma linha, '0' = nenhuma linha (RLS), 'negado' = sem GRANT.
create temporary table cases (
  tabela text, op text, alvo text, permitidos public.member_role[], sim text, nao text, sql text
);
insert into cases (tabela, op, alvo, permitidos, sim, nao, sql) values
  ('tenants', 'select', 'própria', '{owner,admin,manager,specialist,receptionist,financial}', '1', '0',
   'select 1 from public.tenants where id = %L'),
  ('tenants', 'select', 'outra', '{}', '1', '0', 'select 1 from public.tenants where id = %L'),
  ('tenants', 'update', 'própria', '{owner,admin}', '1', '0', 'update public.tenants set name = name where id = %L'),
  ('tenants', 'update', 'outra', '{}', '1', '0', 'update public.tenants set name = name where id = %L'),
  ('tenants', 'insert', 'própria', '{}', '1', 'negado',
   $$insert into public.tenants (id, name, slug) values (%L, 'Nova', 'nova-empresa')$$),
  ('tenants', 'insert', 'outra', '{}', '1', 'negado',
   $$insert into public.tenants (id, name, slug) values (%L, 'Nova', 'nova-empresa')$$),
  ('tenants', 'delete', 'própria', '{}', '1', 'negado', 'delete from public.tenants where id = %L'),
  ('tenants', 'delete', 'outra', '{}', '1', 'negado', 'delete from public.tenants where id = %L'),
  ('profiles', 'select', 'próprio', '{owner,admin,manager,specialist,receptionist,financial}', '1', '0',
   'select 1 from public.profiles where id = %L'),
  ('profiles', 'select', 'colega', '{}', '1', '0', 'select 1 from public.profiles where id = %L'),
  ('profiles', 'select', 'outra empresa', '{}', '1', '0', 'select 1 from public.profiles where id = %L'),
  ('profiles', 'update', 'próprio', '{owner,admin,manager,specialist,receptionist,financial}', '1', '0',
   'update public.profiles set full_name = full_name where id = %L'),
  ('profiles', 'update', 'colega', '{}', '1', '0', 'update public.profiles set full_name = full_name where id = %L'),
  ('profiles', 'update', 'outra empresa', '{}', '1', '0',
   'update public.profiles set full_name = full_name where id = %L'),
  ('profiles', 'insert', 'próprio', '{}', '1', 'negado', 'insert into public.profiles (id) values (%L)'),
  ('profiles', 'insert', 'colega', '{}', '1', 'negado', 'insert into public.profiles (id) values (%L)'),
  ('profiles', 'insert', 'outra empresa', '{}', '1', 'negado', 'insert into public.profiles (id) values (%L)'),
  ('profiles', 'delete', 'próprio', '{}', '1', 'negado', 'delete from public.profiles where id = %L'),
  ('profiles', 'delete', 'colega', '{}', '1', 'negado', 'delete from public.profiles where id = %L'),
  ('profiles', 'delete', 'outra empresa', '{}', '1', 'negado', 'delete from public.profiles where id = %L');

-- Cada caso roda para os 12 usuários. Alvos: a própria empresa e a outra; o próprio perfil, o de um
-- colega da mesma empresa e o de alguém da outra empresa.
create temporary table runs as
select row_number() over (order by c.tabela desc, c.op, c.alvo, m.tenant, m.role) as n,
       m.user_id,
       format(c.sql, case c.alvo
         when 'própria' then m.tenant_id
         when 'outra' then o.tenant_id
         when 'próprio' then m.user_id
         when 'colega' then colega.user_id
         when 'outra empresa' then o.user_id
       end) as sql,
       case when m.role = any (c.permitidos) then c.sim else c.nao end as esperado,
       format('%s %s %s: %s de %s', c.tabela, c.op, c.alvo, m.role, m.tenant) as descricao
from cases c
cross join members m
join members o on o.tenant <> m.tenant and o.role = m.role
join members colega on colega.tenant = m.tenant
  and colega.role = case when m.role = 'owner' then 'admin' else 'owner' end::public.member_role;

select plan((select count(*)::int from runs) + 11);

-- Estrutura: uma política por operação liberada, só para authenticated
select set_eq(
  $$select tablename::text, policyname::text, cmd, permissive, roles::text[]
    from pg_policies where schemaname = 'public' and tablename in ('tenants', 'profiles')$$,
  $$values
    ('tenants', 'tenants_select_member', 'SELECT', 'PERMISSIVE', array['authenticated']),
    ('tenants', 'tenants_update_settings', 'UPDATE', 'PERMISSIVE', array['authenticated']),
    ('profiles', 'profiles_select_own', 'SELECT', 'PERMISSIVE', array['authenticated']),
    ('profiles', 'profiles_update_own', 'UPDATE', 'PERMISSIVE', array['authenticated'])$$,
  'tenants e profiles: políticas de SELECT e UPDATE, só para authenticated'
);

-- Casos gerados
select is(pg_temp.try_as(r.user_id, r.sql), r.esperado, r.descricao)
from (select * from runs order by n) r;

-- Listagem sem filtro mostra só a própria empresa e o próprio perfil
select is(
  pg_temp.try_as(user_id, 'select 1 from public.tenants'), '1', 'receptionist de A lista só a própria empresa'
) from members where tenant = 'A' and role = 'receptionist';
select is(
  pg_temp.try_as(user_id, 'select 1 from public.profiles'), '1', 'owner de B lista só o próprio perfil'
) from members where tenant = 'B' and role = 'owner';

-- Usuário sem vínculo e admin da plataforma sem membership (ADR-003 §6)
select is(pg_temp.try_as(:'outsider', 'select 1 from public.tenants'), '0', 'usuário sem vínculo não vê empresas');
select is(pg_temp.try_as(:'outsider', 'select 1 from public.profiles'), '1', 'usuário sem vínculo vê o próprio perfil');
select is(
  pg_temp.try_as(:'platform_admin', 'select 1 from public.tenants'), '0',
  'admin da plataforma sem membership não vê empresas'
);
select is(
  pg_temp.try_as(:'platform_admin', $$update public.tenants set name = name$$), '0',
  'admin da plataforma sem membership não altera empresas'
);

-- Revogação vale na hora (RN-024)
delete from public.memberships m using members x
where m.user_id = x.user_id and x.tenant = 'A' and x.role = 'admin';
select is(
  pg_temp.try_as(user_id, format('update public.tenants set name = name where id = %L', tenant_id)), '0',
  'admin removido de A deixa de alterar A'
) from members where tenant = 'A' and role = 'admin';
select is(
  pg_temp.try_as(user_id, format('select 1 from public.tenants where id = %L', tenant_id)), '0',
  'admin removido de A deixa de ver A'
) from members where tenant = 'A' and role = 'admin';

-- Alteração de fato fica gravada para quem pode
select is(
  pg_temp.try_as(user_id, format($$update public.tenants set name = 'Empresa A2' where id = %L$$, tenant_id)), '1',
  'owner de A renomeia A'
) from members where tenant = 'A' and role = 'owner';

-- anon não chega à RLS
select tests.authenticate_as_anon();
select throws_ok('select 1 from public.profiles', '42501', null, 'anon recebe permission denied em profiles');
select tests.clear_authentication();

select * from finish();
rollback;
