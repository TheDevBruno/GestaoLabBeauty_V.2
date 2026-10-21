-- Sprint 1.2, passo 6: versões mínimas de professionals, clients e appointments, FKs compostas e regra
-- "próprio" do specialist (ADR-003 §2, §4 e §9, ADR-008; RN-027, RN-028, RN-035 a RN-037; plano §8).
-- Só as colunas que as FKs e as políticas precisam. A Sprint 2 completa as tabelas com migrations novas
-- (nome do profissional, contato do cliente, período e status do agendamento etc.).

-- Profissional da empresa. A ligação com a membership é opcional (profissional que não usa o sistema) e
-- única: uma membership atende como no máximo um profissional. A FK composta impede ligar a membership
-- de outra empresa. Se a membership sai, o profissional fica sem ligação e o specialist perde o acesso.
create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  membership_id uuid,
  created_at timestamptz not null default now(),
  constraint professionals_tenant_id_id_key unique (tenant_id, id),
  constraint professionals_tenant_membership_key unique (tenant_id, membership_id),
  constraint professionals_membership_fkey foreign key (tenant_id, membership_id)
    references public.memberships (tenant_id, id) on delete set null (membership_id)
);

-- Cliente da empresa. full_name é a única coluna editável: sem ela não haveria UPDATE para proteger.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now(),
  constraint clients_tenant_id_id_key unique (tenant_id, id),
  constraint clients_full_name_not_blank check (btrim(full_name) <> '')
);

-- Agendamento. As duas FKs compostas impedem ligar cliente ou profissional de outra empresa (ADR-003 §2).
-- Ainda sem status: "qualquer status" da RN-028 vale porque a regra do specialist não filtra por ele.
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null,
  professional_id uuid not null,
  created_at timestamptz not null default now(),
  constraint appointments_tenant_id_id_key unique (tenant_id, id),
  constraint appointments_client_fkey foreign key (tenant_id, client_id)
    references public.clients (tenant_id, id),
  constraint appointments_professional_fkey foreign key (tenant_id, professional_id)
    references public.professionals (tenant_id, id)
);

-- Índices das FKs compostas, usados também pelas funções do specialist abaixo.
create index appointments_tenant_client_idx on public.appointments (tenant_id, client_id);
create index appointments_tenant_professional_idx on public.appointments (tenant_id, professional_id);

-- tenant_id é imutável (ADR-003 §4), igual a memberships.
create trigger professionals_prevent_tenant_id_change
  before update of tenant_id on public.professionals
  for each row execute function private.prevent_tenant_id_change();
create trigger clients_prevent_tenant_id_change
  before update of tenant_id on public.clients
  for each row execute function private.prevent_tenant_id_change();
create trigger appointments_prevent_tenant_id_change
  before update of tenant_id on public.appointments
  for each row execute function private.prevent_tenant_id_change();

-- Funções do recorte "próprio" (ADR-003 §9). Mesmo padrão de private.has_permission: security definer
-- para ler memberships, professionals e appointments sem passar pela RLS delas (evita recursão entre as
-- políticas de clients e appointments), STABLE e search_path vazio.

-- O papel do usuário atual na empresa é specialist? Só esse papel tem o recorte "próprio" (plano §8).
create function private.is_specialist(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
      and m.role = 'specialist'
  );
$$;

-- O profissional está ligado à membership do usuário atual na empresa (RN-027)?
create function private.is_own_professional(p_tenant_id uuid, p_professional_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.professionals p
    join public.memberships m on m.tenant_id = p.tenant_id and m.id = p.membership_id
    where p.tenant_id = p_tenant_id
      and p.id = p_professional_id
      and m.user_id = (select auth.uid())
  );
$$;

-- O usuário atual é specialist na empresa e o cliente tem ao menos um agendamento, em qualquer status,
-- com o profissional ligado à membership dele (RN-028)? Para outros papéis devolve false: o recorte não
-- se aplica a eles e as políticas os liberam por private.has_permission.
-- Lê o estado do início do comando: o agendamento sendo gravado não conta para liberar o próprio cliente.
create function private.specialist_can_see_client(p_tenant_id uuid, p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.professionals p on p.tenant_id = m.tenant_id and p.membership_id = m.id
    join public.appointments a on a.tenant_id = p.tenant_id and a.professional_id = p.id
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
      and m.role = 'specialist'
      and a.client_id = p_client_id
  );
$$;

