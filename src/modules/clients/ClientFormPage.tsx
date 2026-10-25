import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type SubmitEvent, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  CLIENT_BIRTH_DATE_MIN,
  clientFormSchema,
  formatBirthDate,
  normalizeClientSearch,
  todayIsoDate,
} from '@/shared/client';
import { formatPhone } from '@/shared/phone';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CheckboxField, InputField } from '@/components/ui/field';
import { StatusBadge } from '@/components/ui/status-badge';
import { type FieldErrors, fieldErrorsFrom, firstInvalidField } from '@/app/forms/field-errors';
import { focusField } from '@/app/forms/focus-field';
import type { SavedNoticeState } from '@/app/forms/saved-notice';
import { RequirePermission } from '@/app/guards/RequirePermission';
import { ShellPage } from '@/app/shell/ShellPage';
import { useActiveTenant } from '@/app/tenancy/tenancy-context';
import { usePermission } from '@/app/tenancy/usePermission';
import type { Client } from './clients-api';
import { clientQueryKey, clientsQueryKey, useClientsApi } from './clients-context';

const FIELDS = ['fullName', 'phone', 'email', 'birthDate'] as const;

function useTenant() {
  const { state } = useActiveTenant();
  return {
    tenantId: state.status === 'active' ? state.membership.tenantId : '',
    isSpecialist: state.status === 'active' && state.membership.role === 'specialist',
  };
}

// Volta para a lista mantendo a busca: a lista passa ?q= adiante nos links para cá.
function useListPath(): string {
  const [searchParams] = useSearchParams();
  const term = normalizeClientSearch(searchParams.get('q') ?? '');
  return term === ''
    ? '/app/clientes'
    : `/app/clientes?${new URLSearchParams({ q: term }).toString()}`;
}

// /app/clientes/novo: clients.write, menos o specialist (RN-036).
export function ClientNewPage() {
  const { isSpecialist } = useTenant();
  return (
    <RequirePermission permission="clients.write" deny={isSpecialist} title="Novo cliente">
      <ShellPage title="Novo cliente">
        <ClientForm client={null} />
      </ShellPage>
    </RequirePermission>
  );
}

// /app/clientes/:id: formulário para quem tem clients.write (o specialist só nos clientes que vê,
// RN-036) e ficha de leitura para quem só tem clients.read (financial).
export function ClientEditPage() {
  return (
    <RequirePermission permission="clients.read" title="Cliente">
      <ClientEditContent />
    </RequirePermission>
  );
}

