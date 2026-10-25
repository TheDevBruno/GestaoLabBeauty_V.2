import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  createSupabaseServicesApi,
  isServiceId,
  parseServiceRows,
  saveErrorResult,
  ServiceError,
} from './services-api';

const TENANT = '00000000-0000-4000-8000-00000000000a';
const SERVICE_ID = '5eed0000-0000-0000-0006-000000000001';

const ROW = {
  id: SERVICE_ID,
  name: 'Corte Teste',
  description: null,
  duration_minutes: 60,
  buffer_minutes: 15,
  price_cents: 12000,
  currency: 'BRL',
  is_active: true,
};

const INPUT = {
  name: 'Corte Teste',
  description: null,
  durationMinutes: 60,
  bufferMinutes: 15,
  price: 12000,
  isActive: true,
};

interface QueryResult {
  data: unknown;
  error: unknown;
}

// Cliente Supabase falso: registra a cadeia do query builder e devolve `result` no await.
function fakeClient(result: QueryResult) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'insert', 'update', 'eq', 'order']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: QueryResult) => unknown) => resolve(result);
  const client = {
    from: (table: string) => {
      calls.push(['from', [table]]);
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('parseServiceRows', () => {
  it('converte as colunas do banco', () => {
    expect(parseServiceRows([ROW])).toEqual([
      {
        id: SERVICE_ID,
        name: 'Corte Teste',
        description: null,
        durationMinutes: 60,
        bufferMinutes: 15,
        priceCents: 12000,
        currency: 'BRL',
        isActive: true,
      },
    ]);
  });

  it('linha fora do formato vira ServiceError', () => {
    expect(() => parseServiceRows([{ ...ROW, price_cents: '120' }])).toThrow(ServiceError);
  });
});

describe('isServiceId', () => {
  it('aceita uuid (inclusive os ids do seed) e recusa texto livre', () => {
    expect(isServiceId(SERVICE_ID)).toBe(true);
    expect(isServiceId('novo')).toBe(false);
    expect(isServiceId(`${SERVICE_ID}x`)).toBe(false);
  });
});

describe('saveErrorResult', () => {
  it('nome repetido (23505) vira erro no campo de nome', () => {
    expect(saveErrorResult({ code: '23505' })).toEqual({
      ok: false,
      message: 'Confira os dados do serviço.',
      fieldErrors: { name: 'Já existe um serviço com este nome nesta empresa.' },
    });
  });

  it('RLS (42501) explica a falta de permissão; o resto não repassa o texto do banco', () => {
    expect(saveErrorResult({ code: '42501', message: 'new row violates…' })).toEqual({
      ok: false,
      message: 'Você não tem permissão para alterar serviços nesta empresa.',
    });
    expect(saveErrorResult({ code: '23514' })).toEqual({
      ok: false,
      message: 'Confira os dados do serviço.',
    });
    expect(saveErrorResult(new Error('rede'))).toEqual({
      ok: false,
      message: 'Não foi possível salvar o serviço. Tente de novo em instantes.',
    });
  });
});

describe('createSupabaseServicesApi', () => {
  it('lista os serviços da empresa ordenados por nome', async () => {
    const { client, calls } = fakeClient({ data: [ROW], error: null });
    const services = await createSupabaseServicesApi(client).list(TENANT);
    expect(services).toHaveLength(1);
    expect(calls).toContainEqual(['from', ['services']]);
    expect(calls).toContainEqual(['eq', ['tenant_id', TENANT]]);
    expect(calls).toContainEqual(['order', ['name', { ascending: true }]]);
  });

  it('erro na lista vira ServiceError', async () => {
    const { client } = fakeClient({ data: null, error: { code: '42501' } });
    await expect(createSupabaseServicesApi(client).list(TENANT)).rejects.toThrow(ServiceError);
  });

  it('get com id que não é uuid não consulta o banco', async () => {
    const { client, calls } = fakeClient({ data: [ROW], error: null });
    expect(await createSupabaseServicesApi(client).get(TENANT, 'abc')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('get sem linha visível devolve null', async () => {
    const { client } = fakeClient({ data: [], error: null });
    expect(await createSupabaseServicesApi(client).get(TENANT, SERVICE_ID)).toBeNull();
  });

  it('create grava em centavos com tenant_id e sem moeda (padrão BRL do banco)', async () => {
    const { client, calls } = fakeClient({ data: [ROW], error: null });
    const result = await createSupabaseServicesApi(client).create(TENANT, INPUT);
    expect(result.ok).toBe(true);
    expect(calls).toContainEqual([
      'insert',
      [
        {
          tenant_id: TENANT,
          name: 'Corte Teste',
          description: null,
          duration_minutes: 60,
          buffer_minutes: 15,
          price_cents: 12000,
          is_active: true,
        },
      ],
    ]);
  });

  it('update sem linha devolvida (RLS ou removido) não finge sucesso', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    const result = await createSupabaseServicesApi(client).update(TENANT, SERVICE_ID, INPUT);
    expect(result.ok).toBe(false);
    expect(calls).toContainEqual(['eq', ['id', SERVICE_ID]]);
    expect(calls).toContainEqual(['eq', ['tenant_id', TENANT]]);
  });

  it('update com nome repetido devolve o erro do campo', async () => {
    const { client } = fakeClient({ data: null, error: { code: '23505' } });
    const result = await createSupabaseServicesApi(client).update(TENANT, SERVICE_ID, INPUT);
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.fieldErrors?.name).toBe(
      'Já existe um serviço com este nome nesta empresa.',
    );
  });
});
