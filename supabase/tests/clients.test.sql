-- Sprint 2.2, passo 2: colunas novas de clients, search_name, private.search_text e
-- public.search_clients (ADR-003, ADR-008; RN-028, RN-036, RN-037, RN-045 a RN-047).
-- Os casos de RLS saem de uma tabela: 2 empresas × 6 papéis × operações × alvos. Em cada empresa:
--   prof_dele (ligado ao specialist) e prof_outro; cliente_com (agendamento com prof_dele) e cliente_sem
--   (agendamento só com prof_outro). A empresa A tem ainda os clientes da busca (bloco "Busca").
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
cross join unnest(array['prof_dele', 'prof_outro', 'cliente_com', 'cliente_sem']) n (nome);

insert into public.professionals (id, tenant_id, membership_id, display_name)
select g.id, g.tenant_id, case when g.nome = 'prof_dele' then ms.id end, format('%s %s', g.nome, g.tenant)
from targets g
join members m on m.tenant = g.tenant and m.role = 'specialist'
join public.memberships ms on ms.user_id = m.user_id
where g.nome like 'prof\_%';

-- Nome dos alvos: "Alvo com A", "Alvo sem B" etc., para a busca achar só o alvo.
insert into public.clients (id, tenant_id, full_name, phone)
select id, tenant_id, format('Alvo %s %s', replace(nome, 'cliente_', ''), tenant),
       case when nome = 'cliente_com' then '+5521977770001' else '+5521977770002' end
from targets where nome like 'cliente\_%';

insert into public.appointments (tenant_id, client_id, professional_id)
select c.tenant_id, c.id, p.id
from targets c
join targets p on p.tenant = c.tenant
  and p.nome = case c.nome when 'cliente_com' then 'prof_dele' else 'prof_outro' end
where c.nome like 'cliente\_%';

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

-- Tabela de casos. %1$L = empresa do alvo, %2$L = id do alvo nessa empresa.
-- Resultado '1' = uma linha, '0' = nenhuma (RLS), 'negado' = sem GRANT ou WITH CHECK recusado.
create temporary table cases (
  op text, alvo_empresa text, alvo1 text, permitidos public.member_role[], sim text, nao text, sql text
);
insert into cases (op, alvo_empresa, alvo1, permitidos, sim, nao, sql) values
  -- colunas novas na leitura: mesmo recorte da RN-028
  ('select colunas novas', 'própria', 'cliente_com', '{owner,admin,manager,specialist,receptionist,financial}', '1', '0',
   'select phone, email, birth_date, is_active, search_name from public.clients where id = %2$L'),
  ('select colunas novas', 'própria', 'cliente_sem', '{owner,admin,manager,receptionist,financial}', '1', '0',
   'select phone, email, birth_date, is_active, search_name from public.clients where id = %2$L'),
  ('select colunas novas', 'outra', 'cliente_com', '{}', '1', '0',
   'select phone, email, birth_date, is_active, search_name from public.clients where id = %2$L'),
  -- cadastro com as colunas novas: clients.write sem o specialist (RN-036)
  ('insert completo', 'própria', null, '{owner,admin,manager,receptionist}', '1', 'negado',
   'insert into public.clients (tenant_id, full_name, phone, email, birth_date, is_active) values (%1$L, ''Cliente novo'', ''+5511900000099'', ''novo@example.test'', ''1990-05-10'', true)'),
  ('insert completo', 'outra', null, '{}', '1', 'negado',
   'insert into public.clients (tenant_id, full_name, phone, email, birth_date, is_active) values (%1$L, ''Cliente novo'', ''+5511900000099'', ''novo@example.test'', ''1990-05-10'', true)'),
  -- alteração e arquivamento: clients.write; o specialist só nos clientes que vê (RN-036, RN-046)
  ('update e arquiva', 'própria', 'cliente_com', '{owner,admin,manager,specialist,receptionist}', '1', '0',
   'update public.clients set phone = ''+5511900000098'', email = ''outro@example.test'', birth_date = ''1985-01-31'', is_active = false where id = %2$L'),
  ('update e arquiva', 'própria', 'cliente_sem', '{owner,admin,manager,receptionist}', '1', '0',
   'update public.clients set phone = ''+5511900000098'', email = ''outro@example.test'', birth_date = ''1985-01-31'', is_active = false where id = %2$L'),
  ('update e arquiva', 'outra', 'cliente_com', '{}', '1', '0',
   'update public.clients set phone = ''+5511900000098'', email = ''outro@example.test'', birth_date = ''1985-01-31'', is_active = false where id = %2$L'),
  -- search_name não é gravável por ninguém
  ('insert search_name', 'própria', null, '{}', '1', 'negado',
   'insert into public.clients (tenant_id, full_name, search_name) values (%1$L, ''Cliente novo'', ''x'')'),
  ('update search_name', 'própria', 'cliente_com', '{}', '1', 'negado',
   'update public.clients set search_name = ''x'' where id = %2$L'),
  -- sem exclusão (RN-037)
  ('delete', 'própria', 'cliente_sem', '{}', '1', 'negado',
   'delete from public.clients where id = %2$L'),
  -- busca: mesmo recorte da leitura (RN-047)
  ('search_clients', 'própria', 'cliente_com', '{owner,admin,manager,specialist,receptionist,financial}', '1', '0',
   'select 1 from public.search_clients(%1$L, ''alvo com'')'),
  ('search_clients', 'própria', 'cliente_sem', '{owner,admin,manager,receptionist,financial}', '1', '0',
   'select 1 from public.search_clients(%1$L, ''alvo sem'')'),
  ('search_clients', 'outra', 'cliente_com', '{}', '1', '0',
   'select 1 from public.search_clients(%1$L, ''alvo com'')');

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
select user_id as specialist_a from members where tenant = 'A' and role = 'specialist' \gset
select user_id as financial_a from members where tenant = 'A' and role = 'financial' \gset
select id as cliente_com_a from targets where tenant = 'A' and nome = 'cliente_com' \gset