revoke execute on function private.is_specialist(uuid) from public, anon;
revoke execute on function private.is_own_professional(uuid, uuid) from public, anon;
revoke execute on function private.specialist_can_see_client(uuid, uuid) from public, anon;
grant execute on function private.is_specialist(uuid) to authenticated;
grant execute on function private.is_own_professional(uuid, uuid) to authenticated;
grant execute on function private.specialist_can_see_client(uuid, uuid) to authenticated;

alter table public.professionals enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;

-- GRANT só das operações que as políticas liberam (ADR-008 §2). Nada para anon.
-- Sem DELETE em clients e appointments (RN-037): cancelamento vira status na Sprint 2.
grant select, delete on public.professionals to authenticated;
grant insert (tenant_id, membership_id) on public.professionals to authenticated;
grant update (membership_id) on public.professionals to authenticated;

grant select on public.clients to authenticated;
grant insert (tenant_id, full_name) on public.clients to authenticated;
grant update (full_name) on public.clients to authenticated;

grant select on public.appointments to authenticated;
grant insert (tenant_id, client_id, professional_id) on public.appointments to authenticated;
grant update (client_id, professional_id) on public.appointments to authenticated;

-- professionals: todo membro lê (a agenda lista os profissionais); services.manage escreve (RN-035).
create policy professionals_select_member
  on public.professionals
  for select
  to authenticated
  using ((select private.is_member(tenant_id)));

create policy professionals_insert_manage
  on public.professionals
  for insert
  to authenticated
  with check ((select private.has_permission(tenant_id, 'services.manage')));

create policy professionals_update_manage
  on public.professionals
  for update
  to authenticated
  using ((select private.has_permission(tenant_id, 'services.manage')))
  with check ((select private.has_permission(tenant_id, 'services.manage')));

create policy professionals_delete_manage
  on public.professionals
  for delete
  to authenticated
  using ((select private.has_permission(tenant_id, 'services.manage')));

-- clients: clients.read/write; o specialist só lê e altera clientes com agendamento com ele (RN-028) e não
-- cadastra cliente novo (RN-036).
create policy clients_select_read
  on public.clients
  for select
  to authenticated
  using (
    (select private.has_permission(tenant_id, 'clients.read'))
    and (
      not (select private.is_specialist(tenant_id))
      or (select private.specialist_can_see_client(tenant_id, id))
    )
  );

create policy clients_insert_write
  on public.clients
  for insert
  to authenticated
  with check (
    (select private.has_permission(tenant_id, 'clients.write'))
    and not (select private.is_specialist(tenant_id))
  );

create policy clients_update_write
  on public.clients
  for update
  to authenticated
  using (
    (select private.has_permission(tenant_id, 'clients.write'))
    and (
      not (select private.is_specialist(tenant_id))
      or (select private.specialist_can_see_client(tenant_id, id))
    )
  )
  with check (
    (select private.has_permission(tenant_id, 'clients.write'))
    and (
      not (select private.is_specialist(tenant_id))
      or (select private.specialist_can_see_client(tenant_id, id))
    )
  );

-- appointments: appointments.read/write; o specialist só acessa os agendamentos do profissional ligado a
-- ele (RN-027) e só grava para clientes que já vê, sem passar o agendamento a outro profissional (RN-036).
create policy appointments_select_read
  on public.appointments
  for select
  to authenticated
  using (
    (select private.has_permission(tenant_id, 'appointments.read'))
    and (
      not (select private.is_specialist(tenant_id))
      or (select private.is_own_professional(tenant_id, professional_id))
    )
  );

create policy appointments_insert_write
  on public.appointments
  for insert
  to authenticated
  with check (
    (select private.has_permission(tenant_id, 'appointments.write'))
    and (
      not (select private.is_specialist(tenant_id))
      or (
        (select private.is_own_professional(tenant_id, professional_id))
        and (select private.specialist_can_see_client(tenant_id, client_id))
      )
    )
  );

create policy appointments_update_write
  on public.appointments
  for update
  to authenticated
  using (
    (select private.has_permission(tenant_id, 'appointments.write'))
    and (
      not (select private.is_specialist(tenant_id))
      or (select private.is_own_professional(tenant_id, professional_id))
    )
  )
  with check (
    (select private.has_permission(tenant_id, 'appointments.write'))
    and (
      not (select private.is_specialist(tenant_id))
      or (
        (select private.is_own_professional(tenant_id, professional_id))
        and (select private.specialist_can_see_client(tenant_id, client_id))
      )
    )
  );
