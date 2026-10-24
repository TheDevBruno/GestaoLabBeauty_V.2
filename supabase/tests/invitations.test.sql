-- Sprint 1.3, passo 2: convites (RN-022, RN-026, RN-038; ADR-002, ADR-003, ADR-008).
-- Criação com service role (aqui: postgres) validada pelo trigger; leitura e revogação sob RLS;
-- aceite pela função public.accept_invitation.
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
update auth.users set email_confirmed_at = now();

select user_id as owner_a from members where tenant = 'A' and role = 'owner' \gset
select user_id as admin_a from members where tenant = 'A' and role = 'admin' \gset
select user_id as manager_a from members where tenant = 'A' and role = 'manager' \gset
select user_id as receptionist_a from members where tenant = 'A' and role = 'receptionist' \gset
select user_id as owner_b from members where tenant = 'B' and role = 'owner' \gset
select user_id as admin_b from members where tenant = 'B' and role = 'admin' \gset

-- Contas que vão aceitar convites. A de e-mail não confirmado é a única sem confirmação.
select tests.create_user('novo1@example.test') as novo1 \gset
select tests.create_user('novo2@example.test') as novo2 \gset
select tests.create_user('errado@example.test') as errado \gset
select tests.create_user('naoconf@example.test') as naoconf \gset
select tests.create_user('expirado@example.test') as expirado \gset
select tests.create_user('revogado@example.test') as revogado \gset
select tests.create_user('sem-vinculo@example.test') as outsider \gset
-- Vira membro depois de convidada (a criação já recusa quem é membro: RN-039).
select tests.create_user('tardio@example.test') as tardio \gset
update auth.users set email_confirmed_at = now() where email <> 'naoconf@example.test';
update auth.users set email_confirmed_at = null where email = 'naoconf@example.test';

create function pg_temp.h(p_token text)
returns text
language sql
as $$ select encode(sha256(convert_to(p_token, 'utf8')), 'hex') $$;

-- Executa o comando como o usuário: devolve as linhas afetadas ou 'E' || SQLSTATE se falhar.
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
  when others then
    return 'E' || sqlstate;
end;
$$;

-- Mesma ideia, como visitante sem login (role anon).
create function pg_temp.try_anon(p_sql text)
returns text
language plpgsql
as $$
declare
  v_rows bigint;
begin
  perform tests.authenticate_as_anon();
  execute p_sql;
  get diagnostics v_rows = row_count;
  perform tests.clear_authentication();
  return v_rows::text;
exception
  when others then
    return 'E' || sqlstate;
end;
$$;

-- Convites de partida, criados como o servidor criaria (postgres ignora a RLS; o trigger valida).
insert into public.invitations (tenant_id, email, role, token_hash, invited_by) values
  ('00000000-0000-0000-0000-00000000000a', 'pendente.a@example.test', 'receptionist', pg_temp.h('tok-pend-a'), :'admin_a'),
  ('00000000-0000-0000-0000-00000000000a', 'revogado.a@example.test', 'receptionist', pg_temp.h('tok-revogado-a'), :'admin_a'),
  ('00000000-0000-0000-0000-00000000000a', 'rev1@example.test', 'receptionist', pg_temp.h('tok-rev1'), :'admin_a'),
  ('00000000-0000-0000-0000-00000000000a', 'rev2@example.test', 'receptionist', pg_temp.h('tok-rev2'), :'admin_a'),
  ('00000000-0000-0000-0000-00000000000a', 'revowner@example.test', 'owner', pg_temp.h('tok-revowner'), :'owner_a'),
  ('00000000-0000-0000-0000-00000000000a', 'revacc@example.test', 'receptionist', pg_temp.h('tok-revacc'), :'admin_a'),
  ('00000000-0000-0000-0000-00000000000a', 'novo1@example.test', 'admin', pg_temp.h('tok-ok'), :'owner_a'),
  ('00000000-0000-0000-0000-00000000000a', 'novo2@example.test', 'owner', pg_temp.h('tok-owner'), :'owner_a'),
  ('00000000-0000-0000-0000-00000000000a', 'outra-pessoa@example.test', 'manager', pg_temp.h('tok-wrong'), :'owner_a'),
  ('00000000-0000-0000-0000-00000000000a', 'naoconf@example.test', 'manager', pg_temp.h('tok-unconf'), :'owner_a'),
  ('00000000-0000-0000-0000-00000000000a', 'expirado@example.test', 'manager', pg_temp.h('tok-exp'), :'owner_a'),
  ('00000000-0000-0000-0000-00000000000a', 'revogado@example.test', 'manager', pg_temp.h('tok-rev'), :'owner_a'),
  ('00000000-0000-0000-0000-00000000000a', 'tardio@example.test', 'manager', pg_temp.h('tok-member'), :'owner_a'),
  ('00000000-0000-0000-0000-00000000000b', 'pendente.b@example.test', 'receptionist', pg_temp.h('tok-pend-b'), :'owner_b');

