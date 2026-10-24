// Lista de convites pendentes da empresa; criar e revogar invalidam esta chave.
export function invitationsQueryKey(tenantId: string) {
  return ['invitations', tenantId] as const;
}
