import type { z } from 'zod';

export type FieldErrors = Partial<Record<string, string>>;

// Primeira mensagem de cada campo de nível superior, para mostrar junto ao campo (erro perto do campo).
export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && errors[key] === undefined) {
      errors[key] = issue.message;
    }
  }
  return errors;
}

// Primeiro campo com erro na ordem do formulário, para receber o foco depois de um envio inválido.
export function firstInvalidField(order: readonly string[], errors: FieldErrors): string | null {
  return order.find((name) => errors[name] !== undefined) ?? null;
}