insert into public.memberships (tenant_id, user_id, role)
values ('00000000-0000-0000-0000-00000000000a', :'tardio', 'receptionist');

update public.invitations set accepted_at = now(), accepted_by = :'novo1' where email = 'revacc@example.test';
update public.invitations set created_at = now() - interval '9 days', expires_at = now() - interval '2 days'
  where email = 'expirado@example.test';
update public.invitations set revoked_at = now() where email in ('revogado@example.test', 'revogado.a@example.test');

select plan(80);

-- Estrutura -----------------------------------------------------------------------------------------
select set_eq(
  $$select policyname::text, cmd, permissive, roles::text[] from pg_policies
    where schemaname = 'public' and tablename = 'invitations'$$,
  $$values
    ('invitations_select_manage', 'SELECT', 'PERMISSIVE', array['authenticated']),
    ('invitations_update_revoke', 'UPDATE', 'PERMISSIVE', array['authenticated'])$$,
  'invitations: políticas de SELECT e UPDATE só para authenticated'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.invitations'::regclass), 'invitations: RLS ligada'
);
select ok(not has_table_privilege('authenticated', 'public.invitations', 'insert'), 'authenticated sem INSERT');
select ok(not has_table_privilege('authenticated', 'public.invitations', 'delete'), 'authenticated sem DELETE');
select ok(
  not has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'select'),
  'authenticated não lê token_hash'
);
select ok(
  has_column_privilege('authenticated', 'public.invitations', 'revoked_at', 'update')
  and not has_column_privilege('authenticated', 'public.invitations', 'email', 'update')
  and not has_column_privilege('authenticated', 'public.invitations', 'role', 'update'),
  'authenticated atualiza só revoked_at'
);
select ok(
  not has_any_column_privilege('anon', 'public.invitations', 'select,insert,update'),
  'anon sem privilégio em invitations'
);
select ok(
  not has_function_privilege('anon', 'public.accept_invitation(text)', 'execute')
  and has_function_privilege('authenticated', 'public.accept_invitation(text)', 'execute'),
  'accept_invitation: EXECUTE só para authenticated'
);
select ok(
  not has_function_privilege('authenticated', 'private.check_invitation_inviter()', 'execute'),
  'private.check_invitation_inviter: sem EXECUTE para authenticated'
);
select is(
  (select expires_at - created_at from public.invitations where email = 'pendente.a@example.test'),
  interval '7 days',
  'RN-026: o convite expira em 7 dias'
);

