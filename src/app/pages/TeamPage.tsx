import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SubmitEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { PendingInvitation } from '@/lib/invitations-api';
import { createInvitationSchema } from '@/shared/invitation';
import { memberRoleLabels, memberRoles } from '@/shared/roles';
import { AuthLayout, linkClass } from '@/app/components/AuthLayout';
import { Button } from '@/app/components/Button';
import { SelectField } from '@/app/components/SelectField';
import { TextField } from '@/app/components/TextField';
import { type FieldErrors, fieldErrorsFrom, firstInvalidField } from '@/app/forms/field-errors';
import { focusField } from '@/app/forms/focus-field';
import { RequirePermission } from '@/app/guards/RequirePermission';
import { RequireTenant } from '@/app/guards/RequireTenant';
import { useInvitationsApi } from '@/app/team/invitations-context';
import { invitationsQueryKey } from '@/app/team/queries';
import { useActiveTenant } from '@/app/tenancy/tenancy-context';

const FIELDS = ['email', 'role'] as const;

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

// Equipe e convites: protegida por members.manage (owner e admin, plano §8). A guarda de interface é
// conveniência; quem decide é o banco (RLS e trigger de invitations).
export function TeamPage() {
  return (
    <RequireTenant title="Equipe">
      <RequirePermission permission="members.manage" title="Equipe">
        <TeamContent />
      </RequirePermission>
    </RequireTenant>
  );
}

interface CreatedInvitation {
  email: string;
  link: string;
  expiresAt: string;
}

function TeamContent() {
  const { state } = useActiveTenant();
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  if (state.status !== 'active') return null;
  const { tenantId, tenantName, role } = state.membership;

  return (
    <AuthLayout title="Equipe e convites" wide>
      <p className="text-base text-foreground">
        Convide pessoas para <strong>{tenantName}</strong>. O convite vale por 7 dias e só pode ser
        aceito pela conta com o e-mail convidado.
      </p>
      <InviteForm tenantId={tenantId} isOwner={role === 'owner'} onCreated={setCreated} />
      {/* key: cada convite novo remonta o aviso (foco no título e status da cópia zerado). */}
      {created ? <CreatedInvitationPanel key={created.link} invitation={created} /> : null}
      <PendingInvitations tenantId={tenantId} isOwner={role === 'owner'} />
      <p className="mt-8 text-base">
        <Link to="/app" className={linkClass}>
          Voltar ao painel
        </Link>
      </p>
    </AuthLayout>
  );
}

function InviteForm({
  tenantId,
  isOwner,
  onCreated,
}: {
  tenantId: string;
  isOwner: boolean;
  onCreated: (invitation: CreatedInvitation) => void;
}) {
  const api = useInvitationsApi();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Só o owner convida para owner (RN-022); o banco nega mesmo que a opção seja forjada.
  const roleOptions = memberRoles
    .filter((value) => isOwner || value !== 'owner')
    .map((value) => ({ value, label: memberRoleLabels[value] }));

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const parsed = createInvitationSchema.safeParse({
      email: data.get('email'),
      role: data.get('role'),
    });
    if (!parsed.success) {
      const found = fieldErrorsFrom(parsed.error);
      setErrors(found);
      focusField(formRef.current, firstInvalidField(FIELDS, found));
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await api.create({ ...parsed.data, tenantId });
    setBusy(false);
    if (!result.ok) {
      setFormError(result.message);
      if (result.fieldErrors) {
        setErrors(result.fieldErrors);
        focusField(formRef.current, firstInvalidField(FIELDS, result.fieldErrors));
      }
      return;
    }
    form.reset();
    onCreated({
      email: parsed.data.email,
      link: `${window.location.origin}${result.link}`,
      expiresAt: result.expiresAt,
    });
    void queryClient.invalidateQueries({ queryKey: invitationsQueryKey(tenantId) });
  }

  return (
    <section aria-labelledby="novo-convite" className="mt-6">
      <h2 id="novo-convite" className="text-lg font-semibold">
        Novo convite
      </h2>
      <form
        ref={formRef}
        noValidate
        className="mt-4 flex flex-col gap-5"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <TextField
          name="email"
          label="E-mail da pessoa"
          type="email"
          autoComplete="off"
          inputMode="email"
          required
          error={errors.email}
        />
        <SelectField
          name="role"
          label="Papel"
          options={roleOptions}
          defaultValue="receptionist"
          error={errors.role}
        />
        {formError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        ) : null}
        <Button type="submit" busy={busy} busyLabel="Criando convite…">
          Criar convite
        </Button>
      </form>
    </section>
  );
}

