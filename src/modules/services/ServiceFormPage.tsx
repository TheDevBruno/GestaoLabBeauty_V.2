import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type SubmitEvent, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { centsToBrlInput } from '@/shared/money';
import {
  formatMinutes,
  SERVICE_DESCRIPTION_MAX_LENGTH,
  serviceBufferOptions,
  serviceDurationOptions,
  serviceFormSchema,
} from '@/shared/service';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CheckboxField, InputField, SelectField, TextareaField } from '@/components/ui/field';
import { TextLink } from '@/components/ui/text-link';
import { type FieldErrors, fieldErrorsFrom, firstInvalidField } from '@/app/forms/field-errors';
import { focusField } from '@/app/forms/focus-field';
import type { SavedNoticeState } from '@/app/forms/saved-notice';
import { RequirePermission } from '@/app/guards/RequirePermission';
import { ShellPage } from '@/app/shell/ShellPage';
import { useActiveTenant } from '@/app/tenancy/tenancy-context';
import type { Service } from './services-api';
import { serviceQueryKey, servicesQueryKey, useServicesApi } from './services-context';

const FIELDS = ['name', 'description', 'durationMinutes', 'bufferMinutes', 'price'] as const;

const durationOptions = [
  { value: '', label: 'Selecione a duração' },
  ...serviceDurationOptions.map((minutes) => ({
    value: String(minutes),
    label: formatMinutes(minutes),
  })),
];

// O banco aceita intervalo até 240 min, a interface oferece até 60. Um valor maior gravado antes
// entra como opção para a edição não trocá-lo sem a pessoa perceber.
function bufferOptions(current: number | null) {
  const values =
    current !== null && current > 0 && !serviceBufferOptions.includes(current)
      ? [...serviceBufferOptions, current]
      : serviceBufferOptions;
  return [
    { value: '', label: 'Sem intervalo' },
    ...values.map((minutes) => ({ value: String(minutes), label: formatMinutes(minutes) })),
  ];
}

function useTenantId(): string {
  const { state } = useActiveTenant();
  return state.status === 'active' ? state.membership.tenantId : '';
}

// /app/servicos/novo
export function ServiceNewPage() {
  return (
    <RequirePermission permission="services.manage" title="Novo serviço">
      <ShellPage title="Novo serviço">
        <ServiceForm service={null} />
      </ShellPage>
    </RequirePermission>
  );
}

// /app/servicos/:id
export function ServiceEditPage() {
  return (
    <RequirePermission permission="services.manage" title="Editar serviço">
      <ServiceEditContent />
    </RequirePermission>
  );
}

function ServiceEditContent() {
  const api = useServicesApi();
  const tenantId = useTenantId();
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: serviceQueryKey(tenantId, id),
    queryFn: () => api.get(tenantId, id),
    enabled: tenantId !== '',
  });

  if (query.isPending) {
    return (
      <ShellPage title="Editar serviço">
        <p role="status" className="text-base text-muted-foreground">
          Carregando serviço…
        </p>
      </ShellPage>
    );
  }
  if (query.isError) {
    return (
      <ShellPage title="Editar serviço">
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-base font-medium text-destructive">
            Não foi possível carregar o serviço.
          </p>
          <Button
            variant="outline"
            className="self-start"
            onClick={() => {
              void query.refetch();
            }}
          >
            Tentar de novo
          </Button>
        </div>
      </ShellPage>
    );
  }
  if (query.data === null) {
    return (
      <ShellPage title="Serviço não encontrado">
        <p className="text-base text-foreground">
          Este serviço não existe ou não pertence a esta empresa.
        </p>
        <p className="mt-6 text-base">
          <TextLink to="/app/servicos">Voltar para serviços</TextLink>
        </p>
      </ShellPage>
    );
  }
  return (
    <ShellPage title="Editar serviço">
      {/* key: trocar de serviço pela URL remonta o formulário com os valores novos. */}
      <ServiceForm key={query.data.id} service={query.data} />
    </ShellPage>
  );
}

// Formulário compartilhado por criar e editar: useState + Zod, erro junto ao campo e foco no primeiro
// inválido (padrão da tela de equipe). O banco valida de novo com os CHECKs da RN-040.
function ServiceForm({ service }: { service: Service | null }) {
  const api = useServicesApi();
  const tenantId = useTenantId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isEdit = service !== null;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const data = new FormData(event.currentTarget);
    const parsed = serviceFormSchema.safeParse({
      name: data.get('name') ?? '',
      description: data.get('description') ?? '',
      durationMinutes: data.get('durationMinutes') ?? '',
      bufferMinutes: data.get('bufferMinutes') ?? '',
      price: data.get('price') ?? '',
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
      ? await api.update(tenantId, service.id, parsed.data)
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
    await queryClient.invalidateQueries({ queryKey: servicesQueryKey(tenantId) });
    const notice = isEdit
      ? `Alterações em “${result.service.name}” salvas.`
      : `Serviço “${result.service.name}” cadastrado.`;
    void navigate('/app/servicos', { state: { notice } satisfies SavedNoticeState });
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
        name="name"
        label="Nome do serviço"
        autoComplete="off"
        required
        defaultValue={service?.name ?? ''}
        error={errors.name}
      />
      <TextareaField
        name="description"
        label="Descrição (opcional)"
        hint={`Até ${String(SERVICE_DESCRIPTION_MAX_LENGTH)} caracteres.`}
        rows={3}
        defaultValue={service?.description ?? ''}
        error={errors.description}
      />
      <SelectField
        name="durationMinutes"
        label="Duração"
        options={durationOptions}
        required
        defaultValue={service ? String(service.durationMinutes) : ''}
        error={errors.durationMinutes}
      />
      <SelectField
        name="bufferMinutes"
        label="Intervalo após o atendimento"
        hint="Tempo para limpeza ou preparo. Esse horário fica reservado na agenda depois do atendimento."
        options={bufferOptions(service?.bufferMinutes ?? null)}
        defaultValue={service?.bufferMinutes ? String(service.bufferMinutes) : ''}
        error={errors.bufferMinutes}
      />
      <InputField
        name="price"
        label="Preço (R$)"
        hint="Por exemplo 120,00."
        inputMode="decimal"
        autoComplete="off"
        required
        defaultValue={service ? centsToBrlInput(service.priceCents) : ''}
        error={errors.price}
      />
      <CheckboxField
        name="isActive"
        label="Serviço ativo"
        hint="Serviço inativo continua no histórico, mas não é oferecido em agendamento novo."
        defaultChecked={service?.isActive ?? true}
      />
      {formError ? <Alert variant="destructive">{formError}</Alert> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" busy={busy} busyLabel={isEdit ? 'Salvando…' : 'Cadastrando…'}>
          {isEdit ? 'Salvar alterações' : 'Cadastrar serviço'}
        </Button>
        <Button asChild variant="outline">
          <Link to="/app/servicos">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