-- Criação pelo servidor: quem convida (RN-022, RN-026) e formato ----------------------------------------
select throws_ok(
  $$insert into public.invitations (tenant_id, email, role, token_hash)
    values ('00000000-0000-0000-0000-00000000000a', 'a1@example.test', 'receptionist', repeat('a', 64))$$,
  '42501', null, 'convite sem quem convida é recusado'
);
select throws_ok(
  format($$insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
    values ('00000000-0000-0000-0000-00000000000a', 'a2@example.test', 'receptionist', repeat('a', 64), %L)$$,
    :'receptionist_a'),
  '42501', null, 'receptionist não convida'
);
select throws_ok(
  format($$insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
    values ('00000000-0000-0000-0000-00000000000a', 'a3@example.test', 'receptionist', repeat('b', 64), %L)$$,
    :'manager_a'),
  '42501', null, 'manager não convida (sem members.manage)'
);
select lives_ok(
  format($$insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
    values ('00000000-0000-0000-0000-00000000000a', 'a4@example.test', 'manager', repeat('c', 64), %L)$$,
    :'admin_a'),
  'admin convida para manager'
);
select throws_ok(
  format($$insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
    values ('00000000-0000-0000-0000-00000000000a', 'a5@example.test', 'owner', repeat('d', 64), %L)$$,
    :'admin_a'),
  '42501', null, 'RN-022: admin não convida para owner'
);
select lives_ok(
  format($$insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
    values ('00000000-0000-0000-0000-00000000000a', 'a6@example.test', 'owner', repeat('e', 64), %L)$$,
    :'owner_a'),
  'owner convida para owner'
);
select throws_ok(
  format($$insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
    values ('00000000-0000-0000-0000-00000000000a', 'a7@example.test', 'receptionist', repeat('f', 64), %L)$$,
    :'owner_b'),
  '42501', null, 'owner de outra empresa não convida'
);
select throws_ok(
  format($$insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
    values ('00000000-0000-0000-0000-00000000000a', 'a8@example.test', 'receptionist', 'nao-e-hash', %L)$$,
    :'admin_a'),
  '23514', null, 'token_hash precisa ser sha-256 em hexadecimal'
);
select throws_ok(
  format($$insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
    values ('00000000-0000-0000-0000-00000000000a', 'Maiuscula@Example.test', 'receptionist', repeat('1', 64), %L)$$,
    :'admin_a'),
  '23514', null, 'e-mail precisa estar normalizado (minúsculas)'
);
select throws_ok(
  format($$insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
    values ('00000000-0000-0000-0000-00000000000a', 'pendente.a@example.test', 'receptionist', repeat('2', 64), %L)$$,
    :'admin_a'),
  '23505', null, 'um convite pendente por e-mail e empresa'
);
select lives_ok(
  format($$insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
    values ('00000000-0000-0000-0000-00000000000a', 'revogado.a@example.test', 'receptionist', repeat('3', 64), %L)$$,
    :'admin_a'),
  'convite revogado libera um novo para o mesmo e-mail'
);

-- Leitura (RLS): só members.manage da própria empresa ------------------------------------------------------
-- Contagem real de cada empresa neste ponto (os testes de criação acima já inseriram convites).
create temporary table counts as
select tenant_id, count(*)::text as n from public.invitations group by tenant_id;

select is(
  pg_temp.try_as(m.user_id, format('select id from public.invitations where tenant_id = %L', t.tenant_id)),
  case when m.tenant = t.tenant and m.role in ('owner', 'admin')
       then (select n from counts c where c.tenant_id = t.tenant_id) else '0' end,
  format('select em %s: %s de %s', t.tenant, m.role, m.tenant)
)
from members m
cross join (values ('A', '00000000-0000-0000-0000-00000000000a'::uuid),
                   ('B', '00000000-0000-0000-0000-00000000000b'::uuid)) t (tenant, tenant_id);

select is(
  pg_temp.try_as(:'owner_a', 'select token_hash from public.invitations'), 'E42501', 'token_hash negado ao owner'
);
select is(
  pg_temp.try_as(:'owner_a', 'select * from public.invitations'), 'E42501', 'select * negado (inclui token_hash)'
);
select is(
  pg_temp.try_as(:'outsider', 'select id from public.invitations'), '0', 'usuário sem vínculo não vê convites'
);
select is(
  (select pg_temp.try_as(:'owner_a', 'insert into public.invitations (tenant_id, email, role, token_hash, invited_by) values (''00000000-0000-0000-0000-00000000000a'', ''x@example.test'', ''receptionist'', repeat(''9'', 64), null)')),
  'E42501',
  'authenticated não insere convite'
);
select is(
  pg_temp.try_as(:'owner_a', 'delete from public.invitations'), 'E42501', 'authenticated não exclui convite'
);

-- Revogação (RLS): members.manage, só pendente, owner revoga convite de owner ------------------------------
select is(pg_temp.try_as(:'receptionist_a', $$update public.invitations set revoked_at = now() where email = 'rev1@example.test'$$),
  '0', 'receptionist não revoga');
select is(pg_temp.try_as(:'manager_a', $$update public.invitations set revoked_at = now() where email = 'rev1@example.test'$$),
  '0', 'manager não revoga');
select is(pg_temp.try_as(:'owner_b', $$update public.invitations set revoked_at = now() where email = 'rev1@example.test'$$),
  '0', 'owner de outra empresa não revoga');
select is(pg_temp.try_as(:'admin_b', $$update public.invitations set revoked_at = now() where email = 'rev1@example.test'$$),
  '0', 'admin de outra empresa não revoga');
