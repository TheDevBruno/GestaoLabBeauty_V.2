import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  createSupabaseTenancyApi,
  parseMembershipRows,
  parsePermissionRows,
  TenancyError,
} from './tenancy-api';

const row = (id: string, name: string, role = 'owner') => ({
  id: `m-${id}`,
  role,
  tenant: { id: `t-${id}`, name, slug: `slug-${id}` },
});

describe('parseMembershipRows', () => {
  it('converte as linhas e ordena pelo nome da empresa', () => {
    expect(parseMembershipRows([row('2', 'Zeta'), row('1', 'Ápice', 'admin')])).toEqual([
      {
        membershipId: 'm-1',
        tenantId: 't-1',
        tenantName: 'Ápice',
        tenantSlug: 'slug-1',
        role: 'admin',
      },
      {
        membershipId: 'm-2',
        tenantId: 't-2',
        tenantName: 'Zeta',
        tenantSlug: 'slug-2',
        role: 'owner',
      },
    ]);
  });

  it('descarta membership cuja empresa a RLS não devolveu', () => {
    expect(parseMembershipRows([{ id: 'm-1', role: 'owner', tenant: null }])).toEqual([]);
  });

  it.each([
    [[{ ...row('1', 'A'), role: 'platform_admin' }]],
    [[{ id: 'm-1', role: 'owner' }]],
    [null],
    ['texto'],
  ])('recusa formato inesperado %j', (rows) => {
    expect(() => parseMembershipRows(rows)).toThrow(TenancyError);
  });
});

describe('parsePermissionRows', () => {
  it('devolve as permissões ordenadas', () => {
    expect(parsePermissionRows([{ permission: 'b.read' }, { permission: 'a.read' }])).toEqual([
      'a.read',
      'b.read',
    ]);
  });

  it('recusa formato inesperado', () => {
    expect(() => parsePermissionRows([{ permission: '' }])).toThrow(TenancyError);
  });
});

function fakeClient(result: { data: unknown; error: unknown }) {
  const eq = vi.fn(() => Promise.resolve(result));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from, select, eq };
}

describe('createSupabaseTenancyApi', () => {
  it('lista as memberships do próprio usuário com a empresa embutida', async () => {
    const fake = fakeClient({ data: [row('1', 'Studio')], error: null });
    const result = await createSupabaseTenancyApi(fake.client).listMyMemberships('user-1');
    expect(fake.from).toHaveBeenCalledWith('memberships');
    expect(fake.select).toHaveBeenCalledWith('id, role, tenant:tenants(id, name, slug)');
    expect(fake.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result).toHaveLength(1);
  });

  it('lê a matriz do papel em roles_permissions', async () => {
    const fake = fakeClient({ data: [{ permission: 'members.manage' }], error: null });
    await expect(
      createSupabaseTenancyApi(fake.client).listRolePermissions('admin'),
    ).resolves.toEqual(['members.manage']);
    expect(fake.from).toHaveBeenCalledWith('roles_permissions');
    expect(fake.eq).toHaveBeenCalledWith('role', 'admin');
  });

  it('erro do PostgREST vira TenancyError sem detalhes do servidor', async () => {
    const fake = fakeClient({ data: null, error: { code: '42501', message: 'detalhe interno' } });
    const promise = createSupabaseTenancyApi(fake.client).listMyMemberships('user-1');
    await expect(promise).rejects.toThrow(TenancyError);
    await expect(promise).rejects.not.toThrow('detalhe interno');
  });
});
