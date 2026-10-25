import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ProfessionalFormOutput } from '@/shared/professional';
import { type MemberRole, memberRoles } from '@/shared/roles';

// Profissionais da empresa ativa e os serviços que cada um faz. CRUD simples direto no Supabase sob RLS
// com o JWT do usuário (ADR-002): todo membro lê, só quem tem services.manage escreve (RN-035, RN-041).
// O profissional e os vínculos são gravados em chamadas separadas: se os vínculos falharem, o
// profissional fica salvo e o resultado avisa (`linksSaved: false`) para a pessoa editar de novo.

export interface Professional {
  id: string;
  displayName: string;
  membershipId: string | null;
  isActive: boolean;
  serviceIds: string[];
}

// Membro que pode ser ligado a um profissional (RN-044), da função list_professional_link_candidates.
export interface LinkCandidate {
  membershipId: string;
  fullName: string | null;
  role: MemberRole;
  // Profissional a que o membro já está ligado; null se nenhum.
  professionalId: string | null;
}

export type SaveProfessionalResult =
  | { ok: true; professional: Professional; linksSaved: boolean }
  | { ok: false; message: string; fieldErrors?: Partial<Record<string, string>> };

export type DeleteProfessionalResult = { ok: true } | { ok: false; message: string };

export interface ProfessionalsApi {
  list(tenantId: string): Promise<Professional[]>;
  // null quando o profissional não existe ou não é visível para o usuário (outra empresa).
  get(tenantId: string, professionalId: string): Promise<Professional | null>;
  listCandidates(tenantId: string): Promise<LinkCandidate[]>;
  create(tenantId: string, input: ProfessionalFormOutput): Promise<SaveProfessionalResult>;
  // `professional` é o que a tela carregou: só a diferença dos vínculos vai ao banco.
  update(
    tenantId: string,
    professional: Professional,
    input: ProfessionalFormOutput,
  ): Promise<SaveProfessionalResult>;
  remove(tenantId: string, professionalId: string): Promise<DeleteProfessionalResult>;
}

export class ProfessionalError extends Error {
  constructor(message = 'Não foi possível carregar os profissionais.') {
    super(message);
    this.name = 'ProfessionalError';
  }
}

// O embed de professional_services usa a FK composta (tenant_id, professional_id); a RLS também vale
// para as linhas embutidas.
const COLUMNS = 'id, display_name, membership_id, is_active, professional_services(service_id)';

const professionalRowSchema = z.object({
  id: z.string().min(1),
  display_name: z.string(),
  membership_id: z.string().nullable(),
  is_active: z.boolean(),
  professional_services: z.array(z.object({ service_id: z.string().min(1) })),
});

const SAVED_COLUMNS = 'id, display_name, membership_id, is_active';
const savedRowSchema = professionalRowSchema.omit({ professional_services: true });

const candidateRowSchema = z.object({
  membership_id: z.string().min(1),
  full_name: z.string().nullable(),
  role: z.enum(memberRoles),
  professional_id: z.string().nullable(),
});

function toProfessional(row: z.infer<typeof professionalRowSchema>): Professional {
  return {
    id: row.id,
    displayName: row.display_name,
    membershipId: row.membership_id,
    isActive: row.is_active,
    serviceIds: row.professional_services.map((link) => link.service_id),
  };
}

export function parseProfessionalRows(rows: unknown): Professional[] {
  const parsed = z.array(professionalRowSchema).safeParse(rows);
  if (!parsed.success) throw new ProfessionalError();
  return parsed.data.map(toProfessional);
}

export function parseCandidateRows(rows: unknown): LinkCandidate[] {
  const parsed = z.array(candidateRowSchema).safeParse(rows);
  if (!parsed.success) throw new ProfessionalError('Não foi possível carregar os membros.');
  return parsed.data.map((row) => ({
    membershipId: row.membership_id,
    fullName: row.full_name,
    role: row.role,
    professionalId: row.professional_id,
  }));
}

// Texto livre da URL: só vai ao banco se tiver forma de uuid (senão o Postgres responde 22P02).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProfessionalId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

const MESSAGES = {
  memberTaken: 'Este membro já está ligado a outro profissional.',
  forbidden: 'Você não tem permissão para alterar profissionais nesta empresa.',
  invalid: 'Confira os dados do profissional.',
  notFound: 'Este profissional não existe mais ou não pertence a esta empresa. Volte à lista.',
  internal: 'Não foi possível salvar o profissional. Tente de novo em instantes.',
  hasAppointments:
    'Este profissional tem agendamentos e não pode ser excluído. Desmarque “Profissional ativo” e salve para tirá-lo da agenda nova.',
  deleteFailed: 'Não foi possível excluir o profissional. Tente de novo em instantes.',
};

function errorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

// Códigos do Postgres que a tela sabe explicar; o texto do banco não é repassado.
export function saveErrorResult(error: unknown): SaveProfessionalResult {
  switch (errorCode(error)) {
    case '23505':
      // Único índice que a tela alcança: (tenant_id, membership_id).
      return {
        ok: false,
        message: MESSAGES.invalid,
        fieldErrors: { membershipId: MESSAGES.memberTaken },
      };
    case '42501':
      return { ok: false, message: MESSAGES.forbidden };
    case '23503':
    case '23514':
    case '22P02':
      return { ok: false, message: MESSAGES.invalid };
    default:
      return { ok: false, message: MESSAGES.internal };
  }
}

