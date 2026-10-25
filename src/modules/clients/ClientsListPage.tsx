import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { PlusIcon, SearchIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { normalizeClientSearch } from '@/shared/client';
import { formatPhone } from '@/shared/phone';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { SavedNotice } from '@/app/components/SavedNotice';
import { RequirePermission } from '@/app/guards/RequirePermission';
import { ShellPage } from '@/app/shell/ShellPage';
import { useMediaQuery } from '@/app/shell/use-media-query';
import { useActiveTenant } from '@/app/tenancy/tenancy-context';
import { usePermission } from '@/app/tenancy/usePermission';
import { type Client, CLIENTS_PAGE_SIZE } from './clients-api';
import { clientsSearchQueryKey, useClientsApi } from './clients-context';

// Mesmo ponto de troca do app shell: tabela a partir de 1024 px, cartões abaixo. Só um dos dois fica
// no DOM, para o leitor de tela não encontrar a lista duas vezes.
const DESKTOP_QUERY = '(min-width: 1024px)';

// Espera depois da última tecla antes de buscar; Enter busca na hora.
export const SEARCH_DELAY_MS = 300;

// Lista de clientes: todo papel com clients.read (decisão 8 da Sprint 2.2). A guarda é conveniência de
// interface; a RLS e search_clients decidem o que cada um vê, inclusive o recorte do specialist (RN-028).
export function ClientsListPage() {
  return (
    <RequirePermission permission="clients.read" title="Clientes">
      <ClientsList />
    </RequirePermission>
  );
}

function ClientsList() {
  const api = useClientsApi();
  const { state } = useActiveTenant();
  const tenantId = state.status === 'active' ? state.membership.tenantId : '';
  const isSpecialist = state.status === 'active' && state.membership.role === 'specialist';
  // O specialist tem clients.write só para os clientes que vê; cadastrar é negado a ele (RN-036).
  const canCreate = usePermission('clients.write') === 'allowed' && !isSpecialist;

  const [searchParams, setSearchParams] = useSearchParams();
  const term = normalizeClientSearch(searchParams.get('q') ?? '');
  const [draft, setDraft] = useState(() => searchParams.get('q') ?? '');
  const [includeArchived, setIncludeArchived] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const applySearch = useCallback(
    (value: string) => {
      const next = normalizeClientSearch(value);
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          if (next === '') params.delete('q');
          else params.set('q', next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // O termo vai para a URL (?q=) depois da pausa na digitação; voltar do formulário mantém a busca.
  useEffect(() => {
    if (normalizeClientSearch(draft) === term) return;
    const timer = window.setTimeout(() => {
      applySearch(draft);
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [draft, term, applySearch]);

  const query = useInfiniteQuery({
    queryKey: clientsSearchQueryKey(tenantId, term, includeArchived),
    queryFn: ({ pageParam }) =>
      api.search(tenantId, { query: term, includeArchived, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.length * CLIENTS_PAGE_SIZE : undefined,
    enabled: tenantId !== '',
    // Enquanto a busca nova carrega, a lista anterior continua na tela.
    placeholderData: keepPreviousData,
  });

  const pages = query.data?.pages;
  const clients = useMemo(() => pages?.flatMap((page) => page.clients) ?? [], [pages]);

  // "Carregar mais": o foco vai para o primeiro cliente novo, para quem usa teclado ou leitor de tela
  // continuar de onde parou.
  const focusIndexRef = useRef<number | null>(null);
  useEffect(() => {
    const index = focusIndexRef.current;
    const firstNew = index === null ? undefined : clients[index];
    if (firstNew === undefined) return;
    focusIndexRef.current = null;
    document.getElementById(clientAnchorId(firstNew))?.focus();
  }, [clients]);

  const clearSearch = () => {
    setDraft('');
    applySearch('');
    searchInputRef.current?.focus();
  };

  return (
    <ShellPage title="Clientes" wide>
      <SavedNotice />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base text-foreground">
          {isSpecialist
            ? 'Clientes que já têm agendamento com você.'
            : 'Encontre um cliente pelo nome ou pelo telefone.'}
        </p>
        {canCreate ? (
          <Button asChild className="self-start sm:self-auto">
            <Link to="/app/clientes/novo">
              <PlusIcon aria-hidden="true" />
              Novo cliente
            </Link>
          </Button>
        ) : null}
      </div>

      <div role="search" className="mt-6 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="busca-clientes">Buscar por nome ou telefone</Label>
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={searchInputRef}
              id="busca-clientes"
              type="search"
              autoComplete="off"
              enterKeyHint="search"
              value={draft}
              onChange={(event) => {
                setDraft(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applySearch(draft);
                }
              }}
              className="pr-12 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {draft !== '' ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Limpar busca"
                className="absolute top-1/2 right-0 -translate-y-1/2"
                onClick={clearSearch}
              >
                <XIcon aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>
        <CheckboxField
          name="includeArchived"
          label="Mostrar arquivados"
          checked={includeArchived}
          onChange={(event) => {
            setIncludeArchived(event.currentTarget.checked);
          }}
        />
      </div>

      {/* Uma única região de status: carregando ou a contagem com o contexto da busca. */}
      <p role="status" aria-atomic="true" className="mt-4 text-base text-muted-foreground">
        {query.isPending
          ? 'Carregando clientes…'
          : query.isError
            ? ''
            : resultSummary(clients.length, term, includeArchived, query.hasNextPage)}
      </p>

      {query.isPending ? null : query.isError ? (
        <div className="mt-4 flex flex-col gap-3">
          <p role="alert" className="text-base font-medium text-destructive">
            Não foi possível carregar os clientes.
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
      ) : clients.length === 0 ? (
        term !== '' ? (
          <NoResults term={term} includeArchived={includeArchived} onClear={clearSearch} />
        ) : isSpecialist ? (
          <SpecialistEmpty />
        ) : (
          <EmptyState includeArchived={includeArchived} canCreate={canCreate} />
        )
      ) : (
        <section aria-labelledby="lista-clientes" className="mt-2">
          <h2 id="lista-clientes" className="text-lg font-semibold">
            {includeArchived ? 'Todos os clientes' : 'Clientes ativos'}
          </h2>
          <ClientsCollection clients={clients} />
          {query.hasNextPage ? (
            <Button
              variant="outline"
              className="mt-4"
              busy={query.isFetchingNextPage}
              busyLabel="Carregando…"
              onClick={() => {
                focusIndexRef.current = clients.length;
                void query.fetchNextPage();
              }}
            >
              Carregar mais clientes
            </Button>
          ) : null}
        </section>
      )}
    </ShellPage>
  );
}

// Texto da região de status: a quantidade com o que ela significa ("3 clientes encontrados para
// “ana”"), nunca um número solto.
function resultSummary(
  count: number,
  term: string,
  includeArchived: boolean,
  hasMore: boolean,
): string {
  const noun = count === 1 ? 'cliente' : 'clientes';
  if (hasMore) {
    return `${String(count)} ${noun} na lista; há mais para carregar.`;
  }
  if (term !== '') {
    if (count === 0) return `Nenhum cliente encontrado para “${term}”.`;
    const found = count === 1 ? 'encontrado' : 'encontrados';
    return `${String(count)} ${noun} ${found} para “${term}”.`;
  }
  if (count === 0) return 'Nenhum cliente na lista.';
  return includeArchived
    ? `${String(count)} ${noun}, incluindo arquivados.`
    : `${String(count)} ${noun} ${count === 1 ? 'ativo' : 'ativos'}.`;
}

function NoResults({
  term,
  includeArchived,
  onClear,
}: {
  term: string;
  includeArchived: boolean;
  onClear: () => void;
}) {
  return (
    <div className="mt-2 flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
      <h2 className="text-lg font-semibold">Nenhum cliente encontrado para “{term}”</h2>
      <p className="text-base text-muted-foreground">
        Confira a grafia, busque só por parte do nome ou digite o telefone com DDD.
        {includeArchived ? null : ' Se o cliente foi arquivado, marque “Mostrar arquivados”.'}
      </p>
      <Button variant="outline" onClick={onClear}>
        Limpar busca
      </Button>
    </div>
  );
}

function SpecialistEmpty() {
  return (
    <div className="mt-2 flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
      <h2 className="text-lg font-semibold">Nenhum cliente para mostrar</h2>
      <p className="text-base text-muted-foreground">
        Aqui aparecem os clientes que já têm agendamento com você. O primeiro agendamento de um
        cliente é feito pela recepção ou pela gestão.
      </p>
    </div>
  );
}

function EmptyState({
  includeArchived,
  canCreate,
}: {
  includeArchived: boolean;
  canCreate: boolean;
}) {
  return (
    <div className="mt-2 flex flex-col items-start gap-4 rounded-xl border border-dashed p-6">
      <h2 className="text-lg font-semibold">
        {includeArchived ? 'Nenhum cliente cadastrado' : 'Nenhum cliente ativo'}
      </h2>
      <p className="text-base text-muted-foreground">
        {includeArchived
          ? 'Os clientes cadastrados aparecem aqui e na agenda.'
          : 'Os clientes cadastrados aparecem aqui e na agenda. Clientes arquivados aparecem com “Mostrar arquivados”.'}
      </p>
      {canCreate ? (
        <Button asChild>
          <Link to="/app/clientes/novo">
            <PlusIcon aria-hidden="true" />
            Cadastrar o primeiro cliente
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function clientAnchorId(client: Client): string {
  return `cliente-${client.id}`;
}

function ClientsCollection({ clients }: { clients: Client[] }) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY, true);
  return isDesktop ? <ClientsTable clients={clients} /> : <ClientsCards clients={clients} />;
}

function ContactText({ value }: { value: string | null }) {
  return value ?? <span className="text-muted-foreground">Não informado</span>;
}

function ClientStatus({ client }: { client: Client }) {
  return <StatusBadge active={client.isActive} activeLabel="Ativo" inactiveLabel="Arquivado" />;
}

// O nome recebe o foco ao "Carregar mais" (tabIndex -1: focável só por script).
const ANCHOR_FOCUS =
  'rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2';

function ClientsTable({ clients }: { clients: Client[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="w-full text-left text-base">
        <caption className="sr-only">Clientes</caption>
        <thead className="border-b bg-muted text-sm text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Cliente
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Telefone
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              E-mail
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {clients.map((client) => (
            <tr key={client.id}>
              <th
                id={clientAnchorId(client)}
                tabIndex={-1}
                scope="row"
                className={`max-w-xs px-4 py-3 font-medium break-words ${ANCHOR_FOCUS}`}
              >
                {client.fullName}
              </th>
              <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                <ContactText value={client.phone === null ? null : formatPhone(client.phone)} />
              </td>
              <td className="max-w-xs px-4 py-3 break-all">
                <ContactText value={client.email} />
              </td>
              <td className="px-4 py-3">
                <ClientStatus client={client} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClientsCards({ clients }: { clients: Client[] }) {
  return (
    <ul aria-labelledby="lista-clientes" className="mt-4 flex flex-col gap-3">
      {clients.map((client) => (
        <li key={client.id} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <h3
              id={clientAnchorId(client)}
              tabIndex={-1}
              className={`min-w-0 text-base font-semibold break-words ${ANCHOR_FOCUS}`}
            >
              {client.fullName}
            </h3>
            <ClientStatus client={client} />
          </div>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-base">
            <dt className="text-muted-foreground">Telefone</dt>
            <dd className="tabular-nums">
              <ContactText value={client.phone === null ? null : formatPhone(client.phone)} />
            </dd>
            <dt className="text-muted-foreground">E-mail</dt>
            <dd className="break-all">
              <ContactText value={client.email} />
            </dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
