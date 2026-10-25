-- Passo 6: professionals, clients e appointments mínimos, FKs compostas e regra "próprio" do specialist
-- (ADR-003 §2, §4 e §9; RN-027, RN-028, RN-035 a RN-037).
-- Os casos saem de uma tabela: 2 empresas × 6 papéis × operações × alvos. Em cada empresa:
--   prof_dele (ligado à membership do specialist), prof_outro e prof_livre (sem ligação; o livre sem
--   agendamentos); cliente_com (agendamento com prof_dele), cliente_sem (agendamento só com prof_outro) e
--   cliente_nenhum (sem agendamento); agend_dele (cliente_com × prof_dele) e agend_outro
--   (cliente_sem × prof_outro).
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

-- Specialist de A sem profissional ligado e usuário sem vínculo: ficam fora da tabela de casos.
select tests.create_user('specialist-sem-profissional-A@example.test') as specialist_livre_a \gset
insert into public.memberships (tenant_id, user_id, role)
values ('00000000-0000-0000-0000-00000000000a', :'specialist_livre_a', 'specialist');
select tests.create_user('sem-vinculo@example.test') as outsider \gset

create temporary table targets (tenant text, tenant_id uuid, nome text, id uuid default gen_random_uuid());
insert into targets (tenant, tenant_id, nome)
select m.tenant, m.tenant_id, n.nome
from (select distinct tenant, tenant_id from members) m
cross join unnest(array[
  'prof_dele', 'prof_outro', 'prof_livre', 'cliente_com', 'cliente_sem', 'cliente_nenhum',
  'agend_dele', 'agend_outro'
]) n (nome);

insert into public.professionals (id, tenant_id, membership_id, display_name)
select g.id, g.tenant_id, case when g.nome = 'prof_dele' then ms.id end, format('%s %s', g.nome, g.tenant)
from targets g
join members m on m.tenant = g.tenant and m.role = 'specialist'
join public.memberships ms on ms.user_id = m.user_id
where g.nome like 'prof\_%';

insert into public.clients (id, tenant_id, full_name)
select id, tenant_id, format('%s %s', nome, tenant) from targets where nome like 'cliente\_%';

insert into public.appointments (id, tenant_id, client_id, professional_id)
select g.id, g.tenant_id, c.id, p.id
from targets g
join targets c on c.tenant = g.tenant
  and c.nome = case g.nome when 'agend_dele' then 'cliente_com' else 'cliente_sem' end
join targets p on p.tenant = g.tenant
  and p.nome = case g.nome when 'agend_dele' then 'prof_dele' else 'prof_outro' end
where g.nome like 'agend\_%';

-- Executa o comando como o usuário (anon quando nulo) e devolve as linhas afetadas, ou 'negado' em
-- permission denied. O comando é sempre desfeito (exceção LB001), então nenhum caso altera o estado dos
-- seguintes; o bloco com exception também desfaz o set_config local e a sessão volta para postgres.
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

