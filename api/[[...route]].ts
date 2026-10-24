import { createAppFromEnv } from '../server/main';

// Vercel Function que atende /api/* (ADR-002 §3). A lógica fica em server/; aqui só a ligação, no
// formato Web padrão (Request → Response) que a Vercel aceita. Não usa hono/vercel, obsoleto no Hono 4.
const app = createAppFromEnv(process.env);
const handler = (request: Request) => app.fetch(request);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
export const OPTIONS = handler;
