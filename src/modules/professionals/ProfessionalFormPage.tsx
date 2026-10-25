import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type SubmitEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { professionalFormSchema } from '@/shared/professional';
import { memberRoleLabels } from '@/shared/roles';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CheckboxField, FieldError, InputField, SelectField } from '@/components/ui/field';
import { TextLink } from '@/components/ui/text-link';
import type { SavedNoticeState } from '@/app/forms/saved-notice';
import { type FieldErrors, fieldErrorsFrom, firstInvalidField } from '@/app/forms/field-errors';
import { focusField } from '@/app/forms/focus-field';
import { RequirePermission } from '@/app/guards/RequirePermission';
import { ShellPage } from '@/app/shell/ShellPage';
import { useActiveTenant } from '@/app/tenancy/tenancy-context';
import type { Service } from '@/modules/services/services-api';
import { servicesQueryKey, useServicesApi } from '@/modules/services/services-context';
import type { LinkCandidate, Professional } from './professionals-api';
import {
  linkCandidatesQueryKey,
  professionalQueryKey,
  professionalsQueryKey,
  useProfessionalsApi,
} from './professionals-context';

const FIELDS = ['displayName', 'membershipId', 'serviceIds'] as const;

function useTenantId(): string {
  const { state } = useActiveTenant();
  return state.status === 'active' ? state.membership.tenantId : '';
}

// /app/profissionais/novo
export function ProfessionalNewPage() {
  return (
    <RequirePermission permission="services.manage" title="Novo profissional">
      <ShellPage title="Novo profissional">
        <ProfessionalFormLoader professional={null} />
      </ShellPage>
    </RequirePermission>
  );
}

// /app/profissionais/:id
export function ProfessionalEditPage() {
  return (
    <RequirePermission permission="services.manage" title="Editar profissional">
      <ProfessionalEditContent />
    </RequirePermission>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p role="alert" className="text-base font-medium text-destructive">
        {message}
      </p>
      <Button variant="outline" className="self-start" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}

function ProfessionalEditContent() {
  const api = useProfessionalsApi();
  const tenantId = useTenantId();
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: professionalQueryKey(tenantId, id),
    queryFn: () => api.get(tenantId, id),
    enabled: tenantId !== '',
  });

  if (query.isPending) {
    return (
      <ShellPage title="Editar profissional">
        <p role="status" className="text-base text-muted-foreground">
          Carregando profissional…
        </p>
      </ShellPage>
    );
  }
  if (query.isError) {
    return (
      <ShellPage title="Editar profissional">
        <LoadError
          message="Não foi possível carregar o profissional."
          onRetry={() => {
            void query.refetch();
          }}
        />
      </ShellPage>
    );
  }
  if (query.data === null) {
    return (
      <ShellPage title="Profissional não encontrado">
        <p className="text-base text-foreground">
          Este profissional não existe ou não pertence a esta empresa.
        </p>
        <p className="mt-6 text-base">
          <TextLink to="/app/profissionais">Voltar para profissionais</TextLink>
        </p>
      </ShellPage>
    );
  }
  return (
    <ShellPage title="Editar profissional">
      {/* key: trocar de profissional pela URL remonta o formulário com os valores novos. */}
      <ProfessionalFormLoader key={query.data.id} professional={query.data} />
      <DeleteProfessional professional={query.data} />
    </ShellPage>
  );
}