-- Tabela de casos. %1$L = empresa do alvo, %2$L e %3$L = ids de alvo1 e alvo2 nessa empresa.
-- Resultado '1' = uma linha, '0' = nenhuma (RLS), 'negado' = sem GRANT ou WITH CHECK recusado.
create temporary table cases (
  op text, alvo_empresa text, alvo1 text, alvo2 text, permitidos public.member_role[], sim text, nao text,
  sql text
);
insert into cases (op, alvo_empresa, alvo1, alvo2, permitidos, sim, nao, sql) values
  -- professionals: todo membro lê; services.manage escreve (RN-035)
  ('professionals select', 'própria', 'prof_dele', null, '{owner,admin,manager,specialist,receptionist,financial}', '1', '0',
   'select 1 from public.professionals where id = %2$L'),
  ('professionals select', 'outra', 'prof_dele', null, '{}', '1', '0',
   'select 1 from public.professionals where id = %2$L'),
  ('professionals insert', 'própria', null, null, '{owner,admin,manager}', '1', 'negado',
   'insert into public.professionals (tenant_id, display_name) values (%1$L, ''Profissional novo'')'),
  ('professionals insert', 'outra', null, null, '{}', '1', 'negado',
   'insert into public.professionals (tenant_id, display_name) values (%1$L, ''Profissional novo'')'),
  ('professionals update', 'própria', 'prof_outro', null, '{owner,admin,manager}', '1', '0',
   'update public.professionals set membership_id = membership_id where id = %2$L'),
  ('professionals update', 'outra', 'prof_outro', null, '{}', '1', '0',
   'update public.professionals set membership_id = membership_id where id = %2$L'),
  ('professionals delete', 'própria', 'prof_livre', null, '{owner,admin,manager}', '1', '0',
   'delete from public.professionals where id = %2$L'),
  ('professionals delete', 'outra', 'prof_livre', null, '{}', '1', '0',
   'delete from public.professionals where id = %2$L'),
  -- clients: clients.read/write; specialist só com agendamento com ele (RN-028) e sem cadastro (RN-036)
  ('clients select', 'própria', 'cliente_com', null, '{owner,admin,manager,specialist,receptionist,financial}', '1', '0',
   'select 1 from public.clients where id = %2$L'),
  ('clients select', 'própria', 'cliente_sem', null, '{owner,admin,manager,receptionist,financial}', '1', '0',
   'select 1 from public.clients where id = %2$L'),
  ('clients select', 'própria', 'cliente_nenhum', null, '{owner,admin,manager,receptionist,financial}', '1', '0',
   'select 1 from public.clients where id = %2$L'),
  ('clients select', 'outra', 'cliente_com', null, '{}', '1', '0',
   'select 1 from public.clients where id = %2$L'),
  ('clients insert', 'própria', null, null, '{owner,admin,manager,receptionist}', '1', 'negado',
   'insert into public.clients (tenant_id, full_name) values (%1$L, ''Cliente novo'')'),
  ('clients insert', 'outra', null, null, '{}', '1', 'negado',
   'insert into public.clients (tenant_id, full_name) values (%1$L, ''Cliente novo'')'),
  ('clients update', 'própria', 'cliente_com', null, '{owner,admin,manager,specialist,receptionist}', '1', '0',
   'update public.clients set full_name = full_name where id = %2$L'),
  ('clients update', 'própria', 'cliente_sem', null, '{owner,admin,manager,receptionist}', '1', '0',
   'update public.clients set full_name = full_name where id = %2$L'),
  ('clients update', 'outra', 'cliente_com', null, '{}', '1', '0',
   'update public.clients set full_name = full_name where id = %2$L'),
  ('clients delete', 'própria', 'cliente_nenhum', null, '{}', 'negado', 'negado',
   'delete from public.clients where id = %2$L'),
  -- appointments: appointments.read/write; specialist só os do profissional dele (RN-027) e só para
  -- clientes que já vê (RN-036)
  ('appointments select', 'própria', 'agend_dele', null, '{owner,admin,manager,specialist,receptionist,financial}', '1', '0',
   'select 1 from public.appointments where id = %2$L'),
  ('appointments select', 'própria', 'agend_outro', null, '{owner,admin,manager,receptionist,financial}', '1', '0',
   'select 1 from public.appointments where id = %2$L'),
  ('appointments select', 'outra', 'agend_dele', null, '{}', '1', '0',
   'select 1 from public.appointments where id = %2$L'),
  ('appointments insert', 'própria', 'prof_dele', 'cliente_com', '{owner,admin,manager,specialist,receptionist}', '1', 'negado',
   'insert into public.appointments (tenant_id, professional_id, client_id) values (%1$L, %2$L, %3$L)'),
  ('appointments insert', 'própria', 'prof_dele', 'cliente_sem', '{owner,admin,manager,receptionist}', '1', 'negado',
   'insert into public.appointments (tenant_id, professional_id, client_id) values (%1$L, %2$L, %3$L)'),
  ('appointments insert', 'própria', 'prof_outro', 'cliente_com', '{owner,admin,manager,receptionist}', '1', 'negado',
   'insert into public.appointments (tenant_id, professional_id, client_id) values (%1$L, %2$L, %3$L)'),
  ('appointments insert', 'outra', 'prof_dele', 'cliente_com', '{}', '1', 'negado',
   'insert into public.appointments (tenant_id, professional_id, client_id) values (%1$L, %2$L, %3$L)'),
  ('appointments update', 'própria', 'agend_dele', null, '{owner,admin,manager,specialist,receptionist}', '1', '0',
   'update public.appointments set client_id = client_id where id = %2$L'),
  ('appointments update', 'própria', 'agend_outro', null, '{owner,admin,manager,receptionist}', '1', '0',
   'update public.appointments set client_id = client_id where id = %2$L'),
  ('appointments update', 'outra', 'agend_dele', null, '{}', '1', '0',
   'update public.appointments set client_id = client_id where id = %2$L'),
  ('appointments delete', 'própria', 'agend_dele', null, '{}', 'negado', 'negado',
   'delete from public.appointments where id = %2$L');

