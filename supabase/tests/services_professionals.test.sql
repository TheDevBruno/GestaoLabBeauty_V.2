-- Sprint 2.1, passo 2: services, professional_services, colunas novas de professionals e
-- public.list_professional_link_candidates (ADR-003, ADR-008; RN-035, RN-040 a RN-044).
-- Os casos de RLS saem de uma tabela: 2 empresas × 6 papéis × operações × alvos. Em cada empresa:
--   prof_dele (ligado ao specialist, com agendamento) e prof_livre (sem ligação nem agendamento);
--   svc_ligado (feito por prof_dele) e svc_livre (sem vínculo).
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

-- Nome no perfil de cada membro, para conferir o que a função de candidatos devolve.
update public.profiles p set full_name = format('Pessoa %s %s', m.role, m.tenant)
from members m where p.id = m.user_id;

create temporary table targets (tenant text, tenant_id uuid, nome text, id uuid default gen_random_uuid());
insert into targets (tenant, tenant_id, nome)
select m.tenant, m.tenant_id, n.nome
from (select distinct tenant, tenant_id from members) m
cross join unnest(array['prof_dele', 'prof_livre', 'svc_ligado', 'svc_livre']) n (nome);

insert into public.professionals (id, tenant_id, membership_id, display_name)
select g.id, g.tenant_id, case when g.nome = 'prof_dele' then ms.id end, format('%s %s', g.nome, g.tenant)
from targets g
join members m on m.tenant = g.tenant and m.role = 'specialist'
join public.memberships ms on ms.user_id = m.user_id
where g.nome like 'prof\_%';

insert into public.services (id, tenant_id, name, duration_minutes, buffer_minutes, price_cents)
select id, tenant_id, format('%s %s', nome, tenant), 60, case when nome = 'svc_ligado' then 15 end, 12000
from targets where nome like 'svc\_%';

insert into public.professional_services (tenant_id, professional_id, service_id)
select p.tenant_id, p.id, s.id
from targets p join targets s on s.tenant = p.tenant and s.nome = 'svc_ligado'
where p.nome = 'prof_dele';

-- Um agendamento com prof_dele em cada empresa, para a exclusão do profissional ser recusada (RN-042).
insert into public.clients (tenant_id, full_name)
select distinct tenant_id, format('Cliente %s', tenant) from members;
insert into public.appointments (tenant_id, client_id, professional_id)
select p.tenant_id, c.id, p.id
from targets p join public.clients c on c.tenant_id = p.tenant_id
where p.nome = 'prof_dele';

select tests.create_user('sem-vinculo@example.test') as outsider \gset

