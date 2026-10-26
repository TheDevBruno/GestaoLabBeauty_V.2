-- Seed sintético (Sprint 1.2, passo 7). Aplicado pelo `supabase db reset` depois das migrations
-- (supabase/config.toml, [db.seed]). Só para o banco local: nunca em homologação ou produção (ADR-005).
--
-- Conteúdo: 2 empresas; em cada uma, um usuário por papel (RN-020), com auth.users, auth.identities
-- (login por e-mail), profiles e memberships; 2 profissionais (um ligado ao specialist, um sem ligação);
-- 3 clientes (um com agendamento com o specialist, um só com o outro profissional, um sem agendamento;
-- RN-027 e RN-028) e 2 agendamentos. Desde a Sprint 2.1: 3 serviços (um com intervalo, um sem, um
-- inativo; RN-040 e RN-042) e 3 vínculos profissional × serviço (o profissional do specialist faz 2 dos
-- 3 serviços, o outro faz 1; RN-043). Desde a Sprint 2.2: contato e nascimento nos clientes e 12 clientes
-- a mais no Studio Ana, um deles arquivado (RN-045 a RN-047). Desde a Sprint 2.3: Studio Ana em
-- America/Sao_Paulo e Clinica Bela em America/Manaus (RN-048), horário semanal de 3 dos 4 profissionais
-- (o 04 fica sem horário) e 4 exceções em datas fixas de novembro de 2026 (RN-049, RN-050).
--
-- Senha de teste, só local: senha-teste-labbeautypro. Não vai para .env nem para homologação/produção.
-- Ids começam em 5eed0000 para não colidir com os ids de supabase/tests (00000000-…-00000000000a/b).
-- E-mails em @example.test e nomes fictícios.

create temporary table seed_usuario (
  id uuid primary key,
  email text not null,
  full_name text not null,
  tenant_id uuid not null,
  role public.member_role not null
);

insert into seed_usuario (id, email, full_name, tenant_id, role) values
  ('5eed0000-0000-0000-0001-000000000001', 'ana.owner@example.test', 'Owner Teste (Studio Ana)', '5eed0000-0000-0000-0000-000000000001', 'owner'),
  ('5eed0000-0000-0000-0001-000000000002', 'ana.admin@example.test', 'Admin Teste (Studio Ana)', '5eed0000-0000-0000-0000-000000000001', 'admin'),
  ('5eed0000-0000-0000-0001-000000000003', 'ana.manager@example.test', 'Manager Teste (Studio Ana)', '5eed0000-0000-0000-0000-000000000001', 'manager'),
  ('5eed0000-0000-0000-0001-000000000004', 'ana.specialist@example.test', 'Specialist Teste (Studio Ana)', '5eed0000-0000-0000-0000-000000000001', 'specialist'),
  ('5eed0000-0000-0000-0001-000000000005', 'ana.receptionist@example.test', 'Receptionist Teste (Studio Ana)', '5eed0000-0000-0000-0000-000000000001', 'receptionist'),
  ('5eed0000-0000-0000-0001-000000000006', 'ana.financial@example.test', 'Financial Teste (Studio Ana)', '5eed0000-0000-0000-0000-000000000001', 'financial'),
  ('5eed0000-0000-0000-0001-000000000007', 'bela.owner@example.test', 'Owner Teste (Clinica Bela)', '5eed0000-0000-0000-0000-000000000002', 'owner'),
  ('5eed0000-0000-0000-0001-000000000008', 'bela.admin@example.test', 'Admin Teste (Clinica Bela)', '5eed0000-0000-0000-0000-000000000002', 'admin'),
  ('5eed0000-0000-0000-0001-000000000009', 'bela.manager@example.test', 'Manager Teste (Clinica Bela)', '5eed0000-0000-0000-0000-000000000002', 'manager'),
  ('5eed0000-0000-0000-0001-000000000010', 'bela.specialist@example.test', 'Specialist Teste (Clinica Bela)', '5eed0000-0000-0000-0000-000000000002', 'specialist'),
  ('5eed0000-0000-0000-0001-000000000011', 'bela.receptionist@example.test', 'Receptionist Teste (Clinica Bela)', '5eed0000-0000-0000-0000-000000000002', 'receptionist'),
  ('5eed0000-0000-0000-0001-000000000012', 'bela.financial@example.test', 'Financial Teste (Clinica Bela)', '5eed0000-0000-0000-0000-000000000002', 'financial');

