-- Passo 5b: políticas de memberships e roles_permissions, regra do owner (ADR-003, RN-021 a RN-023).
-- Os casos saem de uma tabela: 2 empresas × 6 papéis × operações × alvos. Alvo = empresa (própria ou
-- outra) × papel do alvo (o próprio papel do executor, owner ou receptionist).
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

select tests.create_user('sem-vinculo@example.test') as outsider \gset

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

-- Tabela de casos. Os alvos são resolvidos por executor: empresa 'própria' ou 'outra' e papel 'próprio'
-- (o do executor), 'owner' ou 'receptionist'. Resultado '1' = uma linha, '0' = nenhuma (RLS),
-- 'negado' = sem GRANT ou WITH CHECK recusado. Todos os updates são no-op (set role = role) para não
-- alterar o estado entre os casos; a promoção a owner fica em bloco com savepoint, mais abaixo.
create temporary table cases (
  op text, alvo_empresa text, alvo_papel text, permitidos public.member_role[], sim text, nao text, sql text
);
insert into cases (op, alvo_empresa, alvo_papel, permitidos, sim, nao, sql) values
  ('select', 'própria', 'próprio', '{owner,admin,manager,specialist,receptionist,financial}', '1', '0',
   'select 1 from public.memberships where tenant_id = %1$L and user_id = %2$L'),
  ('select', 'própria', 'owner', '{owner,admin}', '1', '0',
   'select 1 from public.memberships where tenant_id = %1$L and user_id = %2$L'),
  -- receptionist entra porque, para ele, o alvo é a própria membership
  ('select', 'própria', 'receptionist', '{owner,admin,receptionist}', '1', '0',
   'select 1 from public.memberships where tenant_id = %1$L and user_id = %2$L'),
  ('select', 'outra', 'owner', '{}', '1', '0',
   'select 1 from public.memberships where tenant_id = %1$L and user_id = %2$L'),
  ('select', 'outra', 'receptionist', '{}', '1', '0',
   'select 1 from public.memberships where tenant_id = %1$L and user_id = %2$L'),
  ('update', 'própria', 'próprio', '{}', '0', '0',
   'update public.memberships set role = role where tenant_id = %1$L and user_id = %2$L'),
  ('update', 'própria', 'owner', '{}', '0', '0',
   'update public.memberships set role = role where tenant_id = %1$L and user_id = %2$L'),
  ('update', 'própria', 'receptionist', '{owner,admin}', '1', '0',
   'update public.memberships set role = role where tenant_id = %1$L and user_id = %2$L'),
  ('update', 'outra', 'owner', '{}', '0', '0',
   'update public.memberships set role = role where tenant_id = %1$L and user_id = %2$L'),
  ('update', 'outra', 'receptionist', '{}', '0', '0',
   'update public.memberships set role = role where tenant_id = %1$L and user_id = %2$L'),
  ('insert', 'própria', 'receptionist', '{}', 'negado', 'negado',
   'insert into public.memberships (tenant_id, user_id, role) values (%1$L, %2$L, ''financial'')'),
  ('insert', 'outra', 'receptionist', '{}', 'negado', 'negado',
   'insert into public.memberships (tenant_id, user_id, role) values (%1$L, %2$L, ''financial'')');

-- Cada caso roda para os 12 usuários, contra o alvo resolvido na mesma empresa ou na outra.
create temporary table runs as
select row_number() over (order by c.op, c.alvo_empresa, c.alvo_papel, m.tenant, m.role) as n,
       m.user_id as executor,
       format(c.sql, t.tenant_id, t.user_id) as sql,
       case when m.role = any (c.permitidos) then c.sim else c.nao end as esperado,
       format('%s %s %s: %s de %s', c.op, c.alvo_empresa, c.alvo_papel, m.role, m.tenant) as descricao
from cases c
cross join members m
join members t on t.tenant = case
    when c.alvo_empresa = 'própria' then m.tenant
    when m.tenant = 'A' then 'B'
    else 'A'
  end
  and t.role::text = case when c.alvo_papel = 'próprio' then m.role::text else c.alvo_papel end;

-- Ids usados nos blocos abaixo. Cada empresa tem um usuário por papel.
select user_id as owner_a from members where tenant = 'A' and role = 'owner' \gset
select user_id as admin_a from members where tenant = 'A' and role = 'admin' \gset
select user_id as manager_a from members where tenant = 'A' and role = 'manager' \gset
select user_id as receptionist_a from members where tenant = 'A' and role = 'receptionist' \gset
select user_id as receptionist_b from members where tenant = 'B' and role = 'receptionist' \gset

select plan((select count(*)::int from runs) + 29);

