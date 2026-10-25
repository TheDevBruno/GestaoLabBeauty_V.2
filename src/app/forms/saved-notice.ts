// Aviso de "salvo" que uma página de formulário deixa para a lista mostrar, pelo estado da navegação:
// navigate('/app/…', { state: { notice } satisfies SavedNoticeState }).
export interface SavedNoticeState {
  notice: string;
}

export function readSavedNotice(state: unknown): string | null {
  if (typeof state === 'object' && state !== null && 'notice' in state) {
    return typeof state.notice === 'string' ? state.notice : null;
  }
  return null;
}
