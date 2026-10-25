-- Sprint 2.3, passo 2: fuso da empresa, horário semanal e exceções do profissional e cálculo da
-- disponibilidade (plano §6 e §7; ADR-003, ADR-008; RN-032, RN-042, RN-048 a RN-052).

-- btree_gist vem com o Supabase; fica no schema extensions, como as demais (autorizada em 2026-10-25).
-- Permite uuid e smallint com = num índice gist (exclusion de intervalos e índice das exceções).
create extension if not exists btree_gist with schema extensions;

-- Fuso da empresa (RN-048): nome IANA; horário semanal e "dia inteiro" são interpretados nele. Sem CHECK:
-- conferir o nome exige consultar o catálogo, então a validação é um trigger.
alter table public.tenants
  add column timezone text not null default 'America/Sao_Paulo';

create function private.check_tenant_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'fuso horário desconhecido: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function private.check_tenant_timezone() from public, anon;

create trigger tenants_check_timezone
  before insert or update of timezone on public.tenants
  for each row execute function private.check_tenant_timezone();

-- Membro lê o fuso; troca só com tenant.settings (owner e admin), pela política tenants_update_settings.
grant select (timezone) on public.tenants to authenticated;
grant update (timezone) on public.tenants to authenticated;

-- Horário semanal do profissional (RN-049). Hora local no fuso da empresa, dia ISO (1 = segunda,
-- 7 = domingo), de 5 em 5 minutos, início antes do fim no mesmo dia (24:00 = até a meia-noite). Vários
-- intervalos por dia, sem sobreposição; encostados são aceitos ([) nos minutos).
create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  professional_id uuid not null,
  weekday smallint not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint availability_rules_tenant_id_id_key unique (tenant_id, id),
  constraint availability_rules_professional_fkey foreign key (tenant_id, professional_id)
    references public.professionals (tenant_id, id) on delete cascade,
  constraint availability_rules_weekday_range check (weekday between 1 and 7),
  constraint availability_rules_start_before_end check (start_time < end_time),
  constraint availability_rules_five_minutes check (
    extract(epoch from start_time) % 300 = 0 and extract(epoch from end_time) % 300 = 0
  ),
  constraint availability_rules_no_overlap exclude using gist (
    tenant_id with =,
    professional_id with =,
    weekday with =,
    int4range((extract(epoch from start_time) / 60)::integer, (extract(epoch from end_time) / 60)::integer) with &&
  )
);

-- Exceções do profissional (RN-050): bloqueio (não atende) ou horário extra, em instantes UTC com [).
-- O "múltiplo de 5 minutos" usa a distância para a época em UTC: extract direto sobre timestamptz é STABLE
-- (depende do TimeZone da sessão). Sobreposição entre exceções é aceita; no cálculo, bloqueio vence extra.
create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  professional_id uuid not null,
  kind text not null,
  period tstzrange not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint availability_exceptions_tenant_id_id_key unique (tenant_id, id),
  constraint availability_exceptions_professional_fkey foreign key (tenant_id, professional_id)
    references public.professionals (tenant_id, id) on delete cascade,
  constraint availability_exceptions_kind_check check (kind in ('blocked', 'extra')),
  constraint availability_exceptions_period_bounds check (
    not isempty(period) and not lower_inf(period) and not upper_inf(period)
    and lower_inc(period) and not upper_inc(period)
  ),
  constraint availability_exceptions_five_minutes check (
    extract(epoch from lower(period) - timestamptz '1970-01-01 00:00:00+00') % 300 = 0
    and extract(epoch from upper(period) - timestamptz '1970-01-01 00:00:00+00') % 300 = 0
  ),
  constraint availability_exceptions_max_length check (upper(period) - lower(period) <= interval '366 days'),
  constraint availability_exceptions_reason_not_blank check (btrim(reason) <> ''),
  constraint availability_exceptions_reason_length check (char_length(reason) <= 120)
);

-- Exceções de um profissional que tocam um intervalo (cálculo e lista da tela).
create index availability_exceptions_period_idx
  on public.availability_exceptions using gist (tenant_id, professional_id, period);

-- tenant_id é imutável (ADR-003 §4).
create trigger availability_rules_prevent_tenant_id_change
  before update of tenant_id on public.availability_rules
  for each row execute function private.prevent_tenant_id_change();
