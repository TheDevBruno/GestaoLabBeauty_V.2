-- Sprint 2.1, passo 2: serviços (com buffer_minutes), serviços de cada profissional e colunas de
-- professionals (plano §5 ajuste 6 e §7; ADR-003, ADR-008; RN-035, RN-040 a RN-044).

-- Serviço da empresa. Duração e intervalo em minutos, de 5 em 5; buffer_minutes nulo = sem intervalo.
-- O intervalo entra no período do agendamento só na Sprint 2.4 (RN-003). Preço em centavos com a moeda
-- no próprio serviço (RN-032; decisão do usuário: a empresa não tem moeda).
create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null,
  buffer_minutes integer,
  price_cents integer not null,
  currency text not null default 'BRL',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint services_tenant_id_id_key unique (tenant_id, id),
  constraint services_name_not_blank check (btrim(name) <> ''),
  constraint services_name_length check (char_length(name) <= 80),
  constraint services_description_length check (char_length(description) <= 500),
  constraint services_duration_range check (duration_minutes between 5 and 720 and duration_minutes % 5 = 0),
  constraint services_buffer_range check (buffer_minutes between 0 and 240 and buffer_minutes % 5 = 0),
  constraint services_price_not_negative check (price_cents >= 0),
  constraint services_currency_format check (currency ~ '^[A-Z]{3}$')
);

-- Nome único na empresa, sem diferenciar maiúsculas nem espaços nas pontas (RN-040).
create unique index services_tenant_name_key on public.services (tenant_id, lower(btrim(name)));

-- Serviços que cada profissional faz (RN-043). As FKs compostas impedem ligar profissional ou serviço de
-- outra empresa (ADR-003 §2); o vínculo some junto com o profissional ou o serviço.
create table public.professional_services (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  professional_id uuid not null,
  service_id uuid not null,
  created_at timestamptz not null default now(),
  constraint professional_services_pkey primary key (tenant_id, professional_id, service_id),
  constraint professional_services_professional_fkey foreign key (tenant_id, professional_id)
    references public.professionals (tenant_id, id) on delete cascade,
  constraint professional_services_service_fkey foreign key (tenant_id, service_id)
    references public.services (tenant_id, id) on delete cascade
);

-- Índice da FK de serviço (a da PK já cobre a de profissional).
create index professional_services_tenant_service_idx on public.professional_services (tenant_id, service_id);

-- Nome exibido na agenda e no portal; não vem do perfil porque o profissional pode não ter conta
-- (RN-035). Inativo continua no cadastro e no histórico, mas não é oferecido em agendamento novo (RN-042).
-- Sem valor padrão: o nome é obrigatório e ainda não há linhas fora do banco local.
alter table public.professionals
  add column display_name text not null,
  add column is_active boolean not null default true,
  add constraint professionals_display_name_not_blank check (btrim(display_name) <> ''),
  add constraint professionals_display_name_length check (char_length(display_name) <= 80);

-- tenant_id é imutável (ADR-003 §4).
create trigger services_prevent_tenant_id_change
  before update of tenant_id on public.services
  for each row execute function private.prevent_tenant_id_change();
create trigger professional_services_prevent_tenant_id_change
  before update of tenant_id on public.professional_services
  for each row execute function private.prevent_tenant_id_change();

alter table public.services enable row level security;
alter table public.professional_services enable row level security;

-- GRANT só das operações que as políticas liberam (ADR-008 §2). Nada para anon: o portal lê por função
-- própria na Sprint 3.2 (ADR-003 §7). professional_services não tem UPDATE: trocar é apagar e inserir.
grant select, delete on public.services to authenticated;
grant insert (tenant_id, name, description, duration_minutes, buffer_minutes, price_cents, currency, is_active)
  on public.services to authenticated;
grant update (name, description, duration_minutes, buffer_minutes, price_cents, currency, is_active)
  on public.services to authenticated;

grant select, delete on public.professional_services to authenticated;
grant insert (tenant_id, professional_id, service_id) on public.professional_services to authenticated;

grant insert (display_name, is_active) on public.professionals to authenticated;
grant update (display_name, is_active) on public.professionals to authenticated;

-- services: todo membro lê (a agenda mostra o serviço); services.manage escreve (RN-041).
create policy services_select_member
  on public.services
  for select
  to authenticated
  using ((select private.is_member(tenant_id)));

create policy services_insert_manage
  on public.services
  for insert
  to authenticated
  with check ((select private.has_permission(tenant_id, 'services.manage')));

create policy services_update_manage
  on public.services
  for update
  to authenticated
  using ((select private.has_permission(tenant_id, 'services.manage')))
  with check ((select private.has_permission(tenant_id, 'services.manage')));

create policy services_delete_manage
  on public.services
  for delete
  to authenticated
  using ((select private.has_permission(tenant_id, 'services.manage')));

-- professional_services: mesmo modelo de services (RN-041).
create policy professional_services_select_member
  on public.professional_services
  for select
  to authenticated
  using ((select private.is_member(tenant_id)));

create policy professional_services_insert_manage
  on public.professional_services
  for insert
  to authenticated
  with check ((select private.has_permission(tenant_id, 'services.manage')));

create policy professional_services_delete_manage
  on public.professional_services
  for delete
  to authenticated
  using ((select private.has_permission(tenant_id, 'services.manage')));

-- Membros da empresa que podem ser ligados a um profissional (RN-044): nome do perfil, papel e o
-- profissional a que já estão ligados (nulo se nenhum), para a tela mostrar o vínculo atual e os livres.
-- security definer porque profiles só deixa ler o próprio perfil e memberships só a própria sem
-- members.manage; devolve só esses campos, só da empresa pedida e só para quem tem services.manage
-- (os demais recebem zero linhas, sem saber se há membros).
create function public.list_professional_link_candidates(p_tenant_id uuid)
returns table (membership_id uuid, full_name text, role public.member_role, professional_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, p.full_name, m.role, pr.id
  from public.memberships m
  left join public.profiles p on p.id = m.user_id
  left join public.professionals pr on pr.tenant_id = m.tenant_id and pr.membership_id = m.id
  where m.tenant_id = p_tenant_id
    and (select private.has_permission(p_tenant_id, 'services.manage'))
  order by p.full_name nulls last, m.role, m.id;
$$;

revoke execute on function public.list_professional_link_candidates(uuid) from public, anon;
grant execute on function public.list_professional_link_candidates(uuid) to authenticated;
