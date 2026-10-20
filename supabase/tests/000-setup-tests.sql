-- Helpers dos testes pgTAP. Roda antes dos outros arquivos (ordem alfabética) e NÃO faz rollback:
-- cada arquivo *.test.sql desfaz a própria transação, então funções criadas lá sumiriam.
-- O schema tests existe só no banco local e no CI; nunca entra em migration nem em [api] schemas.
-- Tudo aqui é idempotente para o arquivo poder rodar a cada `supabase test db`.

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Cria um usuário sintético em auth.users e devolve o id. Só o postgres executa.
create or replace function tests.create_user(p_email text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );
  return v_id;
end;
$$;

-- Passa a agir como o usuário: role authenticated e claims do JWT, até o fim da transação.
create or replace function tests.authenticate_as(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Passa a agir como visitante sem login (role anon).
create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Volta para o usuário da sessão (postgres) e limpa as claims.
create or replace function tests.clear_authentication()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end;
$$;

grant execute on function tests.authenticate_as(uuid) to anon, authenticated;
grant execute on function tests.authenticate_as_anon() to anon, authenticated;
grant execute on function tests.clear_authentication() to anon, authenticated;

select plan(1);
select has_function('tests', 'authenticate_as', array['uuid'], 'helpers de teste criados');
select * from finish();