// O formulário só aparece com os serviços e os candidatos ao vínculo carregados, para os campos já
// nascerem com as opções certas.
function ProfessionalFormLoader({ professional }: { professional: Professional | null }) {
  const api = useProfessionalsApi();
  const servicesApi = useServicesApi();
  const tenantId = useTenantId();
  const services = useQuery({
    queryKey: servicesQueryKey(tenantId),
    queryFn: () => servicesApi.list(tenantId),
    enabled: tenantId !== '',
  });
  const candidates = useQuery({
    queryKey: linkCandidatesQueryKey(tenantId),
    queryFn: () => api.listCandidates(tenantId),
    enabled: tenantId !== '',
  });

  if (services.isPending || candidates.isPending) {
    return (
      <p role="status" className="text-base text-muted-foreground">
        Carregando formulário…
      </p>
    );
  }
  if (services.isError || candidates.isError) {
    return (
      <LoadError
        message="Não foi possível carregar os serviços e os membros da empresa."
        onRetry={() => {
          void services.refetch();
          void candidates.refetch();
        }}
      />
    );
  }
  return (
    <ProfessionalForm
      professional={professional}
      services={services.data}
      candidates={candidates.data}
    />
  );
}

// "Nenhum" e os membros ainda sem profissional, mais o membro já ligado a este profissional.
function memberOptions(candidates: LinkCandidate[], professional: Professional | null) {
  const free = candidates.filter(
    (item) => item.professionalId === null || item.professionalId === professional?.id,
  );
  const options = [
    { value: '', label: 'Nenhum (sem acesso ao sistema)' },
    ...free.map((item) => ({
      value: item.membershipId,
      label: `${item.fullName ?? 'Membro sem nome'} (${memberRoleLabels[item.role]})`,
    })),
  ];
  const current = professional?.membershipId;
  if (current && !free.some((item) => item.membershipId === current)) {
    options.push({ value: current, label: 'Membro ligado atualmente' });
  }
  return options;
}

// Serviços ativos (RN-042) e os inativos a que o profissional já está ligado, marcados como inativos:
// assim desmarcar continua possível e salvar não apaga um vínculo que a pessoa não viu.
function serviceChoices(services: Service[], professional: Professional | null) {
  const linked = new Set(professional?.serviceIds ?? []);
  return services.filter((service) => service.isActive || linked.has(service.id));
}