-- Cada caso roda para os 12 usuários, contra os alvos da mesma empresa ou da outra.
create temporary table runs as
select row_number() over (order by c.op, c.alvo_empresa, c.alvo1, c.alvo2, m.tenant, m.role) as n,
       m.user_id as executor,
       format(c.sql, e.tenant_id, a1.id, a2.id) as sql,
       case when m.role = any (c.permitidos) then c.sim else c.nao end as esperado,
       format('%s %s %s: %s de %s', c.op, c.alvo_empresa, concat_ws(' × ', c.alvo1, c.alvo2), m.role, m.tenant)
         as descricao
from cases c
cross join members m
join (select distinct tenant, tenant_id from members) e on e.tenant = case
    when c.alvo_empresa = 'própria' then m.tenant
    when m.tenant = 'A' then 'B'
    else 'A'
  end
left join targets a1 on a1.tenant = e.tenant and a1.nome = c.alvo1
left join targets a2 on a2.tenant = e.tenant and a2.nome = c.alvo2;

-- Ids usados nos blocos abaixo
select user_id as owner_a from members where tenant = 'A' and role = 'owner' \gset
select user_id as specialist_a from members where tenant = 'A' and role = 'specialist' \gset
select user_id as specialist_b from members where tenant = 'B' and role = 'specialist' \gset
select id as prof_dele_a from targets where tenant = 'A' and nome = 'prof_dele' \gset
select id as prof_outro_a from targets where tenant = 'A' and nome = 'prof_outro' \gset
select id as prof_dele_b from targets where tenant = 'B' and nome = 'prof_dele' \gset
select id as cliente_com_a from targets where tenant = 'A' and nome = 'cliente_com' \gset
select id as cliente_sem_a from targets where tenant = 'A' and nome = 'cliente_sem' \gset
select id as cliente_nenhum_a from targets where tenant = 'A' and nome = 'cliente_nenhum' \gset
select id as cliente_com_b from targets where tenant = 'B' and nome = 'cliente_com' \gset
select id as agend_dele_a from targets where tenant = 'A' and nome = 'agend_dele' \gset
select ms.id as membership_specialist_b from public.memberships ms where ms.user_id = :'specialist_b' \gset

select plan((select count(*)::int from runs) + 62);

-- Estrutura: RLS, chaves e FKs compostas
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
    where c.oid in ('public.professionals'::regclass, 'public.clients'::regclass, 'public.appointments'::regclass)),
  'RLS ligada em professionals, clients e appointments'
);
select col_is_unique('public', t, array['tenant_id', 'id'], format('%s: UNIQUE (tenant_id, id)', t))
from unnest(array['professionals', 'clients', 'appointments']) t;
select fk_ok('public', 'appointments', array['tenant_id', 'client_id'], 'public', 'clients', array['tenant_id', 'id'],
  'appointments (tenant_id, client_id) → clients (tenant_id, id)');
select fk_ok('public', 'appointments', array['tenant_id', 'professional_id'], 'public', 'professionals', array['tenant_id', 'id'],
  'appointments (tenant_id, professional_id) → professionals (tenant_id, id)');
select fk_ok('public', 'professionals', array['tenant_id', 'membership_id'], 'public', 'memberships', array['tenant_id', 'id'],
  'professionals (tenant_id, membership_id) → memberships (tenant_id, id)');

