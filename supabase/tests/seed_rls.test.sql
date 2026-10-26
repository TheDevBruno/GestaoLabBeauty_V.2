-- Passo 7: o seed de supabase/seed.sql não quebra RLS (ADR-003). Os ids são os do seed (5eed0000-…).
-- Com o seed carregado, cada usuário do seed vê só a própria empresa. Sem o seed, a lista de usuários
-- existentes fica vazia e as verificações passam sem comparar nada; por isso o teste de completude
-- exige 0 ou 12 usuários, nunca um seed pela metade.
begin;
select plan(7);

select is(
  array(
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
    order by 1
  ),
  array[]::text[],
  'rls_coverage: nenhuma tabela de public sem RLS, com ou sem o seed'
);

create temporary table seed_usuario (user_id uuid primary key, tenant_id uuid not null);
insert into seed_usuario (user_id, tenant_id) values
  ('5eed0000-0000-0000-0001-000000000001', '5eed0000-0000-0000-0000-000000000001'),
  ('5eed0000-0000-0000-0001-000000000002', '5eed0000-0000-0000-0000-000000000001'),
  ('5eed0000-0000-0000-0001-000000000003', '5eed0000-0000-0000-0000-000000000001'),
  ('5eed0000-0000-0000-0001-000000000004', '5eed0000-0000-0000-0000-000000000001'),
  ('5eed0000-0000-0000-0001-000000000005', '5eed0000-0000-0000-0000-000000000001'),
  ('5eed0000-0000-0000-0001-000000000006', '5eed0000-0000-0000-0000-000000000001'),
  ('5eed0000-0000-0000-0001-000000000007', '5eed0000-0000-0000-0000-000000000002'),
  ('5eed0000-0000-0000-0001-000000000008', '5eed0000-0000-0000-0000-000000000002'),
  ('5eed0000-0000-0000-0001-000000000009', '5eed0000-0000-0000-0000-000000000002'),
  ('5eed0000-0000-0000-0001-000000000010', '5eed0000-0000-0000-0000-000000000002'),
  ('5eed0000-0000-0000-0001-000000000011', '5eed0000-0000-0000-0000-000000000002'),
  ('5eed0000-0000-0000-0001-000000000012', '5eed0000-0000-0000-0000-000000000002');

-- Para cada usuário do seed que existe: vê exatamente a própria empresa e nenhuma linha de outra.
-- Devolve a descrição de cada violação encontrada.
create function pg_temp.seed_violacoes()
returns text[]
language plpgsql
as $$
declare
  r record;
  v_erros text[] := '{}';
  v_outras bigint;
  v_propria bigint;
  v_perfis bigint;
begin
  for r in
    select s.user_id, s.tenant_id
    from seed_usuario s
    where exists (select 1 from auth.users u where u.id = s.user_id)
  loop
    perform tests.authenticate_as(r.user_id);

    select count(*) into v_propria from public.tenants where id = r.tenant_id;
    select count(*) into v_outras
    from (
      select id as tenant_id from public.tenants
      union all select tenant_id from public.memberships
      union all select tenant_id from public.professionals
      union all select tenant_id from public.clients
      union all select tenant_id from public.appointments
      union all select tenant_id from public.services
      union all select tenant_id from public.professional_services
      union all select tenant_id from public.availability_rules
      union all select tenant_id from public.availability_exceptions
    ) x
    where x.tenant_id <> r.tenant_id;
    select count(*) into v_perfis from public.profiles where id <> r.user_id;

    if v_propria <> 1 then
      v_erros := v_erros || format('%s não vê a própria empresa', r.user_id);
    end if;
    if v_outras > 0 then
      v_erros := v_erros || format('%s vê %s linha(s) de outra empresa', r.user_id, v_outras);
    end if;
    if v_perfis > 0 then
      v_erros := v_erros || format('%s vê %s perfil(s) alheio(s)', r.user_id, v_perfis);
    end if;

    perform tests.clear_authentication();
  end loop;
  return v_erros;
end;
$$;

select is(
  pg_temp.seed_violacoes(),
  '{}'::text[],
  'seed: cada usuário do seed vê só a própria empresa e o próprio perfil'
);