export function deleteErrorResult(error: unknown): DeleteProfessionalResult {
  switch (errorCode(error)) {
    // appointments → professionals não tem on delete: o banco recusa quem tem agendamento.
    case '23503':
      return { ok: false, message: MESSAGES.hasAppointments };
    case '42501':
      return { ok: false, message: MESSAGES.forbidden };
    default:
      return { ok: false, message: MESSAGES.deleteFailed };
  }
}

function toRow(input: ProfessionalFormOutput) {
  return {
    display_name: input.displayName,
    membership_id: input.membershipId,
    is_active: input.isActive,
  };
}

interface QueryResponse {
  data: unknown;
  error: unknown;
}

export function createSupabaseProfessionalsApi(client: SupabaseClient): ProfessionalsApi {
  async function insertLinks(tenantId: string, professionalId: string, serviceIds: string[]) {
    if (serviceIds.length === 0) return true;
    const response: QueryResponse = await client.from('professional_services').insert(
      serviceIds.map((serviceId) => ({
        tenant_id: tenantId,
        professional_id: professionalId,
        service_id: serviceId,
      })),
    );
    return !response.error;
  }

  async function deleteLinks(tenantId: string, professionalId: string, serviceIds: string[]) {
    if (serviceIds.length === 0) return true;
    const response: QueryResponse = await client
      .from('professional_services')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId)
      .in('service_id', serviceIds);
    return !response.error;
  }

  // Linha devolvida pelo insert/update, ainda sem os vínculos.
  function saved(data: unknown): SaveProfessionalResult {
    const rows = Array.isArray(data) ? data : [data];
    if (rows.length === 0) return { ok: false, message: MESSAGES.notFound };
    const parsed = savedRowSchema.safeParse(rows[0]);
    if (!parsed.success) return { ok: false, message: MESSAGES.internal };
    return {
      ok: true,
      professional: toProfessional({ ...parsed.data, professional_services: [] }),
      linksSaved: true,
    };
  }

  return {
    async list(tenantId) {
      const response: QueryResponse = await client
        .from('professionals')
        .select(COLUMNS)
        .eq('tenant_id', tenantId)
        .order('display_name', { ascending: true });
      if (response.error) throw new ProfessionalError();
      return parseProfessionalRows(response.data);
    },

    async get(tenantId, professionalId) {
      if (!isProfessionalId(professionalId)) return null;
      const response: QueryResponse = await client
        .from('professionals')
        .select(COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('id', professionalId);
      if (response.error) throw new ProfessionalError('Não foi possível carregar o profissional.');
      return parseProfessionalRows(response.data)[0] ?? null;
    },

    async listCandidates(tenantId) {
      const response: QueryResponse = await client.rpc('list_professional_link_candidates', {
        p_tenant_id: tenantId,
      });
      if (response.error) throw new ProfessionalError('Não foi possível carregar os membros.');
      return parseCandidateRows(response.data);
    },

    async create(tenantId, input) {
      const response: QueryResponse = await client
        .from('professionals')
        .insert({ tenant_id: tenantId, ...toRow(input) })
        .select(SAVED_COLUMNS);
      if (response.error) return saveErrorResult(response.error);
      const result = saved(response.data);
      if (!result.ok) return result;
      const linksSaved = await insertLinks(tenantId, result.professional.id, input.serviceIds);
      return {
        ...result,
        professional: { ...result.professional, serviceIds: linksSaved ? input.serviceIds : [] },
        linksSaved,
      };
    },

    async update(tenantId, professional, input) {
      if (!isProfessionalId(professional.id)) return { ok: false, message: MESSAGES.notFound };
      // A RLS filtra a linha de quem não pode alterar: nenhuma linha devolvida = não salvou.
      const response: QueryResponse = await client
        .from('professionals')
        .update(toRow(input))
        .eq('tenant_id', tenantId)
        .eq('id', professional.id)
        .select(SAVED_COLUMNS);
      if (response.error) return saveErrorResult(response.error);
      const result = saved(response.data);
      if (!result.ok) return result;
      const current = new Set(professional.serviceIds);
      const wanted = new Set(input.serviceIds);
      const added = input.serviceIds.filter((id) => !current.has(id));
      const removed = professional.serviceIds.filter((id) => !wanted.has(id));
      const linksSaved =
        (await deleteLinks(tenantId, professional.id, removed)) &&
        (await insertLinks(tenantId, professional.id, added));
      return {
        ...result,
        professional: { ...result.professional, serviceIds: input.serviceIds },
        linksSaved,
      };
    },

    async remove(tenantId, professionalId) {
      if (!isProfessionalId(professionalId)) return { ok: false, message: MESSAGES.notFound };
      const response: QueryResponse = await client
        .from('professionals')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('id', professionalId)
        .select('id');
      if (response.error) return deleteErrorResult(response.error);
      if (!Array.isArray(response.data) || response.data.length === 0) {
        return { ok: false, message: MESSAGES.notFound };
      }
      return { ok: true };
    },
  };
}
