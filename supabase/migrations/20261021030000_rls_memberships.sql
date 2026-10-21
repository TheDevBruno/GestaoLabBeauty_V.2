-- Sprint 1.2, passo 5b: políticas de memberships e de roles_permissions, regra do owner
-- (ADR-003 §3 e §4, ADR-008; RN-021, RN-022, RN-023; plano §8).
-- Uma política por operação liberada pelos GRANT do passo 3: SELECT, UPDATE (role) e DELETE.
-- INSERT não tem GRANT para authenticated: criação de membership passa pelo servidor (convites).
-- platform_admins segue sem GRANT e sem política (ADR-003 §6).

-- O usuário atual é owner da empresa? Serve à RN-022 e à regra de owner nas políticas abaixo.
-- Mesmo padrão de private.has_permission: security definer, para não passar pela RLS de memberships.
create function private.is_owner(p_tenant_id uuid)
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
      and m.role = 'owner'
  );
$$;

revoke execute on function private.is_owner(uuid) from public, anon;
grant execute on function private.is_owner(uuid) to authenticated;

-- RN-023: toda empresa tem ao menos um owner. Trigger de linha em AFTER roda ao fim do comando, então
-- uma troca de owner feita em um único UPDATE vale pelo estado final. Quando a própria empresa é
-- apagada, o cascade remove as memberships junto e não há o que proteger: a linha da empresa já não existe.
create function private.ensure_tenant_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.tenants t where t.id = old.tenant_id) then
    return null;
  end if;

  if not exists (
    select 1
    from public.memberships m
    where m.tenant_id = old.tenant_id
      and m.role = 'owner'
  ) then
    raise exception 'toda empresa precisa de ao menos um owner' using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

create trigger memberships_ensure_tenant_has_owner
  after update of role or delete on public.memberships
  for each row execute function private.ensure_tenant_has_owner();

-- Leitura: a própria membership (lista de empresas da RN-025) e, com members.manage, as memberships da
-- empresa (tela de equipe, RN-034). Quem não tem membership não vê nada.
create policy memberships_select_member
  on public.memberships
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.has_permission(tenant_id, 'members.manage'))
  );

-- Troca de papel: exige members.manage (plano §8) e nunca vale para a própria membership (RN-021).
-- Linha com papel owner, antiga ou nova, só o owner altera (RN-022: só owner promove a owner).
-- Em WITH CHECK, a violação vira erro permission denied; em USING, a linha some e o UPDATE afeta 0 linhas.
create policy memberships_update_role
  on public.memberships
  for update
  to authenticated
  using (
    user_id <> (select auth.uid())
    and (select private.has_permission(tenant_id, 'members.manage'))
    and (role <> 'owner' or (select private.is_owner(tenant_id)))
  )
  with check (
    user_id <> (select auth.uid())
    and (select private.has_permission(tenant_id, 'members.manage'))
    and (role <> 'owner' or (select private.is_owner(tenant_id)))
  );

-- Remoção: exige members.manage; membership de owner só o owner remove. Quem tem members.manage pode
-- remover a própria membership (RN-034). A regra de último owner (RN-023) fica no trigger, que vale
-- também para o servidor.
create policy memberships_delete_manage
  on public.memberships
  for delete
  to authenticated
  using (
    (select private.has_permission(tenant_id, 'members.manage'))
    and (role <> 'owner' or (select private.is_owner(tenant_id)))
  );

-- roles_permissions é a matriz global do plano §8, igual para todas as empresas: qualquer authenticated lê.
create policy roles_permissions_select_all
  on public.roles_permissions
  for select
  to authenticated
  using (true);