create trigger availability_exceptions_prevent_tenant_id_change
  before update of tenant_id on public.availability_exceptions
  for each row execute function private.prevent_tenant_id_change();

alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;

-- GRANT só das operações que as políticas liberam (ADR-008 §2). Nada para anon: o portal lê por função
-- própria na Sprint 3.2 (ADR-003 §7). professional_id fica fora do UPDATE: trocar o profissional de uma
-- regra ou exceção é apagar e criar (e o specialist não leva uma exceção para outro profissional).
grant select, delete on public.availability_rules to authenticated;
grant insert (tenant_id, professional_id, weekday, start_time, end_time) on public.availability_rules to authenticated;
grant update (weekday, start_time, end_time) on public.availability_rules to authenticated;

grant select, delete on public.availability_exceptions to authenticated;
grant insert (tenant_id, professional_id, kind, period, reason) on public.availability_exceptions to authenticated;
grant update (kind, period, reason) on public.availability_exceptions to authenticated;

-- availability_rules: todo membro lê (recepção e agenda); services.manage escreve (RN-051).
create policy availability_rules_select_member
  on public.availability_rules
  for select
  to authenticated
  using ((select private.is_member(tenant_id)));

create policy availability_rules_insert_manage
  on public.availability_rules
  for insert
  to authenticated
  with check ((select private.has_permission(tenant_id, 'services.manage')));

create policy availability_rules_update_manage
  on public.availability_rules
  for update
  to authenticated
  using ((select private.has_permission(tenant_id, 'services.manage')))
  with check ((select private.has_permission(tenant_id, 'services.manage')));

create policy availability_rules_delete_manage
  on public.availability_rules
  for delete
  to authenticated
  using ((select private.has_permission(tenant_id, 'services.manage')));

-- availability_exceptions: todo membro lê; services.manage escreve em qualquer profissional; quem tem
-- appointments.write também (receptionist em qualquer um, specialist só no próprio — RN-051).
create policy availability_exceptions_select_member
  on public.availability_exceptions
  for select
  to authenticated
  using ((select private.is_member(tenant_id)));

create policy availability_exceptions_insert_write
  on public.availability_exceptions
  for insert
  to authenticated
  with check (
    (select private.has_permission(tenant_id, 'services.manage'))
    or (
      (select private.has_permission(tenant_id, 'appointments.write'))
      and (
        not (select private.is_specialist(tenant_id))
        or (select private.is_own_professional(tenant_id, professional_id))
      )
    )
  );

create policy availability_exceptions_update_write
  on public.availability_exceptions
  for update
  to authenticated
  using (
    (select private.has_permission(tenant_id, 'services.manage'))
    or (
      (select private.has_permission(tenant_id, 'appointments.write'))
      and (
        not (select private.is_specialist(tenant_id))
        or (select private.is_own_professional(tenant_id, professional_id))
      )
    )
  )
  with check (
    (select private.has_permission(tenant_id, 'services.manage'))
    or (
      (select private.has_permission(tenant_id, 'appointments.write'))
      and (
        not (select private.is_specialist(tenant_id))
        or (select private.is_own_professional(tenant_id, professional_id))
      )
    )
  );

create policy availability_exceptions_delete_write
  on public.availability_exceptions
  for delete
  to authenticated
  using (
    (select private.has_permission(tenant_id, 'services.manage'))
    or (
      (select private.has_permission(tenant_id, 'appointments.write'))
      and (
        not (select private.is_specialist(tenant_id))
        or (select private.is_own_professional(tenant_id, professional_id))
      )
    )
  );

