import { z } from 'zod';

// Formato único de erro da API (ADR-002 §5): { code, message, details? }, sem stack trace nem SQL.
export const apiErrorCodes = [
  'unauthorized',
  'forbidden',
  'not_found',
  'invalid_request',
  'payload_too_large',
  'invitation_pending',
  'already_member',
  'internal',
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const apiErrorSchema = z.object({
  code: z.enum(apiErrorCodes),
  message: z.string(),
  details: z.record(z.string(), z.string()).optional(),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
