-- Passo 3: tabelas de tenancy com RLS ligada, sem políticas e com GRANT mínimo (ADR-003, ADR-008).
begin;
select plan(48);

-- Estrutura
select has_table('public', t, format('tabela %s existe', t))
from unnest(array['tenants', 'profiles', 'memberships', 'platform_admins', 'roles_permissions']) t;

select enum_has_labels(
  'public', 'member_role',
  array['owner', 'admin', 'manager', 'specialist', 'receptionist', 'financial'],
  'member_role tem os 6 papéis do plano §8'
);
select col_is_unique('public', 'memberships', array['tenant_id', 'id'], 'memberships: UNIQUE (tenant_id, id)');
select col_is_unique('public', 'memberships', array['user_id', 'tenant_id'], 'memberships: UNIQUE (user_id, tenant_id)');

-- RLS ligada e nenhuma política
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
    where c.oid in ('public.tenants'::regclass, 'public.profiles'::regclass, 'public.memberships'::regclass,
                    'public.platform_admins'::regclass, 'public.roles_permissions'::regclass)),
  'RLS ligada nas 5 tabelas'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'platform_admins'),
  0::bigint,
  'platform_admins sem política (ADR-003 §6; tenants e profiles: passo 5a; memberships e roles_permissions: passo 5b)'
);

-- GRANT: anon sem nada; authenticated só o necessário
select table_privs_are('public', t, 'anon', array[]::text[], format('anon sem privilégios em %s', t))
from unnest(array['tenants', 'profiles', 'memberships', 'platform_admins', 'roles_permissions']) t;

select table_privs_are('public', 'tenants', 'authenticated', array['SELECT'], 'tenants: authenticated só SELECT na tabela');
select table_privs_are('public', 'profiles', 'authenticated', array['SELECT'], 'profiles: authenticated só SELECT na tabela');
select table_privs_are(
  'public', 'memberships', 'authenticated', array['DELETE', 'SELECT'],
  'memberships: authenticated só SELECT e DELETE na tabela'
);
select table_privs_are('public', 'platform_admins', 'authenticated', array[]::text[], 'platform_admins: authenticated sem privilégios');
select table_privs_are(
  'public', 'roles_permissions', 'authenticated', array['SELECT'],
  'roles_permissions: authenticated só SELECT'
);

-- UPDATE só nas colunas editáveis
select ok(has_column_privilege('authenticated', 'public.tenants', 'name', 'update'), 'tenants: UPDATE em name');
select ok(not has_column_privilege('authenticated', 'public.tenants', 'slug', 'update'), 'tenants: sem UPDATE em slug');
select ok(not has_column_privilege('authenticated', 'public.tenants', 'id', 'update'), 'tenants: sem UPDATE em id');
select ok(has_column_privilege('authenticated', 'public.profiles', 'full_name', 'update'), 'profiles: UPDATE em full_name');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'id', 'update'), 'profiles: sem UPDATE em id');
select ok(has_column_privilege('authenticated', 'public.memberships', 'role', 'update'), 'memberships: UPDATE em role');
select ok(not has_column_privilege('authenticated', 'public.memberships', 'tenant_id', 'update'), 'memberships: sem UPDATE em tenant_id');
select ok(not has_column_privilege('authenticated', 'public.memberships', 'user_id', 'update'), 'memberships: sem UPDATE em user_id');
select ok(
  not has_any_column_privilege('authenticated', 'public.tenants', 'insert')
    and not has_any_column_privilege('authenticated', 'public.profiles', 'insert')
    and not has_any_column_privilege('authenticated', 'public.memberships', 'insert'),
  'authenticated sem INSERT em tenants, profiles e memberships'
);

-- service_role herda os padrões (ADR-008 §3)
select ok(
  has_table_privilege('service_role', 'public.memberships', 'select, insert, update, delete'),
  'service_role com acesso a memberships'
);

-- Enum
select ok(has_type_privilege('authenticated', 'public.member_role', 'usage'), 'authenticated com USAGE em member_role');
select ok(not has_type_privilege('anon', 'public.member_role', 'usage'), 'anon sem USAGE em member_role');

-- Slug (RN-017)
select lives_ok($$insert into public.tenants (name, slug) values ('A', 'studio-ana1')$$, 'slug válido aceito');
select lives_ok($$insert into public.tenants (name, slug) values ('A', 'abc')$$, 'slug com 3 caracteres aceito');
select lives_ok(
  $$insert into public.tenants (name, slug) values ('A', repeat('a', 30))$$,
  'slug com 30 caracteres aceito'
);
select lives_ok($$insert into public.tenants (name, slug) values ('A', 'minha-api')$$, 'slug que contém reservado aceito');
select throws_ok($$insert into public.tenants (name, slug) values ('A', 'ab')$$, '23514', null, 'slug curto recusado');
select throws_ok(
  $$insert into public.tenants (name, slug) values ('A', repeat('a', 31))$$, '23514', null, 'slug longo recusado'
);
select throws_ok($$insert into public.tenants (name, slug) values ('A', 'Studio')$$, '23514', null, 'slug com maiúscula recusado');
select throws_ok($$insert into public.tenants (name, slug) values ('A', '-ana')$$, '23514', null, 'slug com hífen inicial recusado');
select throws_ok($$insert into public.tenants (name, slug) values ('A', 'ana--bela')$$, '23514', null, 'slug com hífen duplo recusado');
select throws_ok($$insert into public.tenants (name, slug) values ('A', 'admin')$$, '23514', null, 'slug reservado recusado');
select throws_ok($$insert into public.tenants (name, slug) values ('A', 'abc')$$, '23505', null, 'slug repetido recusado');
select throws_ok($$insert into public.tenants (name, slug) values ('  ', 'nome-vazio')$$, '23514', null, 'nome em branco recusado');

-- tenant_id imutável
select tests.create_user('membro@example.test') as user_id \gset
insert into public.tenants (id, name, slug) values
  ('00000000-0000-0000-0000-00000000000a', 'Empresa A', 'empresa-a'),
  ('00000000-0000-0000-0000-00000000000b', 'Empresa B', 'empresa-b');
insert into public.memberships (tenant_id, user_id, role)
  values ('00000000-0000-0000-0000-00000000000a', :'user_id', 'owner');

select throws_ok(
  $$update public.memberships set tenant_id = '00000000-0000-0000-0000-00000000000b'$$,
  '23514', null, 'trigger impede trocar tenant_id'
);
select lives_ok($$update public.memberships set created_at = created_at$$, 'trigger permite alterar outras colunas');

-- Sem GRANT, platform_admins nem chega à RLS
select tests.authenticate_as(:'user_id');
select throws_ok('select 1 from public.platform_admins', '42501', null, 'authenticated sem acesso a platform_admins');
select tests.clear_authentication();

-- anon nem chega à RLS: permission denied
select tests.authenticate_as_anon();
select throws_ok('select 1 from public.tenants', '42501', null, 'anon recebe permission denied em tenants');
select tests.clear_authentication();

select * from finish();
rollback;
