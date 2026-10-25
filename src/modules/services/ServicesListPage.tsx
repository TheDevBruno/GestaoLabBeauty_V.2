import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatCents } from '@/shared/money';
import { formatMinutes } from '@/shared/service';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/field';
import { StatusBadge } from '@/components/ui/status-badge';
import { SavedNotice } from '@/app/components/SavedNotice';
import { RequirePermission } from '@/app/guards/RequirePermission';
import { ShellPage } from '@/app/shell/ShellPage';
import { useMediaQuery } from '@/app/shell/use-media-query';
import { useActiveTenant } from '@/app/tenancy/tenancy-context';
import type { Service } from './services-api';
import { servicesQueryKey, useServicesApi } from './services-context';

// Mesmo ponto de troca do app shell: tabela a partir de 1024 px, cartões abaixo. Só um dos dois fica
// no DOM, para o leitor de tela não encontrar a lista duas vezes.
const DESKTOP_QUERY = '(min-width: 1024px)';

// Lista de serviços: protegida por services.manage (owner, admin e manager, plano §8). A guarda é
// conveniência de interface; a RLS decide quem lê e quem altera (RN-041).
export function ServicesListPage() {
  return (
    <RequirePermission permission="services.manage" title="Serviços">
      <ServicesList />
    </RequirePermission>
  );
}

function ServicesList() {
  const api = useServicesApi();
  const { state } = useActiveTenant();
  const tenantId = state.status === 'active' ? state.membership.tenantId : '';
  const [showInactive, setShowInactive] = useState(false);
  const query = useQuery({
    queryKey: servicesQueryKey(tenantId),
    queryFn: () => api.list(tenantId),
    enabled: tenantId !== '',
  });

  const services = query.data ?? [];
  const visible = showInactive ? services : services.filter((service) => service.isActive);
  const inactiveCount = services.length - services.filter((service) => service.isActive).length;

  return (
    <ShellPage title="Serviços" wide>
      <SavedNotice />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base text-foreground">
          Cadastre o que a empresa oferece, com duração, intervalo após o atendimento e preço.
        </p>
        {services.length > 0 ? (
          <Button asChild className="self-start sm:self-auto">
            <Link to="/app/servicos/novo">
              <PlusIcon aria-hidden="true" />
              Novo serviço
            </Link>
          </Button>
        ) : null}
      </div>

      {query.isPending ? (
        <p role="status" className="mt-6 text-base text-muted-foreground">
          Carregando serviços…
        </p>
      ) : query.isError ? (
        <div className="mt-6 flex flex-col gap-3">
          <p role="alert" className="text-base font-medium text-destructive">
            Não foi possível carregar os serviços.
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
      ) : services.length === 0 ? (
        <EmptyState />
      ) : (
        <section aria-labelledby="lista-servicos" className="mt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="lista-servicos" className="text-lg font-semibold">
              {showInactive ? 'Todos os serviços' : 'Serviços ativos'}
            </h2>
            <CheckboxField
              name="showInactive"
              label={`Mostrar inativos (${String(inactiveCount)})`}
              checked={showInactive}
              onChange={(event) => {
                setShowInactive(event.currentTarget.checked);
              }}
            />
          </div>
          {visible.length === 0 ? (
            <p className="mt-4 text-base text-muted-foreground">
              Nenhum serviço ativo. Marque “Mostrar inativos” para ver os desativados.
            </p>
          ) : (
            <ServicesCollection services={visible} />
          )}
        </section>
      )}
    </ShellPage>
  );
}

function EmptyState() {
  return (
    <div className="mt-6 flex flex-col items-start gap-4 rounded-xl border border-dashed p-6">
      <h2 className="text-lg font-semibold">Nenhum serviço cadastrado</h2>
      <p className="text-base text-muted-foreground">
        Os serviços aparecem na agenda e no agendamento online depois de cadastrados.
      </p>
      <Button asChild>
        <Link to="/app/servicos/novo">
          <PlusIcon aria-hidden="true" />
          Cadastrar o primeiro serviço
        </Link>
      </Button>
    </div>
  );
}

function ServicesCollection({ services }: { services: Service[] }) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY, true);
  return isDesktop ? <ServicesTable services={services} /> : <ServicesCards services={services} />;
}

function bufferText(service: Service): string {
  return service.bufferMinutes === null || service.bufferMinutes === 0
    ? 'Sem intervalo'
    : formatMinutes(service.bufferMinutes);
}

function EditButton({ service }: { service: Service }) {
  return (
    <Button asChild variant="outline">
      <Link to={`/app/servicos/${service.id}`} aria-label={`Editar ${service.name}`}>
        Editar
      </Link>
    </Button>
  );
}

function ServicesTable({ services }: { services: Service[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="w-full text-left text-base">
        <caption className="sr-only">Serviços cadastrados</caption>
        <thead className="border-b bg-muted text-sm text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Serviço
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Duração
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Intervalo
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Preço
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Status
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {services.map((service) => (
            <tr key={service.id}>
              <th scope="row" className="max-w-xs px-4 py-3 font-medium break-words">
                {service.name}
              </th>
              <td className="px-4 py-3 whitespace-nowrap">
                {formatMinutes(service.durationMinutes)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{bufferText(service)}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                {formatCents(service.priceCents, service.currency)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge active={service.isActive} />
              </td>
              <td className="px-4 py-2 text-right">
                <EditButton service={service} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ServicesCards({ services }: { services: Service[] }) {
  return (
    <ul aria-labelledby="lista-servicos" className="mt-4 flex flex-col gap-3">
      {services.map((service) => (
        <li key={service.id} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 text-base font-semibold break-words">{service.name}</h3>
            <StatusBadge active={service.isActive} />
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
            <dt className="text-muted-foreground">Duração</dt>
            <dd>{formatMinutes(service.durationMinutes)}</dd>
            <dt className="text-muted-foreground">Intervalo</dt>
            <dd>{bufferText(service)}</dd>
            <dt className="text-muted-foreground">Preço</dt>
            <dd className="tabular-nums">{formatCents(service.priceCents, service.currency)}</dd>
          </dl>
          <div className="mt-4">
            <EditButton service={service} />
          </div>
        </li>
      ))}
    </ul>
  );
}