-- Executa o comando como o usuário (anon quando nulo) e devolve as linhas afetadas, ou 'negado' em
-- permission denied. O comando é sempre desfeito (exceção LB001); mesmo padrão de rls_specialist.
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
  -- services: todo membro lê; services.manage escreve (RN-041)
  ('services select', 'própria', 'svc_ligado', null, '{owner,admin,manager,specialist,receptionist,financial}', '1', '0',
   'select 1 from public.services where id = %2$L'),
  ('services select', 'outra', 'svc_ligado', null, '{}', '1', '0',
   'select 1 from public.services where id = %2$L'),
  ('services insert', 'própria', null, null, '{owner,admin,manager}', '1', 'negado',
   'insert into public.services (tenant_id, name, duration_minutes, price_cents) values (%1$L, ''Serviço novo'', 30, 5000)'),
  ('services insert', 'outra', null, null, '{}', '1', 'negado',
   'insert into public.services (tenant_id, name, duration_minutes, price_cents) values (%1$L, ''Serviço novo'', 30, 5000)'),
  ('services update', 'própria', 'svc_ligado', null, '{owner,admin,manager}', '1', '0',
   'update public.services set price_cents = price_cents + 100 where id = %2$L'),
  ('services update', 'outra', 'svc_ligado', null, '{}', '1', '0',
   'update public.services set price_cents = price_cents + 100 where id = %2$L'),
  ('services delete', 'própria', 'svc_livre', null, '{owner,admin,manager}', '1', '0',
   'delete from public.services where id = %2$L'),
  ('services delete', 'outra', 'svc_livre', null, '{}', '1', '0',
   'delete from public.services where id = %2$L'),
  -- professional_services: mesmo modelo, sem UPDATE
  ('professional_services select', 'própria', 'prof_dele', 'svc_ligado', '{owner,admin,manager,specialist,receptionist,financial}', '1', '0',
   'select 1 from public.professional_services where professional_id = %2$L and service_id = %3$L'),
  ('professional_services select', 'outra', 'prof_dele', 'svc_ligado', '{}', '1', '0',
   'select 1 from public.professional_services where professional_id = %2$L and service_id = %3$L'),
  ('professional_services insert', 'própria', 'prof_livre', 'svc_livre', '{owner,admin,manager}', '1', 'negado',
   'insert into public.professional_services (tenant_id, professional_id, service_id) values (%1$L, %2$L, %3$L)'),
  ('professional_services insert', 'outra', 'prof_livre', 'svc_livre', '{}', '1', 'negado',
   'insert into public.professional_services (tenant_id, professional_id, service_id) values (%1$L, %2$L, %3$L)'),
  ('professional_services update', 'própria', 'prof_dele', 'svc_ligado', '{}', 'negado', 'negado',
   'update public.professional_services set service_id = service_id where professional_id = %2$L and service_id = %3$L'),
  ('professional_services delete', 'própria', 'prof_dele', 'svc_ligado', '{owner,admin,manager}', '1', '0',
   'delete from public.professional_services where professional_id = %2$L and service_id = %3$L'),
  ('professional_services delete', 'outra', 'prof_dele', 'svc_ligado', '{}', '1', '0',
   'delete from public.professional_services where professional_id = %2$L and service_id = %3$L'),
  -- professionals: colunas novas seguem a RN-035
  ('professionals update nome', 'própria', 'prof_livre', null, '{owner,admin,manager}', '1', '0',
   'update public.professionals set display_name = ''Nome novo'', is_active = false where id = %2$L'),
  ('professionals update nome', 'outra', 'prof_livre', null, '{}', '1', '0',
   'update public.professionals set display_name = ''Nome novo'', is_active = false where id = %2$L'),
  -- candidatos ao vínculo: 6 membros para quem tem services.manage, nenhum para os demais (RN-044)
  ('candidatos', 'própria', null, null, '{owner,admin,manager}', '6', '0',
   'select 1 from public.list_professional_link_candidates(%1$L)'),
  ('candidatos', 'outra', null, null, '{}', '6', '0',
   'select 1 from public.list_professional_link_candidates(%1$L)');

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
select id as prof_dele_a from targets where tenant = 'A' and nome = 'prof_dele' \gset
select id as prof_livre_a from targets where tenant = 'A' and nome = 'prof_livre' \gset
select id as prof_dele_b from targets where tenant = 'B' and nome = 'prof_dele' \gset
select id as svc_ligado_a from targets where tenant = 'A' and nome = 'svc_ligado' \gset
select id as svc_livre_a from targets where tenant = 'A' and nome = 'svc_livre' \gset
select id as svc_livre_b from targets where tenant = 'B' and nome = 'svc_livre' \gset

select plan((select count(*)::int from runs) + 65);

-- Estrutura: RLS, chaves e FKs compostas
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
    where c.oid in ('public.services'::regclass, 'public.professional_services'::regclass)),
  'RLS ligada em services e professional_services'
);
select col_is_unique('public', 'services', array['tenant_id', 'id'], 'services: UNIQUE (tenant_id, id)');
select col_is_pk('public', 'professional_services', array['tenant_id', 'professional_id', 'service_id'],
  'professional_services: PK (tenant_id, professional_id, service_id)');
select fk_ok('public', 'professional_services', array['tenant_id', 'professional_id'], 'public', 'professionals', array['tenant_id', 'id'],
  'professional_services (tenant_id, professional_id) → professionals (tenant_id, id)');
select fk_ok('public', 'professional_services', array['tenant_id', 'service_id'], 'public', 'services', array['tenant_id', 'id'],
  'professional_services (tenant_id, service_id) → services (tenant_id, id)');
select col_not_null('public', 'professionals', 'display_name', 'professionals.display_name é obrigatório');
select col_default_is('public', 'professionals', 'is_active', 'true', 'professionals.is_active nasce true');
select col_default_is('public', 'services', 'currency', 'BRL'::text, 'services.currency nasce BRL');
select col_is_null('public', 'services', 'buffer_minutes', 'services.buffer_minutes é opcional');

