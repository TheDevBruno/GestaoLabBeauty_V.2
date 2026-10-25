import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { memberRoleLabels } from '@/shared/roles';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/field';
import { StatusBadge } from '@/components/ui/status-badge';
import { SavedNotice } from '@/app/components/SavedNotice';
import { RequirePermission } from '@/app/guards/RequirePermission';
import { ShellPage } from '@/app/shell/ShellPage';
import { useMediaQuery } from '@/app/shell/use-media-query';
import { useActiveTenant } from '@/app/tenancy/tenancy-context';
import type { LinkCandidate, Professional } from './professionals-api';
import {
  linkCandidatesQueryKey,
  professionalsQueryKey,
  useProfessionalsApi,
} from './professionals-context';

// Mesmo ponto de troca do app shell: tabela a partir de 1024 px, cartões abaixo. Só um dos dois fica
// no DOM, para o leitor de tela não encontrar a lista duas vezes.
const DESKTOP_QUERY = '(min-width: 1024px)';

const NO_ACCESS = 'Sem acesso ao sistema';

// Lista de profissionais: protegida por services.manage (owner, admin e manager, plano §8). A guarda é
// conveniência de interface; a RLS decide quem lê e quem altera (RN-035).
export function ProfessionalsListPage() {
  return (
    <RequirePermission permission="services.manage" title="Profissionais">
      <ProfessionalsList />
    </RequirePermission>
  );
}

function ProfessionalsList() {
  const api = useProfessionalsApi();
  const { state } = useActiveTenant();
  const tenantId = state.status === 'active' ? state.membership.tenantId : '';
  const [showInactive, setShowInactive] = useState(false);
  const query = useQuery({
    queryKey: professionalsQueryKey(tenantId),
    queryFn: () => api.list(tenantId),
    enabled: tenantId !== '',
  });
  // Nome do membro ligado. Se falhar, a lista continua e mostra só que há acesso ao sistema.
  const candidates = useQuery({
    queryKey: linkCandidatesQueryKey(tenantId),
    queryFn: () => api.listCandidates(tenantId),
    enabled: tenantId !== '',
  });

  const professionals = query.data ?? [];
  const visible = showInactive ? professionals : professionals.filter((item) => item.isActive);
  const inactiveCount = professionals.filter((item) => !item.isActive).length;
  const memberText = (professional: Professional) =>
    linkedMemberText(professional, candidates.data ?? []);

  return (
    <ShellPage title="Profissionais" wide>
      <SavedNotice />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base text-foreground">
          Cadastre quem atende e os serviços que cada pessoa faz.
        </p>
        {professionals.length > 0 ? (
          <Button asChild className="self-start sm:self-auto">
            <Link to="/app/profissionais/novo">
              <PlusIcon aria-hidden="true" />
              Novo profissional
            </Link>
          </Button>
        ) : null}
      </div>

      {query.isPending ? (
        <p role="status" className="mt-6 text-base text-muted-foreground">
          Carregando profissionais…
        </p>
      ) : query.isError ? (
        <div className="mt-6 flex flex-col gap-3">
          <p role="alert" className="text-base font-medium text-destructive">
            Não foi possível carregar os profissionais.
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
      ) : professionals.length === 0 ? (
        <EmptyState />
      ) : (
        <section aria-labelledby="lista-profissionais" className="mt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="lista-profissionais" className="text-lg font-semibold">
              {showInactive ? 'Todos os profissionais' : 'Profissionais ativos'}
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
              Nenhum profissional ativo. Marque “Mostrar inativos” para ver os desativados.
            </p>
          ) : (
            <ProfessionalsCollection professionals={visible} memberText={memberText} />
          )}
        </section>
      )}
    </ShellPage>
  );
}

function linkedMemberText(professional: Professional, candidates: LinkCandidate[]): string {
  if (professional.membershipId === null) return NO_ACCESS;
  const member = candidates.find((item) => item.membershipId === professional.membershipId);
  if (!member) return 'Com acesso ao sistema';
  return `${member.fullName ?? 'Membro sem nome'} (${memberRoleLabels[member.role]})`;
}

function servicesCountText(count: number): string {
  if (count === 0) return 'Nenhum serviço';
  return count === 1 ? '1 serviço' : `${String(count)} serviços`;
}

function EmptyState() {
  return (
    <div className="mt-6 flex flex-col items-start gap-4 rounded-xl border border-dashed p-6">
      <h2 className="text-lg font-semibold">Nenhum profissional cadastrado</h2>
      <p className="text-base text-muted-foreground">
        Os profissionais aparecem na agenda e no agendamento online depois de cadastrados.
      </p>
      <Button asChild>
        <Link to="/app/profissionais/novo">
          <PlusIcon aria-hidden="true" />
          Cadastrar o primeiro profissional
        </Link>
      </Button>
    </div>
  );
}

interface CollectionProps {
  professionals: Professional[];
  memberText: (professional: Professional) => string;
}

function ProfessionalsCollection(props: CollectionProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY, true);
  return isDesktop ? <ProfessionalsTable {...props} /> : <ProfessionalsCards {...props} />;
}

function EditButton({ professional }: { professional: Professional }) {
  return (
    <Button asChild variant="outline">
      <Link
        to={`/app/profissionais/${professional.id}`}
        aria-label={`Editar ${professional.displayName}`}
      >
        Editar
      </Link>
    </Button>
  );
}

function ProfessionalsTable({ professionals, memberText }: CollectionProps) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="w-full text-left text-base">
        <caption className="sr-only">Profissionais cadastrados</caption>
        <thead className="border-b bg-muted text-sm text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Profissional
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Membro ligado
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Serviços
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
          {professionals.map((professional) => (
            <tr key={professional.id}>
              <th scope="row" className="max-w-xs px-4 py-3 font-medium break-words">
                {professional.displayName}
              </th>
              <td className="max-w-xs px-4 py-3 break-words">{memberText(professional)}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                {servicesCountText(professional.serviceIds.length)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge active={professional.isActive} />
              </td>
              <td className="px-4 py-2 text-right">
                <EditButton professional={professional} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProfessionalsCards({ professionals, memberText }: CollectionProps) {
  return (
    <ul aria-labelledby="lista-profissionais" className="mt-4 flex flex-col gap-3">
      {professionals.map((professional) => (
        <li key={professional.id} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 text-base font-semibold break-words">
              {professional.displayName}
            </h3>
            <StatusBadge active={professional.isActive} />
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
            <dt className="text-muted-foreground">Membro</dt>
            <dd className="min-w-0 break-words">{memberText(professional)}</dd>
            <dt className="text-muted-foreground">Serviços</dt>
            <dd>{servicesCountText(professional.serviceIds.length)}</dd>
          </dl>
          <div className="mt-4">
            <EditButton professional={professional} />
          </div>
        </li>
      ))}
    </ul>
  );
}