function ClientEditContent() {
  const api = useClientsApi();
  const { tenantId } = useTenant();
  const listPath = useListPath();
  const canWrite = usePermission('clients.write');
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: clientQueryKey(tenantId, id),
    queryFn: () => api.get(tenantId, id),
    enabled: tenantId !== '',
  });

  if (query.isPending || canWrite === 'loading') {
    return (
      <ShellPage title="Cliente">
        <p role="status" className="text-base text-muted-foreground">
          Carregando cliente…
        </p>
      </ShellPage>
    );
  }
  if (query.isError) {
    return (
      <ShellPage title="Cliente">
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-base font-medium text-destructive">
            Não foi possível carregar o cliente.
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
  // Mesma mensagem para id inexistente, outra empresa ou fora do recorte do specialist: a tela não
  // revela que o cliente existe.
  if (query.data === null) {
    return (
      <ShellPage title="Cliente não encontrado">
        <p className="text-base text-foreground">
          Este cliente não existe ou não está disponível para você nesta empresa.
        </p>
        <BackToList listPath={listPath} />
      </ShellPage>
    );
  }
  if (canWrite === 'denied') {
    return <ClientDetails client={query.data} listPath={listPath} />;
  }
  return (
    <ShellPage title="Editar cliente">
      {/* key: trocar de cliente pela URL remonta o formulário com os valores novos. */}
      <ClientForm key={query.data.id} client={query.data} />
    </ShellPage>
  );
}

// Ficha de leitura (quem só tem clients.read). Contato vazio aparece em texto, não como lacuna.
function ClientDetails({ client, listPath }: { client: Client; listPath: string }) {
  const missing = <span className="text-muted-foreground">Não informado</span>;
  return (
    <ShellPage title={client.fullName}>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border bg-card p-4 text-base shadow-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:p-6">
        <dt className="text-sm font-medium text-muted-foreground sm:text-base">Status</dt>
        <dd>
          <StatusBadge active={client.isActive} inactiveLabel="Arquivado" />
        </dd>
        <dt className="text-sm font-medium text-muted-foreground sm:text-base">Telefone</dt>
        <dd className="tabular-nums">
          {client.phone === null ? missing : formatPhone(client.phone)}
        </dd>
        <dt className="text-sm font-medium text-muted-foreground sm:text-base">E-mail</dt>
        <dd className="break-all">{client.email ?? missing}</dd>
        <dt className="text-sm font-medium text-muted-foreground sm:text-base">
          Data de nascimento
        </dt>
        <dd className="tabular-nums">
          {client.birthDate === null ? missing : formatBirthDate(client.birthDate)}
        </dd>
      </dl>
      <p className="mt-4 text-base text-muted-foreground">
        Seu papel nesta empresa permite consultar clientes, mas não alterar.
      </p>
      <BackToList listPath={listPath} />
    </ShellPage>
  );
}

// Link sozinho na página, não dentro de frase: vai como botão de contorno, com o alvo de 44 px (o
// TextLink é para links em linha).
function BackToList({ listPath }: { listPath: string }) {
  return (
    <Button asChild variant="outline" className="mt-6">
      <Link to={listPath}>Voltar para clientes</Link>
    </Button>
  );
}

function savedNotice(saved: Client, previous: Client | null): string {
  if (previous === null) return `Cliente “${saved.fullName}” cadastrado.`;
  if (previous.isActive && !saved.isActive) return `Cliente “${saved.fullName}” arquivado.`;
  if (!previous.isActive && saved.isActive) return `Cliente “${saved.fullName}” reativado.`;
  return `Alterações em “${saved.fullName}” salvas.`;
}

// Formulário compartilhado por criar e editar: useState + Zod, erro junto ao campo e foco no primeiro
// inválido (padrão dos serviços). O banco valida de novo com os CHECKs da RN-045.
function ClientForm({ client }: { client: Client | null }) {
  const api = useClientsApi();
  const { tenantId } = useTenant();
  const listPath = useListPath();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [today] = useState(todayIsoDate);
  const isEdit = client !== null;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const data = new FormData(event.currentTarget);
    const parsed = clientFormSchema.safeParse({
      fullName: data.get('fullName') ?? '',
      phone: data.get('phone') ?? '',
      email: data.get('email') ?? '',
      birthDate: data.get('birthDate') ?? '',
      // No cadastro o cliente nasce ativo; arquivar é só na edição (RN-046).
      isActive: isEdit ? data.get('isActive') === 'on' : true,
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
      ? await api.update(tenantId, client.id, parsed.data)
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
    await queryClient.invalidateQueries({ queryKey: clientsQueryKey(tenantId) });
    const notice = savedNotice(result.client, client);
    void navigate(listPath, { state: { notice } satisfies SavedNoticeState });
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
      {/* autoComplete="off": os dados são do cliente, não de quem preenche; o navegador sugeriria
          o nome e o telefone da própria pessoa. */}
      <InputField
        name="fullName"
        label="Nome completo"
        autoComplete="off"
        required
        defaultValue={client?.fullName ?? ''}
        error={errors.fullName}
      />
      <InputField
        name="phone"
        type="tel"
        inputMode="tel"
        label="Telefone (opcional)"
        hint="Com DDD, por exemplo (11) 98765-4321. Número de outro país começa com +."
        autoComplete="off"
        defaultValue={client?.phone ? formatPhone(client.phone) : ''}
        error={errors.phone}
      />
      <InputField
        name="email"
        type="email"
        label="E-mail (opcional)"
        autoComplete="off"
        spellCheck={false}
        defaultValue={client?.email ?? ''}
        error={errors.email}
      />
      <InputField
        name="birthDate"
        type="date"
        label="Data de nascimento (opcional)"
        min={CLIENT_BIRTH_DATE_MIN}
        max={today}
        defaultValue={client?.birthDate ?? ''}
        error={errors.birthDate}
      />
      {isEdit ? (
        <CheckboxField
          name="isActive"
          label="Cliente ativo"
          hint="Desmarque para arquivar: o cliente sai da lista padrão e não é oferecido em agendamento novo. Nada é apagado, e ele pode ser reativado."
          defaultChecked={client.isActive}
        />
      ) : null}
      {formError ? <Alert variant="destructive">{formError}</Alert> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" busy={busy} busyLabel={isEdit ? 'Salvando…' : 'Cadastrando…'}>
          {isEdit ? 'Salvar alterações' : 'Cadastrar cliente'}
        </Button>
        <Button asChild variant="outline">
          <Link to={listPath}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
