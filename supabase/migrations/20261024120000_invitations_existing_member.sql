-- Sprint 1.3, aprovação (decisão do usuário em 2026-10-23): não criar convite para quem já é membro da
-- empresa (RN-039). Antes, o convite era criado e só o aceite falhava ("já é membro").
-- Vale também para a service role, que ignora a RLS. Triggers BEFORE disparam em ordem alfabética:
-- invitations_check_inviter roda antes deste, então quem não gerencia a empresa recebe 42501 e não
-- descobre se o e-mail é de um membro.

create function private.check_invitation_not_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.tenant_id = new.tenant_id
      and lower(u.email) = new.email
  ) then
    -- O identificador no início da mensagem é o que a API reconhece (server/invitation-store.ts).
    raise exception 'invitations_email_already_member: a pessoa já é membro desta empresa'
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

revoke execute on function private.check_invitation_not_member() from public, anon, authenticated;

create trigger invitations_check_not_member
  before insert on public.invitations
  for each row execute function private.check_invitation_not_member();