-- Estrutura: uma política por operação liberada, só para authenticated
select set_eq(
  $$select tablename::text, policyname::text, cmd, permissive, roles::text[]
    from pg_policies where schemaname = 'public' and tablename in ('professionals', 'clients', 'appointments')$$,
  $$values
    ('professionals', 'professionals_select_member', 'SELECT', 'PERMISSIVE', array['authenticated']),
    ('professionals', 'professionals_insert_manage', 'INSERT', 'PERMISSIVE', array['authenticated']),
    ('professionals', 'professionals_update_manage', 'UPDATE', 'PERMISSIVE', array['authenticated']),
    ('professionals', 'professionals_delete_manage', 'DELETE', 'PERMISSIVE', array['authenticated']),
    ('clients', 'clients_select_read', 'SELECT', 'PERMISSIVE', array['authenticated']),
    ('clients', 'clients_insert_write', 'INSERT', 'PERMISSIVE', array['authenticated']),
    ('clients', 'clients_update_write', 'UPDATE', 'PERMISSIVE', array['authenticated']),
    ('appointments', 'appointments_select_read', 'SELECT', 'PERMISSIVE', array['authenticated']),
    ('appointments', 'appointments_insert_write', 'INSERT', 'PERMISSIVE', array['authenticated']),
    ('appointments', 'appointments_update_write', 'UPDATE', 'PERMISSIVE', array['authenticated'])$$,
  'professionals, clients e appointments: uma política por operação, só para authenticated'
);

-- GRANT: anon sem nada; authenticated só o necessário, sem DELETE em clients e appointments (RN-037)
select table_privs_are('public', t, 'anon', array[]::text[], format('anon sem privilégios em %s', t))
from unnest(array['professionals', 'clients', 'appointments']) t;
select table_privs_are('public', 'professionals', 'authenticated', array['DELETE', 'SELECT'],
  'professionals: authenticated só SELECT e DELETE na tabela');
select table_privs_are('public', 'clients', 'authenticated', array['SELECT'], 'clients: authenticated só SELECT na tabela');
select table_privs_are('public', 'appointments', 'authenticated', array['SELECT'], 'appointments: authenticated só SELECT na tabela');
select set_eq(
  $$select table_name::text, column_name::text, privilege_type::text
    from information_schema.column_privileges
    where grantee = 'authenticated' and table_schema = 'public'
      and table_name in ('professionals', 'clients', 'appointments')
      and privilege_type in ('INSERT', 'UPDATE')$$,
  $$values
    ('professionals', 'tenant_id', 'INSERT'), ('professionals', 'membership_id', 'INSERT'),
    ('professionals', 'display_name', 'INSERT'), ('professionals', 'is_active', 'INSERT'),
    ('professionals', 'membership_id', 'UPDATE'), ('professionals', 'display_name', 'UPDATE'),
    ('professionals', 'is_active', 'UPDATE'),
    ('clients', 'tenant_id', 'INSERT'), ('clients', 'full_name', 'INSERT'), ('clients', 'full_name', 'UPDATE'),
    ('clients', 'phone', 'INSERT'), ('clients', 'email', 'INSERT'), ('clients', 'birth_date', 'INSERT'),
    ('clients', 'is_active', 'INSERT'), ('clients', 'phone', 'UPDATE'), ('clients', 'email', 'UPDATE'),
    ('clients', 'birth_date', 'UPDATE'), ('clients', 'is_active', 'UPDATE'),
    ('appointments', 'tenant_id', 'INSERT'), ('appointments', 'client_id', 'INSERT'),
    ('appointments', 'professional_id', 'INSERT'),
    ('appointments', 'client_id', 'UPDATE'), ('appointments', 'professional_id', 'UPDATE')$$,
  'INSERT e UPDATE de authenticated só nas colunas editáveis'
);

-- Estrutura das funções do recorte: security definer, STABLE, search_path vazio, EXECUTE só authenticated
select is_definer('private', f, a, format('%s é security definer', f))
from (values ('is_specialist', array['uuid']), ('is_own_professional', array['uuid', 'uuid']),
             ('specialist_can_see_client', array['uuid', 'uuid'])) v (f, a);
