-- Passo 4: funções auxiliares em private e matriz de permissões (ADR-003 §3, ADR-008, plano §8).
begin;
select plan(40);

-- Estrutura: security definer, STABLE e search_path vazio
select has_function('private', 'is_member', array['uuid'], 'private.is_member(uuid) existe');
select has_function('private', 'has_permission', array['uuid', 'text'], 'private.has_permission(uuid, text) existe');
select has_function('private', 'is_platform_admin', array[]::text[], 'private.is_platform_admin() existe');

select is_definer('private', f, a, format('%s é security definer', f))
from (values ('is_member', array['uuid']), ('has_permission', array['uuid', 'text']),
             ('is_platform_admin', array[]::text[])) v (f, a);
select volatility_is('private', f, a, 'stable', format('%s é STABLE', f))
from (values ('is_member', array['uuid']), ('has_permission', array['uuid', 'text']),
             ('is_platform_admin', array[]::text[])) v (f, a);
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
    where p.pronamespace = 'private'::regnamespace
      and p.proname in ('is_member', 'has_permission', 'is_platform_admin')
      and p.proconfig @> array['search_path=""']),
  array['has_permission', 'is_member', 'is_platform_admin'],
  'as 3 funções fixam search_path vazio'
);

-- Privilégios: schema e EXECUTE só para authenticated
select ok(has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated usa o schema private');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon não usa o schema private');

select function_privs_are('private', f, a, 'authenticated', array['EXECUTE'], format('authenticated executa %s', f))
from (values ('is_member', array['uuid']), ('has_permission', array['uuid', 'text']),
             ('is_platform_admin', array[]::text[])) v (f, a);
select function_privs_are('private', f, a, 'anon', array[]::text[], format('anon não executa %s', f))
from (values ('is_member', array['uuid']), ('has_permission', array['uuid', 'text']),
             ('is_platform_admin', array[]::text[])) v (f, a);
select is(
  (select count(*) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace = 'private'::regnamespace
      and p.proname in ('is_member', 'has_permission', 'is_platform_admin')
      and a.grantee = 0),
  0::bigint,
  'PUBLIC sem EXECUTE nas 3 funções'
);

-- Matriz do plano §8, escrita por linha da tabela (a migration agrupa por papel)
select set_eq(
  'select role::text, permission from public.roles_permissions',
  $$values
    ('owner', 'tenant.settings'), ('admin', 'tenant.settings'),
    ('owner', 'tenant.branding'), ('admin', 'tenant.branding'),
    ('owner', 'billing.manage'),
    ('owner', 'members.manage'), ('admin', 'members.manage'),
    ('owner', 'services.manage'), ('admin', 'services.manage'), ('manager', 'services.manage'),
    ('owner', 'appointments.read'), ('admin', 'appointments.read'), ('manager', 'appointments.read'),
    ('specialist', 'appointments.read'), ('receptionist', 'appointments.read'), ('financial', 'appointments.read'),
    ('owner', 'appointments.write'), ('admin', 'appointments.write'), ('manager', 'appointments.write'),
    ('specialist', 'appointments.write'), ('receptionist', 'appointments.write'),
    ('owner', 'clients.read'), ('admin', 'clients.read'), ('manager', 'clients.read'),
    ('specialist', 'clients.read'), ('receptionist', 'clients.read'), ('financial', 'clients.read'),
    ('owner', 'clients.write'), ('admin', 'clients.write'), ('manager', 'clients.write'),
    ('specialist', 'clients.write'), ('receptionist', 'clients.write'),
    ('owner', 'clients.notes.private'), ('admin', 'clients.notes.private'), ('manager', 'clients.notes.private'),
    ('specialist', 'clients.notes.private'),
    ('owner', 'finance.read'), ('admin', 'finance.read'), ('manager', 'finance.read'), ('financial', 'finance.read'),
    ('owner', 'finance.write'), ('admin', 'finance.write'), ('financial', 'finance.write'),
    ('owner', 'commissions.read'), ('admin', 'commissions.read'), ('manager', 'commissions.read'),
    ('specialist', 'commissions.read'), ('financial', 'commissions.read'),
    ('owner', 'reports.read'), ('admin', 'reports.read'), ('manager', 'reports.read'),
    ('specialist', 'reports.read'), ('financial', 'reports.read'),
    ('owner', 'ai.use'), ('admin', 'ai.use'), ('manager', 'ai.use'), ('financial', 'ai.use')$$,
  'roles_permissions igual à matriz do plano §8'
);

