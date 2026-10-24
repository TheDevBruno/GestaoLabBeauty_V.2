export const DEFAULT_AFTER_LOGIN = '/app';

const BASE = 'http://labbeautypro.invalid';

// Destino depois do login, vindo de ?next=. Só caminhos internos: "//outro.site", "/\outro.site",
// "https://..." e afins caem no padrão, para o parâmetro não virar open redirect.
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw?.startsWith('/')) return DEFAULT_AFTER_LOGIN;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (url.origin !== BASE) return DEFAULT_AFTER_LOGIN;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function loginPath(next?: string): string {
  return next ? `/entrar?next=${encodeURIComponent(next)}` : '/entrar';
}

export function signupPath(next?: string): string {
  return next ? `/cadastro?next=${encodeURIComponent(next)}` : '/cadastro';
}