-- Estrutura: uma política por operação liberada, só para authenticated
select set_eq(
  $$select tablename::text, policyname::text, cmd, permissive, roles::text[]
    from pg_policies where schemaname = 'public' and tablename in ('services', 'professional_services')$$,
  $$values
    ('services', 'services_select_member', 'SELECT', 'PERMISSIVE', array['authenticated']),
    ('services', 'services_insert_manage', 'INSERT', 'PERMISSIVE', array['authenticated']),
    ('services', 'services_update_manage', 'UPDATE', 'PERMISSIVE', array['authenticated']),
    ('services', 'services_delete_manage', 'DELETE', 'PERMISSIVE', array['authenticated']),
    ('professional_services', 'professional_services_select_member', 'SELECT', 'PERMISSIVE', array['authenticated']),
    ('professional_services', 'professional_services_insert_manage', 'INSERT', 'PERMISSIVE', array['authenticated']),
    ('professional_services', 'professional_services_delete_manage', 'DELETE', 'PERMISSIVE', array['authenticated'])$$,
  'services e professional_services: uma política por operação, só para authenticated'
);

-- GRANT: anon sem nada; authenticated só SELECT e DELETE na tabela e colunas editáveis em INSERT/UPDATE
select table_privs_are('public', t, 'anon', array[]::text[], format('anon sem privilégios em %s', t))
from unnest(array['services', 'professional_services']) t;
select table_privs_are('public', t, 'authenticated', array['DELETE', 'SELECT'],
  format('%s: authenticated só SELECT e DELETE na tabela', t))
from unnest(array['services', 'professional_services']) t;
select set_eq(
  $$select table_name::text, column_name::text, privilege_type::text
    from information_schema.column_privileges
    where grantee = 'authenticated' and table_schema = 'public'
      and table_name in ('services', 'professional_services')
      and privilege_type in ('INSERT', 'UPDATE')$$,
  $$select 'services', c, p
    from unnest(array['name', 'description', 'duration_minutes', 'buffer_minutes', 'price_cents', 'currency',
                      'is_active']) c
    cross join unnest(array['INSERT', 'UPDATE']) p
    union all select 'services', 'tenant_id', 'INSERT'
    union all select 'professional_services', c, 'INSERT'
    from unnest(array['tenant_id', 'professional_id', 'service_id']) c$$,
  'INSERT e UPDATE de authenticated só nas colunas editáveis de services e professional_services'
);

-- Função de candidatos: security definer, STABLE, search_path vazio, EXECUTE só authenticated
select is_definer('public', 'list_professional_link_candidates', array['uuid'],
  'list_professional_link_candidates é security definer');
select volatility_is('public', 'list_professional_link_candidates', array['uuid'], 'stable',
  'list_professional_link_candidates é STABLE');
select ok(
  (select p.proconfig @> array['search_path=""'] from pg_proc p
    where p.oid = 'public.list_professional_link_candidates(uuid)'::regprocedure),
  'list_professional_link_candidates fixa search_path vazio'
);
select function_privs_are('public', 'list_professional_link_candidates', array['uuid'], 'authenticated',
  array['EXECUTE'], 'authenticated executa list_professional_link_candidates');
select function_privs_are('public', 'list_professional_link_candidates', array['uuid'], 'anon',
  array[]::text[], 'anon não executa list_professional_link_candidates');

-- Casos gerados
select is(pg_temp.try_as(r.executor, r.sql), r.esperado, r.descricao)
from (select * from runs order by n) r;

-- Conteúdo da função de candidatos: nome do perfil, papel e profissional ligado (RN-044)
select tests.authenticate_as(:'owner_a');
select set_eq(
  $$select full_name, role::text, professional_id from public.list_professional_link_candidates('00000000-0000-0000-0000-00000000000a')$$,
  format($$select format('Pessoa %%s A', r), r::text, case when r = 'specialist' then %L::uuid end
    from unnest(enum_range(null::public.member_role)) r$$, :'prof_dele_a'),
  'candidatos de A: nome do perfil, papel e o profissional ligado ao specialist'
);
select tests.clear_authentication();
select is(pg_temp.try_as(:'outsider', 'select 1 from public.list_professional_link_candidates(''00000000-0000-0000-0000-00000000000a'')'),
  '0', 'usuário sem vínculo não recebe candidatos');
select is(pg_temp.try_as(null, 'select 1 from public.list_professional_link_candidates(''00000000-0000-0000-0000-00000000000a'')'),
  'negado', 'anon não chama a função de candidatos');