-- Cenário: owner em A, specialist em B, admin da plataforma sem membership, usuário sem vínculo
select tests.create_user('owner-a@example.test') as owner_a \gset
select tests.create_user('specialist-b@example.test') as specialist_b \gset
select tests.create_user('platform@example.test') as platform_admin \gset
select tests.create_user('sem-vinculo@example.test') as outsider \gset
insert into public.tenants (id, name, slug) values
  ('00000000-0000-0000-0000-00000000000a', 'Empresa A', 'empresa-a'),
  ('00000000-0000-0000-0000-00000000000b', 'Empresa B', 'empresa-b');
insert into public.memberships (tenant_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000000a', :'owner_a', 'owner'),
  ('00000000-0000-0000-0000-00000000000b', :'specialist_b', 'specialist');
insert into public.platform_admins (user_id) values (:'platform_admin');

-- owner de A
select tests.authenticate_as(:'owner_a');
select ok(private.is_member('00000000-0000-0000-0000-00000000000a'), 'owner A: membro de A');
select ok(not private.is_member('00000000-0000-0000-0000-00000000000b'), 'owner A: não é membro de B');
select ok(private.has_permission('00000000-0000-0000-0000-00000000000a', 'billing.manage'), 'owner A: billing.manage em A');
select ok(
  not private.has_permission('00000000-0000-0000-0000-00000000000b', 'appointments.read'),
  'owner A: nenhuma permissão em B'
);
select ok(
  not private.has_permission('00000000-0000-0000-0000-00000000000a', 'permissao.inexistente'),
  'owner A: permissão fora da matriz é negada'
);
select ok(not private.is_platform_admin(), 'owner A: não é admin da plataforma');
select tests.clear_authentication();

-- specialist de B
select tests.authenticate_as(:'specialist_b');
select ok(private.is_member('00000000-0000-0000-0000-00000000000b'), 'specialist B: membro de B');
select ok(
  private.has_permission('00000000-0000-0000-0000-00000000000b', 'appointments.read'),
  'specialist B: appointments.read em B'
);
select ok(
  not private.has_permission('00000000-0000-0000-0000-00000000000b', 'members.manage'),
  'specialist B: sem members.manage'
);
select ok(
  not private.has_permission('00000000-0000-0000-0000-00000000000b', 'finance.read'),
  'specialist B: sem finance.read'
);
select ok(not private.is_member('00000000-0000-0000-0000-00000000000a'), 'specialist B: não é membro de A');
select tests.clear_authentication();

-- admin da plataforma: não ganha acesso a tenants pelas funções (ADR-003 §6)
select tests.authenticate_as(:'platform_admin');
select ok(private.is_platform_admin(), 'admin da plataforma reconhecido');
select ok(
  not private.is_member('00000000-0000-0000-0000-00000000000a')
    and not private.has_permission('00000000-0000-0000-0000-00000000000a', 'appointments.read'),
  'admin da plataforma sem membership não é membro nem tem permissão em A'
);
select tests.clear_authentication();

-- usuário sem vínculo e argumentos nulos
select tests.authenticate_as(:'outsider');
select ok(
  not private.is_member('00000000-0000-0000-0000-00000000000a') and not private.is_platform_admin(),
  'usuário sem vínculo: nada'
);
select ok(
  not private.is_member(null) and not private.has_permission(null, null),
  'argumentos nulos devolvem false'
);
select tests.clear_authentication();

-- Revogação vale na hora: o papel vem de memberships, não do JWT.
-- Um segundo owner em A: o último owner não pode sair (RN-023, passo 5b).
select tests.create_user('co-owner-a@example.test') as co_owner_a \gset
insert into public.memberships (tenant_id, user_id, role)
  values ('00000000-0000-0000-0000-00000000000a', :'co_owner_a', 'owner');
select tests.authenticate_as(:'owner_a');
select ok(private.is_member('00000000-0000-0000-0000-00000000000a'), 'antes da remoção: membro');
select tests.clear_authentication();
update public.memberships set role = 'receptionist' where user_id = :'owner_a';
select tests.authenticate_as(:'owner_a');
select ok(
  not private.has_permission('00000000-0000-0000-0000-00000000000a', 'billing.manage')
    and private.has_permission('00000000-0000-0000-0000-00000000000a', 'appointments.write'),
  'troca de papel muda as permissões na hora'
);
select tests.clear_authentication();
delete from public.memberships where user_id = :'owner_a';
select tests.authenticate_as(:'owner_a');
select ok(not private.is_member('00000000-0000-0000-0000-00000000000a'), 'membership removida: deixa de ser membro');
select tests.clear_authentication();

-- anon não chega às funções
select tests.authenticate_as_anon();
select throws_ok(
  $$select private.is_member('00000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'anon recebe permission denied em private.is_member'
);
select throws_ok('select private.is_platform_admin()', '42501', null, 'anon recebe permission denied em private.is_platform_admin');
select tests.clear_authentication();

select * from finish();
rollback;
