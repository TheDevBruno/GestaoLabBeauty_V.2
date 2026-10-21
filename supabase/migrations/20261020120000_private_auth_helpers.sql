-- Sprint 1.2, passo 4: funções auxiliares de autorização em private e matriz de permissões
-- (ADR-003 §3, ADR-008).

-- authenticated passa a resolver nomes em private para as políticas chamarem as funções abaixo.
-- private continua fora de [api] schemas: o PostgREST não expõe nada daqui.
grant usage on schema private to authenticated;

-- As três funções são security definer para ler memberships e platform_admins sem passar pela RLS
-- dessas tabelas (evita recursão nas políticas de memberships). O papel vem sempre de memberships,
-- nunca de claims do JWT, para a revogação valer na hora (ADR-003 §3).

-- O usuário atual tem membership na empresa?
create function private.is_member(p_tenant_id uuid)
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
  );
$$;

-- O papel do usuário atual na empresa tem a permissão (plano §8)?
-- A restrição "próprio" do specialist não é decidida aqui: as políticas das tabelas aplicam esse
-- recorte com private.specialist_can_see_client (passo 6, ADR-003 §9).
create function private.has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.roles_permissions rp on rp.role = m.role
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
      and rp.permission = p_permission
  );
$$;

-- O usuário atual é administrador da plataforma (RN-030)? Não libera dados de tenants por política
-- (ADR-003 §6); serve ao caminho separado do painel global.
create function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = (select auth.uid())
  );
$$;

-- EXECUTE explícito só para authenticated (ADR-008). O revoke de PUBLIC já é o padrão desde o
-- passo 2; fica repetido aqui para a intenção não depender dele.
revoke execute on function private.is_member(uuid) from public, anon;
revoke execute on function private.has_permission(uuid, text) from public, anon;
revoke execute on function private.is_platform_admin() from public, anon;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_permission(uuid, text) to authenticated;
grant execute on function private.is_platform_admin() to authenticated;

-- Matriz do plano §8. "tenant.settings / branding", "clients.read / write" e "finance.read / write"
-- viram uma permissão cada. "ler" vira só a permissão .read. "próprio" do specialist entra como
-- permissão comum; o recorte por registro fica nas políticas (passo 6).
insert into public.roles_permissions (role, permission)
select r.role::public.member_role, p.permission
from (
  values
    ('owner', array[
      'tenant.settings', 'tenant.branding', 'billing.manage', 'members.manage', 'services.manage',
      'appointments.read', 'appointments.write', 'clients.read', 'clients.write',
      'clients.notes.private', 'finance.read', 'finance.write', 'commissions.read', 'reports.read',
      'ai.use'
    ]),
    ('admin', array[
      'tenant.settings', 'tenant.branding', 'members.manage', 'services.manage',
      'appointments.read', 'appointments.write', 'clients.read', 'clients.write',
      'clients.notes.private', 'finance.read', 'finance.write', 'commissions.read', 'reports.read',
      'ai.use'
    ]),
    ('manager', array[
      'services.manage', 'appointments.read', 'appointments.write', 'clients.read', 'clients.write',
      'clients.notes.private', 'finance.read', 'commissions.read', 'reports.read', 'ai.use'
    ]),
    ('specialist', array[
      'appointments.read', 'appointments.write', 'clients.read', 'clients.write',
      'clients.notes.private', 'commissions.read', 'reports.read'
    ]),
    ('receptionist', array[
      'appointments.read', 'appointments.write', 'clients.read', 'clients.write'
    ]),
    ('financial', array[
      'appointments.read', 'clients.read', 'finance.read', 'finance.write', 'commissions.read',
      'reports.read', 'ai.use'
    ])
) as r (role, permissions)
cross join lateral unnest(r.permissions) as p (permission);
