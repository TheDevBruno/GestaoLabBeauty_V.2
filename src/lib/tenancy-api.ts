import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { type MemberRole, memberRoles } from '@/shared/roles';

// Contrato de leitura das empresas e permissões do usuário. Tudo passa pela RLS com o JWT do usuário:
// memberships mostra só a própria membership, tenants só as empresas em que ele é membro e
// roles_permissions é a matriz global (passos 5a e 5b da Sprint 1.2).

export interface TenantMembership {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: MemberRole;
}

export interface TenancyApi {
  listMyMemberships(userId: string): Promise<TenantMembership[]>;
  listRolePermissions(role: MemberRole): Promise<string[]>;
}

export class TenancyError extends Error {
  constructor(message = 'Não foi possível carregar os dados da empresa.') {
    super(message);
    this.name = 'TenancyError';
  }
}

// Sem tipos gerados do banco, as linhas chegam como any: o schema valida antes de qualquer uso.
const membershipRowSchema = z.object({
  id: z.string().min(1),
  role: z.enum(memberRoles),
  tenant: z.object({ id: z.string().min(1), name: z.string(), slug: z.string() }).nullable(),
});

const permissionRowSchema = z.object({ permission: z.string().min(1) });

export function parseMembershipRows(rows: unknown): TenantMembership[] {
  const parsed = z.array(membershipRowSchema).safeParse(rows);
  if (!parsed.success) throw new TenancyError();
  return parsed.data
    .flatMap((row) =>
      row.tenant
        ? [
            {
              membershipId: row.id,
              tenantId: row.tenant.id,
              tenantName: row.tenant.name,
              tenantSlug: row.tenant.slug,
              role: row.role,
            },
          ]
        : [],
    )
    .sort((a, b) => a.tenantName.localeCompare(b.tenantName, 'pt-BR'));
}

export function parsePermissionRows(rows: unknown): string[] {
  const parsed = z.array(permissionRowSchema).safeParse(rows);
  if (!parsed.success) throw new TenancyError();
  return parsed.data.map((row) => row.permission).sort();
}

export function createSupabaseTenancyApi(client: SupabaseClient): TenancyApi {
  return {
    async listMyMemberships(userId) {
      const response: { data: unknown; error: unknown } = await client
        .from('memberships')
        .select('id, role, tenant:tenants(id, name, slug)')
        .eq('user_id', userId);
      if (response.error) throw new TenancyError();
      return parseMembershipRows(response.data);
    },

    async listRolePermissions(role) {
      const response: { data: unknown; error: unknown } = await client
        .from('roles_permissions')
        .select('permission')
        .eq('role', role);
      if (response.error) throw new TenancyError();
      return parsePermissionRows(response.data);
    },
  };
}
