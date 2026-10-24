import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { createPreferenceStore, resolveActiveTenant } from './active-tenant';
import { membershipsQuery } from './queries';
import { ActiveTenantContext, type ActiveTenantState, useTenancyApi } from './tenancy-context';

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function ActiveTenantProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const api = useTenancyApi();
  const location = useLocation();
  const [store] = useState(() => createPreferenceStore(browserStorage(), userId));
  const [preferredId, setPreferredId] = useState<string | null>(() => store.get());
  const query = useQuery(membershipsQuery(api, userId));
  const { refetch } = query;

  // RN-024: cada navegação confere de novo as memberships (a primeira carga já vem do useQuery).
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    void refetch();
  }, [location.pathname, refetch]);

  const resolution = query.data ? resolveActiveTenant(query.data, preferredId) : null;
  const activeId = resolution?.status === 'active' ? resolution.membership.tenantId : null;

  // A empresa em uso vira a "última usada", inclusive quando era a única: assim, ganhar uma segunda
  // empresa não derruba a pessoa no seletor no meio do trabalho. Ajuste de estado durante a
  // renderização (padrão do React para estado derivado), sem efeito intermediário.
  if (activeId !== null && activeId !== preferredId) {
    setPreferredId(activeId);
  }

  // Storage segue o estado. Preferência que não corresponde mais a uma membership (revogada) sai da
  // storage; na tela ela já é ignorada por resolveActiveTenant.
  const memberships = query.data;
  useEffect(() => {
    if (activeId) {
      store.set(activeId);
    } else if (memberships && preferredId && !memberships.some((m) => m.tenantId === preferredId)) {
      store.clear();
    }
  }, [activeId, memberships, preferredId, store]);

  const state: ActiveTenantState = useMemo(() => {
    if (!memberships || !resolution) {
      return query.isError
        ? {
            status: 'error',
            retry: () => {
              void refetch();
            },
          }
        : { status: 'loading' };
    }
    if (resolution.status === 'none') return { status: 'none' };
    if (resolution.status === 'choose') return { status: 'choose', memberships };
    return { status: 'active', membership: resolution.membership, memberships };
  }, [memberships, resolution, query.isError, refetch]);

  const value = useMemo(
    () => ({
      state,
      select: (tenantId: string) => {
        store.set(tenantId);
        setPreferredId(tenantId);
      },
      change: () => {
        store.clear();
        setPreferredId(null);
      },
    }),
    [state, store],
  );

  return <ActiveTenantContext value={value}>{children}</ActiveTenantContext>;
}
