-- Sprint 1.3, passo 2: perfil criado junto com a conta (ADR-003, ADR-008).
-- profiles não tem INSERT para authenticated (passo 3 da Sprint 1.2): o perfil nasce aqui, quando o
-- Auth grava o usuário em auth.users. O nome vem de raw_user_meta_data ("full_name"), se existir.

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Só o trigger chama esta função; ninguém a executa por RPC.
revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Contas que já existiam antes deste trigger (seed local, por exemplo) ganham o perfil que faltava.
insert into public.profiles (id, full_name)
select u.id, nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '')
from auth.users u
on conflict (id) do nothing;
