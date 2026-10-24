// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createFakeAuthApi,
  createFakeTenancyApi,
  membership,
  renderAt,
  SIGNED_IN,
} from '@/app/testing/render-app';

const PREF_KEY = `labbeautypro.empresa-ativa.${SIGNED_IN.userId}`;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('Guarda de sessão (/app/*)', () => {
  it('rota privada sem sessão volta para ela depois do login', async () => {
    const { api } = createFakeAuthApi();
    const { router } = renderAt('/app/equipe', api);
    await waitFor(() => {
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(
        '/entrar?next=%2Fapp%2Fequipe',
      );
    });
  });
});

describe('Empresa ativa (RN-025)', () => {
  it('sem membership: explica como entrar numa empresa e oferece sair', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    renderAt('/app', api, createFakeTenancyApi([]).api);
    expect(await screen.findByRole('heading', { name: 'Nenhuma empresa' })).toBeTruthy();
    expect(screen.getByText(/Peça a quem administra a empresa um convite/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeTruthy();
  });

  it('uma membership: entra direto, mostra papel por extenso e não oferece troca', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    renderAt('/app', api, createFakeTenancyApi([membership('A', 'owner')]).api);
    expect(await screen.findByRole('heading', { name: 'Studio Ana' })).toBeTruthy();
    expect(screen.getByText('Proprietário(a)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Trocar de empresa' })).toBeNull();
  });

  it('várias sem preferência: mostra só as empresas do usuário e guarda a escolha', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    const { user } = renderAt(
      '/app',
      api,
      createFakeTenancyApi([membership('A', 'owner'), membership('B', 'receptionist')]).api,
    );

    const list = await screen.findByRole('list', { name: 'Suas empresas' });
    const options = within(list).getAllByRole('button');
    expect(options.map((b) => b.textContent)).toEqual([
      'Studio AnaProprietário(a)',
      'Clínica BelaRecepção',
    ]);

    await user.click(within(list).getByRole('button', { name: /Clínica Bela/ }));
    expect(await screen.findByRole('heading', { name: 'Clínica Bela' })).toBeTruthy();
    expect(window.localStorage.getItem(PREF_KEY)).toBe('tenant-B');

    await user.click(screen.getByRole('button', { name: 'Trocar de empresa' }));
    expect(await screen.findByRole('heading', { name: 'Escolha a empresa' })).toBeTruthy();
    expect(window.localStorage.getItem(PREF_KEY)).toBeNull();
  });

  it('várias com preferência válida: abre a última usada', async () => {
    window.localStorage.setItem(PREF_KEY, 'tenant-B');
    const { api } = createFakeAuthApi(SIGNED_IN);
    renderAt('/app', api, createFakeTenancyApi([membership('A'), membership('B')]).api);
    expect(await screen.findByRole('heading', { name: 'Clínica Bela' })).toBeTruthy();
  });

  it('preferência que não é membership do usuário é ignorada e apagada', async () => {
    window.localStorage.setItem(PREF_KEY, 'tenant-de-outro');
    const { api } = createFakeAuthApi(SIGNED_IN);
    renderAt('/app', api, createFakeTenancyApi([membership('A'), membership('B')]).api);
    expect(await screen.findByRole('heading', { name: 'Escolha a empresa' })).toBeTruthy();
    await waitFor(() => {
      expect(window.localStorage.getItem(PREF_KEY)).toBeNull();
    });
  });

  it('erro ao carregar: alerta e tentar de novo', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    const tenancy = createFakeTenancyApi([membership('A')]);
    tenancy.api.listMyMemberships.mockRejectedValueOnce(new Error('rede'));
    const { user } = renderAt('/app', api, tenancy.api);

    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível carregar');
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Studio Ana' })).toBeTruthy();
  });
});

describe('Empresa única que vira várias', () => {
  it('quem tinha uma empresa continua nela ao ganhar a segunda', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    const tenancy = createFakeTenancyApi([membership('B', 'owner')]);
    const { router } = renderAt('/app', api, tenancy.api);
    expect(await screen.findByRole('heading', { name: 'Clínica Bela' })).toBeTruthy();
    await waitFor(() => {
      expect(window.localStorage.getItem(PREF_KEY)).toBe('tenant-B');
    });

    tenancy.setMemberships([membership('A', 'owner'), membership('B', 'owner')]);
    await act(() => router.navigate('/app/equipe'));
    expect(await screen.findByRole('heading', { name: 'Equipe e convites' })).toBeTruthy();
    expect(screen.getByText('Clínica Bela')).toBeTruthy();
  });
});

describe('Permissão (plano §8)', () => {
  it.each(['owner', 'admin'] as const)('%s vê o link e abre Equipe', async (role) => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    const { user } = renderAt('/app', api, createFakeTenancyApi([membership('A', role)]).api);
    await user.click(await screen.findByRole('link', { name: 'Equipe e convites' }));
    expect(await screen.findByRole('heading', { name: 'Equipe e convites' })).toBeTruthy();
  });

  it.each(['manager', 'specialist', 'receptionist', 'financial'] as const)(
    '%s não vê o link e recebe "acesso não permitido" na URL direta',
    async (role) => {
      const { api } = createFakeAuthApi(SIGNED_IN);
      const tenancy = createFakeTenancyApi([membership('A', role)]);
      renderAt('/app', api, tenancy.api);
      expect(await screen.findByRole('heading', { name: 'Studio Ana' })).toBeTruthy();
      await waitFor(() => {
        expect(tenancy.api.listRolePermissions).toHaveBeenCalled();
      });
      expect(screen.queryByRole('link', { name: 'Equipe e convites' })).toBeNull();

      cleanup();
      renderAt('/app/equipe', api, tenancy.api);
      expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeTruthy();
    },
  );
});

describe('Revogação (RN-024)', () => {
  it('papel rebaixado: a próxima navegação já nega a página', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    const tenancy = createFakeTenancyApi([membership('A', 'admin')]);
    const { router } = renderAt('/app', api, tenancy.api);
    expect(await screen.findByRole('link', { name: 'Equipe e convites' })).toBeTruthy();

    tenancy.setMemberships([membership('A', 'receptionist')]);
    await act(() => router.navigate('/app/equipe'));
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeTruthy();
  });

  it('membership removida: a próxima navegação mostra "nenhuma empresa"', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    const tenancy = createFakeTenancyApi([membership('A', 'owner')]);
    const { router } = renderAt('/app', api, tenancy.api);
    expect(await screen.findByRole('heading', { name: 'Studio Ana' })).toBeTruthy();

    tenancy.setMemberships([]);
    await act(() => router.navigate('/app/equipe'));
    expect(await screen.findByRole('heading', { name: 'Nenhuma empresa' })).toBeTruthy();
  });

  it('sair apaga o cache de empresas e permissões', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    const { user, queryClient } = renderAt('/app', api);
    expect(await screen.findByRole('heading', { name: 'Studio Ana' })).toBeTruthy();
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => {
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    });
  });
});
