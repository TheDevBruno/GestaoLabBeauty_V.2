import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import type { ApiErrorBody, ApiErrorCode } from '../src/shared/api-error';
import {
  type CreateInvitationResponse,
  createInvitationRequestSchema,
  invitationLink,
} from '../src/shared/invitation';
import type { InvitationStore } from './invitation-store';
import { generateInvitationToken, hashInvitationToken } from './token';

// API Hono servida em /api/* (ADR-002 §3). Na Sprint 1.3 só cria convites: o aceite é a função
// public.accept_invitation e listar/revogar são direto sob RLS.

export interface AppDeps {
  store: InvitationStore;
  generateToken?: () => string;
}

const MAX_BODY_BYTES = 16 * 1024;

function apiError(
  c: Context,
  status: ContentfulStatusCode,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, string>,
) {
  const body: ApiErrorBody = details ? { code, message, details } : { code, message };
  return c.json(body, status);
}

// Primeira mensagem de cada campo de nível superior, como o formulário mostra.
function fieldDetails(error: z.ZodError): Record<string, string> {
  const details: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && details[key] === undefined) details[key] = issue.message;
  }
  return details;
}

function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match?.[1] ?? null;
}

export function createApp({ store, generateToken = generateInvitationToken }: AppDeps) {
  const app = new Hono().basePath('/api');

  app.use(
    '*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => apiError(c, 413, 'payload_too_large', 'Requisição grande demais.'),
    }),
  );

  app.post('/invitations', async (c) => {
    const accessToken = bearerToken(c.req.header('Authorization'));
    const userId = accessToken ? await store.getUserId(accessToken) : null;
    if (!userId) return apiError(c, 401, 'unauthorized', 'Sessão inválida. Entre de novo.');

    const raw: unknown = await c.req.json().catch(() => undefined);
    const parsed = createInvitationRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(
        c,
        400,
        'invalid_request',
        'Confira os dados do convite.',
        fieldDetails(parsed.error),
      );
    }
    const { tenantId, email, role } = parsed.data;

    const token = generateToken();
    const invitation = {
      tenantId,
      email,
      role,
      tokenHash: hashInvitationToken(token),
      invitedBy: userId,
    };

    let result = await store.insert(invitation);
    // O índice de pendente único conta o convite expirado (migration de invitations): ele é revogado e a criação
    // é tentada uma vez mais. Chegar ao 23505 já prova que o trigger aceitou quem convida, então a
    // revogação não roda para quem não gerencia a empresa.
    if (!result.ok && result.reason === 'pending') {
      const revoked = await store.revokeExpiredPending(tenantId, email);
      if (revoked > 0) result = await store.insert(invitation);
    }

    if (!result.ok) {
      switch (result.reason) {
        case 'forbidden':
          return apiError(
            c,
            403,
            'forbidden',
            'Você não pode convidar para esta empresa ou papel.',
          );
        case 'member':
          return apiError(c, 409, 'already_member', 'Esta pessoa já é membro desta empresa.');
        case 'pending':
          return apiError(
            c,
            409,
            'invitation_pending',
            'Já existe um convite pendente para este e-mail.',
          );
      }
    }

    const body: CreateInvitationResponse = {
      id: result.id,
      link: invitationLink(token),
      expiresAt: result.expiresAt,
    };
    // A resposta leva o token: nada de cache intermediário.
    c.header('Cache-Control', 'no-store');
    return c.json(body, 201);
  });

  app.notFound((c) => apiError(c, 404, 'not_found', 'Rota não encontrada.'));

  app.onError((error, c) => {
    // O detalhe fica só no log do servidor; o cliente recebe a mensagem genérica (ADR-002 §5).
    console.error('[api] erro interno:', error.name, error.message);
    return apiError(c, 500, 'internal', 'Erro interno. Tente de novo em instantes.');
  });

  return app;
}
