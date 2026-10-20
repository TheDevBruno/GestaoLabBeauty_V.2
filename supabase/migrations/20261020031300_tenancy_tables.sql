-- Sprint 1.2, passo 3: tabelas de tenancy (ADR-003, ADR-008).
-- RLS ligada e SEM políticas: authenticated tem GRANT, mas não vê nem altera linha nenhuma até as
-- políticas dos passos 5a/5b. anon não recebe GRANT em nada. service_role herda os privilégios padrão.

-- Papéis de membro de uma empresa (RN-020, plano §8). platform_admin fica fora (RN-030).
create type public.member_role as enum (
  'owner', 'admin', 'manager', 'specialist', 'receptionist', 'financial'
);
-- Tipos nascem com USAGE para PUBLIC; aqui o acesso também fica explícito.
revoke usage on type public.member_role from public;
grant usage on type public.member_role to authenticated, service_role;

-- Empresas. O slug segue a RN-017; a lista de reservados precisa ficar igual à de src/shared/slug.ts.
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  constraint tenants_slug_key unique (slug),
  constraint tenants_name_not_blank check (btrim(name) <> ''),
  constraint tenants_slug_format check (
    char_length(slug) between 3 and 30
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint tenants_slug_not_reserved check (
    slug not in (
      'app', 'admin', 'api', 'assets', 'auth', 'login', 'logout', 'signup', 'cadastro', 'entrar',
      'sair', 'convite', 'onboarding', 'www', 'static', 'public', 'docs', 'help', 'ajuda', 'suporte',
      'status', 'settings', 'conta', 'labbeautypro'
    )
  )
);

-- Dados do usuário, um por conta em auth.users. Não pertence a uma empresa.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

-- Vínculo usuário × empresa com o papel. Base das funções de autorização do passo 4.
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  -- Índice (user_id, tenant_id) usado pelas funções de autorização (ADR-003 §3).
  constraint memberships_user_tenant_key unique (user_id, tenant_id),
  -- Alvo das FKs compostas (ADR-003 §2).
  constraint memberships_tenant_id_id_key unique (tenant_id, id)
);

-- Administradores da plataforma. Global, sem tenant_id; acesso só pelo servidor e por
-- private.is_platform_admin() (passo 4), por isso nenhum GRANT para authenticated.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Matriz de permissões por papel (plano §8). Global: a mesma para todas as empresas.
create table public.roles_permissions (
  role public.member_role not null,
  permission text not null,
  constraint roles_permissions_pkey primary key (role, permission),
  constraint roles_permissions_permission_format check (permission ~ '^[a-z_]+(\.[a-z_]+)+$')
);

-- tenant_id é imutável (ADR-003 §4): mover uma linha de empresa contornaria as FKs compostas.
create function private.prevent_tenant_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id não pode ser alterado em %.%', tg_table_schema, tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger memberships_prevent_tenant_id_change
  before update of tenant_id on public.memberships
  for each row execute function private.prevent_tenant_id_change();

-- RLS ligada sem políticas: nega tudo para quem não ignora RLS.
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.platform_admins enable row level security;
alter table public.roles_permissions enable row level security;

-- GRANT só das operações que as políticas vão liberar (ADR-008 §2). Nada para anon.
-- Criação de empresa, perfil e membership passa por funções do servidor (onboarding e convites).
grant select on public.tenants to authenticated;
grant update (name) on public.tenants to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

grant select, delete on public.memberships to authenticated;
grant update (role) on public.memberships to authenticated;

grant select on public.roles_permissions to authenticated;
