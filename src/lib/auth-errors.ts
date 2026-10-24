// Mensagens em pt-BR para erros do Auth e da RPC de convite. Nunca repassam a mensagem crua do servidor
// (ADR-002 §5) e não confirmam se uma conta existe além do que o próprio fluxo já revela.

export interface ErrorLike {
  code?: string | undefined;
  status?: number | undefined;
  name?: string | undefined;
}

const GENERIC = 'Não foi possível concluir agora. Tente de novo em instantes.';
const NETWORK = 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
const RATE_LIMIT = 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.';

function isNetworkError(error: ErrorLike): boolean {
  return error.name === 'AuthRetryableFetchError' || error.status === 0;
}

export function loginErrorMessage(error: ErrorLike): string {
  if (isNetworkError(error)) return NETWORK;
  switch (error.code) {
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos.';
    case 'email_not_confirmed':
      return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
    case 'over_request_rate_limit':
      return RATE_LIMIT;
    default:
      return GENERIC;
  }
}

export function signupErrorMessage(error: ErrorLike): string {
  if (isNetworkError(error)) return NETWORK;
  switch (error.code) {
    case 'user_already_exists':
    case 'email_exists':
      return 'Não foi possível criar a conta com este e-mail. Se você já tem conta, entre.';
    case 'weak_password':
      return 'Escolha uma senha mais forte.';
    case 'email_address_invalid':
      return 'Informe um e-mail válido.';
    case 'signup_disabled':
      return 'O cadastro está temporariamente fechado.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return RATE_LIMIT;
    default:
      return GENERIC;
  }
}

export type InvitationFailure = 'invalid' | 'already-member' | 'unauthenticated' | 'unknown';

// Códigos SQLSTATE levantados por public.accept_invitation (migration 20261023121000).
export function invitationFailure(error: ErrorLike): InvitationFailure {
  switch (error.code) {
    case '23514':
      return 'invalid';
    case '23505':
      return 'already-member';
    case '42501':
      return 'unauthenticated';
    default:
      return 'unknown';
  }
}

export function invitationErrorMessage(failure: InvitationFailure): string {
  switch (failure) {
    case 'invalid':
      return 'Este convite é inválido, expirou, foi revogado ou foi enviado para outro e-mail.';
    case 'already-member':
      return 'Você já faz parte desta empresa.';
    case 'unauthenticated':
      return 'Entre na sua conta para aceitar o convite.';
    case 'unknown':
      return GENERIC;
  }
}
