-- Seed sintético (Sprint 1.2, passo 7). Aplicado pelo `supabase db reset` depois das migrations
-- (supabase/config.toml, [db.seed]). Só para o banco local: nunca em homologação ou produção (ADR-005).
--
-- Conteúdo: 2 empresas; em cada uma, um usuário por papel (RN-020), com auth.users, auth.identities
-- (login por e-mail), profiles e memberships; 2 profissionais (um ligado ao specialist, um sem ligação);
-- 3 clientes (um com agendamento com o specialist, um só com o outro profissional, um sem agendamento;
-- RN-027 e RN-028) e 2 agendamentos.
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

insert into public.tenants (id, name, slug) values
  ('5eed0000-0000-0000-0000-000000000001', 'Studio Ana (teste)', 'studio-ana'),
  ('5eed0000-0000-0000-0000-000000000002', 'Clinica Bela (teste)', 'clinica-bela')
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
insert into public.clients (id, tenant_id, full_name) values
  ('5eed0000-0000-0000-0004-000000000001', '5eed0000-0000-0000-0000-000000000001', 'Cliente Teste 1 (Studio Ana)'),
  ('5eed0000-0000-0000-0004-000000000002', '5eed0000-0000-0000-0000-000000000001', 'Cliente Teste 2 (Studio Ana)'),
  ('5eed0000-0000-0000-0004-000000000003', '5eed0000-0000-0000-0000-000000000001', 'Cliente Teste 3 (Studio Ana)'),
  ('5eed0000-0000-0000-0004-000000000004', '5eed0000-0000-0000-0000-000000000002', 'Cliente Teste 4 (Clinica Bela)'),
  ('5eed0000-0000-0000-0004-000000000005', '5eed0000-0000-0000-0000-000000000002', 'Cliente Teste 5 (Clinica Bela)'),
  ('5eed0000-0000-0000-0004-000000000006', '5eed0000-0000-0000-0000-000000000002', 'Cliente Teste 6 (Clinica Bela)')
on conflict do nothing;

-- 5. Agendamentos: 01 e 03 com o profissional do specialist; 02 e 04 com o outro profissional.
insert into public.appointments (id, tenant_id, client_id, professional_id) values
  ('5eed0000-0000-0000-0005-000000000001', '5eed0000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0004-000000000001', '5eed0000-0000-0000-0003-000000000001'),
  ('5eed0000-0000-0000-0005-000000000002', '5eed0000-0000-0000-0000-000000000001', '5eed0000-0000-0000-0004-000000000002', '5eed0000-0000-0000-0003-000000000002'),
  ('5eed0000-0000-0000-0005-000000000003', '5eed0000-0000-0000-0000-000000000002', '5eed0000-0000-0000-0004-000000000004', '5eed0000-0000-0000-0003-000000000003'),
  ('5eed0000-0000-0000-0005-000000000004', '5eed0000-0000-0000-0000-000000000002', '5eed0000-0000-0000-0004-000000000005', '5eed0000-0000-0000-0003-000000000004')
on conflict do nothing;

drop table seed_usuario;