select plan((select count(*)::int from runs) + 80);

-- Estrutura: colunas, padrões, obrigatoriedade e índices
select col_type_is('public', 'clients', c, t, format('clients.%s é %s', c, t))
from (values ('phone', 'text'), ('email', 'text'), ('birth_date', 'date'), ('is_active', 'boolean'),
             ('search_name', 'text')) v (c, t);
select col_is_null('public', 'clients', c, format('clients.%s é opcional', c))
from unnest(array['phone', 'email', 'birth_date']) c;
select col_not_null('public', 'clients', 'search_name', 'clients.search_name é obrigatório');
select col_default_is('public', 'clients', 'is_active', 'true', 'clients.is_active nasce true');
select has_index('public', 'clients', 'clients_tenant_phone_idx', array['tenant_id', 'phone'],
  'índice (tenant_id, phone) em clients');
select has_index('public', 'clients', 'clients_tenant_search_name_idx', array['tenant_id', 'search_name', 'id'],
  'índice (tenant_id, search_name, id) em clients');
select has_trigger('public', 'clients', 'clients_set_search_name', 'trigger de search_name em clients');
select has_extension('extensions', 'unaccent', 'extensão unaccent no schema extensions');
select ok(not exists (select 1 from public.clients where search_name is distinct from private.search_text(full_name)),
  'search_name coerente com o nome em todas as linhas');

-- Políticas de clients não mudaram (RN-028, RN-036, RN-037)
select set_eq(
  $$select policyname::text, cmd from pg_policies where schemaname = 'public' and tablename = 'clients'$$,
  $$values ('clients_select_read', 'SELECT'), ('clients_insert_write', 'INSERT'), ('clients_update_write', 'UPDATE')$$,
  'clients mantém só as políticas de SELECT, INSERT e UPDATE'
);