-- Grava a semana inteira de um profissional (RN-049): apaga as regras e insere as recebidas numa
-- transação só, então um intervalo inválido ou sobreposto desfaz tudo. p_rules é um array JSON de
-- {"weekday": 1, "start_time": "09:00", "end_time": "12:00"}, com até 70 itens; [] deixa a semana vazia.
-- security invoker: as políticas valem para quem chama. A permissão é conferida antes para quem não tem
-- services.manage receber 42501 mesmo com a semana vazia (o DELETE só não apagaria nada).
create function public.set_availability_rules(p_tenant_id uuid, p_professional_id uuid, p_rules jsonb)
returns setof public.availability_rules
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if not (select private.has_permission(p_tenant_id, 'services.manage')) then
    raise exception 'sem permissão para alterar o horário semanal' using errcode = '42501';
  end if;
  -- Dois IFs: o SQL não garante a ordem do OR, e jsonb_array_length falha em objeto.
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception 'p_rules precisa ser um array JSON' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rules) > 70 then
    raise exception 'p_rules tem mais de 70 intervalos' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.professionals p where p.tenant_id = p_tenant_id and p.id = p_professional_id
  ) then
    raise exception 'profissional não encontrado' using errcode = 'P0002';
  end if;

  delete from public.availability_rules r
  where r.tenant_id = p_tenant_id and r.professional_id = p_professional_id;

  return query
  insert into public.availability_rules (tenant_id, professional_id, weekday, start_time, end_time)
  select p_tenant_id, p_professional_id, x.weekday, x.start_time, x.end_time
  from jsonb_to_recordset(p_rules) as x (weekday smallint, start_time time, end_time time)
  returning *;
end;
$$;

revoke execute on function public.set_availability_rules(uuid, uuid, jsonb) from public, anon;
grant execute on function public.set_availability_rules(uuid, uuid, jsonb) to authenticated;

-- Períodos em que o profissional atende entre dois dias locais, inclusive (RN-052): regras do dia da semana
-- convertidas do fuso da empresa para UTC (o Postgres trata horário de verão), mais extras, menos
-- bloqueios (bloqueio vence extra), recortado à janela [p_from 00:00, p_to + 1 00:00) local. Profissional
-- inativo, de outra empresa ou invisível pela RLS devolve vazio. Até 62 dias por chamada. security
-- invoker: a RLS de tenants, professionals e das regras vale para quem chama. Agendamentos, duração e
-- intervalo do serviço entram na Sprint 2.4 (RN-003).
create function public.professional_availability(
  p_tenant_id uuid,
  p_professional_id uuid,
  p_from date,
  p_to date
)
returns table (period tstzrange)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from >= 62 then
    raise exception 'intervalo de datas inválido: de 1 a 62 dias' using errcode = '22023';
  end if;

  return query
  with empresa as (
    select t.timezone as tz,
           tstzrange(p_from::timestamp at time zone t.timezone, (p_to + 1)::timestamp at time zone t.timezone, '[)')
             as janela
    from public.tenants t
    join public.professionals p on p.tenant_id = t.id and p.id = p_professional_id and p.is_active
    where t.id = p_tenant_id
  ),
  dias as (
    select d::date as dia from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  ),
  -- Hora local que não existe no adiantamento do relógio (02:30 vira 07:30 UTC em New York, e 03:00 vira
  -- 07:00 UTC): o intervalo que cai inteiro nessa hora fica com início depois do fim e é descartado.
  semanal as (
    select tstzrange(h.ini, h.fim, '[)') as periodo
    from empresa e
    cross join dias
    join public.availability_rules r
      on r.tenant_id = p_tenant_id
     and r.professional_id = p_professional_id
     and r.weekday = extract(isodow from dias.dia)
    cross join lateral (
      select (dias.dia + r.start_time) at time zone e.tz as ini, (dias.dia + r.end_time) at time zone e.tz as fim
    ) h
    where h.ini < h.fim
  ),
  excecoes as (
    select x.kind, x.period as periodo
    from empresa e
    join public.availability_exceptions x
      on x.tenant_id = p_tenant_id
     and x.professional_id = p_professional_id
     and x.period && e.janela
  ),
  atende as (
    select coalesce(range_agg(periodo), '{}'::tstzmultirange) as m
    from (select periodo from semanal union all select periodo from excecoes where kind = 'extra') s
  ),
  bloqueado as (
    select coalesce(range_agg(periodo), '{}'::tstzmultirange) as m from excecoes where kind = 'blocked'
  )
  select u.period
  from empresa e, atende a, bloqueado b,
       lateral unnest((a.m - b.m) * tstzmultirange(e.janela)) as u (period)
  order by u.period;
end;
$$;

revoke execute on function public.professional_availability(uuid, uuid, date, date) from public, anon;
grant execute on function public.professional_availability(uuid, uuid, date, date) to authenticated;