-- Listagem sem filtro: cada membro vê só a própria empresa
select is(pg_temp.try_as(:'specialist_a', 'select 1 from public.services'), '2', 'specialist de A lista os 2 serviços de A');
select is(pg_temp.try_as(:'specialist_a', 'select 1 from public.professional_services'), '1', 'specialist de A lista o vínculo de A');
select is(pg_temp.try_as(:'outsider', 'select 1 from public.services'), '0', 'usuário sem vínculo não lista serviços');
select is(pg_temp.try_as(:'outsider', 'select 1 from public.professional_services'), '0', 'usuário sem vínculo não lista vínculos');
select is(pg_temp.try_as(null, format('select 1 from public.%I', t)), 'negado', format('anon não lê %s', t))
from unnest(array['services', 'professional_services']) t;

-- CHECKs de services (RN-040)
create function pg_temp.svc(p_name text, p_duration int, p_buffer int, p_price int, p_currency text default 'BRL',
  p_description text default null)
returns text
language sql
as $$
  select format(
    'insert into public.services (tenant_id, name, description, duration_minutes, buffer_minutes, price_cents, currency) values (%L, %L, %L, %s, %s, %s, %L)',
    '00000000-0000-0000-0000-00000000000a', p_name, p_description, p_duration, coalesce(p_buffer::text, 'null'),
    p_price, p_currency
  );
$$;
select throws_ok(pg_temp.svc('D0', 0, null, 0), '23514', null, 'duração 0 é recusada');
select throws_ok(pg_temp.svc('D7', 7, null, 0), '23514', null, 'duração fora do passo de 5 é recusada');
select throws_ok(pg_temp.svc('D725', 725, null, 0), '23514', null, 'duração acima de 720 é recusada');
select throws_ok(pg_temp.svc('B3', 30, 3, 0), '23514', null, 'intervalo fora do passo de 5 é recusado');
select throws_ok(pg_temp.svc('B-5', 30, -5, 0), '23514', null, 'intervalo negativo é recusado');
select throws_ok(pg_temp.svc('B245', 30, 245, 0), '23514', null, 'intervalo acima de 240 é recusado');
select throws_ok(pg_temp.svc('P-1', 30, null, -1), '23514', null, 'preço negativo é recusado');
select throws_ok(pg_temp.svc('Mb', 30, null, 0, 'brl'), '23514', null, 'moeda minúscula é recusada');
select throws_ok(pg_temp.svc('M2', 30, null, 0, 'BR'), '23514', null, 'moeda sem 3 letras é recusada');
select throws_ok(pg_temp.svc('   ', 30, null, 0), '23514', null, 'nome em branco é recusado');
select throws_ok(pg_temp.svc(repeat('n', 81), 30, null, 0), '23514', null, 'nome com 81 caracteres é recusado');
select throws_ok(pg_temp.svc('Desc', 30, null, 0, 'BRL', repeat('d', 501)), '23514', null,
  'descrição com 501 caracteres é recusada');
select lives_ok(pg_temp.svc('Limites baixos', 5, 0, 0), 'duração 5, intervalo 0 e preço 0 são aceitos');
select lives_ok(pg_temp.svc(repeat('n', 80), 720, 240, 999999, 'USD', repeat('d', 500)),
  'duração 720, intervalo 240, nome de 80, descrição de 500 e outra moeda são aceitos');
select lives_ok(pg_temp.svc('Sem intervalo', 30, null, 5000), 'intervalo vazio é aceito');
select is((select currency from public.services where name = 'Sem intervalo'), 'BRL', 'moeda padrão é BRL');

-- Nome único na empresa, sem diferenciar maiúsculas nem espaços nas pontas (RN-040)
select lives_ok(pg_temp.svc('Corte feminino', 60, null, 9000), 'primeiro "Corte feminino" é aceito');
select throws_ok(pg_temp.svc('  CORTE Feminino ', 60, null, 9000), '23505', null,
  'mesmo nome com outras maiúsculas e espaços é recusado na mesma empresa');
select lives_ok(
  $$insert into public.services (tenant_id, name, duration_minutes, price_cents)
    values ('00000000-0000-0000-0000-00000000000b', 'Corte feminino', 60, 9000)$$,
  'o mesmo nome é aceito em outra empresa'
);