select ok(
  (select count(*) from auth.users u join seed_usuario s on s.user_id = u.id) in (0, 12),
  'seed: completo (12 usuários) ou ausente; nunca pela metade'
);

-- Sprint 2.1: com o seed, 6 serviços (2 inativos, 2 sem intervalo) e 6 vínculos; sem ele, nenhum.
select is(
  array[
    (select count(*) from public.services where id::text like '5eed0000-%'),
    (select count(*) from public.services where id::text like '5eed0000-%' and not is_active),
    (select count(*) from public.services where id::text like '5eed0000-%' and buffer_minutes is null),
    (select count(*) from public.professional_services where tenant_id::text like '5eed0000-%')
  ],
  case
    when (select count(*) from auth.users u join seed_usuario s on s.user_id = u.id) = 12
      then array[6, 2, 2, 6]::bigint[]
    else array[0, 0, 0, 0]::bigint[]
  end,
  'seed: serviços e vínculos completos com o seed (6, 2 inativos, 2 sem intervalo, 6 vínculos) ou ausentes'
);

-- Sprint 2.2: com o seed, 18 clientes (15 no Studio Ana, 1 arquivado, 3 sem telefone, 8 sem e-mail);
-- sem ele, nenhum.
select is(
  array[
    (select count(*) from public.clients where id::text like '5eed0000-%'),
    (select count(*) from public.clients where tenant_id = '5eed0000-0000-0000-0000-000000000001'),
    (select count(*) from public.clients where id::text like '5eed0000-%' and not is_active),
    (select count(*) from public.clients where id::text like '5eed0000-%' and phone is null),
    (select count(*) from public.clients where id::text like '5eed0000-%' and email is null)
  ],
  case
    when (select count(*) from auth.users u join seed_usuario s on s.user_id = u.id) = 12
      then array[18, 15, 1, 3, 8]::bigint[]
    else array[0, 0, 0, 0, 0]::bigint[]
  end,
  'seed: clientes completos com o seed (18, 15 no Studio Ana, 1 arquivado, 3 sem telefone, 8 sem e-mail) ou ausentes'
);

-- Sprint 2.3: com o seed, 21 regras (16 no Studio Ana), 4 exceções (1 extra) e a Clinica Bela em
-- America/Manaus; sem ele, nenhuma regra nem exceção.
select is(
  array[
    (select count(*) from public.availability_rules where id::text like '5eed0000-%'),
    (select count(*) from public.availability_rules where tenant_id = '5eed0000-0000-0000-0000-000000000001'),
    (select count(*) from public.availability_exceptions where id::text like '5eed0000-%'),
    (select count(*) from public.availability_exceptions where id::text like '5eed0000-%' and kind = 'extra'),
    (select count(*) from public.tenants where id = '5eed0000-0000-0000-0000-000000000002' and timezone = 'America/Manaus')
  ],
  case
    when (select count(*) from auth.users u join seed_usuario s on s.user_id = u.id) = 12
      then array[21, 16, 4, 1, 1]::bigint[]
    else array[0, 0, 0, 0, 0]::bigint[]
  end,
  'seed: disponibilidade completa com o seed (21 regras, 16 no Studio Ana, 4 exceções, 1 extra, Bela em Manaus) ou ausente'
);

-- Com o seed, a sexta 13/11/2026 do profissional 01 é folga e o sábado 21/11 vai das 09:00 às 17:00
-- (regra até 13:00 + extra 13:00–17:00, num período só). Sem o seed, nenhum período.
select is(
  array[
    (select count(*) from public.professional_availability('5eed0000-0000-0000-0000-000000000001',
      '5eed0000-0000-0000-0003-000000000001', '2026-11-13', '2026-11-13')),
    (select count(*) from public.professional_availability('5eed0000-0000-0000-0000-000000000001',
      '5eed0000-0000-0000-0003-000000000001', '2026-11-21', '2026-11-21')
      where period = tstzrange('2026-11-21 12:00+00', '2026-11-21 20:00+00'))
  ],
  case
    when (select count(*) from auth.users u join seed_usuario s on s.user_id = u.id) = 12
      then array[0, 1]::bigint[]
    else array[0, 0]::bigint[]
  end,
  'seed: folga zera a sexta 13/11 e o extra emenda o sábado 21/11 (09:00–17:00)'
);

select * from finish();
rollback;