select is(pg_temp.try_as(:'outsider', $$update public.invitations set revoked_at = now() where email = 'rev1@example.test'$$),
  '0', 'usuário sem vínculo não revoga');
select is(pg_temp.try_as(:'admin_a', $$update public.invitations set revoked_at = now() where email = 'revowner@example.test'$$),
  '0', 'admin não revoga convite de owner');
select is(pg_temp.try_as(:'owner_a', $$update public.invitations set revoked_at = now() where email = 'revacc@example.test'$$),
  '0', 'convite já aceito não é revogado');
select is(pg_temp.try_as(:'admin_a', $$update public.invitations set email = 'x@example.test' where email = 'rev2@example.test'$$),
  'E42501', 'só revoked_at é atualizável: e-mail negado');
select is(pg_temp.try_as(:'admin_a', $$update public.invitations set revoked_at = now(), role = 'owner' where email = 'rev2@example.test'$$),
  'E42501', 'só revoked_at é atualizável: papel negado');
select is(pg_temp.try_as(:'admin_a', $$update public.invitations set revoked_at = now() where email = 'rev1@example.test'$$),
  '1', 'admin revoga convite pendente');
select is(pg_temp.try_as(:'admin_a', $$update public.invitations set revoked_at = now() where email = 'rev1@example.test'$$),
  '0', 'convite já revogado não é revogado de novo');
select is(pg_temp.try_as(:'admin_a', $$update public.invitations set revoked_at = null where email = 'rev1@example.test'$$),
  '0', 'convite revogado não volta a pendente');
select is(pg_temp.try_as(:'owner_a', $$update public.invitations set revoked_at = now() where email = 'revowner@example.test'$$),
  '1', 'owner revoga convite de owner');

-- Aceite (RN-038) -----------------------------------------------------------------------------------------
select is(pg_temp.try_anon($$select public.accept_invitation('tok-ok')$$), 'E42501', 'anon não aceita convite');
select throws_ok($$select public.accept_invitation('tok-ok')$$, '42501', 'não autenticado', 'sem sessão não aceita convite');

select is(pg_temp.try_as(:'novo1', $$select public.accept_invitation('tok-ok')$$), '1', 'e-mail igual: aceita o convite');
select is(
  (select role::text from public.memberships where user_id = :'novo1' and tenant_id = '00000000-0000-0000-0000-00000000000a'),
  'admin',
  'a membership nasce com o papel do convite'
);
select ok(
  (select accepted_at is not null and accepted_by = :'novo1' from public.invitations where email = 'novo1@example.test'),
  'o convite registra quem aceitou e quando'
);
select is(pg_temp.try_as(:'novo1', $$select public.accept_invitation('tok-ok')$$), 'E23514', 'uso único: segundo aceite negado');
select is(pg_temp.try_as(:'errado', $$select public.accept_invitation('tok-ok')$$), 'E23514', 'convite aceito não vale para outra conta');

select is(pg_temp.try_as(:'novo2', $$select public.accept_invitation('tok-owner')$$), '1', 'convite de owner aceito');
select is(
  (select role::text from public.memberships where user_id = :'novo2' and tenant_id = '00000000-0000-0000-0000-00000000000a'),
  'owner',
  'membership de owner criada pelo convite'
);

select is(pg_temp.try_as(:'errado', $$select public.accept_invitation('tok-wrong')$$), 'E23514', 'e-mail diferente do convite é negado');
select is(
  (select count(*)::int from public.memberships where user_id = :'errado'), 0, 'e-mail diferente: nenhuma membership criada'
);
select is(pg_temp.try_as(:'naoconf', $$select public.accept_invitation('tok-unconf')$$), 'E23514', 'e-mail não confirmado é negado');
select is(pg_temp.try_as(:'expirado', $$select public.accept_invitation('tok-exp')$$), 'E23514', 'convite expirado é negado');
select is(pg_temp.try_as(:'revogado', $$select public.accept_invitation('tok-rev')$$), 'E23514', 'convite revogado é negado');
select is(pg_temp.try_as(:'novo1', $$select public.accept_invitation('token-que-nao-existe')$$), 'E23514', 'token desconhecido é negado');
select is(pg_temp.try_as(:'novo1', $$select public.accept_invitation(null)$$), 'E23514', 'token nulo é negado');
select is(
  pg_temp.try_as(:'tardio', $$select public.accept_invitation('tok-member')$$), 'E23505', 'quem já é membro não aceita'
);

select * from finish();
rollback;
