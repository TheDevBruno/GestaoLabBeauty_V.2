import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ServiceFormOutput } from '@/shared/service';

// Serviços da empresa ativa. CRUD simples direto no Supabase sob RLS com o JWT do usuário (ADR-002):
// todo membro lê, só quem tem services.manage cria e altera (RN-041). Sem exclusão nesta tela: o
// caminho normal é desativar (RN-042).

export interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  bufferMinutes: number | null;
  priceCents: number;
  currency: string;
  isActive: boolean;
}

export type SaveServiceResult =
  | { ok: true; service: Service }
  | { ok: false; message: string; fieldErrors?: Partial<Record<string, string>> };

export interface ServicesApi {
  list(tenantId: string): Promise<Service[]>;
  // null quando o serviço não existe ou não é visível para o usuário (outra empresa).
  get(tenantId: string, serviceId: string): Promise<Service | null>;
  create(tenantId: string, input: ServiceFormOutput): Promise<SaveServiceResult>;
  update(tenantId: string, serviceId: string, input: ServiceFormOutput): Promise<SaveServiceResult>;
}

export class ServiceError extends Error {
  constructor(message = 'Não foi possível carregar os serviços.') {
    super(message);
    this.name = 'ServiceError';
  }
}

const COLUMNS =
  'id, name, description, duration_minutes, buffer_minutes, price_cents, currency, is_active';

const serviceRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().nullable(),
  duration_minutes: z.number().int(),
  buffer_minutes: z.number().int().nullable(),
  price_cents: z.number().int(),
  currency: z.string(),
  is_active: z.boolean(),
});

function toService(row: z.infer<typeof serviceRowSchema>): Service {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    bufferMinutes: row.buffer_minutes,
    priceCents: row.price_cents,
    currency: row.currency,
    isActive: row.is_active,
  };
}

export function parseServiceRows(rows: unknown): Service[] {
  const parsed = z.array(serviceRowSchema).safeParse(rows);
  if (!parsed.success) throw new ServiceError();
  return parsed.data.map(toService);
}

// Texto livre da URL: só vai ao banco se tiver forma de uuid (senão o Postgres responde 22P02).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isServiceId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

const SAVE_MESSAGES = {
  duplicate: 'Já existe um serviço com este nome nesta empresa.',
  forbidden: 'Você não tem permissão para alterar serviços nesta empresa.',
  invalid: 'Confira os dados do serviço.',
  notFound: 'Este serviço não existe mais ou não pertence a esta empresa. Volte à lista.',
  internal: 'Não foi possível salvar o serviço. Tente de novo em instantes.',
};

// Códigos do Postgres que a tela sabe explicar; o texto do banco não é repassado.
export function saveErrorResult(error: unknown): SaveServiceResult {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  switch (code) {
    case '23505':
      return {
        ok: false,
        message: SAVE_MESSAGES.invalid,
        fieldErrors: { name: SAVE_MESSAGES.duplicate },
      };
    case '42501':
      return { ok: false, message: SAVE_MESSAGES.forbidden };
    case '23514':
    case '22P02':
      return { ok: false, message: SAVE_MESSAGES.invalid };
    default:
      return { ok: false, message: SAVE_MESSAGES.internal };
  }
}

function toRow(input: ServiceFormOutput) {
  return {
    name: input.name,
    description: input.description,
    duration_minutes: input.durationMinutes,
    buffer_minutes: input.bufferMinutes,
    price_cents: input.price,
    is_active: input.isActive,
  };
}

function savedResult(data: unknown): SaveServiceResult {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) return { ok: false, message: SAVE_MESSAGES.notFound };
  const parsed = serviceRowSchema.safeParse(rows[0]);
  if (!parsed.success) return { ok: false, message: SAVE_MESSAGES.internal };
  return { ok: true, service: toService(parsed.data) };
}

export function createSupabaseServicesApi(client: SupabaseClient): ServicesApi {
  return {
    async list(tenantId) {
      const response: { data: unknown; error: unknown } = await client
        .from('services')
        .select(COLUMNS)
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true });
      if (response.error) throw new ServiceError();
      return parseServiceRows(response.data);
    },

    async get(tenantId, serviceId) {
      if (!isServiceId(serviceId)) return null;
      const response: { data: unknown; error: unknown } = await client
        .from('services')
        .select(COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('id', serviceId);
      if (response.error) throw new ServiceError('Não foi possível carregar o serviço.');
      return parseServiceRows(response.data)[0] ?? null;
    },

    async create(tenantId, input) {
      // A moeda fica no padrão BRL do banco (decisão 3 da Sprint 2.1).
      const response: { data: unknown; error: unknown } = await client
        .from('services')
        .insert({ tenant_id: tenantId, ...toRow(input) })
        .select(COLUMNS);
      if (response.error) return saveErrorResult(response.error);
      return savedResult(response.data);
    },

    async update(tenantId, serviceId, input) {
      if (!isServiceId(serviceId)) return { ok: false, message: SAVE_MESSAGES.notFound };
      // A RLS filtra a linha de quem não pode alterar: nenhuma linha devolvida = não salvou.
      const response: { data: unknown; error: unknown } = await client
        .from('services')
        .update(toRow(input))
        .eq('tenant_id', tenantId)
        .eq('id', serviceId)
        .select(COLUMNS);
      if (response.error) return saveErrorResult(response.error);
      return savedResult(response.data);
    },
  };
}