-- Estrutura: uma política por operação liberada, só para authenticated
select set_eq(
  $$select tablename::text, policyname::text, cmd, permissive, roles::text[]
    from pg_policies where schemaname = 'public' and tablename in ('memberships', 'roles_permissions')$$,
  $$values
    ('memberships', 'memberships_select_member', 'SELECT', 'PERMISSIVE', array['authenticated']),
    ('memberships', 'memberships_update_role', 'UPDATE', 'PERMISSIVE', array['authenticated']),
    ('memberships', 'memberships_delete_manage', 'DELETE', 'PERMISSIVE', array['authenticated']),
    ('roles_permissions', 'roles_permissions_select_all', 'SELECT', 'PERMISSIVE', array['authenticated'])$$,
  'memberships e roles_permissions: políticas de SELECT, UPDATE e DELETE só para authenticated'
);

-- Casos gerados
select is(pg_temp.try_as(r.executor, r.sql), r.esperado, r.descricao)
from (select * from runs order by n) r;

-- roles_permissions é a matriz global: todo authenticated lê as 57 linhas, inclusive sem vínculo
select is(
  pg_temp.try_as(user_id, 'select 1 from public.roles_permissions'), '57',
  format('roles_permissions: %s de %s lê a matriz', role, tenant)
) from members;
select is(pg_temp.try_as(:'outsider', 'select 1 from public.roles_permissions'), '57', 'usuário sem vínculo lê a matriz');

-- Usuário sem vínculo não vê memberships de nenhuma empresa
select is(pg_temp.try_as(:'outsider', 'select 1 from public.memberships'), '0', 'usuário sem vínculo não vê memberships');

-- Promoção a owner só pelo owner (RN-022). WITH CHECK recusado vira permission denied, não 0 linhas.
savepoint promocao;
select is(
  pg_temp.try_as(:'admin_a', format($$update public.memberships set role = 'owner' where user_id = %L$$, :'receptionist_a')),
  'negado', 'admin de A não promove receptionist a owner'
);
select is(
  pg_temp.try_as(:'owner_a', format($$update public.memberships set role = 'owner' where user_id = %L$$, :'receptionist_a')),
  '1', 'owner de A promove receptionist a owner'
);
rollback to savepoint promocao;

-- RN-023 vale também fora da RLS: o trigger roda para postgres e para o servidor
select throws_ok(
  format($$update public.memberships set role = 'admin' where user_id = %L$$, :'owner_a'),
  '23514', null, 'rebaixar o único owner é recusado (RN-023)'
);
select throws_ok(
  format($$delete from public.memberships where user_id = %L$$, :'owner_a'),
  '23514', null, 'apagar o único owner é recusado (RN-023)'
);

-- Remoção: members.manage para apagar, owner só pelo owner, nada entre empresas
savepoint remocao;
select is(
  pg_temp.try_as(:'manager_a', format($$delete from public.memberships where user_id = %L$$, :'receptionist_a')),
  '0', 'manager de A não remove membro (sem members.manage)'
);
select is(
  pg_temp.try_as(:'admin_a', format($$delete from public.memberships where user_id = %L$$, :'owner_a')),
  '0', 'admin de A não remove owner'
);
select is(
  pg_temp.try_as(:'admin_a', format($$delete from public.memberships where user_id = %L$$, :'receptionist_b')),
  '0', 'admin de A não remove membro de B'
);
select is(
  pg_temp.try_as(:'admin_a', format($$delete from public.memberships where user_id = %L$$, :'receptionist_a')),
  '1', 'admin de A remove receptionist de A'
);
select is(
  pg_temp.try_as(:'owner_a', format($$delete from public.memberships where user_id = %L$$, :'admin_a')),
  '1', 'owner de A remove admin de A'
);
rollback to savepoint remocao;
savepoint saida;
select is(
  pg_temp.try_as(:'admin_a', format($$delete from public.memberships where user_id = %L$$, :'admin_a')),
  '1', 'admin de A sai da empresa (RN-034)'
);
select is(
  pg_temp.try_as(:'manager_a', format($$delete from public.memberships where user_id = %L$$, :'manager_a')),
  '0', 'manager de A não sai sozinho (sem members.manage, RN-034)'
);
rollback to savepoint saida;

-- O único owner não sai da própria empresa (RN-023), mesmo com members.manage
select tests.authenticate_as(:'owner_a');
select throws_ok(
  format($$delete from public.memberships where user_id = %L$$, :'owner_a'),
  '23514', null, 'owner único não se remove da própria empresa (RN-023)'
);
select tests.clear_authentication();

-- Apagar a empresa remove as memberships pelo cascade sem violar RN-023
select lives_ok(
  $$delete from public.tenants where id = '00000000-0000-0000-0000-00000000000b'$$,
  'apagar a empresa B não viola RN-023'
);
select is(
  (select count(*) from public.memberships where tenant_id = '00000000-0000-0000-0000-00000000000b'),
  0::bigint,
  'apagar a empresa B remove as memberships dela'
);

select * from finish();
rollback;