-- GRANT: anon sem nada; authenticated só SELECT na tabela e colunas editáveis, sem search_name
select table_privs_are('public', 'clients', 'anon', array[]::text[], 'anon sem privilégios em clients');
select table_privs_are('public', 'clients', 'authenticated', array['SELECT'], 'clients: authenticated só SELECT na tabela');
select set_eq(
  $$select column_name::text, privilege_type::text
    from information_schema.column_privileges
    where grantee = 'authenticated' and table_schema = 'public' and table_name = 'clients'
      and privilege_type in ('INSERT', 'UPDATE')$$,
  $$select c, p from unnest(array['full_name', 'phone', 'email', 'birth_date', 'is_active']) c
    cross join unnest(array['INSERT', 'UPDATE']) p
    union all select 'tenant_id', 'INSERT'$$,
  'INSERT e UPDATE de authenticated só nas colunas editáveis de clients (sem search_name)'
);

-- Funções: search_clients é security invoker e STABLE; search_text é IMMUTABLE; search_path vazio
select isnt_definer('public', 'search_clients', array['uuid', 'text', 'boolean', 'integer', 'integer'],
  'search_clients é security invoker');
select volatility_is('public', 'search_clients', array['uuid', 'text', 'boolean', 'integer', 'integer'], 'stable',
  'search_clients é STABLE');
select isnt_definer('private', 'search_text', array['text'], 'search_text é security invoker');
select volatility_is('private', 'search_text', array['text'], 'immutable', 'search_text é IMMUTABLE');
select is(
  (select count(*)::int from pg_proc p
    where p.oid in ('public.search_clients(uuid, text, boolean, integer, integer)'::regprocedure,
                    'private.search_text(text)'::regprocedure, 'private.set_client_search_name()'::regprocedure)
      and p.proconfig @> array['search_path=""']),
  3,
  'search_clients, search_text e set_client_search_name fixam search_path vazio'
);
select function_privs_are('public', 'search_clients', array['uuid', 'text', 'boolean', 'integer', 'integer'],
  'authenticated', array['EXECUTE'], 'authenticated executa search_clients');
select function_privs_are('public', 'search_clients', array['uuid', 'text', 'boolean', 'integer', 'integer'],
  'anon', array[]::text[], 'anon não executa search_clients');
select function_privs_are('private', 'search_text', array['text'], 'authenticated', array['EXECUTE'],
  'authenticated executa search_text');
select function_privs_are('private', 'search_text', array['text'], 'anon', array[]::text[],
  'anon não executa search_text');

-- Casos gerados
select is(pg_temp.try_as(r.executor, r.sql), r.esperado, r.descricao)
from (select * from runs order by n) r;

-- CHECKs (RN-045), como postgres
create function pg_temp.cli(p_name text, p_phone text default null, p_email text default null,
  p_birth date default null)
returns text
language sql
as $$
  select format(
    'insert into public.clients (tenant_id, full_name, phone, email, birth_date) values (%L, %L, %L, %L, %L)',
    '00000000-0000-0000-0000-00000000000b', p_name, p_phone, p_email, p_birth
  );
$$;
select throws_ok(pg_temp.cli('   '), '23514', null, 'nome em branco é recusado');
select throws_ok(pg_temp.cli(repeat('n', 121)), '23514', null, 'nome com 121 caracteres é recusado');
select lives_ok(pg_temp.cli(repeat('n', 120)), 'nome com 120 caracteres é aceito');
select throws_ok(pg_temp.cli('Tel', '11987654321'), '23514', null, 'telefone sem + é recusado');
select throws_ok(pg_temp.cli('Tel', '+55 11 98765-4321'), '23514', null, 'telefone com espaço e hífen é recusado');
select throws_ok(pg_temp.cli('Tel', '+05511987654321'), '23514', null, 'telefone com código começando em 0 é recusado');
select throws_ok(pg_temp.cli('Tel', '+1234567'), '23514', null, 'telefone com 7 dígitos é recusado');
select throws_ok(pg_temp.cli('Tel', '+1234567890123456'), '23514', null, 'telefone com 16 dígitos é recusado');
select lives_ok(pg_temp.cli('Tel', '+12345678'), 'telefone com 8 dígitos é aceito');
select lives_ok(pg_temp.cli('Tel', '+123456789012345'), 'telefone com 15 dígitos é aceito');
select lives_ok(pg_temp.cli('Tel', '+5511987654321'), 'celular brasileiro em E.164 é aceito');
select throws_ok(pg_temp.cli('Mail', null, 'Ana@example.test'), '23514', null, 'e-mail com maiúscula é recusado');
select throws_ok(pg_temp.cli('Mail', null, 'ana example.test'), '23514', null, 'e-mail sem @ é recusado');
select throws_ok(pg_temp.cli('Mail', null, 'ana@example'), '23514', null, 'e-mail sem ponto no domínio é recusado');
select throws_ok(pg_temp.cli('Mail', null, 'ana silva@example.test'), '23514', null, 'e-mail com espaço é recusado');
select throws_ok(pg_temp.cli('Mail', null, repeat('a', 242) || '@example.test'), '23514', null,
  'e-mail com 255 caracteres é recusado');
