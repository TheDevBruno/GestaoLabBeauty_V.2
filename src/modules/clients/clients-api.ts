import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ClientFormOutput } from '@/shared/client';

// Clientes da empresa ativa, direto no Supabase sob RLS com o JWT do usuário (ADR-002). A busca usa a
// função public.search_clients (security invoker): o recorte do specialist vale nela como na tabela
// (RN-028, RN-047). Cadastro com clients.write fora do specialist (RN-036); alteração com
// clients.write nos clientes que a pessoa vê. Sem exclusão: o caminho é arquivar (RN-037, RN-046).

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

export type SaveClientResult =
  | { ok: true; client: Client }
  | { ok: false; message: string; fieldErrors?: Partial<Record<string, string>> };

export interface ClientsApi {
  search(tenantId: string, search: ClientSearch): Promise<ClientsPage>;
  // null quando o cliente não existe ou não é visível para o usuário (outra empresa ou fora do recorte).
  get(tenantId: string, clientId: string): Promise<Client | null>;
  create(tenantId: string, input: ClientFormOutput): Promise<SaveClientResult>;
  update(tenantId: string, clientId: string, input: ClientFormOutput): Promise<SaveClientResult>;
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

const SAVE_MESSAGES = {
  forbidden: 'Você não tem permissão para alterar este cliente.',
  invalid: 'Confira os dados do cliente.',
  notFound:
    'Este cliente não existe mais ou não está disponível para você nesta empresa. Volte à lista.',
  internal: 'Não foi possível salvar o cliente. Tente de novo em instantes.',
};

// Códigos do Postgres que a tela sabe explicar; o texto do banco não é repassado.
export function saveErrorResult(error: unknown): SaveClientResult {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  switch (code) {
    case '42501':
      return { ok: false, message: SAVE_MESSAGES.forbidden };
    case '23514':
    case '22P02':
    case '22007':
    case '22008':
      return { ok: false, message: SAVE_MESSAGES.invalid };
    default:
      return { ok: false, message: SAVE_MESSAGES.internal };
  }
}

function toRow(input: ClientFormOutput) {
  return {
    full_name: input.fullName,
    phone: input.phone,
    email: input.email,
    birth_date: input.birthDate,
    is_active: input.isActive,
  };
}

function savedResult(data: unknown): SaveClientResult {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) return { ok: false, message: SAVE_MESSAGES.notFound };
  const parsed = clientRowSchema.safeParse(rows[0]);
  if (!parsed.success) return { ok: false, message: SAVE_MESSAGES.internal };
  return { ok: true, client: toClient(parsed.data) };
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

    async create(tenantId, input) {
      const response: { data: unknown; error: unknown } = await client
        .from('clients')
        .insert({ tenant_id: tenantId, ...toRow(input) })
        .select(COLUMNS);
      if (response.error) return saveErrorResult(response.error);
      return savedResult(response.data);
    },

    async update(tenantId, clientId, input) {
      if (!isClientId(clientId)) return { ok: false, message: SAVE_MESSAGES.notFound };
      // A RLS filtra a linha de quem não pode alterar (inclusive o specialist fora do recorte):
      // nenhuma linha devolvida = não salvou.
      const response: { data: unknown; error: unknown } = await client
        .from('clients')
        .update(toRow(input))
        .eq('tenant_id', tenantId)
        .eq('id', clientId)
        .select(COLUMNS);
      if (response.error) return saveErrorResult(response.error);
      return savedResult(response.data);
    },
  };
}