select volatility_is('private', f, a, 'stable', format('%s é STABLE', f))
from (values ('is_specialist', array['uuid']), ('is_own_professional', array['uuid', 'uuid']),
             ('specialist_can_see_client', array['uuid', 'uuid'])) v (f, a);
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
    where p.pronamespace = 'private'::regnamespace
      and p.proname in ('is_specialist', 'is_own_professional', 'specialist_can_see_client')
      and p.proconfig @> array['search_path=""']),
  array['is_own_professional', 'is_specialist', 'specialist_can_see_client'],
  'as 3 funções do recorte fixam search_path vazio'
);
select function_privs_are('private', f, a, 'authenticated', array['EXECUTE'], format('authenticated executa %s', f))
from (values ('is_specialist', array['uuid']), ('is_own_professional', array['uuid', 'uuid']),
             ('specialist_can_see_client', array['uuid', 'uuid'])) v (f, a);
select function_privs_are('private', f, a, 'anon', array[]::text[], format('anon não executa %s', f))
from (values ('is_specialist', array['uuid']), ('is_own_professional', array['uuid', 'uuid']),
             ('specialist_can_see_client', array['uuid', 'uuid'])) v (f, a);

-- Casos gerados
select is(pg_temp.try_as(r.executor, r.sql), r.esperado, r.descricao)
from (select * from runs order by n) r;

-- private.specialist_can_see_client: positivo e negativos (ADR-003 §9)
select tests.authenticate_as(:'specialist_a');
select ok(private.specialist_can_see_client('00000000-0000-0000-0000-00000000000a', :'cliente_com_a'),
  'specialist de A vê cliente com agendamento com ele');
select ok(not private.specialist_can_see_client('00000000-0000-0000-0000-00000000000a', :'cliente_sem_a'),
  'specialist de A não vê cliente com agendamento só com outro profissional');
select ok(not private.specialist_can_see_client('00000000-0000-0000-0000-00000000000a', :'cliente_nenhum_a'),
  'specialist de A não vê cliente sem agendamento');
select ok(not private.specialist_can_see_client('00000000-0000-0000-0000-00000000000b', :'cliente_com_b'),
  'specialist de A não vê cliente de B');
select tests.authenticate_as(:'owner_a');
select ok(not private.specialist_can_see_client('00000000-0000-0000-0000-00000000000a', :'cliente_com_a'),
  'specialist_can_see_client é false para quem não é specialist');
select tests.authenticate_as(:'specialist_livre_a');
select ok(not private.specialist_can_see_client('00000000-0000-0000-0000-00000000000a', :'cliente_com_a'),
  'specialist sem profissional ligado não vê cliente');
select tests.clear_authentication();

-- Listagem sem filtro: o recorte vale para a tabela inteira
select is(pg_temp.try_as(:'specialist_a', 'select 1 from public.clients'), '1', 'specialist de A lista só cliente_com');
select is(pg_temp.try_as(:'specialist_a', 'select 1 from public.appointments'), '1', 'specialist de A lista só o próprio agendamento');
select is(pg_temp.try_as(:'specialist_a', 'select 1 from public.professionals'), '3', 'specialist de A lista os 3 profissionais de A');
select is(pg_temp.try_as(:'owner_a', 'select 1 from public.clients'), '3', 'owner de A lista os 3 clientes de A');
select is(pg_temp.try_as(:'owner_a', 'select 1 from public.appointments'), '2', 'owner de A lista os 2 agendamentos de A');
select is(pg_temp.try_as(:'specialist_livre_a', 'select 1 from public.clients'), '0', 'specialist sem profissional não lista clientes');
select is(pg_temp.try_as(:'specialist_livre_a', 'select 1 from public.appointments'), '0', 'specialist sem profissional não lista agendamentos');
select is(pg_temp.try_as(:'outsider', 'select 1 from public.clients'), '0', 'usuário sem vínculo não lista clientes');
select is(pg_temp.try_as(:'outsider', 'select 1 from public.appointments'), '0', 'usuário sem vínculo não lista agendamentos');
select is(pg_temp.try_as(:'outsider', 'select 1 from public.professionals'), '0', 'usuário sem vínculo não lista profissionais');

