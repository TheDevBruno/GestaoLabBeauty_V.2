// Papéis de membro de uma empresa (RN-020). Precisa ficar igual ao enum public.member_role do banco.
export const memberRoles = [
  'owner',
  'admin',
  'manager',
  'specialist',
  'receptionist',
  'financial',
] as const;

export type MemberRole = (typeof memberRoles)[number];
