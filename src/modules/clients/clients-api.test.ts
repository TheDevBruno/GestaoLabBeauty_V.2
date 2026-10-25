import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  CLIENTS_PAGE_SIZE,
  ClientError,
  createSupabaseClientsApi,
  isClientId,
  parseClientRows,
} from './clients-api';

const TENANT = '00000000-0000-4000-8000-00000000000a';
const CLIENT_ID = '5eed0000-0000-0000-0004-000000000001';

function row(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `5eed0000-0000-0000-0004-${String(index).padStart(12, '0')}`,
    full_name: `Cliente ${String(index)}`,
    phone: '+5511900000001',
    email: null,
    birth_date: '1990-03-15',
    is_active: true,
    ...overrides,
  };
}

interface QueryResult {
  data: unknown;
  error: unknown;
}

// Cliente Supabase falso: registra a cadeia (from/rpc e o query builder) e devolve `result` no await.
function fakeClient(result: QueryResult) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) {
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
    rpc: (fn: string, args: unknown) => {
      calls.push(['rpc', [fn, args]]);
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('parseClientRows', () => {
  it('converte as colunas do banco', () => {
    expect(parseClientRows([row(1)])).toEqual([
      {
        id: '5eed0000-0000-0000-0004-000000000001',
        fullName: 'Cliente 1',
        phone: '+5511900000001',
        email: null,
        birthDate: '1990-03-15',
        isActive: true,
      },
    ]);
  });

  it('recusa linha fora do formato', () => {
    expect(() => parseClientRows([{ id: 'x' }])).toThrow(ClientError);
    expect(() => parseClientRows(null)).toThrow(ClientError);
  });
});

describe('isClientId', () => {
  it('aceita só a forma de uuid', () => {
    expect(isClientId(CLIENT_ID)).toBe(true);
    expect(isClientId('novo')).toBe(false);
    expect(isClientId(`${CLIENT_ID}x`)).toBe(false);
  });
});

describe('createSupabaseClientsApi.search', () => {
  it('chama search_clients com uma linha a mais que a página', async () => {
    const { client, calls } = fakeClient({ data: [row(1)], error: null });
    const page = await createSupabaseClientsApi(client).search(TENANT, {
      query: 'joao',
      includeArchived: true,
      offset: 50,
    });
    expect(calls[0]).toEqual([
      'rpc',
      [
        'search_clients',
        {
          p_tenant_id: TENANT,
          p_query: 'joao',
          p_include_inactive: true,
          p_limit: CLIENTS_PAGE_SIZE + 1,
          p_offset: 50,
        },
      ],
    ]);
    expect(calls[1]).toEqual(['select', ['id, full_name, phone, email, birth_date, is_active']]);
    expect(page).toEqual({ clients: parseClientRows([row(1)]), hasMore: false });
  });

  it('termo vazio vai como null', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await createSupabaseClientsApi(client).search(TENANT, {
      query: '',
      includeArchived: false,
      offset: 0,
    });
    expect((calls[0]?.[1][1] as { p_query: unknown }).p_query).toBeNull();
  });

  it('corta a linha extra e marca que há mais', async () => {
    const rows = Array.from({ length: CLIENTS_PAGE_SIZE + 1 }, (_, index) => row(index + 1));
    const { client } = fakeClient({ data: rows, error: null });
    const page = await createSupabaseClientsApi(client).search(TENANT, {
      query: '',
      includeArchived: false,
      offset: 0,
    });
    expect(page.clients).toHaveLength(CLIENTS_PAGE_SIZE);
    expect(page.hasMore).toBe(true);
  });

  it('erro do banco vira ClientError sem o texto do banco', async () => {
    const { client } = fakeClient({ data: null, error: { code: '42501', message: 'segredo' } });
    await expect(
      createSupabaseClientsApi(client).search(TENANT, {
        query: '',
        includeArchived: false,
        offset: 0,
      }),
    ).rejects.toThrow('Não foi possível carregar os clientes.');
  });
});

describe('createSupabaseClientsApi.get', () => {
  it('filtra por empresa e id', async () => {
    const { client, calls } = fakeClient({ data: [row(1)], error: null });
    const found = await createSupabaseClientsApi(client).get(TENANT, CLIENT_ID);
    expect(found?.fullName).toBe('Cliente 1');
    expect(calls).toEqual([
      ['from', ['clients']],
      ['select', ['id, full_name, phone, email, birth_date, is_active']],
      ['eq', ['tenant_id', TENANT]],
      ['eq', ['id', CLIENT_ID]],
    ]);
  });

  it('id sem forma de uuid não vai ao banco', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    expect(await createSupabaseClientsApi(client).get(TENANT, 'novo')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('sem linha (outra empresa ou fora do recorte) devolve null', async () => {
    const { client } = fakeClient({ data: [], error: null });
    expect(await createSupabaseClientsApi(client).get(TENANT, CLIENT_ID)).toBeNull();
  });

  it('erro do banco vira ClientError', async () => {
    const { client } = fakeClient({ data: null, error: { code: '500' } });
    await expect(createSupabaseClientsApi(client).get(TENANT, CLIENT_ID)).rejects.toThrow(
      'Não foi possível carregar o cliente.',
    );
  });
});