-- O specialist não passa o próprio agendamento para outro profissional nem para cliente que não vê (RN-036)
select is(
  pg_temp.try_as(:'specialist_a', format('update public.appointments set professional_id = %L where id = %L', :'prof_outro_a', :'agend_dele_a')),
  'negado', 'specialist de A não passa o agendamento para outro profissional'
);
select is(
  pg_temp.try_as(:'specialist_a', format('update public.appointments set client_id = %L where id = %L', :'cliente_sem_a', :'agend_dele_a')),
  'negado', 'specialist de A não troca o cliente por um que não vê'
);

-- Desligar o profissional vale na hora (RN-024)
savepoint desliga;
update public.professionals set membership_id = null where id = :'prof_dele_a';
select is(pg_temp.try_as(:'specialist_a', 'select 1 from public.clients'), '0', 'specialist desligado do profissional deixa de ver clientes');
select is(pg_temp.try_as(:'specialist_a', 'select 1 from public.appointments'), '0', 'specialist desligado do profissional deixa de ver agendamentos');
rollback to savepoint desliga;

-- Remover a membership desliga o profissional, que continua existindo
savepoint remove;
delete from public.memberships where user_id = :'specialist_a';
select is(
  (select membership_id from public.professionals where id = :'prof_dele_a'), null,
  'remover a membership do specialist deixa o profissional sem ligação'
);
rollback to savepoint remove;

-- FKs compostas recusam vínculo entre empresas (ADR-003 §2), inclusive para quem ignora RLS
select throws_ok(
  format('insert into public.appointments (tenant_id, client_id, professional_id) values (%L, %L, %L)',
    '00000000-0000-0000-0000-00000000000a', :'cliente_com_b', :'prof_dele_a'),
  '23503', null, 'agendamento de A com cliente de B é recusado'
);
select throws_ok(
  format('insert into public.appointments (tenant_id, client_id, professional_id) values (%L, %L, %L)',
    '00000000-0000-0000-0000-00000000000a', :'cliente_com_a', :'prof_dele_b'),
  '23503', null, 'agendamento de A com profissional de B é recusado'
);
select throws_ok(
  format('insert into public.professionals (tenant_id, membership_id, display_name) values (%L, %L, %L)',
    '00000000-0000-0000-0000-00000000000a', :'membership_specialist_b', 'Profissional cruzado'),
  '23503', null, 'profissional de A ligado a membership de B é recusado'
);
select throws_ok(
  format('update public.appointments set client_id = %L where id = %L', :'cliente_com_b', :'agend_dele_a'),
  '23503', null, 'trocar o cliente de um agendamento de A por cliente de B é recusado'
);
select tests.authenticate_as(:'owner_a');
select throws_ok(
  format('insert into public.appointments (tenant_id, client_id, professional_id) values (%L, %L, %L)',
    '00000000-0000-0000-0000-00000000000a', :'cliente_com_b', :'prof_dele_a'),
  '23503', null, 'owner de A não agenda cliente de B: a FK composta recusa mesmo com a política liberando'
);
select tests.clear_authentication();

-- tenant_id é imutável nas três tabelas (ADR-003 §4)
select throws_ok(
  format($$update public.%I set tenant_id = '00000000-0000-0000-0000-00000000000b' where tenant_id = '00000000-0000-0000-0000-00000000000a'$$, t),
  '23514', null, format('%s: tenant_id não muda', t)
)
from unnest(array['professionals', 'clients', 'appointments']) t;

-- anon não lê nenhuma das três tabelas (ADR-003 §7)
select is(pg_temp.try_as(null, format('select 1 from public.%I', t)), 'negado', format('anon não lê %s', t))
from unnest(array['professionals', 'clients', 'appointments']) t;

-- Apagar a empresa remove profissionais, clientes e agendamentos dela pelo cascade
select lives_ok(
  $$delete from public.tenants where id = '00000000-0000-0000-0000-00000000000b'$$,
  'apagar a empresa B passa pelas FKs compostas'
);
select is(
  (select count(*) from public.professionals where tenant_id = '00000000-0000-0000-0000-00000000000b')
    + (select count(*) from public.clients where tenant_id = '00000000-0000-0000-0000-00000000000b')
    + (select count(*) from public.appointments where tenant_id = '00000000-0000-0000-0000-00000000000b'),
  0::bigint,
  'apagar a empresa B remove profissionais, clientes e agendamentos dela'
);

select * from finish();
rollback;
