import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  createSupabaseProfessionalsApi,
  deleteErrorResult,
  isProfessionalId,
  parseCandidateRows,
  parseProfessionalRows,
  ProfessionalError,
  saveErrorResult,
} from './professionals-api';

const TENANT = '00000000-0000-4000-8000-00000000000a';
const PRO_ID = '5eed0000-0000-0000-0003-000000000001';
const MEMBER = '5eed0000-0000-0000-0002-000000000004';
const S1 = '5eed0000-0000-0000-0006-000000000001';
const S2 = '5eed0000-0000-0000-0006-000000000002';
const S3 = '5eed0000-0000-0000-0006-000000000003';

const ROW = {
  id: PRO_ID,
  display_name: 'Profissional Teste',
  membership_id: MEMBER,
  is_active: true,
  professional_services: [{ service_id: S1 }, { service_id: S2 }],
};

const SAVED_ROW = {
  id: PRO_ID,
  display_name: 'Profissional Teste',
  membership_id: null,
  is_active: true,
};

interface QueryResult {
  data: unknown;
  error: unknown;
}

// Cliente Supabase falso: cada `from`/`rpc` consome o próximo resultado da fila e registra a cadeia.
function fakeClient(results: QueryResult[]) {
  const calls: [string, unknown[]][] = [];
  const queue = [...results];
  function builder() {
    const result = queue.shift() ?? { data: null, error: { code: 'fila-vazia' } };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order']) {
      chain[method] = (...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      };
    }
    chain.then = (resolve: (value: QueryResult) => unknown) => resolve(result);
    return chain;
  }
  const client = {
    from: (table: string) => {
      calls.push(['from', [table]]);
      return builder();
    },
    rpc: (name: string, args: unknown) => {
      calls.push(['rpc', [name, args]]);
      return builder();
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const INPUT = {
  displayName: 'Profissional Teste',
  membershipId: null,
  serviceIds: [S1, S2],
  isActive: true,
};

describe('parse', () => {
  it('converte profissionais com os serviços embutidos', () => {
    expect(parseProfessionalRows([ROW])).toEqual([
      {
        id: PRO_ID,
        displayName: 'Profissional Teste',
        membershipId: MEMBER,
        isActive: true,
        serviceIds: [S1, S2],
      },
    ]);
    expect(() => parseProfessionalRows([{ ...ROW, is_active: 'sim' }])).toThrow(ProfessionalError);
  });

  it('converte candidatos (nome pode faltar)', () => {
    expect(
      parseCandidateRows([
        { membership_id: MEMBER, full_name: null, role: 'specialist', professional_id: PRO_ID },
      ]),
    ).toEqual([
      { membershipId: MEMBER, fullName: null, role: 'specialist', professionalId: PRO_ID },
    ]);
    expect(() => parseCandidateRows([{ membership_id: MEMBER, role: 'chefe' }])).toThrow(
      ProfessionalError,
    );
  });

  it('isProfessionalId aceita uuid (ids do seed inclusive) e recusa texto livre', () => {
    expect(isProfessionalId(PRO_ID)).toBe(true);
    expect(isProfessionalId('novo')).toBe(false);
  });
});

describe('mensagens de erro', () => {
  it('membro já ligado (23505) vai para o campo do membro', () => {
    expect(saveErrorResult({ code: '23505' })).toEqual({
      ok: false,
      message: 'Confira os dados do profissional.',
      fieldErrors: { membershipId: 'Este membro já está ligado a outro profissional.' },
    });
  });

  it('excluir com agendamento (23503) sugere desativar; o resto não repassa o banco', () => {
    const refused = deleteErrorResult({ code: '23503' });
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.message).toMatch(/Desmarque “Profissional ativo”/);
    expect(deleteErrorResult({ code: 'XX000', message: 'detalhe interno' })).toEqual({
      ok: false,
      message: 'Não foi possível excluir o profissional. Tente de novo em instantes.',
    });
  });
});

describe('createSupabaseProfessionalsApi', () => {
  it('lista com o embed de professional_services, filtrando pela empresa', async () => {
    const { client, calls } = fakeClient([{ data: [ROW], error: null }]);
    expect(await createSupabaseProfessionalsApi(client).list(TENANT)).toHaveLength(1);
    expect(calls).toContainEqual([
      'select',
      ['id, display_name, membership_id, is_active, professional_services(service_id)'],
    ]);
    expect(calls).toContainEqual(['eq', ['tenant_id', TENANT]]);
  });

  it('candidatos pela função do banco', async () => {
    const { client, calls } = fakeClient([{ data: [], error: null }]);
    await createSupabaseProfessionalsApi(client).listCandidates(TENANT);
    expect(calls).toContainEqual([
      'rpc',
      ['list_professional_link_candidates', { p_tenant_id: TENANT }],
    ]);
  });

  it('create grava o profissional e depois os vínculos', async () => {
    const { client, calls } = fakeClient([
      { data: [SAVED_ROW], error: null },
      { data: null, error: null },
    ]);
    const result = await createSupabaseProfessionalsApi(client).create(TENANT, INPUT);
    expect(result).toMatchObject({ ok: true, linksSaved: true });
    expect(calls).toContainEqual([
      'insert',
      [
        {
          tenant_id: TENANT,
          display_name: 'Profissional Teste',
          membership_id: null,
          is_active: true,
        },
      ],
    ]);
    expect(calls).toContainEqual([
      'insert',
      [
        [
          { tenant_id: TENANT, professional_id: PRO_ID, service_id: S1 },
          { tenant_id: TENANT, professional_id: PRO_ID, service_id: S2 },
        ],
      ],
    ]);
  });

  it('create com falha nos vínculos mantém o profissional e avisa', async () => {
    const { client } = fakeClient([
      { data: [SAVED_ROW], error: null },
      { data: null, error: { code: '42501' } },
    ]);
    const result = await createSupabaseProfessionalsApi(client).create(TENANT, INPUT);
    expect(result).toMatchObject({ ok: true, linksSaved: false });
  });

  it('create com membro já ligado não grava vínculos', async () => {
    const { client, calls } = fakeClient([{ data: null, error: { code: '23505' } }]);
    const result = await createSupabaseProfessionalsApi(client).create(TENANT, INPUT);
    expect(result.ok).toBe(false);
    expect(calls.filter(([method]) => method === 'from')).toHaveLength(1);
  });

  it('update acerta só a diferença: apaga os desmarcados e insere os novos', async () => {
    const { client, calls } = fakeClient([
      { data: [SAVED_ROW], error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);
    const current = {
      id: PRO_ID,
      displayName: 'Profissional Teste',
      membershipId: null,
      isActive: true,
      serviceIds: [S1, S2],
    };
    const result = await createSupabaseProfessionalsApi(client).update(TENANT, current, {
      ...INPUT,
      serviceIds: [S2, S3],
    });
    expect(result).toMatchObject({ ok: true, linksSaved: true });
    expect(calls).toContainEqual(['in', ['service_id', [S1]]]);
    expect(calls).toContainEqual([
      'insert',
      [[{ tenant_id: TENANT, professional_id: PRO_ID, service_id: S3 }]],
    ]);
  });

  it('update sem mudança de serviços não toca nos vínculos', async () => {
    const { client, calls } = fakeClient([{ data: [SAVED_ROW], error: null }]);
    const current = { ...INPUT, id: PRO_ID };
    await createSupabaseProfessionalsApi(client).update(TENANT, current, INPUT);
    expect(calls.filter(([method]) => method === 'from')).toHaveLength(1);
  });

  it('update sem linha devolvida (RLS ou removido) não finge sucesso', async () => {
    const { client } = fakeClient([{ data: [], error: null }]);
    const result = await createSupabaseProfessionalsApi(client).update(
      TENANT,
      { ...INPUT, id: PRO_ID },
      INPUT,
    );
    expect(result.ok).toBe(false);
  });

  it('remove: recusa do banco vira a mensagem de desativar; sem linha = não excluído', async () => {
    const refused = fakeClient([{ data: null, error: { code: '23503' } }]);
    expect((await createSupabaseProfessionalsApi(refused.client).remove(TENANT, PRO_ID)).ok).toBe(
      false,
    );
    const none = fakeClient([{ data: [], error: null }]);
    expect((await createSupabaseProfessionalsApi(none.client).remove(TENANT, PRO_ID)).ok).toBe(
      false,
    );
    const done = fakeClient([{ data: [{ id: PRO_ID }], error: null }]);
    expect(await createSupabaseProfessionalsApi(done.client).remove(TENANT, PRO_ID)).toEqual({
      ok: true,
    });
  });
});
