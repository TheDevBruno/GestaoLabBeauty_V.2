-- Garante que os helpers de 000-setup-tests.sql simulam usuários como o PostgREST faz.
begin;
select plan(6);

select tests.create_user('helpers@example.test') as user_id \gset

select tests.authenticate_as(:'user_id');
select is(current_user::text, 'authenticated', 'authenticate_as troca a role para authenticated');
select is(auth.uid(), :'user_id'::uuid, 'authenticate_as define auth.uid()');

select tests.authenticate_as_anon();
select is(current_user::text, 'anon', 'authenticate_as_anon troca a role para anon');
select is(auth.uid(), null, 'anon não tem auth.uid()');

select tests.clear_authentication();
select is(current_user::text, 'postgres', 'clear_authentication volta para postgres');
select is(auth.uid(), null, 'clear_authentication limpa as claims');

select * from finish();
rollback;
