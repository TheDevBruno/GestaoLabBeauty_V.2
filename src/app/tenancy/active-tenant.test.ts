// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { TenantMembership } from '@/lib/tenancy-api';
import { createPreferenceStore, resolveActiveTenant } from './active-tenant';
import { MEMBERSHIPS_REFETCH_MS, membershipsQuery } from './queries';

const m = (id: string): TenantMembership => ({
  membershipId: `m-${id}`,
  tenantId: `t-${id}`,
  tenantName: id,
  tenantSlug: id,
  role: 'owner',
});

describe('resolveActiveTenant (RN-025)', () => {
  it('sem membership: nenhuma empresa', () => {
    expect(resolveActiveTenant([], 't-1')).toEqual({ status: 'none' });
  });

  it('uma membership: ela é a ativa, mesmo com preferência de outra empresa', () => {
    expect(resolveActiveTenant([m('1')], 't-9')).toEqual({ status: 'active', membership: m('1') });
  });

  it('várias: usa a preferência se ainda for uma membership', () => {
    expect(resolveActiveTenant([m('1'), m('2')], 't-2')).toEqual({
      status: 'active',
      membership: m('2'),
    });
  });

  it('várias e preferência ausente ou revogada: pede a escolha', () => {
    expect(resolveActiveTenant([m('1'), m('2')], null)).toEqual({ status: 'choose' });
    expect(resolveActiveTenant([m('1'), m('2')], 't-9')).toEqual({ status: 'choose' });
  });
});

describe('createPreferenceStore', () => {
  it('guarda uma preferência por usuário', () => {
    const storage = window.localStorage;
    const ana = createPreferenceStore(storage, 'ana');
    const bia = createPreferenceStore(storage, 'bia');
    ana.set('t-1');
    expect(ana.get()).toBe('t-1');
    expect(bia.get()).toBeNull();
    ana.clear();
    expect(ana.get()).toBeNull();
  });

  it('sem storage ou com storage que lança, não quebra', () => {
    const throwing = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    } as unknown as Storage;
    for (const storage of [undefined, throwing]) {
      const store = createPreferenceStore(storage, 'ana');
      expect(() => {
        store.set('t-1');
        store.clear();
      }).not.toThrow();
      expect(store.get()).toBeNull();
    }
  });
});

describe('membershipsQuery (RN-024)', () => {
  it('nunca considera a lista atual e busca de novo ao focar, reconectar e a cada minuto', () => {
    const options = membershipsQuery(
      {
        listMyMemberships: () => Promise.resolve([]),
        listRolePermissions: () => Promise.resolve([]),
      },
      'ana',
    );
    expect(options.queryKey).toEqual(['memberships', 'ana']);
    expect(options.staleTime).toBe(0);
    expect(options.refetchOnWindowFocus).toBe(true);
    expect(options.refetchOnReconnect).toBe(true);
    expect(options.refetchInterval).toBe(MEMBERSHIPS_REFETCH_MS);
  });
});