// O token só existe nesta resposta: o link aparece uma vez e não é guardado em lugar nenhum.
function CreatedInvitationPanel({ invitation }: { invitation: CreatedInvitation }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(invitation.link);
      setCopyStatus('Link copiado.');
    } catch {
      setCopyStatus('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  }

  return (
    <section aria-labelledby="convite-criado" className="mt-6 rounded-md border border-success p-4">
      <h2
        id="convite-criado"
        ref={headingRef}
        tabIndex={-1}
        className="rounded-sm text-lg font-semibold text-success outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        Convite criado
      </h2>
      <p className="mt-2 text-base text-foreground">
        Envie o link para <strong className="break-all">{invitation.email}</strong>. Ele vale até{' '}
        {dateTime.format(new Date(invitation.expiresAt))} e <strong>só aparece agora</strong>: copie
        antes de sair desta tela.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <TextField
          name="invitationLink"
          label="Link do convite"
          readOnly
          value={invitation.link}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
        <Button
          variant="secondary"
          onClick={() => {
            void copy();
          }}
        >
          Copiar link
        </Button>
        <p role="status" className="min-h-6 text-sm text-foreground">
          {copyStatus}
        </p>
      </div>
    </section>
  );
}

function PendingInvitations({ tenantId, isOwner }: { tenantId: string; isOwner: boolean }) {
  const api = useInvitationsApi();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: invitationsQueryKey(tenantId),
    queryFn: () => api.listPending(tenantId),
    staleTime: 0,
  });
  const revoke = useMutation({
    mutationFn: (invitation: PendingInvitation) => api.revoke(invitation.id),
    onSuccess: (_data, invitation) => {
      setConfirming(null);
      setStatus(`Convite de ${invitation.email} revogado.`);
    },
    onError: (error) => {
      setRevokeError(error.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: invitationsQueryKey(tenantId) }),
  });

  return (
    <section aria-labelledby="convites-pendentes" className="mt-8">
      <h2 id="convites-pendentes" className="text-lg font-semibold">
        Convites pendentes
      </h2>
      <p role="status" className="mt-2 min-h-6 text-sm text-foreground">
        {status}
      </p>
      {revokeError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {revokeError}
        </p>
      ) : null}
      {query.isPending ? (
        <p className="mt-2 text-base text-muted-foreground" aria-busy="true">
          Carregando convites…
        </p>
      ) : query.isError ? (
        <div className="mt-2 flex flex-col gap-3">
          <p role="alert" className="text-base font-medium text-destructive">
            Não foi possível carregar os convites.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              void query.refetch();
            }}
          >
            Tentar de novo
          </Button>
        </div>
      ) : query.data.length === 0 ? (
        <p className="mt-2 text-base text-muted-foreground">Nenhum convite pendente.</p>
      ) : (
        <ul
          aria-labelledby="convites-pendentes"
          className="mt-2 flex flex-col divide-y divide-border"
        >
          {query.data.map((invitation) => (
            <PendingInvitationItem
              key={invitation.id}
              invitation={invitation}
              // Convite de owner só o owner revoga (política invitations_update_revoke).
              canRevoke={invitation.role !== 'owner' || isOwner}
              confirming={confirming === invitation.id}
              busy={revoke.isPending && revoke.variables.id === invitation.id}
              onAsk={() => {
                setStatus(null);
                setRevokeError(null);
                setConfirming(invitation.id);
              }}
              onCancel={() => {
                setConfirming(null);
              }}
              onConfirm={() => {
                revoke.mutate(invitation);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PendingInvitationItem({
  invitation,
  canRevoke,
  confirming,
  busy,
  onAsk,
  onCancel,
  onConfirm,
}: {
  invitation: PendingInvitation;
  canRevoke: boolean;
  confirming: boolean;
  busy: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Hora lida uma vez ao montar o item; a lista é buscada de novo a cada mudança.
  const [now] = useState(() => Date.now());
  const expired = new Date(invitation.expiresAt).getTime() <= now;
  const expiresText = dateTime.format(new Date(invitation.expiresAt));
  const roleLabel = memberRoleLabels[invitation.role];

  return (
    <li className="flex flex-col gap-3 py-4">
      <div>
        <p className="break-all text-base font-medium text-foreground">{invitation.email}</p>
        <p className="text-sm text-muted-foreground">
          {roleLabel} ·{' '}
          {expired ? (
            <span className="font-medium text-destructive">Expirado em {expiresText}</span>
          ) : (
            `Vale até ${expiresText}`
          )}
        </p>
      </div>
      {canRevoke && confirming ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="text-sm text-foreground sm:flex-1">O link deixa de funcionar. Revogar?</p>
          <Button busy={busy} busyLabel="Revogando…" onClick={onConfirm}>
            Confirmar revogação
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        </div>
      ) : canRevoke ? (
        <Button
          variant="secondary"
          className="self-start"
          aria-label={`Revogar convite de ${invitation.email}`}
          onClick={onAsk}
        >
          Revogar
        </Button>
      ) : null}
    </li>
  );
}
