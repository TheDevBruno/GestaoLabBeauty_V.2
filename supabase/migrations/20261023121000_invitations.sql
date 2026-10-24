-- Sprint 1.3, passo 2: convites de membros (ADR-002 §3, ADR-003, ADR-008; RN-022, RN-026, RN-038).
-- Criação: pela API (service role), que gera o token e grava só o hash. Leitura e revogação: direto sob
-- RLS, com members.manage. Aceite: função public.accept_invitation, que cria a membership.

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null,
  role public.member_role not null,
  -- sha-256 do token em hexadecimal (RN-026): o token em si nunca é guardado.
  token_hash text not null,
  invited_by uuid references auth.users (id) on delete set null,
  -- RN-026: o convite expira em 7 dias.
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_tenant_id_id_key unique (tenant_id, id),
  constraint invitations_token_hash_key unique (token_hash),
  constraint invitations_email_format check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  constraint invitations_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint invitations_expires_after_creation check (expires_at > created_at),
  constraint invitations_accepted_or_revoked check (accepted_at is null or revoked_at is null),
  -- accepted_by pode virar NULL se a conta for apagada, mas nunca existe sem accepted_at.
  constraint invitations_accepted_by_needs_accepted_at check (accepted_at is not null or accepted_by is null)
);

-- Um convite pendente por e-mail e empresa. Pendente = nem aceito nem revogado; expirado continua
-- pendente até alguém revogá-lo, então o servidor revoga o expirado antes de criar outro.
create unique index invitations_pending_email_key
  on public.invitations (tenant_id, email)
  where accepted_at is null and revoked_at is null;

create index invitations_tenant_id_idx on public.invitations (tenant_id);

-- tenant_id é imutável (ADR-003 §4).
create trigger invitations_prevent_tenant_id_change
  before update of tenant_id on public.invitations
  for each row execute function private.prevent_tenant_id_change();

-- RN-026 e RN-022 valem também para a service role, que ignora a RLS: quem convida precisa ter
-- members.manage na empresa e só um owner convida para owner.
create function private.check_invitation_inviter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.invited_by is null then
    raise exception 'convite exige quem convida' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1
    from public.memberships m
    join public.roles_permissions rp on rp.role = m.role
    where m.tenant_id = new.tenant_id
      and m.user_id = new.invited_by
      and rp.permission = 'members.manage'
  ) then
    raise exception 'quem convida precisa de members.manage' using errcode = 'insufficient_privilege';
  end if;

  if new.role = 'owner' and not exists (
    select 1
    from public.memberships m
    where m.tenant_id = new.tenant_id
      and m.user_id = new.invited_by
      and m.role = 'owner'
  ) then
    raise exception 'só owner convida para owner' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

revoke execute on function private.check_invitation_inviter() from public, anon, authenticated;

create trigger invitations_check_inviter
  before insert on public.invitations
  for each row execute function private.check_invitation_inviter();

alter table public.invitations enable row level security;

-- GRANT mínimo (ADR-008). token_hash fica fora do SELECT: nem quem gerencia a equipe o lê. Por isso o
-- cliente lista as colunas; "select *" é negado. Sem INSERT nem DELETE: criar é com o servidor.
grant select (id, tenant_id, email, role, invited_by, expires_at, accepted_at, accepted_by, revoked_at, created_at)
  on public.invitations to authenticated;
grant update (revoked_at) on public.invitations to authenticated;

create policy invitations_select_manage
  on public.invitations
  for select
  to authenticated
  using ((select private.has_permission(tenant_id, 'members.manage')));

-- Revogar: members.manage, só convite ainda pendente, e convite de owner só o owner revoga.
create policy invitations_update_revoke
  on public.invitations
  for update
  to authenticated
  using (
    (select private.has_permission(tenant_id, 'members.manage'))
    and accepted_at is null
    and revoked_at is null
    and (role <> 'owner' or (select private.is_owner(tenant_id)))
  )
  with check (
    (select private.has_permission(tenant_id, 'members.manage'))
    and accepted_at is null
    and revoked_at is not null
    and (role <> 'owner' or (select private.is_owner(tenant_id)))
  );

-- Aceite (RN-038). security definer porque cria a membership, que não tem INSERT para authenticated.
-- Valida identidade (auth.uid()), token (hash), validade, uso único e o e-mail da conta, que precisa
-- estar confirmado. Toda falha de validação devolve a mesma mensagem, para não revelar se o token existe.
create function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_invitation public.invitations;
begin
  if v_user_id is null then
    raise exception 'não autenticado' using errcode = 'insufficient_privilege';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_user_id and u.email_confirmed_at is not null;

  select * into v_invitation
  from public.invitations i
  where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex')
  for update;

  if v_email is null
    or not found
    or v_invitation.accepted_at is not null
    or v_invitation.revoked_at is not null
    or v_invitation.expires_at <= now()
    or v_invitation.email <> v_email
  then
    raise exception 'convite inválido' using errcode = 'check_violation';
  end if;

  insert into public.memberships (tenant_id, user_id, role)
  values (v_invitation.tenant_id, v_user_id, v_invitation.role);

  update public.invitations
  set accepted_at = now(), accepted_by = v_user_id
  where id = v_invitation.id;

  return v_invitation.tenant_id;
exception
  when unique_violation then
    raise exception 'já é membro desta empresa' using errcode = 'unique_violation';
end;
$$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