-- CHECKs de professionals (RN-035, RN-042)
select throws_ok(
  $$insert into public.professionals (tenant_id) values ('00000000-0000-0000-0000-00000000000a')$$,
  '23502', null, 'profissional sem nome é recusado'
);
select throws_ok(
  $$insert into public.professionals (tenant_id, display_name) values ('00000000-0000-0000-0000-00000000000a', '  ')$$,
  '23514', null, 'profissional com nome em branco é recusado'
);
select throws_ok(
  format('insert into public.professionals (tenant_id, display_name) values (%L, %L)',
    '00000000-0000-0000-0000-00000000000a', repeat('n', 81)),
  '23514', null, 'profissional com nome de 81 caracteres é recusado'
);
select is((select is_active from public.professionals where id = :'prof_livre_a'), true, 'profissional nasce ativo');

-- Profissional com agendamento não é excluído, nem por quem tem services.manage (RN-042)
select tests.authenticate_as(:'owner_a');
select throws_ok(
  format('delete from public.professionals where id = %L', :'prof_dele_a'),
  '23503', null, 'owner de A não exclui profissional com agendamento'
);
select tests.clear_authentication();

-- FKs compostas recusam vínculo entre empresas (ADR-003 §2, RN-043), inclusive com a política liberando
select throws_ok(
  format('insert into public.professional_services (tenant_id, professional_id, service_id) values (%L, %L, %L)',
    '00000000-0000-0000-0000-00000000000a', :'prof_livre_a', :'svc_livre_b'),
  '23503', null, 'profissional de A com serviço de B é recusado'
);
select throws_ok(
  format('insert into public.professional_services (tenant_id, professional_id, service_id) values (%L, %L, %L)',
    '00000000-0000-0000-0000-00000000000a', :'prof_dele_b', :'svc_livre_a'),
  '23503', null, 'profissional de B com serviço de A é recusado'
);
select tests.authenticate_as(:'owner_a');
select throws_ok(
  format('insert into public.professional_services (tenant_id, professional_id, service_id) values (%L, %L, %L)',
    '00000000-0000-0000-0000-00000000000a', :'prof_livre_a', :'svc_livre_b'),
  '23503', null, 'owner de A não liga serviço de B: a FK composta recusa mesmo com a política liberando'
);
select throws_ok(
  format('insert into public.professional_services (tenant_id, professional_id, service_id) values (%L, %L, %L)',
    '00000000-0000-0000-0000-00000000000a', :'prof_dele_a', :'svc_ligado_a'),
  '23505', null, 'o mesmo vínculo não entra duas vezes'
);
select tests.clear_authentication();

-- Cascata: excluir o serviço ou o profissional remove o vínculo
savepoint cascata_servico;
delete from public.services where id = :'svc_ligado_a';
select is((select count(*) from public.professional_services where service_id = :'svc_ligado_a'), 0::bigint,
  'excluir o serviço remove o vínculo');
rollback to savepoint cascata_servico;
savepoint cascata_profissional;
insert into public.professional_services (tenant_id, professional_id, service_id)
values ('00000000-0000-0000-0000-00000000000a', :'prof_livre_a', :'svc_livre_a');
delete from public.professionals where id = :'prof_livre_a';
select is((select count(*) from public.professional_services where professional_id = :'prof_livre_a'), 0::bigint,
  'excluir o profissional remove o vínculo');
rollback to savepoint cascata_profissional;

-- tenant_id é imutável (ADR-003 §4)
select throws_ok(
  format($$update public.%I set tenant_id = '00000000-0000-0000-0000-00000000000b' where tenant_id = '00000000-0000-0000-0000-00000000000a'$$, t),
  '23514', null, format('%s: tenant_id não muda', t)
)
from unnest(array['services', 'professional_services']) t;

-- O specialist não muda o próprio vínculo nem o nome do profissional dele (RN-035)
select is(
  pg_temp.try_as(:'specialist_a', format('update public.professionals set display_name = %L where id = %L', 'Eu mesmo', :'prof_dele_a')),
  '0', 'specialist de A não renomeia o próprio profissional'
);
select is(
  pg_temp.try_as(:'specialist_a', format('delete from public.professional_services where professional_id = %L', :'prof_dele_a')),
  '0', 'specialist de A não remove os próprios serviços'
);

-- Apagar a empresa remove serviços e vínculos dela pelo cascade
select lives_ok(
  $$delete from public.tenants where id = '00000000-0000-0000-0000-00000000000b'$$,
  'apagar a empresa B passa pelas FKs compostas'
);
select is(
  (select count(*) from public.services where tenant_id = '00000000-0000-0000-0000-00000000000b')
    + (select count(*) from public.professional_services where tenant_id = '00000000-0000-0000-0000-00000000000b'),
  0::bigint,
  'apagar a empresa B remove serviços e vínculos dela'
);

select * from finish();
rollback;
