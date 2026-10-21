-- Sprint 1.2, passo 5a: políticas RLS de tenants e profiles (ADR-003 §3 e §4, ADR-008).
-- Uma política por operação liberada pelos GRANT do passo 3. INSERT e DELETE não têm GRANT para
-- authenticated nessas tabelas (onboarding e exclusão passam pelo servidor), então também não têm
-- política: a tentativa termina em permission denied antes da RLS.
-- Nenhuma política considera private.is_platform_admin(): o painel global usa outro caminho (ADR-003 §6).

-- tenants: o membro vê a própria empresa; só quem tem tenant.settings altera o nome.
create policy tenants_select_member
  on public.tenants
  for select
  to authenticated
  using ((select private.is_member(id)));

create policy tenants_update_settings
  on public.tenants
  for update
  to authenticated
  using ((select private.has_permission(id, 'tenant.settings')))
  with check ((select private.has_permission(id, 'tenant.settings')));

-- profiles: cada usuário vê e altera só o próprio perfil. Ver o perfil de colegas da mesma empresa
-- fica para quando a tela de equipe existir, com função própria em private.
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
