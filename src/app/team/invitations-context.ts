import { createContext, useContext } from 'react';
import type { InvitationsApi } from '@/lib/invitations-api';

export const InvitationsApiContext = createContext<InvitationsApi | null>(null);

export function useInvitationsApi(): InvitationsApi {
  const api = useContext(InvitationsApiContext);
  if (!api) throw new Error('useInvitationsApi precisa estar dentro de <InvitationsApiContext>.');
  return api;
}