select lives_ok(pg_temp.cli('Mail', null, repeat('a', 241) || '@example.test'), 'e-mail com 254 caracteres é aceito');
select throws_ok(pg_temp.cli('Nasc', null, null, '1899-12-31'), '23514', null, 'nascimento antes de 1900 é recusado');
select lives_ok(pg_temp.cli('Nasc', null, null, '1900-01-01'), 'nascimento em 1900-01-01 é aceito');
select lives_ok(pg_temp.cli('Mesmo contato', '+5511987654321', 'ana@example.test'),
  'telefone e e-mail repetidos na empresa são aceitos');

-- search_name: mantido pelo trigger em todo INSERT e UPDATE (RN-047)
insert into public.clients (id, tenant_id, full_name)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000b', '  José CONCEIÇÃO ');
select is((select search_name from public.clients where id = '00000000-0000-0000-0000-0000000000c1'),
  '  jose conceicao ', 'search_name sem acento e minúsculo no cadastro');
update public.clients set full_name = 'Íris Müller' where id = '00000000-0000-0000-0000-0000000000c1';
select is((select search_name from public.clients where id = '00000000-0000-0000-0000-0000000000c1'),
  'iris muller', 'search_name acompanha a troca de nome');
update public.clients set search_name = 'desalinhado' where id = '00000000-0000-0000-0000-0000000000c1';
select is((select search_name from public.clients where id = '00000000-0000-0000-0000-0000000000c1'),
  'iris muller', 'search_name gravado direto é recalculado pelo trigger');
select is(
  pg_temp.try_as(:'owner_a', format('update public.clients set full_name = %L where id = %L', 'Ágata Ñandú', :'cliente_com_a')),
  '1', 'owner de A renomeia cliente (o trigger roda para authenticated)'
);

-- Busca (RN-047). Clientes da empresa A além dos alvos "Alvo com A" e "Alvo sem A".
insert into public.clients (tenant_id, full_name, phone, is_active) values
  ('00000000-0000-0000-0000-00000000000a', 'João da Silva', '+5511900000001', true),
  ('00000000-0000-0000-0000-00000000000a', 'Maria Conceição', '+5511900000002', false),
  ('00000000-0000-0000-0000-00000000000a', 'Ana 100% Natural', null, true),
  ('00000000-0000-0000-0000-00000000000a', 'Bia_Lima', '+5511955550003', true);

-- Conta as linhas da busca como o usuário: %1$s são os argumentos depois do tenant.
create function pg_temp.busca(p_user_id uuid, p_args text)
returns text
language sql
as $$
  select pg_temp.try_as(p_user_id,
    format('select 1 from public.search_clients(%L, %s)', '00000000-0000-0000-0000-00000000000a', p_args));
$$;

