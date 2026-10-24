import { invitationTokenSchema } from '@/shared/invitation';

// O link do convite é /convite#<token>. O fragmento não vai para o servidor (logs, Referer). Ao abrir a
// página, o token sai da URL e fica na sessionStorage, para sobreviver ao login ou cadastro no meio
// do caminho sem aparecer em ?next= (decisão do usuário em 2026-10-23).

const STORAGE_KEY = 'labbeautypro.convite';

export function tokenFromHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  return invitationTokenSchema.safeParse(raw).success ? raw : null;
}

export interface TokenStore {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

// Storage pode faltar ou lançar (aba privada, bloqueio de site): nesse caso o convite só vale enquanto
// a página estiver aberta.
export function createTokenStore(storage: Storage | undefined): TokenStore {
  return {
    get() {
      try {
        const value = storage?.getItem(STORAGE_KEY) ?? null;
        return value !== null && invitationTokenSchema.safeParse(value).success ? value : null;
      } catch {
        return null;
      }
    },
    set(token) {
      try {
        storage?.setItem(STORAGE_KEY, token);
      } catch {
        // sem armazenamento: segue só com o token em memória
      }
    },
    clear() {
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch {
        // nada a limpar
      }
    },
  };
}
