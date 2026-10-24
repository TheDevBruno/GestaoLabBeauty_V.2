-- Sprint 1.3, aprovação: convite para quem já é membro é recusado na criação (RN-039).
begin;

insert into public.tenants (id, name, slug) values
  ('00000000-0000-0000-0000-00000000000a', 'Empresa A', 'empresa-a'),
  ('00000000-0000-0000-0000-00000000000b', 'Empresa B', 'empresa-b');

select tests.create_user('owner-a@example.test') as owner_a \gset
select tests.create_user('admin-a@example.test') as admin_a \gset
select tests.create_user('recep-a@example.test') as recep_a \gset
select tests.create_user('membro-b@example.test') as membro_b \gset
select tests.create_user('saiu@example.test') as saiu \gset

insert into public.memberships (tenant_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000000a', :'owner_a', 'owner'),
  ('00000000-0000-0000-0000-00000000000a', :'admin_a', 'admin'),
  ('00000000-0000-0000-0000-00000000000a', :'recep_a', 'receptionist'),
  ('00000000-0000-0000-0000-00000000000a', :'saiu', 'manager'),
  ('00000000-0000-0000-0000-00000000000b', :'membro_b', 'owner');

create function pg_temp.invite(p_email text, p_role public.member_role, p_by uuid, p_hash_seed text)
returns text
language sql
as $$
  select format(
    $f$insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
       values ('00000000-0000-0000-0000-00000000000a', %L, %L, repeat(%L, 64), %L)$f$,
    p_email, p_role, p_hash_seed, p_by)
$$;

select plan(8);

select has_trigger('public', 'invitations', 'invitations_check_not_member', 'trigger de membro existente');
select ok(
  not has_function_privilege('authenticated', 'private.check_invitation_not_member()', 'execute'),
  'private.check_invitation_not_member: sem EXECUTE para authenticated'
);

select throws_ok(
  pg_temp.invite('recep-a@example.test', 'manager', :'admin_a', 'a'),
  '23505', 'invitations_email_already_member: a pessoa já é membro desta empresa',
  'admin não convida quem já é membro da empresa'
);
select throws_ok(
  pg_temp.invite('owner-a@example.test', 'owner', :'owner_a', 'b'),
  '23505', null,
  'owner não convida outro owner que já é membro'
);
select throws_ok(
  pg_temp.invite('recep-a@example.test', 'manager', :'recep_a', 'c'),
  '42501', null,
  'quem não gerencia recebe 42501 antes (não descobre quem é membro)'
);
select lives_ok(
  pg_temp.invite('membro-b@example.test', 'manager', :'admin_a', 'd'),
  'membro de outra empresa pode ser convidado'
);
select lives_ok(
  pg_temp.invite('ninguem@example.test', 'manager', :'admin_a', 'e'),
  'e-mail sem conta pode ser convidado'
);

delete from public.memberships where user_id = :'saiu';
select lives_ok(
  pg_temp.invite('saiu@example.test', 'manager', :'admin_a', 'f'),
  'quem saiu da empresa pode ser convidado de novo'
);

select * from finish();
rollback;