function ProfessionalForm({
  professional,
  services,
  candidates,
}: {
  professional: Professional | null;
  services: Service[];
  candidates: LinkCandidate[];
}) {
  const api = useProfessionalsApi();
  const tenantId = useTenantId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isEdit = professional !== null;
  const choices = serviceChoices(services, professional);
  const linked = new Set(professional?.serviceIds ?? []);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const data = new FormData(event.currentTarget);
    const parsed = professionalFormSchema.safeParse({
      displayName: data.get('displayName') ?? '',
      membershipId: data.get('membershipId') ?? '',
      serviceIds: data.getAll('serviceIds'),
      isActive: data.get('isActive') === 'on',
    });
    if (!parsed.success) {
      const found = fieldErrorsFrom(parsed.error);
      setErrors(found);
      focusField(formRef.current, firstInvalidField(FIELDS, found));
      return;
    }
    setErrors({});
    setBusy(true);
    const result = isEdit
      ? await api.update(tenantId, professional, parsed.data)
      : await api.create(tenantId, parsed.data);
    if (!result.ok) {
      setBusy(false);
      setFormError(result.message);
      if (result.fieldErrors) {
        setErrors(result.fieldErrors);
        focusField(formRef.current, firstInvalidField(FIELDS, result.fieldErrors));
      }
      return;
    }
    await queryClient.invalidateQueries({ queryKey: professionalsQueryKey(tenantId) });
    const name = result.professional.displayName;
    const notice = !result.linksSaved
      ? `Profissional “${name}” salvo, mas os serviços não foram atualizados. Abra o cadastro para tentar de novo.`
      : isEdit
        ? `Alterações em “${name}” salvas.`
        : `Profissional “${name}” cadastrado.`;
    void navigate('/app/profissionais', { state: { notice } satisfies SavedNoticeState });
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <InputField
        name="displayName"
        label="Nome exibido"
        hint="Aparece na agenda e no agendamento online."
        autoComplete="off"
        required
        defaultValue={professional?.displayName ?? ''}
        error={errors.displayName}
      />
      <SelectField
        name="membershipId"
        label="Membro da equipe"
        hint="Ligue a quem usa o sistema para ver a própria agenda. Só aparecem membros ainda sem profissional."
        options={memberOptions(candidates, professional)}
        defaultValue={professional?.membershipId ?? ''}
        error={errors.membershipId}
      />
      <fieldset
        aria-describedby={errors.serviceIds ? 'servicos-erro' : undefined}
        className="flex flex-col gap-1"
      >
        <legend className="text-base font-medium text-foreground">Serviços que faz</legend>
        {choices.length === 0 ? (
          <p className="mt-1.5 text-base text-muted-foreground">
            Nenhum serviço ativo. <TextLink to="/app/servicos/novo">Cadastre um serviço</TextLink>{' '}
            para ligar ao profissional.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col">
            {choices.map((service) => (
              <li key={service.id}>
                <CheckboxField
                  name="serviceIds"
                  value={service.id}
                  label={service.isActive ? service.name : `${service.name} (inativo)`}
                  defaultChecked={linked.has(service.id)}
                />
              </li>
            ))}
          </ul>
        )}
        {errors.serviceIds ? <FieldError id="servicos-erro">{errors.serviceIds}</FieldError> : null}
      </fieldset>
      <CheckboxField
        name="isActive"
        label="Profissional ativo"
        hint="Profissional inativo continua no histórico, mas não é oferecido em agendamento novo."
        defaultChecked={professional?.isActive ?? true}
      />
      {formError ? <Alert variant="destructive">{formError}</Alert> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" busy={busy} busyLabel={isEdit ? 'Salvando…' : 'Cadastrando…'}>
          {isEdit ? 'Salvar alterações' : 'Cadastrar profissional'}
        </Button>
        <Button asChild variant="outline">
          <Link to="/app/profissionais">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}

// Exclusão em duas etapas, como a revogação de convite. O banco recusa quem tem agendamento; a
// mensagem sugere desativar.
function DeleteProfessional({ professional }: { professional: Professional }) {
  const api = useProfessionalsApi();
  const tenantId = useTenantId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  // O botão que a pessoa usou some ao abrir ou fechar a confirmação: o foco vai para o equivalente.
  useEffect(() => {
    if (confirming) {
      opened.current = true;
      confirmRef.current?.focus();
    } else if (opened.current) {
      triggerRef.current?.focus();
    }
  }, [confirming]);

  async function confirm() {
    setBusy(true);
    const result = await api.remove(tenantId, professional.id);
    if (!result.ok) {
      setBusy(false);
      setConfirming(false);
      setError(result.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: professionalsQueryKey(tenantId) });
    const notice = `Profissional “${professional.displayName}” excluído.`;
    void navigate('/app/profissionais', { state: { notice } satisfies SavedNoticeState });
  }

  return (
    <section aria-labelledby="excluir-profissional" className="mt-10 border-t pt-6">
      <h2 id="excluir-profissional" className="text-lg font-semibold">
        Excluir profissional
      </h2>
      <p className="mt-2 text-base text-muted-foreground">
        Apaga o cadastro e os vínculos com serviços. Quem já tem agendamento não pode ser excluído:
        desative.
      </p>
      {error ? (
        <Alert variant="destructive" className="mt-4">
          {error}
        </Alert>
      ) : null}
      {confirming ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="text-base text-foreground sm:flex-1">
            Excluir “{professional.displayName}”? Não dá para desfazer.
          </p>
          <Button
            ref={confirmRef}
            variant="destructive"
            busy={busy}
            busyLabel="Excluindo…"
            onClick={() => {
              void confirm();
            }}
          >
            Confirmar exclusão
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
            }}
          >
            Cancelar exclusão
          </Button>
        </div>
      ) : (
        <Button
          ref={triggerRef}
          variant="outline"
          className="mt-4"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          Excluir profissional
        </Button>
      )}
    </section>
  );
}
