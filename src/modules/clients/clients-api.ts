import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Clientes da empresa ativa, direto no Supabase sob RLS com o JWT do usuário (ADR-002). A busca usa a
// função public.search_clients (security invoker): o recorte do specialist vale nela como na tabela
// (RN-028, RN-047). Sem exclusão: o caminho é arquivar (RN-037, RN-046).

export interface Client {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  isActive: boolean;
}

export interface ClientSearch {
  query: string;
  includeArchived: boolean;
  offset: number;
}

export interface ClientsPage {
  clients: Client[];
  // Há mais linhas depois desta página (a função devolveu uma a mais que o tamanho da página).
  hasMore: boolean;
}

export interface ClientsApi {
  search(tenantId: string, search: ClientSearch): Promise<ClientsPage>;
  // null quando o cliente não existe ou não é visível para o usuário (outra empresa ou fora do recorte).
  get(tenantId: string, clientId: string): Promise<Client | null>;
}

// "Carregar mais" de 50 em 50 (decisão 9 da Sprint 2.2). O banco aceita até 100 por chamada.
export const CLIENTS_PAGE_SIZE = 50;

export class ClientError extends Error {
  constructor(message = 'Não foi possível carregar os clientes.') {
    super(message);
    this.name = 'ClientError';
  }
}

const COLUMNS = 'id, full_name, phone, email, birth_date, is_active';

const clientRowSchema = z.object({
  id: z.string().min(1),
  full_name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  birth_date: z.string().nullable(),
  is_active: z.boolean(),
});

function toClient(row: z.infer<typeof clientRowSchema>): Client {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    birthDate: row.birth_date,
    isActive: row.is_active,
  };
}

export function parseClientRows(rows: unknown): Client[] {
  const parsed = z.array(clientRowSchema).safeParse(rows);
  if (!parsed.success) throw new ClientError();
  return parsed.data.map(toClient);
}

// Texto livre da URL: só vai ao banco se tiver forma de uuid (senão o Postgres responde 22P02).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isClientId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function createSupabaseClientsApi(client: SupabaseClient): ClientsApi {
  return {
    async search(tenantId, { query, includeArchived, offset }) {
      // Pede uma linha a mais para saber se há outra página sem contar a tabela.
      const response: { data: unknown; error: unknown } = await client
        .rpc('search_clients', {
          p_tenant_id: tenantId,
          p_query: query === '' ? null : query,
          p_include_inactive: includeArchived,
          p_limit: CLIENTS_PAGE_SIZE + 1,
          p_offset: offset,
        })
        .select(COLUMNS);
      if (response.error) throw new ClientError();
      const rows = parseClientRows(response.data);
      return {
        clients: rows.slice(0, CLIENTS_PAGE_SIZE),
        hasMore: rows.length > CLIENTS_PAGE_SIZE,
      };
    },

    async get(tenantId, clientId) {
      if (!isClientId(clientId)) return null;
      const response: { data: unknown; error: unknown } = await client
        .from('clients')
        .select(COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('id', clientId);
      if (response.error) throw new ClientError('Não foi possível carregar o cliente.');
      return parseClientRows(response.data)[0] ?? null;
    },
  };
}