-- 1. Contas com login local. Senha com bcrypt (pgcrypto, schema extensions). Os campos de token ficam ''
-- (não NULL): o GoTrue falha ao ler o usuário com NULL nessas colunas.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  s.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', s.email,
  extensions.crypt('senha-teste-labbeautypro', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  jsonb_build_object('full_name', s.full_name), now(), now()
from seed_usuario s
on conflict do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select
  s.id::text, s.id, jsonb_build_object('sub', s.id::text, 'email', s.email, 'email_verified', true),
  'email', now(), now()
from seed_usuario s
on conflict do nothing;

-- 2. Perfis, empresas e memberships. O owner de cada empresa é criado aqui; o trigger de RN-023 só age
-- em UPDATE e DELETE, então a inserção direta não o dispara.
insert into public.profiles (id, full_name)
select s.id, s.full_name from seed_usuario s
on conflict do nothing;

-- Fuso (Sprint 2.3): a Clinica Bela fica em Manaus (UTC−4) para o cálculo ter um fuso diferente do padrão.
insert into public.tenants (id, name, slug, timezone) values
  ('5eed0000-0000-0000-0000-000000000001', 'Studio Ana (teste)', 'studio-ana', 'America/Sao_Paulo'),
  ('5eed0000-0000-0000-0000-000000000002', 'Clinica Bela (teste)', 'clinica-bela', 'America/Manaus')
on conflict do nothing;

insert into public.memberships (id, tenant_id, user_id, role)
select
  ('5eed0000-0000-0000-0002-0000000000' || lpad(right(s.id::text, 2), 2, '0'))::uuid,
  s.tenant_id, s.id, s.role
from seed_usuario s
on conflict do nothing;

-- 3. Profissionais: 01 e 03 ligados ao specialist de cada empresa; 02 e 04 sem ligação.
insert into public.professionals (id, tenant_id, membership_id, display_name) values
  ('5eed0000-0000-0000-0003-000000000001', '5eed0000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0002-000000000004', 'Profissional Teste 1 (Studio Ana)'),
  ('5eed0000-0000-0000-0003-000000000002', '5eed0000-0000-0000-0000-000000000001', null, 'Profissional Teste 2 (Studio Ana)'),
  ('5eed0000-0000-0000-0003-000000000003', '5eed0000-0000-0000-0000-000000000002', '5eed0000-0000-0000-0002-000000000010', 'Profissional Teste 3 (Clinica Bela)'),
  ('5eed0000-0000-0000-0003-000000000004', '5eed0000-0000-0000-0000-000000000002', null, 'Profissional Teste 4 (Clinica Bela)')
on conflict do nothing;

-- 4. Clientes: 01 e 04 têm agendamento com o specialist; 02 e 05 só com o outro profissional; 03 e 06 sem.
-- Desde a Sprint 2.2 (RN-045 a RN-047): contato e nascimento fictícios, alguns vazios; 07 a 18 só no
-- Studio Ana, sem agendamento, com acentos no nome para a busca e o 18 arquivado. Telefones em E.164 na
-- faixa +55 11 90000-xxxx (DDD 21 na Clinica Bela) e e-mails em @example.test.
insert into public.clients (id, tenant_id, full_name, phone, email, birth_date, is_active) values
  ('5eed0000-0000-0000-0004-000000000001', '5eed0000-0000-0000-0000-000000000001', 'Cliente Teste 1 (Studio Ana)', '+5511900000001', 'cliente1@example.test', '1990-03-15', true),
  ('5eed0000-0000-0000-0004-000000000002', '5eed0000-0000-0000-0000-000000000001', 'Cliente Teste 2 (Studio Ana)', '+5511900000002', null, null, true),
  ('5eed0000-0000-0000-0004-000000000003', '5eed0000-0000-0000-0000-000000000001', 'Cliente Teste 3 (Studio Ana)', null, null, null, true),
  ('5eed0000-0000-0000-0004-000000000004', '5eed0000-0000-0000-0000-000000000002', 'Cliente Teste 4 (Clinica Bela)', '+5521900000004', 'cliente4@example.test', '1985-07-02', true),
  ('5eed0000-0000-0000-0004-000000000005', '5eed0000-0000-0000-0000-000000000002', 'Cliente Teste 5 (Clinica Bela)', '+5521900000005', null, '2001-11-30', true),
  ('5eed0000-0000-0000-0004-000000000006', '5eed0000-0000-0000-0000-000000000002', 'Cliente Teste 6 (Clinica Bela)', null, 'cliente6@example.test', null, true),
  ('5eed0000-0000-0000-0004-000000000007', '5eed0000-0000-0000-0000-000000000001', 'Joana Conceição Teste', '+5511900000007', 'joana.teste@example.test', '1992-01-20', true),
  ('5eed0000-0000-0000-0004-000000000008', '5eed0000-0000-0000-0000-000000000001', 'João Pereira Teste', '+5511900000008', null, '1979-06-08', true),
  ('5eed0000-0000-0000-0004-000000000009', '5eed0000-0000-0000-0000-000000000001', 'Márcia Antunes Teste', '+5511900000009', 'marcia.teste@example.test', null, true),
  ('5eed0000-0000-0000-0004-000000000010', '5eed0000-0000-0000-0000-000000000001', 'Lúcia Ribeiro Teste', '+5511900000010', null, '1965-09-12', true),
  ('5eed0000-0000-0000-0004-000000000011', '5eed0000-0000-0000-0000-000000000001', 'Ângela Souza Teste', '+5511900000011', 'angela.teste@example.test', '1988-12-25', true),
  ('5eed0000-0000-0000-0004-000000000012', '5eed0000-0000-0000-0000-000000000001', 'Íris Carvalho Teste', null, 'iris.teste@example.test', '2000-02-29', true),
  ('5eed0000-0000-0000-0004-000000000013', '5eed0000-0000-0000-0000-000000000001', 'Otávio Nunes Teste', '+5511900000013', null, null, true),
  ('5eed0000-0000-0000-0004-000000000014', '5eed0000-0000-0000-0000-000000000001', 'Débora Lima Teste', '+5511900000014', 'debora.teste@example.test', '1995-04-03', true),
  ('5eed0000-0000-0000-0004-000000000015', '5eed0000-0000-0000-0000-000000000001', 'Beatriz Gonçalves Teste', '+5511900000015', null, '1983-08-17', true),
  ('5eed0000-0000-0000-0004-000000000016', '5eed0000-0000-0000-0000-000000000001', 'Renée Martins Teste', '+5511900000016', 'renee.teste@example.test', null, true),
  ('5eed0000-0000-0000-0004-000000000017', '5eed0000-0000-0000-0000-000000000001', 'Cauã Barbosa Teste', '+5511900000017', null, '2004-10-05', true),
  ('5eed0000-0000-0000-0004-000000000018', '5eed0000-0000-0000-0000-000000000001', 'Sônia Prado Teste (arquivada)', '+5511900000018', 'sonia.teste@example.test', '1958-05-21', false)
on conflict do nothing;

-- 5. Agendamentos: 01 e 03 com o profissional do specialist; 02 e 04 com o outro profissional.
insert into public.appointments (id, tenant_id, client_id, professional_id) values
  ('5eed0000-0000-0000-0005-000000000001', '5eed0000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0004-000000000001', '5eed0000-0000-0000-0003-000000000001'),
  ('5eed0000-0000-0000-0005-000000000002', '5eed0000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0004-000000000002', '5eed0000-0000-0000-0003-000000000002'),
  ('5eed0000-0000-0000-0005-000000000003', '5eed0000-0000-0000-0000-000000000002', '5eed0000-0000-0000-0004-000000000004', '5eed0000-0000-0000-0003-000000000003'),
  ('5eed0000-0000-0000-0005-000000000004', '5eed0000-0000-0000-0000-000000000002', '5eed0000-0000-0000-0004-000000000005', '5eed0000-0000-0000-0003-000000000004')
on conflict do nothing;

-- 6. Serviços (Sprint 2.1): em cada empresa, um com intervalo, um sem intervalo e um inativo. Preço em
-- centavos (RN-032), moeda no padrão BRL.
insert into public.services (id, tenant_id, name, description, duration_minutes, buffer_minutes, price_cents, is_active) values
  ('5eed0000-0000-0000-0006-000000000001', '5eed0000-0000-0000-0000-000000000001', 'Corte Teste (Studio Ana)', 'Serviço fictício com intervalo.', 60, 15, 12000, true),
  ('5eed0000-0000-0000-0006-000000000002', '5eed0000-0000-0000-0000-000000000001', 'Manicure Teste (Studio Ana)', null, 45, null, 4500, true),
  ('5eed0000-0000-0000-0006-000000000003', '5eed0000-0000-0000-0000-000000000001', 'Escova Teste (Studio Ana)', 'Serviço fictício inativo.', 30, 5, 6000, false),
  ('5eed0000-0000-0000-0006-000000000004', '5eed0000-0000-0000-0000-000000000002', 'Limpeza de Pele Teste (Clinica Bela)', 'Serviço fictício com intervalo.', 90, 30, 18000, true),
  ('5eed0000-0000-0000-0006-000000000005', '5eed0000-0000-0000-0000-000000000002', 'Design de Sobrancelha Teste (Clinica Bela)', null, 30, null, 5000, true),
  ('5eed0000-0000-0000-0006-000000000006', '5eed0000-0000-0000-0000-000000000002', 'Massagem Teste (Clinica Bela)', 'Serviço fictício inativo.', 60, 10, 15000, false)
on conflict do nothing;

-- 7. Vínculos: o profissional do specialist faz o serviço com intervalo e o sem intervalo; o outro faz
-- só o com intervalo. O serviço inativo fica sem profissional.
insert into public.professional_services (tenant_id, professional_id, service_id) values
  ('5eed0000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0003-000000000001', '5eed0000-0000-0000-0006-000000000001'),
  ('5eed0000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0003-000000000001', '5eed0000-0000-0000-0006-000000000002'),
  ('5eed0000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0003-000000000002', '5eed0000-0000-0000-0006-000000000001'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0000-0000-0000-0003-000000000003', '5eed0000-0000-0000-0006-000000000004'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0000-0000-0000-0003-000000000003', '5eed0000-0000-0000-0006-000000000005'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0000-0000-0000-0003-000000000004', '5eed0000-0000-0000-0006-000000000004')
on conflict do nothing;

-- 8. Horário semanal (Sprint 2.3, RN-049), em hora local da empresa; dia ISO (1 = segunda … 7 = domingo).
-- Profissional 01: segunda a sexta 09:00–12:00 e 13:00–18:00 (almoço no meio) e sábado 09:00–13:00.
-- Profissional 02: terça a sábado 10:00–19:00. Profissional 03 (Manaus): segunda a sexta 08:00–17:00.
-- Profissional 04: sem horário (a tela mostra "Não atende" em todos os dias).
insert into public.availability_rules (id, tenant_id, professional_id, weekday, start_time, end_time)
select
  ('5eed0000-0000-0000-0007-0000000000' || lpad(row_number() over (order by r.professional_id, r.weekday, r.start_time)::text, 2, '0'))::uuid,
  r.tenant_id, r.professional_id, r.weekday, r.start_time, r.end_time
from (
  select '5eed0000-0000-0000-0000-000000000001'::uuid, '5eed0000-0000-0000-0003-000000000001'::uuid, d::smallint, t.inicio, t.fim
  from generate_series(1, 5) d
  cross join (values ('09:00'::time, '12:00'::time), ('13:00'::time, '18:00'::time)) t (inicio, fim)
  union all
  select '5eed0000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0003-000000000001', 6, '09:00', '13:00'
  union all
  select '5eed0000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0003-000000000002', d::smallint, '10:00', '19:00'
  from generate_series(2, 6) d
  union all
  select '5eed0000-0000-0000-0000-000000000002', '5eed0000-0000-0000-0003-000000000003', d::smallint, '08:00', '17:00'
  from generate_series(1, 5) d
) r (tenant_id, professional_id, weekday, start_time, end_time)
on conflict do nothing;

-- 9. Exceções (Sprint 2.3, RN-050), em UTC; datas fixas para o seed ser determinístico.
-- Studio Ana (UTC−3): folga de dia inteiro na sexta 13/11, bloqueio 14:00–16:00 na quarta 18/11 e
-- sábado 21/11 com horário extra 13:00–17:00, todos do profissional 01. Clinica Bela (UTC−4): feriado
-- de dia inteiro na sexta 20/11 para o profissional 03.
insert into public.availability_exceptions (id, tenant_id, professional_id, kind, period, reason) values
  ('5eed0000-0000-0000-0008-000000000001', '5eed0000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0003-000000000001',
   'blocked', '[2026-11-13 03:00+00,2026-11-14 03:00+00)', 'Folga'),
  ('5eed0000-0000-0000-0008-000000000002', '5eed0000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0003-000000000001',
   'blocked', '[2026-11-18 17:00+00,2026-11-18 19:00+00)', 'Reunião de equipe'),
  ('5eed0000-0000-0000-0008-000000000003', '5eed0000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0003-000000000001',
   'extra', '[2026-11-21 16:00+00,2026-11-21 20:00+00)', null),
  ('5eed0000-0000-0000-0008-000000000004', '5eed0000-0000-0000-0000-000000000002', '5eed0000-0000-0000-0003-000000000003',
   'blocked', '[2026-11-20 04:00+00,2026-11-21 04:00+00)', 'Feriado')
on conflict do nothing;

drop table seed_usuario;
