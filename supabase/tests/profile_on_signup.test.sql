-- Sprint 1.3, passo 2: perfil criado junto com a conta (trigger em auth.users).
begin;
select plan(8);

select has_trigger('auth', 'users', 'on_auth_user_created', 'auth.users tem o trigger que cria o perfil');

select ok(
  not has_function_privilege('anon', 'private.handle_new_user()', 'execute')
  and not has_function_privilege('authenticated', 'private.handle_new_user()', 'execute'),
  'private.handle_new_user: sem EXECUTE para anon e authenticated'
);

-- Conta sem metadados: perfil nasce com nome vazio
select tests.create_user('sem-nome@example.test') as sem_nome \gset
select is(
  (select count(*)::int from public.profiles where id = :'sem_nome'), 1, 'conta nova ganha exatamente um perfil'
);
select is(
  (select full_name from public.profiles where id = :'sem_nome'), null, 'sem metadados, o nome do perfil é nulo'
);

-- Conta com full_name nos metadados
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'maria@example.test', '{}'::jsonb, '{"full_name": "  Maria Teste  "}'::jsonb, now(), now()
);
select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'Maria Teste',
  'o nome vem de raw_user_meta_data e é aparado'
);

-- full_name em branco vira nulo
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'branco@example.test', '{}'::jsonb, '{"full_name": "   "}'::jsonb, now(), now()
);
select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'),
  null,
  'full_name em branco vira nulo'
);

-- Apagar a conta apaga o perfil (on delete cascade)
delete from auth.users where id = :'sem_nome';
select is(
  (select count(*)::int from public.profiles where id = :'sem_nome'), 0, 'apagar a conta apaga o perfil'
);

-- O perfil criado só é visível para o próprio usuário (RLS de profiles inalterada)
select tests.create_user('outro@example.test') as outro \gset
select tests.authenticate_as(:'outro');
select is(
  (select count(*)::int from public.profiles), 1, 'o usuário vê só o próprio perfil'
);
select tests.clear_authentication();

select * from finish();
rollback;
