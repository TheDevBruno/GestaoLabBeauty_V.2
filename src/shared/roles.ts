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

// Nome do papel na interface (pt-BR).
export const memberRoleLabels: Record<MemberRole, string> = {
  owner: 'Proprietário(a)',
  admin: 'Administrador(a)',
  manager: 'Gerente',
  specialist: 'Especialista',
  receptionist: 'Recepção',
  financial: 'Financeiro',
};