select is(pg_temp.busca(:'owner_a', 'null'), '5', 'termo vazio lista os 5 ativos de A');
select is(pg_temp.busca(:'owner_a', '''   ''') , '5', 'termo só com espaços lista os 5 ativos de A');
select is(pg_temp.busca(:'owner_a', 'null, true'), '6', 'com arquivados lista os 6 de A');
select is(pg_temp.busca(:'owner_a', '''joao'''), '1', 'joao acha João (sem acento)');
select is(pg_temp.busca(:'owner_a', '''JOÃO DA'''), '1', 'JOÃO DA acha João da Silva (maiúsculas)');
select is(pg_temp.busca(:'owner_a', '''conceicao'''), '0', 'cliente arquivado fica fora da busca padrão');
select is(pg_temp.busca(:'owner_a', '''conceicao'', true'), '1', 'cliente arquivado aparece com p_include_inactive');
select is(pg_temp.busca(:'owner_a', '''900000'''), '1', 'parte do telefone acha o cliente ativo');
select is(pg_temp.busca(:'owner_a', '''900000'', true'), '2', 'parte do telefone acha também o arquivado com o filtro');
select is(pg_temp.busca(:'owner_a', '''(11) 90000-0001'''), '1', 'telefone digitado com máscara é aceito');
select is(pg_temp.busca(:'owner_a', '''+55 11 9'''), '2', 'telefone com + e espaços acha os 2 ativos com +55 11 9');
select is(pg_temp.busca(:'owner_a', '''55'''), '0', 'menos de 3 dígitos não busca no telefone');
select is(pg_temp.busca(:'owner_a', '''%'''), '1', '% é texto: acha só "Ana 100% Natural"');
select is(pg_temp.busca(:'owner_a', '''a_l'''), '1', '_ é texto: acha só "Bia_Lima"');
select is(pg_temp.busca(:'owner_a', '''o_d'''), '0', '_ não casa com qualquer caractere ("o d" de João da Silva)');
select is(pg_temp.busca(:'owner_a', '''\'''), '0', '\ é texto: nenhum nome tem barra');
select results_eq(
  $$select full_name from public.search_clients('00000000-0000-0000-0000-00000000000a', null, false, 2, 0)$$,
  $$values ('Alvo com A'), ('Alvo sem A')$$,
  'ordem por nome normalizado, 2 por página'
);
select results_eq(
  $$select full_name from public.search_clients('00000000-0000-0000-0000-00000000000a', null, false, 2, 4)$$,
  $$values ('João da Silva')$$,
  'deslocamento 4 traz o último ativo'
);
select is(pg_temp.busca(:'owner_a', 'null, false, 2, 10'), '0', 'deslocamento além do fim não traz nada');
select is(pg_temp.busca(:'owner_a', 'null, false, 0, -3'), '1', 'limite e deslocamento abaixo do mínimo viram 1 e 0');
savepoint muitos;
insert into public.clients (tenant_id, full_name)
select '00000000-0000-0000-0000-00000000000a', format('Lote %s', g) from generate_series(1, 120) g;
select is(pg_temp.busca(:'owner_a', 'null, false, 500'), '100', 'limite acima de 100 vira 100');
select is(pg_temp.busca(:'owner_a', 'null, false, null'), '50', 'limite nulo vira 50');
rollback to savepoint muitos;

-- Recorte e isolamento na busca
select is(pg_temp.busca(:'specialist_a', 'null, true'), '1', 'specialist de A busca e vê só o cliente atendido por ele');
select is(pg_temp.busca(:'specialist_a', '''joao'''), '0', 'specialist de A não acha cliente que não atendeu');
select is(pg_temp.busca(:'financial_a', 'null'), '5', 'financial de A busca os 5 ativos (só leitura)');
select is(pg_temp.busca(:'outsider', 'null, true'), '0', 'usuário sem vínculo não acha ninguém');
select is(pg_temp.busca(null, 'null'), 'negado', 'anon não chama search_clients');
select is(
  pg_temp.try_as(:'owner_a', 'select 1 from public.search_clients(''00000000-0000-0000-0000-00000000000b'', null, true)'),
  '0', 'owner de A não acha clientes de B'
);

select * from finish();
rollback;
