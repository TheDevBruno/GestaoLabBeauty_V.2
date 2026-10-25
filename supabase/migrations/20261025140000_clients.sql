-- Sprint 2.2, passo 2: dados do cliente, arquivamento e busca sem acento (plano §7; ADR-003, ADR-008;
-- RN-028, RN-036, RN-037, RN-045 a RN-047). As políticas de clients não mudam: o recorte do specialist e
-- a proibição de cadastro por ele valem para as colunas novas.

-- unaccent vem com o Supabase; fica no schema extensions, como as demais (autorizada em 2026-10-25).
create extension if not exists unaccent with schema extensions;

-- Texto para busca: sem acento e minúsculo. O dicionário vai explícito para o resultado não depender do
-- search_path, o que permite marcar a função como IMMUTABLE. security invoker: o Supabase já concede
-- USAGE em extensions e EXECUTE do unaccent a authenticated.
create function private.search_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, p_text));
$$;

revoke execute on function private.search_text(text) from public, anon;
grant execute on function private.search_text(text) to authenticated;

-- Contato e nascimento são opcionais (RN-045): telefone em E.164, e-mail minúsculo, nascimento a partir de
-- 1900 (o "não futura" fica na tela: current_date num CHECK não é imutável). Arquivado = is_active false
-- (RN-046); cliente não é excluído (RN-037). Telefone e e-mail podem se repetir na empresa.
alter table public.clients
  add column phone text,
  add column email text,
  add column birth_date date,
  add column is_active boolean not null default true,
  add column search_name text,
  add constraint clients_full_name_length check (char_length(full_name) <= 120),
  add constraint clients_phone_format check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  add constraint clients_email_format check (
    email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  add constraint clients_birth_date_min check (birth_date >= date '1900-01-01');

-- search_name: nome normalizado para a busca (RN-047), mantido só pelo trigger abaixo. Fica fora de todo
-- GRANT de escrita; o trigger recalcula em todo INSERT e UPDATE, então nem quem ignora GRANT a desalinha.
create function private.set_client_search_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_name := private.search_text(new.full_name);
  return new;
end;
$$;

revoke execute on function private.set_client_search_name() from public, anon;

create trigger clients_set_search_name
  before insert or update on public.clients
  for each row execute function private.set_client_search_name();

update public.clients set search_name = private.search_text(full_name);
alter table public.clients alter column search_name set not null;

-- Busca por telefone e listagem em ordem de nome dentro da empresa.
create index clients_tenant_phone_idx on public.clients (tenant_id, phone) where phone is not null;
create index clients_tenant_search_name_idx on public.clients (tenant_id, search_name, id);

-- Colunas novas editáveis (ADR-008 §2). search_name e created_at continuam sem GRANT de escrita.
grant insert (phone, email, birth_date, is_active) on public.clients to authenticated;
grant update (phone, email, birth_date, is_active) on public.clients to authenticated;

-- Busca de clientes (RN-047). security invoker: a RLS de clients vale para quem chama, inclusive o recorte
-- do specialist (RN-028). O termo nunca vira filtro do PostgREST: é normalizado aqui, com %, _ e \
-- tratados como texto. Termo vazio lista todos; 3 ou mais dígitos (ignorando espaço, parênteses, ponto,
-- hífen e +) buscam também no telefone. Arquivados só com p_include_inactive. Até 100 linhas por chamada.
create function public.search_clients(
  p_tenant_id uuid,
  p_query text default null,
  p_include_inactive boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof public.clients
language sql
stable
security invoker
set search_path = ''
as $$
  with termo as (
    select
      replace(replace(replace(private.search_text(btrim(left(coalesce(p_query, ''), 100))),
        '\', '\\'), '%', '\%'), '_', '\_') as nome,
      regexp_replace(left(coalesce(p_query, ''), 100), '[\s().+-]', '', 'g') as digitos
  )
  select c.*
  from public.clients c, termo t
  where c.tenant_id = p_tenant_id
    and (coalesce(p_include_inactive, false) or c.is_active)
    and (
      t.nome = ''
      or c.search_name like '%' || t.nome || '%'
      or (t.digitos ~ '^[0-9]{3,}$' and c.phone like '%' || t.digitos || '%')
    )
  order by c.search_name, c.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.search_clients(uuid, text, boolean, integer, integer) from public, anon;
grant execute on function public.search_clients(uuid, text, boolean, integer, integer) to authenticated;
