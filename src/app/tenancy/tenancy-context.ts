import { createContext, useContext } from 'react';
import type { TenancyApi, TenantMembership } from '@/lib/tenancy-api';

export const TenancyApiContext = createContext<TenancyApi | null>(null);

export function useTenancyApi(): TenancyApi {
  const api = useContext(TenancyApiContext);
  if (!api) throw new Error('useTenancyApi precisa estar dentro de <TenancyApiContext>.');
  return api;
}

export type ActiveTenantState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'none' }
  | { status: 'choose'; memberships: TenantMembership[] }
  | { status: 'active'; membership: TenantMembership; memberships: TenantMembership[] };

export interface ActiveTenantValue {
  state: ActiveTenantState;
  select: (tenantId: string) => void;
  // Volta ao seletor, para trocar de empresa.
  change: () => void;
}

export const ActiveTenantContext = createContext<ActiveTenantValue | null>(null);

export function useActiveTenant(): ActiveTenantValue {
  const value = useContext(ActiveTenantContext);
  if (!value) throw new Error('useActiveTenant precisa estar dentro de <ActiveTenantProvider>.');
  return value;
}
